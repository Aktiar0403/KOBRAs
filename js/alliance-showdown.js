/* ======================================================
   KOBRA — ALLIANCE SHOWDOWN (FULL, FINAL)
   ------------------------------------------------------
   Includes:
   - Warzone filtering
   - Cross-warzone alliance selection
   - Alliance cards
   - Combat Score + FSP
   - Marquee players
   - Matchups
   - Collapse probability
   - Collapse explanation
   - Collapse trigger player
   - Stress-test (remove top player)
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
function computeTotalAlliancePower(alliance) {
  return alliance.activePlayers
    .filter(p => !p.assumed)
    .reduce((sum, p) => sum + p.totalPower, 0);
}
a.totalAlliancePower = computeTotalAlliancePower(a);

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
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function pct(v) {
  return Math.round(v * 100);
}

/* =============================
   ANALYZE
============================= */
analyzeBtn.addEventListener("click", () => {
  const alliances = [...SELECTED.values()];
  if (alliances.length < 2) return;

  resultsEl.classList.remove("hidden");

  renderAllianceCards(alliances);
  renderMatchupCards(alliances);

  const matchups = buildMatchupMatrix(alliances);
  //renderCharts(alliances);
  //renderMatchupCharts(matchups, alliances);
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

      <div class="alliance-intel">

  <!-- PIE CHART (TOP RIGHT) -->
  <div class="intel-pie">
    <canvas id="pie-${a.alliance}-${a.warzone}"></canvas>
  </div>

  <!-- MARQUEE PLAYERS (FLOW AROUND PIE) -->
  <div class="marquee">
    ${marqueePlayers.map(p => `
      <div class="marquee-player">
        <span>${p.name}</span>
        <span>${formatPower(p.firstSquadPower)}</span>
      </div>
    `).join("")}
  </div>

  <!-- COMBINED BAR CHART -->
  <div class="intel-bars">
    <canvas id="bars-${a.alliance}-${a.warzone}"></canvas>
  </div>

</div>

    `;
setTimeout(() => {
  renderPowerChart(a);
  renderStabilityChart(a);
  renderCompositionChart(a);
  renderFrontlineChart(a);
}, 0);

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
          ${loser.alliance} appears strong on paper,
          but is structurally fragile.
          Under pressure from ${winner.alliance},
          collapse occurs faster than expected.
        </p>

        <ul>
          ${collapse.reasons.map(r => `<li>${r}</li>`).join("")}
        </ul>

        <div class="collapse-trigger">
          <strong>Collapse Trigger:</strong><br/>
          ${trigger
            ? `${trigger.name} (${formatPower(trigger.firstSquadPower)} frontline)`
            : "Insufficient data"}
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
  if (c >= 1.4 || f >= 1.35)
    return { label: "💥 Collapse Likely", class: "collapse" };
  if (c >= 1.2 || f >= 1.2)
    return { label: "🔥 Dominant", class: "dominant" };
  if (c >= 1.05)
    return { label: "✅ Advantage", class: "advantage" };
  return { label: "⚖️ Close Fight", class: "close" };
}

function computeCollapseInsight(w, l, c, f) {
  const probability = Math.min(
    95,
    Math.max(
      5,
      Math.round(
        (1 - l.stabilityFactor) * 60 +
        (1 - Math.min(c, 1)) * 30 +
        (1 - Math.min(f, 1)) * 30 +
        (l.isNCA ? 20 : 0)
      )
    )
  );

  const reasons = [];
  if (l.isNCA) reasons.push("Structurally non-competitive");
  if (l.stabilityFactor < 0.8) reasons.push("Low squad stability");
  if (f >= 1.25) reasons.push("Frontline severely outmatched");
  if (c >= 1.3) reasons.push("Overall combat power gap");

  return { probability, reasons };
}

function findCollapseTriggerPlayer(a) {
  const real = a.activePlayers
    .filter(p => !p.assumed)
    .sort((x, y) => y.firstSquadPower - x.firstSquadPower);

  if (real.length < 2) return null;

  const backupAvg =
    (real[1]?.firstSquadPower || 1);

  let worst = null;
  let worstScore = 0;

  real.forEach(p => {
    const score =
      (p.firstSquadPower / backupAvg) *
      (1 + (1 - a.stabilityFactor));

    if (score > worstScore) {
      worstScore = score;
      worst = p;
    }
  });

  return worst;
}
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
          "#00ffc8",
          "#ff9f43",
          "#4dabf7",
          "#3ddc84"
        ]
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const i = ctx.dataIndex;
      if (i === 0) return `Total Power: ${formatBig(a.totalAlliancePower)} (raw size)`;
      if (i === 1) return `Combat Score: ${formatBig(a.acsAbsolute)} (effective)`;
      if (i === 2) return `Frontline: ${formatPower(a.averageFirstSquadPower)}`;
      if (i === 3) return `Depth: ${Math.round((a.benchPower / a.activePower) * 100)}%`;
      if (i === 4) return `Stability: ${Math.round(a.stabilityFactor * 100)}%`;
            }
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: { display: false }
        }
      }
    }
  });
}
function renderAlliancePie(a) {
  const ctx = document
    .getElementById(`pie-${a.alliance}-${a.warzone}`)
    .getContext("2d");

  const tiers = a.tierCounts;

  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: Object.keys(tiers),
      datasets: [{
        data: Object.values(tiers),
        backgroundColor: [
          "#ff595e", "#ffca3a", "#8ac926",
          "#1982c4", "#6a4c93", "#adb5bd"
        ]
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx =>
              `${ctx.label}: ${ctx.raw}`
          }
        }
      },
      cutout: "55%"
    }
  });
}
setTimeout(() => {
  renderAllianceBars(a);
  renderAlliancePie(a);
}, 0);

/* =============================
   INTERACTIONS
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
    const out = e.target.nextElementSibling;
    out.textContent =
      "Stress-test indicates heavy dependence on top frontline squad.";
    out.classList.remove("hidden");
  }
});

/* =============================
   UTIL
============================= */
function formatPower(v) {
  return v ? (v / 1e6).toFixed(1) + "M" : "0";
}
