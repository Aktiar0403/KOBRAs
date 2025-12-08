console.log("✅ admin.js loaded successfully");

import { db } from './firebase-config.js';
import { guardAdminPage, logout } from './auth.js';
import { renderCards } from './cards.js';
import {
  exportMembersToCSV as utilsExportCSV,
  parseCSV as utilsParseCSV,
  cleanNumber
} from './utils.js';
import { logAudit, subscribeAudit } from './audit.js';

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


/* ==========================================================
   APP STATE
========================================================== */
const state = {
  members: [],
  filter: 'RESET',
  search: '',
  sort: 'none',
  currentAdminName: ''
};


/* ==========================================================
   DOM GETTER
========================================================== */
function $id(id) {
  return document.getElementById(id);
}


/* ==========================================================
   DOM REFERENCES
========================================================== */
const dom = {
  btnLogout: $id('btnLogout'),

  statTotal: $id('statTotal'),
  statAvg: $id('statAvg'),
  statFive: $id('statFive'),
  statMissing: $id('statMissing'),

  filterButtons: Array.from(document.querySelectorAll('.filter-btn') || []),
  sortButtons: Array.from(document.querySelectorAll('.sort-btn') || []),

  searchInput: $id('searchInput'),

  btnAdd: $id('btnAddMember'),
  btnExport: $id('btnExportCSV'),
  btnImport: $id('btnImportCSV'),
  csvInput: $id('csvFileInput'),

  grid: $id('cardsGrid'),
  auditList: $id('auditList'),

  modal: $id('memberModal'),
  modalTitle: $id('modalTitle'),
  fieldName: $id('fieldName'),
  fieldRole: $id('fieldRole'),
  fieldSquad: $id('fieldSquad'),
  fieldPower: $id('fieldPower'),
  fieldPowerType: $id('fieldPowerType'),
  fieldStars: $id('fieldStars'),
  btnModalSave: $id('btnModalSave'),
  btnModalCancel: $id('btnModalCancel'),
};

let editingDocId = null;


/* ==========================================================
   ZERO / MISSING LOGIC
========================================================== */
function isZeroPower(v) {
  if (v === 0 || v === "0") return true;
  return Number(v) === 0;
}


/* ==========================================================
   FILTER + SORT
========================================================== */
function filteredAndSortedMembers() {
  let arr = state.members.slice();

  const f = state.filter.toUpperCase();

  // FILTERING
  if (f !== "RESET") {

    if (f === "MISSING_ZERO") {
      arr = arr.filter(m => isZeroPower(m.power));
    }

    else if (f === "APPROX") {
      arr = arr.filter(m => (m.powerType || "").toUpperCase() === "APPROX");
    }

    else if (f === "MISSING") {
      arr = arr.filter(m =>
        isZeroPower(m.power) ||
        (m.powerType || "").toUpperCase() === "APPROX"
      );
    }

    else {
      arr = arr.filter(m =>
        ((m.role || "") + (m.squad || "")).toUpperCase().includes(f)
      );
    }
  }

  // SEARCH
  const q = state.search.toLowerCase();
  if (q) {
    arr = arr.filter(m =>
      (m.name + " " + m.role + " " + m.squad).toLowerCase().includes(q)
    );
  }

  // SORTING
  if (state.sort === "power-desc") {
    arr.sort((a, b) => (Number(b.power) || 0) - (Number(a.power) || 0));
  }
  else if (state.sort === "power-asc") {
    arr.sort((a, b) => (Number(a.power) || 0) - (Number(b.power) || 0));
  }
  else if (state.sort === "stars-desc") {
    arr.sort((a, b) => (Number(b.stars) || 0) - (Number(a.stars) || 0));
  }
  else if (state.sort === "stars-asc") {
    arr.sort((a, b) => (Number(a.stars) || 0) - (Number(b.stars) || 0));
  }
  else if (state.sort === "missing") {
    arr.sort((a, b) => {
      const am = isZeroPower(a.power) || (a.powerType || "") === "Approx";
      const bm = isZeroPower(b.power) || (b.powerType || "") === "Approx";
      if (am !== bm) return bm - am;
      return (Number(a.power) || 0) - (Number(b.power) || 0);
    });
  }

  return arr;
}


/* ==========================================================
   STATS
========================================================== */
function updateStats(view) {
  let total = view.length;
  let sum = 0;
  let five = 0;
  let missing = 0;

  view.forEach(m => {
    sum += Number(m.power) || 0;
    if (Number(m.stars) === 5) five++;
    if (isZeroPower(m.power) || (m.powerType || "").toUpperCase() === "APPROX") {
      missing++;
    }
  });

  dom.statTotal.textContent = total;
  dom.statAvg.textContent = total ? (sum / total).toFixed(2) : "0.00";
  dom.statFive.textContent = five;
  dom.statMissing.textContent = missing;
}


/* ==========================================================
   RENDER
========================================================== */
function render() {
  const view = filteredAndSortedMembers();
  renderCards(dom.grid, view, {
    showAdminActions: true,
    onEdit: openEditModal,
    onDelete: deleteMember
  });
  updateStats(view);
}


/* ==========================================================
   MODAL SYSTEM
========================================================== */
function openModal() {
  dom.modal.classList.remove("hidden");
}

function closeModal() {
  dom.modal.classList.add("hidden");
  editingDocId = null;
}

dom.btnModalCancel?.addEventListener("click", closeModal);


/* ==========================================================
   ADD / EDIT
========================================================== */
function openAddModal() {
  editingDocId = null;
  dom.modalTitle.textContent = "Add Member";

  dom.fieldName.value = "";
  dom.fieldRole.value = "";
  dom.fieldSquad.value = "";
  dom.fieldPower.value = "";
  dom.fieldPowerType.value = "Precise";
  dom.fieldStars.value = 3;

  openModal();
}

function openEditModal(m) {
  editingDocId = m.id;

  dom.modalTitle.textContent = "Edit Member";
  dom.fieldName.value = m.name || "";
  dom.fieldRole.value = m.role || "";
  dom.fieldSquad.value = m.squad || "";
  dom.fieldPower.value = m.power ?? "";
  dom.fieldPowerType.value = m.powerType || "Precise";
  dom.fieldStars.value = m.stars ?? 3;

  openModal();
}

dom.btnModalSave?.addEventListener("click", async () => {

  if (!dom.fieldName.value.trim()) {
    alert("Name is required.");
    return;
  }

  const data = {
    name: dom.fieldName.value.trim(),
    role: dom.fieldRole.value.trim(),
    squad: dom.fieldSquad.value.trim(),
    power: cleanNumber(dom.fieldPower.value),
    powerType: dom.fieldPowerType.value,
    stars: Number(dom.fieldStars.value) || 3,
    lastUpdated: serverTimestamp()
  };

  try {
    if (!editingDocId) {
      await addDoc(collection(db, "members"), data);
      await logAudit("ADD", data.name, "", state.currentAdminName);
    } else {
      await updateDoc(doc(db, "members", editingDocId), data);
      await logAudit("EDIT", data.name, "", state.currentAdminName);
    }
    closeModal();
  } catch (err) {
    alert("Save failed.");
  }
});


/* ==========================================================
   DELETE
========================================================== */
async function deleteMember(m) {
  if (!confirm(`Delete ${m.name}?`)) return;

  try {
    await deleteDoc(doc(db, "members", m.id));
    await logAudit("DELETE", m.name, "", state.currentAdminName);
  } catch (err) {
    alert("Delete failed.");
  }
}


/* ==========================================================
   CSV IMPORT / EXPORT
========================================================== */
dom.btnExport?.addEventListener("click", () => utilsExportCSV(state.members));
dom.btnImport?.addEventListener("click", () => dom.csvInput.click());

dom.csvInput?.addEventListener("change", e => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async evt => {
    const imported = utilsParseCSV(evt.target.result);
    if (!confirm(`Replace with ${imported.length} rows?`)) return;

    // Wipe old
    for (const m of state.members) {
      await deleteDoc(doc(db, "members", m.id));
    }

    // Insert new
    for (const m of imported) {
      await addDoc(collection(db, "members"), {
        name: m.name,
        role: m.role,
        squad: m.squad,
        power: cleanNumber(m.power),
        powerType: m.powerType || "Precise",
        stars: Number(m.stars) || 3,
        lastUpdated: serverTimestamp()
      });
    }

    alert("Import Complete.");
  };
  reader.readAsText(file);
});


/* ==========================================================
   SEARCH / FILTER / SORT EVENTS
========================================================== */
dom.searchInput?.addEventListener("input", () => {
  state.search = dom.searchInput.value;
  render();
});

dom.filterButtons.forEach(btn =>
  btn.addEventListener("click", () => {
    state.filter = btn.dataset.filter || "RESET";
    render();
  })
);

dom.sortButtons.forEach(btn =>
  btn.addEventListener("click", () => {
    state.sort = btn.dataset.sort || "none";
    render();
  })
);


/* ==========================================================
   FIRESTORE LIVE SYNC
========================================================== */
function subscribeMembers() {
  const qRef = query(collection(db, "members"), orderBy("name"));
  onSnapshot(qRef, snap => {
    state.members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  });
}


/* ==========================================================
   INIT (ADMIN PROTECTED)
========================================================== */
guardAdminPage(); // NEW SYSTEM

// INIT AFTER ADMIN IS VERIFIED
function initAdminPanel(user) {
  state.currentAdminName = user.email || "Admin";

  subscribeMembers();
  subscribeAudit(dom.auditList);

  dom.btnLogout?.addEventListener("click", async () => {
    await logout();
    window.location.href = "admin-login.html";
  });

  dom.btnAdd?.addEventListener("click", openAddModal);
}

guardAdminPage(initAdminPanel);
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

guardAdminPage(); // Protect admin page

onAuthStateChanged(auth, (user) => {
  if (!user) return; // Not logged in, guard will redirect

  console.log("👑 Admin logged in:", user.email);

  state.currentAdminName = user.email;

  subscribeMembers();    // ⬅️ THIS LOADS YOUR CARDS
  subscribeAudit(dom.auditList);

  dom.btnLogout?.addEventListener("click", async () => {
    await logout();
    window.location.href = "admin-login.html";
  });

  dom.btnAdd?.addEventListener("click", openAddModal);
});
