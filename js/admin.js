// js/admin.js
import { db } from './firebase-config.js';
import { guardPage, logout } from './auth.js';
import { renderCards } from './cards.js';
import { exportMembersToCSV, parseCSV, cleanNumber } from './utils.js';
import { logAudit, subscribeAudit } from './audit.js';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
  fieldStars: document.getElementById('fieldStars'),
  btnModalSave: document.getElementById('btnModalSave'),
  btnModalCancel: document.getElementById('btnModalCancel')
};

let editingDocId = null;

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
  const q = state.search.toLowerCase();
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
    if (m.power) sum += m.power;
    if (m.stars === 5) five++;
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
}

function openModal() {
  dom.modal.classList.remove('hidden');
}

function closeModal() {
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
  dom.fieldStars.value = '3';
  openModal();
}

function openEditModalForMember(member) {
  editingDocId = member.id;
  dom.modalTitle.textContent = 'Edit Member';
  dom.fieldName.value = member.name || '';
  dom.fieldRole.value = member.role || '';
  dom.fieldSquad.value = member.squad || '';
  dom.fieldPower.value = member.power ?? '';
  dom.fieldStars.value = member.stars ?? 3;
  openModal();
}

async function saveMemberFromModal() {
  const name = dom.fieldName.value.trim();
  if (!name) {
    alert('Name is required.');
    return;
  }
  const data = {
    name,
    role: dom.fieldRole.value.trim(),
    squad: dom.fieldSquad.value.trim(),
    power: cleanNumber(dom.fieldPower.value),
    stars: Math.max(1, Math.min(5, parseInt(dom.fieldStars.value) || 3))
  };

  if (!editingDocId) {
    const ref = await addDoc(collection(db, 'members'), data);
    await logAudit('ADD', data.name, '', state.currentAdminName);
    editingDocId = ref.id;
  } else {
    await updateDoc(doc(db, 'members', editingDocId), data);
    await logAudit('EDIT', data.name, '', state.currentAdminName);
  }
  closeModal();
}

async function deleteMember(member) {
  if (!confirm(`Delete ${member.name}?`)) return;
  await deleteDoc(doc(db, 'members', member.id));
  await logAudit('DELETE', member.name, '', state.currentAdminName);
}

// CSV handling
function handleExport() {
  exportMembersToCSV(state.members);
}

function handleImportClick() {
  dom.csvInput.value = '';
  dom.csvInput.click();
}

function handleCSVFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const imported = parseCSV(evt.target.result);
      if (!imported.length) {
        alert('No valid rows found in CSV.');
        return;
      }
      if (!confirm(`Replace current members with ${imported.length} imported rows?`)) return;

      // Delete existing and add new
      const existingIds = state.members.map(m => m.id);
      await Promise.all(existingIds.map(id => deleteDoc(doc(db, 'members', id))));
      for (const m of imported) {
        await addDoc(collection(db, 'members'), m);
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

// Event wiring
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
    state.search = dom.searchInput.value;
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
}

// Firestore subscription
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
  });
}

// Guard admin page & start
guardPage('admin', (user, role) => {
  state.currentAdminName = user.email || 'Admin';
  if (dom.adminName) dom.adminName.textContent = state.currentAdminName;
  attachEvents();
  subscribeMembers();
  subscribeAudit(dom.auditList);
});
