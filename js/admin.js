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

/* State */
const state = {
  members: [],
  filter: 'RESET',
  search: '',
  sort: 'none',
  currentAdminName: ''
};

/* Safe DOM getters (will warn if missing) */
function $id(id) {
  const el = document.getElementById(id);
  if (!el) console.warn(`Warning: missing element #${id}`);
  return el;
}

const dom = {
  adminName: $id('adminNameLabel'),
  btnLogout: $id('btnLogout'),
  btnAdd: $id('btnAddMember'),
  btnExport: $id('btnExportCSV'),
  btnImport: $id('btnImportCSV'),
  csvInput: $id('csvFileInput'),
  searchInput: $id('searchInput'),
  filterButtons: Array.from(document.querySelectorAll('.filter-btn') || []),
  sortButtons: Array.from(document.querySelectorAll('.sort-btn') || []),
  grid: $id('cardsGrid'),
  statTotal: $id('statTotal'),
  statAvg: $id('statAvg'),
  statFive: $id('statFive'),
  auditList: $id('auditList'),
  // modal elements
  modal: $id('memberModal'),
  modalBackdrop: null, // will be found inside modal when needed
  modalBox: null,
  modalTitle: $id('modalTitle'),
  fieldName: $id('fieldName'),
  fieldRole: $id('fieldRole'),
  fieldSquad: $id('fieldSquad'),
  fieldPower: $id('fieldPower'),
  fieldPowerType: $id('fieldPowerType'), // optional (make sure your HTML has this select/input)
  fieldStars: $id('fieldStars'),
  btnModalSave: $id('btnModalSave'),
  btnModalCancel: $id('btnModalCancel')
};

let editingDocId = null;

/* ---------- helpers ---------- */

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function timeAgoFromTimestamp(tsLike) {
  if (!tsLike) return 'never';
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

/* refresh any timestamp badges */
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
setInterval(refreshAllTimestamps, 60 * 1000);

/* ---------- list helpers ---------- */

function filteredAndSortedMembers() {
  let arr = state.members.slice();

  if (state.filter !== 'RESET') {
    const f = state.filter.toUpperCase();
    arr = arr.filter(m =>
      ((m.squad || '') + (m.role || '')).toUpperCase().includes(f)
    );
  }

  const q = (state.search || '').toLowerCase();
  if (q) {
    arr = arr.filter(m =>
      (m.name + ' ' + (m.role || '') + ' ' + (m.squad || '')).toLowerCase().includes(q)
    );
  }

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
    if (m.power) sum += Number(m.power) || 0;
    if (Number(m.stars) === 5) five++;
  });
  if (dom.statTotal) dom.statTotal.textContent = total;
  if (dom.statAvg) dom.statAvg.textContent = total ? (sum / total).toFixed(2) : '0.00';
  if (dom.statFive) dom.statFive.textContent = five;
}

function render() {
  const view = filteredAndSortedMembers();
  if (dom.grid) {
    renderCards(dom.grid, view, {
      showAdminActions: true,
      onEdit: openEditModalForMember,
      onDelete: deleteMember
    });
  }
  updateStats(view);
  // refresh timestamp labels once cards re-render
  refreshAllTimestamps();
}

/* ---------- modal open/close handling (robust) ---------- */

function ensureModalRefs() {
  if (!dom.modal) {
    dom.modal = $id('memberModal');
    if (!dom.modal) return false;
  }
  if (!dom.modalBackdrop) {
    // modal-backdrop is inside modal markup
    dom.modalBackdrop = dom.modal.querySelector('.modal-backdrop') || null;
  }
  if (!dom.modalBox) {
    dom.modalBox = dom.modal.querySelector('.modal-box') || null;
  }
  return true;
}

function openModal() {
  if (!ensureModalRefs()) return console.warn('Modal element not found.');
  dom.modal.classList.remove('hidden');

  // optional: focus first input
  setTimeout(() => {
    dom.fieldName?.focus();
  }, 60);
}

function closeModal() {
  if (!ensureModalRefs()) return;
  dom.modal.classList.add('hidden');
  editingDocId = null;
}

/* closes if clicking backdrop or pressing Escape */
function wireModalGlobalEvents() {
  if (!ensureModalRefs()) return;

  // Backdrop click closes modal
  if (dom.modalBackdrop) {
    // remove previous handlers (defensive)
    dom.modalBackdrop.removeEventListener('click', handleBackdropClick);
    dom.modalBackdrop.addEventListener('click', handleBackdropClick);
  } else {
    // fallback: click outside modal-box
    dom.modal.removeEventListener('click', handleOutsideClick);
    dom.modal.addEventListener('click', handleOutsideClick);
  }

  // Esc key
  window.removeEventListener('keydown', handleKeyDown);
  window.addEventListener('keydown', handleKeyDown);
}

function handleBackdropClick(e) {
  // clicking backdrop should close
  closeModal();
}

function handleOutsideClick(e) {
  if (!dom.modalBox) return;
  if (!dom.modal.contains(e.target)) return;
  if (!dom.modalBox.contains(e.target)) {
    closeModal();
  }
}

function handleKeyDown(e) {
  if (e.key === 'Escape') closeModal();
}

/* ---------- open add / edit ---------- */

function openAddModal() {
  editingDocId = null;
  if (dom.modalTitle) dom.modalTitle.textContent = 'Add Member';
  if (dom.fieldName) dom.fieldName.value = '';
  if (dom.fieldRole) dom.fieldRole.value = '';
  if (dom.fieldSquad) dom.fieldSquad.value = '';
  if (dom.fieldPower) dom.fieldPower.value = '';
  if (dom.fieldPowerType) dom.fieldPowerType.value = 'Precise';
  if (dom.fieldStars) dom.fieldStars.value = '3';
  openModal();
}

function openEditModalForMember(member) {
  editingDocId = member.id;
  if (dom.modalTitle) dom.modalTitle.textContent = 'Edit Member';
  if (dom.fieldName) dom.fieldName.value = member.name || '';
  if (dom.fieldRole) dom.fieldRole.value = member.role || '';
  if (dom.fieldSquad) dom.fieldSquad.value = member.squad || '';
  if (dom.fieldPower) dom.fieldPower.value = member.power ?? '';
  if (dom.fieldPowerType) dom.fieldPowerType.value = member.powerType || 'Precise';
  if (dom.fieldStars) dom.fieldStars.value = member.stars ?? 3;
  openModal();
}

/* ---------- save / delete ---------- */

async function saveMemberFromModal() {
  if (!dom.fieldName) return alert('Name field missing.');
  const name = dom.fieldName.value.trim();
  if (!name) {
    alert('Name is required.');
    dom.fieldName.focus();
    return;
  }

  const data = {
    name,
    role: dom.fieldRole?.value.trim() || '',
    squad: dom.fieldSquad?.value.trim() || '',
    power: cleanNumber(dom.fieldPower?.value),
    powerType: dom.fieldPowerType?.value || 'Precise',
    stars: Math.max(1, Math.min(5, parseInt(dom.fieldStars?.value) || 3)),
    lastUpdated: serverTimestamp()
  };

  try {
    if (!editingDocId) {
      const ref = await addDoc(collection(db, 'members'), data);
      editingDocId = ref.id;
      await logAudit('ADD', data.name, '', state.currentAdminName);
    } else {
      await updateDoc(doc(db, 'members', editingDocId), data);
      await logAudit('EDIT', data.name, '', state.currentAdminName);
    }
    closeModal();
  } catch (err) {
    console.error('Save member error', err);
    alert('Error saving member. See console.');
  }
}

async function deleteMember(member) {
  if (!confirm(`Delete ${member.name}?`)) return;
  try {
    await deleteDoc(doc(db, 'members', member.id));
    await logAudit('DELETE', member.name, '', state.currentAdminName);
  } catch (err) {
    console.error('Delete error', err);
    alert('Delete failed.');
  }
}

/* ---------- CSV import / export ---------- */

function handleExport() {
  try {
    utilsExportCSV(state.members);
  } catch (err) {
    console.error('Export error', err);
    alert('Export failed.');
  }
}

function handleImportClick() {
  if (!dom.csvInput) {
    alert('CSV input not available');
    return;
  }
  dom.csvInput.value = '';
  dom.csvInput.click();
}

function handleCSVFileChange(e) {
  const file = e?.target?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const imported = utilsParseCSV(evt.target.result);
      if (!imported.length) {
        alert('No valid rows found in CSV.');
        return;
      }
      if (!confirm(`Replace current members with ${imported.length} imported rows?`)) return;

      // Delete existing and add new
      const existingIds = state.members.map(m => m.id);
      await Promise.all(existingIds.map(id => deleteDoc(doc(db, 'members', id))));
      for (const m of imported) {
        // ensure correct fields
        const docData = {
          name: m.name || '',
          role: m.role || '',
          squad: m.squad || '',
          power: cleanNumber(m.power),
          powerType: m.powerType || 'Precise',
          stars: Number(m.stars) || 3,
          lastUpdated: serverTimestamp()
        };
        await addDoc(collection(db, 'members'), docData);
      }
      await logAudit('IMPORT', '', `Imported ${imported.length} rows`, state.currentAdminName);
      alert('Import complete.');
    } catch (err) {
      console.error(err);
      alert('Error importing CSV.');
    }
  };
  reader.readAsText(file);
}

/* ---------- events wiring ---------- */

function attachEvents() {
  // guard: ensure modal refs + wire global modal events
  ensureModalRefs();
  wireModalGlobalEvents();

  if (dom.btnLogout) {
    dom.btnLogout.addEventListener('click', async () => {
      await logout();
      window.location.href = '/index.html';
    });
  }

  if (dom.btnAdd) dom.btnAdd.addEventListener('click', openAddModal);

  // Modal actions (Save / Cancel)
  if (dom.btnModalCancel) {
    // defensive: remove previous listener then add
    dom.btnModalCancel.removeEventListener('click', closeModal);
    dom.btnModalCancel.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal();
    });
  } else {
    console.warn('btnModalCancel not found - ensure modal markup has #btnModalCancel');
  }

  if (dom.btnModalSave) {
    dom.btnModalSave.removeEventListener('click', saveMemberFromModal);
    dom.btnModalSave.addEventListener('click', async (e) => {
      e.preventDefault();
      await saveMemberFromModal();
    });
  } else {
    console.warn('btnModalSave not found - ensure modal markup has #btnModalSave');
  }

  if (dom.btnExport) dom.btnExport.addEventListener('click', handleExport);
  if (dom.btnImport) dom.btnImport.addEventListener('click', handleImportClick);
  if (dom.csvInput) dom.csvInput.addEventListener('change', handleCSVFileChange);

  if (dom.searchInput) {
    dom.searchInput.addEventListener('input', () => {
      state.search = dom.searchInput.value;
      render();
    });
  }

  dom.filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter || 'RESET';
      render();
    });
  });

  dom.sortButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      state.sort = btn.dataset.sort || 'none';
      render();
    });
  });
}

/* ---------- Firestore subscription ---------- */

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
    console.error('members subscription error', err);
  });
}

/* ---------- guard page & init ---------- */

guardPage('admin', (user, role) => {
  state.currentAdminName = user.email || 'Admin';
  if (dom.adminName) dom.adminName.textContent = state.currentAdminName;
  attachEvents();
  subscribeMembers();
  subscribeAudit(dom.auditList);
});
