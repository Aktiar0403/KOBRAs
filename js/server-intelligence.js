console.log("✅ Server Intelligence JS loaded");

import { db } from "./firebase-config.js";
import {
  collection,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =====================================================
   DOM REFERENCES
===================================================== */
const tableBody = document.getElementById("tableBody");

const nameSearch = document.getElementById("nameSearch");
const warzoneFilter = document.getElementById("warzoneFilter");
const allianceFilter = document.getElementById("allianceFilter");

const whaleEl = document.getElementById("whaleCount");
const sharkEl = document.getElementById("sharkCount");
const piranhaEl = document.getElementById("piranhaCount");
const totalCountEl = document.getElementById("totalCount");

/* Optional non-prominent import buttons */
const pasteBtn = document.getElementById("pasteBtn");
const excelBtn = document.getElementById("excelBtn");

/* =====================================================
   STATE
===================================================== */
let allPlayers = [];
let filteredPlayers = [];

let activeWarzone = "ALL";
let activeAlliance = "ALL";

/* =====================================================
   FIRESTORE: REALTIME LOAD
===================================================== */
const ref = collection(db, "server_players");
const q = query(ref, orderBy("totalPower", "desc"));

onSnapshot(q, snap => {
  allPlayers = snap.docs.map(d => normalizePlayer(d.data()));
  populateFilters();
  applyFilters();
});

/* =====================================================
   NORMALIZE DATA (VERY IMPORTANT)
===================================================== */
function normalizePlayer(p) {
  return {
    name: String(p.name || "-").trim(),
    alliance: String(p.alliance || "UNKNOWN").trim(),
    warzone: String(
      p.warzone || p.warZone || p.zone || p.server || "UNKNOWN"
    ).trim(),
    totalPower: Number(p.totalPower || p.power || 0)
  };
}

/* =====================================================
   FILTER EVENTS
===================================================== */
nameSearch.addEventListener("input", applyFilters);

warzoneFilter.addEventListener("change", e => {
  activeWarzone = e.target.value;
  applyFilters();
});

allianceFilter.addEventListener("change", e => {
  activeAlliance = e.target.value;
  applyFilters();
});

/* =====================================================
   APPLY FILTERS (SEARCH + DROPDOWNS)
===================================================== */
function applyFilters() {
  const q = nameSearch.value.trim().toLowerCase();

  filteredPlayers = allPlayers.filter(p => {
    if (activeWarzone !== "ALL" && p.warzone !== activeWarzone) return false;
    if (activeAlliance !== "ALL" && p.alliance !== activeAlliance) return false;
    if (q && !p.name.toLowerCase().includes(q)) return false;
    return true;
  });

  renderTable(filteredPlayers);
  updateStats(filteredPlayers);
}

/* =====================================================
   TABLE RENDER
===================================================== */
function renderTable(players) {
  tableBody.innerHTML = "";
  totalCountEl.textContent = players.length;

  players.forEach((p, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${p.name}</td>
      <td>${p.alliance}</td>
      <td>${p.warzone}</td>
      <td class="power">${formatPower(p.totalPower)}</td>
    `;
    tableBody.appendChild(tr);
  });
}

/* =====================================================
   WHALE / SHARK / PIRANHA STATS (FILTER AWARE)
===================================================== */
function updateStats(players) {
  let whales = 0;
  let sharks = 0;
  let piranhas = 0;

  players.forEach(p => {
    if (p.totalPower >= 180_000_000) whales++;
    else if (p.totalPower >= 160_000_000) sharks++;
    else if (p.totalPower >= 140_000_000) piranhas++;
  });

  whaleEl.textContent = whales;
  sharkEl.textContent = sharks;
  piranhaEl.textContent = piranhas;
}

/* =====================================================
   FILTER DROPDOWNS POPULATION
===================================================== */
function populateFilters() {
  fillSelect(warzoneFilter, allPlayers.map(p => p.warzone));
  fillSelect(allianceFilter, allPlayers.map(p => p.alliance));
}

function fillSelect(select, values) {
  const current = select.value || "ALL";
  const unique = [...new Set(values)]
    .filter(v => v && v !== "UNKNOWN")
    .sort();

  select.innerHTML = `<option value="ALL">All</option>`;
  unique.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });

  select.value = unique.includes(current) ? current : "ALL";
}

/* =====================================================
   IMPORT / PASTE (NON-PROMINENT, SAFE)
===================================================== */
if (pasteBtn) {
  pasteBtn.addEventListener("click", () => {
    const raw = prompt(
      "Paste data format:\nRank [Alliance] Name — Warzone — Power"
    );
    if (!raw) return;
    alert("Paste received. Parser can be attached next.");
  });
}

if (excelBtn) {
  excelBtn.addEventListener("click", () => {
    alert("Excel import hook ready (parser pending).");
  });
}

/* =====================================================
   HELPERS
===================================================== */
function formatPower(v) {
  if (!v) return "-";
  return (v / 1_000_000).toFixed(1) + "M";
}
