/* ======================================================
   ACIS v1.1 — CORE ENGINE (PART 1)
   ------------------------------------------------------
   - Classifies players
   - Applies dual weighting
   - Injects Plankton
   - Computes effective power
   - NO matchup logic
====================================================== */

import {
  POWER_CLASSES,
  CLASS_BASE_WEIGHTS,
  POSITION_FACTOR,
  ACTIVE_SQUAD_SIZE,
  ASSUMPTION_FACTOR
} from "./acis-config.js";

/* =============================
   CLASSIFY PLAYER BY POWER
============================= */
function classifyPower(power) {
  if (power >= POWER_CLASSES.MEGA_WHALE.min) return "MEGA_WHALE";
  if (power >= POWER_CLASSES.WHALE.min) return "WHALE";
  if (power >= POWER_CLASSES.SHARK.min) return "SHARK";
  if (power >= POWER_CLASSES.PIRANHA.min) return "PIRANHA";
  if (power >= POWER_CLASSES.SHRIMP.min) return "SHRIMP";
  return "KRILL";
}

/* =============================
   POWER POSITION FACTOR
============================= */
function computePositionFactor(power, cls) {
  if (cls === "PLANKTON") return 1;

  const ranges = POWER_CLASSES[cls];
  if (!ranges || !ranges.min || !ranges.max) return 1;

  const ratio =
    (power - ranges.min) / (ranges.max - ranges.min);

  return (
    POSITION_FACTOR.MIN +
    ratio * (POSITION_FACTOR.MAX - POSITION_FACTOR.MIN)
  );
}

/* =============================
   EFFECTIVE POWER CALCULATION
============================= */
function computeEffectivePower(player, cls) {
  const raw = player.totalPower;
  const base = CLASS_BASE_WEIGHTS[cls];
  const pos = computePositionFactor(raw, cls);

  return raw * base * pos;
}

/* =============================
   CREATE PLANKTON PLAYER
============================= */
function createPlankton(warzoneFloorPower) {
  const rawPower = warzoneFloorPower * ASSUMPTION_FACTOR;

  return {
    name: "Assumed",
    totalPower: rawPower,
    class: "PLANKTON",
    effectivePower: rawPower * CLASS_BASE_WEIGHTS.PLANKTON
  };
}

/* =============================
   PROCESS SINGLE ALLIANCE
============================= */
export function processAlliance(allianceData) {
  const {
    alliance,
    warzone,
    activeReal,
    benchReal,
    missingActiveCount,
    benchAvailable,
    warzoneFloorPower
  } = allianceData;

  const tierCounts = {
    MEGA_WHALE: 0,
    WHALE: 0,
    SHARK: 0,
    PIRANHA: 0,
    SHRIMP: 0,
    KRILL: 0,
    PLANKTON: 0
  };

  const activePlayers = [];
  const benchPlayers = [];

  let activePower = 0;
  let benchPower = 0;

  /* -------- ACTIVE REAL PLAYERS -------- */
  activeReal.forEach(p => {
    const cls = classifyPower(p.totalPower);
    const eff = computeEffectivePower(p, cls);

    tierCounts[cls]++;
    activePower += eff;

    activePlayers.push({
      ...p,
      class: cls,
      effectivePower: eff,
      assumed: false
    });
  });

  /* -------- PLANKTON FILL (MISSING) -------- */
  for (let i = 0; i < missingActiveCount; i++) {
    const plankton = createPlankton(warzoneFloorPower);

    tierCounts.PLANKTON++;
    activePower += plankton.effectivePower;

    activePlayers.push({
      ...plankton,
      assumed: true
    });
  }

  /* -------- BENCH (REAL ONLY) -------- */
  if (benchAvailable) {
    benchReal.forEach(p => {
      const cls = classifyPower(p.totalPower);
      const eff = computeEffectivePower(p, cls);

      tierCounts[cls]++;
      benchPower += eff;

      benchPlayers.push({
        ...p,
        class: cls,
        effectivePower: eff,
        assumed: false
      });
    });
  }

  return {
    alliance,
    warzone,

    activePlayers,
    benchPlayers,

    activePower,
    benchPower,

    tierCounts
  };
}
