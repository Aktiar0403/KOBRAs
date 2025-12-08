console.log("✅ admin.js loaded successfully");

import { db } from './firebase-config.js';
import { guardPage, logout } from './auth.js';
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
   SAFE DOM GETTER
========================================================== */
function $id(id) {
  const el = document.getElementById(id);
  if (!el) console.warn(`⚠ Missing element: #${id}`);
  return el;
}

/* ==========================================================
   DOM REFERENCES
========================================================== */
const dom = {
  btnLogout: $id('btnLogout'),

  // Stats
  statTotal: $id('statTotal'),
  statAvg: $id('statAvg'),
  statFive: $id('statFive'),
  statMissing: $id('statMissing'),

  // Filters + Sort
  filterButtons: Array.from(document.querySelectorAll('.filter-btn') || []),
  sortButtons: Array.from(document.querySelectorAll('.sort-btn') || []),

  // Search
  searchInput: $id('searchInput'),

  // CRUD
  btnAdd: $id('btnAddMember'),
  btnExport: $id('btnExportCSV'),
  btnImport: $id('btnImportCSV'),
  csvInput: $id('csvFileInput'),

  // Layout
  grid: $id('cardsGrid'),
  auditList: $id('auditList'),

  // Modal
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

  modalBackdrop: null,
  modalBox: null
};

let editingDocId = null;

/* ==========================================================
   TIMESTAMP UTILS
========================================================== */
function timeAgoFromTimestamp(ts) {
  if (!ts) return "never";
  let ms;

  if (typeof ts === "number") ms = ts;
  else if (ts?.toMillis) ms = ts.toMillis();
  else if (ts instanceof Date) ms = ts.getTime();
  else return "never";

  const diffSec = Math.floor((Date.now() - ms) / 1000);

  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} mins ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hrs ago`;
  return `${Math.floor(diffSec / 86400)} days ago`;
}

function refreshAllTimestamps() {
  document.querySelectorAll("[data-lastts]").forEach(el => {
    const raw = el.getAttribute("data-lastts");
    if (!raw) return el.textContent = "Updated never";
    el.textContent = "Updated " + timeAgoFromTimestamp(Number(raw));
  });
}
setInterval(refreshAllTimestamps, 60000);

/* ==========================================================
   FILTER + SORT ENGINE  (FULLY FIXED)
========================================================== */
function isZeroPower(value) {
  if (value === 0) return true;
  if (value === "0") return true;
  if (typeof value === "string" && value.trim() === "0") return true;
  return Number(value) === 0;
}

function filteredAndSortedMembers() {
  let arr = state.members.slice();

  /* ---------------- FILTERING ---------------- */
  if (state.filter !== "RESET") {
    const f = state.filter.toUpperCase();

    // 🔴 0 Power Filter (FULL FIX)
    if (f === "MISSING_ZERO") {
      arr = arr.filter(m => isZeroPower(m.power));
    }

    // ⚪ Approx Only
    else if (f === "APPROX") {
      arr = arr.filter(m =>
        (m.powerType || "").toUpperCase() === "APPROX"
      );
    }

    // 🟣 Missing = 0 Power + Approx
    else if (f === "MISSING") {
      arr = arr.filter(m =>
        isZeroPower(m.power) ||
        (m.powerType || "").toUpperCase() === "APPROX"
      );
    }

    // Normal Filters: Role / Squad
    else {
      arr = arr.filter(m =>
        ((m.role || "") + (m.squad || "")).toUpperCase().includes(f)
      );
    }
  }

  /* ---------------- SEARCH ---------------- */
  const q = state.search.toLowerCase();
  if (q) {
    arr = arr.filter(m =>
      (m.name + " " + m.role + " " + m.squad).toLowerCase().includes(q)
    );
  }

  /* ---------------- SORTING ---------------- */
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
   STATS UPDATE
========================================================== */
function updateStats(viewMembers) {
  let total = viewMembers.length;
  let sum = 0;
  let fiveStars = 0;
  let missing = 0;

  viewMembers.forEach(m => {
    const p = Number(m.power) || 0;
    sum += p;

    if (Number(m.stars) === 5) fiveStars++;

    if (isZeroPower(m.power) || (m.powerType || "").toUpperCase() === "APPROX") {
      missing++;
    }
  });

  dom.statTotal.textContent = total;
  dom.statAvg.textContent = total ? (sum / total).toFixed(2) : "0.00";
  dom.statFive.textContent = fiveStars;
  dom.statMissing.textContent = missing;
}

/* ==========================================================
   RENDER ENGINE
========================================================== */
function render() {
  const view = filteredAndSortedMembers();

  renderCards(dom.grid, view, {
    showAdminActions: true,
    onEdit: openEditModalForMember,
    onDelete: deleteMember
  });

  updateStats(view);
  refreshAllTimestamps();
}

/* ==========================================================
   MODAL SYSTEM
========================================================== */
function ensureModalRefs() {
  dom.modalBackdrop = dom.modal.querySelector(".modal-backdrop");
  dom.modalBox = dom.modal.querySelector(".modal-box");
}

function openModal() {
  ensureModalRefs();
  dom.modal.classList.remove("hidden");
  setTimeout(() => dom.fieldName?.focus(), 30);
}

function closeModal() {
  dom.modal.classList.add("hidden");
  editingDocId = null;
}

dom.btnModalCancel?.addEventListener("click", closeModal);

/* ==========================================================
   ADD / EDIT MEMBER
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

function openEditModalForMember(m) {
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

async function saveMemberFromModal() {
  const name = dom.fieldName.value.trim();
  if (!name) return alert("Name is required.");

  const data = {
    name,
    role: dom.fieldRole.value.trim(),
    squad: dom.fieldSquad.value.trim(),
    power: cleanNumber(dom.fieldPower.value),
    powerType: dom.fieldPowerType.value,
    stars: Math.max(1, Math.min(5, Number(dom.fieldStars.value))),
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
  } catch (err) {
    alert("Save failed.");
  }
}

/* ==========================================================
   DELETE MEMBER
========================================================== */
async function deleteMember(member) {
  if (!confirm(`Delete ${member.name}?`)) return;
  try {
    await deleteDoc(doc(db, "members", member.id));
    await logAudit("DELETE", member.name, "", state.currentAdminName);
  } catch (err) {
    alert("Delete failed.");
  }
}

/* ==========================================================
   IMPORT / EXPORT CSV
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

    for (const m of state.members) {
      await deleteDoc(doc(db, "members", m.id));
    }

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

    alert("Import complete.");
  };
  reader.readAsText(file);
});

/* ==========================================================
   SEARCH, FILTER, SORT EVENTS
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
   FIREBASE LIVE SYNC
========================================================== */
function subscribeMembers() {
  const qRef = query(collection(db, "members"), orderBy("name"));
  onSnapshot(qRef, snap => {
    state.members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  });
}

/* ==========================================================
   INIT
========================================================== */
guardPage("admin", (user) => {
  state.currentAdminName = user.email || "Admin";

  subscribeMembers();
  subscribeAudit(dom.auditList);

  dom.btnLogout?.addEventListener("click", async () => {
    await logout();
    location.href = "/index.html";
  });

  dom.btnAdd?.addEventListener("click", openAddModal);
});
