// deployment.js
console.log("✅ deployment.js loaded");

import { db } from './firebase-config.js';
import {
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ========== DOM refs ========== */
const $ = id => document.getElementById(id);
const selectWeek = $('selectWeek');
const selectTeam = $('selectTeam');
const btnLoadTeam = $('btnLoadTeam');
const playersList = $('playersList');
const hospital1Drop = $('hospital1Drop');
const hospital2Drop = $('hospital2Drop');
const hospital1Power = $('hospital1Power');
const hospital2Power = $('hospital2Power');
const teamTotalPowerEl = $('teamTotalPower');
const assignedCountEl = $('assignedCount');
const btnSaveDeployment = $('btnSaveDeployment');
const btnClearDeployment = $('btnClearDeployment');

/* Other structures */
const structureKeys = ['Info Center','Oil Refinery','Science Hub'];

/* state */
let currentWeekId = null;
let currentTeam = 'A';
let teamPlayers = []; // combined mains + subs: { id,name,power,squad,powerType }
let deployment = {
  hospitals: { Hosp1: [], Hosp2: [] },
  structures: {} // key -> single player or null
};
structureKeys.forEach(k => deployment.structures[k] = null);

/* ========== helper: load weeks into dropdown ========== */
async function refreshWeeks() {
  selectWeek.innerHTML = '<option value="">-- Select week --</option>';
  try {
    const snap = await getDocs(collection(db, 'desert_brawl_weeks'));
    snap.docs.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.data().label || d.id;
      selectWeek.appendChild(opt);
    });
  } catch (err) {
    console.error('refreshWeeks error', err);
    alert('Failed to load weeks (see console).');
  }
}

/* ========== load team players from week doc ========== */
async function loadTeamFromWeek(weekId, teamLetter) {
  if (!weekId) return alert('Choose a week first.');
  currentWeekId = weekId;
  currentTeam = teamLetter || 'A';

  try {
    const docRef = doc(db, 'desert_brawl_weeks', weekId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return alert('Week not found');
    const data = snap.data();
    const teamKey = teamLetter === 'B' ? 'teamB' : 'teamA';
    const mains = (data[teamKey]?.main || []).map(p => normalizePlayer(p));
    const subs = (data[teamKey]?.subs || []).map(p => normalizePlayer(p));
    // combine mains then subs (20 mains + 10 subs expected)
    teamPlayers = mains.concat(subs);
    // load saved deployment if present
    if (data.deployment) {
      deployment.hospitals.Hosp1 = (data.deployment.hospitals?.Hosp1 || []).map(p=>normalizePlayer(p));
      deployment.hospitals.Hosp2 = (data.deployment.hospitals?.Hosp2 || []).map(p=>normalizePlayer(p));
      structureKeys.forEach(k => {
        const sp = data.deployment.structures?.[k];
        deployment.structures[k] = sp ? normalizePlayer(sp) : null;
      });
    } else {
      deployment = { hospitals: { Hosp1: [], Hosp2: [] }, structures: {} };
      structureKeys.forEach(k => deployment.structures[k] = null);
    }

    renderPlayersList();
    renderDeploymentUI();
    recalcAll();
  } catch (err) {
    console.error('loadTeamFromWeek error', err);
    alert('Failed to load team (see console).');
  }
}

function normalizePlayer(p) {
  return {
    id: p?.id || (p?.name ? `manual_${p.name}` : null),
    name: p?.name || 'Unknown',
    power: Number(p?.power || 0),
    squad: (p?.squad || p?.squadPrimary || '') || '',
    powerType: p?.powerType || 'Precise'
  };
}

/* ========== Render players list (draggable) ========== */
function renderPlayersList() {
  playersList.innerHTML = '';
  teamPlayers.forEach(p => {
    const item = document.createElement('div');
    item.className = 'player-item';
    item.draggable = true;
    item.dataset.id = p.id;
    item.dataset.name = p.name;
    item.dataset.power = p.power;
    item.innerHTML = `
      <div class="player-left">
        <div class="player-initial">${generateInitials(p.name)}</div>
        <div>
          <div class="player-name">${escapeHtml(p.name)}</div>
          <div class="player-meta">${escapeHtml(p.squad)} • ${p.power}${p.powerType === 'Approx' ? ' (≈)' : ''}</div>
        </div>
      </div>
      <div class="player-badge badge">${p.power}</div>
    `;
    // drag events
    item.addEventListener('dragstart', onDragStart);
    item.addEventListener('dragend', onDragEnd);
    // touch fallback: tap to select then choose target (mobile)
    item.addEventListener('click', (e) => {
      // highlight and allow tap assign on mobile — implement quick assign later if needed
    });
    playersList.appendChild(item);
  });
}

/* ========== Drag handlers ========== */
let draggedEl = null;
function onDragStart(e) {
  draggedEl = e.currentTarget;
  e.dataTransfer?.setData('text/plain', draggedEl.dataset.id);
  e.dataTransfer?.setData('text/json', JSON.stringify({
    id: draggedEl.dataset.id,
    name: draggedEl.dataset.name,
    power: draggedEl.dataset.power
  }));
  setTimeout(()=> draggedEl.classList.add('dragging'), 10);
}

function onDragEnd(e) {
  if (draggedEl) draggedEl.classList.remove('dragging');
  draggedEl = null;
}

/* ========== Drop wiring for hospitals and structures ========== */
function allowDrop(ev) {
  ev.preventDefault();
  ev.currentTarget.classList.add('over');
}
function leaveDrop(ev) {
  ev.currentTarget.classList.remove('over');
}
function handleDropOnHospital(ev, hospKey) {
  ev.preventDefault();
  ev.currentTarget.classList.remove('over');
  const id = ev.dataTransfer?.getData('text/plain');
  if (!id) return;
  const player = teamPlayers.find(p=>p.id==id);
  if (!player) return alert('Player not found in team list.');

  // check if already assigned somewhere
  if (isPlayerAssigned(player.id)) {
    return alert('Player already assigned to another structure. Remove first to reassign.');
  }

  // enforce max 5 on hospitals
  const arr = (hospKey === 'Hosp1') ? deployment.hospitals.Hosp1 : deployment.hospitals.Hosp2;
  if (arr.length >= 5) return alert('Max 5 players allowed in this hospital.');

  arr.push({...player});
  renderDeploymentUI();
  recalcAll();
}

function handleDropOnStructure(ev, structKey) {
  ev.preventDefault();
  ev.currentTarget.classList.remove('over');

  const id = ev.dataTransfer?.getData('text/plain');
  if (!id) return;

  const player = teamPlayers.find(p => p.id == id);
  if (!player) return alert("Player not found in team list.");

  // Check if already assigned somewhere
  if (isPlayerAssigned(player.id)) {
    return alert("Player already assigned to another location. Remove first to reassign.");
  }

  // Initialize structure array if empty
  if (!Array.isArray(deployment.structures[structKey])) {
    deployment.structures[structKey] = [];
  }

  // Enforce max 5
  if (deployment.structures[structKey].length >= 5) {
    return alert(structKey + " already has 5 players.");
  }

  // Push new player
  deployment.structures[structKey].push({ ...player });

  renderDeploymentUI();
  recalcAll();
}


/* check if player assigned anywhere */
function isPlayerAssigned(id) {
  if (!id) return false;
  // hospitals
  if (deployment.hospitals.Hosp1.some(p=>p.id==id)) return true;
  if (deployment.hospitals.Hosp2.some(p=>p.id==id)) return true;
  // structures
  for (const k of Object.keys(deployment.structures)) {
    const s = deployment.structures[k];
    if (s && s.id == id) return true;
  }
  return false;
}

/* remove assignment */
function removeAssignedFrom(hint) {
  // hint: { type: 'hospital'|'structure', key: 'Hosp1'|'Info Center', playerId }
  if (hint.type === 'hospital') {
    const arr = hint.key === 'Hosp1' ? deployment.hospitals.Hosp1 : deployment.hospitals.Hosp2;
    const idx = arr.findIndex(x=>x.id==hint.playerId);
    if (idx>=0) arr.splice(idx,1);
  } else {
    if (deployment.structures[hint.key] && deployment.structures[hint.key].id == hint.playerId) {
      deployment.structures[hint.key] = null;
    }
  }
  renderDeploymentUI();
  recalcAll();
}

/* ========== Render deployment UI ========== */
function renderDeploymentUI() {
  // hospitals
  hospital1Drop.innerHTML = '';
  hospital2Drop.innerHTML = '';

  deployment.hospitals.Hosp1.forEach(p => {
    const el = createAssignedItem(p, 'hospital', 'Hosp1');
    hospital1Drop.appendChild(el);
  });
  deployment.hospitals.Hosp2.forEach(p => {
    const el = createAssignedItem(p, 'hospital', 'Hosp2');
    hospital2Drop.appendChild(el);
  });

  // structures: show assigned or placeholder
  structureKeys.forEach(k => {
    const holder = $(`struct-${k}`);
    const nameEl = $(`struct-${k}-player`);
    const powerEl = $(`struct-${k}-power`);
    const players = deployment.structures[k] || [];
let totalPower = 0;

nameEl.innerHTML = '';
players.forEach(p => {
  totalPower += Number(p.power || 0);
  const row = document.createElement('div');
  row.style.display = "flex";
  row.style.justifyContent = "space-between";
  row.style.alignItems = "center";
  row.style.marginBottom = "4px";

  row.innerHTML = `
    <div>${escapeHtml(p.name)} (${p.power})</div>
    <button class="btn" style="padding:4px 6px"
      onclick="window.removeAssignmentFromUI('structure','${k}','${p.id}')">✖</button>
  `;

  nameEl.appendChild(row);
});

powerEl.textContent = totalPower;

    // make structure accept drops
    holder.ondragover = allowDrop;
    holder.ondragleave = leaveDrop;
    holder.ondrop = (ev) => handleDropOnStructure(ev, k);
    // add remove button if assigned
    // we will add a clickable remove if assigned
    
  });

  // counts + totals
  recalcAll();

  // wire drop areas
  hospital1Drop.ondragover = allowDrop;
  hospital1Drop.ondragleave = leaveDrop;
  hospital1Drop.ondrop = (ev) => handleDropOnHospital(ev, 'Hosp1');

  hospital2Drop.ondragover = allowDrop;
  hospital2Drop.ondragleave = leaveDrop;
  hospital2Drop.ondrop = (ev) => handleDropOnHospital(ev, 'Hosp2');
}

/* create assigned element with remove control */
function createAssignedItem(player, type, key) {
  const el = document.createElement('div');
  el.className = 'player-item';
  el.innerHTML = `
    <div class="player-left">
      <div class="player-initial">${generateInitials(player.name)}</div>
      <div>
        <div class="player-name">${escapeHtml(player.name)}</div>
        <div class="player-meta">${escapeHtml(player.squad)} • ${player.power}</div>
      </div>
    </div>
    <div style="display:flex;gap:6px;align-items:center">
      <div class="player-badge badge">${player.power}</div>
      <button class="btn" style="padding:6px 8px" onclick="window.removeAssignmentFromUI('${type}','${key}','${player.id}')">Remove</button>
    </div>
  `;
  return el;
}

/* global helpers exposed for inline onclicks */
window.removeAssignmentFromUI = function(type,key,playerId) {
  removeAssignedFrom({ type, key, playerId });
};
window.removeAssignment = function(structKey, playerId) {
  const arr = deployment.structures[structKey];
  if (!Array.isArray(arr)) return;

  const idx = arr.findIndex(p => p.id === playerId);
  if (idx >= 0) arr.splice(idx, 1);

  renderDeploymentUI();
  recalcAll();
};


/* ========== Recalculate powers and counts ========== */
function recalcAll() {
  const sum = (arr) => arr.reduce((s,p)=>s+Number(p.power||0),0);
  const hosp1Pow = sum(deployment.hospitals.Hosp1);
  const hosp2Pow = sum(deployment.hospitals.Hosp2);
  hospital1Power.textContent = hosp1Pow;
  hospital2Power.textContent = hosp2Pow;

  // team totals (sum of all players, assigned or not)
  const teamSum = teamPlayers.reduce((s,p)=>s+Number(p.power||0),0);
  teamTotalPowerEl.textContent = teamSum;

  // assigned count
  let countAssigned = 0;
  countAssigned += deployment.hospitals.Hosp1.length;
  countAssigned += deployment.hospitals.Hosp2.length;
  for (const k of Object.keys(deployment.structures)) if (deployment.structures[k]) countAssigned++;
  assignedCountEl.textContent = countAssigned;
}

/* ========== Save deployment back to week doc ========== */
async function saveDeployment() {
  if (!currentWeekId) return alert('Load a week first.');
  const payload = {
    deployment: {
      hospitals: {
        Hosp1: deployment.hospitals.Hosp1.map(p => ({ id:p.id, name:p.name, power:p.power, squad:p.squad })),
        Hosp2: deployment.hospitals.Hosp2.map(p => ({ id:p.id, name:p.name, power:p.power, squad:p.squad }))
      },
      structures: {}
    },
    deploymentSavedAt: serverTimestamp ? serverTimestamp() : new Date().toISOString()
  };
  structureKeys.forEach(k => {
    payload.deployment.structures[k] = deployment.structures[k] ? { id: deployment.structures[k].id, name: deployment.structures[k].name, power: deployment.structures[k].power, squad: deployment.structures[k].squad } : null;
  });

  try {
    await setDoc(doc(db, 'desert_brawl_weeks', currentWeekId), payload, { merge: true });
    alert('Deployment saved.');
  } catch (err) {
    console.error('saveDeployment error', err);
    alert('Save failed (see console).');
  }
}

/* ========== Clear deployment (memory) ========== */
function clearDeployment() {
  if (!confirm('Clear current deployment (not saved)?')) return;
  deployment = { hospitals: { Hosp1: [], Hosp2: [] }, structures: {} };
  structureKeys.forEach(k => deployment.structures[k] = null);
  renderDeploymentUI();
}

/* ========== Utils ========== */
function escapeHtml(s) {
  return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
function generateInitials(name) {
  if (!name) return '';
  const p = name.trim().split(/\s+/);
  return (p[0][0] + (p[1]?.[0] || '')).toUpperCase();
}

/* ========== Init & wiring ========== */
btnLoadTeam.addEventListener('click', () => {
  const weekId = selectWeek.value;
  const team = selectTeam.value || 'A';
  if (!weekId) return alert('Choose a week.');
  loadTeamFromWeek(weekId, team);
});

btnSaveDeployment.addEventListener('click', saveDeployment);
btnClearDeployment.addEventListener('click', clearDeployment);

/* expose a few helpers for dev console */
window._deploymentState = () => ({ currentWeekId, currentTeam, teamPlayers, deployment });

/* initial */
(async function init(){
  await refreshWeeks();
  // create drop area listeners
  hospital1Drop.ondragover = allowDrop;
  hospital1Drop.ondragleave = leaveDrop;
  hospital1Drop.ondrop = (ev)=>handleDropOnHospital(ev,'Hosp1');
  hospital2Drop.ondragover = allowDrop;
  hospital2Drop.ondragleave = leaveDrop;
  hospital2Drop.ondrop = (ev)=>handleDropOnHospital(ev,'Hosp2');
  // structures drop wiring done in renderDeploymentUI
})();
