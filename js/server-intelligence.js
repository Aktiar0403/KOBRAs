console.log("✅ Server Intelligence JS loaded");

import { db, auth } from "./firebase-config.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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
const tableBody = $("tableBody");

const whaleCount = $("whaleCount");
const sharkCount = $("sharkCount");
const piranhaCount = $("piranhaCount");

const dominanceGrid = $("dominanceGrid");

/* =============================
   AUTH + LOAD
============================= */
onAuthStateChanged(auth, async user => {
  if (!user) {
    alert("Admin login required");
    window.location.href = "admin-login.html";
    return;
  }

  await loadPlayers();
  buildFilterCards();
  applyFilters();
});

/* =============================
   LOAD DATA
============================= */
async function loadPlayers() {
  allPlayers = [];
  const snap = await getDocs(collection(db, COLLECTION));

  snap.forEach(doc => {
    const d = doc.data();

    allPlayers.push({
      id: doc.id,
      name: d.name || "Unknown",
      alliance: d.alliance || "—",
      warzone: String(d.warzone ?? "—"),
      rank: Number(d.rank ?? 0),
      totalPower: Number(d.totalPower ?? 0)
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
    val => activeWarzone = val
  );

  buildCards(
    allianceCards,
    [...new Set(allPlayers.map(p => p.alliance))],
    val => activeAlliance = val
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
  updatePowerSegments();
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
   POWER SEGMENTS
============================= */
function updatePowerSegments() {
  let whales = 0, sharks = 0, piranhas = 0;

  filteredPlayers.forEach(p => {
    if (p.totalPower >= WHALE_MIN) whales++;
    else if (p.totalPower >= SHARK_MIN) sharks++;
    else if (p.totalPower >= PIRANHA_MIN) piranhas++;
  });

  whaleCount.textContent = whales;
  sharkCount.textContent = sharks;
  piranhaCount.textContent = piranhas;
}

function powerTier(p) {
  if (p >= WHALE_MIN) return "🐋 Whale";
  if (p >= SHARK_MIN) return "🦈 Shark";
  if (p >= PIRANHA_MIN) return "🐟 Piranha";
  return "—";
}

/* =============================
   ALLIANCE DOMINANCE %
============================= */
function renderDominance() {
  dominanceGrid.innerHTML = "";

  if (activeWarzone === "ALL") {
    dominanceGrid.innerHTML =
      "<div class='muted'>Select a Warzone to view dominance</div>";
    return;
  }

  const zonePlayers = filteredPlayers;
  const totalPower = zonePlayers.reduce((s, p) => s + p.totalPower, 0);

  const byAlliance = {};
  zonePlayers.forEach(p => {
    byAlliance[p.alliance] = (byAlliance[p.alliance] || 0) + p.totalPower;
  });

  Object.entries(byAlliance)
    .sort((a, b) => b[1] - a[1])
    .forEach(([alliance, power]) => {
      const pct = ((power / totalPower) * 100).toFixed(1);

      const card = document.createElement("div");
      card.className = "dominance-card";
      card.innerHTML = `
        <div class="dom-name">${alliance}</div>
        <div class="dom-bar">
          <div class="dom-fill" style="width:${pct}%"></div>
        </div>
        <div class="dom-pct">${pct}%</div>
      `;
      dominanceGrid.appendChild(card);
    });
}

/* =============================
   EVENTS
============================= */
searchInput.addEventListener("input", applyFilters);
