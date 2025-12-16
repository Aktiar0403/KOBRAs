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
const FACTOR_TOOLTIPS = {
  COMBAT_GAP: `
Higher overall fighting strength after applying:
• Active vs bench weighting
• Composition quality
• Stability penalties
A large gap usually results in dominance or collapse.
`,

  MEGA_WHALE: `
Mega Whales are top-tier players with extreme power.
They disproportionately influence frontline battles
and swing outcomes even against larger squads.
`,

  WHALE: `
Whales form the backbone of an alliance.
More whales usually means stronger sustained combat
and better resistance to early losses.
`,

  STABILITY: `
Stability reflects squad completeness and balance.
Low stability indicates:
• Missing active players
• Overdependence on few players
• Assumed (Plankton) fillers
Unstable squads collapse faster.
`,

  POWER_DISTRIBUTION: `
Better power distribution means strength is spread
across many players instead of concentrated in a few.
This reduces collapse risk if top players fall.
`,

  NON_COMPETITIVE: `
Non-Competitive Alliances lack sufficient
real active players or rely heavily on assumed power.
They are structurally unable to sustain combat.
`
};

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
    const marqueePlayers = [...a.activePlayers]
  .filter(p => !p.assumed)
  .sort((x, y) => y.effectivePower - x.effectivePower)
  .slice(0, 5);
    block.innerHTML = `
      <h3>${a.alliance} <small>(WZ ${a.warzone})</small></h3>
      <div class="status ${statusClass}">${statusText}</div>

      <div class="stats">
        <div><strong>Active Power:</strong> ${formatPower(a.activePower)}</div>
        <div><strong>Bench Power:</strong> ${formatPower(a.benchPower)}</div>
        <div><strong>Combat Score:</strong> ${Math.round(a.acsAbsolute)}</div>
      </div>
      <div class="marquee">
  <h4>Marquee Players</h4>
  ${marqueePlayers.map(p => `
    <div class="marquee-player">
      <span class="name">${p.name}</span>
      <span class="power">${formatPower(p.totalPower)}</span>
    </div>
  `).join("")}
</div>


      <div class="tiers">
        ${renderTierCounts(a.tierCounts)}
      </div>
    `;

    container.appendChild(block);
  });
}
function analyzeMatchup(m, alliances) {
  const A = alliances.find(x => x.alliance === m.a);
  const B = alliances.find(x => x.alliance === m.b);

  const factors = [];

  // 1️⃣ Combat score gap
  const pct = ((m.ratio - 1) * 100).toFixed(0);
  if (m.ratio >= 1.5) {
    factors.push({
      text: `+${pct}% higher combat score`,
      weight: 5
    });
  } else if (m.ratio >= 1.2) {
    factors.push({
      text: `+${pct}% combat score advantage`,
      weight: 4
    });
  }

  // 2️⃣ Tier advantage
  if ((A.tierCounts.MEGA_WHALE || 0) > (B.tierCounts.MEGA_WHALE || 0)) {
    factors.push({
      text: "More Mega Whales",
      weight: 4
    });
  } else if ((A.tierCounts.WHALE || 0) > (B.tierCounts.WHALE || 0)) {
    factors.push({
      text: "Stronger Whale presence",
      weight: 3
    });
  }

  // 3️⃣ Stability & collapse risk
  if (B.isNCA) {
    factors.push({
      text: `${B.alliance} is structurally non-competitive`,
      weight: 5
    });
  } else if (B.stabilityFactor < 0.75) {
    factors.push({
      text: `${B.alliance} has unstable squad composition`,
      weight: 4
    });
  }

  // 4️⃣ Power concentration
  if (A.stabilityFactor > B.stabilityFactor + 0.15) {
    factors.push({
      text: "Better power distribution",
      weight: 3
    });
  }

  // Sort by importance
  factors.sort((a, b) => b.weight - a.weight);

  return {
    winner: m.outcome.includes("A")
      ? m.a
      : m.ratio >= 1
        ? m.a
        : m.b,
    loser: m.ratio >= 1 ? m.b : m.a,
    outcome: m.outcome,
    ratio: m.ratio,
    factors: factors.slice(0, 4)
  };
}


/* =============================
   RENDER MATCHUP MATRIX
============================= */
function renderMatchupMatrix(matchups) {
  const container = document.getElementById("matchupMatrix");
  container.innerHTML = "<h2>Showdown Results</h2>";

  matchups.forEach(m => {
    const analysis = analyzeMatchup(
      m,
      window.__ACIS_RESULTS__.alliances
    );

    const card = document.createElement("div");
    card.className = "matchup-card";

    card.innerHTML = `
      <div class="verdict">
        <div class="winner">🏆 ${analysis.winner}</div>
        <div class="loser">
          💥 ${analysis.loser}
          ${analysis.outcome.includes("Collapse") ? "(Collapse Likely)" : ""}
        </div>
      </div>

      <div class="strength">
        Outcome Strength: <strong>${analysis.outcome}</strong>
      </div>

      <ul class="factors">
        ${analysis.factors.map(f => `
  <li class="factor"
      data-tooltip="${FACTOR_TOOLTIPS[f.type]?.trim()}">
    ${f.text}
  </li>
`).join("")}

      </ul>

      <div class="metrics">
        Combat Ratio: ${analysis.ratio.toFixed(2)}×
      </div>
    `;

    container.appendChild(card);
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
