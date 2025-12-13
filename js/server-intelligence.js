console.log("✅ Server Intelligence JS loaded");

import { db } from "./firebase-config.js";
import {
  collection,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const tableBody = document.getElementById("tableBody");
const warzoneFilter = document.getElementById("warzoneFilter");
const allianceFilter = document.getElementById("allianceFilter");

const whaleEl = document.getElementById("whaleCount");
const sharkEl = document.getElementById("sharkCount");
const piranhaEl = document.getElementById("piranhaCount");
const totalCountEl = document.getElementById("totalCount");

let allPlayers = [];
let activeWarzone = "ALL";
let activeAlliance = "ALL";

/* ---------- LOAD FROM FIRESTORE ---------- */
const ref = collection(db, "server_players");
const q = query(ref, orderBy("totalPower", "desc"));

onSnapshot(q, snap => {
  allPlayers = [];
  snap.forEach(d => allPlayers.push({ id: d.id, ...d.data() }));
  populateFilters();
  applyFilters();
  updateStats();
});

/* ---------- FILTERING ---------- */
warzoneFilter.onchange = e => {
  activeWarzone = e.target.value;
  applyFilters();
};

allianceFilter.onchange = e => {
  activeAlliance = e.target.value;
  applyFilters();
};

function applyFilters() {
  let data = [...allPlayers];

  if (activeWarzone !== "ALL")
    data = data.filter(p => p.warzone === activeWarzone);

  if (activeAlliance !== "ALL")
    data = data.filter(p => p.alliance === activeAlliance);

  renderTable(data);
}

/* ---------- TABLE ---------- */
function renderTable(players) {
  tableBody.innerHTML = "";
  totalCountEl.textContent = players.length;

  players.forEach((p, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${p.name}</td>
      <td>${p.alliance || "-"}</td>
      <td>${p.warzone || "-"}</td>
      <td class="power">${formatPower(p.totalPower)}</td>
    `;
    tableBody.appendChild(tr);
  });
}

/* ---------- STATS ---------- */
function updateStats() {
  let whales = 0, sharks = 0, piranhas = 0;

  allPlayers.forEach(p => {
    if (p.totalPower >= 180_000_000) whales++;
    else if (p.totalPower >= 160_000_000) sharks++;
    else if (p.totalPower >= 140_000_000) piranhas++;
  });

  whaleEl.textContent = whales;
  sharkEl.textContent = sharks;
  piranhaEl.textContent = piranhas;
}

/* ---------- FILTER DROPDOWNS ---------- */
function populateFilters() {
  const wz = new Set(), al = new Set();

  allPlayers.forEach(p => {
    if (p.warzone) wz.add(p.warzone);
    if (p.alliance) al.add(p.alliance);
  });

  fillSelect(warzoneFilter, wz);
  fillSelect(allianceFilter, al);
}

function fillSelect(select, values) {
  const current = select.value;
  select.innerHTML = `<option value="ALL">All</option>`;
  [...values].sort().forEach(v => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  });
  select.value = current;
}

/* ---------- HELPERS ---------- */
function formatPower(v) {
  if (!v) return "-";
  return (v / 1_000_000).toFixed(1) + "M";
}
