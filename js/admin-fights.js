// admin-fights.js
// Desert Brawl Team Builder — full JS (Week auto+manual, save/load/edit, counts)
console.log("✅ admin-fights.js loaded");

import { db } from './firebase-config.js';
import { cleanNumber } from './utils.js';
import { logAudit } from './audit.js'; // optional; safe if exists

import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* -------------------------
   State
------------------------- */
const teams = {
  A: { main: [], subs: [], nameEl: null, squadEl: null, ui: {} },
  B: { main: [], subs: [], nameEl: null, squadEl: null, ui: {} }
};

let membersCache = []; // members from Firestore
let savedWeeksList = []; // list of saved weeks (docs)
const WEEKS_COLLECTION = 'desert_brawl_weeks';

/* -------------------------
   Helpers
------------------------- */
function $(id) { return document.getElementById(id); }

function uid(prefix='p') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    const cleaned = String(v).replace(/[^\d.-]/g, '');
    const m = Number(cleaned);
    return Number.isFinite(m) ? m : 0;
  }
  return n;
}

/* -------------------------
   Week label helpers
   - auto label: week-YYYY-WW (ISO week)
------------------------- */
function getISOWeekLabel() {
  const now = new Date();
  const tmp = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1)/7);
  return `week-${tmp.getUTCFullYear()}-${String(weekNo).padStart(2,'0')}`;
}

function sanitizeId(s) {
  return s.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_\-]/g,'').toLowerCase() || null;
}

/* -------------------------
   DOM bindings & init
------------------------- */
function initBindings() {
  // team elements A
  teams.A.nameEl = $('teamAName');
  teams.A.squadEl = $('teamASquad');
  teams.A.ui.mainPower = $('teamAMainPower');
  teams.A.ui.subPower = $('teamASubPower');
  teams.A.ui.totalPower = $('teamATotalPower');
  teams.A.ui.mainList = $('teamAMainList');
  teams.A.ui.subList = $('teamASubList');
  teams.A.ui.addMain = $('addTeamAMain');
  teams.A.ui.addSub = $('addTeamASub');
  teams.A.ui.mainCounts = $('teamAMainCounts');
  teams.A.ui.mainCountLabel = $('teamAMainCount');
  teams.A.ui.subCountLabel = $('teamASubCount');

  // team B
  teams.B.nameEl = $('teamBName');
  teams.B.squadEl = $('teamBSquad');
  teams.B.ui.mainPower = $('teamBMainPower');
  teams.B.ui.subPower = $('teamBSubPower');
  teams.B.ui.totalPower = $('teamBTotalPower');
  teams.B.ui.mainList = $('teamBMainList');
  teams.B.ui.subList = $('teamBSubList');
  teams.B.ui.addMain = $('addTeamBMain');
  teams.B.ui.addSub = $('addTeamBSub');
  teams.B.ui.mainCounts = $('teamBMainCounts');
  teams.B.ui.mainCountLabel = $('teamBMainCount');
  teams.B.ui.subCountLabel = $('teamBSubCount');

  // week controls
  $('autoWeekBtn')?.addEventListener('click', () => {
    $('weekLabel').value = getISOWeekLabel();
  });
  $('saveWeekBtn')?.addEventListener('click', saveWeek);
  $('loadWeekBtn')?.addEventListener('click', loadSelectedWeek);
  $('deleteWeekBtn')?.addEventListener('click', deleteSelectedWeek);
  $('clearAllBtn')?.addEventListener('click', clearAllTeams);
  $('exportWeekBtn')?.addEventListener('click', exportCurrentWeekJSON);

  // add player buttons
  teams.A.ui.addMain?.addEventListener('click', () => openAddModal('A','main'));
  teams.A.ui.addSub?.addEventListener('click', () => openAddModal('A','sub'));
  teams.B.ui.addMain?.addEventListener('click', () => openAddModal('B','main'));
  teams.B.ui.addSub?.addEventListener('click', () => openAddModal('B','sub'));
}

/* -------------------------
   Firestore: members subscribe and weeks list
------------------------- */
function subscribeMembers() {
  try {
    const q = query(collection(db, 'members'), orderBy('name'));
    onSnapshot(q, snap => {
      membersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    });
  } catch (e) {
    console.warn('Firestore members subscription not available', e);
  }
}

async function refreshSavedWeeksList() {
  try {
    const snap = await getDocs(collection(db, WEEKS_COLLECTION));
    savedWeeksList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    populateWeeksSelect();
  } catch (e) {
    console.warn('Failed to load saved weeks list', e);
  }
}

function populateWeeksSelect() {
  const sel = $('savedWeeks');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Load saved week --</option>';
  savedWeeksList.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.textContent = w.label || w.id;
    sel.appendChild(opt);
  });
}

/* -------------------------
   Render helpers
------------------------- */
function renderTeams() {
  renderTeam('A');
  renderTeam('B');
}

function countSquadTypes(playerArray) {
  const counts = { TANK:0, AIR:0, MISSILE:0, HYBRID:0 };
  playerArray.forEach(p => {
    const s = (p.squad || '').toUpperCase();
    if (counts[s] !== undefined) counts[s]++;
  });
  return counts;
}

function renderTeam(side) {
  const t = teams[side];
  if (!t) return;

  // main list
  t.ui.mainList.innerHTML = '';
  t.main.forEach((p, idx) => {
    t.ui.mainList.appendChild(playerRowElement(side, 'main', p, idx));
  });

  // subs list
  t.ui.subList.innerHTML = '';
  t.subs.forEach((p, idx) => {
    t.ui.subList.appendChild(playerRowElement(side, 'sub', p, idx));
  });

  // sums
  const mainSum = t.main.reduce((s,p) => s + toNumber(p.power), 0);
  const subSum = t.subs.reduce((s,p) => s + toNumber(p.power), 0);
  t.ui.mainPower.textContent = mainSum;
  t.ui.subPower.textContent = subSum;
  t.ui.totalPower.textContent = mainSum + subSum;

  // counts
  t.ui.mainCountLabel.textContent = t.main.length;
  t.ui.subCountLabel.textContent = t.subs.length;

  const countsMain = countSquadTypes(t.main);
  const countsHTML = Object.entries(countsMain).map(([k,v]) => `<div class="count-pill">${k}: ${v}</div>`).join('');
  t.ui.mainCounts.innerHTML = countsHTML;

  // enable/disable add buttons by limits
  t.ui.addMain.disabled = (t.main.length >= 20);
  t.ui.addSub.disabled = (t.subs.length >= 10);
}

/* -------------------------
   Player row DOM
------------------------- */
function playerRowElement(side, bucket, p, idx) {
  const row = document.createElement('div');
  row.className = 'player-row';

  const left = document.createElement('div');
  left.className = 'left';
  left.textContent = p.name || '(unnamed)';

  const meta = document.createElement('div');
  meta.className = 'meta';
  const pwr = document.createElement('span'); pwr.className = 'pwr'; pwr.textContent = p.power ?? 0;
  const s = document.createElement('span'); s.className = 'squad'; s.textContent = p.squad || '';
  meta.appendChild(pwr); meta.appendChild(s);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const del = document.createElement('button'); del.className='btn ghost'; del.textContent='Remove';
  del.addEventListener('click', () => {
    removePlayer(side, bucket, idx);
  });
  actions.appendChild(del);

  row.appendChild(left);
  row.appendChild(meta);
  row.appendChild(actions);
  return row;
}

/* -------------------------
   Add / Remove players
------------------------- */
function addPlayer(side, bucket, player) {
  const t = teams[side];
  if (!t) return;
  if (bucket === 'main') {
    if (t.main.length >= 20) return alert('Main limit 20 reached');
    // prevent duplicate same member in same team main/sub
    if (player.id) {
      const dup = t.main.concat(t.subs).find(p => p.id === player.id);
      if (dup) return alert('This member already exists in the team.');
    }
    t.main.push(player);
  } else {
    if (t.subs.length >= 10) return alert('Sub limit 10 reached');
    if (player.id) {
      const dup = t.main.concat(t.subs).find(p => p.id === player.id);
      if (dup) return alert('This member already exists in the team.');
    }
    t.subs.push(player);
  }
  renderTeam(side);
}

function removePlayer(side, bucket, index) {
  const t = teams[side];
  if (!t) return;
  if (bucket === 'main') {
    t.main.splice(index,1);
  } else {
    t.subs.splice(index,1);
  }
  renderTeam(side);
}

/* -------------------------
   Modal: select or create player
------------------------- */
let modalOverlay = null;
function openAddModal(side, bucket) {
  // build overlay
  closeModal();

  modalOverlay = document.createElement('div');
  modalOverlay.style.position = 'fixed';
  modalOverlay.style.inset = '0';
  modalOverlay.style.background = 'rgba(0,0,0,0.6)';
  modalOverlay.style.display = 'flex';
  modalOverlay.style.alignItems = 'center';
  modalOverlay.style.justifyContent = 'center';
  modalOverlay.style.zIndex = 9999;

  const box = document.createElement('div');
  box.style.width = '560px';
  box.style.maxWidth = '96%';
  box.style.background = 'rgba(10,10,14,0.98)';
  box.style.border = '1px solid rgba(80,80,120,0.3)';
  box.style.padding = '16px';
  box.style.borderRadius = '12px';
  modalOverlay.appendChild(box);

  const title = document.createElement('h3');
  title.textContent = `${side==='A'?'Team A':'Team B'} — Add ${bucket==='main'?'Main':'Sub'} Player`;
  title.style.color = '#00ffc8';
  title.style.marginTop = '0';
  box.appendChild(title);

  // select member
  const selLabel = document.createElement('div'); selLabel.textContent='Select existing member (optional)'; selLabel.style.color='#bbb';
  const select = document.createElement('select'); select.className='input'; select.style.width='100%'; select.style.marginTop='6px';
  const emptyOpt = document.createElement('option'); emptyOpt.value=''; emptyOpt.textContent='-- choose member or leave blank --'; select.appendChild(emptyOpt);
  membersCache.forEach(m => {
    const o = document.createElement('option');
    o.value = m.id;
    o.textContent = `${m.name} — ${m.power ?? ''} ${m.powerType ? '('+m.powerType+')':''}`;
    select.appendChild(o);
  });
  box.appendChild(selLabel); box.appendChild(select);

  // manual fields
  const nmLabel = document.createElement('div'); nmLabel.textContent='Name (if not selecting)'; nmLabel.style.marginTop='10px'; nmLabel.style.color='#bbb';
  const nmInput = document.createElement('input'); nmInput.className='input'; nmInput.placeholder='Player name';
  box.appendChild(nmLabel); box.appendChild(nmInput);

  const pLabel = document.createElement('div'); pLabel.textContent='Power'; pLabel.style.color='#bbb'; pLabel.style.marginTop='8px';
  const pInput = document.createElement('input'); pInput.type='number'; pInput.className='input'; pInput.placeholder='0';
  box.appendChild(pLabel); box.appendChild(pInput);

  const sLabel = document.createElement('div'); sLabel.textContent='Squad Type'; sLabel.style.color='#bbb'; sLabel.style.marginTop='8px';
  const sSelect = document.createElement('select'); sSelect.className='input';
  ['', 'TANK','AIR','MISSILE','HYBRID'].forEach(v => { const o = document.createElement('option'); o.value=v; o.textContent=v||'Select squad'; sSelect.appendChild(o); });
  box.appendChild(sLabel); box.appendChild(sSelect);

  const typeLabel = document.createElement('div'); typeLabel.textContent='Power Type'; typeLabel.style.color='#bbb'; typeLabel.style.marginTop='8px';
  const typeSelect = document.createElement('select'); typeSelect.className='input';
  ['Precise','Approx'].forEach(v => { const o = document.createElement('option'); o.value=v; o.textContent=v; typeSelect.appendChild(o); });
  box.appendChild(typeLabel); box.appendChild(typeSelect);

  // actions
  const actions = document.createElement('div'); actions.style.display='flex'; actions.style.justifyContent='flex-end'; actions.style.gap='8px'; actions.style.marginTop='12px';
  const cancel = document.createElement('button'); cancel.className='btn ghost'; cancel.textContent='Cancel'; cancel.addEventListener('click', closeModal);
  const add = document.createElement('button'); add.className='btn primary'; add.textContent='Add'; add.addEventListener('click', () => {
    // if selected
    const selId = select.value;
    if (selId) {
      const mem = membersCache.find(m => m.id === selId);
      if (!mem) { alert('Member not found'); return; }
      const player = { id: mem.id, name: mem.name, power: toNumber(mem.power), powerType: mem.powerType || 'Precise' };
      addPlayer(side, bucket, player);
      closeModal();
      return;
    }
    // else manual
    const name = nmInput.value.trim();
    const power = pInput.value !== '' ? toNumber(pInput.value) : 0;
    const squad = sSelect.value || '';
    const ptype = typeSelect.value || 'Precise';
    if (!name) return alert('Enter name or select existing member.');
    const player = { id: null, name, power, squad, powerType: ptype };
    addPlayer(side, bucket, player);
    closeModal();
  });
  actions.appendChild(cancel); actions.appendChild(add);
  box.appendChild(actions);

  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
  document.body.appendChild(modalOverlay);
}

function closeModal() {
  if (modalOverlay) {
    try { document.body.removeChild(modalOverlay); } catch(e) {}
    modalOverlay = null;
  }
}

/* -------------------------
   Save / Load / Delete week
------------------------- */
function buildWeekPayload() {
  const payload = {
    label: $('weekLabel').value || getISOWeekLabel(),
    savedAt: serverTimestamp ? serverTimestamp() : new Date().toISOString(),
    teamA: {
      name: teams.A.nameEl?.value || '',
      squad: teams.A.squadEl?.value || '',
      main: teams.A.main,
      subs: teams.A.subs
    },
    teamB: {
      name: teams.B.nameEl?.value || '',
      squad: teams.B.squadEl?.value || '',
      main: teams.B.main,
      subs: teams.B.subs
    }
  };
  return payload;
}

async function saveWeek() {
  const labelRaw = $('weekLabel').value.trim();
  const label = labelRaw || getISOWeekLabel();
  if (!label) return alert('Week label required');
  const id = sanitizeId(label) || uid('week');

  const payload = buildWeekPayload();
  try {
    await setDoc(doc(db, WEEKS_COLLECTION, id), payload);
    alert('Week saved: ' + label);
    if (typeof logAudit === 'function') logAudit('SAVE_WEEK', label, JSON.stringify({teamA: payload.teamA, teamB: payload.teamB}), (window?.currentAdminName || 'admin'));
    // refresh list
    await refreshSavedWeeksList();
    $('savedWeeks').value = id;
  } catch (e) {
    console.error('saveWeek error', e);
    alert('Save failed. Check console.');
  }
}

async function loadSelectedWeek() {
  const id = $('savedWeeks').value;
  if (!id) return alert('Choose saved week to load');
  try {
    const docRef = doc(db, WEEKS_COLLECTION, id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return alert('Week not found');
    const data = snap.data();
    applyLoadedWeek(id, data);
  } catch (e) {
    console.error('load error', e);
    alert('Load failed.');
  }
}

function applyLoadedWeek(id, data) {
  // set label
  $('weekLabel').value = data.label || id;

  // team A
  teams.A.main = (data.teamA?.main || []).map(normalizePlayer);
  teams.A.subs = (data.teamA?.subs || []).map(normalizePlayer);
  teams.A.nameEl.value = data.teamA?.name || '';
  teams.A.squadEl.value = data.teamA?.squad || '';

  // team B
  teams.B.main = (data.teamB?.main || []).map(normalizePlayer);
  teams.B.subs = (data.teamB?.subs || []).map(normalizePlayer);
  teams.B.nameEl.value = data.teamB?.name || '';
  teams.B.squadEl.value = data.teamB?.squad || '';

  renderTeams();
}

async function deleteSelectedWeek() {
  const id = $('savedWeeks').value;
  if (!id) return alert('Choose week to delete');
  if (!confirm('Delete saved week permanently?')) return;
  try {
    await deleteDoc(doc(db, WEEKS_COLLECTION, id));
    alert('Deleted');
    await refreshSavedWeeksList();
  } catch (e) {
    console.error('delete error', e);
    alert('Delete failed.');
  }
}

/* -------------------------
   Misc actions
------------------------- */
function clearAllTeams() {
  if (!confirm('Clear both teams?')) return;
  teams.A.main = []; teams.A.subs = []; teams.B.main = []; teams.B.subs = [];
  $('weekLabel').value = '';
  renderTeams();
}

function exportCurrentWeekJSON() {
  const payload = buildWeekPayload();
  const dataStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${payload.label || 'week'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* -------------------------
   normalization helper
------------------------- */
function normalizePlayer(p) {
  return {
    id: p.id || null,
    name: p.name || '',
    power: toNumber(p.power),
    squad: p.squad || '',
    powerType: p.powerType || 'Precise'
  };
}

/* -------------------------
   Init
------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  initBindings();
  subscribeMembers();
  refreshSavedWeeksList();
  renderTeams();

  // set default week label (Option C)
  $('weekLabel').value = getISOWeekLabel();
});
