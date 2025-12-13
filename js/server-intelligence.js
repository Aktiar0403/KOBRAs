console.log("✅ Server Intelligence JS loaded");

import { db, auth } from "./firebase-config.js";
import {
  collection,
  getDocs,
  addDoc,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* ===============================
   CONFIG
================================ */
const COLLECTION = "server_players";

/* ===============================
   STATE
================================ */
let allPlayers = [];
let filteredPlayers = [];

let activeWarzone = null;
let activeAlliance = null;
let searchQuery = "";

/* ===============================
   DOM
================================ */
const $ = id => document.getElementById(id);

const searchInput = $("searchInput");
const warzoneCards = $("warzoneCards");
const allianceCards = $("allianceCards");
const tableBody = $("tableBody");

const whaleCount = $("whaleCount");
const sharkCount = $("sharkCount");
const piranhaCount = $("piranhaCount");

const dominanceGrid = $("dominanceGrid");

const pasteData = $("pasteData");
const excelInput = $("excelInput");
const saveBtn = $("saveBtn");

/* ===============================
   AUTH GUARD (ADMIN ONLY)
================================ */
onAuthStateChanged(auth, user => {
  if (!user) {
    alert("Admin login required");
    window.location.href = "admin-login.html";
    return;
  }
  loadPlayers();
});

/* ===============================
   LOAD PLAYERS FROM FIRESTORE
================================ */
async function loadPlayers() {
  const snap = await getDocs(
    query(collection(db, COLLECTION), orderBy("power", "desc"))
  );

  allPlayers = snap.docs.map(d => normalizePlayer(d.data()));
  applyFilters();
}

/* ===============================
   NORMALIZE (CRITICAL)
================================ */
function normalizePlayer(p) {
  return {
    name: p.name || "Unnamed",
    alliance: p.alliance || "Unknown",
    warzone: p.warzone || "Unknown",
    power: Number(p.power || 0)
  };
}

/* ===============================
   FILTER PIPELINE
================================ */
function applyFilters() {
  filteredPlayers = allPlayers.filter(p => {
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery)) return false;
    if (activeWarzone && p.warzone !== activeWarzone) return false;
    if (activeAlliance && p.alliance !== activeAlliance) return false;
    return true;
  });

  renderTable();
  renderSegments();
  renderDominance();
}

/* ===============================
   TABLE
================================ */
function renderTable() {
  tableBody.innerHTML = "";

  filteredPlayers.forEach((p, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${p.name}</td>
      <td>${p.alliance}</td>
      <td>${p.warzone}</td>
      <td>${p.power.toLocaleString()}</td>
      <td>${powerCategory(p.power)}</td>
    `;
    tableBody.appendChild(tr);
  });
}

/* ===============================
   POWER SEGMENTS
================================ */
function renderSegments() {
  let whale = 0, shark = 0, piranha = 0;

  filteredPlayers.forEach(p => {
    if (p.power >= 180_000_000) whale++;
    else if (p.power >= 160_000_000) shark++;
    else if (p.power >= 140_000_000) piranha++;
  });

  whaleCount.textContent = whale;
  sharkCount.textContent = shark;
  piranhaCount.textContent = piranha;
}

function powerCategory(power) {
  if (power >= 180_000_000) return "Whale";
  if (power >= 160_000_000) return "Shark";
  if (power >= 140_000_000) return "Piranha";
  return "Normal";
}

/* ===============================
   WARZONE & ALLIANCE FILTER CARDS
================================ */
function buildFilterCards() {
  const warzones = [...new Set(allPlayers.map(p => p.warzone))];
  const alliances = [...new Set(allPlayers.map(p => p.alliance))];

  warzoneCards.innerHTML = "";
  allianceCards.innerHTML = "";

  warzones.forEach(wz => {
    const c = createFilterCard(wz, "warzone");
    warzoneCards.appendChild(c);
  });

  alliances.forEach(al => {
    const c = createFilterCard(al, "alliance");
    allianceCards.appendChild(c);
  });
}

function createFilterCard(label, type) {
  const div = document.createElement("div");
  div.className = "filter-card";
  div.textContent = label;

  div.onclick = () => {
    if (type === "warzone") {
      activeWarzone = activeWarzone === label ? null : label;
    } else {
      activeAlliance = activeAlliance === label ? null : label;
    }
    applyFilters();
  };

  return div;
}

/* ===============================
   ALLIANCE DOMINANCE %
================================ */
function renderDominance() {
  dominanceGrid.innerHTML = "";

  const map = {};

  filteredPlayers.forEach(p => {
    map[p.warzone] = map[p.warzone] || {};
    map[p.warzone][p.alliance] =
      (map[p.warzone][p.alliance] || 0) + p.power;
  });

  Object.entries(map).forEach(([wz, alliances]) => {
    const total = Object.values(alliances).reduce((a, b) => a + b, 0);

    Object.entries(alliances).forEach(([al, power]) => {
      const percent = total ? ((power / total) * 100).toFixed(1) : 0;

      const card = document.createElement("div");
      card.className = "dominance-card";
      card.innerHTML = `
        <strong>${wz}</strong><br>
        ${al}<br>
        ${percent}%
      `;
      dominanceGrid.appendChild(card);
    });
  });
}

/* ===============================
   SEARCH
================================ */
searchInput.addEventListener("input", e => {
  searchQuery = e.target.value.toLowerCase();
  applyFilters();
});

/* ===============================
   ADMIN IMPORT (PASTE / EXCEL)
================================ */
saveBtn.onclick = async () => {
  if (!pasteData.value.trim()) {
    alert("Paste data first");
    return;
  }

  const rows = pasteData.value.split("\n");

  for (const row of rows) {
    const parts = row.split("—").map(x => x.trim());
    if (parts.length < 4) continue;

    const power = Number(parts[3].replace(/[^\d]/g, ""));

    await addDoc(collection(db, COLLECTION), {
      name: parts[1] || "Unknown",
      alliance: parts[0] || "Unknown",
      warzone: parts[2] || "Unknown",
      power: power || 0
    });
  }

  alert("Data uploaded");
  pasteData.value = "";
  loadPlayers();
};

/* ===============================
   INIT
================================ */
loadPlayers().then(buildFilterCards);
