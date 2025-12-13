console.log("✅ Server Intelligence JS loaded");

import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* CONFIG */
const COL = "server_players";

/* STATE */
let allPlayers = [];
let filtered = [];
let activeWarzone = null;
let activeAlliance = null;

/* DOM */
const $ = id => document.getElementById(id);
const tableBody = $("tableBody");

/* LOAD DATA */
async function loadPlayers() {
  const snap = await getDocs(collection(db, COL));
  allPlayers = snap.docs.map(d => d.data());
  applyFilters();
}

/* FILTERING */
function applyFilters() {
  const q = $("searchInput").value.toLowerCase();

  filtered = allPlayers.filter(p => {
    if (activeWarzone && p.warzone !== activeWarzone) return false;
    if (activeAlliance && p.alliance !== activeAlliance) return false;
    if (q && !p.name.toLowerCase().includes(q)) return false;
    return true;
  });

  renderTable();
  renderSegments();
  renderDominance();
}

/* TABLE */
function renderTable() {
  tableBody.innerHTML = "";
  filtered.forEach((p, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${p.name}</td>
      <td>${p.alliance}</td>
      <td>${p.warzone}</td>
      <td>${p.power.toLocaleString()}</td>
      <td>${tier(p.power)}</td>
    `;
    tableBody.appendChild(tr);
  });
}

/* TIERS */
function tier(p) {
  if (p >= 180_000_000) return "Whale";
  if (p >= 160_000_000) return "Shark";
  if (p >= 140_000_000) return "Piranha";
  return "Other";
}

/* SEGMENTS */
function renderSegments() {
  $("whaleCount").textContent = filtered.filter(p => p.power >= 180e6).length;
  $("sharkCount").textContent = filtered.filter(p => p.power >= 160e6 && p.power < 180e6).length;
  $("piranhaCount").textContent = filtered.filter(p => p.power >= 140e6 && p.power < 160e6).length;
}

/* DOMINANCE */
function renderDominance() {
  const grid = $("dominanceGrid");
  grid.innerHTML = "";

  const zones = {};
  filtered.forEach(p => {
    zones[p.warzone] ??= {};
    zones[p.warzone][p.alliance] = (zones[p.warzone][p.alliance] || 0) + p.power;
  });

  Object.entries(zones).forEach(([zone, alliances]) => {
    const total = Object.values(alliances).reduce((a,b)=>a+b,0);
    Object.entries(alliances).forEach(([al, pw]) => {
      const div = document.createElement("div");
      div.className = "dominance-card";
      div.innerHTML = `
        <strong>${al}</strong>
        <div>${zone}</div>
        <div>${((pw/total)*100).toFixed(1)}%</div>
      `;
      grid.appendChild(div);
    });
  });
}

/* FILTER CARDS */
function buildCards(key, containerId) {
  const set = [...new Set(allPlayers.map(p => p[key]))];
  const wrap = $(containerId);
  wrap.innerHTML = "";

  set.forEach(v => {
    const c = document.createElement("div");
    c.className = "filter-card";
    c.textContent = v;
    c.onclick = () => {
      key === "warzone" ? activeWarzone = v : activeAlliance = v;
      applyFilters();
    };
    wrap.appendChild(c);
  });
}

/* COMPARISON */
$("compareBtn").onclick = () => {
  const a = $("compareAllianceA").value;
  const b = $("compareAllianceB").value;

  const sum = al =>
    filtered.filter(p=>p.alliance===al)
      .reduce((s,p)=>s+p.power,0);

  $("comparisonResult").innerHTML = `
    <div>${a}: ${sum(a).toLocaleString()}</div>
    <div>${b}: ${sum(b).toLocaleString()}</div>
  `;
};

/* IMPORT */
$("saveBtn").onclick = async () => {
  const lines = $("pasteData").value.split("\n");
  for (const l of lines) {
    const [rank, alliance, name, warzone, power] = l.split("|").map(x=>x.trim());
    await addDoc(collection(db, COL), {
      rank:Number(rank),
      alliance,
      name,
      warzone,
      power:Number(power.replace(/,/g,""))
    });
  }
  loadPlayers();
};

/* EVENTS */
$("searchInput").addEventListener("input", applyFilters);

/* INIT */
loadPlayers().then(()=>{
  buildCards("warzone","warzoneCards");
  buildCards("alliance","allianceCards");
});
