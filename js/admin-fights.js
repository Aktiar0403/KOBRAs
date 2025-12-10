// admin-fights.js (v2) — Enhanced Add-Player modal with squad filter & power ranking
// Drop in /js/admin-fights.js (replace previous version)

console.log("✅ admin-fights.js (enhanced modal) loaded");

import { db } from './firebase-config.js';
import { cleanNumber } from './utils.js';
import { logAudit } from './audit.js'; // optional; safe if undefined

import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ===========================
   App state
   =========================== */
const WEEKS_COLLECTION = 'desert_brawl_weeks';
const membersCache = []; // live members cache (populated by subscribeMembers)
const savedWeeksList = [];

const teams = {
  A: { main: [], subs: [], ui: {} },
  B: { main: [], subs: [], ui: {} }
};

/* ===========================
   Helpers
   =========================== */
const $ = id => document.getElementById(id);

function uid(prefix='id') {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const cleaned = String(v).replace(/[^\d.-]/g, '');
  const m = Number(cleaned);
  return Number.isFinite(m) ? m : 0;
}

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
  if (!s) return null;
  return s.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_\-]/g,'').toLowerCase();
}

/* ===========================
   Squad derivation logic (Option 1: derived Hybrid categories)
   =========================== */
// Return one of: 'TANK','AIR','MISSILE','HYBRID','HYBRID-AIR','HYBRID-TANK'
function derivedHybridCategory(member) {
  const squad = (member.squad || '').toUpperCase();
  const role = (member.role || '').toUpperCase();
  if (squad !== 'HYBRID') return squad || 'UNKNOWN';

  // squad === 'HYBRID' -> derive subcategory by checking role text
  if (role.includes('AIR')) return 'HYBRID-AIR';
  if (role.includes('TANK')) return 'HYBRID-TANK';

  // fallback: if name or other fields mention AIR/TANK
  const name = (member.name || '').toUpperCase();
  if (name.includes('AIR')) return 'HYBRID-AIR';
  if (name.includes('TANK')) return 'HYBRID-TANK';

  // default hybrid
  return 'HYBRID';
}

/* ===========================
   Firestore subscriptions
   =========================== */
function subscribeMembers() {
  try {
    const q = query(collection(db, 'members'), orderBy('name'));
    onSnapshot(q, snap => {
      membersCache.length = 0;
      snap.docs.forEach(d => membersCache.push({ id: d.id, ...d.data() }));
      // if a modal is open, update its list
      if (activeModal && activeModal.type === 'add-player') refreshModalList();
    }, err => {
      console.warn('members snapshot error', err);
    });
  } catch (e) {
    console.warn('Firestore unavailable for members subscription', e);
  }
}

/* ===========================
   UI bindings (init)
   =========================== */
function bindUI() {
  // Team A ui
  teams.A.ui.name = $('teamAName');
  teams.A.ui.squad = $('teamASquad');
  teams.A.ui.mainList = $('teamAMainList');
  teams.A.ui.subList = $('teamASubList');
  teams.A.ui.mainPower = $('teamAMainPower');
  teams.A.ui.subPower = $('teamASubPower');
  teams.A.ui.totalPower = $('teamATotalPower');
  teams.A.ui.addMain = $('addTeamAMain');
  teams.A.ui.addSub = $('addTeamASub');
  teams.A.ui.mainCounts = $('teamAMainCounts');
  teams.A.ui.mainCountLabel = $('teamAMainCount');
  teams.A.ui.subCountLabel = $('teamASubCount');

  // Team B ui
  teams.B.ui.name = $('teamBName');
  teams.B.ui.squad = $('teamBSquad');
  teams.B.ui.mainList = $('teamBMainList');
  teams.B.ui.subList = $('teamBSubList');
  teams.B.ui.mainPower = $('teamBMainPower');
  teams.B.ui.subPower = $('teamBSubPower');
  teams.B.ui.totalPower = $('teamBTotalPower');
  teams.B.ui.addMain = $('addTeamBMain');
  teams.B.ui.addSub = $('addTeamBSub');
  teams.B.ui.mainCounts = $('teamBMainCounts');
  teams.B.ui.mainCountLabel = $('teamBMainCount');
  teams.B.ui.subCountLabel = $('teamBSubCount');

  // week controls
  $('autoWeekBtn')?.addEventListener('click', () => { $('weekLabel').value = getISOWeekLabel(); });
  $('saveWeekBtn')?.addEventListener('click', saveWeek);
  $('loadWeekBtn')?.addEventListener('click', loadSelectedWeek);
  $('deleteWeekBtn')?.addEventListener('click', deleteSelectedWeek);
  $('clearAllBtn')?.addEventListener('click', clearAllTeams);
  $('exportWeekBtn')?.addEventListener('click', exportCurrentWeekJSON);

  // add player buttons
  teams.A.ui.addMain?.addEventListener('click', () => openAddPlayerModal('A','main'));
  teams.A.ui.addSub?.addEventListener('click', () => openAddPlayerModal('A','sub'));
  teams.B.ui.addMain?.addEventListener('click', () => openAddPlayerModal('B','main'));
  teams.B.ui.addSub?.addEventListener('click', () => openAddPlayerModal('B','sub'));
}

/* ===========================
   Rendering teams & counts
   =========================== */
function renderTeam(side) {
  const t = teams[side];

  // render main
  t.ui.mainList.innerHTML = '';
  t.main.forEach((p, idx) => t.ui.mainList.appendChild(playerRow(side, 'main', p, idx)));

  // render subs
  t.ui.subList.innerHTML = '';
  t.subs.forEach((p, idx) => t.ui.subList.appendChild(playerRow(side, 'sub', p, idx)));

  // sums
  const mainSum = t.main.reduce((s, p) => s + toNumber(p.power), 0);
  const subSum = t.subs.reduce((s, p) => s + toNumber(p.power), 0);
  t.ui.mainPower.textContent = mainSum;
  t.ui.subPower.textContent = subSum;
  t.ui.totalPower.textContent = mainSum + subSum;

  // counts
  t.ui.mainCountLabel.textContent = t.main.length;
  t.ui.subCountLabel.textContent = t.subs.length;

  const counts = countSquads(t.main);
  t.ui.mainCounts.innerHTML = Object.entries(counts).map(([k,v]) => `<div class="count-pill">${k}: ${v}</div>`).join('');
  t.ui.addMain.disabled = t.main.length >= 20;
  t.ui.addSub.disabled = t.subs.length >= 10;
}

function countSquads(playerArray) {
  const keys = ['TANK','AIR','MISSILE','HYBRID'];
  const out = { TANK:0, AIR:0, MISSILE:0, HYBRID:0 };
  playerArray.forEach(p => {
    const s = (p.squad||'').toUpperCase();
    if (out[s] !== undefined) out[s]++; else {
      // if derived hybrid categories exist (HYBRID-AIR/TANK), count as HYBRID
      if (s.startsWith('HYBRID')) out.HYBRID++;
    }
  });
  return out;
}

function playerRow(side, bucket, player, idx) {
  const row = document.createElement('div');
  row.className = 'player-row';

  const left = document.createElement('div');
  left.className = 'left';
  left.textContent = player.name || '(unnamed)';

  const meta = document.createElement('div');
  meta.className = 'meta';

  const pwr = document.createElement('span');
  pwr.className = 'pwr';
  // Approx power visual: muted + ≈ prefix (option 2=B)
  if ((player.powerType || '').toUpperCase() === 'APPROX') {
    pwr.style.color = '#999';
    pwr.textContent = '≈' + (player.power ?? 0);
  } else {
    pwr.style.color = '#00ffc8';
    pwr.textContent = (player.power ?? 0);
  }

  const squadSpan = document.createElement('span');
  squadSpan.className = 'squad';
  squadSpan.textContent = player.squad || '';

  meta.appendChild(pwr);
  meta.appendChild(squadSpan);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const remBtn = document.createElement('button');
  remBtn.className = 'btn ghost';
  remBtn.textContent = 'Remove';
  remBtn.addEventListener('click', () => {
    removePlayer(side, bucket, idx);
  });

  actions.appendChild(remBtn);

  row.appendChild(left);
  row.appendChild(meta);
  row.appendChild(actions);
  return row;
}

/* ===========================
   Add / remove players
   =========================== */
function addPlayerToTeam(side, bucket, player) {
  const t = teams[side];
  if (!t) return;

  // prevent duplicate inside same team
  if (player.id) {
    const existing = t.main.concat(t.subs).find(p => p.id === player.id);
    if (existing) { alert('Member already in this team.'); return; }
  }

  if (bucket === 'main') {
    if (t.main.length >= 20) { alert('Main limit (20) reached'); return; }
    // if selected member from DB, prefer DB squad (override manual)
    t.main.push(normalizePlayer(player));
  } else {
    if (t.subs.length >= 10) { alert('Sub limit (10) reached'); return; }
    t.subs.push(normalizePlayer(player));
  }
  renderTeam(side);
}

function removePlayer(side, bucket, idx) {
  const t = teams[side];
  if (!t) return;
  if (bucket === 'main') t.main.splice(idx,1);
  else t.subs.splice(idx,1);
  renderTeam(side);
}

function normalizePlayer(p) {
  // Ensure shape: { id, name, power, squad, powerType }
  const squadFromDB = p.id ? ( (p.squad || '').toUpperCase() ) : ( (p.squad || '').toUpperCase() );
  // If p originates from membersCache and squad is HYBRID, derive hybrid category for display
  let displaySquad = squadFromDB || (p.squad || '').toUpperCase();
  if (displaySquad === 'HYBRID' && p.id) {
    // try derive hybrid subcategory from role
    const mem = membersCache.find(m => m.id === p.id);
    if (mem) displaySquad = derivedHybridCategory(mem);
  }
  return {
    id: p.id || null,
    name: p.name || '',
    power: toNumber(p.power),
    squad: displaySquad || '',
    powerType: p.powerType || 'Precise'
  };
}

/* ===========================
   Modal: enhanced Add-Player modal
   - Squad filter buttons (derived hybrid)
   - Power sort (desc / asc)
   - Search box
   - Ranked, clickable list
   - Manual entry fallback
   =========================== */

let activeModal = null; // hold modal state to refresh list when membersCache updates

function openAddPlayerModal(side, bucket) {
  closeModal(); // ensure single modal

  // modal overlay
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.6)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = 99999;

  // modal box
  const box = document.createElement('div');
  box.style.width = '720px';
  box.style.maxWidth = '96%';
  box.style.maxHeight = '86%';
  box.style.overflow = 'auto';
  box.style.background = 'rgba(6,6,10,0.98)';
  box.style.border = '1px solid rgba(80,80,120,0.3)';
  box.style.padding = '14px';
  box.style.borderRadius = '12px';
  overlay.appendChild(box);

  // header
  const h = document.createElement('div');
  h.style.display = 'flex';
  h.style.justifyContent = 'space-between';
  h.style.alignItems = 'center';
  const title = document.createElement('h3');
  title.textContent = `${side==='A'?'Team A':'Team B'} — Add ${bucket==='main'?'Main':'Sub'} Player`;
  title.style.color = '#00ffc8';
  title.style.margin = '0';
  h.appendChild(title);

  const closeX = document.createElement('button');
  closeX.className = 'btn ghost';
  closeX.textContent = 'Close';
  closeX.addEventListener('click', closeModal);
  h.appendChild(closeX);
  box.appendChild(h);

  // Controls row: Search + squad filters + sort
  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.gap = '8px';
  controls.style.margin = '12px 0';
  controls.style.flexWrap = 'wrap';

  const search = document.createElement('input');
  search.className = 'input';
  search.placeholder = 'Search name...';
  search.style.flex = '1';
  controls.appendChild(search);

  // squad filter buttons
  const squads = ['ALL','TANK','AIR','MISSILE','HYBRID-AIR','HYBRID-TANK','HYBRID'];
  const squadFilterGroup = document.createElement('div');
  squadFilterGroup.style.display = 'flex';
  squadFilterGroup.style.gap = '6px';
  squads.forEach(sq => {
    const b = document.createElement('button');
    b.className = 'btn ghost';
    b.textContent = sq;
    b.dataset.squad = sq;
    b.addEventListener('click', () => {
      // toggle active
      Array.from(squadFilterGroup.children).forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      modalState.squadFilter = sq;
      refreshModalList();
    });
    squadFilterGroup.appendChild(b);
  });
  controls.appendChild(squadFilterGroup);

  // sort buttons
  const sortGroup = document.createElement('div');
  sortGroup.style.display = 'flex';
  sortGroup.style.gap = '6px';
  const sd = document.createElement('button'); sd.className='btn ghost'; sd.textContent='Power ↓'; sd.dataset.sort='desc';
  const sa = document.createElement('button'); sa.className='btn ghost'; sa.textContent='Power ↑'; sa.dataset.sort='asc';
  sd.addEventListener('click', () => { modalState.sort = 'desc'; sd.classList.add('active'); sa.classList.remove('active'); refreshModalList(); });
  sa.addEventListener('click', () => { modalState.sort = 'asc'; sa.classList.add('active'); sd.classList.remove('active'); refreshModalList(); });
  sortGroup.appendChild(sd); sortGroup.appendChild(sa);
  controls.appendChild(sortGroup);

  box.appendChild(controls);

  // list container
  const listWrap = document.createElement('div');
  listWrap.style.border = '1px solid rgba(255,255,255,0.03)';
  listWrap.style.borderRadius = '8px';
  listWrap.style.padding = '10px';
  listWrap.style.maxHeight = '320px';
  listWrap.style.overflow = 'auto';
  box.appendChild(listWrap);

  // manual entry area
  const manual = document.createElement('div');
  manual.style.marginTop = '12px';
  manual.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <input class="input" id="manualName" placeholder="Manual name (if not selecting member)" style="flex:1"/>
      <input class="input" id="manualPower" placeholder="Power" style="width:120px" type="number"/>
      <select class="input" id="manualSquad" style="width:160px">
        <option value="">Squad (optional)</option>
        <option value="TANK">TANK</option><option value="AIR">AIR</option><option value="MISSILE">MISSILE</option><option value="HYBRID">HYBRID</option>
      </select>
      <select class="input" id="manualPowerType" style="width:120px">
        <option value="Precise">Precise</option><option value="Approx">Approx</option>
      </select>
    </div>
  `;
  box.appendChild(manual);

  // add actions (Add Selected / Add Manual / Cancel)
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.justifyContent = 'flex-end';
  actions.style.gap = '8px';
  actions.style.marginTop = '12px';

  const addSelected = document.createElement('button');
  addSelected.className = 'btn primary'; addSelected.textContent = 'Add Selected';
  addSelected.addEventListener('click', () => {
    if (!modalState.selectedMemberId) { alert('Select a member from the list or use manual entry.'); return; }
    const mem = membersCache.find(m => m.id === modalState.selectedMemberId);
    if (!mem) { alert('Member not found'); return; }
    const player = {
      id: mem.id,
      name: mem.name,
      power: mem.power ?? 0,
      squad: derivedHybridCategory(mem), // display derived category
      powerType: mem.powerType || 'Precise'
    };
    addPlayerToTeam(side, bucket, player);
    closeModal();
  });

  const addManual = document.createElement('button');
  addManual.className = 'btn primary'; addManual.textContent = 'Add Manual';
  addManual.addEventListener('click', () => {
    const name = box.querySelector('#manualName').value.trim();
    const power = box.querySelector('#manualPower').value;
    const squad = box.querySelector('#manualSquad').value;
    const ptype = box.querySelector('#manualPowerType').value || 'Precise';
    if (!name) return alert('Enter manual name or select a member.');
    const player = { id: null, name, power: toNumber(power), squad: squad || '', powerType: ptype };
    addPlayerToTeam(side, bucket, player);
    closeModal();
  });

  const cancel = document.createElement('button');
  cancel.className = 'btn ghost'; cancel.textContent = 'Cancel'; cancel.addEventListener('click', closeModal);

  actions.appendChild(cancel);
  actions.appendChild(addManual);
  actions.appendChild(addSelected);
  box.appendChild(actions);

  // modal state for filtering & selection
  const modalState = {
    squadFilter: 'ALL',
    sort: 'desc',
    search: '',
    selectedMemberId: null
  };

  // search wiring
  search.addEventListener('input', (e) => { modalState.search = e.target.value.trim().toLowerCase(); refreshModalList(); });

  // expose helpers for external updates
  activeModal = {
    overlay,
    box,
    type: 'add-player',
    state: modalState,
    refresh: refreshModalList
  };

  // append overlay
  document.body.appendChild(overlay);

  // initial activate ALL button
  Array.from(squadFilterGroup.children).forEach(b => { if (b.dataset.squad === 'ALL') b.classList.add('active'); });

  // refresh list
  refreshModalList();

  // ensure focused
  search.focus();

  /* --------------- refreshModalList (closure) --------------- */
  function refreshModalList() {
    listWrap.innerHTML = ''; // clear
    // prepare list from membersCache
    let list = membersCache.map(m => ({ id: m.id, name: m.name, power: toNumber(m.power), squadRaw: (m.squad||'').toUpperCase(), role: (m.role||''), powerType: m.powerType || 'Precise' }));

    // derive displaySquad for each
    list = list.map(m => {
      const display = (m.squadRaw === 'HYBRID') ? derivedHybridCategory(m) : (m.squadRaw || '');
      return { ...m, displaySquad: display };
    });

    // apply squad filter
    if (modalState.squadFilter && modalState.squadFilter !== 'ALL') {
      const sq = modalState.squadFilter;
      list = list.filter(m => {
        if (sq === 'HYBRID-AIR' || sq === 'HYBRID-TANK') return (m.displaySquad === sq);
        if (sq === 'HYBRID') return (m.displaySquad === 'HYBRID' || m.displaySquad === 'HYBRID-AIR' || m.displaySquad === 'HYBRID-TANK');
        return (m.displaySquad === sq) || (m.squadRaw === sq);
      });
    }

    // apply search
    if (modalState.search) {
      list = list.filter(m => (m.name + ' ' + (m.displaySquad||'') + ' ' + (m.role||'')).toLowerCase().includes(modalState.search));
    }

    // apply sort by power
    if (modalState.sort === 'desc') list.sort((a,b) => b.power - a.power);
    else list.sort((a,b) => a.power - b.power);

    // build list items
    list.forEach(m => {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.justifyContent = 'space-between';
      item.style.alignItems = 'center';
      item.style.padding = '8px';
      item.style.borderRadius = '8px';
      item.style.marginBottom = '6px';
      item.style.cursor = 'pointer';
      item.style.background = 'transparent';
      item.addEventListener('click', () => {
        modalState.selectedMemberId = m.id;
        // highlight selection
        Array.from(listWrap.children).forEach(c => c.style.outline = 'none');
        item.style.outline = '2px solid rgba(0,200,255,0.12)';
      });

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.flexDirection = 'column';

      const nameEl = document.createElement('div');
      nameEl.textContent = m.name;
      nameEl.style.color = '#eaeaea';
      nameEl.style.fontWeight = '600';

      const subEl = document.createElement('div');
      subEl.textContent = `${m.displaySquad || ''} ${m.role ? ' • ' + m.role : ''}`;
      subEl.style.color = '#aaa';
      subEl.style.fontSize = '12px';

      left.appendChild(nameEl);
      left.appendChild(subEl);

      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.flexDirection = 'column';
      right.style.alignItems = 'flex-end';

      const pwrEl = document.createElement('div');
      if (m.powerType && m.powerType.toUpperCase() === 'APPROX') {
        pwrEl.textContent = '≈' + m.power;
        pwrEl.style.color = '#999';
      } else {
        pwrEl.textContent = m.power;
        pwrEl.style.color = '#00ffc8';
      }
      pwrEl.style.fontWeight = '700';

      const badge = document.createElement('div');
      badge.textContent = m.displaySquad || '';
      badge.style.color = '#ddd';
      badge.style.fontSize = '12px';

      right.appendChild(pwrEl);
      right.appendChild(badge);

      item.appendChild(left);
      item.appendChild(right);
      listWrap.appendChild(item);
    });

    // if empty show hint
    if (!list.length) {
      const hint = document.createElement('div'); hint.style.color = '#888'; hint.style.padding='12px'; hint.textContent = 'No members found.';
      listWrap.appendChild(hint);
    }
  }
}

/* ===========================
   close modal
   =========================== */
function closeModal() {
  if (activeModal && activeModal.overlay) {
    try { document.body.removeChild(activeModal.overlay); } catch(e) {}
  }
  activeModal = null;
}

/* ===========================
   Weeks save/load/delete & other helpers
   (kept from previous implementation)
   =========================== */

function buildWeekPayload() {
  return {
    label: $('weekLabel').value || getISOWeekLabel(),
    savedAt: serverTimestamp ? serverTimestamp() : new Date().toISOString(),
    teamA: { name: teams.A.ui.name?.value || '', squad: teams.A.ui.squad?.value || '', main: teams.A.main, subs: teams.A.subs },
    teamB: { name: teams.B.ui.name?.value || '', squad: teams.B.ui.squad?.value || '', main: teams.B.main, subs: teams.B.subs }
  };
}

async function saveWeek() {
  const rawLabel = ($('weekLabel').value || '').trim();
  const label = rawLabel || getISOWeekLabel();
  const id = sanitizeId(label) || uid('week');
  const payload = buildWeekPayload();
  try {
    await setDoc(doc(db, WEEKS_COLLECTION, id), payload);
    alert('Saved week: ' + label);
    if (typeof logAudit === 'function') logAudit('SAVE_WEEK', label, '', window?.currentAdminName || 'admin');
    await refreshSavedWeeks();
    $('savedWeeks').value = id;
  } catch (e) {
    console.error('saveWeek error', e);
    alert('Save failed');
  }
}

async function refreshSavedWeeks() {
  try {
    const snap = await getDocs(collection(db, WEEKS_COLLECTION));
    const sel = $('savedWeeks');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Load saved week --</option>';
    snap.docs.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.data().label || d.id;
      sel.appendChild(opt);
    });
  } catch (e) {
    console.warn('refreshSavedWeeks error', e);
  }
}

async function loadSelectedWeek() {
  const id = $('savedWeeks').value;
  if (!id) return alert('Choose a saved week');
  try {
    const snap = await getDoc(doc(db, WEEKS_COLLECTION, id));
    if (!snap.exists()) return alert('Week not found');
    const data = snap.data();
    applyLoadedWeek(data);
    $('weekLabel').value = data.label || id;
  } catch (e) {
    console.error('load error', e);
    alert('Load failed');
  }
}

function applyLoadedWeek(data) {
  teams.A.main = (data.teamA?.main || []).map(normalizeForLoad);
  teams.A.subs = (data.teamA?.subs || []).map(normalizeForLoad);
  teams.B.main = (data.teamB?.main || []).map(normalizeForLoad);
  teams.B.subs = (data.teamB?.subs || []).map(normalizeForLoad);
  // set UI fields if present
  if (teams.A.ui.name) teams.A.ui.name.value = data.teamA?.name || '';
  if (teams.A.ui.squad) teams.A.ui.squad.value = data.teamA?.squad || '';
  if (teams.B.ui.name) teams.B.ui.name.value = data.teamB?.name || '';
  if (teams.B.ui.squad) teams.B.ui.squad.value = data.teamB?.squad || '';
  renderTeam('A'); renderTeam('B');
}

function normalizeForLoad(p) {
  return {
    id: p.id || null,
    name: p.name || '',
    power: toNumber(p.power),
    squad: (p.squad || '').toUpperCase(),
    powerType: p.powerType || 'Precise'
  };
}

async function deleteSelectedWeek() {
  const id = $('savedWeeks').value;
  if (!id) return alert('Choose saved week');
  if (!confirm('Delete saved week?')) return;
  try {
    await deleteDoc(doc(db, WEEKS_COLLECTION, id));
    alert('Deleted');
    await refreshSavedWeeks();
  } catch (e) {
    console.error('delete week error', e);
    alert('Delete failed');
  }
}

/* ===========================
   Export JSON / Clear functions
   =========================== */
function exportCurrentWeekJSON() {
  const payload = buildWeekPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${payload.label || 'week'}.json`; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function clearAllTeams() {
  if (!confirm('Clear both teams?')) return;
  teams.A.main = []; teams.A.subs = []; teams.B.main = []; teams.B.subs = [];
  renderTeam('A'); renderTeam('B');
  $('weekLabel').value = '';
}

/* ===========================
   Utilities
   =========================== */
function normalizePlayerObj(p) {
  return {
    id: p.id || null,
    name: p.name || '',
    power: toNumber(p.power),
    squad: (p.squad || '').toUpperCase(),
    powerType: p.powerType || 'Precise'
  };
}

/* ===========================
   Initialize
   =========================== */
function init() {
  bindUI();
  subscribeMembers();
  refreshSavedWeeks();
  renderTeam('A'); renderTeam('B');
  $('weekLabel').value = getISOWeekLabel();
}

// Expose functions used by modal
function refreshModalList() {
  if (activeModal && activeModal.refresh) activeModal.refresh();
}

/* ===========================
   Start
   =========================== */
document.addEventListener('DOMContentLoaded', init);
