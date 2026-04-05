import {normalizeName} from "./utils.js";

const TRICK_ROOM_MOVE = "trickroom";
const TAILWIND_MOVES = new Set(["tailwind"]);
const SPEED_CONTROL_MOVES = new Set(["tailwind", "icywind", "electroweb", "thunderwave", "scaryface", "cottonspore", "bulldoze", "rocktomb", "stringshot"]);
const PIVOT_MOVES = new Set(["partingshot", "uturn", "voltswitch", "flipturn", "batonpass", "teleport", "chillyreception"]);
const REDIRECTION_MOVES = new Set(["followme", "ragepowder"]);
const GUARD_MOVES = new Set(["wideguard", "quickguard"]);
const DISRUPTION_MOVES = new Set(["taunt", "encore", "spore", "willowisp", "nuzzle", "yawn", "disable"]);
const STAT_DROP_MOVES = new Set(["faketears", "eerieimpulse", "charm", "breakingswipe", "icywind", "electroweb", "snarl", "lunge", "strugglebug", "partingshot"]);
const SETUP_MOVES = new Set(["swordsdance", "bellydrum", "nastyplot", "quiverdance", "dragondance", "bulkup", "calmmind", "coil"]);
const RECOVERY_MOVES = new Set(["roost", "recover", "moonlight", "lunarblessing", "healpulse", "ingrain", "strengthsap", "gigadrain", "hornleech", "matchagotcha", "pollenpuff"]);
const ANTI_SETUP_MOVES = new Set(["haze", "roar", "whirlwind", "dragontail", "circlethrow", "clearsmog"]);
const SCREEN_MOVES = new Set(["reflect", "lightscreen", "auroraveil"]);
const WEATHER_MOVES = new Set(["sunnyday", "raindance", "sandstorm", "snowscape", "hail"]);
const WEATHER_ABILITIES = new Set(["drought", "drizzle", "sandstream", "snowwarning", "orichalcumpulse", "desolateland", "primordialsea"]);
const TERRAIN_MOVES = new Set(["electricterrain", "grassyterrain", "psychicterrain", "mistyterrain"]);
const TERRAIN_ABILITIES = new Set(["electricsurge", "grassysurge", "psychicsurge", "mistysurge", "hadronengine", "seedsower"]);
const PRIORITY_MOVES = new Set(["aquajet", "bulletpunch", "extremespeed", "iceshard", "machpunch", "quickattack", "shadowsneak", "suckerpunch", "fakeout", "firstimpression", "jetpunch", "accelerock", "watershuriken", "grassyglide"]);
const INTIMIDATE_ABILITIES = new Set(["intimidate"]);
const POWDER_IMMUNE_ABILITIES = new Set(["overcoat"]);
const POWDER_IMMUNE_ITEMS = new Set(["safetygoggles"]);
const BULKY_SUPPORT_THRESHOLD = 128;
const TANK_BULK_THRESHOLD = 130;
const FRAIL_SWEEPER_BULK_THRESHOLD = 118;
const FAST_ATTACKER_SPEED_THRESHOLD = 135;
const SWEEPER_ATTACK_THRESHOLD = 155;
const WALLBREAKER_ATTACK_THRESHOLD = 175;
const OFFENSE_LEAN_THRESHOLD = 24;
const SUPPORT_SIGNAL_ROLES = new Set([
  "speedcontrol",
  "tailwind",
  "trickroom",
  "screens",
  "weather",
  "terrain",
  "fakeout",
  "redirection",
  "guard",
  "pivot",
  "disruption",
  "statdrop",
  "recovery",
  "antisetup",
  "intimidate",
]);

export const TACTICAL_ROLE_ORDER = ["speedcontrol", "tailwind", "trickroom", "screens", "weather", "terrain", "setup"];
export const SUPPORT_ROLE_ORDER = ["fakeout", "redirection", "guard", "pivot", "disruption", "statdrop", "recovery", "antisetup", "priority", "intimidate", "powderimmune"];
export const STRUCTURE_ROLE_ORDER = ["sweeper", "frailsweeper", "tank", "support", "bulkysupport"];
export const KEY_ROLE_ORDER = [...TACTICAL_ROLE_ORDER, ...SUPPORT_ROLE_ORDER];
export const RECOMMENDATION_ROLE_IDS = ["speedcontrol", "trickroom", "fakeout", "redirection", "pivot", "disruption", "screens", "weather", "terrain", "intimidate"];
export const ATTACK_BIAS_ORDER = ["physical", "special", "mixed", "support"];

export function getNormalizedMoveNames(config) {
  return (config.moveNames || config.moves?.map((move) => move.name) || [])
    .map((name) => normalizeName(name));
}

function getNormalizedAbility(config) {
  return normalizeName(config.ability);
}

function getNormalizedItem(config) {
  return normalizeName(config.item);
}

function hasTrackedAbility(config, abilityPool) {
  return abilityPool.has(getNormalizedAbility(config));
}

function hasTrackedItem(config, itemPool) {
  return itemPool.has(getNormalizedItem(config));
}

export function hasTrackedMove(config, movePool) {
  return getNormalizedMoveNames(config).some((name) => movePool.has(name));
}

export function hasMove(config, moveName) {
  return getNormalizedMoveNames(config).includes(normalizeName(moveName));
}

function getBulkScore(config) {
  const stats = config.stats || config.baseStats || {};
  return (
    Number(stats.hp || 0)
    + Number(stats.def || 0)
    + Number(stats.spd || 0)
  ) / 3;
}

function getOffenseScore(config) {
  const stats = config.stats || config.baseStats || {};
  return Math.max(Number(stats.atk || 0), Number(stats.spa || 0));
}

function getMoveCounts(config) {
  const categories = (config.moves || []).map((move) => move.category || "Status");
  return {
    physical: categories.filter((category) => category === "Physical").length,
    special: categories.filter((category) => category === "Special").length,
    status: categories.filter((category) => category === "Status").length,
    total: categories.length,
  };
}

function getRoleMetrics(config) {
  const moveCounts = getMoveCounts(config);
  const utilityRoles = getUtilityRoles(config);
  const supportSignalCount = utilityRoles.filter((roleId) => SUPPORT_SIGNAL_ROLES.has(roleId)).length;
  const damagingCount = moveCounts.physical + moveCounts.special;
  const bulkScore = getBulkScore(config);
  const offenseScore = getOffenseScore(config);
  const speed = Number(config.stats?.spe || config.baseStats?.spe || 0);
  const hasSetup = hasTrackedMove(config, SETUP_MOVES);
  const isSupport = (
    !damagingCount
    || moveCounts.status >= 3
    || supportSignalCount >= 3 && damagingCount <= 3
    || supportSignalCount >= 2 && moveCounts.status >= 1 && damagingCount <= 2
  );
  return {
    ...moveCounts,
    bulkScore,
    offenseScore,
    speed,
    hasSetup,
    supportSignalCount,
    damagingCount,
    isSupport,
  };
}

function getPrimaryStructureRole(config) {
  const metrics = getRoleMetrics(config);
  if (metrics.isSupport) {
    return metrics.bulkScore >= BULKY_SUPPORT_THRESHOLD ? "bulkysupport" : "support";
  }
  const isFastOffense = metrics.speed >= FAST_ATTACKER_SPEED_THRESHOLD
    && metrics.offenseScore >= SWEEPER_ATTACK_THRESHOLD;
  if (isFastOffense) {
    return metrics.bulkScore < FRAIL_SWEEPER_BULK_THRESHOLD ? "frailsweeper" : "sweeper";
  }
  if (metrics.bulkScore >= TANK_BULK_THRESHOLD) {
    return "tank";
  }
  if (metrics.bulkScore >= TANK_BULK_THRESHOLD - 5 && metrics.supportSignalCount >= 1) {
    return "tank";
  }
  if (
    (metrics.offenseScore >= WALLBREAKER_ATTACK_THRESHOLD || metrics.hasSetup)
    && metrics.offenseScore >= metrics.bulkScore + OFFENSE_LEAN_THRESHOLD
  ) {
    return "sweeper";
  }
  if (
    metrics.offenseScore >= SWEEPER_ATTACK_THRESHOLD
    && metrics.offenseScore >= metrics.bulkScore + OFFENSE_LEAN_THRESHOLD
  ) {
    return "sweeper";
  }
  if (metrics.damagingCount >= 3 && metrics.offenseScore > metrics.bulkScore) {
    return "sweeper";
  }
  if (metrics.supportSignalCount) {
    return "support";
  }
  return "tank";
}

export function getUtilityRoles(config) {
  const roles = [];
  if (hasTrackedMove(config, SPEED_CONTROL_MOVES)) roles.push("speedcontrol");
  if (hasTrackedMove(config, TAILWIND_MOVES)) roles.push("tailwind");
  if (hasMove(config, TRICK_ROOM_MOVE)) roles.push("trickroom");
  if (hasTrackedMove(config, SCREEN_MOVES)) roles.push("screens");
  if (hasTrackedMove(config, WEATHER_MOVES) || hasTrackedAbility(config, WEATHER_ABILITIES)) roles.push("weather");
  if (hasTrackedMove(config, TERRAIN_MOVES) || hasTrackedAbility(config, TERRAIN_ABILITIES)) roles.push("terrain");
  if (hasTrackedMove(config, SETUP_MOVES)) roles.push("setup");
  if (hasMove(config, "Fake Out")) roles.push("fakeout");
  if (hasTrackedMove(config, PIVOT_MOVES)) roles.push("pivot");
  if (hasTrackedMove(config, REDIRECTION_MOVES)) roles.push("redirection");
  if (hasTrackedMove(config, GUARD_MOVES)) roles.push("guard");
  if (hasTrackedMove(config, DISRUPTION_MOVES)) roles.push("disruption");
  if (hasTrackedMove(config, STAT_DROP_MOVES)) roles.push("statdrop");
  if (hasTrackedMove(config, RECOVERY_MOVES)) roles.push("recovery");
  if (hasTrackedMove(config, ANTI_SETUP_MOVES)) roles.push("antisetup");
  if (hasTrackedMove(config, PRIORITY_MOVES)) roles.push("priority");
  if (hasTrackedAbility(config, INTIMIDATE_ABILITIES)) roles.push("intimidate");
  if ((config.types || []).includes("Grass") || hasTrackedAbility(config, POWDER_IMMUNE_ABILITIES) || hasTrackedItem(config, POWDER_IMMUNE_ITEMS)) roles.push("powderimmune");
  return roles;
}

export function getAttackBias(config) {
  const metrics = getRoleMetrics(config);
  if (metrics.isSupport) return "support";
  if (!metrics.physical && !metrics.special) return "support";
  if (metrics.physical === metrics.special) return "mixed";
  return metrics.physical > metrics.special ? "physical" : "special";
}

export function getStructureRoles(config) {
  return [getPrimaryStructureRole(config)];
}
