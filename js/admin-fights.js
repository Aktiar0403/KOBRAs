// admin-fights.js
// DESERT BRAWL — TEAM BUILDER logic
// Requires: ./firebase-config.js (exporting `db`) and ./utils.js (exporting cleanNumber)
// Place <script type="module" src="/js/admin-fights.js"></script> in page.

console.log("✅ admin-fights.js loaded");

import { db } from './firebase-config.js';
import { cleanNumber } from './utils.js';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  setDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ---------------------------
   State
   - teams keep arrays of players
   - player: { uid, id, name, power, powerType, source } source: 'member'|'manual'
----------------------------*/
const teams = {
  A: {
    nameEl: null,
    squadEl: null,
    mainListEl: null,
    subListEl: null,
    main: [], // up to 20
    subs: [], // up to 10
    ui: {
      mainPower: null,
      subPower: null,
      totalPower: null,
      addMainBtn: null,
      addSubBtn: null
    }
  },
  B: {
    nameEl: null,
    squadEl: null,
    mainListEl: null,
    subListEl: null,
    main: [],
    subs: [],
    ui: {
      mainPower: null,
      subPower: null,
      totalPower: null,
      addMainBtn: null,
      addSubBtn: null
    }
  }
};

let membersCache = []; // live members from Firestore: { id, name, power, powerType, ... }

/* ---------------------------
   DOM selectors (expected from HTML)
----------------------------*/
function $(id) { return document.getElementById(id); }

function initDOMBindings() {
  // Team A
  teams.A.nameEl = $('teamAName');
  teams.A.squadEl = $('teamASquad');
  teams.A.mainListEl = $('teamAMainList');
  teams.A.subListEl = $('teamASubList');
  teams.A.ui.mainPower = $('teamAMainPower');
  teams.A.ui.subPower = $('teamASubPower');
  teams.A.ui.totalPower = $('teamATotalPower');
  teams.A.ui.addMainBtn = $('addTeamAMain');
  teams.A.ui.addSubBtn = $('addTeamASub');

  // Team B
  teams.B.nameEl = $('teamBName');
  teams.B.squadEl = $('teamBSquad');
  teams.B.mainListEl = $('teamBMainList');
  teams.B.subListEl = $('teamBSubList');
  teams.B.ui.mainPower = $('teamBMainPower');
  teams.B.ui.subPower = $('teamBSubPower');
  teams.B.ui.totalPower = $('teamBTotalPower');
  teams.B.ui.addMainBtn = $('addTeamBMain');
  teams.B.ui.addSubBtn = $('addTeamBSub');

  // Wire add buttons
  teams.A.ui.addMainBtn?.addEventListener('click', () => openAddPlayerModal('A', 'main'));
  teams.A.ui.addSubBtn?.addEventListener('click', () => openAddPlayerModal('A', 'sub'));
  teams.B.ui.addMainBtn?.addEventListener('click', () => openAddPlayerModal('B', 'main'));
  teams.B.ui.addSubBtn?.addEventListener('click', () => openAddPlayerModal('B', 'sub'));
}

/* ---------------------------
   Firestore members subscription
----------------------------*/
function subscribeMembers() {
  try {
    const qRef = query(collection(db, 'members'), orderBy('name'));
    onSnapshot(qRef, snap => {
      membersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // If a members dropdown is open in modal, refresh it
      refreshMemberSelectOptions();
    }, err => {
      console.error('members subscription error', err);
    });
  } catch (e) {
    console.warn('Firestore not available or db not configured. Members selection will be limited to manual entry.');
  }
}

/* ---------------------------
   Helpers
----------------------------*/
function uid(prefix='p') {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
}

function toNumber(v) {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  // fallback: remove non-digit chars
  const cleaned = String(v).replace(/[^\d.-]/g, '');
  const m = Number(cleaned);
  return Number.isFinite(m) ? m : 0;
}

/* ---------------------------
   Rendering team lists & totals
----------------------------*/
function renderTeam(side) {
  const t = teams[side];
  if (!t) return;

  // render main players
  t.mainListEl.innerHTML = '';
  t.main.forEach((p, idx) => {
    const row = createPlayerRow(p, side, 'main', idx);
    t.mainListEl.appendChild(row);
  });

  // render subs
  t.subListEl.innerHTML = '';
  t.subs.forEach((p, idx) => {
    const row = createPlayerRow(p, side, 'sub', idx);
    t.subListEl.appendChild(row);
  });

  // update totals
  const mainSum = t.main.reduce((s, p) => s + toNumber(p.power), 0);
  const subSum = t.subs.reduce((s, p) => s + toNumber(p.power), 0);
  const total = mainSum + subSum;

  t.ui.mainPower.textContent = mainSum;
  t.ui.subPower.textContent = subSum;
  t.ui.totalPower.textContent = total;

  // enforce limits
  t.ui.addMainBtn.disabled = (t.main.length >= 20);
  t.ui.addSubBtn.disabled = (t.subs.length >= 10);

  // show small badge on buttons (optional)
  t.ui.addMainBtn.title = `Main players: ${t.main.length}/20`;
  t.ui.addSubBtn.title = `Sub players: ${t.subs.length}/10`;
}

/* ---------------------------
   Player row DOM
----------------------------*/
function createPlayerRow(player, side, bucket, index) {
  const row = document.createElement('div');
  row.className = 'player-row';

  // left: name
  const left = document.createElement('div');
  left.className = 'player-left';
  left.textContent = player.name || '(unknown)';

  // center: power & badge
  const center = document.createElement('div');
  center.className = 'player-center';
  const pwr = document.createElement('span');
  pwr.className = 'player-power';
  pwr.textContent = player.power ?? 0;
  center.appendChild(pwr);

  if (player.powerType) {
    const badge = document.createElement('span');
    badge.className = 'power-type';
    badge.textContent = player.powerType;
    center.appendChild(badge);
  }

  // right: delete button
  const right = document.createElement('div');
  right.className = 'player-right';
  const del = document.createElement('button');
  del.className = 'btn small danger';
  del.textContent = 'Delete';
  del.addEventListener('click', () => {
    removePlayer(side, bucket, index);
  });
  right.appendChild(del);

  row.appendChild(left);
  row.appendChild(center);
  row.appendChild(right);

  return row;
}

/* ---------------------------
   Remove player
----------------------------*/
function removePlayer(side, bucket, index) {
  const t = teams[side];
  if (!t) return;
  if (bucket === 'main') {
    if (index < 0 || index >= t.main.length) return;
    t.main.splice(index, 1);
  } else {
    if (index < 0 || index >= t.subs.length) return;
    t.subs.splice(index, 1);
  }
  renderTeam(side);
}

/* ---------------------------
   Modal: Add Player
   - allows select from members or manual entry
----------------------------*/
let currentModal = null;

function openAddPlayerModal(side, bucket) {
  // build modal content
  const title = `${side === 'A'? 'Team A':'Team B'} — Add ${bucket === 'main' ? 'Main' : 'Sub'} Player`;
  const modal = createModal(title);

  const container = document.createElement('div');
  container.className = 'modal-content';

  // Member select
  const selWrap = document.createElement('div');
  selWrap.style.marginBottom = '10px';
  const selLabel = document.createElement('label');
  selLabel.textContent = 'Select existing member (optional)';
  selLabel.className = 'field-label';
  selWrap.appendChild(selLabel);

  const select = document.createElement('select');
  select.className = 'input';
  select.id = 'memberSelect';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '-- Choose member or leave blank --';
  select.appendChild(defaultOpt);

  // populate options
  membersCache.forEach(m => {
    const o = document.createElement('option');
    o.value = m.id;
    o.textContent = `${m.name} — ${m.power ?? ''} ${m.powerType ? '(' + m.powerType + ')' : ''}`;
    select.appendChild(o);
  });

  selWrap.appendChild(select);
  container.appendChild(selWrap);

  // Manual entry fields
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Name (if not selecting existing)';
  nameLabel.className = 'field-label';
  container.appendChild(nameLabel);

  const nameInput = document.createElement('input');
  nameInput.className = 'input';
  nameInput.placeholder = 'Player name';
  container.appendChild(nameInput);

  const powerLabel = document.createElement('label');
  powerLabel.textContent = 'Power';
  powerLabel.className = 'field-label';
  container.appendChild(powerLabel);

  const powerInput = document.createElement('input');
  powerInput.type = 'number';
  powerInput.step = '0.1';
  powerInput.className = 'input';
  powerInput.placeholder = '0';
  container.appendChild(powerInput);

  const powerTypeLabel = document.createElement('label');
  powerTypeLabel.textContent = 'Power Type';
  powerTypeLabel.className = 'field-label';
  container.appendChild(powerTypeLabel);

  const powerTypeSelect = document.createElement('select');
  powerTypeSelect.className = 'input';
  const optPrec = document.createElement('option'); optPrec.value = 'Precise'; optPrec.textContent = 'Precise';
  const optApprox = document.createElement('option'); optApprox.value = 'Approx'; optApprox.textContent = 'Approx';
  powerTypeSelect.appendChild(optPrec);
  powerTypeSelect.appendChild(optApprox);
  container.appendChild(powerTypeSelect);

  // Buttons
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';
  actions.style.marginTop = '12px';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn small';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    closeModal();
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'btn primary';
  addBtn.textContent = 'Add Player';
  addBtn.addEventListener('click', () => {
    // if member selected, take from membersCache
    const selectedMemberId = select.value;
    if (selectedMemberId) {
      const mem = membersCache.find(x => x.id === selectedMemberId);
      if (!mem) {
        alert('Selected member not found.');
        return;
      }
      const player = {
        uid: uid('m'),
        id: mem.id,
        name: mem.name || 'Unknown',
        power: mem.power ?? 0,
        powerType: mem.powerType || 'Precise',
        source: 'member'
      };
      addPlayerToTeam(side, bucket, player);
      closeModal();
      return;
    }

    // else manual
    const manualName = nameInput.value.trim();
    const manualPower = powerInput.value !== '' ? cleanNumber(powerInput.value) : 0;
    const manualType = powerTypeSelect.value || 'Precise';

    if (!manualName) {
      alert('Enter player name or choose an existing member.');
      return;
    }

    const player = {
      uid: uid('x'),
      id: null,
      name: manualName,
      power: manualPower,
      powerType: manualType,
      source: 'manual'
    };
    addPlayerToTeam(side, bucket, player);
    closeModal();
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(addBtn);

  container.appendChild(actions);

  modal.body.appendChild(container);
  openModal(modal);
  // store current modal
  currentModal = modal;
}

/* ---------------------------
   Modal creation / open / close helpers
----------------------------*/
function createModal(title) {
  // overlay
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  // box
  const box = document.createElement('div');
  box.className = 'modal-box-lg';

  // header
  const h = document.createElement('div');
  h.className = 'modal-header';
  const h1 = document.createElement('h3');
  h1.textContent = title;
  h.appendChild(h1);

  // body
  const body = document.createElement('div');
  body.className = 'modal-body';

  box.appendChild(h);
  box.appendChild(body);

  // append
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // click outside to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  return { overlay, box, body };
}

function openModal(modalObj) {
  modalObj.overlay.style.zIndex = 9999;
  modalObj.overlay.style.position = 'fixed';
  modalObj.overlay.style.inset = '0';
  modalObj.overlay.style.display = 'flex';
  modalObj.overlay.style.alignItems = 'center';
  modalObj.overlay.style.justifyContent = 'center';
  // small fade
  modalObj.overlay.style.animation = 'modalFade .18s ease';
  // style box
  modalObj.box.style.width = '520px';
  modalObj.box.style.maxWidth = '95%';
  modalObj.box.style.background = 'rgba(10,10,14,0.95)';
  modalObj.box.style.border = '1px solid rgba(80,80,120,0.3)';
  modalObj.box.style.borderRadius = '12px';
  modalObj.box.style.padding = '16px';
  modalObj.box.style.boxShadow = '0 10px 40px rgba(0,0,0,0.7)';
}

function closeModal() {
  if (!currentModal) return;
  try {
    document.body.removeChild(currentModal.overlay);
  } catch (e) {}
  currentModal = null;
}

/* ---------------------------
   Add player to team (with limit enforcement)
----------------------------*/
function addPlayerToTeam(side, bucket, player) {
  const t = teams[side];
  if (!t) return;

  if (bucket === 'main') {
    if (t.main.length >= 20) {
      alert('Main players limit reached (20).');
      return;
    }
    t.main.push(player);
  } else {
    if (t.subs.length >= 10) {
      alert('Sub players limit reached (10).');
      return;
    }
    t.subs.push(player);
  }
  renderTeam(side);
}

/* ---------------------------
   Member select refresh (if modal open)
----------------------------*/
function refreshMemberSelectOptions() {
  const sel = document.getElementById('memberSelect');
  if (!sel) return;
  // clear existing except first default
  while (sel.options.length > 1) sel.remove(1);
  membersCache.forEach(m => {
    const o = document.createElement('option');
    o.value = m.id;
    o.textContent = `${m.name} — ${m.power ?? ''} ${m.powerType ? '('+m.powerType+')' : ''}`;
    sel.appendChild(o);
  });
}

/* ---------------------------
   Optional: Save teams to Firestore
----------------------------*/
async function saveTeamToFirestore(side) {
  // Optional: uncomment to enable persistence
  /*
  const t = teams[side];
  const payload = {
    name: t.nameEl?.value || '',
    squad: t.squadEl?.value || '',
    main: t.main,
    subs: t.subs,
    totalMainPower: Number(t.ui.mainPower.textContent) || 0,
    totalSubPower: Number(t.ui.subPower.textContent) || 0,
    totalPower: Number(t.ui.totalPower.textContent) || 0,
    updatedAt: serverTimestamp()
  };
  await setDoc(doc(db, 'desert_brawl_teams', `${side}`), payload);
  */
}

/* ---------------------------
   Init - wire everything
----------------------------*/
function init() {
  initDOMBindings();
  subscribeMembers();

  // initial render
  renderTeam('A');
  renderTeam('B');

  // keyboard shortcuts: Ctrl+1 / Ctrl+2 to focus team names
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === '1') teams.A.nameEl?.focus();
    if (e.ctrlKey && e.key === '2') teams.B.nameEl?.focus();
  });
}

/* ---------------------------
   Run
----------------------------*/
document.addEventListener('DOMContentLoaded', init);

/* ---------------------------
   Minimal CSS for modal & player-row
   (You can copy these into your style.css)
----------------------------*/
/*
.modal-overlay { }
.modal-box-lg { }
.modal-header h3 { color:#00ffc8; margin:0 0 8px 0; }
.modal-body { color:#ddd; font-size:14px; }

.player-row {
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:8px 10px;
  border-radius:8px;
  background:rgba(0,0,0,0.18);
  margin-bottom:8px;
  gap:8px;
}
.player-left { flex: 1; font-weight:600; color:#eaeaea; }
.player-center { display:flex; gap:8px; align-items:center; }
.player-power { font-size:14px; color:#00ffc8; font-weight:700; margin-right:6px; }
.power-type { font-size:11px; color:#bbb; background: rgba(255,255,255,0.03); padding:3px 6px; border-radius:6px; }
.player-right { }
.btn.small { padding:6px 10px; border-radius:8px; }
*/
