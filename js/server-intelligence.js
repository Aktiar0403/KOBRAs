console.log("✅ Server Intelligence JS loaded");

import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const loaderStart = Date.now();
let fakeProgress = 0;
const progressText = document.getElementById("progressText");
const progressCircle = document.querySelector(".progress-ring .progress");

function setProgress(pct) {
  fakeProgress = pct;
  const dash = 163 - (163 * pct) / 100;
  progressCircle.style.strokeDashoffset = dash;
  progressText.textContent = pct + "%";
}


function hideLoader() {
  const loader = document.getElementById("appLoader");
  if (!loader) return;

  const elapsed = Date.now() - loaderStart;
  const delay = Math.max(0, 800 - elapsed);

  setTimeout(() => {
    loader.classList.add("hide");
  }, delay);
}

function formatPowerM(power) {
  if (!power) return "0M";
  return Math.round(power / 1_000_000) + "M";
}
function estimateFirstSquad(totalPower) {
  const m = totalPower / 1_000_000;

  // Endgame whales – high variance
  if (m >= 450) return "105–125M";
  if (m >= 400) return "100–120M";
  if (m >= 350) return "90–110M";
  if (m >= 300) return "80–100M";

  // Upper-mid – growing variance
  if (m >= 260) return "72–85M";
  if (m >= 230) return "68–78M";
  if (m >= 200) return "64–72M";
  if (m >= 180) return "60–68M";

  // Mid game – controlled builds
  if (m >= 160) return "55–60M";
  if (m >= 150) return "52–56M";
  if (m >= 140) return "49–53M";
  if (m >= 130) return "47–50M";
  if (m >= 120) return "45–48M";
  if (m >= 110) return "43–46M";

  // Early
  return "40–43M";
}


/* =============================
   STATE
============================= */
let allPlayers = [];
let filteredPlayers = [];

let activeWarzone = "ALL";
let activeAlliance = "ALL";
let dominanceSelectedAlliance = null;


/* =============================
   DOM
============================= */
const $ = id => document.getElementById(id);

const searchInput = $("searchInput");
const warzoneCards = $("warzoneCards");
const allianceCards = $("allianceCards");
const tableBody = $("tableBody");

const dominanceGrid = $("dominanceGrid");

const pasteData = $("pasteData");
const saveBtn = $("saveBtn");
const dominanceSection = document.getElementById("dominanceSection");
if (dominanceSection) dominanceSection.style.display = "none";

/* =============================
   TOP 5 ELITE PLAYERS
============================= */
function renderTop5Elite(players) {
  const grid = document.getElementById("top5Grid");
  if (!grid) return;

  // Sort by TOTAL POWER (global, not filtered)
  const top5 = [...players]
    .sort((a, b) => b.totalPower - a.totalPower)
    .slice(0, 5);

  grid.innerHTML = "";

  top5.forEach((p, index) => {
    const card = document.createElement("div");
    card.className = `glory-card rank-${index + 1}`;

    card.innerHTML = `
      <div class="rank-badge">#${index + 1}</div>

      <div class="glory-name">${p.name}</div>

      <div class="glory-meta">
        <span class="alliance">${p.alliance || "—"}</span>
        <span class="warzone">WZ-${p.warzone}</span>
      </div>

      <div class="glory-power">⚡ ${formatPowerM(p.totalPower)}</div>
    `;

    grid.appendChild(card);
  });
}


function updateLastUpdated(players) {
  const el = document.getElementById("lastUpdated");
  if (!el || !players.length) return;

  const latest = players
    .map(p => p.importedAt?.toDate?.())
    .filter(Boolean)
    .sort((a, b) => b - a)[0];

  if (!latest) {
    el.textContent = "Unknown";
    return;
  }

  el.textContent = latest.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}
/* =============================
   LOAD FROM FIRESTORE
============================= */
async function loadPlayers() {
  console.log("📡 Loading server_players from Firestore...");

  try {
    // 🟢 Stage 1: Connecting
    setProgress(10);

    const snap = await getDocs(collection(db, "server_players"));

    // 🟢 Stage 2: Data received
    setProgress(40);

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

    // 🟢 Stage 3: Processing & building UI
    setProgress(70);

    // 🔥 RESET FILTERS AFTER LOAD
    activeWarzone = "ALL";
    activeAlliance = "ALL";

    // 🔥 REBUILD FILTER UI
    buildWarzoneCards();

    // 🔥 APPLY FILTERS
    applyFilters();

    // 🏆 TOP 5 ELITE
    renderTop5Elite(allPlayers);
    

    // 🟢 Stage 4: Ready
    setProgress(100);

    hideLoader(); // ✅ DATA READY

  } catch (err) {
    console.error("❌ Failed to load server_players:", err);

    // ⚠️ Always hide loader even on error
    hideLoader();
  }
}



/* =============================
   FILTERING
============================= */
function applyFilters() {
  filteredPlayers = [...allPlayers];

  // Search
  const q = searchInput.value.trim().toLowerCase();
  if (q) {
    filteredPlayers = filteredPlayers.filter(p =>
      p.name.toLowerCase().includes(q)
    );
  }

  // Warzone
  if (activeWarzone !== "ALL") {
    filteredPlayers = filteredPlayers.filter(
      p => p.warzone === Number(activeWarzone)
    );
  }

  // Alliance
  if (activeAlliance !== "ALL") {
    filteredPlayers = filteredPlayers.filter(
      p => p.alliance === activeAlliance
    );
  }

  // Rank by POWER
  filteredPlayers.sort((a, b) => b.totalPower - a.totalPower);

  renderTable(filteredPlayers);
  updatePowerSegments(filteredPlayers);
updateOverviewStats(filteredPlayers);
  const dominanceSection = document.getElementById("dominanceSection");

if (activeWarzone !== "ALL") {
  dominanceSection.style.display = "block";
  renderAllianceDominance(filteredPlayers);
} else {
  dominanceSection.style.display = "none";
  dominanceGrid.innerHTML = "";
}

}

/* =============================
   TABLE
============================= */
function renderTable(players) {
  tableBody.innerHTML = "";

 players.forEach((p, index) => {
  const tr = document.createElement("tr");
  const powerValue = Math.round(p.totalPower / 1_000_000);
  const powerHTML = `
    <span class="power-num">${powerValue}</span><small class="power-m">M</small>
  `;
  const firstSquad = estimateFirstSquad(p.totalPower);


   tr.innerHTML = `
  <td class="col-rank rank-num">${index + 1}</td>

  <td class="col-name">
    ${p.name}
  </td>

  <td class="col-power desktop-only">
    <span class="power">${powerHTML}</span>
    <div class="sub-power">⚔️ S1 ${firstSquad}</div>
  </td>

  <td class="col-meta">
    <span class="alliance">${p.alliance}</span>
    <span class="sep">•</span>
    <span class="power mobile-only">
      ${powerHTML}
      <span class="s1-inline">⚔️ S1 ${firstSquad}</span>
    </span>
  </td>
`;


    tableBody.appendChild(tr);
  });
}




/* =============================
   WARZONE FILTER
============================= */
function buildWarzoneCards() {
  const zones = [...new Set(allPlayers.map(p => p.warzone))].sort((a,b)=>a-b);

  warzoneCards.innerHTML = "";

  createFilterCard("All", "ALL", warzoneCards, v => {
    activeWarzone = "ALL";
    activeAlliance = "ALL";
    allianceCards.innerHTML = "";
    applyFilters();
  });

  zones.forEach(z => {
    createFilterCard(z, z, warzoneCards, v => {
     activeWarzone = Number(v);
      activeAlliance = "ALL";
      dominanceSelectedAlliance = null;
      buildAllianceCards(v);
applyFilters();

    });
  });
}

/* =============================
   ALLIANCE FILTER (PER WARZONE)
============================= */
function buildAllianceCards(zone) {
  allianceCards.innerHTML = "";

  const alliances = [
    ...new Set(
      allPlayers
        .filter(p => p.warzone === Number(zone))
        .map(p => p.alliance)
    )
  ].sort();

  createFilterCard("All", "ALL", allianceCards, v => {
    activeAlliance = "ALL";
    applyFilters();
  });

  alliances.forEach(a => {
    createFilterCard(a, a, allianceCards, v => {
      activeAlliance = v;
      applyFilters();
    });
  });
}

/* =============================
   GENERIC CARD
============================= */
function createFilterCard(label, value, container, onClick) {
  const card = document.createElement("div");
  card.className = "filter-card";
  card.textContent = label;

  card.onclick = () => {
    [...container.children].forEach(c => c.classList.remove("active"));
    card.classList.add("active");
    onClick(value);
  };

  container.appendChild(card);
}

/* =============================
   POWER SEGMENTS
============================= */
function updatePowerSegments(players) {
  let mega = 0, whale = 0, shark = 0, piranha = 0, shrimp = 0;

  players.forEach(p => {
    const power = p.totalPower;
    if (power >= 230_000_000) mega++;
    else if (power >= 180_000_000) whale++;
    else if (power >= 160_000_000) shark++;
    else if (power >= 140_000_000) piranha++;
    else shrimp++;
  });

  setText("megaWhaleCount", mega);
  setText("whaleCount", whale);
  setText("sharkCount", shark);
  setText("piranhaCount", piranha);
  setText("shrimpCount", shrimp);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* =============================
   ALLIANCE DOMINANCE (TOP 5)
============================= */
function renderAllianceDominance(players) {
  dominanceGrid.innerHTML = "";

  const map = {};
  let total = 0;

  players.forEach(p => {
    map[p.alliance] = (map[p.alliance] || 0) + p.totalPower;
    total += p.totalPower;
  });

  Object.entries(map)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .forEach(([alliance, power], index) => {

    const isSelected = dominanceSelectedAlliance === alliance;
    const pct = ((power / total) * 100).toFixed(1);

    const members = players.filter(p => p.alliance === alliance);
    const topPlayer = members.sort((a,b)=>b.totalPower-a.totalPower)[0];

    const card = document.createElement("div");
    card.className = "dominance-card";
    card.dataset.alliance = alliance;

    card.innerHTML = isSelected
      ? `
        <div class="dom-rank">#${index + 1}</div>
        <div class="dom-name">${alliance}</div>

        <div class="dom-insight">⚡ ${formatPowerM(power)} Total</div>
        <div class="dom-insight">👑 ${topPlayer?.name || "—"}</div>
        <div class="dom-insight">👥 ${members.length} In Top 200</div>
      `
      : `
        <div class="dom-rank">#${index + 1}</div>
        <div class="dom-name">${alliance}</div>
        <div class="dom-bar"><span style="width:${Math.min(pct,92)}%"></span></div>
        <div class="dom-meta">${pct}%</div>
      `;

    card.onclick = () => {
      dominanceSelectedAlliance =
        dominanceSelectedAlliance === alliance ? null : alliance;
      applyFilters();
    };

    dominanceGrid.appendChild(card);
  });

}


/* =============================
   ADMIN IMPORT (PASTE)
============================= */
saveBtn.onclick = async () => {
  const lines = pasteData.value.split("\n").filter(Boolean);

  for (const line of lines) {
    const [rank, alliance, name, warzone, power] =
      line.split("|").map(s => s.trim());

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
   ADMIN IMPORT (EXCEL / CSV)
============================= */
excelInput.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async (evt) => {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      // Remove header row
      rows.shift();

      if (!rows.length) {
        alert("Excel has no data rows");
        return;
      }

      let imported = 0;

      for (const row of rows) {
        if (row.length < 5) continue;

        const [rank, alliance, name, warzone, power] = row;

        await addDoc(collection(db, "server_players"), {
          rank: Number(rank),
          alliance: String(alliance || "").trim(),
          name: String(name || "").trim(),
          warzone: Number(warzone),
          totalPower: Number(power),
          importedAt: serverTimestamp()
        });

        imported++;
      }

      alert(`✅ Imported ${imported} players from Excel`);
      excelInput.value = "";
      loadPlayers();

    } catch (err) {
      console.error("Excel import failed:", err);
      alert("Excel import failed. Check console.");
    }
  };

  reader.readAsArrayBuffer(file);
};

/* =============================
   SEARCH
============================= */
searchInput.oninput = applyFilters;

/* =============================
   INIT
============================= */




loadPlayers();
function updateOverviewStats(players) {
  const totalPlayers = players.length;

  const warzones = new Set(players.map(p => p.warzone));
  const alliances = new Set(players.map(p => p.alliance));

  document.getElementById("totalPlayers").textContent = totalPlayers;
  document.getElementById("totalWarzones").textContent = warzones.size;
  document.getElementById("totalAlliances").textContent = alliances.size;
}