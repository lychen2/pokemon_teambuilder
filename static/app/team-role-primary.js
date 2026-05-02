import {
  BULKY_SUPPORT_THRESHOLD,
  FAST_ATTACKER_SPEED_THRESHOLD,
  FRAIL_SWEEPER_BULK_THRESHOLD,
  OFFENSE_LEAN_THRESHOLD,
  SWEEPER_ATTACK_THRESHOLD,
  TANK_BULK_THRESHOLD,
  WALLBREAKER_ATTACK_THRESHOLD,
} from "./team-role-rules.js";
import {getNormalizedItem} from "./team-role-metrics.js";
import {
  ATTACK_NUKE_ITEMS,
  ATTACKER_UTILITY_ROLES,
  TECH_CHECK_ROLES,
} from "./team-role-primary-pools.js";

const SECONDARY_ROLE_THRESHOLD = 3;

function countMatchingRoles(roleIds, pool) {
  return roleIds.filter((roleId) => pool.has(roleId)).length;
}

function damageValue(metrics, utilityRoles, itemRoles) {
  const realCommit = metrics.hasOffensiveInvestment || (Number(metrics.offensivePoints || 0) >= 6);
  const offenseGate = realCommit || metrics.damagingCount >= 3;
  let v = 0;
  if (metrics.damagingCount >= 3) v += 2.5;
  else if (metrics.damagingCount >= 2) v += 1;
  if (metrics.hasOffensiveInvestment) v += 2;
  if (metrics.hasOffensiveIntent && !metrics.hasOffensiveInvestment) v += 1;
  if (metrics.hasStatBackedOffense && offenseGate) v += 1;
  if (offenseGate && metrics.offenseScore >= WALLBREAKER_ATTACK_THRESHOLD) v += 2;
  else if (offenseGate && metrics.offenseScore >= SWEEPER_ATTACK_THRESHOLD) v += 1;
  if (metrics.speed >= FAST_ATTACKER_SPEED_THRESHOLD) v += 1;
  if (metrics.hasSetup && metrics.hasOffensiveInvestment) v += 2;
  if (itemRoles.some((r) => r === "nuke" || r === "wallbreaker" || r === "cleaner")) v += 1;
  v += countMatchingRoles(utilityRoles, ATTACKER_UTILITY_ROLES) * 0.6;
  return v;
}

function speedControlValue(utilityRoles) {
  let v = 0;
  if (utilityRoles.includes("tailwind")) v += 3;
  if (utilityRoles.includes("trickroom")) v += 3;
  if (utilityRoles.includes("speeddebuff")) v += 2;
  if (utilityRoles.includes("paralysiscontrol")) v += 2;
  if (utilityRoles.includes("softspeedcontrol")) v += 1;
  if (utilityRoles.includes("speedboostself")) v += 1;
  if (utilityRoles.includes("tempocontrol")) v += 1;
  return v;
}

function defenseValue(metrics, utilityRoles, itemRoles) {
  const hasDefensiveIntent = utilityRoles.includes("recovery")
    || utilityRoles.includes("recoverywall")
    || utilityRoles.includes("leftoverssustain")
    || utilityRoles.includes("wall")
    || utilityRoles.includes("mixedwall")
    || utilityRoles.includes("damagesponge")
    || utilityRoles.includes("midgamestabilizer")
    || utilityRoles.includes("cleric")
    || utilityRoles.includes("healingsupport")
    || utilityRoles.includes("intimidate")
    || utilityRoles.includes("regeneratorpivot")
    || itemRoles.includes("tank")
    || itemRoles.includes("specialwall")
    || itemRoles.includes("assaultvesttank");
  let v = 0;
  if (metrics.bulkScore >= TANK_BULK_THRESHOLD && hasDefensiveIntent) v += 3;
  else if (metrics.bulkScore >= TANK_BULK_THRESHOLD) v += 1.5;
  else if (metrics.bulkScore >= BULKY_SUPPORT_THRESHOLD && hasDefensiveIntent) v += 1.5;
  else if (metrics.bulkScore >= BULKY_SUPPORT_THRESHOLD) v += 0.5;
  if (metrics.hasPhysicalBulkInvestment) v += 1;
  if (metrics.hasSpecialBulkInvestment) v += 1;
  if (utilityRoles.includes("recovery") || utilityRoles.includes("recoverywall")) v += 2;
  if (utilityRoles.includes("leftoverssustain")) v += 1;
  if (itemRoles.includes("tank") || itemRoles.includes("specialwall") || itemRoles.includes("assaultvesttank")) v += 1.5;
  if (utilityRoles.includes("wall") || utilityRoles.includes("mixedwall") || utilityRoles.includes("damagesponge")) v += 1.5;
  if (utilityRoles.includes("midgamestabilizer")) v += 1;
  return v;
}

function supportValue(metrics, utilityRoles) {
  let v = 0;
  if (utilityRoles.includes("fakeout")) v += 1.5;
  if (utilityRoles.includes("redirection") || utilityRoles.includes("followme") || utilityRoles.includes("ragepowder")) v += 2.5;
  if (utilityRoles.includes("helpinghand")) v += 1;
  if (utilityRoles.includes("screens") || utilityRoles.includes("reflectsetter") || utilityRoles.includes("lightscreensetter") || utilityRoles.includes("auroraveilsetter")) v += 2;
  if (utilityRoles.includes("cleric") || utilityRoles.includes("healingsupport")) v += 2;
  if (utilityRoles.includes("guard") || utilityRoles.includes("wideguard") || utilityRoles.includes("quickguard") || utilityRoles.includes("antispread")) v += 1.5;
  if (utilityRoles.includes("protectivesupport")) v += 1;
  if (metrics.isSupport) v += 1.5;
  return v;
}

function disruptValue(utilityRoles) {
  let v = 0;
  if (utilityRoles.includes("taunt")) v += 2;
  if (utilityRoles.includes("sleep")) v += 2;
  if (utilityRoles.includes("willowisp")) v += 2;
  if (utilityRoles.includes("haze") || utilityRoles.includes("clearsmog") || utilityRoles.includes("antisetup")) v += 1.5;
  if (utilityRoles.includes("encore")) v += 2;
  if (utilityRoles.includes("disable")) v += 3;
  if (utilityRoles.includes("imprison")) v += 2;
  if (utilityRoles.includes("intimidate")) v += 1;
  if (utilityRoles.includes("snarl") || utilityRoles.includes("eerieimpulse")) v += 1;
  if (utilityRoles.includes("faketears") || utilityRoles.includes("screech")
      || utilityRoles.includes("metalsound") || utilityRoles.includes("acidspray")) v += 0.8;
  if (utilityRoles.includes("debuffer")) v += 0.8;
  if (utilityRoles.includes("phazer")) v += 1;
  if (utilityRoles.includes("trapper")) v += 2;
  if (utilityRoles.includes("statusspreader") || utilityRoles.includes("paralysisspreader")) v += 1;
  return v;
}

function pivotValue(metrics, utilityRoles) {
  let v = 0;
  if (utilityRoles.includes("pivot")) v += 2.5;
  if (utilityRoles.includes("intimidatepivot")) v += 1.5;
  if (utilityRoles.includes("fakeoutpivot")) v += 1.2;
  if (utilityRoles.includes("regeneratorpivot")) v += 2;
  if (utilityRoles.includes("partingshot")) v += 1.5;
  if (utilityRoles.includes("uturnpivot") || utilityRoles.includes("voltswitchpivot") || utilityRoles.includes("flipturnpivot")) v += 1;
  if (utilityRoles.includes("weatherresetpivot") || utilityRoles.includes("terrainresetpivot")) v += 1;
  if (utilityRoles.includes("intimidate") && metrics.bulkScore >= BULKY_SUPPORT_THRESHOLD) v += 1;
  return v;
}

function modeSetterValue(utilityRoles) {
  let v = 0;
  ["rainsetter", "sunsetter", "sandsetter", "snowsetter",
   "electricterrainsetter", "psychicterrainsetter",
   "grassyterrainsetter", "mistyterrainsetter"].forEach((r) => {
    if (utilityRoles.includes(r)) v += 3;
  });
  if (utilityRoles.includes("weathercore") || utilityRoles.includes("terraincore")) v += 1.5;
  if (utilityRoles.includes("modeenabler")) v += 1;
  if (utilityRoles.includes("trickroom")) v += 2.5;
  return v;
}

function techCheckValue(utilityRoles, itemRoles) {
  const merged = new Set([...utilityRoles, ...itemRoles]);
  let v = 0;
  TECH_CHECK_ROLES.forEach((r) => { if (merged.has(r)) v += 1; });
  if (merged.has("antitrickroom")) v += 0.5;
  if (merged.has("antiweather") || merged.has("antiterrain")) v += 0.5;
  if (merged.has("trapper")) v += 4;
  if (merged.has("disable") || merged.has("imprison")) v += 2;
  if (merged.has("phazer")) v += 1.5;
  return v;
}

function getPrimaryScores(metrics, utilityRoles, itemRoles) {
  return {
    attacker: damageValue(metrics, utilityRoles, itemRoles),
    speedcontrol: speedControlValue(utilityRoles),
    tank: defenseValue(metrics, utilityRoles, itemRoles),
    support: supportValue(metrics, utilityRoles),
    disruptor: disruptValue(utilityRoles),
    pivot: pivotValue(metrics, utilityRoles),
    modesetter: modeSetterValue(utilityRoles),
    techcheck: techCheckValue(utilityRoles, itemRoles),
  };
}

function applyConflictRules(topRole, scores, metrics, utilityRoles) {
  if (topRole === "attacker" && metrics.isSupport && !metrics.hasPracticalAttackPlan) {
    return scores.support >= scores.disruptor ? "support" : "disruptor";
  }
  if (topRole === "support" && utilityRoles.includes("fakeout") && utilityRoles.includes("pivot")) {
    return scores.pivot >= scores.support - 0.5 ? "pivot" : "support";
  }
  if (topRole === "modesetter" && metrics.hasPracticalAttackPlan
      && scores.attacker >= scores.modesetter - 1) {
    return "attacker";
  }
  if (topRole === "tank" && metrics.hasPracticalAttackPlan && scores.attacker >= scores.tank - 0.5) {
    return scores.support >= scores.tank ? topRole : "attacker";
  }
  return topRole;
}

export function selectPrimaryRole(metrics, utilityRoles, itemRoles) {
  const scores = getPrimaryScores(metrics, utilityRoles, itemRoles);
  const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]);
  const [topRole] = ranked[0] || ["support", 0];
  return applyConflictRules(topRole, scores, metrics, utilityRoles);
}

export function getSecondaryRolesFromScores(metrics, utilityRoles, itemRoles, primaryRole) {
  const scores = getPrimaryScores(metrics, utilityRoles, itemRoles);
  return Object.entries(scores)
    .filter(([role, value]) => role !== primaryRole && value >= SECONDARY_ROLE_THRESHOLD)
    .sort((left, right) => right[1] - left[1])
    .map(([role]) => role);
}

function isLegacySweeper(metrics) {
  const strongLeaning = metrics.offenseScore >= WALLBREAKER_ATTACK_THRESHOLD || metrics.hasSetup;
  if (strongLeaning && metrics.offenseScore >= metrics.bulkScore + OFFENSE_LEAN_THRESHOLD) return true;
  if (metrics.offenseScore >= SWEEPER_ATTACK_THRESHOLD && metrics.offenseScore >= metrics.bulkScore + OFFENSE_LEAN_THRESHOLD) return true;
  return metrics.damagingCount >= 3 && metrics.offenseScore > metrics.bulkScore;
}

function getLegacyStructureByStats(metrics) {
  // A Pokémon needs actual offensive stats to be classified as a sweeper.
  // Setup move + offensive point allocation alone don't override low offense.
  if (metrics.hasSetup && metrics.hasOffensiveInvestment && metrics.damagingCount >= 1
      && metrics.offenseScore >= SWEEPER_ATTACK_THRESHOLD) {
    return metrics.bulkScore < FRAIL_SWEEPER_BULK_THRESHOLD ? "frailsweeper" : "sweeper";
  }
  const fastOffense = metrics.speed >= FAST_ATTACKER_SPEED_THRESHOLD
    && metrics.offenseScore >= SWEEPER_ATTACK_THRESHOLD;
  if (fastOffense) return metrics.bulkScore < FRAIL_SWEEPER_BULK_THRESHOLD ? "frailsweeper" : "sweeper";
  if (metrics.bulkScore >= TANK_BULK_THRESHOLD) return "tank";
  if (metrics.bulkScore >= TANK_BULK_THRESHOLD - 5 && metrics.supportSignalCount >= 1) return "tank";
  if (isLegacySweeper(metrics)) return "sweeper";
  if (metrics.hasPracticalAttackPlan && metrics.damagingCount >= 1) {
    return metrics.bulkScore < FRAIL_SWEEPER_BULK_THRESHOLD ? "frailsweeper" : "sweeper";
  }
  return metrics.supportSignalCount ? "support" : "tank";
}

export function getLegacyStructureRole(config, metrics, itemRoles) {
  const item = getNormalizedItem(config);
  if (metrics.isSupport && !metrics.hasPracticalAttackPlan) {
    return metrics.bulkScore >= BULKY_SUPPORT_THRESHOLD ? "bulkysupport" : "support";
  }
  if (itemRoles.includes("specialwall") && metrics.damagingCount >= 1) return "tank";
  if (ATTACK_NUKE_ITEMS.has(item) && metrics.damagingCount >= 1) {
    return metrics.bulkScore < FRAIL_SWEEPER_BULK_THRESHOLD ? "frailsweeper" : "sweeper";
  }
  if (item === "choicescarf" && metrics.damagingCount >= 2) {
    return metrics.bulkScore < FRAIL_SWEEPER_BULK_THRESHOLD ? "frailsweeper" : "sweeper";
  }
  if (item === "focussash" && metrics.hasOffensiveInvestment) return "frailsweeper";
  return getLegacyStructureByStats(metrics);
}
