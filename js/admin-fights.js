/***********************************************
 * admin-fights.js — FINAL FIXED (Color-coded Circle Cards)
 *
 * - Firebase v10 compatible
 * - Uses /members collection
 * - Circle card UI + squad color-coding
 * - No recursion / stack overflow
 * - Works with SortableJS (must be included in page)
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

/* ---------------------------
   Helpful constants & colors
   --------------------------- */
const SQUAD_COLORS = {
  TANK: "#1e90ff",
  MISSILE: "#ef4444",
  AIR: "#7c3aed",
  HYBRID: "#fb923c",
  DEFAULT: "#6b7280",
};

/* ---------------------------
   DOM ready wrapper
   --------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
  // Auth guard
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      alert("Please log in to access the War Builder.");
      window.location.href = "/login.html";
    } else {
      // Optionally populate admin label if present
      const adminLabel = document.getElementById("adminNameLabel");
      if (adminLabel) adminLabel.textContent = user.displayName || user.email || user.uid;
    }
  });

  /* ---------------------------
     State
     --------------------------- */
  let currentFightId = null;
  let currentFight = null;

  let rosterMembersCache = []; // all members from /members
  let rosterPool = []; // selected member IDs for current fight

  /* ---------------------------
     DOM helpers
     --------------------------- */
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from((c || document).querySelectorAll(s));

  /* ---------------------------
     Elements (must exist in admin-fights.html)
     --------------------------- */
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

  // Defensive: if some elements are missing, create placeholders to avoid errors
  if (!rosterPoolEl) {
    console.warn("admin-fights.js: #rosterPool not found in DOM");
  }
  if (!teamsContainer) {
    console.warn("admin-fights.js: #teamsContainer not found in DOM");
  }

  /* ---------------------------
     Utilities
     --------------------------- */
  function safeText(v) {
    if (v === null || v === undefined) return "";
    return String(v);
  }

  function squadColorFor(squad) {
    if (!squad) return SQUAD_COLORS.DEFAULT;
    const key = String(squad).toUpperCase();
    return SQUAD_COLORS[key] || SQUAD_COLORS.DEFAULT;
  }

  function starsText(n) {
    const c = parseInt(n) || 0;
    return "★".repeat(c) + "☆".repeat(Math.max(0, 5 - c));
  }

  /* ---------------------------
     Render team name inputs dynamically
     --------------------------- */
  function renderTeamNameInputs() {
    if (!teamNamesContainer) return;
    const n = Math.max(1, parseInt(numTeamsInput?.value || "1"));
    teamNamesContainer.innerHTML = "";
    for (let i = 1; i <= n; i++) {
      const div = document.createElement("div");
      div.style.marginTop = "8px";
      div.innerHTML = `<input data-team-index="${i}" class="teamNameInput" type="text" placeholder="Team ${i}" />`;
      teamNamesContainer.appendChild(div);
    }
  }

  /* ---------------------------
     Create Fight
     --------------------------- */
  if (createFightBtn) {
    createFightBtn.addEventListener("click", async () => {
      // guard elements exist
      if (!fightNameInput || !numTeamsInput || !playersPerTeamInput || !subsPerTeamInput) {
        return alert("Required fight inputs missing in page.");
      }

      const fightName = safeText(fightNameInput.value).trim() || "New Fight";
      const numTeams = Math.max(1, parseInt(numTeamsInput.value || "1"));
      const playersPerTeam = Math.max(1, parseInt(playersPerTeamInput.value || "1"));
      const subsPerTeam = Math.max(0, parseInt(subsPerTeamInput.value || "0"));

      const teamInputs = $$(".teamNameInput") || [];
      const teams = {};
      for (let i = 1; i <= numTeams; i++) {
        const nameInput = teamInputs[i - 1];
        const name = nameInput ? safeText(nameInput.value).trim() || `Team ${i}` : `Team ${i}`;
        teams[`team${i}`] = { name, main: [], subs: [] };
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
        await loadFight(currentFightId);
        alert("Fight created successfully.");
      } catch (err) {
        console.error("createFight error:", err);
        alert("Error creating fight: " + (err?.message || err));
      }
    });
  }

  /* ---------------------------
     Load draft fights (simple)
     --------------------------- */
  if (loadDraftsBtn) {
    loadDraftsBtn.addEventListener("click", async () => {
      try {
        const snap = await getDocs(collection(db, "fights"));
        const drafts = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data?.status === "draft" || data?.status === "team_selection") drafts.push({ id: d.id, ...data });
        });
        if (!drafts.length) return alert("No draft fights found.");
        await loadFight(drafts[0].id);
      } catch (err) {
        console.error("loadDrafts error:", err);
        alert("Error loading drafts: " + (err?.message || err));
      }
    });
  }

  /* ---------------------------
     Load a fight by id
     --------------------------- */
  async function loadFight(id) {
    if (!id) return;
    try {
      const snap = await getDoc(doc(db, "fights", id));
      if (!snap.exists()) {
        alert("Fight not found");
        return;
      }
      currentFightId = id;
      currentFight = snap.data();

      // populate inputs safely
      if (fightNameInput) fightNameInput.value = currentFight.fightName || "";
      if (numTeamsInput) numTeamsInput.value = currentFight.numTeams || 1;
      if (playersPerTeamInput) playersPerTeamInput.value = currentFight.playersPerTeam || 1;
      if (subsPerTeamInput) subsPerTeamInput.value = currentFight.subsPerTeam || 0;

      renderTeamNameInputs();
      const teamNameInputs = $$(".teamNameInput");
      for (let i = 0; i < teamNameInputs.length; i++) {
        const key = `team${i + 1}`;
        if (currentFight?.teams?.[key]?.name) teamNameInputs[i].value = currentFight.teams[key].name;
      }

      rosterPool = Array.isArray(currentFight.rosterPool) ? [...currentFight.rosterPool] : [];
      if (fightStatusEl) fightStatusEl.textContent = currentFight.status || "—";

      await loadAllMembers();
      renderRosterPool(); // draw pool
      renderTeams();
    } catch (err) {
      console.error("loadFight error:", err);
      alert("Error loading fight: " + (err?.message || err));
    }
  }

  /* ---------------------------
     Load members from /members
     --------------------------- */
  async function loadAllMembers() {
    rosterMembersCache = [];
    try {
      const snap = await getDocs(collection(db, "members"));
      snap.forEach((d) => {
        rosterMembersCache.push({ id: d.id, ...d.data() });
      });
      // sort cache by power desc for convenience
      rosterMembersCache.sort((a, b) => (b.power || 0) - (a.power || 0));
    } catch (err) {
      console.error("loadAllMembers error:", err);
      alert("Error loading members: " + (err?.message || err));
    }
  }

  /* ---------------------------
     Render roster pool (left)
     --------------------------- */
  function renderRosterPool(filter = "") {
    if (!rosterPoolEl) return;
    rosterPoolEl.innerHTML = "";

    const q = (filter || "").trim().toLowerCase();

    // Build fragment to minimize reflows
    const frag = document.createDocumentFragment();

    rosterMembersCache.forEach((m) => {
      const name = safeText(m.name || m.username || m.id).toLowerCase();
      if (q && !name.includes(q) && !String(m.squad || "").toLowerCase().includes(q)) return;

      const inPool = rosterPool.includes(m.id);

      // card container
      const card = document.createElement("div");
      card.className = "member-circle-card";
      card.dataset.uid = m.id;

      // avatar circle (color-coded by squad)
      const avatar = document.createElement("div");
      avatar.className = "circle-avatar";
      avatar.textContent = (safeText(m.name)[0] || "?").toUpperCase();
      avatar.style.background = squadColorFor(m.squad);

      // info block
      const info = document.createElement("div");
      info.className = "circle-info";
      info.innerHTML = `
        <div class="member-name">${safeText(m.name)}</div>
        <div class="member-sub">${safeText(m.squad)} • ${safeText(m.rank || "")}</div>
        <div class="member-stars">${starsText(m.activity || m.stars || 0)}</div>
        <div class="member-power">Power: ${m.power ?? 0}</div>
      `;

      // action button
      const btn = document.createElement("button");
      btn.className = "togglePoolBtn";
      btn.textContent = inPool ? "Remove" : "Add";
      btn.style.background = inPool ? "#ef4444" : "#2b6ef6";

      // attach safe event (not re-rendering recursively)
      btn.addEventListener("click", async () => {
        // toggle in-memory rosterPool
        if (rosterPool.includes(m.id)) {
          rosterPool = rosterPool.filter((id) => id !== m.id);
        } else {
          rosterPool.push(m.id);
        }

        // persist rosterPool if a fight is loaded
        if (currentFightId) {
          try {
            await updateDoc(doc(db, "fights", currentFightId), { rosterPool });
          } catch (err) {
            console.error("update rosterPool error:", err);
            alert("Could not update roster pool: " + (err?.message || err));
          }
        }

        // update UI: update teams and re-render roster after a microtick to avoid nested reflows
        renderTeams();
        setTimeout(() => renderRosterPool(rosterSearch?.value || ""), 0);
      });

      // assemble card
      card.appendChild(avatar);
      card.appendChild(info);
      card.appendChild(btn);
      frag.appendChild(card);
    });

    rosterPoolEl.appendChild(frag);
  }

  /* ---------------------------
     Build slot card (team slot)
     --------------------------- */
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

    const p = rosterMembersCache.find((x) => x.id === playerUid) || { id: playerUid, name: playerUid };

    // create member-circle-card inside slot
    const card = document.createElement("div");
    card.className = "member-circle-card small";
    card.dataset.uid = p.id;

    const avatar = document.createElement("div");
    avatar.className = "circle-avatar small";
    avatar.textContent = (safeText(p.name)[0] || "?").toUpperCase();
    avatar.style.background = squadColorFor(p.squad);

    const info = document.createElement("div");
    info.className = "circle-info small";
    info.innerHTML = `
      <div class="member-name">${safeText(p.name)}</div>
      <div class="member-sub">${safeText(p.squad)} • ${safeText(p.rank || "")}</div>
      <div class="member-stars">${starsText(p.activity || p.stars || 0)}</div>
      <div class="member-power">Power: ${p.power ?? 0}</div>
    `;

    const removeBtn = document.createElement("button");
    removeBtn.className = "circle-remove";
    removeBtn.textContent = "X";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // remove from DOM then persist
      // remove UID from all teams and re-render
      removeUidFromAllTeams(p.id);
      persistToModel();
      renderTeams();
    });

    card.appendChild(avatar);
    card.appendChild(info);
    card.appendChild(removeBtn);

    slot.appendChild(card);
    return slot;
  }

  /* ---------------------------
     Render teams (right)
     --------------------------- */
  function renderTeams() {
    if (!teamsContainer) return;
    teamsContainer.innerHTML = "";

    // require currentFight
    if (!currentFight) {
      teamsContainer.innerHTML = `<div class="muted small">No fight loaded. Create or load a fight.</div>`;
      return;
    }

    const numTeams = currentFight.numTeams || 1;
    const playersPerTeam = currentFight.playersPerTeam || 1;
    const subsPerTeam = currentFight.subsPerTeam || 0;

    const frag = document.createDocumentFragment();

    for (let t = 1; t <= numTeams; t++) {
      const key = `team${t}`;
      const teamObj = currentFight.teams?.[key] || { name: `Team ${t}`, main: [], subs: [] };

      const col = document.createElement("div");
      col.className = "team-column panel";
      col.style.width = "300px";

      // header
      const header = document.createElement("div");
      header.className = "team-title";
      header.innerHTML = `<div>${safeText(teamObj.name)}</div>
        <div class="counters small">Main: <span id="count-${key}-main">${(teamObj.main||[]).length}/${playersPerTeam}</span></div>`;
      col.appendChild(header);

      // main slots container
      const mainContainer = document.createElement("div");
      mainContainer.className = "main-slots";
      mainContainer.dataset.slotFor = `${key}-main`;
      for (let i = 0; i < playersPerTeam; i++) {
        const uid = (teamObj.main && teamObj.main[i]) || null;
        mainContainer.appendChild(buildSlot(uid, key, "main", i));
      }
      col.appendChild(mainContainer);

      // subs
      if (subsPerTeam > 0) {
        const subTitle = document.createElement("div");
        subTitle.textContent = "Substitutes";
        subTitle.style.marginTop = "12px";
        col.appendChild(subTitle);

        const subsContainer = document.createElement("div");
        subsContainer.className = "subs-slots";
        subsContainer.dataset.slotFor = `${key}-subs`;
        for (let i = 0; i < subsPerTeam; i++) {
          const uid = (teamObj.subs && teamObj.subs[i]) || null;
          subsContainer.appendChild(buildSlot(uid, key, "subs", i));
        }
        col.appendChild(subsContainer);
      }

      frag.appendChild(col);
    }

    teamsContainer.appendChild(frag);

    // attach Sortable handlers
    setupSortable();
    updateAllCounters();
  }

  /* ---------------------------
     Sortable setup (no recursion)
     --------------------------- */
  function setupSortable() {
    // destroy previous sortables if any by replacing nodes? Simpler: re-create Sortable on containers
    const slotContainers = $$(".main-slots, .subs-slots");
    slotContainers.forEach((container) => {
      // allow moving between all lists in the same group
      Sortable.create(container, {
        group: "teamSlots",
        animation: 150,
        onAdd: (evt) => {
          // when a new element added, ensure uniqueness
          const card = evt.item;
          const uid = card?.dataset?.uid;
          if (!uid) return;

          // remove duplicates from other slots
          removeUidFromAllTeams(uid);

          // place uid into model at this slot (persist after a microtick)
          setTimeout(() => {
            persistToModel();
            renderTeams();
          }, 0);
        },
        onUpdate: () => {
          persistToModel();
          updateAllCounters();
        },
      });
    });

    // roster pool: clone from source
    if (rosterPoolEl) {
      Sortable.create(rosterPoolEl, {
        group: { name: "teamSlots", pull: "clone", put: false },
        animation: 150,
        sort: false,
      });
    }
  }

  /* ---------------------------
     Remove UID from all teams
     --------------------------- */
  function removeUidFromAllTeams(uid) {
    if (!currentFight?.teams) return;
    for (const k of Object.keys(currentFight.teams)) {
      const t = currentFight.teams[k];
      t.main = (t.main || []).filter((x) => x !== uid);
      t.subs = (t.subs || []).filter((x) => x !== uid);
    }
    rosterPool = rosterPool.filter((x) => x !== uid);
  }

  /* ---------------------------
     Persist DOM -> currentFight model
     --------------------------- */
  function persistToModel() {
    if (!currentFight) return;
    const newTeams = {};
    const columns = $$(".team-column");
    let idx = 1;
    columns.forEach((col) => {
      const key = `team${idx}`;
      const mainUids = Array.from(col.querySelectorAll(".main-slots .member-circle-card[data-uid]")).map((c) => c.dataset.uid);
      const subsUids = Array.from(col.querySelectorAll(".subs-slots .member-circle-card[data-uid]")).map((c) => c.dataset.uid);
      const nameEl = col.querySelector(".team-title > div");
      const name = nameEl ? nameEl.textContent.trim() : `Team ${idx}`;
      newTeams[key] = { name, main: mainUids, subs: subsUids };
      idx++;
    });
    currentFight.teams = newTeams;
  }

  /* ---------------------------
     Update counters (team power optionally)
     --------------------------- */
  function updateAllCounters() {
    if (!currentFight) return;
    const numTeams = currentFight.numTeams || 1;
    for (let i = 1; i <= numTeams; i++) {
      const key = `team${i}`;
      const el = $(`#count-${key}-main`);
      if (el && currentFight.teams && currentFight.teams[key]) {
        el.textContent = `${(currentFight.teams[key].main || []).length}/${currentFight.playersPerTeam || 0}`;
      }
    }
  }

  /* ---------------------------
     Save teams to Firestore
     --------------------------- */
  if (saveTeamsBtn) {
    saveTeamsBtn.addEventListener("click", async () => {
      if (!currentFightId || !currentFight) return alert("No fight loaded.");
      persistToModel();

      // basic validation
      const pp = parseInt(currentFight.playersPerTeam || 1);
      const sp = parseInt(currentFight.subsPerTeam || 0);
      for (const key of Object.keys(currentFight.teams || {})) {
        const t = currentFight.teams[key];
        if ((t.main || []).length > pp) return alert(`${t.name}: main exceeds allowed players (${pp})`);
        if ((t.subs || []).length > sp) return alert(`${t.name}: subs exceeds allowed (${sp})`);
      }

      try {
        await updateDoc(doc(db, "fights", currentFightId), {
          teams: currentFight.teams,
          rosterPool,
          status: "team_selection",
          updatedAt: serverTimestamp(),
        });
        alert("Teams saved.");
      } catch (err) {
        console.error("saveTeams error:", err);
        alert("Error saving teams: " + (err?.message || err));
      }
    });
  }

  /* ---------------------------
     Finalize (lock) fight
     --------------------------- */
  if (finalizeBtn) {
    finalizeBtn.addEventListener("click", async () => {
      if (!currentFightId) return alert("No fight loaded.");
      if (!confirm("Finalize teams? This will lock the fight.")) return;
      try {
        await updateDoc(doc(db, "fights", currentFightId), {
          status: "finalized",
          updatedAt: serverTimestamp(),
        });
        if (fightStatusEl) fightStatusEl.textContent = "finalized";
        alert("Fight finalized.");
      } catch (err) {
        console.error("finalize error:", err);
        alert("Error finalizing: " + (err?.message || err));
      }
    });
  }

  /* ---------------------------
     Search handler
     --------------------------- */
  if (rosterSearch) {
    rosterSearch.addEventListener("input", (e) => {
      renderRosterPool(e.target.value || "");
    });
  }

  /* ---------------------------
     Initialization
     --------------------------- */
  // Make sure inputs exist before rendering
  renderTeamNameInputs();

  // If there is a fightId in query param, load it
  const params = new URLSearchParams(window.location.search);
  const qFightId = params.get("fightId");
  if (qFightId) {
    await loadFight(qFightId);
  } else {
    // just load members so roster has content
    await loadAllMembers();
    renderRosterPool();
    // show placeholder teams if no fight
    renderTeams();
  }
}); // end DOMContentLoaded
