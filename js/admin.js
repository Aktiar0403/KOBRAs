// -----------------------------------------------------------
//  admin.js  (FULL UPDATED VERSION WITH MISSING POWER LOGIC)
// -----------------------------------------------------------

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

/* --------------------------------------
   STATE
-------------------------------------- */
const state = {
  members: [],
  filter: 'RESET',
  search: '',
  sort: 'none',
  currentAdminName: ''
};

/* --------------------------------------
   SAFE DOM GETTER
-------------------------------------- */
function $id(id) {
  const el = document.getElementById(id);
  if (!el) console.warn(`Warning: missing element #${id}`);
  return el;
}

/* --------------------------------------
   DOM REFERENCES
-------------------------------------- */
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

  // STAT pills
  statTotal: $id('statTotal'),
  statAvg: $id('statAvg'),
  statFive: $id('statFive'),

  // NEW Missing UI pills
  statZeroPower: $id('statZeroPower'),
  statApprox: $id('statApprox'),
  statUncertain: $id('statUncertain'),

  auditList: $id('auditList'),

  // Modal
  modal: $id('memberModal'),
  modalBackdrop: null,
  modalBox: null,
  modalTitle: $id('modalTitle'),
  fieldName: $id('fieldName'),
  fieldRole: $id('fieldRole'),
  fieldSquad: $id('fieldSquad'),
  fieldPower: $id('fieldPower'),
  fieldPowerType: $id('fieldPowerType'),
  fieldStars: $id('fieldStars'),
  btnModalSave: $id('btnModalSave'),
  btnModalCancel: $id('btnModalCancel')
};

let editingDocId = null;

/* --------------------------------------
   HELPERS
-------------------------------------- */
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
  else if (tsLike?.toMillis) ms = tsLike.toMillis();
  else if (tsLike instanceof Date) ms = tsLike.getTime();
  else return 'never';

  const now = Date.now();
  const seconds = Math.floor((now - ms) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hrs ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

function refreshAllTimestamps() {
  document.querySelectorAll('[data-lastts]').forEach(el => {
    const v = el.getAttribute('data-lastts');
    const ms = v ? Number(v) : NaN;
    el.textContent = isNaN(ms)
      ? 'Updated never'
      : 'Updated ' + timeAgoFromTimestamp(ms);
  });
}
setInterval(refreshAllTimestamps, 60000);

/* --------------------------------------
   FILTER + SORT PROCESSING
-------------------------------------- */

function filteredAndSortedMembers() {
  let arr = state.members.slice();

  // -------------------------------
  // NEW FILTER LOGIC
  // -------------------------------
  if (state.filter !== 'RESET') {
    const f = state.filter.toUpperCase();

    if (f === 'MISSING_ZERO') {
      arr = arr.filter(m => Number(m.power) === 0);
    }
    else if (f === 'APPROX') {
      arr = arr.filter(m => (m.powerType || '').toUpperCase() === 'APPROX');
    }
    else {
      arr = arr.filter(m =>
        ((m.squad || '') + (m.role || '')).toUpperCase().includes(f)
      );
    }
  }

  // SEARCH
  const q = state.search.toLowerCase();
  if (q) {
    arr = arr.filter(m =>
      (m.name + ' ' + (m.role || '') + ' ' + (m.squad || ''))
        .toLowerCase()
        .includes(q)
    );
  }

  // SORTING
  if (state.sort === 'power-desc') {
    arr.sort((a, b) => (b.power || 0) - (a.power || 0));
  }
  else if (state.sort === 'power-asc') {
    arr.sort((a, b) => (a.power || 0) - (b.power || 0));
  }
  else if (state.sort === 'stars-desc') {
    arr.sort((a, b) => (b.stars || 0) - (a.stars || 0));
  }
  else if (state.sort === 'stars-asc') {
    arr.sort((a, b) => (a.stars || 0) - (b.stars || 0));
  }
  // -------------------------------
  // NEW SORT: Missing First
  // -------------------------------
  else if (state.sort === 'missing') {
    arr.sort((a, b) => {
      const aMiss = Number(a.power) === 0 || (a.powerType || '') === 'Approx' ? 1 : 0;
      const bMiss = Number(b.power) === 0 || (b.powerType || '') === 'Approx' ? 1 : 0;
      if (aMiss !== bMiss) return bMiss - aMiss;
      return (a.power || 0) - (b.power || 0);
    });
  }

  return arr;
}

/* --------------------------------------
   UPDATE STATS (INCLUDES NEW UI)
-------------------------------------- */
function updateStats(viewMembers) {
  const total = viewMembers.length;
  let sum = 0;
  let five = 0;

  let zeroPower = 0;
  let approx = 0;

  viewMembers.forEach(m => {
    const p = Number(m.power) || 0;

    if (p) sum += p;
    if (Number(m.stars) === 5) five++;

    if (p === 0) zeroPower++;
    if ((m.powerType || '').toUpperCase() === 'APPROX') approx++;
  });

  if (dom.statTotal) dom.statTotal.textContent = total;
  if (dom.statAvg) dom.statAvg.textContent = total ? (sum / total).toFixed(2) : '0.00';
  if (dom.statFive) dom.statFive.textContent = five;

  // NEW UI UPDATES
  if (dom.statZeroPower) dom.statZeroPower.textContent = zeroPower;
  if (dom.statApprox) dom.statApprox.textContent = approx;
  if (dom.statUncertain) dom.statUncertain.textContent = zeroPower + approx;
}

/* --------------------------------------
   RENDER
-------------------------------------- */
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
  refreshAllTimestamps();
}

/* --------------------------------------
   MODAL HANDLING
-------------------------------------- */
function ensureModalRefs() {
  if (!dom.modal) dom.modal = $id('memberModal');
  if (!dom.modal) return false;
  dom.modalBackdrop = dom.modal.querySelector('.modal-backdrop');
  dom.modalBox = dom.modal.querySelector('.modal-box');
  return true;
}

function openModal() {
  ensureModalRefs();
  dom.modal.classList.remove('hidden');
  setTimeout(() => dom.fieldName?.focus(), 60);
}

function closeModal() {
  ensureModalRefs();
  dom.modal.classList.add('hidden');
  editingDocId = null;
}

function wireModalGlobalEvents() {
  ensureModalRefs();

  if (dom.modalBackdrop) {
    dom.modalBackdrop.addEventListener('click', () => closeModal());
  } else {
    dom.modal.addEventListener('click', e => {
      if (!dom.modalBox.contains(e.target)) closeModal();
    });
  }

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}

/* --------------------------------------
   ADD / EDIT MEMBER
-------------------------------------- */
function openAddModal() {
  editingDocId = null;
  dom.modalTitle.textContent = "Add Member";
  dom.fieldName.value = '';
  dom.fieldRole.value = '';
  dom.fieldSquad.value = '';
  dom.fieldPower.value = '';
  dom.fieldPowerType.value = 'Precise';
  dom.fieldStars.value = '3';
  openModal();
}

function openEditModalForMember(m) {
  editingDocId = m.id;
  dom.modalTitle.textContent = "Edit Member";

  dom.fieldName.value = m.name || '';
  dom.fieldRole.value = m.role || '';
  dom.fieldSquad.value = m.squad || '';
  dom.fieldPower.value = m.power ?? '';
  dom.fieldPowerType.value = m.powerType || 'Precise';
  dom.fieldStars.value = m.stars ?? 3;

  openModal();
}

async function saveMemberFromModal() {
  const name = dom.fieldName.value.trim();
  if (!name) return alert("Name required.");

  const data = {
    name,
    role: dom.fieldRole.value.trim(),
    squad: dom.fieldSquad.value.trim(),
    power: cleanNumber(dom.fieldPower.value),
    powerType: dom.fieldPowerType.value,
    stars: Math.max(1, Math.min(5, parseInt(dom.fieldStars.value) || 3)),
    lastUpdated: serverTimestamp()
  };

  try {
    if (!editingDocId) {
      await addDoc(collection(db, "members"), data);
      await logAudit("ADD", name, "", state.currentAdminName);
    } else {
      await updateDoc(doc(db, "members", editingDocId), data);
      await logAudit("EDIT", name, "", state.currentAdminName);
    }
    closeModal();
  } catch (e) {
    console.error(e);
    alert("Save error.");
  }
}

async function deleteMember(member) {
  if (!confirm(`Delete ${member.name}?`)) return;
  try {
    await deleteDoc(doc(db, "members", member.id));
    await logAudit("DELETE", member.name, "", state.currentAdminName);
  } catch (e) {
    console.error(e);
    alert("Delete error.");
  }
}

/* --------------------------------------
   CSV IMPORT / EXPORT
-------------------------------------- */
function handleExport() {
  utilsExportCSV(state.members);
}

function handleImportClick() {
  dom.csvInput.value = '';
  dom.csvInput.click();
}

function handleCSVFileChange(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async evt => {
    try {
      const imported = utilsParseCSV(evt.target.result);
      if (!imported.length) return alert("CSV invalid.");

      if (!confirm(`Replace members with ${imported.length} imported rows?`)) return;

      const oldIds = state.members.map(m => m.id);
      await Promise.all(oldIds.map(id => deleteDoc(doc(db, "members", id))));

      for (const m of imported) {
        await addDoc(collection(db, "members"), {
          name: m.name || '',
          role: m.role || '',
          squad: m.squad || '',
          power: cleanNumber(m.power),
          powerType: m.powerType || 'Precise',
          stars: Number(m.stars) || 3,
          lastUpdated: serverTimestamp()
        });
      }
      alert("Import complete.");
    } catch (err) {
      console.error(err);
      alert("Import error.");
    }
  };
  reader.readAsText(file);
}

/* --------------------------------------
   EVENTS
-------------------------------------- */
function attachEvents() {
  ensureModalRefs();
  wireModalGlobalEvents();

  dom.btnLogout.addEventListener('click', async () => {
    await logout();
    window.location.href = "/index.html";
  });

  dom.btnAdd.addEventListener('click', openAddModal);
  dom.btnExport.addEventListener('click', handleExport);
  dom.btnImport.addEventListener('click', handleImportClick);
  dom.csvInput.addEventListener('change', handleCSVFileChange);

  dom.btnModalCancel.addEventListener('click', closeModal);
  dom.btnModalSave.addEventListener('click', saveMemberFromModal);

  dom.searchInput.addEventListener('input', () => {
    state.search = dom.searchInput.value;
    render();
  });

  dom.filterButtons.forEach(btn =>
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter || 'RESET';
      render();
    })
  );

  dom.sortButtons.forEach(btn =>
    btn.addEventListener('click', () => {
      state.sort = btn.dataset.sort || 'none';
      render();
    })
  );
}

/* --------------------------------------
   FIRESTORE SUBSCRIBE
-------------------------------------- */
function subscribeMembers() {
  const qRef = query(collection(db, "members"), orderBy("name"));
  onSnapshot(
    qRef,
    snap => {
      state.members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      render();
    },
    err => console.error(err)
  );
}

/* --------------------------------------
   INIT
-------------------------------------- */
guardPage("admin", (user, role) => {
  state.currentAdminName = user.email || "Admin";
  dom.adminName.textContent = state.currentAdminName;

  attachEvents();
  subscribeMembers();
  subscribeAudit(dom.auditList);
});
