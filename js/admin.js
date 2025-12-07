// js/admin.js
console.log("✅ admin.js loaded successfully");

import { db } from './firebase-config.js';
import { guardPage, logout } from './auth.js';
import { renderCards } from './cards.js';
import { exportMembersToCSV as utilsExportCSV, parseCSV as utilsParseCSV, cleanNumber } from './utils.js';
import { logAudit, subscribeAudit } from './audit.js';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/*
  Option C - Full upgraded admin.js
  - Supports powerType + lastUpdated
  - Auto-updating "Updated X ago"
  - Robust CSV export/import including these fields
  - Safe validation & cleaned structure
*/

const state = {
  members: [],
  filter: 'RESET',
  search: '',
  sort: 'none',
  currentAdminName: ''
};

const dom = {
  adminName: document.getElementById('adminNameLabel'),
  btnLogout: document.getElementById('btnLogout'),
  btnAdd: document.getElementById('btnAddMember'),
  btnExport: document.getElementById('btnExportCSV'),
  btnImport: document.getElementById('btnImportCSV'),
  csvInput: document.getElementById('csvFileInput'),
  searchInput: document.getElementById('searchInput'),
  filterButtons: Array.from(document.querySelectorAll('.filter-btn')),
  sortButtons: Array.from(document.querySelectorAll('.sort-btn')),
  grid: document.getElementById('cardsGrid'),
  statTotal: document.getElementById('statTotal'),
  statAvg: document.getElementById('statAvg'),
  statFive: document.getElementById('statFive'),
  auditList: document.getElementById('auditList'),
  // modal
  modal: document.getElementById('memberModal'),
  modalTitle: document.getElementById('modalTitle'),
  fieldName: document.getElementById('fieldName'),
  fieldRole: document.getElementById('fieldRole'),
  fieldSquad: document.getElementById('fieldSquad'),
  fieldPower: document.getElementById('fieldPower'),
  fieldPowerType: document.getElementById('fieldPowerType'), // NEW
  fieldStars: document.getElementById('fieldStars'),
  btnModalSave: document.getElementById('btnModalSave'),
  btnModalCancel: document.getElementById('btnModalCancel')
};

let editingDocId = null;

// ---------------------- Helpers ----------------------

// escape HTML (simple)
function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Human-friendly time-ago for Firestore Timestamp or ms
function timeAgoFromTimestamp(tsLike) {
  if (!tsLike) return 'never';
  // Accept either Firestore Timestamp or object { toMillis: fn } or number
  let ms;
  if (typeof tsLike === 'number') ms = tsLike;
  else if (tsLike && typeof tsLike.toMillis === 'function') ms = tsLike.toMillis();
  else if (tsLike instanceof Date) ms = tsLike.getTime();
  else return 'never';

  const now = Date.now();
  const seconds = Math.floor((now - ms) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    return m === 1 ? '1 min ago' : `${m} mins ago`;
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    return h === 1 ? '1 hr ago' : `${h} hrs ago`;
  }
  const d = Math.floor(seconds / 86400);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}

// update all elements with data-lastts attribute
function refreshAllTimestamps() {
  document.querySelectorAll('[data-lastts]').forEach(el => {
    const v = el.getAttribute('data-lastts');
    if (!v) {
      el.textContent = 'Updated never';
      return;
    }
    const ms = parseInt(v, 10);
    if (Number.isNaN(ms)) {
      el.textContent = 'Updated never';
      return;
    }
    el.textContent = 'Updated ' + timeAgoFromTimestamp(ms);
  });
}

// run refresh every minute
setInterval(refreshAllTimestamps, 60 * 1000);

// ---------------------- Member list / view helpers ----------------------

function filteredAndSortedMembers() {
  let arr = state.members.slice();

  // filter
  if (state.filter !== 'RESET') {
    const f = state.filter.toUpperCase();
    arr = arr.filter(m =>
      ((m.squad || '') + (m.role || '')).toUpperCase().includes(f)
    );
  }

  // search
  const q = (state.search || '').toLowerCase();
  if (q) {
    arr = arr.filter(m =>
      (m.name + ' ' + (m.role || '') + ' ' + (m.squad || '')).toLowerCase().includes(q)
    );
  }

  // sort
  if (state.sort === 'power-desc') {
    arr.sort((a, b) => (b.power || 0) - (a.power || 0));
  } else if (state.sort === 'power-asc') {
    arr.sort((a, b) => (a.power || 0) - (b.power || 0));
  } else if (state.sort === 'stars-desc') {
    arr.sort((a, b) => (b.stars || 0) - (a.stars || 0));
  } else if (state.sort === 'stars-asc') {
    arr.sort((a, b) => (a.stars || 0) - (b.stars || 0));
  }

  return arr;
}

function updateStats(viewMembers) {
  const total = viewMembers.length;
  let sum = 0;
  let five = 0;
  viewMembers.forEach(m => {
    if (m.power || m.power === 0) sum += Number(m.power) || 0;
    if (Number(m.stars) === 5) five++;
  });
  dom.statTotal.textContent = total;
  dom.statAvg.textContent = total ? (sum / total).toFixed(2) : '0.00';
  dom.statFive.textContent = five;
}

function render() {
  const view = filteredAndSortedMembers();
  renderCards(dom.grid, view, {
    showAdminActions: true,
    onEdit: openEditModalForMember,
    onDelete: deleteMember
  });
  updateStats(view);
  // ensure timestamps freshly displayed
  refreshAllTimestamps();
}

// ---------------------- Modal controls ----------------------

function openModal() {
  if (!dom.modal) return;
  dom.modal.classList.remove('hidden');
}

function closeModal() {
  if (!dom.modal) return;
  dom.modal.classList.add('hidden');
  editingDocId = null;
}

function openAddModal() {
  editingDocId = null;
  dom.modalTitle.textContent = 'Add Member';
  dom.fieldName.value = '';
  dom.fieldRole.value = '';
  dom.fieldSquad.value = '';
  dom.fieldPower.value = '';
  dom.fieldPowerType.value = 'Precise';
  dom.fieldStars.value = '3';
  openModal();
}

function openEditModalForMember(member) {
  editingDocId = member.id;
  dom.modalTitle.textContent = 'Edit Member';
  dom.fieldName.value = member.name || '';
  dom.fieldRole.value = member.role || '';
  dom.fieldSquad.value = member.squad || '';
  dom.fieldPower.value = (member.power !== undefined && member.power !== null) ? member.power : '';
  dom.fieldPowerType.value = member.powerType || 'Precise';
  dom.fieldStars.value = member.stars ?? 3;
  openModal();
}

// ---------------------- Save / Delete ----------------------

async function saveMemberFromModal() {
  const name = (dom.fieldName.value || '').trim();
  if (!name) {
    alert('Name is required.');
    return;
  }

  // Validate and sanitize inputs
  const rawPower = dom.fieldPower.value;
  const power = cleanNumber(rawPower); // your util
  const stars = Math.max(1, Math.min(5, parseInt(dom.fieldStars.value, 10) || 3));
  const powerType = (dom.fieldPowerType.value || 'Precise').trim();

  const payload = {
    name,
    role: (dom.fieldRole.value || '').trim(),
    squad: (dom.fieldSquad.value || '').trim(),
    power,
    stars,
    powerType,
    lastUpdated: serverTimestamp()
  };

  try {
    if (!editingDocId) {
      const ref = await addDoc(collection(db, 'members'), payload);
      await logAudit('ADD', payload.name, '', state.currentAdminName);
      editingDocId = ref.id;
    } else {
      await updateDoc(doc(db, 'members', editingDocId), payload);
      await logAudit('EDIT', payload.name, '', state.currentAdminName);
    }
  } catch (err) {
    console.error('Save error:', err);
    alert('Failed to save member. See console.');
  } finally {
    closeModal();
  }
}

async function deleteMember(member) {
  if (!member || !member.id) return;
  if (!confirm(`Delete ${member.name}?`)) return;
  try {
    await deleteDoc(doc(db, 'members', member.id));
    await logAudit('DELETE', member.name, '', state.currentAdminName);
  } catch (err) {
    console.error('Delete error:', err);
    alert('Failed to delete member.');
  }
}

// ---------------------- CSV Export / Import (upgraded) ----------------------

// Build CSV content from members including powerType + lastUpdatedISO
function buildCSVFromMembers(members) {
  // header
  const header = ['id', 'name', 'role', 'squad', 'power', 'stars', 'powerType', 'lastUpdatedISO'];
  const rows = [header];

  for (const m of members) {
    const id = m.id || '';
    const name = m.name || '';
    const role = m.role || '';
    const squad = m.squad || '';
    const power = (m.power !== undefined && m.power !== null) ? m.power : '';
    const stars = m.stars || '';
    const powerType = m.powerType || '';
    let lastUpdatedISO = '';
    if (m.lastUpdated && typeof m.lastUpdated.toMillis === 'function') {
      lastUpdatedISO = new Date(m.lastUpdated.toMillis()).toISOString();
    } else if (m.lastUpdated instanceof Date) {
      lastUpdatedISO = m.lastUpdated.toISOString();
    }
    rows.push([id, name, role, squad, power, stars, powerType, lastUpdatedISO]);
  }

  // CSV stringify (simple, handles quoting)
  return rows.map(row => row.map(cell => {
    const s = String(cell ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
  }).join(',')).join('\n');
}

function downloadCSVFile(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function handleExport() {
  try {
    // Prefer local export that includes lastUpdatedISO
    const csv = buildCSVFromMembers(state.members);
    const name = `members_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
    downloadCSVFile(name, csv);
  } catch (err) {
    console.error('Export error:', err);
    // fallback to utils export if available
    try {
      if (typeof utilsExportCSV === 'function') {
        utilsExportCSV(state.members);
      } else {
        alert('Export failed.');
      }
    } catch (e) {
      console.error('Fallback export failed:', e);
      alert('Export failed.');
    }
  }
}

function handleImportClick() {
  dom.csvInput.value = '';
  dom.csvInput.click();
}

function parseISOToTimestampOrUndefined(iso) {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return undefined;
  return Timestamp.fromDate(d);
}

async function handleCSVFileChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      // Use parseCSV util if available; else basic parse
      let importedRows;
      if (typeof utilsParseCSV === 'function') {
        importedRows = utilsParseCSV(evt.target.result);
      } else {
        // Very simple fallback CSV parser (assumes header row)
        const text = evt.target.result;
        const lines = text.split(/\r?\n/).filter(Boolean);
        const header = lines.shift().split(',').map(h => h.trim());
        importedRows = lines.map(line => {
          // naive split; if complex CSV expected, prefer utilsParseCSV
          const cols = line.split(',').map(c => c.replace(/^"|"$/g,'').replace(/""/g,'"'));
          const obj = {};
          header.forEach((h, i) => obj[h] = cols[i] ?? '');
          return obj;
        });
      }

      if (!importedRows || !importedRows.length) {
        alert('No rows found in CSV.');
        return;
      }

      if (!confirm(`Replace current members with ${importedRows.length} imported rows? This will delete existing members.`)) return;

      // Delete existing members
      const existingIds = state.members.map(m => m.id).filter(Boolean);
      await Promise.all(existingIds.map(id => deleteDoc(doc(db, 'members', id))));

      // Add new members; try to preserve lastUpdated if provided (ISO)
      for (const r of importedRows) {
        // Map possible header names to expected fields
        const name = (r.name || r.Name || r.NAME || '').trim();
        if (!name) continue; // skip rows without name
        const role = (r.role || r.Role || r.ROLE || '').trim();
        const squad = (r.squad || r.Squad || r.SQUAD || '').trim();
        const rawPower = (r.power || r.Power || r.POWER || '').trim();
        const power = cleanNumber(rawPower);
        const stars = parseInt(r.stars || r.Stars || r.STARS || '3', 10) || 3;
        const powerType = (r.powerType || r.PowerType || r.powertype || r['powerType'] || '').trim() || 'Precise';
        const lastIso = (r.lastUpdatedISO || r.lastUpdated || r.lastUpdatedISO || '').trim();
        const lastTs = parseISOToTimestampOrUndefined(lastIso);

        const payload = {
          name,
          role,
          squad,
          power,
          stars,
          powerType,
          lastUpdated: lastTs ? lastTs : serverTimestamp()
        };

        await addDoc(collection(db, 'members'), payload);
      }

      await logAudit('IMPORT', '', `Imported ${importedRows.length} rows`, state.currentAdminName);
      alert('Import complete.');
    } catch (err) {
      console.error('Import failed:', err);
      alert('Error importing CSV. See console for details.');
    }
  };
  reader.readAsText(file);
}

// ---------------------- Events ----------------------

function attachEvents() {
  dom.btnLogout.addEventListener('click', async () => {
    await logout();
    window.location.href = '/index.html';
  });

  dom.btnAdd.addEventListener('click', openAddModal);
  dom.btnModalCancel.addEventListener('click', closeModal);
  dom.btnModalSave.addEventListener('click', saveMemberFromModal);

  dom.btnExport.addEventListener('click', handleExport);
  dom.btnImport.addEventListener('click', handleImportClick);
  dom.csvInput.addEventListener('change', handleCSVFileChange);

  dom.searchInput.addEventListener('input', () => {
    state.search = dom.searchInput.value || '';
    render();
  });

  dom.filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter || 'RESET';
      render();
    });
  });

  dom.sortButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.sort || 'none';
      state.sort = s === 'none' ? 'none' : s;
      render();
    });
  });

  // close modal on backdrop click (if modal/backdrop exists)
  document.addEventListener('click', (ev) => {
    if (!dom.modal) return;
    const target = ev.target;
    if (target.classList && target.classList.contains('modal-backdrop')) {
      closeModal();
    }
  });
}

// ---------------------- Firestore subscription ----------------------

function subscribeMembers() {
  const qRef = query(collection(db, 'members'), orderBy('name'));
  onSnapshot(qRef, (snap) => {
    state.members = [];
    snap.forEach(docSnap => {
      state.members.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });
    render();
  }, (err) => {
    console.error('Members snapshot error:', err);
  });
}

// ---------------------- Start / Guard ----------------------

guardPage('admin', (user, role) => {
  state.currentAdminName = (user && user.email) ? user.email : 'Admin';
  if (dom.adminName) dom.adminName.textContent = state.currentAdminName;
  attachEvents();
  subscribeMembers();
  subscribeAudit(dom.auditList);
});
