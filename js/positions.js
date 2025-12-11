// positions.js (v4) — Single-team map, multi-member per node, per-assignment notes
// + draggable picker handle (small handle style) + per-hotspot pickerPositions persisted to Firestore
console.log("✅ positions.js (v4) loaded");

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

/* Final UPDATED coordinates (percent) */
const MAP_SPOTS = [
  { key: 'Info Center',        x: 37.1, y: 13.1 },
  { key: 'Arsenal',            x: 50.6, y: 29.2 },
  { key: 'Field Hospital IV',  x: 63.2, y: 13.1 },
  { key: 'Field Hospital II',  x: 69.8, y: 37.6 },
  { key: 'Oil Refinery II',    x: 70.1, y: 61.9 },
  { key: 'Science Hub',        x: 62.2, y: 88.7 },
  { key: 'Field Hospital III', x: 40.7, y: 86.3 },
  { key: 'Mercenary Factory',  x: 50.5, y: 71.3 },
  { key: 'Oil Refinery I',     x: 31.9, y: 40.2 },
  { key: 'Field Hospital I',   x: 31.4, y: 62.3 },
  { key: 'Nuclear Silo',       x: 50.3, y: 50.8 },
  { key: 'Inner Top',          x: 50.6, y: 5.3 },
  { key: 'Inner Bottom',       x: 49.9, y: 90.9 }
];

/* ========== STATE ========== */
let currentWeekId = null;
let weekData = null;
let positions = { teamA: {}, teamB: {} }; // { posKey: [ { id, name, note } ] }
let teamAMembers = []; // array of {id,name,power,squad,powerType}
let teamBMembers = [];
let activeTeam = 'A'; // 'A' or 'B'

// per-hotspot picker positions persisted in memory and loaded/saved with week doc
let pickerPositions = { teamA: {}, teamB: {} };

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

    // load pickerPositions if present
    pickerPositions = {
      teamA: data.pickerPositions?.teamA || {},
      teamB: data.pickerPositions?.teamB || {}
    };

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
        if (index > 0) offsetY += 16;
        label.style.top = offsetY + 'px';
        label.innerHTML = `${p.name} ${p.note ? `<span class="player-note">${p.note}</span>` : ""}`;
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

  // default box sizing (if not set by pickerPositions)
  box.style.width = box.style.width || '380px';
  box.style.height = box.style.height || '420px';

  // restore saved position for this hotspot (if exists)
  if (pickerPositions[teamKey] && pickerPositions[teamKey][posKey]) {
    const p = pickerPositions[teamKey][posKey];
    box.style.left = (p.left || 40) + 'px';
    box.style.top = (p.top || 120) + 'px';
  } else {
    // default starting position (you can change)
    box.style.left = box.style.left || '40px';
    box.style.top = box.style.top || '120px';
  }

  // make picker fixed so draggable moves it relative to viewport
  box.style.position = 'fixed';
  box.style.zIndex = 100000;

  // small drag handle on top-right (per your request: Option C)
  const dragHandle = document.createElement('div');
  dragHandle.className = 'picker-drag-handle';
  dragHandle.style.position = 'absolute';
  dragHandle.style.top = '8px';
  dragHandle.style.right = '8px';
  dragHandle.style.width = '28px';
  dragHandle.style.height = '28px';
  dragHandle.style.borderRadius = '6px';
  dragHandle.style.display = 'flex';
  dragHandle.style.alignItems = 'center';
  dragHandle.style.justifyContent = 'center';
  dragHandle.style.cursor = 'grab';
  dragHandle.style.background = 'rgba(255,255,255,0.03)';
  dragHandle.style.border = '1px solid rgba(255,255,255,0.04)';
  dragHandle.title = 'Drag';
  dragHandle.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00ffc8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h4M3 6h4M3 14h4M3 18h4M13 10h8M13 6h8M13 14h8M13 18h8"/></svg>';
  box.appendChild(dragHandle);

  // header
  const hdr = document.createElement('div');
  hdr.style.paddingRight = '44px'; // space for handle
  hdr.innerHTML = `<h4 style="margin:0;color:var(--accent)">Assign players → ${posKey}</h4><div class="muted" style="margin-top:6px">Select multiple players below. Add note per selected player. Click a row to toggle selection.</div>`;
  box.appendChild(hdr);

  // controls: search
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
  listWrap.style.maxHeight = '260px';
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

  /* -------------------------
     Draggable handle logic
     - Only the small handle is draggable (Option C)
     - Touch + mouse supported
     - Saves position per-hotspot on drag end and auto-saves to Firestore
     ------------------------- */
  let isDragging = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;

  function clampToViewport(left, top, width = box.offsetWidth, height = box.offsetHeight) {
    const minLeft = 8;
    const minTop = 8;
    const maxLeft = window.innerWidth - width - 8;
    const maxTop = window.innerHeight - height - 8;
    return {
      left: Math.min(Math.max(left, minLeft), Math.max(maxLeft, minLeft)),
      top: Math.min(Math.max(top, minTop), Math.max(maxTop, minTop))
    };
  }

  function onDragStart(e) {
    e.preventDefault();
    isDragging = true;
    const rect = box.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    startX = e.touches ? e.touches[0].clientX : e.clientX;
    startY = e.touches ? e.touches[0].clientY : e.clientY;

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchmove', onDragMove, { passive: false });
    document.addEventListener('touchend', onDragEnd);
    dragHandle.style.cursor = 'grabbing';
  }

  function onDragMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = clientX - startX;
    const dy = clientY - startY;
    const newLeft = startLeft + dx;
    const newTop = startTop + dy;
    const clamped = clampToViewport(newLeft, newTop);
    box.style.left = clamped.left + 'px';
    box.style.top = clamped.top + 'px';
  }

  async function onDragEnd() {
    if (!isDragging) return;
    isDragging = false;
    dragHandle.style.cursor = 'grab';

    // Save final position for this hotspot (per-team)
    if (!pickerPositions[teamKey]) pickerPositions[teamKey] = {};
    pickerPositions[teamKey][posKey] = {
      left: parseFloat(box.style.left),
      top: parseFloat(box.style.top)
    };

    // Auto-save to Firestore (so positions persist immediately)
    if (currentWeekId) {
      try {
        const ref = doc(db, WEEKS_COLLECTION, currentWeekId);
        await setDoc(ref, { pickerPositions }, { merge: true });
        // optional: console log
        // console.log('picker positions auto-saved', pickerPositions[teamKey][posKey]);
      } catch (err) {
        console.warn('Failed to auto-save picker position:', err);
      }
    }

    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('touchend', onDragEnd);
  }

  dragHandle.addEventListener('mousedown', onDragStart);
  dragHandle.addEventListener('touchstart', onDragStart, { passive: false });

  /* -------------------------
     Selected list UI refresh
     ------------------------- */
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

  /* -------------------------
     Build main list entries
     ------------------------- */
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
      // click toggles selection
      ent.addEventListener('click', (ev) => {
        state[p.id].selected = !state[p.id].selected;
        if (!state[p.id].selected) state[p.id].note = ''; // clear note when deselected
        ent.classList.toggle('selected', state[p.id].selected);
        refreshSelectedUI();
      });

      // show if this player already exists elsewhere
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

  saveBtn.addEventListener('click', async () => {
    // build assigned array for this pos
    const arr = Object.values(state).filter(s=>s.selected).map(s => ({ id: s.id, name: s.name, note: s.note || '' }));
    // assign
    ensureTeamMap(teamKey);
    // replace fully for this pos
    positions[teamKey][posKey] = arr;
    // Save positions and pickerPositions (so saved together)
    try {
      if (currentWeekId) {
        const payload = {
          positions: {
            teamA: prepare(positions.teamA),
            teamB: prepare(positions.teamB)
          },
          pickerPositions,
          positionsSavedAt: serverTimestamp ? serverTimestamp() : new Date().toISOString()
        };
        await setDoc(doc(db, WEEKS_COLLECTION, currentWeekId), payload, { merge: true });
      }
    } catch (err) {
      console.warn('Failed to save assignments:', err);
    }

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
    pickerPositions: pickerPositions,   // ★ persist picker positions
    positionsSavedAt: serverTimestamp ? serverTimestamp() : new Date().toISOString()
  };
  try {
    await setDoc(doc(db, WEEKS_COLLECTION, currentWeekId), payload, { merge: true });
    alert('Positions & picker positions saved.');
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
