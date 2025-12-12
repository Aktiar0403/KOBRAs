// structures.js
console.log("✅ structures.js loaded");

import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* -----------------------------
   CONFIG
------------------------------*/
const WEEKS_COLLECTION = "desert_brawl_weeks";

/* Structure display order and settings */
const STRUCTURES = [
  { key: "Hospital I", max: 5 },
  { key: "Hospital II", max: 5 },
  { key: "Info Center", max: 5 },
  { key: "Oil Refinery", max: 5 },
  { key: "Science Hub", max: 5 },
  { key: "Nuclear Silo", max: 20 } // special: allows players already assigned elsewhere
];

/* -----------------------------
   STATE
------------------------------*/
let currentWeekId = null;
let currentTeam = "A";
let teamPlayers = []; // array of normalized players
let deployment = { structures: {} }; // structures -> array of assigned players (for silo too)
STRUCTURES.forEach(s => { deployment.structures[s.key] = []; });

/* -----------------------------
   DOM refs
------------------------------*/
const $ = (id) => document.getElementById(id);

const selectWeek = $("selectWeek");
const selectTeam = $("selectTeam");
const btnLoadTeam = $("btnLoadTeam");
const playersList = $("playersList");
const structuresGrid = $("structuresGrid");
const btnSave = $("btnSave");
const btnClear = $("btnClear");
const teamTotalPowerEl = $("teamTotalPower");
const totalAssignedEl = $("totalAssigned");

/* -----------------------------
   UTILITIES
------------------------------*/
function escapeHtml(s) { return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'", "&#39;"); }
function initials(name) {
  if (!name) return "";
  const p = name.trim().split(/\s+/);
  return (p[0][0] + (p[1]?.[0] || "")).toUpperCase();
}
function normalizePlayer(p) {
  return {
    id: p?.id || (p?.name ? `manual_${p.name}` : null),
    name: p?.name || "Unknown",
    power: Number(p?.power || 0),
    squad: (p?.squad || p?.squadPrimary || "").toUpperCase(),
    powerType: p?.powerType || "Precise"
  };
}

/* -----------------------------
   FIRESTORE: load weeks dropdown
------------------------------*/
async function refreshWeeks() {
  selectWeek.innerHTML = '<option value="">-- Select week --</option>';
  try {
    const snap = await getDocs(collection(db, WEEKS_COLLECTION));
    snap.docs.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.data().label || d.id;
      selectWeek.appendChild(opt);
    });
  } catch (err) {
    console.error("refreshWeeks error", err);
    alert("Failed to load weeks (see console).");
  }
}

/* -----------------------------
   LOAD TEAM FROM WEEK DOC
------------------------------*/
async function loadTeam(weekId, teamLetter) {
  if (!weekId) return alert("Choose a week first.");
  currentWeekId = weekId;
  currentTeam = teamLetter || "A";

  try {
    const docRef = doc(db, WEEKS_COLLECTION, weekId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return alert("Week not found.");
    const data = snap.data();

    const key = teamLetter === "B" ? "teamB" : "teamA";
    const mains = (data[key]?.main || []).map(normalizePlayer);
    const subs = (data[key]?.subs || []).map(normalizePlayer);

    teamPlayers = mains.concat(subs);

    // load saved deployment if present
    if (data.deployment && data.deployment.structures) {
      STRUCTURES.forEach(s => {
        const arr = data.deployment.structures[s.key] || [];
        deployment.structures[s.key] = arr.map(normalizePlayer);
      });
    } else {
      // reset deployment
      STRUCTURES.forEach(s => deployment.structures[s.key] = []);
    }

    renderPlayers();
    renderStructures();
    recalcTotals();
  } catch (err) {
    console.error("loadTeam error", err);
    alert("Failed to load team (see console).");
  }
}

/* -----------------------------
   RENDER PLAYERS LIST (draggable)
------------------------------*/
function renderPlayers() {
  playersList.innerHTML = "";
  teamPlayers.forEach(p => {
    const el = document.createElement("div");
    el.className = "player-item";
    el.draggable = true;
    el.dataset.id = p.id;
    el.dataset.name = p.name;
    el.dataset.power = p.power;
    el.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center">
        <div class="initial">${initials(p.name)}</div>
        <div>
          <div style="font-weight:700">${escapeHtml(p.name)}</div>
          <div style="font-size:12px;color:var(--muted)">${escapeHtml(p.squad)} • ${p.power}${p.powerType==='Approx' ? ' (≈)' : ''}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <div class="pill">${p.power}</div>
      </div>
    `;
    el.addEventListener("dragstart", onDragStart);
    el.addEventListener("dragend", onDragEnd);
    // click fallback for mobile: open a small contextual picker (not implemented here)
    playersList.appendChild(el);
  });
}

/* -----------------------------
   DRAG & DROP HANDLERS
------------------------------*/
let draggedPlayerId = null;
function onDragStart(e) {
  draggedPlayerId = e.currentTarget.dataset.id;
  e.dataTransfer?.setData("text/plain", draggedPlayerId);
  setTimeout(()=> e.currentTarget.classList.add("dragging"), 10);
}
function onDragEnd(e) {
  try { e.currentTarget.classList.remove("dragging"); } catch(e){}
  draggedPlayerId = null;
}

/* allow drops */
function allowDrop(ev) { ev.preventDefault(); ev.currentTarget.classList.add("over"); }
function leaveDrop(ev) { ev.currentTarget.classList.remove("over"); }

/* Drop handler for structure */
function handleDrop(ev, structureKey) {
  ev.preventDefault();
  ev.currentTarget.classList.remove("over");
  const id = ev.dataTransfer?.getData("text/plain");
  if (!id) return;
  const player = teamPlayers.find(x => x.id == id);
  if (!player) return alert("Player not found in team list.");

  // special rule: Nuclear Silo allows players even if already assigned elsewhere.
  const isSilo = structureKey === "Nuclear Silo";

  if (!isSilo && isPlayerAssigned(player.id)) {
    return alert("Player already assigned elsewhere. Remove before reassigning (unless assigning to Nuclear Silo).");
  }

  // ensure structure array exists
  if (!Array.isArray(deployment.structures[structureKey])) deployment.structures[structureKey] = [];

  // enforce max
  const limit = STRUCTURES.find(s=>s.key===structureKey)?.max || 5;
  if (deployment.structures[structureKey].length >= limit) {
    return alert(`${structureKey} already has ${limit} players.`);
  }

  // If this is NOT silo, push. If silo, pushing allowed regardless
  deployment.structures[structureKey].push({ ...player, note: "" });
  renderStructures();
  recalcTotals();
}

/* check globally assigned (excluding Nuclear Silo) */
function isPlayerAssigned(id) {
  if (!id) return false;
  for (const s of STRUCTURES) {
    if (s.key === "Nuclear Silo") continue; // exclude silo from uniqueness check
    const arr = deployment.structures[s.key] || [];
    if (arr.some(p => p.id === id)) return true;
  }
  // also check if assigned to the same structure multiple times (rare)
  return false;
}

/* remove assigned */
function removeAssigned(structKey, playerId) {
  const arr = deployment.structures[structKey] || [];
  const idx = arr.findIndex(x => x.id === playerId);
  if (idx >= 0) arr.splice(idx, 1);
  renderStructures();
  recalcTotals();
}

/* -----------------------------
   RENDER STRUCTURE CARDS
------------------------------*/
function renderStructures() {
  structuresGrid.innerHTML = "";
  STRUCTURES.forEach(s => {
    const key = s.key;
    const el = document.createElement("div");
    el.className = "structure-card panel";
    el.dataset.key = key;

    // header/top
    const top = document.createElement("div");
    top.className = "sc-top";
    const name = document.createElement("div");
    name.className = "sc-name";
    name.textContent = key;
    const stats = document.createElement("div");
    stats.className = "sc-stats";
    stats.innerHTML = `<div>Total Power: <strong id="power-${sanitizeKey(key)}">0</strong></div>
                       <div style="margin-top:6px" class="sc-squadcounts" id="counts-${sanitizeKey(key)}"></div>`;
    top.appendChild(name);
    top.appendChild(stats);

    // body list area
    const list = document.createElement("div");
    list.className = "sc-list";
    list.id = `list-${sanitizeKey(key)}`;

    // populate assigned players
    const arr = deployment.structures[key] || [];
    arr.forEach(p => {
      const row = document.createElement("div");
      row.className = "assigned-row";
      row.innerHTML = `
        <div class="assigned-left">
          <div class="initial">${initials(p.name)}</div>
          <div style="display:flex;flex-direction:column">
            <div style="font-weight:700">${escapeHtml(p.name)}</div>
            <div style="font-size:12px;color:var(--muted)">${escapeHtml(p.squad)} • ${p.power}</div>
            ${p.note ? `<div style="font-size:12px;color:#ffddaa;margin-top:4px">Note: ${escapeHtml(p.note)}</div>` : ""}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <div class="pill">${p.power}</div>
          <button class="btn" onclick="window._removeAssigned('${escapeJs(key)}','${escapeJs(p.id)}')">✖</button>
        </div>
      `;
      list.appendChild(row);
    });

    // footer actions
    const footer = document.createElement("div");
    footer.style.display = "flex";
    footer.style.justifyContent = "space-between";
    footer.style.alignItems = "center";
    footer.style.marginTop = "6px";

    const leftFooter = document.createElement("div");
    leftFooter.style.display = "flex";
    leftFooter.style.flexDirection = "column";
    leftFooter.style.gap = "6px";
    const info = document.createElement("div");
    info.style.fontSize = "13px";
    info.style.color = "var(--muted)";
    info.textContent = `${arr.length}/${s.max} assigned`;

    // squad count area (will be filled after)
    const countsWrap = document.createElement("div");
    countsWrap.id = `countsWrap-${sanitizeKey(key)}`;

    leftFooter.appendChild(info);
    leftFooter.appendChild(countsWrap);

    const rightFooter = document.createElement("div");
    const addBtn = document.createElement("button");
    addBtn.className = "btn";
    addBtn.textContent = "＋ Add";
    addBtn.addEventListener("click", () => openPickerForStructure(key));
    rightFooter.appendChild(addBtn);

    footer.appendChild(leftFooter);
    footer.appendChild(rightFooter);

    el.appendChild(top);
    el.appendChild(list);
    el.appendChild(footer);

    // drop handlers (allow drag & drop)
    list.ondragover = allowDrop;
    list.ondragleave = leaveDrop;
    list.ondrop = (ev) => handleDrop(ev, key);

    structuresGrid.appendChild(el);
  });

  // after building DOM, update power and squad counts
  STRUCTURES.forEach(s => updateStructureStats(s.key));
}

/* sanitize key for ids */
function sanitizeKey(k) { return k.replace(/\s+/g, "_").replace(/[^\w\-]/g,""); }
function escapeJs(s) { return String(s||"").replace(/'/g,"\\'").replace(/"/g,"\\\""); }

/* update power and squad counts for a structure */
function updateStructureStats(key) {
  const arr = deployment.structures[key] || [];
  const powerEl = $(`power-${sanitizeKey(key)}`);
  const countsEl = $(`counts-${sanitizeKey(key)}`);
  if (powerEl) powerEl.textContent = arr.reduce((s,p)=>s+Number(p.power||0),0);
  if (countsEl) {
    countsEl.innerHTML = "";
    const counts = { TANK:0, AIR:0, MISSILE:0, HYBRID:0, OTHER:0 };
    arr.forEach(p => {
      const sq = (p.squad||"").toUpperCase();
      if (sq.includes("TANK")) counts.TANK++;
      else if (sq.includes("AIR")) counts.AIR++;
      else if (sq.includes("MISSILE")) counts.MISSILE++;
      else if (sq.includes("HYBRID")) counts.HYBRID++;
      else counts.OTHER++;
    });
    // render pills
    const keys = ["TANK","AIR","MISSILE","HYBRID","OTHER"];
    keys.forEach(k => {
      const pill = document.createElement("div");
      pill.className = "pill";
      pill.style.fontSize = "11px";
      pill.style.padding = "4px 8px";
      pill.textContent = `${k}: ${counts[k]}`;
      pill.style.marginRight = "6px";
      countsEl.appendChild(pill);
    });
  }
}

/* -----------------------------
   PICKER MODAL (multi-select + notes)
   - For Nuclear Silo: show all players (even assigned)
   - For others: show only available players; disable assigned ones
------------------------------*/
function openPickerForStructure(structKey) {
  const isSilo = structKey === "Nuclear Silo";
  const maxLimit = STRUCTURES.find(s=>s.key===structKey)?.max || 5;
  // build overlay
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  const box = document.createElement("div");
  box.className = "picker";
  box.innerHTML = `<h3 style="margin:0;color:var(--accent)">${escapeHtml(structKey)} — Add players</h3>
    <div style="margin-top:6px;color:var(--muted)">Select players (max ${maxLimit}). ${isSilo ? "Nuclear Silo allows players already assigned elsewhere." : "Players already assigned to other structures are disabled."}</div>
    <input class="search" placeholder="Search name or squad">
    <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
      <div style="font-size:13px;color:var(--muted)">Selected:</div>
      <div id="pickerSelectedCount" style="font-weight:800;color:var(--accent)">0</div>
      <div style="margin-left:auto"><button id="pickerClear" class="btn">Clear</button></div>
    </div>
    <div class="picker-list" id="pickerList"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
      <button id="pickerCancel" class="btn">Cancel</button>
      <button id="pickerAssign" class="btn primary">Assign Selected</button>
    </div>
  `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const search = box.querySelector(".search");
  const pickerList = box.querySelector("#pickerList");
  const pickerSelectedCount = box.querySelector("#pickerSelectedCount");
  const pickerClear = box.querySelector("#pickerClear");
  const pickerCancel = box.querySelector("#pickerCancel");
  const pickerAssign = box.querySelector("#pickerAssign");

  // picker state map id -> { selected:bool, note:string }
  const state = {};

  // initialize all players into state; for non-silo mark disabled if assigned elsewhere
  teamPlayers.forEach(p => {
    const disabled = (!isSilo && isPlayerAssigned(p.id)); // if assigned elsewhere and not silo -> disabled
    state[p.id] = { player: p, selected: false, disabled: disabled, note: "" };
  });

  function renderPickerList() {
    pickerList.innerHTML = "";
    const q = (search.value||"").trim().toLowerCase();
    Object.values(state).forEach(entry => {
      const p = entry.player;
      if (q) {
        const hay = (p.name + " " + (p.squad||"") + " " + (p.power||"")).toLowerCase();
        if (!hay.includes(q)) return;
      }
      const row = document.createElement("div");
      row.className = "picker-entry" + (entry.disabled ? " disabled": "") + (entry.selected ? " selected": "");
      row.dataset.id = p.id;
      row.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center">
          <div class="initial">${initials(p.name)}</div>
          <div style="min-width:220px">
            <div style="font-weight:700">${escapeHtml(p.name)}</div>
            <div style="font-size:12px;color:var(--muted)">${escapeHtml(p.squad)} • ${p.power}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <div class="pill">${p.power}</div>
        </div>
      `;
      // clicking toggles selection unless disabled
      row.addEventListener("click", () => {
        if (entry.disabled) return;
        entry.selected = !entry.selected;
        row.classList.toggle("selected", entry.selected);
        renderSelectedCount();
        renderSelectedNotes();
      });
      pickerList.appendChild(row);
    });

    if (!pickerList.children.length) {
      const hint = document.createElement("div");
      hint.style.color = "#888";
      hint.style.padding = "10px";
      hint.textContent = "No players found.";
      pickerList.appendChild(hint);
    }
  }

  function renderSelectedCount() {
    const count = Object.values(state).filter(s=>s.selected).length;
    pickerSelectedCount.textContent = `${count}`;
  }

  // show selected player notes inputs (below list)
  function renderSelectedNotes() {
    // remove existing note inputs area
    const existing = box.querySelector(".picker-notes-area");
    if (existing) existing.remove();

    const selected = Object.values(state).filter(s=>s.selected);
    if (!selected.length) return;
    const wrap = document.createElement("div");
    wrap.className = "picker-notes-area";
    wrap.style.marginTop = "8px";
    wrap.innerHTML = `<div style="font-weight:700;margin-bottom:6px">Notes (per selected player)</div>`;
    selected.forEach(s => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "8px";
      row.style.alignItems = "center";
      row.style.marginBottom = "6px";
      row.innerHTML = `
        <div style="min-width:220px"><strong>${escapeHtml(s.player.name)}</strong> <div style="font-size:12px;color:var(--muted)">${escapeHtml(s.player.squad)} • ${s.player.power}</div></div>
        <input class="picker-note" placeholder="Note (visible)" value="${escapeHtml(s.note||'')}" />
      `;
      const input = row.querySelector(".picker-note");
      input.addEventListener("input", (e)=> { s.note = e.target.value; });
      wrap.appendChild(row);
    });
    box.appendChild(wrap);
  }

  function resetSelection() {
    Object.values(state).forEach(st => { if (!st.disabled) { st.selected=false; st.note=""; }});
    renderPickerList();
    renderSelectedCount();
    renderSelectedNotes();
  }

  pickerClear.addEventListener("click", resetSelection);
  pickerCancel.addEventListener("click", ()=> { try { overlay.remove(); } catch(e){} });

  pickerAssign.addEventListener("click", async () => {
    const selected = Object.values(state).filter(s=>s.selected).map(s=>({ ...s.player, note: s.note||"" }));
    if (!selected.length) return alert("Select at least one player.");
    const currentArr = deployment.structures[structKey] || [];
    const limit = STRUCTURES.find(x=>x.key===structKey)?.max || 5;
    if (currentArr.length + selected.length > limit) return alert(`Cannot add. ${structKey} max ${limit} players.`);
    // check uniqueness for non-silo
    if (structKey !== "Nuclear Silo") {
      for (const s of selected) {
        if (isPlayerAssigned(s.id)) return alert(`Player ${s.name} is already assigned elsewhere. Remove first.`);
      }
    }
    // push selected
    deployment.structures[structKey] = (deployment.structures[structKey] || []).concat(selected);
    renderStructures();
    recalcTotals();
    try { overlay.remove(); } catch(e){}
  });

  search.addEventListener("input", renderPickerList);

  // initial
  renderPickerList();
  renderSelectedCount();
}

/* -----------------------------
   Save deployment to Firestore
------------------------------*/
async function saveDeployment() {
  if (!currentWeekId) return alert("Load a week first.");
  // build payload
  const payload = { deployment: { structures: {} }, deploymentSavedAt: serverTimestamp ? serverTimestamp() : new Date().toISOString() };
  STRUCTURES.forEach(s => {
    const arr = (deployment.structures[s.key] || []).map(p => ({ id: p.id, name: p.name, power: p.power, squad: p.squad, note: p.note || "" }));
    payload.deployment.structures[s.key] = arr;
  });
  try {
    await setDoc(doc(db, WEEKS_COLLECTION, currentWeekId), payload, { merge: true });
    alert("Deployment saved.");
  } catch (err) {
    console.error("saveDeployment error", err);
    alert("Save failed (console).");
  }
  window.currentDeployment = structures;  // Store the deployment
   alert("Deployment Saved!");
}

/* -----------------------------
   Clear deployment (memory)
------------------------------*/
function clearDeployment() {
  if (!confirm("Clear deployment in memory? (Not saved)")) return;
  STRUCTURES.forEach(s => deployment.structures[s.key] = []);
  renderStructures();
  recalcTotals();
}

/* -----------------------------
   Recalc totals & assigned count
------------------------------*/
function recalcTotals() {
  // team total
  const teamSum = teamPlayers.reduce((s,p)=>s + Number(p.power||0),0);
  teamTotalPowerEl.textContent = teamSum;

  // assigned count across all structures (including silo)
  let assigned = 0;
  STRUCTURES.forEach(s => assigned += (deployment.structures[s.key] || []).length);
  totalAssignedEl.textContent = assigned;

  // update per-structure stats
  STRUCTURES.forEach(s => updateStructureStats(s.key));
}

/* -----------------------------
   Expose helper to remove (used by inline onclick)
------------------------------*/
window._removeAssigned = function(structKey, playerId) {
  removeAssigned(structKey, playerId);
};

/* -----------------------------
   INIT wiring
------------------------------*/
btnLoadTeam.addEventListener("click", () => {
  const weekId = selectWeek.value;
  const team = selectTeam.value || "A";
  if (!weekId) return alert("Choose a week.");
  loadTeam(weekId, team);
});
btnSave.addEventListener("click", saveDeployment);
btnClear.addEventListener("click", clearDeployment);

/* initial load */
(async function init(){
  await refreshWeeks();
  // initialize structure DOM & drop targets
  renderStructures();

  // allow player items to be draggable after teams load (they are added in renderPlayers)
  // nothing else needed here
})();
// ===============================
// NEW PRINT SYSTEM (Two Cards Per Row, JPG Output)
// ===============================

async function printDeploymentJPG() {
    if (!window.currentDeployment) {
        alert("Load or save a deployment first.");
        return;
    }

    const data = window.currentDeployment.structures;
    if (!data) {
        alert("No deployment data found.");
        return;
    }

    // Create print container
    const printContainer = document.createElement("div");
    printContainer.id = "printContainer";
    printContainer.style.width = "1200px";
    printContainer.style.background = "#05060a";
    printContainer.style.padding = "20px";
    printContainer.style.display = "grid";
    printContainer.style.gridTemplateColumns = "1fr 1fr";
    printContainer.style.gap = "20px";
    printContainer.style.color = "#e6eef0";
    printContainer.style.fontFamily = "Inter";

    // Build structure cards
    Object.entries(data).forEach(([key, players]) => {

        // total power
        const totalPower = players.reduce((s,p)=> s + Number(p.power || 0), 0);

        // squad counts
        const sq = { TANK:0, AIR:0, MISSILE:0, HYBRID:0, OTHER:0 };
        players.forEach(p=>{
            const s = (p.squad||"").toUpperCase();
            if (s.includes("TANK")) sq.TANK++;
            else if (s.includes("AIR")) sq.AIR++;
            else if (s.includes("MISSILE")) sq.MISSILE++;
            else if (s.includes("HYBRID")) sq.HYBRID++;
            else sq.OTHER++;
        });

        const card = document.createElement("div");
        card.style.background = "linear-gradient(180deg,#071018,#05070c)";
        card.style.border = "1px solid rgba(255,255,255,0.05)";
        card.style.borderRadius = "12px";
        card.style.padding = "16px";

        card.innerHTML = `
            <h2 style="color:#00ffc8;margin-top:0">${key}</h2>

            <div style="margin-bottom:8px;font-size:14px">
                <strong>Total Power:</strong> ${totalPower}
            </div>

            <div style="display:flex;gap:6px;margin-bottom:12px;">
                ${Object.entries(sq)
                    .filter(([k,v])=>v>0)
                    .map(([k,v])=>`
                        <div style="
                            padding:4px 8px;
                            background:rgba(255,255,255,0.05);
                            border-radius:8px;
                            font-size:11px;
                        ">${k}: ${v}</div>
                    `).join("")}
            </div>

            <div style="display:flex;flex-direction:column;gap:6px;">
                ${players.map(p => `
                    <div style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        background:rgba(255,255,255,0.03);
                        padding:8px;
                        border-radius:8px;
                    ">
                        <div>
                            <div style="font-weight:700">${p.name}</div>
                            <div style="font-size:12px;color:#93a3a6">
                                ${p.squad} • ${p.power}
                            </div>
                            ${p.note ? `<div style="font-size:12px;color:#ffddaa">Note: ${p.note}</div>` : ""}
                        </div>
                        <div style="font-weight:800;color:#00ffc8">${p.power}</div>
                    </div>
                `).join("")}
            </div>
        `;

        printContainer.appendChild(card);
    });

    document.body.appendChild(printContainer);

    // Convert to JPG
    const canvas = await html2canvas(printContainer, {
        backgroundColor: "#05060a",
        scale: 2
    });

    const img = canvas.toDataURL("image/jpeg", 0.95);

    // Download JPEG
    const link = document.createElement("a");
    link.download = "deployment.jpg";
    link.href = img;
    link.click();

    // Cleanup
    printContainer.remove();
}

// expose globally
window.printDeploymentJPG = printDeploymentJPG;
