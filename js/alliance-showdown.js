/* ======================================================
   ALLIANCE SHOWDOWN — v0.1 (FROM SCRATCH)
   ------------------------------------------------------
   Phase 0:
   - Load ACIS alliance data
   - Warzone filter
   - Alliance selection (cross-warzone)
   - Analyze trigger
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
let ALL_ALLIANCES = [];          // all scored alliances
let SELECTED = new Map();        // key: alliance|warzone

/* =============================
   DOM REFERENCES
============================= */
const warzoneSelect   = document.getElementById("warzoneSelect");
const allianceListEl = document.getElementById("allianceList");
const analyzeBtn     = document.getElementById("analyzeBtn");
const resultsEl      = document.getElementById("results");

/* =============================
   LOAD FIRESTORE PLAYERS
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
  if (!players.length) {
    console.warn("No players found");
    return;
  }

  // ACIS PIPELINE
  const prepared = prepareAllianceData(players);
  ALL_ALLIANCES = prepared.map(a =>
    scoreAlliance(processAlliance(a))
  );

  console.log("✅ Alliances loaded:", ALL_ALLIANCES.length);

  populateWarzones();
}

init();

/* =============================
   WARZONE DROPDOWN
============================= */
function populateWarzones() {
  warzoneSelect.innerHTML =
    `<option value="">Select Warzone</option>`;

  const warzones = [
    ...new Set(ALL_ALLIANCES.map(a => Number(a.warzone)))
  ]
    .filter(Boolean)
    .sort((a, b) => a - b);

  warzones.forEach(wz => {
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

  const alliances = ALL_ALLIANCES
    .filter(a => Number(a.warzone) === wz)
    .sort((a, b) => b.acsAbsolute - a.acsAbsolute)
    .slice(0, 20); // HARD LIMIT

  alliances.forEach(a => {
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
   TOGGLE ALLIANCE
============================= */
function toggleAlliance(alliance, el) {
  const key = `${alliance.alliance}|${alliance.warzone}`;

  if (SELECTED.has(key)) {
    SELECTED.delete(key);
    el.classList.remove("selected");
  } else {
    if (SELECTED.size >= 8) return;
    SELECTED.set(key, alliance);
    el.classList.add("selected");
  }

  analyzeBtn.disabled = SELECTED.size < 2;
}

/* =============================
   ANALYZE BUTTON
============================= */
analyzeBtn.addEventListener("click", () => {
  const selectedAlliances = [...SELECTED.values()];
  if (selectedAlliances.length < 2) return;

  resultsEl.classList.remove("hidden");
  renderAllianceCards(selectedAlliances);
    renderMatchupCards(selectedAlliances);
  });

  function renderAllianceCards(alliances) {
  const container = document.getElementById("allianceCards");
  container.innerHTML = "";

  alliances.forEach(a => {
    const card = document.createElement("div");
    card.className = "alliance-card";

    const status = getAllianceStatus(a);
  const marqueePlayers = [...a.activePlayers]
  .filter(p => !p.assumed)
  .sort((x, y) => y.firstSquadPower - x.firstSquadPower)
  .slice(0, 5);

    card.innerHTML = `
      <h3>
        ${a.alliance}
        <small>(WZ ${a.warzone})</small>
      </h3>

      <div class="status ${status.class}">
        ${status.label}
      </div>

      <div class="metrics">
  <div class="metric"
       data-tooltip="Combat Score shows how strong an alliance actually is in a real fight. It adjusts total power by player quality, balance, and collapse risk. Higher score means better survivability.">
    <span>Combat Score</span>
    <strong>${Math.round(a.acsAbsolute).toLocaleString()}</strong>
  </div>

  <div class="metric"
       data-tooltip="First Squad Power estimates real frontline strength. Only the first squad fights initially. One very strong squad can overpower multiple weaker squads.">
    <span>First Squad Power (avg)</span>
    <strong>${formatPower(a.averageFirstSquadPower)}</strong>
  </div>
  </div>

  <div class="marquee">
  <h4>Frontline Squads</h4>

  ${marqueePlayers.map(p => `
    <div class="marquee-player">
      <span class="name">${p.name}</span>
      <span class="power">
        ${formatPower(p.firstSquadPower)}
      </span>
    </div>
  `).join("")}
    </div>

      <div class="sub-metrics">
        <div>Active Power: ${formatPower(a.activePower)}</div>
        <div>Bench Power: ${formatPower(a.benchPower)}</div>
      </div>
    `;

    container.appendChild(card);
  });
}
function renderMatchupCards(alliances) {
  const container = document.getElementById("matchups");
  const collapse = computeCollapseInsight(
  winner,
  loser,
  combatRatio,
  fspRatio
);

card.innerHTML = `
  <div class="matchup-verdict">
    🏆 ${winner.alliance}
    <span class="vs">vs</span>
    💥 ${loser.alliance}
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
      ${loser.alliance} looks stronger on paper, but is fragile.
      Their power is concentrated in fewer frontline squads.
      Under pressure, ${loser.alliance} collapses faster than
      ${winner.alliance}, allowing ${winner.alliance} to control the fight.
    </p>
    <div class="collapse-trigger">
  <strong>Collapse Trigger:</strong><br/>
  ${collapseTrigger
    ? `${collapseTrigger.name}
       (${formatPower(collapseTrigger.firstSquadPower)} frontline)`
    : "Insufficient data"}
</div>


    <ul>
      ${collapse.reasons.map(r => `<li>${r}</li>`).join("")}
    </ul>
  </div>
`;

const collapseTrigger =
  findCollapseTriggerPlayer(loser);

  const matchups = buildMatchupMatrix(alliances);

  matchups.forEach(m => {
    const A = alliances.find(a => a.alliance === m.a);
    const B = alliances.find(a => a.alliance === m.b);

    if (!A || !B) return;

    const combatRatio = A.acsAbsolute / B.acsAbsolute;
    const fspRatio =
      A.averageFirstSquadPower / B.averageFirstSquadPower;

    const winner =
      combatRatio >= 1 ? A : B;
    const loser =
      winner === A ? B : A;

    const outcome = classifyOutcome(
      combatRatio,
      fspRatio
    );

    const reason = buildKeyReason(
      winner,
      loser,
      combatRatio,
      fspRatio
    );

    const card = document.createElement("div");
    card.className = "matchup-card";

    card.innerHTML = `
      <div class="matchup-verdict">
        🏆 ${winner.alliance}
        <span class="vs">vs</span>
        💥 ${loser.alliance}
      </div>

      <div class="matchup-outcome ${outcome.class}">
        ${outcome.label}
      </div>

      <div class="matchup-reason">
        ${reason}
      </div>
    `;

    container.appendChild(card);
  });
}

function getAllianceStatus(a) {
  if (a.isNCA) {
    return {
      label: "🔴 Non-Competitive",
      class: "bad"
    };
  }

  if (a.stabilityFactor < 0.8) {
    return {
      label: "🟡 Fragile",
      class: "warn"
    };
  }

  return {
    label: "🟢 Competitive",
    class: "good"
  };
}
function formatPower(val) {
  if (!val) return "0";
  return (val / 1e6).toFixed(1) + "M";
}
function classifyOutcome(combatRatio, fspRatio) {
  if (combatRatio >= 1.4 || fspRatio >= 1.35) {
    return { label: "💥 Collapse Likely", class: "collapse" };
  }

  if (combatRatio >= 1.2 || fspRatio >= 1.2) {
    return { label: "🔥 Dominant Win", class: "dominant" };
  }

  if (combatRatio >= 1.05) {
    return { label: "✅ Advantage", class: "advantage" };
  }

  return { label: "⚖️ Close Fight", class: "close" };
}
function buildKeyReason(winner, loser, combatRatio, fspRatio) {
  if (fspRatio >= 1.35) {
    return `
      Stronger frontline squads
      (${formatPower(winner.averageFirstSquadPower)}
      vs ${formatPower(loser.averageFirstSquadPower)})
      overwhelm the opponent early.
    `;
  }

  if (combatRatio >= 1.3) {
    return `
      Higher overall combat strength and stability
      cause the opponent to break under pressure.
    `;
  }

  return `
    Slight combat advantage with no clear
    frontline dominance.
  `;
}
function computeCollapseInsight(winner, loser, combatRatio, fspRatio) {
  const probability = Math.min(
    95,
    Math.max(
      5,
      Math.round(
        (1 - loser.stabilityFactor) * 60 +
        (1 - Math.min(combatRatio, 1)) * 30 +
        (1 - Math.min(fspRatio, 1)) * 30 +
        (loser.isNCA ? 20 : 0)
      )
    )
  );

  const reasons = [];

  if (loser.isNCA) {
    reasons.push("Structurally non-competitive squad");
  }

  if (loser.stabilityFactor < 0.8) {
    reasons.push("Low squad stability and imbalance");
  }

  if (fspRatio >= 1.25) {
    reasons.push("Opponent fields much stronger frontline squads");
  }

  if (combatRatio >= 1.3) {
    reasons.push("Overall combat strength gap");
  }

  return { probability, reasons };
}
function findCollapseTriggerPlayer(alliance) {
  const realPlayers = alliance.activePlayers
    .filter(p => !p.assumed);

  if (realPlayers.length < 3) return null;

  const sorted = [...realPlayers]
    .sort((a, b) => b.firstSquadPower - a.firstSquadPower);

  const top3Avg =
    (sorted[1]?.firstSquadPower + sorted[2]?.firstSquadPower) / 2 || 1;

  let worst = null;
  let worstScore = 0;

  realPlayers.forEach(p => {
    const exposure =
      p.firstSquadPower / alliance.activeFirstSquadPower;

    const irreplaceable =
      p.firstSquadPower / top3Avg;

    const fragility =
      1 + (1 - alliance.stabilityFactor);

    const score =
      exposure * irreplaceable * fragility;

    if (score > worstScore) {
      worstScore = score;
      worst = p;
    }
  });

  return worst;
}
function stressTestAlliance(alliance) {
  const realPlayers = alliance.activePlayers
    .filter(p => !p.assumed)
    .sort((a, b) => b.firstSquadPower - a.firstSquadPower);

  if (realPlayers.length < 2) return null;

  const removed = realPlayers[0];
  const remaining = realPlayers.slice(1);

  const newActiveFSP =
    remaining.reduce((s, p) => s + p.firstSquadPower, 0);

  const newAvgFSP =
    remaining.length
      ? newActiveFSP / remaining.length
      : 0;

  // Approximate combat score impact
  const powerLossRatio =
    removed.firstSquadPower / alliance.activeFirstSquadPower;

  const newCombatScore =
    alliance.acsAbsolute * (1 - powerLossRatio * 0.9);

  return {
    removedPlayer: removed,
    newAverageFSP: newAvgFSP,
    newCombatScore,
    powerLossRatio
  };
}
document.addEventListener("click", e => {
  if (!e.target.classList.contains("stress-test-btn")) return;

  const card = e.target.closest(".matchup-card");
  const loserName =
    card.querySelector(".collapse-toggle")
        .textContent
        .replace("Why ", "")
        .replace(" collapses ▾", "")
        .replace(" collapses ▴", "");

  const loser = window.__ACIS_RESULTS__.alliances
    .find(a => a.alliance === loserName);

  const resultEl =
    e.target.nextElementSibling;

  const test = stressTestAlliance(loser);
  if (!test) {
    resultEl.textContent = "Stress test unavailable.";
    resultEl.classList.remove("hidden");
    return;
  }

  resultEl.innerHTML = `
    <strong>After removing ${test.removedPlayer.name}:</strong>
    <ul>
      <li>
        Avg First Squad Power →
        ${formatPower(test.newAverageFSP)}
      </li>
      <li>
        Combat Score →
        ${Math.round(test.newCombatScore).toLocaleString()}
      </li>
      <li>
        Frontline power loss →
        ${(test.powerLossRatio * 100).toFixed(0)}%
      </li>
    </ul>
  `;

  resultEl.classList.remove("hidden");
});

document.addEventListener("click", e => {
  if (!e.target.classList.contains("collapse-toggle")) return;

  const panel = e.target.nextElementSibling;
  panel.classList.toggle("hidden");

  e.target.textContent = panel.classList.contains("hidden")
    ? e.target.textContent.replace("▴", "▾")
    : e.target.textContent.replace("▾", "▴");
});
