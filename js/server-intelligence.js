console.log("✅ Server Intelligence JS loaded");

import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const tbody = document.getElementById("tableBody");
let rows = [];

/* ---------------- RENDER ---------------- */
function render(data){
  tbody.innerHTML = "";
  data.forEach(r=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.rank}</td>
      <td><span class="pill">${r.alliance}</span></td>
      <td>${r.name}</td>
      <td>${r.warzone}</td>
      <td>${r.power.toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ---------------- FILTER ---------------- */
function applyFilters(){
  let out = [...rows];
  const q = searchInput.value.toLowerCase();
  const wz = warzoneFilter.value;

  if(q){
    out = out.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.alliance.toLowerCase().includes(q)
    );
  }
  if(wz){
    out = out.filter(r => String(r.warzone) === wz);
  }

  if(sortSelect.value === "rank") out.sort((a,b)=>a.rank-b.rank);
  if(sortSelect.value === "power") out.sort((a,b)=>b.power-a.power);
  if(sortSelect.value === "warzone") out.sort((a,b)=>a.warzone-b.warzone);

  render(out);
}

/* ---------------- EXCEL IMPORT ---------------- */
importExcel.onclick = () => {
  const file = fileInput.files[0];
  if(!file) return alert("Select an Excel/CSV file.");

  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(e.target.result,{type:"binary"});
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet,{defval:""});

    rows = json.map(r=>({
      rank:Number(r.Rank),
      alliance:String(r.Alliance).trim(),
      name:String(r.Name).trim(),
      warzone:Number(r.Warzone),
      power:Number(r["Total Power"])
    })).filter(r=>r.name && r.warzone);

    applyFilters();
  };
  reader.readAsBinaryString(file);
};

/* ---------------- PASTE IMPORT ---------------- */
importPaste.onclick = () => {
  const lines = pasteInput.value.split("\n").map(l=>l.trim()).filter(Boolean);

  const parsed = [];
  for(const line of lines){
    // 200. [aJeO] Miu Miu — Warzone #712 — 130,734,809
    const m = line.match(/^(\d+)\.\s+\[([^\]]+)\]\s+(.+?)\s+—\s+Warzone\s+#(\d+)\s+—\s+([\d,]+)/i);
    if(!m) continue;

    parsed.push({
      rank:Number(m[1]),
      alliance:m[2],
      name:m[3],
      warzone:Number(m[4]),
      power:Number(m[5].replace(/,/g,""))
    });
  }

  if(!parsed.length) return alert("No valid lines detected.");
  rows = rows.concat(parsed);
  applyFilters();
};

clearPaste.onclick = () => pasteInput.value = "";

/* ---------------- SAVE TO FIRESTORE ---------------- */
saveToDB.onclick = async () => {
  if(!rows.length) return alert("No data to save.");

  if(!confirm(`Save ${rows.length} records to Firestore?`)) return;

  try{
    for(const r of rows){
      await addDoc(collection(db,"server_players"),{
        rank:r.rank,
        alliance:r.alliance,
        name:r.name,
        warzone:r.warzone,
        totalPower:r.power,
        importedAt: serverTimestamp()
      });
    }
    alert("Saved to Firestore.");
  }catch(e){
    console.error(e);
    alert("Save failed. See console.");
  }
};

/* ---------------- EVENTS ---------------- */
searchInput.oninput = applyFilters;
warzoneFilter.oninput = applyFilters;
sortSelect.onchange = applyFilters;
