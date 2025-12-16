/* ======================================================
   ALLIANCE SHOWDOWN — STEP 5.2
   ------------------------------------------------------
   - Loads Firestore data
   - Runs ACIS pipeline
   - Prepares alliance list
   - NO matchup rendering yet
====================================================== */
import { buildMatchupMatrix } from "./acis/acis-matchup.js";

import { db } from "./firebase-config.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { prepareAllianceData } from "./acis/acis-data.js";
import { processAlliance } from "./acis/acis-engine.js";
import { scoreAlliance } from "./acis/acis-scorer.js";

/* =============================
   GLOBAL STATE (PAGE ONLY)
============================= */
let allScoredAlliances = [];
let selectedAlliances = new Set();

/* =============================
   DOM REFERENCES
============================= */
const warzoneSelect = document.getElementById("warzoneSelect");
const filteredListEl = document.getElementById("filteredAlliances");

const analyzeBtn = document.getElementById("analyzeBtn");

const resultsSection = document.getElementById("results");

/* =============================
   LOAD FIRESTORE DATA
============================= */
async function loadServerPlayers() {
  const snap = await getDocs(collection(db, "server_players"));
  return snap.docs.map(doc => doc.data());
}
function populateWarzones() {
  const warzones = [
    ...new Set(allScoredAlliances.map(a => a.warzone))
  ].sort((a, b) => a - b);

  warzones.forEach(wz => {
    const opt = document.createElement("option");
    opt.value = wz;
    opt.textContent = `Warzone ${wz}`;
    warzoneSelect.appendChild(opt);
  });
}
warzoneSelect.addEventListener("change", () => {
  selectedAlliances.clear();
  analyzeBtn.disabled = true;

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
    item.textContent = a.alliance;

    item.onclick = () => toggleAllianceSelection(a.alliance, item);

    filteredListEl.appendChild(item);
  });
});

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

    // STEP 2 — Prepare alliance data
    const prepared = prepareAllianceData(players);

    // STEP 3 — Process & score alliances
    allScoredAlliances = prepared.map(alliance =>
      scoreAlliance(processAlliance(alliance))
    );

    console.log("✅ Alliances ready:", allScoredAlliances.length);

    // ✅ NEW FLOW: populate only warzones
    populateWarzones();

  } catch (err) {
    console.error("Alliance Showdown init failed:", err);
  }
}



/* =============================
   TOGGLE SELECTION
============================= */
function toggleAllianceSelection(name, el) {
  if (selectedAlliances.has(name)) {
    selectedAlliances.delete(name);
    el.classList.remove("selected");
  } else {
    if (selectedAlliances.size >= 8) return;
    selectedAlliances.add(name);
    el.classList.add("selected");
  }

  analyzeBtn.disabled =
    selectedAlliances.size < 2 || selectedAlliances.size > 8;
}
/* =============================
   ANALYZE SHOWDOWN
============================= */
analyzeBtn.addEventListener("click", () => {
  const selected = allScoredAlliances.filter(a =>
    selectedAlliances.has(a.alliance)
  );

  if (selected.length < 2) return;

  console.log("⚔️ Analyzing alliances:", selected.map(a => a.alliance));

  const matchupResults = buildMatchupMatrix(selected);

  console.table(matchupResults);

  // Store globally for rendering step
  window.__ACIS_RESULTS__ = {
  alliances: selected,
  matchups: matchupResults
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
    const block = document.createElement("div");
    block.className = "alliance-block";

    const status = a.isNCA
      ? "🔴 Non-Competitive"
      : a.stabilityFactor < 0.8
        ? "🟡 Fragile"
        : "🟢 Competitive";

    block.innerHTML = `
      <h3>${a.alliance}</h3>
      <div class="status ${a.isNCA ? "bad" : a.stabilityFactor < 0.8 ? "warn" : "good"}">
    ${status}
        </div>


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
   UTIL HELPERS (UI ONLY)
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
   SEARCH FILTER
============================= */

/* =============================
   START
============================= */
init();
