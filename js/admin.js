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
   DOM REFERENCES (UPDATED FOR NEW DROPDOWN + TOGGLE)
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

  // NEW FIELDS
  fieldSquadPrimary: $id('fieldSquadPrimary'),
  fieldSquadHybrid: $id('fieldSquadHybrid'),
  hybridLabel: $id('hybridLabel'),

  fieldPower: $id('fieldPower'),
  fieldPowerType: $id('fieldPowerType'),
  fieldStars: $id('fieldStars'),

  btnModalSave: $id('btnModalSave'),
  btnModalCancel: $id('btnModalCancel'),
};

let editingDocId = null;


/* ==========================================================
   BACKWARD COMPATIBILITY: Parse old squad strings
========================================================== */
function parseOldSquad(str) {
  const s = String(str || "").toUpperCase();

  let primary = null;
  if (s.includes("TANK")) primary = "TANK";
  else if (s.includes("AIR")) primary = "AIR";
  else if (s.includes("MISSILE")) primary = "MISSILE";

  const hybrid = s.includes("HYBRID");

  return { primary, hybrid };
}

function getMemberSquadLabel(m) {
  if (m.squadPrimary) {
    return m.squadHybrid ? `HYBRID (${m.squadPrimary})` : m.squadPrimary;
  }
  const parsed = parseOldSquad(m.squad);
  if (parsed.primary) {
    return parsed.hybrid ? `HYBRID (${parsed.primary})` : parsed.primary;
  }
  return (m.squad || "—").toUpperCase();
}

function normalizeMemberLocal(m) {
  if (!m.squadPrimary) {
    const parsed = parseOldSquad(m.squad);
    m.squadPrimary = parsed.primary || null;
    m.squadHybrid = !!parsed.hybrid;
  } else {
    m.squadHybrid = !!m.squadHybrid;
  }
  return m;
}


/* ==========================================================
   ZERO / MISSING LOGIC
========================================================== */
function isZeroPower(v) {
  return Number(v) === 0;
}


/* ==========================================================
   FILTER + SORT
========================================================== */
function filteredAndSortedMembers() {
  let arr = state.members.slice();
  const f = state.filter.toUpperCase();

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
        ((m.role || "") + " " + getMemberSquadLabel(m)).toUpperCase().includes(f)
      );
    }
  }

  const q = state.search.toLowerCase();
  if (q) {
    arr = arr.filter(m =>
      (m.name + " " + m.role + " " + getMemberSquadLabel(m))
        .toLowerCase()
        .includes(q)
    );
  }

  if (state.sort === "power-desc") {
    arr.sort((a, b) => Number(b.power) - Number(a.power));
  }
  else if (state.sort === "power-asc") {
    arr.sort((a, b) => Number(a.power) - Number(b.power));
  }
  else if (state.sort === "stars-desc") {
    arr.sort((a, b) => Number(b.stars) - Number(a.stars));
  }
  else if (state.sort === "stars-asc") {
    arr.sort((a, b) => Number(a.stars) - Number(b.stars));
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
   ADD / EDIT SYSTEM
========================================================== */

function openAddModal() {
  editingDocId = null;
  dom.modalTitle.textContent = "Add Member";

  dom.fieldName.value = "";
  dom.fieldRole.value = "";
  dom.fieldSquadPrimary.value = "TANK";
  dom.fieldSquadHybrid.checked = false;
  dom.hybridLabel.textContent = "No";

  dom.fieldPower.value = "";
  dom.fieldPowerType.value = "Precise";
  dom.fieldStars.value = 3;

  openModal();
}

function openEditModal(m) {
  editingDocId = m.id;

  dom.modalTitle.textContent = "Edit Member";
  dom.fieldName.value = m.name;
  dom.fieldRole.value = m.role;

  if (m.squadPrimary) {
    dom.fieldSquadPrimary.value = m.squadPrimary;
    dom.fieldSquadHybrid.checked = !!m.squadHybrid;
  } else {
    const parsed = parseOldSquad(m.squad);
    dom.fieldSquadPrimary.value = parsed.primary || "TANK";
    dom.fieldSquadHybrid.checked = parsed.hybrid;
  }

  dom.hybridLabel.textContent = dom.fieldSquadHybrid.checked ? "Yes" : "No";

  dom.fieldPower.value = m.power;
  dom.fieldPowerType.value = m.powerType || "Precise";
  dom.fieldStars.value = m.stars;

  openModal();
}


/* SAVE HANDLER */
dom.btnModalSave?.addEventListener("click", async () => {

  if (!dom.fieldName.value.trim()) {
    alert("Name is required.");
    return;
  }

  const primary = dom.fieldSquadPrimary.value;
  const hybrid = dom.fieldSquadHybrid.checked;

  const legacySquad = hybrid ? `${primary} HYBRID` : primary;

  const data = {
    name: dom.fieldName.value.trim(),
    role: dom.fieldRole.value.trim(),

    squadPrimary: primary,
    squadHybrid: hybrid,
    squad: legacySquad,

    power: cleanNumber(dom.fieldPower.value),
    powerType: dom.fieldPowerType.value,
    stars: Number(dom.fieldStars.value),
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
    console.error(err);
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
    console.error(err);
    alert("Delete failed.");
  }
}


/* ==========================================================
   CSV IMPORT / EXPORT
========================================================== */
dom.btnExport.addEventListener("click", () =>
  utilsExportCSV(state.members)
);

dom.btnImport.addEventListener("click", () =>
  dom.csvInput.click()
);

dom.csvInput?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    const imported = utilsParseCSV(evt.target.result);
    if (!confirm(`Replace with ${imported.length} rows?`)) return;

    for (const m of state.members) {
      await deleteDoc(doc(db, "members", m.id));
    }

    for (const m of imported) {
      const parsed = parseOldSquad(m.squad);
      const primary = parsed.primary || "TANK";
      const hybrid = parsed.hybrid;

      await addDoc(collection(db, "members"), {
        name: m.name,
        role: m.role,
        squadPrimary: primary,
        squadHybrid: hybrid,
        squad: hybrid ? `${primary} HYBRID` : primary,
        power: cleanNumber(m.power),
        powerType: m.powerType || "Precise",
        stars: Number(m.stars),
        lastUpdated: serverTimestamp()
      });
    }

    alert("Import complete.");
  };
  reader.readAsText(file);
});


/* ==========================================================
   SEARCH / FILTER / SORT EVENTS
========================================================== */
dom.searchInput.addEventListener("input", () => {
  state.search = dom.searchInput.value;
  render();
});

dom.filterButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    state.filter = btn.dataset.filter || "RESET";
    render();
  })
);

dom.sortButtons.forEach((btn) =>
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
  onSnapshot(qRef, (snap) => {
    state.members = snap.docs.map((d) =>
      normalizeMemberLocal({ id: d.id, ...d.data() })
    );
    render();
  });
}


/* ==========================================================
   INIT (ADMIN PROTECTED)
========================================================== */
function initAdminPanel(user) {
  state.currentAdminName = user.email || "Admin";

  subscribeMembers();
  subscribeAudit(dom.auditList);

  dom.btnLogout.addEventListener("click", async () => {
    await logout();
    window.location.href = "admin-login.html";
  });

  dom.btnAdd.addEventListener("click", openAddModal);
}


/* ==========================================================
   AUTH STATE
========================================================== */
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  initAdminPanel(user);
});
