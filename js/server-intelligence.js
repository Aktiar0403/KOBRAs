console.log("✅ Server Intelligence JS loaded");

import { db, auth } from "./firebase-config.js";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* =============================
   CONFIG
============================= */
const COLLECTION = "server_players";

const WHALE_MIN = 180_000_000;
const SHARK_MIN = 160_000_000;
const PIRANHA_MIN = 140_000_000;

/* =============================
   STATE
============================= */
let allPlayers = [];
let filteredPlayers = [];

let activeWarzone = "ALL";
let activeAlliance = "ALL";

/* =============================
   DOM
============================= */
const $ = id => document.getElementById(id);

const searchInput = $("searchInput");
const warzoneCards = $("warzoneCards");
const allianceCards = $("allianceCards");

const whaleCount = $("whaleCount");
const sharkCount = $("sharkCount");
const piranhaCount = $("piranhaCount");

const dominanceGrid = $("dominanceGrid");
const tableBody = $("tableBody");

/* comparison */
const compareAllianceA = $("compareAllianceA");
const compareAllianceB = $("compareAllianceB");
const compareBtn = $("compareBtn");
const comparisonResult = $("comparisonResult");

/* admin */
const pasteData = $("pasteData");
const saveBtn = $("saveBtn");

/* =============================
   AUTH + INIT
============================= */
onAuthStateChanged(auth, async user => {
  if (!user) {
    alert("Admin access required");
    window.location.href = "admin-login.html";
    return;
  }

  await loadPlayers();
  buildFilterCards();
  populateComparisonDropdowns();
  applyFilters();
});

/* =============================
   LOAD PLAYERS
============================= */
async function loadPlayers() {
  allPlayers = [];
  const snap = await getDocs(collection(db, COLLECTION));

  snap.forEach(d => {
    const x = d.data();
    allPlayers.push({
      id: d.id,
      rank: Number(x.rank ?? 0),
      name: x.name || "Unknown",
      alliance: x.alliance || "—",
      warzone: String(x.warzone ?? "—"),
      totalPower: Number(x.totalPower ?? 0)
    });
  });

  console.log("🔥 Loaded players:", allPlayers.length);
}

/* =============================
   FILTER CARDS
============================= */
function buildFilterCards() {
  buildCards(
    warzoneCards,
    [...new Set(allPlayers.map(p => p.warzone))],
    v => activeWarzone = v
  );

  buildCards(
    allianceCards,
    [...new Set(allPlayers.map(p => p.alliance))],
    v => activeAlliance = v
  );
}

function buildCards(container, values, onSelect) {
  container.innerHTML = "";

  const all = document.createElement("div");
  all.className = "filter-card active";
  all.textContent = "All";
  all.onclick = () => {
    onSelect("ALL");
    applyFilters();
  };
  container.appendChild(all);

  values.sort().forEach(v => {
    const c = document.createElement("div");
    c.className = "filter-card";
    c.textContent = v;
    c.onclick = () => {
      onSelect(v);
      applyFilters();
    };
    container.appendChild(c);
  });
}

/* =============================
   APPLY FILTERS
============================= */
function applyFilters() {
  const q = searchInput.value.toLowerCase();

  filteredPlayers = allPlayers.filter(p => {
    if (activeWarzone !== "ALL" && p.warzone !== activeWarzone) return false;
    if (activeAlliance !== "ALL" && p.alliance !== activeAlliance) return false;
    if (q && !p.name.toLowerCase().includes(q)) return false;
    return true;
  });

  renderTable();
  updateSegments();
  renderDominance();
}

/* =============================
   TABLE
============================= */
function renderTable() {
  tableBody.innerHTML = "";
  filteredPlayers.forEach((p, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${p.name}</td>
      <td>${p.alliance}</td>
      <td>${p.warzone}</td>
      <td>${p.totalPower.toLocaleString()}</td>
      <td>${powerTier(p.totalPower)}</td>
    `;
    tableBody.appendChild(tr);
  });
}

/* =============================
   SEGMENTS
============================= */
function updateSegments() {
  let w = 0, s = 0, p = 0;
  filteredPlayers.forEach(x => {
    if (x.totalPower >= WHALE_MIN) w++;
    else if (x.totalPower >= SHARK_MIN) s++;
    else if (x.totalPower >= PIRANHA_MIN) p++;
  });
  whaleCount.textContent = w;
  sharkCount.textContent = s;
  piranhaCount.textContent = p;
}

function powerTier(v) {
  if (v >= WHALE_MIN) return "🐋 Whale";
  if (v >= SHARK_MIN) return "🦈 Shark";
  if (v >= PIRANHA_MIN) return "🐟 Piranha";
  return "—";
}

/* =============================
   DOMINANCE %
============================= */
function renderDominance() {
  dominanceGrid.innerHTML = "";

  if (activeWarzone === "ALL") {
    dominanceGrid.innerHTML =
      "<div class='muted'>Select a Warzone</div>";
    return;
  }

  const total = filteredPlayers.reduce((s, p) => s + p.totalPower, 0);
  const byAlliance = {};

  filteredPlayers.forEach(p => {
    byAlliance[p.alliance] =
      (byAlliance[p.alliance] || 0) + p.totalPower;
  });

  Object.entries(byAlliance)
    .sort((a, b) => b[1] - a[1])
    .forEach(([a, v]) => {
      const pct = ((v / total) * 100).toFixed(1);
      const el = document.createElement("div");
      el.className = "dominance-card";
      el.innerHTML = `
        <div>${a}</div>
        <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
        <strong>${pct}%</strong>
      `;
      dominanceGrid.appendChild(el);
    });
}

/* =============================
   ALLIANCE COMPARISON
============================= */
function populateComparisonDropdowns() {
  const alliances = [...new Set(allPlayers.map(p => p.alliance))].sort();
  [compareAllianceA, compareAllianceB].forEach(sel => {
    sel.innerHTML = alliances.map(a => `<option>${a}</option>`).join("");
  });
}

compareBtn.addEventListener("click", () => {
  const a = compareAllianceA.value;
  const b = compareAllianceB.value;

  const sum = x =>
    filteredPlayers
      .filter(p => p.alliance === x)
      .reduce((s, p) => s + p.totalPower, 0);

  const pa = sum(a);
  const pb = sum(b);

  comparisonResult.innerHTML = `
    <div><strong>${a}</strong>: ${pa.toLocaleString()}</div>
    <div><strong>${b}</strong>: ${pb.toLocaleString()}</div>
  `;
});

/* =============================
   ADMIN IMPORT (PASTE)
============================= */
saveBtn.addEventListener("click", async () => {
  const lines = pasteData.value.split("\n").map(l => l.trim()).filter(Boolean);
  if (!lines.length) return alert("No data");

  for (const line of lines) {
    const [rank, alliance, name, warzone, totalPower] =
      line.split("|").map(x => x.trim());

    await addDoc(collection(db, COLLECTION), {
      rank: Number(rank),
      alliance,
      name,
      warzone: Number(warzone),
      totalPower: Number(totalPower),
      importedAt: serverTimestamp()
    });
  }

  alert("Data imported");
  pasteData.value = "";
  await loadPlayers();
  buildFilterCards();
  populateComparisonDropdowns();
  applyFilters();
});

/* =============================
   EVENTS
============================= */
searchInput.addEventListener("input", applyFilters);
