// positions.js
console.log('✅ positions.js loaded');

import { db } from './firebase-config.js';
import {
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ========== CONFIG ========== */
// same collection name your main file uses
const WEEKS_COLLECTION = 'desert_brawl_weeks';

// Map hotspots coordinates are percentages (x%, y%) relative to container.
// tweak these visually to match your map image placement
const MAP_SPOTS = [
  { key: 'Info Center', x: 18, y: 8 },
  { key: 'Arsenal', x: 50, y: 12 },
  { key: 'Nuclear Silo', x: 50, y: 44 },
  { key: 'Field Hospital I', x: 12, y: 66 },
  { key: 'Field Hospital II', x: 88, y: 26 },
  { key: 'Field Hospital III', x: 44, y: 76 },
  { key: 'Field Hospital IV', x: 86, y: 8 },
  { key: 'Oil Refinery I', x: 8, y: 26 },
  { key: 'Oil Refinery II', x: 92, y: 76 },
  { key: 'Science Hub', x: 74, y: 82 },
  { key: 'Mercenary Factory', x: 50, y: 88 }
];

// local state
let currentWeekId = null;
let weekData = null; // loaded doc data
let positions = { teamA: {}, teamB: {} }; // maps: posName -> playerId
let teamAMembers = []; // arrays of player objects
let teamBMembers = [];

/* ====== DOM refs ====== */
const $ = id => document.getElementById(id);
const savedWeeksSel = $('savedWeeks');
const loadWeekBtn = $('loadWeek');
const savePositionsBtn = $('savePositions');
const teamAList = $('teamAList');
const teamBList = $('teamBList');
const mapInner = $('mapInner');
const currentWeekLabel = $('currentWeekLabel');
const clearPositionsBtn = $('clearPositions');
const exportPNGBtn = $('exportPNG');

/* ========== Helpers ========== */
function empty(el) { while (el.firstChild) el.removeChild(el.firstChild); }

function makePlayerChip(p, assignedPos) {
  const wrap = document.createElement('div');
  wrap.className = 'player-chip';
  const left = document.createElement('div');
  left.innerHTML = `<div class="player-name">${p.name}</div><div class="player-meta">${p.squad || ''} • ${p.power ?? 0}</div>`;
  const right = document.createElement('div');
  right.style.display = 'flex'; right.style.flexDirection = 'column'; right.style.alignItems = 'flex-end';
  const posLabel = document.createElement('div'); posLabel.className='small';
  posLabel.textContent = assignedPos ? `📍 ${assignedPos}` : '—';
  right.appendChild(posLabel);

  wrap.appendChild(left);
  wrap.appendChild(right);
  return wrap;
}

function normalizeLoadedPlayer(p) {
  return {
    id: p.id || null,
    name: p.name || '',
    power: p.power ?? 0,
    squad: (p.squad || '').toUpperCase(),
    powerType: p.powerType || 'Precise',
    position: p.position || null
  };
}

/* ========== Firestore: saved weeks list & load ========== */
async function refreshSavedWeeks() {
  empty(savedWeeksSel);
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '-- Select week --';
  savedWeeksSel.appendChild(placeholder);

  try {
    const snap = await getDocs(collection(db, WEEKS_COLLECTION));
    snap.docs.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.data().label || d.id;
      savedWeeksSel.appendChild(opt);
    });
  } catch (e) {
    console.error('refreshSavedWeeks error', e);
    alert('Failed to load saved weeks (check console).');
  }
}

async function loadWeekById(id) {
  if (!id) return;
  try {
    const ref = doc(db, WEEKS_COLLECTION, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return alert('Week doc not found');
    const data = snap.data();
    weekData = data;
    currentWeekId = id;
    currentWeekLabel.textContent = data.label || id;

    // team arrays (normalize)
    teamAMembers = (data.teamA?.main || []).concat(data.teamA?.subs || []).map(normalizeLoadedPlayer);
    teamBMembers = (data.teamB?.main || []).concat(data.teamB?.subs || []).map(normalizeLoadedPlayer);

    // positions if exist -> convert to maps
    positions = { teamA: {}, teamB: {} };
    if (data.positions?.teamA) {
      data.positions.teamA.forEach(p => { if (p.pos) positions.teamA[p.pos] = p.id; });
    }
    if (data.positions?.teamB) {
      data.positions.teamB.forEach(p => { if (p.pos) positions.teamB[p.pos] = p.id; });
    }

    renderAll();
  } catch (e) {
    console.error('loadWeekById error', e);
    alert('Failed to load week.');
  }
}

/* ========== Renderers ========== */
function renderAll() {
  renderTeamLists();
  renderMap();
}

function renderTeamLists() {
  empty(teamAList); empty(teamBList);

  // Team A
  teamAMembers.forEach(p => {
    const assigned = findPosByPlayerId(p.id, 'teamA');
    const chip = makePlayerChip(p, assigned);
    teamAList.appendChild(chip);
  });

  // Team B
  teamBMembers.forEach(p => {
    const assigned = findPosByPlayerId(p.id, 'teamB');
    const chip = makePlayerChip(p, assigned);
    teamBList.appendChild(chip);
  });
}

function findPosByPlayerId(pid, teamKey) {
  const map = positions[teamKey] || {};
  for (const [pos, id] of Object.entries(map)) {
    if (id === pid) return pos;
  }
  return null;
}

function playerAssigned(pid) {
  if (!pid) return null;
  const a = findPosByPlayerId(pid, 'teamA');
  if (a) return { team: 'A', pos: a };
  const b = findPosByPlayerId(pid, 'teamB');
  if (b) return { team: 'B', pos: b };
  return null;
}

function renderMap() {
  // remove existing hotspots
  const existing = mapInner.querySelectorAll('.hotspot');
  existing.forEach(n => n.remove());

  // create hotspots based on MAP_SPOTS
  MAP_SPOTS.forEach(spot => {
    const el = document.createElement('div');
    el.className = 'hotspot';
    el.style.left = spot.x + '%';
    el.style.top  = spot.y + '%';
    el.dataset.key = spot.key;

    // assigned marker dot
    const dot = document.createElement('div'); dot.className = 'dot';
    el.appendChild(dot);

    // show assigned when present
    const assignedA = positions.teamA[spot.key];
    const assignedB = positions.teamB[spot.key];
    const assignedId = assignedA || assignedB || null;
    if (assignedId) {
      el.classList.add('assigned');
      const label = document.createElement('div'); label.className = 'hotspot-label';
      // find player name
      const pname = findPlayerNameById(assignedId);
      label.textContent = `${pname || 'Assigned'} (${assignedA ? 'A' : 'B'})`;
      el.appendChild(label);
    }

    el.addEventListener('click', () => onHotspotClick(spot.key));
    mapInner.appendChild(el);
  });
}

function findPlayerNameById(pid) {
  const m = teamAMembers.concat(teamBMembers).find(x => x.id === pid);
  return m ? m.name : '';
}

/* ========== Hotspot click -> picker popup ========== */
function onHotspotClick(spotKey) {
  // open picker modal showing:
  // - current assignment (if any) with an "Unassign" option
  // - list of available players from Team A and Team B (not currently assigned)
  // - allow selecting any (also allow to choose from the team the spot was originally used by)
  openPickerModal(spotKey);
}

function openPickerModal(spotKey) {
  // build overlay DOM
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed'; overlay.style.inset = '0'; overlay.style.background = 'rgba(0,0,0,0.6)';
  overlay.style.display = 'flex'; overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center';
  overlay.style.zIndex = 21000;

  const box = document.createElement('div');
  box.className = 'picker-modal';

  const title = document.createElement('h3');
  title.style.margin = 0;
  title.style.color = '#00ffc8';
  title.textContent = `Assign position: ${spotKey}`;
  box.appendChild(title);

  // currently assigned players
  const curA = positions.teamA[spotKey] || null;
  const curB = positions.teamB[spotKey] || null;

  const curWrap = document.createElement('div');
  curWrap.style.marginTop = '8px';
  curWrap.innerHTML = `<div class="small muted">Current:</div>`;
  const curList = document.createElement('div'); curList.style.display='flex'; curList.style.flexDirection='column'; curList.style.gap='6px'; curList.style.marginTop='6px';
  if (!curA && !curB) {
    const none = document.createElement('div'); none.className='small muted'; none.textContent = '— unassigned —';
    curList.appendChild(none);
  } else {
    if (curA) {
      const p = teamAMembers.find(x => x.id === curA);
      const el = document.createElement('div'); el.className='picker-entry';
      el.innerHTML = `<div>${p?.name || 'Unknown'} (Team A)</div><div><button class="btn" id="unassignA">Unassign</button></div>`;
      curList.appendChild(el);
      el.querySelector('#unassignA').addEventListener('click', () => {
        delete positions.teamA[spotKey];
        document.body.removeChild(overlay);
        renderAll();
      });
    }
    if (curB) {
      const p = teamBMembers.find(x => x.id === curB);
      const el = document.createElement('div'); el.className='picker-entry';
      el.innerHTML = `<div>${p?.name || 'Unknown'} (Team B)</div><div><button class="btn" id="unassignB">Unassign</button></div>`;
      curList.appendChild(el);
      el.querySelector('#unassignB').addEventListener('click', () => {
        delete positions.teamB[spotKey];
        document.body.removeChild(overlay);
        renderAll();
      });
    }
  }
  box.appendChild(curWrap);
  box.appendChild(curList);

  // available players header
  const availTitle = document.createElement('div'); availTitle.style.marginTop='8px'; availTitle.innerHTML = `<div class="small muted">Available players</div>`;
  box.appendChild(availTitle);

  const listWrap = document.createElement('div'); listWrap.className='picker-list';

  // helper: mark player disabled if assigned somewhere else
  const isAssignedGlobally = (pid) => {
    if (!pid) return false;
    return (Object.values(positions.teamA).includes(pid) || Object.values(positions.teamB).includes(pid));
  };

  // Add Team A players
  teamAMembers.forEach(p => {
    const isAssigned = isAssignedGlobally(p.id);
    const entry = document.createElement('div');
    entry.className = 'picker-entry' + (isAssigned ? ' disabled' : '');
    entry.innerHTML = `<div>${p.name} <span class="small muted">• ${p.squad}</span></div><div class="small">${p.power}</div>`;
    entry.addEventListener('click', () => {
      if (isAssigned) return alert('This player is already assigned to a position.');
      // assign to teamA
      // ensure same pos not used by other team (we keep unique)
      // remove any existing assignment for this player (defensive)
      removePlayerAssignments(p.id);
      positions.teamA[spotKey] = p.id;
      document.body.removeChild(overlay);
      renderAll();
    });
    listWrap.appendChild(entry);
  });

  // Add separator then Team B players
  const sep = document.createElement('div'); sep.style.height='8px';
  box.appendChild(listWrap);
  box.appendChild(sep);

  teamBMembers.forEach(p => {
    const isAssigned = isAssignedGlobally(p.id);
    const entry = document.createElement('div');
    entry.className = 'picker-entry' + (isAssigned ? ' disabled' : '');
    entry.innerHTML = `<div>${p.name} <span class="small muted">• ${p.squad}</span></div><div class="small">${p.power}</div>`;
    entry.addEventListener('click', () => {
      if (isAssigned) return alert('This player is already assigned to a position.');
      removePlayerAssignments(p.id);
      positions.teamB[spotKey] = p.id;
      document.body.removeChild(overlay);
      renderAll();
    });
    listWrap.appendChild(entry);
  });

  // actions
  const actions = document.createElement('div'); actions.className='picker-actions';
  const closeBtn = document.createElement('button'); closeBtn.className='btn'; closeBtn.textContent='Close';
  closeBtn.addEventListener('click', () => { try { document.body.removeChild(overlay); } catch(e){} });
  actions.appendChild(closeBtn);
  box.appendChild(actions);

  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

/* remove any existing assignments for the player across both teams */
function removePlayerAssignments(pid) {
  Object.keys(positions.teamA).forEach(k => { if (positions.teamA[k] === pid) delete positions.teamA[k]; });
  Object.keys(positions.teamB).forEach(k => { if (positions.teamB[k] === pid) delete positions.teamB[k]; });
}

/* ========== Save positions back to Firestore ========== */
async function savePositionsToWeek() {
  if (!currentWeekId) return alert('No week loaded.');
  // turn positions maps into arrays [ { id, name, pos } ]
  const prepareArr = (map, membersList) => {
    return Object.entries(map).map(([pos, id]) => {
      const p = membersList.find(x => x.id === id) || { name: 'Unknown' };
      return { id, name: p.name || '', pos };
    });
  };

  const payload = {
    positions: {
      teamA: prepareArr(positions.teamA, teamAMembers),
      teamB: prepareArr(positions.teamB, teamBMembers)
    },
    positionsSavedAt: serverTimestamp ? serverTimestamp() : new Date().toISOString()
  };

  try {
    await setDoc(doc(db, WEEKS_COLLECTION, currentWeekId), payload, { merge: true });
    alert('Positions saved.');
  } catch (e) {
    console.error('savePositionsToWeek error', e);
    alert('Save failed (see console).');
  }
}

/* ========== Clear positions ========== */
function clearAllPositions() {
  if (!confirm('Clear all positions?')) return;
  positions = { teamA: {}, teamB: {} };
  renderAll();
}

/* ========== Export PNG (simple html2canvas approach) ========== */
async function exportMapPNG() {
  // lazy-load html2canvas if not present
  if (!window.html2canvas) {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    document.head.appendChild(s);
    await new Promise(res => s.onload = res);
  }
  const container = document.getElementById('mapContainer');
  if (!container) return alert('Map container missing');
  try {
    const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: null });
    const a = document.createElement('a');
    const name = (weekData?.label || currentWeekId || 'positions') + '.png';
    a.href = canvas.toDataURL('image/png');
    a.download = name;
    a.click();
  } catch (e) {
    console.error('exportMapPNG failed', e);
    alert('Export failed.');
  }
}

/* ========== Init & event wiring ========== */
loadListeners();

async function loadListeners() {
  loadWeekBtn.addEventListener('click', () => {
    const id = savedWeeksSel.value;
    if (!id) return alert('Choose a saved week.');
    loadWeekById(id);
  });

  savePositionsBtn.addEventListener('click', savePositionsToWeek);
  clearPositionsBtn.addEventListener('click', clearAllPositions);
  exportPNGBtn.addEventListener('click', exportMapPNG);

  // on load: refresh saved weeks and check query param
  await refreshSavedWeeks();
  // if query param ?id=xxx present, auto-load
  const params = new URLSearchParams(location.search);
  const qid = params.get('id');
  if (qid) {
    savedWeeksSel.value = qid;
    await loadWeekById(qid);
  } else {
    // if only one saved week present auto-select first non-empty
    if (savedWeeksSel.options.length === 2) {
      // index 1 is first saved doc
      savedWeeksSel.selectedIndex = 1;
      await loadWeekById(savedWeeksSel.value);
    }
  }
}
