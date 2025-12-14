console.log("✅ Server Intelligence JS loaded");

import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function formatPowerM(power) {
  if (!power) return "0M";
  return Math.round(power / 1_000_000) + "M";
}
function estimateFirstSquad(totalPower) {
  const m = totalPower / 1_000_000;

  if (m >= 400) return "108–112M";
  if (m >= 350) return "95–100M";
  if (m >= 300) return "85–90M";
  if (m >= 230) return "70–72M";
  if (m >= 200) return "66–69M";
  if (m >= 180) return "62–65M";
  if (m >= 160) return "56–58M";
  if (m >= 150) return "52–55M";
  if (m >= 140) return "50–52M";
  if (m >= 130) return "48–50M";
  if (m >= 120) return "46–48M";
  if (m >= 110) return "44–46M";

  return "40–43M";
}

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

const dominanceGrid = $("dominanceGrid");

const pasteData = $("pasteData");
const saveBtn = $("saveBtn");



/* =============================
   LOAD FROM FIRESTORE
============================= */
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

    // 🔥 RESET FILTERS AFTER LOAD
    activeWarzone = "ALL";
    activeAlliance = "ALL";

    // 🔥 REBUILD FILTER UI
    buildWarzoneCards();

    // 🔥 APPLY FILTERS
    applyFilters();

  } catch (err) {
    console.error("❌ Failed to load server_players:", err);
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
  if (activeWarzone !== "ALL") {
    renderAllianceDominance(filteredPlayers);
  } else {
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
    const powerM = Math.round(p.totalPower / 1_000_000) + "M";
    const firstSquad = estimateFirstSquad(p.totalPower);


    tr.innerHTML = `
      <td class="col-rank">${index + 1}</td>

      <td class="col-name">
        ${p.name}
      </td>

     <td class="col-power desktop-only">
  ${powerM}
  <div class="sub-power">⚔️ S1: ${firstSquad}</div>

</td>

<td class="col-meta">
  <span class="alliance">${p.alliance}</span>
  <span class="sep">•</span>
  <span class="power mobile-only">
   ${powerM} • <span class="s1-inline">⚔️ S1 ${firstSquad}</span>

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
    .sort((a,b)=>b[1]-a[1])
    .slice(0,5)
    .forEach(([a,p], i) => {
      const pct = ((p / total) * 100).toFixed(1);
      const card = document.createElement("div");
      card.className = "dominance-card";
      card.innerHTML = `
        <div class="dom-rank">#${i+1}</div>
        <div class="dom-name">${a}</div>
        <div class="dom-bar"><span style="width:${pct}%"></span></div>
        <div class="dom-meta">${pct}%</div>
      `;
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
