/* ======================================================
   ALLIANCE SHOWDOWN — UI CONTROLLER
   ------------------------------------------------------
   - Warzone-scoped alliance picker
   - Cross-warzone selection allowed
   - Uses ACIS engine as black box
   - NO intelligence logic here
====================================================== */

import { db } from "./firebase-config.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { prepareAllianceData } from "./acis/acis-data.js";
import { processAlliance } from "./acis/acis-engine.js";
import { scoreAlliance } from "./acis/acis-scorer.js";
import { buildMatchupMatrix } from "./acis/acis-matchup.js";

/* =============================
   GLOBAL STATE (UI ONLY)
============================= */
let allScoredAlliances = [];

/**
 * Map<allianceName, warzone>
 * Allows same alliance tag in different warzones safely
 */
let selectedAlliances = new Map();

/* =============================
   DOM REFERENCES
============================= */
const warzoneSelect   = document.getElementById("warzoneSelect");
const filteredListEl  = document.getElementById("filteredAlliances");
const analyzeBtn      = document.getElementById("analyzeBtn");
const resultsSection  = document.getElementById("results");

/* =============================
   LOAD FIRESTORE DATA
============================= */
async function loadServerPlayers() {
  const snap = await getDocs(collection(db, "server_players"));
  return snap.docs.map(doc => doc.data());
}

/* =============================
   INITIALIZE PAGE
============================= */
async function init() {
  try {
    console.log("🔍 Loading server players...");

    const players = await loadServerPlayers();
    if (!players.length) {
      console.warn("No player data found");
      return;
    }

    // ACIS PIPELINE
    const prepared = prepareAllianceData(players);
    allScoredAlliances = prepared.map(a =>
      scoreAlliance(processAlliance(a))
    );

    console.log("✅ Alliances ready:", allScoredAlliances.length);

    populateWarzones();

  } catch (err) {
    console.error("Alliance Showdown init failed:", err);
  }
}

/* =============================
   POPULATE WARZONE DROPDOWN
============================= */
function populateWarzones() {
  warzoneSelect.innerHTML =
    `<option value="">-- Select Warzone --</option>`;

  const warzones = [
    ...new Set(allScoredAlliances.map(a => Number(a.warzone)))
  ]
    .filter(wz => !isNaN(wz))
    .sort((a, b) => a - b);

  warzones.forEach(wz => {
    const opt = document.createElement("option");
    opt.value = wz;
    opt.textContent = `Warzone ${wz}`;
    warzoneSelect.appendChild(opt);
  });
}

/* =============================
   WARZONE CHANGE → SHOW ALLIANCES
============================= */
warzoneSelect.addEventListener("change", () => {
  filteredListEl.innerHTML = "";

  const wz = parseInt(warzoneSelect.value, 10);
  if (!wz) return;

  const filtered = allScoredAlliances
    .filter(a => Number(a.warzone) === wz)
    .sort((a, b) => b.acsAbsolute - a.acsAbsolute)
    .slice(0, 20); // 🔒 HARD LIMIT

  filtered.forEach(a => {
    const item = document.createElement("div");
    item.className = "alliance-item";
    item.textContent = `${a.alliance}`;

    if (
      selectedAlliances.has(a.alliance) &&
      selectedAlliances.get(a.alliance) === a.warzone
    ) {
      item.classList.add("selected");
    }

    item.onclick = () => toggleAllianceSelection(a, item);
    filteredListEl.appendChild(item);
  });
});

/* =============================
   TOGGLE ALLIANCE SELECTION
============================= */
function toggleAllianceSelection(allianceObj, el) {
  const key = allianceObj.alliance;
  const wz  = allianceObj.warzone;

  if (
    selectedAlliances.has(key) &&
    selectedAlliances.get(key) === wz
  ) {
    selectedAlliances.delete(key);
    el.classList.remove("selected");
  } else {
    if (selectedAlliances.size >= 8) return;

    selectedAlliances.set(key, wz);
    el.classList.add("selected");
  }

  analyzeBtn.disabled = selectedAlliances.size < 2;
}

/* =============================
   ANALYZE SHOWDOWN
============================= */
analyzeBtn.addEventListener("click", () => {
  const selected = allScoredAlliances.filter(a =>
    selectedAlliances.has(a.alliance) &&
    selectedAlliances.get(a.alliance) === a.warzone
  );

  if (selected.length < 2) return;

  console.log(
    "⚔️ Analyzing alliances:",
    selected.map(a => `${a.alliance} (${a.warzone})`)
  );

  const matchups = buildMatchupMatrix(selected);

  window.__ACIS_RESULTS__ = {
    alliances: selected,
    matchups
  };

  resultsSection.classList.remove("hidden");
  renderResults();
});

/* =============================
   RENDER RESULTS
============================= */
function renderResults() {
  const { alliances, matchups } = window.__ACIS_RESULTS__;
  renderAllianceBlocks(alliances);
  renderMatchupMatrix(matchups);
}

/* =============================
   RENDER ALLIANCE BLOCKS
============================= */
function renderAllianceBlocks(alliances) {
  const container = document.getElementById("allianceBlocks");
  container.innerHTML = "";

  alliances.forEach(a => {
    const statusClass = a.isNCA
      ? "bad"
      : a.stabilityFactor < 0.8
        ? "warn"
        : "good";

    const statusText = a.isNCA
      ? "🔴 Non-Competitive"
      : a.stabilityFactor < 0.8
        ? "🟡 Fragile"
        : "🟢 Competitive";

    const block = document.createElement("div");
    block.className = "alliance-block";

    block.innerHTML = `
      <h3>${a.alliance} <small>(WZ ${a.warzone})</small></h3>
      <div class="status ${statusClass}">${statusText}</div>

      <div class="stats">
        <div><strong>Active Power:</strong> ${formatPower(a.activePower)}</div>
        <div><strong>Bench Power:</strong> ${formatPower(a.benchPower)}</div>
        <div><strong>Combat Score:</strong> ${Math.round(a.acsAbsolute)}</div>
      </div>

      <div class="tiers">
        ${renderTierCounts(a.tierCounts)}
      </div>
    `;

    container.appendChild(block);
  });
}

/* =============================
   RENDER MATCHUP MATRIX
============================= */
function renderMatchupMatrix(matchups) {
  const container = document.getElementById("matchupMatrix");
  container.innerHTML = "<h2>Matchups</h2>";

  matchups.forEach(m => {
    const row = document.createElement("div");
    row.className = "matchup-row";

    row.innerHTML = `
      <span>${m.a}</span>
      <span>vs</span>
      <span>${m.b}</span>
      <strong>${m.outcome}</strong>
    `;

    container.appendChild(row);
  });
}

/* =============================
   UI HELPERS
============================= */
function renderTierCounts(tiers) {
  return Object.entries(tiers)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `<span>${k}: ${v}</span>`)
    .join("");
}

function formatPower(val) {
  if (!val) return "0";
  return (val / 1e6).toFixed(1) + "M";
}

/* =============================
   START
============================= */
init();
