// positions.js (v2) — Team-specific maps, multi-members per node, per-assignment note
console.log('✅ positions.js (v2) loaded');

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
const WEEKS_COLLECTION = 'desert_brawl_weeks';

// final coordinates you gave (percent)
const MAP_SPOTS = [
  { key: 'Info Center',        x: 25.1, y: 17.7 },
  { key: 'Arsenal',            x: 50.6, y: 29.2 },
  { key: 'Field Hospital IV',  x: 75.8, y: 18.1 },
  { key: 'Field Hospital II',  x: 89.1, y: 39.5 },
  { key: 'Oil Refinery II',    x: 88.2, y: 59.1 },
  { key: 'Science Hub',        x: 73.6, y: 82.0 },
  { key: 'Field Hospital III', x: 30.5, y: 81.9 },
  { key: 'Mercenary Factory',  x: 50.5, y: 71.3 },
  { key: 'Oil Refinery I',     x: 14.6, y: 36.9 },
  { key: 'Field Hospital I',   x: 12.6, y: 58.1 },
  { key: 'Nuclear Silo',       x: 50.3, y: 50.8 },
  { key: 'Inner Top',          x: 50.6, y: 5.3 },
  { key: 'Inner Bottom',       x: 49.9, y: 90.9 }
];

/* ========== State ========== */
let currentWeekId = null;
let weekData = null;
let positions = { teamA: {}, teamB: {} }; // each map: posKey -> [ { id, name, note } ]
let teamAMembers = [];
let teamBMembers = [];

/* ========== DOM refs ========== */
const $ = id => document.getElementById(id);
const savedWeeksSel = $('savedWeeks');
const loadWeekBtn = $('loadWeek');
const savePositionsBtn = $('savePositions');
const teamAList = $('teamAList');
const teamBList = $('teamBList');
const mapInnerA = $('mapInnerA');
const mapInnerB = $('mapInnerB');

/* ========== Helpers ========== */
function empty(el) { while (el.firstChild) el.removeChild(el.firstChild); }

function normalizeLoadedPlayer(p) {
  return {
    id: p.id || null,
    name: p.name || '',
    power: p.power ?? 0,
    squad: (p.squad || '').toUpperCase(),
    powerType: p.powerType || 'Precise'
  };
}

function findPlayerNameById(pid) {
  const m = teamAMembers.concat(teamBMembers).find(x => x.id === pid);
  return m ? m.name : '';
}

/* ========== Firestore list & load ========== */
async function refreshSavedWeeks() {
  empty(savedWeeksSel);
  const ph = document.createElement('option'); ph.value = ''; ph.textContent = '-- Select week --';
  savedWeeksSel.appendChild(ph);
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

    // build team member lists (main + subs)
    teamAMembers = (data.teamA?.main || []).concat(data.teamA?.subs || []).map(normalizeLoadedPlayer);
    teamBMembers = (data.teamB?.main || []).concat(data.teamB?.subs || []).map(normalizeLoadedPlayer);

    // load positions shape (arrays)
    positions = { teamA: {}, teamB: {} };
    const pA = data.positions?.teamA || [];
    const pB = data.positions?.teamB || [];
    for (const it of pA) {
      if (!it.pos) continue;
      positions.teamA[it.pos] = positions.teamA[it.pos] || [];
      positions.teamA[it.pos].push({ id: it.id, name: it.name || '', note: it.note || '' });
    }
    for (const it of pB) {
      if (!it.pos) continue;
      positions.teamB[it.pos] = positions.teamB[it.pos] || [];
      positions.teamB[it.pos].push({ id: it.id, name: it.name || '', note: it.note || '' });
    }

    renderAll();
  } catch (e) {
    console.error('loadWeekById error', e);
    alert('Failed to load week (see console).');
  }
}

/* ========== Render functions ========== */
function renderAll() {
  renderTeamLists();
  renderMap('A');
  renderMap('B');
}

function renderTeamLists() {
  empty(teamAList); empty(teamBList);
  teamAMembers.forEach(p => {
    const chip = document.createElement('div'); chip.className='player-chip';
    chip.innerHTML = `<div><div class="player-name">${p.name}</div><div class="player-meta">${p.squad} • ${p.power}</div></div>
                      <div class="player-meta">${assignedPositionsForPlayer(p.id, 'teamA').length || 0}</div>`;
    teamAList.appendChild(chip);
  });
  teamBMembers.forEach(p => {
    const chip = document.createElement('div'); chip.className='player-chip';
    chip.innerHTML = `<div><div class="player-name">${p.name}</div><div class="player-meta">${p.squad} • ${p.power}</div></div>
                      <div class="player-meta">${assignedPositionsForPlayer(p.id, 'teamB').length || 0}</div>`;
    teamBList.appendChild(chip);
  });
}

function assignedPositionsForPlayer(pid, teamKey) {
  const map = positions[teamKey] || {};
  const out = [];
  Object.entries(map).forEach(([pos, arr]) => {
    if (Array.isArray(arr)) {
      for (const a of arr) if (a.id === pid) out.push(pos);
    }
  });
  return out;
}

function renderMap(teamLetter) {
  const mapInner = teamLetter === 'A' ? mapInnerA : mapInnerB;
  const teamKey = teamLetter === 'A' ? 'teamA' : 'teamB';
  // clear hotspots
  Array.from(mapInner.querySelectorAll('.hotspot')).forEach(n => n.remove());

  // append hotspots
  MAP_SPOTS.forEach(spot => {
    const el = document.createElement('div');
    el.className = 'hotspot';
    el.style.left = spot.x + '%';
    el.style.top  = spot.y + '%';
    el.dataset.key = spot.key;

    const dot = document.createElement('div'); dot.className = 'dot';
    el.appendChild(dot);

    // count badge
    const arr = (positions[teamKey]?.[spot.key]) || [];
    if (arr.length) {
      const c = document.createElement('div'); c.className='count'; c.textContent = arr.length;
      el.appendChild(c);
      // label listing up to 3 names
      const label = document.createElement('div'); label.className = 'hotspot-label';
      label.textContent = arr.slice(0,3).map(a => a.name).join(', ') + (arr.length > 3 ? ` +${arr.length-3}` : '');
      el.appendChild(label);
    }

    el.addEventListener('click', () => onHotspotClick(teamKey, spot.key));
    mapInner.appendChild(el);
  });
}

/* ========== Hotspot click -> picker modal (multi-select + note) ========== */
function onHotspotClick(teamKey, posKey) {
  openPicker(teamKey, posKey);
}

/* picker modal */
function openPicker(teamKey, posKey) {
  // current assigned list for convenience
  const assigned = positions[teamKey]?.[posKey] ? [...positions[teamKey][posKey]] : [];

  // build list of selectable players for that team
  const list = (teamKey === 'teamA' ? teamAMembers : teamBMembers);

  // overlay
  const overlay = document.createElement('div'); overlay.className='overlay';
  const box = document.createElement('div'); box.className='picker';

  const hdr = document.createElement('div'); hdr.innerHTML = `<h4>Assign players → ${posKey}</h4><div class="muted">Select multiple players and add an optional note per assignment.</div>`;
  box.appendChild(hdr);

  const entries = document.createElement('div'); entries.className='list';

  // helper to check if player is already assigned here
  const isAssignedHere = (pid) => assigned.some(a => a.id === pid);

  // build entries with selection state and note input
  list.forEach(p => {
    const ent = document.createElement('div'); ent.className = 'picker-entry';
    const left = document.createElement('div'); left.className = 'picker-row';
    left.innerHTML = `<div style="min-width:220px"><strong>${p.name}</strong><div class="muted">${p.squad} • ${p.power}</div></div>`;

    // checkbox-like visual
    const chk = document.createElement('div'); chk.style.marginRight = '8px';
    chk.innerHTML = isAssignedHere(p.id) ? '✅' : '⬜';
    left.prepend(chk);

    // note input (pre-fill if already assigned here)
    const noteInput = document.createElement('input');
    noteInput.placeholder = 'Optional note';
    noteInput.className = 'note-input';
    const prev = assigned.find(a => a.id === p.id);
    noteInput.value = prev ? (prev.note || '') : '';

    // clicking entry toggles selection
    ent.addEventListener('click', (ev) => {
      // avoid toggling when clicking inside noteInput
      if (ev.target === noteInput) return;
      const was = isAssignedHere(p.id);
      if (!was) {
        // add with note value
        assigned.push({ id: p.id, name: p.name, note: noteInput.value || '' });
      } else {
        // remove
        const idx = assigned.findIndex(a => a.id === p.id);
        if (idx >= 0) assigned.splice(idx,1);
      }
      // update visuals
      chk.innerHTML = isAssignedHere(p.id) ? '✅' : '⬜';
      ent.classList.toggle('selected', isAssignedHere(p.id));
    });

    // update note when changed (updates assigned if exists)
    noteInput.addEventListener('input', () => {
      const obj = assigned.find(a => a.id === p.id);
      if (obj) obj.note = noteInput.value;
    });

    ent.appendChild(left);
    // right side: note input
    const right = document.createElement('div'); right.style.width='40%'; right.appendChild(noteInput);
    ent.appendChild(right);
    // mark initially selected
    if (isAssignedHere(p.id)) ent.classList.add('selected');

    entries.appendChild(ent);
  });

  box.appendChild(entries);

  // actions
  const actions = document.createElement('div'); actions.className='picker-actions';
  const cancel = document.createElement('button'); cancel.className='btn'; cancel.textContent='Cancel';
  cancel.addEventListener('click', () => document.body.removeChild(overlay));
  const save = document.createElement('button'); save.className='btn primary'; save.textContent='Assign selected';
  save.addEventListener('click', () => {
    // persist assigned array to positions[teamKey][posKey]
    positions[teamKey] = positions[teamKey] || {};
    // shallow clone to avoid external reference
    positions[teamKey][posKey] = assigned.map(a => ({ id: a.id, name: a.name, note: a.note || '' }));
    document.body.removeChild(overlay);
    renderAll();
  });

  actions.appendChild(cancel); actions.appendChild(save);
  box.appendChild(actions);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

/* ========== Save to Firestore ========== */
async function savePositionsToWeek() {
  if (!currentWeekId) return alert('No week loaded.');
  // convert positions maps to arrays for firestore
  const prepareArr = (map) => {
    const out = [];
    Object.entries(map || {}).forEach(([pos, arr]) => {
      if (!Array.isArray(arr)) return;
      for (const a of arr) {
        out.push({ id: a.id, name: a.name || '', pos, note: a.note || '' });
      }
    });
    return out;
  };

  const payload = {
    positions: {
      teamA: prepareArr(positions.teamA),
      teamB: prepareArr(positions.teamB)
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

/* ========== Clear all positions for loaded week ========== */
function clearAllPositions() {
  if (!confirm('Clear all positions for both teams?')) return;
  positions = { teamA: {}, teamB: {} };
  renderAll();
}

/* ========== Debug helper: click to capture coordinates (module-safe) ========== */
function _enableMapDebug() {
  const wrapA = mapInnerA;
  const wrapB = mapInnerB;

  [wrapA, wrapB].forEach((wrap, idx) => {
    if (!wrap) return;
    wrap.addEventListener('click', function handler(e) {
      const rect = wrap.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      console.log(`Map ${idx===0 ? 'A' : 'B'} clicked at: x=${x.toFixed(1)} , y=${y.toFixed(1)}`);
    });
  });

  console.log('%cMap debug enabled. Click on map A or B to capture coordinates.', 'color:#00ffc8;font-weight:bold;');
}
window.enableMapDebug = _enableMapDebug;

/* ========== Init wiring ========== */
function wireEvents() {
  loadWeekBtn.addEventListener('click', () => {
    const id = savedWeeksSel.value;
    if (!id) return alert('Choose a saved week.');
    loadWeekById(id);
  });
  savePositionsBtn.addEventListener('click', savePositionsToWeek);

  // quick clear via context menu (not destructive)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // close any modals if present
      const ov = document.querySelector('.overlay');
      if (ov) try { document.body.removeChild(ov); } catch(e){}
    }
  });
}

async function init() {
  wireEvents();
  await refreshSavedWeeks();
  // auto-load id param if provided
  const params = new URLSearchParams(location.search);
  const qid = params.get('id');
  if (qid) {
    savedWeeksSel.value = qid;
    await loadWeekById(qid);
  } else {
    // autoload first saved week if only one exists
    if (savedWeeksSel.options.length === 2) {
      savedWeeksSel.selectedIndex = 1;
      await loadWeekById(savedWeeksSel.value);
    }
  }
}

init();
