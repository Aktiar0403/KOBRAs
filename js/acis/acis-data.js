/* ======================================================
   ACIS v1.1 — DATA PREPARATION LAYER
   ------------------------------------------------------
   - Groups players by alliance
   - Sorts by power
   - Computes Warzone Floor Power (WFP)
   - Extracts Active / Bench (REAL players only)
   - NO combat logic
====================================================== */

import {
  ACTIVE_SQUAD_SIZE,
  BENCH_SIZE,
  MAX_ANALYZED_PLAYERS
} from "./acis-config.js";

/* =============================
   GROUP PLAYERS BY ALLIANCE
============================= */
function groupByAlliance(players) {
  const map = new Map();

  players.forEach(p => {
    if (!p.alliance) return;

    if (!map.has(p.alliance)) {
      map.set(p.alliance, []);
    }
    map.get(p.alliance).push(p);
  });

  return map;
}

/* =============================
   COMPUTE WARZONE FLOOR POWER
============================= */
function computeWarzoneFloor(players) {
  let min = Infinity;

  players.forEach(p => {
    const power = Number(p.totalPower || 0);
    if (power > 0 && power < min) min = power;
  });

  return min === Infinity ? 0 : min;
}

/* =============================
   PREPARE ALLIANCE DATA
============================= */
export function prepareAllianceData(players) {
  if (!Array.isArray(players)) {
    throw new Error("prepareAllianceData expects array");
  }

  // Assume all players belong to same warzone
  const warzone = players[0]?.warzone ?? null;

  // 1️⃣ Compute Warzone Floor Power
  const warzoneFloorPower = computeWarzoneFloor(players);

  // 2️⃣ Group players by alliance
  const allianceMap = groupByAlliance(players);

  // 3️⃣ Build structured alliance objects
  const alliances = [];

  allianceMap.forEach((alliancePlayers, allianceName) => {
    // Sort by power DESC
    const sorted = [...alliancePlayers]
      .sort((a, b) => (b.totalPower || 0) - (a.totalPower || 0));

    const top = sorted.slice(0, MAX_ANALYZED_PLAYERS);

    const activeReal = top.slice(0, ACTIVE_SQUAD_SIZE);
    const benchReal =
      activeReal.length === ACTIVE_SQUAD_SIZE
        ? top.slice(ACTIVE_SQUAD_SIZE, ACTIVE_SQUAD_SIZE + BENCH_SIZE)
        : [];

    const missingActiveCount =
      ACTIVE_SQUAD_SIZE - activeReal.length;

    alliances.push({
      alliance: allianceName,
      warzone,

      playersSorted: sorted,

      activeReal,
      benchReal,

      missingActiveCount,
      benchAvailable: benchReal.length > 0,

      warzoneFloorPower
    });
  });

  return alliances;
}
