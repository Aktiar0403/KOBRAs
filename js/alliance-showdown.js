/* ======================================================
   KOBRA — ALLIANCE SHOWDOWN (CLEAN FINAL)
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
   GLOBAL STATE
============================= */
let ALL_ALLIANCES = [];
let SELECTED = new Map();

/* =============================
   DOM
============================= */
const warzoneSelect   = document.getElementById("warzoneSelect");
const allianceListEl = document.getElementById("allianceList");
const analyzeBtn     = document.getElementById("analyzeBtn");
const resultsEl      = document.getElementById("results");

/* =============================
   LOAD DATA
============================= */
async function loadServerPlayers() {
  const snap = await getDocs(collection(db, "server_players"));
  return snap.docs.map(d => d.data());
}

/* =============================
   INIT
============================= */
async function init() {
  console.log("🔍 Loading server players…");

  const players = await loadServerPlayers();
  if (!players.length) return;

  const prepared = prepareAllianceData(players);
  ALL_ALLIANCES = prepared.map(a => {
    const scored = scoreAlliance(processAlliance(a));
    scored.totalAlliancePower = computeTotalAlliancePower(scored);
    return scored;
  });

  console.log("✅ Alliances loaded:", ALL_ALLIANCES.length);
  populateWarzones();
}
init();

/* =============================
   WARZONE SELECTOR
============================= */
function populateWarzones() {
  warzoneSelect.innerHTML =
    `<option value="">Select Warzone</option>`;

  [...new Set(ALL_ALLIANCES.map(a => Number(a.warzone)))]
    .filter(Boolean)
    .sort((a, b) => a - b)
    .forEach(wz => {
      const opt = document.createElement("option");
      opt.value = wz;
      opt.textContent = `Warzone ${wz}`;
      warzoneSelect.appendChild(opt);
    });
}

/* =============================
   WARZONE → ALLIANCES
============================= */
warzoneSelect.addEventListener("change", () => {
  allianceListEl.innerHTML = "";
  const wz = Number(warzoneSelect.value);
  if (!wz) return;

  ALL_ALLIANCES
    .filter(a => Number(a.warzone) === wz)
    .sort((a, b) => b.acsAbsolute - a.acsAbsolute)
    .slice(0, 20)
    .forEach(a => {
      const row = document.createElement("div");
      row.className = "alliance-row";
      row.textContent = a.alliance;

      const key = `${a.alliance}|${a.warzone}`;
      if (SELECTED.has(key)) row.classList.add("selected");

      row.onclick = () => toggleAlliance(a, row);
      allianceListEl.appendChild(row);
    });
});

/* =============================
   TOGGLE SELECTION
============================= */
function toggleAlliance(a, el) {
  const key = `${a.alliance}|${a.warzone}`;

  if (SELECTED.has(key)) {
    SELECTED.delete(key);
    el.classList.remove("selected");
  } else {
    if (SELECTED.size >= 8) return;
    SELECTED.set(key, a);
    el.classList.add("selected");
  }

  analyzeBtn.disabled = SELECTED.size < 2;
}

/* =============================
   ANALYZE
============================= */
analyzeBtn.addEventListener("click", () => {
  const alliances = [...SELECTED.values()];
  if (alliances.length < 2) return;

  resultsEl.classList.remove("hidden");
  renderAllianceCards(alliances);
});

/* =============================
   ALLIANCE CARDS
============================= */
function renderAllianceCards(alliances) {
  const el = document.getElementById("allianceCards");
  el.innerHTML = "";

  alliances.forEach(a => {
    const marquee = [...a.activePlayers]
      .filter(p => !p.assumed)
      .sort((x, y) => y.firstSquadPower - x.firstSquadPower)
      .slice(0, 5);

    const card = document.createElement("div");
    card.className = "alliance-card";

    card.innerHTML = `
  <div class="alliance-intel ${a.isNCA ? "bad" : a.stabilityFactor < 0.8 ? "warn" : "good"}">

    <!-- TOP STATUS STRIP -->
    <div class="intel-strip"></div>

    <!-- TITLE -->
    <div class="intel-title">
      ${a.alliance} <span class="wz">(WZ-${a.warzone})</span>
    </div>

    <!-- META STATUS -->
    <div class="intel-meta">
      ${a.isNCA
        ? "Non-Competitive"
        : a.stabilityFactor < 0.8
          ? "Fragile"
          : "Competitive"}
    </div>

    <!-- PIE -->
    <div class="intel-pie">
      <canvas id="pie-${a.alliance}-${a.warzone}"></canvas>
    </div>

    <!-- COMBAT POWER -->
    <div class="combat-number">
      Combat Power: <strong>${formatBig(a.acsAbsolute)}</strong>
    </div>

    <!-- MARQUEE -->
    <div class="marquee">
      ${marquee.map((p, i) => `
        <div class="marquee-player">
          <span>${i + 1}. ${p.name}</span>
          <span>${formatPower(p.firstSquadPower)}</span>
        </div>
      `).join("")}
    </div>

    <!-- BARS -->
    <div class="intel-bars">
      <canvas id="bars-${a.alliance}-${a.warzone}"></canvas>
    </div>

  </div>
`;


    el.appendChild(card);

    setTimeout(() => {
      renderAllianceBars(a);
      renderAlliancePie(a);
    }, 0);
  });
}

/* =============================
   CHARTS
============================= */
function renderAllianceBars(a) {
  const ctx = document
    .getElementById(`bars-${a.alliance}-${a.warzone}`)
    .getContext("2d");

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Total", "Combat", "Frontline", "Depth", "Stability"],
      datasets: [{
        data: [
          normalizeTotalPower(a.totalAlliancePower),
          normalizeCombat(a.acsAbsolute),
          normalizeFSP(a.averageFirstSquadPower),
          normalizeDepth(a.benchPower / (a.activePower || 1)),
          normalizeStability(a.stabilityFactor)
        ],
        backgroundColor: [
          "#9ca3af",
          "#00ffc8",
          "#ff9f43",
          "#4dabf7",
          "#3ddc84"
        ]
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { min: 0, max: 100, ticks: { display: false } } }
    }
  });
}

function renderAlliancePie(a) {
  const ctx = document
    .getElementById(`pie-${a.alliance}-${a.warzone}`)
    .getContext("2d");

  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: Object.keys(a.tierCounts),
      datasets: [{
        data: Object.values(a.tierCounts)
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      cutout: "55%"
    }
  });
}

/* =============================
   HELPERS
============================= */
function computeTotalAlliancePower(a) {
  return a.activePlayers
    .filter(p => !p.assumed)
    .reduce((s, p) => s + p.totalPower, 0);
}
function formatBig(v) {
  if (!v) return "0";

  if (v >= 1e12) return (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9)  return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6)  return (v / 1e6).toFixed(1) + "M";

  return Math.round(v).toString();
}


const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const normalizeTotalPower = v => clamp(v / 2e10 * 100, 5, 100);
const normalizeCombat = v => clamp(v / 2e6 * 100, 5, 100);
const normalizeFSP = v => clamp(v / 1.2e8 * 100, 5, 100);
const normalizeDepth = v => clamp(v * 100, 5, 100);
const normalizeStability = v => clamp(v * 100, 5, 100);
const formatPower = v => (v / 1e6).toFixed(1) + "M";
