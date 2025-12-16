/* ================= KOBRA ALLIANCE SHOWDOWN ================= */

import { db } from "./firebase-config.js";
import { collection, getDocs } from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { prepareAllianceData } from "./acis/acis-data.js";
import { processAlliance } from "./acis/acis-engine.js";
import { scoreAlliance } from "./acis/acis-scorer.js";
import { buildMatchupMatrix } from "./acis/acis-matchup.js";

/* ---------- STATE ---------- */
let ALL = [];
let SELECTED = new Map();

/* ---------- DOM ---------- */
const warzoneSelect = document.getElementById("warzoneSelect");
const allianceList = document.getElementById("allianceList");
const analyzeBtn = document.getElementById("analyzeBtn");
const results = document.getElementById("results");

/* ---------- INIT ---------- */
async function init() {
  const snap = await getDocs(collection(db, "server_players"));
  const players = snap.docs.map(d => d.data());

  ALL = prepareAllianceData(players)
    .map(a => scoreAlliance(processAlliance(a)));

  populateWarzones();
}
init();

/* ---------- WARZONES ---------- */
function populateWarzones() {
  warzoneSelect.innerHTML = `<option value="">Select Warzone</option>`;
  [...new Set(ALL.map(a => a.warzone))].sort().forEach(wz => {
    const o = document.createElement("option");
    o.value = wz;
    o.textContent = `Warzone ${wz}`;
    warzoneSelect.appendChild(o);
  });
}

warzoneSelect.onchange = () => {
  allianceList.innerHTML = "";
  const wz = Number(warzoneSelect.value);
  if (!wz) return;

  ALL.filter(a => a.warzone === wz)
    .sort((a,b)=>b.acsAbsolute-a.acsAbsolute)
    .slice(0,20)
    .forEach(a=>{
      const d=document.createElement("div");
      d.className="alliance-row";
      d.textContent=a.alliance;
      d.onclick=()=>toggle(a,d);
      allianceList.appendChild(d);
    });
};

function toggle(a,el){
  const k=`${a.alliance}|${a.warzone}`;
  SELECTED.has(k)?SELECTED.delete(k):SELECTED.size<8&&SELECTED.set(k,a);
  el.classList.toggle("selected");
  analyzeBtn.disabled=SELECTED.size<2;
}

/* ---------- ANALYZE ---------- */
analyzeBtn.onclick=()=>{
  const arr=[...SELECTED.values()];
  results.classList.remove("hidden");
  renderAllianceCards(arr);
  renderMatchups(arr);
};

/* ---------- UI RENDER ---------- */
function renderAllianceCards(arr){
  const el=document.getElementById("allianceCards");
  el.innerHTML="";
  arr.forEach(a=>{
    const card=document.createElement("div");
    card.className="alliance-card";
    card.innerHTML=`
      <h3>${a.alliance} (WZ ${a.warzone})</h3>
      <div class="status ${a.isNCA?"bad":a.stabilityFactor<0.8?"warn":"good"}">
        ${a.isNCA?"Non-Competitive":a.stabilityFactor<0.8?"Fragile":"Competitive"}
      </div>
      <div class="metrics">
        <div class="metric"><span>Combat</span><strong>${Math.round(a.acsAbsolute)}</strong></div>
        <div class="metric"><span>FSP</span><strong>${fmt(a.averageFirstSquadPower)}</strong></div>
      </div>`;
    el.appendChild(card);
  });
}

function renderMatchups(arr){
  const el=document.getElementById("matchups");
  el.innerHTML="";
  buildMatchupMatrix(arr).forEach(m=>{
    const A=arr.find(x=>x.alliance===m.a);
    const B=arr.find(x=>x.alliance===m.b);
    if(!A||!B)return;

    const win=A.acsAbsolute>=B.acsAbsolute?A:B;
    const lose=win===A?B:A;

    const card=document.createElement("div");
    card.className="matchup-card";
    card.innerHTML=`
      <div>🏆 ${win.alliance} vs 💥 ${lose.alliance}</div>
      <div class="matchup-outcome collapse">Collapse Likely</div>
      <button class="stress-test-btn">Stress-test</button>`;
    el.appendChild(card);
  });
}

function fmt(v){return v?(v/1e6).toFixed(1)+"M":"0";}
