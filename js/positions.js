// positions.js (v3) — Single-team map, multi-member per node, per-assignment notes
console.log("✅ positions.js (v3) loaded");

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

/* Final coordinates (percent) provided by you */
/* Final UPDATED coordinates (percent) */
const MAP_SPOTS = [
  { key: 'Info Center',        x: 37.1, y: 13.1 },   // UPDATED
  { key: 'Arsenal',            x: 50.6, y: 29.2 },   // OK

  { key: 'Field Hospital IV',  x: 63.2, y: 13.1 },   // UPDATED
  { key: 'Field Hospital II',  x: 69.8, y: 37.6 },   // UPDATED
  { key: 'Oil Refinery II',    x: 70.1, y: 61.9 },   // UPDATED

  { key: 'Science Hub',        x: 62.2, y: 88.7 },   // UPDATED
  { key: 'Field Hospital III', x: 40.7, y: 86.3 },   // UPDATED

  { key: 'Mercenary Factory',  x: 50.5, y: 71.3 },   // OK
  { key: 'Oil Refinery I',     x: 31.9, y: 40.2 },   // UPDATED
  { key: 'Field Hospital I',   x: 31.4, y: 62.3 },   // UPDATED

  { key: 'Nuclear Silo',       x: 50.3, y: 50.8 },   // OK
  { key: 'Inner Top',          x: 50.6, y: 5.3 },    // OK
  { key: 'Inner Bottom',       x: 49.9, y: 90.9 }    // OK
];


/* ========== STATE ========== */
let currentWeekId = null;
let weekData = null;
let positions = { teamA: {}, teamB: {} }; // { posKey: [ { id, name, note } ] }
let teamAMembers = []; // array of {id,name,power,squad,powerType}
let teamBMembers = [];
let activeTeam = 'A'; // 'A' or 'B'

/* ========== DOM refs ========== */
const $ = id => document.getElementById(id);
const savedWeeksSel = $('savedWeeks');
const loadWeekBtn = $('loadWeek');
const savePositionsBtn = $('savePositions');
const clearPositionsBtn = $('clearPositions');
const switchA = $('switchA');
const switchB = $('switchB');

const mapInner = $('mapInnerSingle');
const teamListSingle = $('teamListSingle');
const panelTitle = $('panelTitle');
const teamListLabel = $('teamListLabel');

/* ========== Utilities ========== */
function empty(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
function toNum(v){ const n=Number(v); return Number.isFinite(n)?n:0; }

/* Helper: return assigned positions for a player in given team map */
function assignedPositionsForPlayer(playerId, teamKey) {
  if (!positions[teamKey]) return [];
  const out = [];
  Object.entries(positions[teamKey]).forEach(([pos, arr]) => {
    if (!Array.isArray(arr)) return;
    arr.forEach(a => {
      if (a.id === playerId) out.push({ pos, note: a.note || '' });
    });
  });
  return out;
}

/* Helper: ensure positions map exists */
function ensureTeamMap(teamKey) {
  if (!positions[teamKey]) positions[teamKey] = {};
  return positions[teamKey];
}

/* ========== Firestore: saved weeks list & load ========== */
async function refreshSavedWeeks() {
  empty(savedWeeksSel);
  const placeholder = document.createElement('option'); placeholder.value=''; placeholder.textContent='-- Select week --';
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
    alert('Failed to load saved weeks. See console.');
  }
}

async function loadWeekById(id) {
  if (!id) return alert('Choose a saved week ID');
  try {
    const ref = doc(db, WEEKS_COLLECTION, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return alert('Week not found');
    const data = snap.data();
    weekData = data;
    currentWeekId = id;

    // build team member lists (main + subs)
    teamAMembers = (data.teamA?.main || []).concat(data.teamA?.subs || []).map(m => ({
      id: m.id || null, name: m.name || '', power: m.power ?? 0, squad: (m.squad||'').toUpperCase(), powerType: m.powerType || 'Precise'
    }));
    teamBMembers = (data.teamB?.main || []).concat(data.teamB?.subs || []).map(m => ({
      id: m.id || null, name: m.name || '', power: m.power ?? 0, squad: (m.squad||'').toUpperCase(), powerType: m.powerType || 'Precise'
    }));

    // load positions arrays -> map structure
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

    renderActiveTeamMap();
  } catch (e) {
    console.error('loadWeekById error', e);
    alert('Failed to load week (see console).');
  }
}

/* ========== Rendering ========== */
function renderActiveTeamMap() {
  const teamKey = activeTeam === 'A' ? 'teamA' : 'teamB';
  panelTitle.textContent = `Team ${activeTeam} — Map`;
  teamListLabel.textContent = `Team ${activeTeam} Players`;

  // render player list
  empty(teamListSingle);
  const players = activeTeam === 'A' ? teamAMembers : teamBMembers;
  players.forEach(p => {
    const chip = document.createElement('div'); chip.className='player-chip';
    const assigned = assignedPositionsForPlayer(p.id, teamKey).length;
    chip.innerHTML = `<div>
        <div class="player-name">${p.name}</div>
        <div class="player-meta">${p.squad} • ${p.power}</div>
      </div>
      <div class="player-meta">${assigned}</div>`;
    teamListSingle.appendChild(chip);
  });

  // clear old hotspots
  Array.from(mapInner.querySelectorAll('.hotspot')).forEach(n => n.remove());

  // draw hotspots
  MAP_SPOTS.forEach(spot => {
    const el = document.createElement('div');
    el.className = 'hotspot';
    el.style.left = spot.x + '%';
    el.style.top = spot.y + '%';
    el.dataset.key = spot.key;

    const dot = document.createElement('div'); dot.className = 'dot';
    el.appendChild(dot);

    const arr = (positions[teamKey]?.[spot.key]) || [];
    if (arr.length) {
  // Count bubble
  const c = document.createElement('div');
  c.className = 'count';
  c.textContent = arr.length;
  el.appendChild(c);

  // Stacked player labels (left side)
  let offsetY = -10;

  arr.forEach((p, index) => {
    const label = document.createElement('div');
    label.className = 'player-label';

    // If more players, stack downward
    if (index > 0) offsetY += 16;
    label.style.top = offsetY + 'px';

    label.innerHTML = `
      ${p.name}
      ${p.note ? `<span class="player-note">${p.note}</span>` : ""}
    `;

    el.appendChild(label);
  });
}


    el.addEventListener('click', () => onHotspotClick(teamKey, spot.key));
    mapInner.appendChild(el);
  });
}

/* ========== Hotspot picker modal ========== */
/* Build a modal allowing multi-select and per-assignment notes. Selected players list is shown. */
function onHotspotClick(teamKey, posKey) {
  openPicker(teamKey, posKey);
}

function openPicker(teamKey, posKey) {
  // get current assigned for this pos
  const assigned = (positions[teamKey] && positions[teamKey][posKey]) ? positions[teamKey][posKey].map(a=>({...a})) : [];

  // player list for the team
  const players = teamKey === 'teamA' ? teamAMembers : teamBMembers;

  // overlay & box
  const overlay = document.createElement('div'); overlay.className='overlay';
  const box = document.createElement('div'); box.className='picker';
// --- Align picker with hotspot ---
const hotspotEl = document.querySelector(`[data-key="${posKey}"]`);
if (hotspotEl) {
  const rect = hotspotEl.getBoundingClientRect();

  // Desired position: slightly above/right of hotspot
  let left = rect.left + window.scrollX + 40;
  let top  = rect.top + window.scrollY - 20;

  // Prevent overflow RIGHT
  const pickerWidth = 360;
  if (left + pickerWidth > window.innerWidth - 20) {
    left = window.innerWidth - pickerWidth - 20;
  }

  // Prevent overflow TOP
  if (top < 20) top = 20;

  // Apply absolute positioning instead of center-flex
  overlay.style.alignItems = "flex-start";
  overlay.style.justifyContent = "flex-start";

  box.style.position = "absolute";
  box.style.left = left + "px";
  box.style.top = top + "px";
}

  // header
  const hdr = document.createElement('div');
  hdr.innerHTML = `<h4>Assign players → ${posKey}</h4><div class="muted">Select multiple players below. Add note per selected player. Click a row to toggle selection.</div>`;
  box.appendChild(hdr);

  // controls: search & squad filter (simple)
  const controls = document.createElement('div'); controls.className='controls';
  const search = document.createElement('input'); search.className='search'; search.placeholder='Search name, squad, role...';
  controls.appendChild(search);

  box.appendChild(controls);

  // selected list UI (top)
  const selectedWrap = document.createElement('div'); selectedWrap.style.margin='8px 0';
  selectedWrap.innerHTML = `<div style="font-size:13px;color:#9aa3a6;margin-bottom:6px">Selected players</div>`;
  const selectedList = document.createElement('div'); selectedList.style.display='flex'; selectedList.style.flexDirection='column'; selectedList.style.gap='6px';
  selectedWrap.appendChild(selectedList);
  box.appendChild(selectedWrap);

  // main list
  const listWrap = document.createElement('div'); listWrap.className='list';
  box.appendChild(listWrap);

  // actions
  const actions = document.createElement('div'); actions.className='picker-actions';
  const cancel = document.createElement('button'); cancel.className='btn'; cancel.textContent='Cancel';
  const clearBtn = document.createElement('button'); clearBtn.className='btn'; clearBtn.textContent='Clear Selection';
  const saveBtn = document.createElement('button'); saveBtn.className='btn primary'; saveBtn.textContent='Assign Selected';

  actions.appendChild(cancel); actions.appendChild(clearBtn); actions.appendChild(saveBtn);
  box.appendChild(actions);

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // helper state: map playerId -> { id, name, note, selected }
  const state = {};
  players.forEach(p => {
    state[p.id] = { id: p.id, name: p.name, note: '', selected: false };
  });
  // pre-fill from assigned
  assigned.forEach(a => {
    if (!state[a.id]) state[a.id] = { id: a.id, name: a.name || findNameFromCache(a.id, players), note: a.note || '', selected: true };
    else { state[a.id].note = a.note || ''; state[a.id].selected = true; }
  });

  // refresh selected list UI
  function refreshSelectedUI() {
    selectedList.innerHTML = '';
    Object.values(state).filter(s=>s.selected).forEach(s => {
      const row = document.createElement('div'); row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center'; row.style.gap='8px';
      row.style.padding='6px'; row.style.border='1px solid rgba(255,255,255,0.03)'; row.style.borderRadius='8px'; row.style.background='rgba(0,200,255,0.02)';
      const left = document.createElement('div'); left.innerHTML = `<div style="font-weight:700">${s.name}</div><div style="font-size:12px;color:#9aa3a6">${s.id}</div>`;
      const note = document.createElement('input'); note.className='note-input'; note.placeholder='Note (visible)'; note.value = s.note || '';
      note.addEventListener('input', (e) => { s.note = e.target.value; });
      row.appendChild(left); row.appendChild(note);
      selectedList.appendChild(row);
    });
  }

  // build main list entries
  function refreshMainList() {
    listWrap.innerHTML = '';
    const q = search.value.trim().toLowerCase();
    players.forEach(p => {
      if (q) {
        const hay = (p.name + ' ' + (p.squad||'') + ' ' + (p.power||'')).toLowerCase();
        if (!hay.includes(q)) return;
      }
      const ent = document.createElement('div'); ent.className='picker-entry';
      if (state[p.id].selected) ent.classList.add('selected');
      ent.innerHTML = `<div style="display:flex;gap:10px;align-items:center">
          <div style="min-width:220px"><strong>${p.name}</strong><div class="muted" style="font-size:12px">${p.squad} • ${p.power}</div></div>
        </div>`;
      // click toggles selection (but clicking input doesn't toggle because there is none in row)
      ent.addEventListener('click', (ev) => {
        state[p.id].selected = !state[p.id].selected;
        if (!state[p.id].selected) state[p.id].note = ''; // clear note when deselected
        ent.classList.toggle('selected', state[p.id].selected);
        refreshSelectedUI();
      });

      // show if this player already exists in other team mapping? NOT blocking: we allow multi-location-player and cross-team duplicates by design
      const assignCount = countAssignmentsGlobal(p.id);
      if (assignCount > 0) {
        const hint = document.createElement('div'); hint.style.fontSize='12px'; hint.style.color='#ffb86b'; hint.style.marginLeft='6px';
        hint.textContent = `Assigned ${assignCount} time(s)`;
        ent.appendChild(hint);
      }

      listWrap.appendChild(ent);
    });
    refreshSelectedUI();
  }

  // search wiring
  search.addEventListener('input', refreshMainList);

  // clear selection
  clearBtn.addEventListener('click', () => {
    Object.values(state).forEach(s=>s.selected=false);
    refreshMainList();
  });

  cancel.addEventListener('click', () => {
    try { document.body.removeChild(overlay); } catch(e){}
  });

  saveBtn.addEventListener('click', () => {
    // build assigned array for this pos
    const arr = Object.values(state).filter(s=>s.selected).map(s => ({ id: s.id, name: s.name, note: s.note || '' }));
    // assign
    ensureTeamMap(teamKey);
    // replace fully for this pos
    positions[teamKey][posKey] = arr;
    // close
    try { document.body.removeChild(overlay); } catch(e){}
    // re-render
    renderActiveTeamMap();
  });

  // initial draw
  refreshMainList();
}

/* helper: find name from players list */
function findNameFromCache(id, players) {
  const p = (players || []).find(x => x.id === id);
  return p ? p.name : id || 'Unknown';
}

/* Count assignments across both team maps for hinting */
function countAssignmentsGlobal(playerId) {
  let cnt = 0;
  ['teamA', 'teamB'].forEach(t => {
    Object.values(positions[t] || {}).forEach(arr => {
      arr.forEach(a => { if (a.id === playerId) cnt++; });
    });
  });
  return cnt;
}

/* ========== Save positions back to Firestore under week doc ========== */
async function savePositionsToWeek() {
  if (!currentWeekId) return alert('Load a week first.');
  // convert map to arrays
  const prepare = (map) => {
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
      teamA: prepare(positions.teamA),
      teamB: prepare(positions.teamB)
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

/* ========== Clear all positions in memory (not saved) ========== */
function clearAllPositions() {
  if (!confirm('Clear all positions for both teams (in current page)?')) return;
  positions = { teamA: {}, teamB: {} };
  renderActiveTeamMap();
}

/* ========== Debug helper (module safe) ========== */
function _enableMapDebug() {
  const wrap = mapInner;
  if (!wrap) return console.warn('mapInner missing');
  wrap.addEventListener('click', function(e){
    const r = wrap.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    console.log(`Clicked at: x=${x.toFixed(1)} , y=${y.toFixed(1)}`);
  });
  console.log('%cMap debug enabled. Click map to capture coordinates.', 'color:#00ffc8;font-weight:700');
}
window.enableMapDebug = _enableMapDebug;

/* ========== Wiring & init ========== */
function wireEvents() {
  loadWeekBtn.addEventListener('click', () => {
    const id = savedWeeksSel.value;
    if (!id) return alert('Choose a saved week.');
    loadWeekById(id);
  });
  savePositionsBtn.addEventListener('click', savePositionsToWeek);
  clearPositionsBtn.addEventListener('click', clearAllPositions);

  switchA.addEventListener('click', () => {
    activeTeam = 'A';
    switchA.classList.add('primary'); switchB.classList.remove('primary');
    renderActiveTeamMap();
  });
  switchB.addEventListener('click', () => {
    activeTeam = 'B';
    switchB.classList.add('primary'); switchA.classList.remove('primary');
    renderActiveTeamMap();
  });

  // close overlay on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const ov = document.querySelector('.overlay');
      if (ov) try { document.body.removeChild(ov); } catch(e){}
    }
  });
}

async function init() {
  wireEvents();
  await refreshSavedWeeks();

  // auto-load first week if present
  if (savedWeeksSel.options.length > 1) {
    savedWeeksSel.selectedIndex = 1;
    const id = savedWeeksSel.value;
    if (id) await loadWeekById(id);
  } else {
    // still render empty map
    renderActiveTeamMap();
  }
}

init();
