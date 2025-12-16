/* ======================================================
   ALLIANCE SHOWDOWN — UI CONTROLLER
====================================================== */

import { db } from "./firebase-config.js";
import { collection, getDocs } from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { prepareAllianceData } from "./acis/acis-data.js";
import { processAlliance } from "./acis/acis-engine.js";
import { scoreAlliance } from "./acis/acis-scorer.js";
import { buildMatchupMatrix } from "./acis/acis-matchup.js";

/* =============================
   TOOLTIP DEFINITIONS
============================= */
const FACTOR_TOOLTIPS = {
  COMBAT_GAP: "Overall effective combat strength difference after ACIS adjustments.",
  MEGA_WHALE: "Mega Whales disproportionately influence frontline combat.",
  WHALE: "Whales provide sustained frontline pressure.",
  STABILITY: "Low stability indicates imbalance or missing real fighters.",
  POWER_DISTRIBUTION: "Better power spread reduces early collapse risk.",
  NON_COMPETITIVE: "Alliance lacks structural competitiveness."
};

/* =============================
   GLOBAL STATE
============================= */
let allScoredAlliances = [];
let selectedAlliances = new Map();

/* =============================
   DOM REFERENCES
============================= */
const warzoneSelect  = document.getElementById("warzoneSelect");
const filteredList  = document.getElementById("filteredAlliances");
const analyzeBtn    = document.getElementById("analyzeBtn");
const resultsSection= document.getElementById("results");

/* =============================
   LOAD DATA
============================= */
async function loadServerPlayers() {
  const snap = await getDocs(collection(db, "server_players"));
  return snap.docs.map(d => d.data());
}

/* =============================
   INIT
============================= */
async function init() {
  const players = await loadServerPlayers();
  const prepared = prepareAllianceData(players);
  allScoredAlliances = prepared.map(a =>
    scoreAlliance(processAlliance(a))
  );
  populateWarzones();
}

/* =============================
   WARZONES
============================= */
function populateWarzones() {
  warzoneSelect.innerHTML = `<option value="">Select Warzone</option>`;
  [...new Set(allScoredAlliances.map(a => a.warzone))]
    .sort((a,b)=>a-b)
    .forEach(wz=>{
      const o=document.createElement("option");
      o.value=wz; o.textContent=`Warzone ${wz}`;
      warzoneSelect.appendChild(o);
    });
}

warzoneSelect.onchange = () => {
  filteredList.innerHTML="";
  const wz = Number(warzoneSelect.value);
  if(!wz) return;

  allScoredAlliances
    .filter(a=>a.warzone===wz)
    .sort((a,b)=>b.acsAbsolute-a.acsAbsolute)
    .slice(0,20)
    .forEach(a=>{
      const d=document.createElement("div");
      d.className="alliance-item";
      d.textContent=a.alliance;
      if(selectedAlliances.get(a.alliance)===wz)
        d.classList.add("selected");
      d.onclick=()=>toggleAlliance(a,d);
      filteredList.appendChild(d);
    });
};

function toggleAlliance(a, el){
  if(selectedAlliances.get(a.alliance)===a.warzone){
    selectedAlliances.delete(a.alliance);
    el.classList.remove("selected");
  } else {
    if(selectedAlliances.size>=8) return;
    selectedAlliances.set(a.alliance,a.warzone);
    el.classList.add("selected");
  }
  analyzeBtn.disabled = selectedAlliances.size<2;
}

/* =============================
   ANALYZE
============================= */
analyzeBtn.onclick=()=>{
  const selected = allScoredAlliances.filter(
    a=>selectedAlliances.get(a.alliance)===a.warzone
  );
  const matchups = buildMatchupMatrix(selected);
  window.__ACIS_RESULTS__={alliances:selected,matchups};
  resultsSection.classList.remove("hidden");
  renderResults();
};

/* =============================
   RENDER RESULTS
============================= */
function renderResults(){
  renderAllianceBlocks(window.__ACIS_RESULTS__.alliances);
  renderMatchups(window.__ACIS_RESULTS__.matchups);
}

/* =============================
   ALLIANCE CARDS
============================= */
function renderAllianceBlocks(alliances){
  const c=document.getElementById("allianceBlocks");
  c.innerHTML="";
  alliances.forEach(a=>{
    const marquee=[...a.activePlayers]
      .filter(p=>!p.assumed)
      .sort((x,y)=>y.effectivePower-x.effectivePower)
      .slice(0,5);

    const b=document.createElement("div");
    b.className="alliance-block";
    b.innerHTML=`
      <h3>${a.alliance} <small>(WZ ${a.warzone})</small></h3>
      <div class="stats">
        Active: ${formatPower(a.activePower)} |
        Bench: ${formatPower(a.benchPower)}
      </div>
      <div class="marquee">
        ${marquee.map(p=>`
          <div>${p.name}<span>${formatPower(p.totalPower)}</span></div>
        `).join("")}
      </div>
    `;
    c.appendChild(b);
  });
}

/* =============================
   MATCHUP ANALYSIS
============================= */
function analyzeMatchup(m, alliances){
  const A=alliances.find(x=>x.alliance===m.a);
  const B=alliances.find(x=>x.alliance===m.b);

  const winner = m.ratio>=1 ? m.a : m.b;
  const loser  = winner===m.a ? m.b : m.a;
  const ratio  = m.ratio>=1 ? m.ratio : 1/m.ratio;

  const factors=[];
  if(ratio>=1.3) factors.push({text:`${Math.round((ratio-1)*100)}% combat advantage`,type:"COMBAT_GAP"});
  if((A.tierCounts.MEGA_WHALE||0)!==(B.tierCounts.MEGA_WHALE||0))
    factors.push({text:"Mega Whale advantage",type:"MEGA_WHALE"});
  if(B.stabilityFactor<0.8)
    factors.push({text:"Lower squad stability",type:"STABILITY"});

  return {winner,loser,ratio,factors,outcome:ratio>=1.4?"Collapse Likely":"Advantage"};
}

/* =============================
   COLLAPSE INSIGHT
============================= */
function collapseInsight(loser, winner, ratio){
  const prob=Math.min(95,Math.max(5,
    Math.round((1-loser.stabilityFactor)*60+(1-ratio)*40)
  ));
  return {
    prob,
    text:`${loser.alliance} looks stronger on paper, but is fragile.
Power is concentrated in a few Mega Whales.
Under pressure, ${loser.alliance} collapses faster than ${winner.alliance},
allowing ${winner.alliance} to control the fight.`
  };
}

/* =============================
   MATCHUP RENDER
============================= */
function renderMatchups(matchups){
  const c=document.getElementById("matchupMatrix");
  c.innerHTML="<h2>Showdown Results</h2>";

  matchups.forEach(m=>{
    const a=analyzeMatchup(m,window.__ACIS_RESULTS__.alliances);
    const loserObj=window.__ACIS_RESULTS__.alliances.find(x=>x.alliance===a.loser);
    const winnerObj=window.__ACIS_RESULTS__.alliances.find(x=>x.alliance===a.winner);
    const col=collapseInsight(loserObj,winnerObj,a.ratio);

    const d=document.createElement("div");
    d.className="matchup-card";
    d.innerHTML=`
      <div class="verdict">
        🏆 ${a.winner} | 💥 ${a.loser}
      </div>

      <div>Collapse Probability: <b>${col.prob}%</b></div>

      <button class="collapse-toggle">Why ${a.loser} collapses ▾</button>
      <div class="collapse-panel hidden">
        <p>${col.text}</p>
        <ul>
          ${a.factors.map(f=>`
            <li class="factor" data-tooltip="${FACTOR_TOOLTIPS[f.type]}">
              ${f.text}
            </li>`).join("")}
        </ul>
      </div>
    `;
    c.appendChild(d);
  });
}

/* =============================
   TOGGLE PANELS
============================= */
document.addEventListener("click",e=>{
  if(!e.target.classList.contains("collapse-toggle"))return;
  const p=e.target.nextElementSibling;
  p.classList.toggle("hidden");
});

/* =============================
   HELPERS
============================= */
function formatPower(v){
  return (v/1e6).toFixed(1)+"M";
}

init();
