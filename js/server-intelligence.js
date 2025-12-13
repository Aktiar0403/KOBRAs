console.log("✅ Server Intelligence JS loaded");

import { db } from "./firebase-config.js";
import {
  collection,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* DOM */
const tableBody = document.getElementById("tableBody");
const nameSearch = document.getElementById("nameSearch");
const warzoneFilter = document.getElementById("warzoneFilter");
const allianceFilter = document.getElementById("allianceFilter");

const whaleEl = document.getElementById("whaleCount");
const sharkEl = document.getElementById("sharkCount");
const piranhaEl = document.getElementById("piranhaCount");
const totalEl = document.getElementById("totalCount");

/* STATE */
let allPlayers = [];
let filtered = [];
let activeWarzone = "ALL";
let activeAlliance = "ALL";

/* FIRESTORE */
const qRef = query(
  collection(db, "server_players"),
  orderBy("totalPower", "desc")
);

onSnapshot(qRef, snap => {
  allPlayers = snap.docs.map(d => normalize(d.data()));
  populateFilters();
  applyFilters();
});

/* NORMALIZE */
function normalize(p) {
  return {
    name: String(p.name || "").trim(),
    alliance: String(p.alliance || "UNKNOWN").trim(),
    warzone: String(p.warzone || "UNKNOWN").trim(),
    totalPower: Number(p.totalPower || 0)
  };
}

/* EVENTS */
nameSearch.addEventListener("input", applyFilters);

warzoneFilter.addEventListener("change", e => {
  activeWarzone = e.target.value;
  applyFilters();
});

allianceFilter.addEventListener("change", e => {
  activeAlliance = e.target.value;
  applyFilters();
});

/* FILTER */
function applyFilters() {
  const q = nameSearch.value.toLowerCase();

  filtered = allPlayers.filter(p => {
    if (activeWarzone !== "ALL" && p.warzone !== activeWarzone) return false;
    if (activeAlliance !== "ALL" && p.alliance !== activeAlliance) return false;
    if (q && !p.name.toLowerCase().includes(q)) return false;
    return true;
  });

  renderTable(filtered);
  updateStats(filtered);
}

/* TABLE */
function renderTable(players) {
  tableBody.innerHTML = "";
  totalEl.textContent = players.length;

  players.forEach((p, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${p.name}</td>
      <td>${p.alliance}</td>
      <td>${p.warzone}</td>
      <td class="power">${formatPower(p.totalPower)}</td>
    `;
    tableBody.appendChild(tr);
  });
}

/* STATS */
function updateStats(players) {
  let w = 0, s = 0, p = 0;

  players.forEach(x => {
    if (x.totalPower >= 180_000_000) w++;
    else if (x.totalPower >= 160_000_000) s++;
    else if (x.totalPower >= 140_000_000) p++;
  });

  whaleEl.textContent = w;
  sharkEl.textContent = s;
  piranhaEl.textContent = p;
}

/* FILTER OPTIONS */
function populateFilters() {
  fill(warzoneFilter, allPlayers.map(p => p.warzone));
  fill(allianceFilter, allPlayers.map(p => p.alliance));
}

function fill(select, arr) {
  const current = select.value || "ALL";
  const unique = [...new Set(arr)].sort();

  select.innerHTML = `<option value="ALL">All</option>`;
  unique.forEach(v => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  });

  select.value = unique.includes(current) ? current : "ALL";
}

/* HELPERS */
function formatPower(v) {
  return (v / 1_000_000).toFixed(1) + "M";
}
