

import { db, auth } from './firebase-config.js'; 
import {
  collection, addDoc, doc, getDoc, updateDoc, setDoc,
  onSnapshot, query, where, getDocs, arrayUnion, arrayRemove, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// small helper to create elements
const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

/* --- UI elements --- */
const fightNameInput = $('#fightName');
const numTeamsInput = $('#numTeams');
const playersPerTeamInput = $('#playersPerTeam');
const subsPerTeamInput = $('#subsPerTeam');
const teamNamesContainer = $('#teamNamesContainer');
const createFightBtn = $('#createFightBtn');
const loadDraftsBtn = $('#loadDraftsBtn');
const rosterPoolEl = $('#rosterPool');
const rosterSearch = $('#rosterSearch');
const teamsContainer = $('#teamsContainer');
const saveTeamsBtn = $('#saveTeamsBtn');
const finalizeBtn = $('#finalizeBtn');
const fightStatusEl = $('#fightStatus');

/* --- State --- */
let currentFightId = null;
let currentFight = null; // object as in Firestore
let rosterMembersCache = []; // all players from /players collection (cache)
let rosterPool = []; // UIDs in pool for current fight

/* --- Generate team name inputs dynamically --- */
function renderTeamNameInputs() {
  const n = parseInt(numTeamsInput.value) || 1;
  teamNamesContainer.innerHTML = '';
  for (let i=1;i<=n;i++){
    const wrapper = document.createElement('div');
    wrapper.style.marginTop = '8px';
    wrapper.innerHTML = `
      <label>Team ${i} Name</label>
      <input data-team-index="${i}" class="teamNameInput" type="text" placeholder="Team ${i}"/>
    `;
    teamNamesContainer.appendChild(wrapper);
  }
}

/* --- Create fight doc --- */
createFightBtn.addEventListener('click', async () => {
  const fightName = fightNameInput.value.trim() || `Fight ${new Date().toLocaleString()}`;
  const numTeams = Math.max(1, parseInt(numTeamsInput.value || 1));
  const playersPerTeam = Math.max(1, parseInt(playersPerTeamInput.value || 1));
  const subsPerTeam = Math.max(0, parseInt(subsPerTeamInput.value || 0));
  const teamNameInputs = $$('.teamNameInput');
  const teams = {};

  for (let i=0;i<numTeams;i++){
    const name = (teamNameInputs[i] && teamNameInputs[i].value.trim()) || `Team ${i+1}`;
    teams[`team${i+1}`] = { name, main: [], subs: [] };
  }

  // create fight doc
  const payload = {
    fightName,
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser ? auth.currentUser.uid : 'admin',
    numTeams,
    playersPerTeam,
    subsPerTeam,
    warType: 'custom',
    rosterPool: [],
    teams,
    status: 'draft'
  };

  try {
    const ref = await addDoc(collection(db, 'fights'), payload);
    currentFightId = ref.id;
    await loadFight(currentFightId);
    alert('Fight created — ID: ' + ref.id);
  } catch (err) {
    console.error('createFight err', err);
    alert('Error creating fight: ' + err.message);
  }
});

/* --- Load drafts (simple recent drafts dropdown) --- */
loadDraftsBtn.addEventListener('click', async () => {
  // load the most recent 10 drafts
  try {
    const q = query(collection(db, 'fights'));
    const snap = await getDocs(q);
    const drafts = [];
    snap.forEach(s => {
      const data = s.data();
      if (data.status === 'draft' || data.status === 'team_selection') drafts.push({ id: s.id, ...data});
    });
    if (!drafts.length) return alert('No draft fights found.');
    // pick the first (for simplicity) — you can replace with a UI selection
    const pick = drafts[0];
    await loadFight(pick.id);
    alert('Loaded draft: ' + pick.fightName);
  } catch(e){
    console.error(e);
    alert('Error loading drafts: ' + e.message);
  }
});

/* --- Load a fight --- */
async function loadFight(fightId) {
  if (!fightId) return;
  const dref = doc(db, 'fights', fightId);
  const snap = await getDoc(dref);
  if (!snap.exists()) { alert('Fight not found'); return; }
  currentFightId = fightId;
  currentFight = snap.data();

  // set inputs
  fightNameInput.value = currentFight.fightName || '';
  numTeamsInput.value = currentFight.numTeams || 1;
  playersPerTeamInput.value = currentFight.playersPerTeam || 10;
  subsPerTeamInput.value = currentFight.subsPerTeam || 0;

  // populate team names inputs
  renderTeamNameInputs();
  const teamNameInputs = $$('.teamNameInput');
  for (let i=0;i<teamNameInputs.length;i++){
    const key = `team${i+1}`;
    if (currentFight.teams && currentFight.teams[key]) teamNameInputs[i].value = currentFight.teams[key].name || `Team ${i+1}`;
  }

  rosterPool = Array.isArray(currentFight.rosterPool) ? [...currentFight.rosterPool] : [];
  fightStatusEl.textContent = currentFight.status || '—';

  // fetch roster cache & render
  await loadAllPlayers();
  renderRosterPool();
  renderTeams();
}

/* --- Load all players from /players (cache) --- */
async function loadAllPlayers() {
  try {
    const snap = await getDocs(collection(db, 'members')); // <-- FIXED
    rosterPlayersCache = [];
    snap.forEach(s => {
      rosterPlayersCache.push({ id: s.id, ...s.data() });
    });
  } catch (e) {
    console.error('loadAllPlayers', e);
    alert('Error loading members: ' + e.message);
  }
}


/* --- Roster pool render --- */
function renderRosterPool(filter='') {
  rosterPoolEl.innerHTML = '';
  const search = filter.trim().toLowerCase();

  // show all players found in rosterMembersCachemark whether they are in pool
  rosterMembersCache.forEach(p => {
    const inPool = rosterPool.includes(p.id);
    const name = (p.name || p.displayName || p.username || p.id).toString();
    if (search && !name.toLowerCase().includes(search) && !p.id.includes(search)) return;

    const card = document.createElement('div');
    card.className = 'player-card';
    card.dataset.uid = p.id;

    const avatar = document.createElement('div');
    avatar.className = 'player-avatar';
    avatar.textContent = (name[0] || '?').toUpperCase();

    const meta = document.createElement('div');
    meta.className = 'player-meta';
    meta.innerHTML = `<div style="font-weight:600">${name}</div><div class="small muted">${p.rank || ''} ${p.squad || ''}</div>`;

    const actions = document.createElement('div');
    actions.className = 'player-actions';

    const btn = document.createElement('button');
    btn.style.background = inPool ? '#ef4444' : '#2b6ef6';
    btn.style.borderRadius = '6px';
    btn.textContent = inPool ? 'Remove' : 'Add';
    btn.addEventListener('click', async () => {
      if (inPool) {
        // remove from pool
        rosterPool = rosterPool.filter(x => x !== p.id);
      } else {
        rosterPool.push(p.id);
      }
      // live UI update
      renderRosterPool(rosterSearch.value);
      renderTeams(); // in case removed from an assigned team
      // write to firestore if fight selected
      if (currentFightId) {
        const dref = doc(db, 'fights', currentFightId);
        try {
          // simple atomic update: write full rosterPool
          await updateDoc(dref, { rosterPool });
        } catch (err) {
          console.error('update rosterPool', err);
        }
      }
    });

    // Make draggable from roster pool: we will attach Sortable to parent element
    card.appendChild(avatar);
    card.appendChild(meta);
    actions.appendChild(btn);
    card.appendChild(actions);
    rosterPoolEl.appendChild(card);
  });

  // If empty:
  if (!rosterPoolEl.children.length) {
    const el = document.createElement('div');
    el.className = 'muted small';
    el.textContent = 'No players in roster pool. Use Add on players to add them (requires a created fight).';
    rosterPoolEl.appendChild(el);
  }

  // attach Sortable to rosterPool container (so cards can be dragged to team slots)
  setupSortableOnRosterPool();
}

/* --- Create team columns and slots based on currentFight --- */
function renderTeams() {
  teamsContainer.innerHTML = '';
  if (!currentFightId || !currentFight) {
    teamsContainer.innerHTML = `<div class="muted small">No fight loaded. Create or load a fight first.</div>`;
    return;
  }

  const numTeams = currentFight.numTeams || 1;
  const playersPerTeam = currentFight.playersPerTeam || 1;
  const subsPerTeam = currentFight.subsPerTeam || 0;
  const teams = currentFight.teams || {};

  // For each team build a column
  for (let t=1; t<=numTeams; t++){
    const key = `team${t}`;
    const teamObj = teams[key] || { name: `Team ${t}`, main: [], subs: [] };
    const col = document.createElement('div');
    col.className = 'team-column panel';
    col.style.flex = '0 0 300px';

    // Title
    const title = document.createElement('div');
    title.className = 'team-title';
    title.innerHTML = `<div>${teamObj.name}</div><div class="counters small">Main: <span id="count-${key}-main">${teamObj.main.length}/${playersPerTeam}</span></div>`;
    col.appendChild(title);

    // MAIN slots container
    const mainContainer = document.createElement('div');
    mainContainer.className = 'main-slots';
    mainContainer.dataset.slotFor = `${key}-main`;
    mainContainer.style.display = 'grid';
    mainContainer.style.gridTemplateColumns = '1fr';
    mainContainer.style.gap = '8px';
    mainContainer.style.marginTop = '8px';

    // render slots
    for (let i=0;i<playersPerTeam;i++){
      const slot = document.createElement('div');
      slot.className = 'slot empty';
      slot.dataset.team = key;
      slot.dataset.slotType = 'main';
      slot.dataset.slotIndex = i;
      // fill with player if assigned
      const playerUid = (teamObj.main && teamObj.main[i]) || null;
      if (playerUid) {
        const p = rosterMembersCache.find(x => x.id === playerUid) || { id: playerUid, name: playerUid };
        slot.classList.remove('empty');
        slot.innerHTML = buildPlayerCardHtml(p);
      } else {
        slot.textContent = 'Drag player here';
      }
      mainContainer.appendChild(slot);
    }
    col.appendChild(mainContainer);

    // SUBS (if subsPerTeam > 0)
    if (subsPerTeam > 0) {
      const subTitle = document.createElement('div');
      subTitle.style.marginTop = '12px';
      subTitle.style.fontWeight = '600';
      subTitle.textContent = 'Substitutes';
      col.appendChild(subTitle);

      const subContainer = document.createElement('div');
      subContainer.className = 'subs-slots';
      subContainer.dataset.slotFor = `${key}-subs`;
      subContainer.style.display = 'grid';
      subContainer.style.gridTemplateColumns = '1fr';
      subContainer.style.gap = '8px';
      subContainer.style.marginTop = '8px';

      for (let i=0;i<subsPerTeam;i++){
        const slot = document.createElement('div');
        slot.className = 'slot empty';
        slot.dataset.team = key;
        slot.dataset.slotType = 'subs';
        slot.dataset.slotIndex = i;
        const playerUid = (teamObj.subs && teamObj.subs[i]) || null;
        if (playerUid) {
          const p = rosterMembersCache.find(x => x.id === playerUid) || { id: playerUid, name: playerUid };
          slot.classList.remove('empty');
          slot.innerHTML = buildPlayerCardHtml(p);
        } else {
          slot.textContent = 'Drag player here';
        }
        subContainer.appendChild(slot);
      }

      col.appendChild(subContainer);
    }

    teamsContainer.appendChild(col);
  }

  // after building UI, attach Sortable to each slot container
  setupSortableForTeamSlots();
  // update counters
  updateAllCounters();
}

/* --- helper to build inner html for a player card inside a slot --- */
function buildPlayerCardHtml(p){
  const name = p.name || p.displayName || p.username || p.id;
  return `
    <div class="player-card" data-uid="${p.id}">
      <div class="player-avatar">${(name[0]||'?').toUpperCase()}</div>
      <div style="flex:1">
        <div style="font-weight:600">${escapeHtml(name)}</div>
        <div class="small muted">${p.rank || ''} ${p.squad || ''}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="removeFromSlotBtn" style="background:#ef4444;border-radius:6px">Remove</button>
      </div>
    </div>
  `;
}

/* --- Escape simple HTML --- */
function escapeHtml(s){ return (s+'').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

/* --- Setup Sortable for roster pool container --- */
let rosterSortable = null;
function setupSortableOnRosterPool(){
  // destroy existing
  if (rosterSortable) rosterSortable.destroy();
  rosterSortable = Sortable.create(rosterPoolEl, {
    group: { name: 'shared', pull: 'clone', put: false },
    animation: 150,
    sort: false, // keep roster as source only
    onEnd: function(evt){
      // nothing required here; drop handled by target container
    }
  });
}

/* --- Setup Sortable for team slot containers --- */
const slotSortables = [];
function setupSortableForTeamSlots(){
  // destroy previous
  slotSortables.forEach(s => s.destroy());
  slotSortables.length = 0;

  // find all slot containers (main & subs)
  const slotContainers = $$('.main-slots, .subs-slots');
  slotContainers.forEach(container => {
    const allowedMax = container.classList.contains('main-slots')
      ? currentFight.playersPerTeam
      : currentFight.subsPerTeam || 0;

    const sortable = Sortable.create(container, {
      group: { name: 'shared', pull: true, put: true },
      animation: 150,
      onAdd: function (evt) {
        // evt.item is the dragged element that may be a player-card clone from roster or a card moved from another slot
        handleDropIntoSlot(evt);
      },
      onRemove: function (evt) {
        // nothing special on remove; handled by add on destination
      },
      onUpdate: function (evt) {
        // reorder within same container => reflect in model
        persistSlotsToModel();
      },
      onStart: () => {},
    });
    slotSortables.push(sortable);
  });

  // attach click handlers for remove buttons inside slots
  // use event delegation
  teamsContainer.addEventListener('click', (ev) => {
    if (ev.target && ev.target.classList.contains('removeFromSlotBtn')) {
      const card = ev.target.closest('.player-card');
      if (!card) return;
      const uid = card.dataset.uid;
      // remove the card from its parent container
      const parent = card.closest('.main-slots, .subs-slots');
      if (!parent) return;
      // find and remove the element
      card.remove();
      // replace the slot child with placeholder "Drag player here" if empty
      // we will persist model
      persistSlotsToModel();
      renderTeams(); // re-render to get consistent state
    }
  });
}

/* --- when a player card is dropped into a slots container --- */
function handleDropIntoSlot(evt) {
  try {
    // evt.item may be the whole player-card element or a cloned node from roster (if pulled)
    const item = evt.item;
    const uid = item.dataset.uid;
    if (!uid) {
      // the roster pool clones may not have data-uid; try to read from child
      const found = item.querySelector('[data-uid]');
      if (found) {
        item.dataset.uid = found.dataset.uid;
      } else {
        // nothing we can do
        return;
      }
    }

    // ensure uniqueness: remove this uid from any other team slot or roster positions
    removeUidFromAllSlots(uid, item);

    // After adding, persist model
    persistSlotsToModel();
    renderTeams(); // keep UI in sync
  } catch (e) {
    console.error('handleDropIntoSlot', e);
  }
}

/* --- Remove a uid from all team arrays and roster pool except the current drop target --- */
function removeUidFromAllSlots(uid, keepElement) {
  // Remove from rosterPool if present (we allow both roster pool and assigned; but better to keep assigned only)
  rosterPool = rosterPool.filter(x => x !== uid);

  // Remove from currentFight teams
  if (!currentFight || !currentFight.teams) return;
  for (const key of Object.keys(currentFight.teams)) {
    const team = currentFight.teams[key];
    if (!team) continue;
    team.main = (team.main || []).filter(x => x !== uid);
    team.subs = (team.subs || []).filter(x => x !== uid);
  }
}

/* --- Persist slots UI -> currentFight.teams model --- */
function persistSlotsToModel() {
  // Build new teams object from DOM
  if (!currentFight) return;
  const teams = {};
  const columns = $$('.team-column');
  let idx = 0;
  columns.forEach(col => {
    idx++;
    const key = `team${idx}`;
    const mainContainer = col.querySelector('.main-slots');
    const subContainer = col.querySelector('.subs-slots');
    const mainUids = [];
    if (mainContainer) {
      const cards = mainContainer.querySelectorAll('.player-card');
      cards.forEach(c => mainUids.push(c.dataset.uid));
    }
    const subUids = [];
    if (subContainer) {
      const cards2 = subContainer.querySelectorAll('.player-card');
      cards2.forEach(c => subUids.push(c.dataset.uid));
    }
    const teamNameEl = col.querySelector('.team-title > div');
    teams[key] = {
      name: teamNameEl ? teamNameEl.textContent.trim() : `Team ${idx}`,
      main: mainUids,
      subs: subUids
    };
  });

  // set to currentFight
  currentFight.teams = teams;
  // also set rosterPool
  currentFight.rosterPool = rosterPool;
  updateAllCounters();
}

/* --- Update all counters (Main counts) --- */
function updateAllCounters() {
  if (!currentFight) return;
  const numTeams = currentFight.numTeams || 1;
  for (let i=1;i<=numTeams;i++){
    const key = `team${i}`;
    const team = currentFight.teams && currentFight.teams[key] ? currentFight.teams[key] : { main: [] };
    const cEl = document.getElementById(`count-${key}-main`);
    if (cEl) {
      cEl.textContent = `${(team.main && team.main.length) || 0}/${currentFight.playersPerTeam}`;
    }
  }
}

/* --- Save teams to Firestore --- */
saveTeamsBtn.addEventListener('click', async () => {
  if (!currentFightId || !currentFight) return alert('No fight loaded.');
  // compose payload
  persistSlotsToModel();

  // Basic validation: ensure no team main count exceed playersPerTeam and subs count exceed subsPerTeam
  const pp = parseInt(currentFight.playersPerTeam || 1);
  const sp = parseInt(currentFight.subsPerTeam || 0);
  for (const key of Object.keys(currentFight.teams)) {
    const t = currentFight.teams[key];
    if ((t.main || []).length > pp) return alert(`${t.name}: main exceeds allowed players per team (${pp})`);
    if ((t.subs || []).length > sp) return alert(`${t.name}: subs exceeds allowed substitutes per team (${sp})`);
  }

  try {
    const dref = doc(db, 'fights', currentFightId);
    await updateDoc(dref, {
      teams: currentFight.teams,
      rosterPool: rosterPool,
      status: 'team_selection',
      updatedAt: serverTimestamp()
    });
    alert('Teams saved.');
  } catch (e) {
    console.error('saveTeams', e);
    alert('Error saving teams: ' + e.message);
  }
});

/* --- Finalize (lock) --- */
finalizeBtn.addEventListener('click', async () => {
  if (!currentFightId) return alert('No fight loaded.');
  if (!confirm('Finalize teams? This will lock the fight for edits.')) return;
  try {
    const dref = doc(db, 'fights', currentFightId);
    await updateDoc(dref, { status: 'finalized', updatedAt: serverTimestamp() });
    fightStatusEl.textContent = 'finalized';
    alert('Fight finalized — teams locked.');
  } catch (e) {
    console.error('finalize', e);
    alert('Error finalizing: ' + e.message);
  }
});

/* --- Helper: remove a UID from any assigned slot in DOM (searches and removes) --- */
function removeUidFromDomSlots(uid) {
  const cards = teamsContainer.querySelectorAll(`.player-card[data-uid="${uid}"]`);
  cards.forEach(c => {
    c.remove();
  });
}

/* --- Utility: when roster search changes --- */
rosterSearch.addEventListener('input', (e) => {
  renderRosterPool(e.target.value);
});

/* --- React to changes in number of teams / players per team to regenerate team name inputs --- */
numTeamsInput.addEventListener('change', renderTeamNameInputs);
playersPerTeamInput.addEventListener('change', () => {
  // optional: clamp subs when playersPerTeam < some threshold
  renderTeamNameInputs();
});
subsPerTeamInput.addEventListener('change', renderTeamNameInputs);

/* --- init: render initial team name inputs --- */
renderTeamNameInputs();

/* --- small convenience: load fight if there's a query param fightId --- */
(async function initFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('fightId');
  if (id) {
    await loadFight(id);
  } else {
    // load player cache so roster search isn't blank
    await loadAllPlayers();
    renderRosterPool();
  }
})();
