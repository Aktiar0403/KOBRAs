/* ======================================================
   ALLIANCE SHOWDOWN — STEP 5.2
   ------------------------------------------------------
   - Loads Firestore data
   - Runs ACIS pipeline
   - Prepares alliance list
   - NO matchup rendering yet
====================================================== */

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
const allianceListEl = document.getElementById("allianceList");
const analyzeBtn = document.getElementById("analyzeBtn");
const searchInput = document.getElementById("allianceSearch");

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

    // STEP 2 — Prepare alliance data
    const prepared = prepareAllianceData(players);

    // STEP 3 — Process & score alliances
    allScoredAlliances = prepared.map(alliance =>
      scoreAlliance(processAlliance(alliance))
    );

    console.log("✅ Alliances ready:", allScoredAlliances.length);

    populateAllianceSelector();

  } catch (err) {
    console.error("Alliance Showdown init failed:", err);
  }
}

/* =============================
   POPULATE ALLIANCE SELECTOR
============================= */
function populateAllianceSelector() {
  allianceListEl.innerHTML = "";

  allScoredAlliances.forEach(a => {
    const item = document.createElement("div");
    item.className = "alliance-item";
    item.textContent = a.alliance;

    item.onclick = () => toggleAllianceSelection(a.alliance, item);

    allianceListEl.appendChild(item);
  });
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
   SEARCH FILTER
============================= */
searchInput.addEventListener("input", () => {
  const q = searchInput.value.toLowerCase();

  [...allianceListEl.children].forEach(item => {
    item.style.display =
      item.textContent.toLowerCase().includes(q)
        ? "block"
        : "none";
  });
});

/* =============================
   START
============================= */
init();
