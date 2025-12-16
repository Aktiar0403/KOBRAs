/* ======================================================
   ALLIANCE SHOWDOWN — UI CONTROLLER
====================================================== */

import { db } from "./firebase-config.js";
import { collection, getDocs } from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { prepareAllianceData } from "./acis/acis-data.js";
import { processAlliance } from "./acis/acis-engine.js";
import { scoreAlliance } from "./acis/acis-scorer.js";
import { buildMatchupMatrix } from "./acis/acis-matchup.js";

/* =============================
   TOOLTIP DEFINITIONS
============================= */
const FACTOR_TOOLTIPS = {
  COMBAT_GAP:
    "Overall effective combat strength after ACIS weighting (power, stability, composition).",
  MEGA_WHALE:
    "Mega Whales disproportionately influence frontline combat and collapse dynamics.",
  WHALE:
    "Whales provide sustained frontline pressure and resilience.",
  STABILITY:
    "Low stability indicates imbalance, missing real fighters, or over-reliance on few players.",
  POWER_DISTRIBUTION:
    "Even power distribution reduces collapse risk when top players fall.",
  NON_COMPETITIVE:
    "Structurally non-competitive alliance with insufficient real actives."
};

/* =============================
   GLOBAL STATE
============================= */
let allScoredAlliances = [];
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
   INITIALIZE
============================= */
async function init() {
  console.log("🔍 Loading server players...");
  const players = await loadServerPlayers();

  const prepared = prepareAllianceData(players);
  allScoredAlliances = prepared.map(a =>
    scoreAlliance(processAlliance(a))
  );

  console.log("✅ Alliances ready:", allScoredAlliances.length);
  populateWarzones();
}

/* =============================
   POPULATE WARZONES
============================= */
function populateWarzones() {
  warzoneSelect.innerHTML =
    `<option value="">-- Select Warzone --</option>`;

  const warzones = [
    ...new Set(allScoredAlliances.map(a => Number(a.warzone)))
  ].sort((a, b) => a - b);

  warzones.forEach(wz => {
    const opt = document.createElement("option");
    opt.value = wz;
    opt.textContent = `Warzone ${wz}`;
    warzoneSelect.appendChild(opt);
  });
}

/* =============================
   WARZONE → ALLIANCE LIST
============================= */
warzoneSelect.addEventListener("change", () => {
  filteredListEl.innerHTML = "";

  const wz = Number(warzoneSelect.value);
  if (!wz) return;

  const alliances = allScoredAlliances
    .filter(a => Number(a.warzone) === wz)
    .sort((a, b) => b.acsAbsolute - a.acsAbsolute)
    .slice(0, 20); // HARD LIMIT

  alliances.forEach(a => {
    const item = document.createElement("div");
    item.className = "alliance-item";
    item.textContent = a.alliance;

    if (selectedAlliances.get(a.alliance) === a.warzone) {
      item.classList.add("selected");
    }

    item.onclick = () => toggleAllianceSelection(a, item);
    filteredListEl.appendChild(item);
  });
});

/* =============================
   TOGGLE ALLIANCE SELECTION
============================= */
function toggleAllianceSelection(a, el) {
  if (selectedAlliances.get(a.alliance) === a.warzone) {
    selectedAlliances.delete(a.alliance);
    el.classList.remove("selected");
  } else {
    if (selectedAlliances.size >= 8) return;
    selectedAlliances.set(a.alliance, a.warzone);
    el.classList.add("selected");
  }
  analyzeBtn.disabled = selectedAlliances.size < 2;
}

/* =============================
   ANALYZE SHOWDOWN
============================= */
analyzeBtn.addEventListener("click", () => {
  const selected = allScoredAlliances.filter(
    a => selectedAlliances.get(a.alliance) === a.warzone
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
  renderAllianceBlocks(window.__ACIS_RESULTS__.alliances);
  renderMatchups(window.__ACIS_RESULTS__.matchups);
}

/* =============================
   ALLIANCE CARDS
============================= */
function renderAllianceBlocks(alliances) {
  const container = document.getElementById("allianceBlocks");
  container.innerHTML = "";

  alliances.forEach(a => {
    const marquee = [...a.activePlayers]
      .filter(p => !p.assumed)
      .sort((x, y) => y.effectivePower - x.effectivePower)
      .slice(0, 5);

    const block = document.createElement("div");
    block.className = "alliance-block";

    block.innerHTML = `
      <h3>${a.alliance} <small>(WZ ${a.warzone})</small></h3>

      <div class="stats">
        <div>Active Power: ${formatPower(a.activePower)}</div>
        <div>Bench Power: ${formatPower(a.benchPower)}</div>
        <div>Combat Score: ${Math.round(a.acsAbsolute)}</div>
      </div>

      <div class="marquee">
        <h4>Marquee Players</h4>
        ${marquee.map(p => `
          <div class="marquee-player">
            <span>${p.name}</span>
            <span>${formatPower(p.totalPower)}</span>
          </div>
        `).join("")}
      </div>
    `;

    container.appendChild(block);
  });
}

/* =============================
   MATCHUP ANALYSIS
============================= */
function analyzeMatchup(m, alliances) {
  const A = alliances.find(x => x.alliance === m.a);
  const B = alliances.find(x => x.alliance === m.b);

  const winner = m.ratio >= 1 ? m.a : m.b;
  const loser  = winner === m.a ? m.b : m.a;
  const ratio  = m.ratio >= 1 ? m.ratio : 1 / m.ratio;

  const factors = [];

  if (ratio >= 1.3)
    factors.push({ text: `${Math.round((ratio - 1) * 100)}% combat advantage`, type: "COMBAT_GAP" });

  if ((A.tierCounts.MEGA_WHALE || 0) !== (B.tierCounts.MEGA_WHALE || 0))
    factors.push({ text: "Mega Whale advantage", type: "MEGA_WHALE" });

  if (B.stabilityFactor < 0.8)
    factors.push({ text: "Lower squad stability", type: "STABILITY" });

  return { winner, loser, ratio, factors };
}

/* =============================
   COLLAPSE INSIGHT
============================= */
function computeCollapseInsight(loser, winner, ratio) {
  const probability = Math.min(
    95,
    Math.max(
      5,
      Math.round(
        (1 - loser.stabilityFactor) * 60 +
        (1 - ratio) * 40
      )
    )
  );

  return {
    probability,
    narrative: `
${loser.alliance} looks stronger on paper, but is fragile.
Their power is concentrated in a few Mega Whales.
Once pressure is applied, ${loser.alliance} collapses faster than ${winner.alliance},
allowing ${winner.alliance} to control and win the engagement.
    `
  };
}

/* =============================
   MATCHUP RENDER
============================= */
function renderMatchups(matchups) {
  const container = document.getElementById("matchupMatrix");
  container.innerHTML = "<h2>Showdown Results</h2>";

  matchups.forEach(m => {
    const analysis = analyzeMatchup(m, window.__ACIS_RESULTS__.alliances);
    const loserObj = window.__ACIS_RESULTS__.alliances
      .find(a => a.alliance === analysis.loser);
    const winnerObj = window.__ACIS_RESULTS__.alliances
      .find(a => a.alliance === analysis.winner);

    const collapse = computeCollapseInsight(loserObj, winnerObj, analysis.ratio);

    const card = document.createElement("div");
    card.className = "matchup-card";

    card.innerHTML = `
      <div class="verdict">
        🏆 ${analysis.winner} &nbsp; | &nbsp; 💥 ${analysis.loser}
      </div>

      <div class="collapse-prob">
        Collapse Probability: <strong>${collapse.probability}%</strong>
      </div>

      <button class="collapse-toggle">
        Why ${analysis.loser} collapses ▾
      </button>

      <div class="collapse-panel hidden">
        <p>${collapse.narrative}</p>
        <ul>
          ${analysis.factors.map(f => `
            <li class="factor" data-tooltip="${FACTOR_TOOLTIPS[f.type]}">
              ${f.text}
            </li>
          `).join("")}
        </ul>
      </div>
    `;

    container.appendChild(card);
  });
}

/* =============================
   TOGGLE COLLAPSE PANELS
============================= */
document.addEventListener("click", e => {
  if (!e.target.classList.contains("collapse-toggle")) return;
  e.target.nextElementSibling.classList.toggle("hidden");
});

/* =============================
   HELPERS
============================= */
function formatPower(v) {
  return (v / 1e6).toFixed(1) + "M";
}

/* =============================
   START
============================= */
init();