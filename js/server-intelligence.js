console.log("✅ Server Intelligence JS loaded");

import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

const warzoneSearch = $("warzoneSearch");
const allianceSearch = $("allianceSearch");

const tableBody = $("tableBody");

const whaleCount = $("whaleCount");
const sharkCount = $("sharkCount");
const piranhaCount = $("piranhaCount");

const dominanceGrid = $("dominanceGrid");

const compareAllianceA = $("compareAllianceA");
const compareAllianceB = $("compareAllianceB");
const compareBtn = $("compareBtn");
const comparisonResult = $("comparisonResult");

const pasteData = $("pasteData");
const excelInput = $("excelInput");
const saveBtn = $("saveBtn");

/* =============================
   LOAD FROM FIRESTORE
============================= */
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let allPlayers = [];
let filteredPlayers = [];

async function loadPlayers() {
  console.log("📡 Loading server_players from Firestore...");

  try {
    const snap = await getDocs(collection(db, "server_players"));

    allPlayers = snap.docs.map(doc => {
      const d = doc.data();

      return {
        id: doc.id,
        rank: Number(d.rank ?? 0),
        name: d.name || "",
        alliance: d.alliance || "",
        warzone: Number(d.warzone),
        totalPower: Number(d.totalPower ?? 0)
      };
    });

    console.log("✅ Loaded players:", allPlayers.length);
    console.table(allPlayers.slice(0, 5));

    applyFilters(); // IMPORTANT
  } catch (err) {
    console.error("❌ Failed to load server_players:", err);
  }
}


/* =============================
   FILTERING CORE
============================= */
function renderAllianceDominance(players) {
  const grid = document.getElementById("dominanceGrid");
  if (!grid) return;

  grid.innerHTML = "";

  // Dominance only makes sense when a warzone is selected
  if (!activeWarzone) {
    grid.innerHTML = `<div class="muted">Select a warzone to view alliance dominance</div>`;
    return;
  }

  // Aggregate power by alliance
  const alliancePower = {};
  let totalPower = 0;

  players.forEach(p => {
    const power = Number(p.totalPower || 0);
    if (!p.alliance) return;

    alliancePower[p.alliance] = (alliancePower[p.alliance] || 0) + power;
    totalPower += power;
  });

  if (!totalPower) {
    grid.innerHTML = `<div class="muted">No data for selected warzone</div>`;
    return;
  }

  // Convert to sorted array
  const ranked = Object.entries(alliancePower)
    .map(([alliance, power]) => ({
      alliance,
      power,
      pct: ((power / totalPower) * 100).toFixed(1)
    }))
    .sort((a, b) => b.power - a.power)
    .slice(0, 5); // Top 5 only

  // Render cards
  ranked.forEach((row, index) => {
    const card = document.createElement("div");
    card.className = "dominance-card";

    card.innerHTML = `
      <div class="dom-rank">#${index + 1}</div>
      <div class="dom-name">${row.alliance}</div>
      <div class="dom-bar">
        <div class="dom-fill" style="width:${row.pct}%"></div>
      </div>
      <div class="dom-meta">
        <span>${row.pct}%</span>
        <span>${row.power.toLocaleString()}</span>
      </div>
    `;

    grid.appendChild(card);
  });
}




let activeWarzone = null;
let activeAlliance = null;

function applyFilters() {
  filteredPlayers = [...allPlayers];

  // Search
  const q = searchInput.value.trim().toLowerCase();
  if (q) {
    filteredPlayers = filteredPlayers.filter(p =>
      p.name.toLowerCase().includes(q)
    );
  }

  // Warzone filter
  if (activeWarzone !== null) {
    filteredPlayers = filteredPlayers.filter(
      p => p.warzone === Number(activeWarzone)
    );
  }

  // Alliance filter
  if (activeAlliance) {
    filteredPlayers = filteredPlayers.filter(
      p => p.alliance === activeAlliance
    );
  }

  // SORT BY POWER (ranking logic)
  filteredPlayers.sort((a, b) => b.totalPower - a.totalPower);

  renderTable(filteredPlayers);
  updatePowerSegments(filteredPlayers);
  renderAllianceDominance(filteredPlayers);
}



/* =============================
   TABLE
============================= */
function renderTable(players) {
  tableBody.innerHTML = "";

  players.forEach((p, index) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${p.name}</td>
      <td>${p.alliance}</td>
      <td>${p.warzone}</td>
      <td>${p.totalPower.toLocaleString()}</td>
    `;

    tableBody.appendChild(tr);
  });
}



/* =============================
   WARZONE CARDS (SEARCHABLE)
============================= */
function buildWarzoneCards() {
  const zones = [...new Set(allPlayers.map(p => p.warzone))].sort((a,b)=>a-b);

  buildCards(
    warzoneCards,
    zones.map(String),
    v => {
      activeWarzone = v === "ALL" ? "ALL" : Number(v);
      activeAlliance = "ALL";

      allianceCards.style.display =
        activeWarzone === "ALL" ? "none" : "flex";

      if (activeWarzone !== "ALL") {
        buildAllianceCardsForWarzone(activeWarzone);
      } else {
        allianceCards.innerHTML = "";
        dominanceGrid.innerHTML = "";
      }

      applyFilters();
    },
    warzoneSearch
  );
}

/* =============================
   ALLIANCE CARDS (PER WARZONE)
============================= */
function buildAllianceCardsForWarzone(zone) {
  const alliances = [
    ...new Set(
      allPlayers.filter(p => p.warzone === zone).map(p => p.alliance)
    )
  ].sort();

  buildCards(
    allianceCards,
    alliances,
    v => {
      activeAlliance = v;
      applyFilters();
    },
    allianceSearch
  );

  populateAllianceComparison(alliances);
}

/* =============================
   CARD BUILDER (GENERIC)
============================= */
function buildCards(container, values, onSelect, searchInput) {
  let active = "ALL";

  function render(list) {
    container.innerHTML = "";

    const all = document.createElement("div");
    all.className = "filter-card" + (active === "ALL" ? " active" : "");
    all.textContent = "All";
    all.onclick = () => {
      active = "ALL";
      onSelect("ALL");
      render(list);
    };
    container.appendChild(all);

    list.forEach(v => {
      const c = document.createElement("div");
      c.className = "filter-card" + (active === v ? " active" : "");
      c.textContent = v;
      c.onclick = () => {
        active = v;
        onSelect(v);
        render(list);
      };
      container.appendChild(c);
    });
  }

  render(values);

  if (searchInput) {
    searchInput.oninput = () => {
      const q = searchInput.value.toLowerCase();
      render(values.filter(v => v.toLowerCase().includes(q)));
    };
  }
}

/* =============================
   SEGMENTS (Whale / Shark / Piranha)
============================= */
function getPowerTier(power) {
  if (power >= 230_000_000) return "megaWhale";
  if (power >= 180_000_000) return "whale";
  if (power >= 160_000_000) return "shark";
  if (power >= 140_000_000) return "piranha";
  return "shrimp";
}
function updatePowerSegments(players) {
  let mega = 0, whale = 0, shark = 0, piranha = 0, shrimp = 0;

  players.forEach(p => {
    const pw = p.totalPower;

    if (pw >= 230_000_000) mega++;
    else if (pw >= 180_000_000) whale++;
    else if (pw >= 160_000_000) shark++;
    else if (pw >= 140_000_000) piranha++;
    else shrimp++;
  });

  document.getElementById("megaCount").textContent = mega;
  document.getElementById("whaleCount").textContent = whale;
  document.getElementById("sharkCount").textContent = shark;
  document.getElementById("piranhaCount").textContent = piranha;
  document.getElementById("shrimpCount").textContent = shrimp;
}


/* =============================
   ALLIANCE DOMINANCE (TOP 5)
============================= */
function updateAllianceDominance() {
  dominanceGrid.innerHTML = "";

  if (activeWarzone === "ALL") return;

  const zonePlayers = allPlayers.filter(p => p.warzone === activeWarzone);
  const totalPower = zonePlayers.reduce((s,p)=>s+p.totalPower,0);

  const map = {};
  zonePlayers.forEach(p => {
    map[p.alliance] = (map[p.alliance] || 0) + p.totalPower;
  });

  Object.entries(map)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,5)
    .forEach(([a,p]) => {
      const pct = ((p / totalPower) * 100).toFixed(1);
      const d = document.createElement("div");
      d.className = "dominance-card";
      d.innerHTML = `
        <div>${a}</div>
        <div class="bar"><span style="width:${pct}%"></span></div>
        <div>${pct}%</div>
      `;
      dominanceGrid.appendChild(d);
    });
}

/* =============================
   ALLIANCE VS ALLIANCE
============================= */
function populateAllianceComparison(list) {
  compareAllianceA.innerHTML = "";
  compareAllianceB.innerHTML = "";

  list.forEach(a => {
    compareAllianceA.add(new Option(a,a));
    compareAllianceB.add(new Option(a,a));
  });
}

compareBtn.onclick = () => {
  const a = compareAllianceA.value;
  const b = compareAllianceB.value;

  const pa = filteredPlayers.filter(p=>p.alliance===a)
    .reduce((s,p)=>s+p.totalPower,0);

  const pb = filteredPlayers.filter(p=>p.alliance===b)
    .reduce((s,p)=>s+p.totalPower,0);

  comparisonResult.innerHTML = `
    <strong>${a}</strong>: ${pa.toLocaleString()}<br>
    <strong>${b}</strong>: ${pb.toLocaleString()}
  `;
};

/* =============================
   ADMIN IMPORT (PASTE)
============================= */
saveBtn.onclick = async () => {
  const lines = pasteData.value.split("\n").filter(Boolean);

  for (const line of lines) {
    const [rank, alliance, name, warzone, power] = line.split("|").map(s=>s.trim());
    await addDoc(collection(db,"server_players"), {
      rank: Number(rank),
      alliance,
      name,
      warzone: Number(warzone),
      totalPower: Number(power),
      importedAt: serverTimestamp()
    });
  }

  alert("Data uploaded");
  loadPlayers();
};

/* =============================
   SEARCH
============================= */
searchInput.oninput = applyFilters;

/* =============================
   INIT
============================= */
loadPlayers();
