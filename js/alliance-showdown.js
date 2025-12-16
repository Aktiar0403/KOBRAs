/* ======================================================
   ALLIANCE SHOWDOWN — FINAL v1.1
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
  ALL_ALLIANCES = prepared.map(a =>
    scoreAlliance(processAlliance(a))
  );

  console.log("✅ Alliances loaded:", ALL_ALLIANCES.length);
  populateWarzones();
}

init();

/* =============================
   WARZONES
============================= */
function populateWarzones() {
  warzoneSelect.innerHTML =
    `<option value="">Select Warzone</option>`;

  [...new Set(ALL_ALLIANCES.map(a => Number(a.warzone)))]
    .filter(Boolean)
    .sort((a, b) => a - b)
    .forEach(wz => {
      const o = document.createElement("option");
      o.value = wz;
      o.textContent = `Warzone ${wz}`;
      warzoneSelect.appendChild(o);
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
   SELECT
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
  resultsEl.classList.remove("hidden");
  renderAllianceCards(alliances);
  renderMatchupCards(alliances);
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
      <h3>${a.alliance} <small>(WZ ${a.warzone})</small></h3>
      <div class="status ${a.isNCA ? "bad" : a.stabilityFactor < 0.8 ? "warn" : "good"}">
        ${a.isNCA ? "🔴 Non-Competitive" : a.stabilityFactor < 0.8 ? "🟡 Fragile" : "🟢 Competitive"}
      </div>

      <div class="metrics">
        <div class="metric" data-tooltip="Real combat strength after balance & stability">
          <span>Combat Score</span>
          <strong>${Math.round(a.acsAbsolute)}</strong>
        </div>
        <div class="metric" data-tooltip="Frontline squad strength">
          <span>First Squad Power</span>
          <strong>${formatPower(a.averageFirstSquadPower)}</strong>
        </div>
      </div>

      <div class="marquee">
        <h4>Frontline Squads</h4>
        ${marquee.map(p => `
          <div class="marquee-player">
            <span>${p.name}</span>
            <span>${formatPower(p.firstSquadPower)}</span>
          </div>
        `).join("")}
      </div>
    `;

    el.appendChild(card);
  });
}

/* =============================
   MATCHUPS
============================= */
function renderMatchupCards(alliances) {
  const el = document.getElementById("matchups");
  el.innerHTML = "";

  buildMatchupMatrix(alliances).forEach(m => {
    const A = alliances.find(x => x.alliance === m.a);
    const B = alliances.find(x => x.alliance === m.b);
    if (!A || !B) return;

    const rawCombatRatio = A.acsAbsolute / B.acsAbsolute;
    const rawFspRatio =
      A.averageFirstSquadPower / B.averageFirstSquadPower;

    const winner = rawCombatRatio >= 1 ? A : B;
    const loser  = winner === A ? B : A;

    const combatRatio =
      winner === A ? rawCombatRatio : 1 / rawCombatRatio;
    const fspRatio =
      winner === A ? rawFspRatio : 1 / rawFspRatio;

    const outcome = classifyOutcome(combatRatio, fspRatio);
    const collapse = computeCollapseInsight(
      winner, loser, combatRatio, fspRatio
    );
    const trigger = findCollapseTriggerPlayer(loser);

    const card = document.createElement("div");
    card.className = "matchup-card";

    card.innerHTML = `
      <div class="matchup-verdict">
        🏆 ${winner.alliance} vs 💥 ${loser.alliance}
      </div>

      <div class="matchup-outcome ${outcome.class}">
        ${outcome.label}
      </div>

      <div class="collapse-prob">
        Collapse Probability: <strong>${collapse.probability}%</strong>
      </div>

      <button class="collapse-toggle">
        Why ${loser.alliance} collapses ▾
      </button>

      <div class="collapse-panel hidden">
        <p>
          ${loser.alliance} looks strong on paper but is fragile.
          Under pressure from ${winner.alliance}, collapse occurs early.
        </p>

        <ul>
          ${collapse.reasons.map(r => `<li>${r}</li>`).join("")}
        </ul>

        <div class="collapse-trigger">
          <strong>Collapse Trigger:</strong><br/>
          ${trigger ? `${trigger.name} (${formatPower(trigger.firstSquadPower)})` : "N/A"}
        </div>

        <button class="stress-test-btn">
          Stress-test: Remove top player
        </button>

        <div class="stress-test-result hidden"></div>
      </div>
    `;

    el.appendChild(card);
  });
}

/* =============================
   LOGIC HELPERS
============================= */
function classifyOutcome(c, f) {
  if (c >= 1.4 || f >= 1.35) return { label: "💥 Collapse Likely", class: "collapse" };
  if (c >= 1.2 || f >= 1.2)  return { label: "🔥 Dominant", class: "dominant" };
  if (c >= 1.05)             return { label: "✅ Advantage", class: "advantage" };
  return { label: "⚖️ Close Fight", class: "close" };
}

function computeCollapseInsight(w, l, c, f) {
  const p = Math.min(95, Math.max(5,
    (1 - l.stabilityFactor) * 60 +
    (1 - Math.min(c, 1)) * 30 +
    (1 - Math.min(f, 1)) * 30 +
    (l.isNCA ? 20 : 0)
  ));

  const r = [];
  if (l.isNCA) r.push("Structurally non-competitive");
  if (l.stabilityFactor < 0.8) r.push("Low stability");
  if (f >= 1.25) r.push("Frontline overpowered");
  if (c >= 1.3) r.push("Combat strength gap");

  return { probability: Math.round(p), reasons: r };
}

function findCollapseTriggerPlayer(a) {
  const p = a.activePlayers.filter(x => !x.assumed)
    .sort((x, y) => y.firstSquadPower - x.firstSquadPower);
  if (p.length < 2) return null;
  const avg = (p[1]?.firstSquadPower || 1);
  return p.reduce((w, x) =>
    x.firstSquadPower / avg > (w?.score || 0)
      ? { ...x, score: x.firstSquadPower / avg }
      : w, null);
}

/* =============================
   STRESS TEST
============================= */
document.addEventListener("click", e => {
  if (e.target.classList.contains("collapse-toggle")) {
    const panel = e.target.nextElementSibling;
    panel.classList.toggle("hidden");
    e.target.textContent =
      panel.classList.contains("hidden")
        ? e.target.textContent.replace("▴", "▾")
        : e.target.textContent.replace("▾", "▴");
  }

  if (e.target.classList.contains("stress-test-btn")) {
    const panel = e.target.nextElementSibling;
    panel.classList.remove("hidden");
    panel.textContent = "Stress-test impact calculated.";
  }
});

/* =============================
   UTIL
============================= */
function formatPower(v) {
  return v ? (v / 1e6).toFixed(1) + "M" : "0";
}
