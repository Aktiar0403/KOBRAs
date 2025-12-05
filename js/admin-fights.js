/***********************************************
 * admin-fights.js — FINAL UPDATED VERSION
 * 
 * - Firebase v10 compatible
 * - Reads alliance members from `/members`
 * - Fully functional dynamic war builder
 * - Drag & drop team assignment
 * - Admin-controlled fight creation
 ***********************************************/

import { db, auth } from "./firebase-config.js";

import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* -----------------------------------------------------------------------
   AUTH CHECK (Prevents unauthorized access)
------------------------------------------------------------------------ */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    alert("Please log in to access the War Builder.");
    window.location.href = "/login.html";
  }
});

/* -----------------------------------------------------------------------
   GLOBAL STATE
------------------------------------------------------------------------ */
let currentFightId = null;
let currentFight = null;

let rosterPlayersCache = [];       // ALL MEMBERS loaded from Firestore
let rosterPool = [];               // Members selected for this fight

/* -----------------------------------------------------------------------
   DOM HELPERS
------------------------------------------------------------------------ */
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

/* -----------------------------------------------------------------------
   UI ELEMENTS
------------------------------------------------------------------------ */
const fightNameInput = $("#fightName");
const numTeamsInput = $("#numTeams");
const playersPerTeamInput = $("#playersPerTeam");
const subsPerTeamInput = $("#subsPerTeam");
const teamNamesContainer = $("#teamNamesContainer");

const createFightBtn = $("#createFightBtn");
const loadDraftsBtn = $("#loadDraftsBtn");

const rosterPoolEl = $("#rosterPool");
const rosterSearch = $("#rosterSearch");

const saveTeamsBtn = $("#saveTeamsBtn");
const finalizeBtn = $("#finalizeBtn");

const teamsContainer = $("#teamsContainer");
const fightStatusEl = $("#fightStatus");

/* -----------------------------------------------------------------------
   GENERATE TEAM NAME INPUTS
------------------------------------------------------------------------ */
function renderTeamNameInputs() {
  const n = parseInt(numTeamsInput.value) || 1;
  teamNamesContainer.innerHTML = "";

  for (let i = 1; i <= n; i++) {
    const div = document.createElement("div");
    div.style.marginTop = "8px";
    div.innerHTML = `
      <label>Team ${i} Name</label>
      <input data-team-index="${i}" class="teamNameInput" type="text" placeholder="Team ${i}">
    `;
    teamNamesContainer.appendChild(div);
  }
}

/* -----------------------------------------------------------------------
   CREATE FIGHT
------------------------------------------------------------------------ */
createFightBtn.addEventListener("click", async () => {
  const fightName = fightNameInput.value.trim() || "New Fight";

  const numTeams = Math.max(1, parseInt(numTeamsInput.value));
  const playersPerTeam = Math.max(1, parseInt(playersPerTeamInput.value));
  const subsPerTeam = Math.max(0, parseInt(subsPerTeamInput.value));

  const teamNameInputs = $$(".teamNameInput");

  const teams = {};
  for (let i = 1; i <= numTeams; i++) {
    teams[`team${i}`] = {
      name: teamNameInputs[i - 1].value.trim() || `Team ${i}`,
      main: [],
      subs: [],
    };
  }

  const payload = {
    fightName,
    createdBy: auth.currentUser?.uid || "admin",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),

    numTeams,
    playersPerTeam,
    subsPerTeam,
    warType: "custom",

    rosterPool: [],
    teams,
    status: "draft",
  };

  try {
    const ref = await addDoc(collection(db, "fights"), payload);
    currentFightId = ref.id;
    await loadFight(ref.id);
    alert("Fight created successfully.");
  } catch (e) {
    console.error(e);
    alert("Error creating fight: " + e.message);
  }
});

/* -----------------------------------------------------------------------
   LOAD DRAFT FIGHT
------------------------------------------------------------------------ */
loadDraftsBtn.addEventListener("click", async () => {
  const q = await getDocs(collection(db, "fights"));
  let drafts = [];

  q.forEach((d) => {
    const data = d.data();
    if (data.status === "draft" || data.status === "team_selection") {
      drafts.push({ id: d.id, ...data });
    }
  });

  if (!drafts.length) return alert("No draft fights found.");

  const f = drafts[0];
  await loadFight(f.id);
});

/* -----------------------------------------------------------------------
   LOAD A FIGHT
------------------------------------------------------------------------ */
async function loadFight(id) {
  const ref = doc(db, "fights", id);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    alert("Fight not found.");
    return;
  }

  currentFightId = id;
  currentFight = snap.data();

  // load form
  fightNameInput.value = currentFight.fightName || "";
  numTeamsInput.value = currentFight.numTeams;
  playersPerTeamInput.value = currentFight.playersPerTeam;
  subsPerTeamInput.value = currentFight.subsPerTeam;

  // render team name inputs
  renderTeamNameInputs();
  const inputs = $$(".teamNameInput");
  let i = 1;
  for (let input of inputs) {
    input.value = currentFight.teams[`team${i}`]?.name || `Team ${i}`;
    i++;
  }

  rosterPool = currentFight.rosterPool || [];
  fightStatusEl.textContent = currentFight.status;

  await loadAllMembers();
  renderRosterPool();
  renderTeams();
}

/* -----------------------------------------------------------------------
   LOAD MEMBERS FROM /members
------------------------------------------------------------------------ */
async function loadAllMembers() {
  rosterPlayersCache = [];

  try {
    const snap = await getDocs(collection(db, "members"));
    snap.forEach((doc) => {
      rosterPlayersCache.push({ id: doc.id, ...doc.data() });
    });
  } catch (e) {
    console.error(e);
    alert("Error loading members: " + e.message);
  }
}

/* -----------------------------------------------------------------------
   RENDER ROSTER POOL
------------------------------------------------------------------------ */
function renderRosterPool(filter = "") {
  rosterPoolEl.innerHTML = "";

  const search = filter.toLowerCase();

  rosterPlayersCache.forEach((p) => {
    const name = (p.name || p.username || p.id).toLowerCase();

    if (search && !name.includes(search)) return;

    const inPool = rosterPool.includes(p.id);

    const card = document.createElement("div");
    card.className = "player-card";
    card.dataset.uid = p.id;

    card.innerHTML = `
      <div class="player-avatar">${(p.name?.[0] || "?").toUpperCase()}</div>
      <div class="player-meta">
        <div style="font-weight:600">${p.name || p.id}</div>
        <div class="small muted">${p.rank || ""} ${p.squad || ""}</div>
      </div>

      <button class="togglePoolBtn" style="background:${inPool ? "#ef4444" : "#2b6ef6"}">
        ${inPool ? "Remove" : "Add"}
      </button>
    `;

    card.querySelector(".togglePoolBtn").onclick = async () => {
      if (inPool) {
        rosterPool = rosterPool.filter((x) => x !== p.id);
      } else {
        rosterPool.push(p.id);
      }

      if (currentFightId) {
        await updateDoc(doc(db, "fights", currentFightId), { rosterPool });
      }

      renderRosterPool(rosterSearch.value);
      renderTeams();
    };

    rosterPoolEl.appendChild(card);
  });
}

/* -----------------------------------------------------------------------
   RENDER TEAMS (MAIN + SUBS)
------------------------------------------------------------------------ */
function renderTeams() {
  teamsContainer.innerHTML = "";

  const { numTeams, playersPerTeam, subsPerTeam, teams } = currentFight;

  for (let t = 1; t <= numTeams; t++) {
    const teamKey = `team${t}`;
    const team = teams[teamKey];

    const col = document.createElement("div");
    col.className = "team-column panel";
    col.style.width = "280px";

    col.innerHTML = `
      <div class="team-title">
        <div>${team.name}</div>
        <div class="counters small">
          <span id="count-${teamKey}-main">${team.main.length}/${playersPerTeam}</span>
        </div>
      </div>
    `;

    // MAIN slots
    const mainContainer = document.createElement("div");
    mainContainer.className = "main-slots";
    mainContainer.dataset.slotFor = `${teamKey}-main`;

    for (let i = 0; i < playersPerTeam; i++) {
      const slot = buildSlot(team.main[i], teamKey, "main", i);
      mainContainer.appendChild(slot);
    }

    col.appendChild(mainContainer);

    // SUBS
    if (subsPerTeam > 0) {
      const subTitle = document.createElement("div");
      subTitle.textContent = "Substitutes";
      subTitle.style.marginTop = "10px";
      col.appendChild(subTitle);

      const subsContainer = document.createElement("div");
      subsContainer.className = "subs-slots";
      subsContainer.dataset.slotFor = `${teamKey}-subs`;

      for (let i = 0; i < subsPerTeam; i++) {
        const slot = buildSlot(team.subs[i], teamKey, "subs", i);
        subsContainer.appendChild(slot);
      }

      col.appendChild(subsContainer);
    }

    teamsContainer.appendChild(col);
  }

  setupSortable();
  updateAllCounters();
}

/* -----------------------------------------------------------------------
   BUILD PLAYER SLOT
------------------------------------------------------------------------ */
function buildSlot(playerUid, teamKey, slotType, index) {
  const slot = document.createElement("div");
  slot.className = "slot";
  slot.dataset.team = teamKey;
  slot.dataset.slotType = slotType;
  slot.dataset.slotIndex = index;

  if (!playerUid) {
    slot.classList.add("empty");
    slot.textContent = "Drag player here";
    return slot;
  }

  const p = rosterPlayersCache.find((x) => x.id === playerUid);

  slot.innerHTML = `
    <div class="player-card" data-uid="${p.id}">
      <div class="player-avatar">${(p.name?.[0] || "?").toUpperCase()}</div>
      <div style="flex:1">
        <div style="font-weight:600">${p.name}</div>
        <div class="small muted">${p.rank || ""} ${p.squad || ""}</div>
      </div>
      <button class="removeFromSlotBtn" style="background:#ef4444">X</button>
    </div>
  `;

  return slot;
}

/* -----------------------------------------------------------------------
   SORTABLE SETUP
------------------------------------------------------------------------ */
function setupSortable() {
  const slotContainers = $$(".main-slots, .subs-slots");

  slotContainers.forEach((container) => {
    Sortable.create(container, {
      group: "teamSlots",
      animation: 150,
      onAdd: handleDrop,
      onUpdate: persistToModel,
    });
  });

  Sortable.create(rosterPoolEl, {
    group: { name: "teamSlots", pull: "clone", put: false },
    animation: 150,
  });

  teamsContainer.addEventListener("click", (e) => {
    if (!e.target.classList.contains("removeFromSlotBtn")) return;

    const card = e.target.closest(".player-card");
    if (!card) return;

    card.remove();
    persistToModel();
    renderTeams();
  });
}

/* -----------------------------------------------------------------------
   HANDLE DROP INTO SLOT
------------------------------------------------------------------------ */
function handleDrop(evt) {
  const card = evt.item;
  const uid = card.dataset.uid;

  // remove from all slots
  removeUidFromAllTeams(uid);

  persistToModel();
  renderTeams();
}

/* -----------------------------------------------------------------------
   REMOVE UID FROM ALL TEAMS
------------------------------------------------------------------------ */
function removeUidFromAllTeams(uid) {
  const { teams } = currentFight;

  for (const k in teams) {
    teams[k].main = teams[k].main.filter((x) => x !== uid);
    teams[k].subs = teams[k].subs.filter((x) => x !== uid);
  }

  rosterPool = rosterPool.filter((x) => x !== uid);
}

/* -----------------------------------------------------------------------
   SAVE TEAM MODEL BACK INTO currentFight
------------------------------------------------------------------------ */
function persistToModel() {
  const newTeams = {};
  const columns = $$(".team-column");

  let t = 1;
  columns.forEach((col) => {
    const key = `team${t}`;
    const mainUids = Array.from(
      col.querySelectorAll(".main-slots .player-card")
    ).map((c) => c.dataset.uid);

    const subsUids = Array.from(
      col.querySelectorAll(".subs-slots .player-card")
    ).map((c) => c.dataset.uid);

    const name = col.querySelector(".team-title div").textContent;

    newTeams[key] = { name, main: mainUids, subs: subsUids };
    t++;
  });

  currentFight.teams = newTeams;
}

/* -----------------------------------------------------------------------
   UPDATE COUNTERS
------------------------------------------------------------------------ */
function updateAllCounters() {
  const { numTeams, playersPerTeam } = currentFight;

  for (let i = 1; i <= numTeams; i++) {
    const key = `team${i}`;
    const el = $(`#count-${key}-main`);
    if (el) {
      const count = currentFight.teams[key].main.length;
      el.textContent = `${count}/${playersPerTeam}`;
    }
  }
}

/* -----------------------------------------------------------------------
   SAVE TEAMS BUTTON
------------------------------------------------------------------------ */
saveTeamsBtn.addEventListener("click", async () => {
  persistToModel();

  try {
    await updateDoc(doc(db, "fights", currentFightId), {
      teams: currentFight.teams,
      rosterPool,
      status: "team_selection",
      updatedAt: serverTimestamp(),
    });

    alert("Teams saved successfully.");
  } catch (e) {
    alert(e.message);
  }
});

/* -----------------------------------------------------------------------
   FINALIZE BUTTON
------------------------------------------------------------------------ */
finalizeBtn.addEventListener("click", async () => {
  if (!confirm("Finalize and lock this fight?")) return;

  try {
    await updateDoc(doc(db, "fights", currentFightId), {
      status: "finalized",
      updatedAt: serverTimestamp(),
    });

    alert("Fight finalized.");
  } catch (e) {
    alert(e.message);
  }
});

/* -----------------------------------------------------------------------
   SEARCH IN ROSTER
------------------------------------------------------------------------ */
rosterSearch.addEventListener("input", (e) => {
  renderRosterPool(e.target.value);
});

/* -----------------------------------------------------------------------
   INITIALIZE
------------------------------------------------------------------------ */
renderTeamNameInputs();

await loadAllMembers();
renderRosterPool();
