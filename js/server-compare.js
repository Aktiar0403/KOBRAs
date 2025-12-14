import { db } from "./firebase-config.js";
import { collection, getDocs } from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let compareChart = null;
let allPlayers = [];
let mode = "alliance";

const selectA = document.getElementById("selectA");
const selectB = document.getElementById("selectB");
const compareBtn = document.getElementById("compareBtn");
const results = document.getElementById("compareResults");
const verdictCard = document.getElementById("verdictCard");

const TIERS = {
  mega: p => p >= 230_000_000,
  whale: p => p >= 180_000_000 && p < 230_000_000,
  shark: p => p >= 160_000_000 && p < 180_000_000,
  piranha: p => p >= 140_000_000 && p < 160_000_000,
  shrimp: p => p < 140_000_000
};

async function loadPlayers() {
  const snap = await getDocs(collection(db,"server_players"));
  allPlayers = snap.docs.map(d => d.data());
  populateSelectors();
}

function populateSelectors() {
  const values = [...new Set(
    allPlayers.map(p => mode === "alliance" ? p.alliance : p.warzone)
  )].sort((a, b) => String(a).localeCompare(String(b)));

  selectA.innerHTML = selectB.innerHTML = "";

  values.forEach(v => {
    selectA.innerHTML += `<option>${v}</option>`;
    selectB.innerHTML += `<option>${v}</option>`;
  });

  if (mode === "alliance") {
    // ✅ Alliance = searchable
    searchA.style.display = "block";
    searchB.style.display = "block";

    bindSearch(searchA, selectA, values);
    bindSearch(searchB, selectB, values);

  } else {
    // ✅ Warzone = NOT searchable
    searchA.style.display = "none";
    searchB.style.display = "none";
  }
}


function analyze(players) {
  const stats = { mega:0, whale:0, shark:0, piranha:0, shrimp:0, total:0 };

  players.forEach(p => {
    const pw = p.totalPower;
    stats.total += pw;
    if (TIERS.mega(pw)) stats.mega++;
    else if (TIERS.whale(pw)) stats.whale++;
    else if (TIERS.shark(pw)) stats.shark++;
    else if (TIERS.piranha(pw)) stats.piranha++;
    else stats.shrimp++;
  });

  return stats;
}

function renderChart(labelA, labelB, statsA, statsB) {

  const ctx = document.getElementById("compareChart").getContext("2d");

  if (compareChart) {
    compareChart.destroy();
  }

  compareChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: [
        "Mega Whales",
        "Whales",
        "Sharks",
        "Piranhas",
        "Shrimps"
      ],
      datasets: [
        {
          label: labelA,
          data: [
            statsA.mega,
            statsA.whale,
            statsA.shark,
            statsA.piranha,
            statsA.shrimp
          ],
          backgroundColor: "rgba(0,255,200,0.7)"
        },
        {
          label: labelB,
          data: [
            statsB.mega,
            statsB.whale,
            statsB.shark,
            statsB.piranha,
            statsB.shrimp
          ],
          backgroundColor: "rgba(0,180,255,0.6)"
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: { color: "#e6eef0" }
        }
      },
      scales: {
        x: {
          ticks: { color: "#93a3a6" },
          grid: { color: "rgba(255,255,255,0.05)" }
        },
        y: {
          ticks: { color: "#93a3a6" },
          grid: { color: "rgba(255,255,255,0.05)" }
        }
      }
    }
  });
}


compareBtn.onclick = () => {
  const A = selectA.value;
  const B = selectB.value;

  const aPlayers = allPlayers.filter(p =>
    mode === "alliance" ? p.alliance === A : p.warzone == A
  );
  const bPlayers = allPlayers.filter(p =>
    mode === "alliance" ? p.alliance === B : p.warzone == B
  );

  const a = analyze(aPlayers);
  const b = analyze(bPlayers);

  results.innerHTML = `
    ${renderBar("🐋 Mega Whales", a.mega, b.mega)}
    ${renderBar("🐋 Whales", a.whale, b.whale)}
    ${renderBar("🦈 Sharks", a.shark, b.shark)}
    ${renderBar("🐟 Piranhas", a.piranha, b.piranha)}
  `;

  verdictCard.classList.remove("hidden");
  verdictCard.textContent =
    a.mega > b.mega
      ? `${A} shows higher elite concentration due to stronger Mega Whale presence.`
      : `${B} holds a stronger elite edge based on Mega Whale distribution.`;
};

document.querySelectorAll(".mode-btn").forEach(btn=>{
  btn.onclick = ()=>{
    document.querySelectorAll(".mode-btn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    mode = btn.dataset.mode;
    populateSelectors();
  };
});

loadPlayers();
function bindSearch(inputEl, selectEl, values) {
  inputEl.oninput = () => {
    const q = inputEl.value.toLowerCase();
    selectEl.innerHTML = "";

    values
      .filter(v => String(v).toLowerCase().includes(q))
      .forEach(v => {
        selectEl.innerHTML += `<option>${v}</option>`;
      });
  };
}
