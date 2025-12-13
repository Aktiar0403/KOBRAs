import { db } from "./firebase-config.js";
import {
  collection, getDocs, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const tableBody = document.getElementById("tableBody");
const dominanceGrid = document.getElementById("dominanceGrid");
const warzoneCards = document.getElementById("warzoneCards");
const allianceCards = document.getElementById("allianceCards");

let allPlayers = [];
let filters = { warzone:null, alliance:null, search:"" };

function classify(power){
  if(power>=180_000_000) return "Whale";
  if(power>=160_000_000) return "Shark";
  if(power>=140_000_000) return "Piranha";
  return "Normal";
}

async function loadData(){
  const snap = await getDocs(collection(db,"server_players"));
  allPlayers = snap.docs.map(d=>d.data());
  render();
}

function render(){
  let list = allPlayers.filter(p=>{
    if(filters.warzone && p.warzone!==filters.warzone) return false;
    if(filters.alliance && p.alliance!==filters.alliance) return false;
    if(filters.search && !p.name.toLowerCase().includes(filters.search)) return false;
    return true;
  });

  // Table
  tableBody.innerHTML="";
  list.forEach(p=>{
    tableBody.innerHTML+=`
      <tr>
        <td>${p.rank}</td>
        <td>${p.name}</td>
        <td>${p.alliance}</td>
        <td>${p.warzone}</td>
        <td>${p.totalPower.toLocaleString()}</td>
        <td>${classify(p.totalPower)}</td>
      </tr>`;
  });

  renderDominance(list);
}

function renderDominance(list){
  dominanceGrid.innerHTML="";
  const byWarzone = {};
  list.forEach(p=>{
    byWarzone[p.warzone] ??= {};
    byWarzone[p.warzone][p.alliance] ??= 0;
    byWarzone[p.warzone][p.alliance] += p.totalPower;
  });

  Object.entries(byWarzone).forEach(([wz,alliances])=>{
    const total = Object.values(alliances).reduce((a,b)=>a+b,0);
    Object.entries(alliances).forEach(([a,p])=>{
      const pct = ((p/total)*100).toFixed(1);
      dominanceGrid.innerHTML+=`
        <div class="dom-card">
          <strong>${a}</strong><br>
          Warzone ${wz}<br>
          Dominance: <b>${pct}%</b>
        </div>`;
    });
  });
}

loadData();
