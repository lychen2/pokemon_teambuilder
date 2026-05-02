import {getNatureMultiplier, normalizeName} from "./utils.js";
import {
  DEFENSE_INVESTMENT_THRESHOLD,
  FAST_ATTACKER_SPEED_THRESHOLD,
  OFFENSE_INTENT_THRESHOLD,
  OFFENSE_INVESTMENT_THRESHOLD,
  SETUP_MOVES,
  SWEEPER_ATTACK_THRESHOLD,
  SUPPORT_SIGNAL_ROLES,
  WALLBREAKER_ATTACK_THRESHOLD,
} from "./team-role-rules.js";

const STAT_IDS = ["hp", "atk", "def", "spa", "spd", "spe"];
const HP_BASE_OFFSET = 75;
const OTHER_STAT_BASE_OFFSET = 20;
const PRACTICAL_ATTACK_MOVE_TARGET = 2;
const STRONG_MOVE_BASE_POWER_THRESHOLD = 70;
const STAB_MOVE_BASE_POWER_THRESHOLD = 60;

export function getNormalizedMoveNames(config = {}) {
  return (config.moveNames || config.moves?.map((move) => move.name) || [])
    .map((name) => normalizeName(name));
}

export function getNormalizedAbility(config = {}) {
  return normalizeName(config.ability);
}

export function getNormalizedItem(config = {}) {
  return normalizeName(config.item);
}

export function hasTrackedAbility(config, abilityPool) {
  return abilityPool.has(getNormalizedAbility(config));
}

export function hasTrackedItem(config, itemPool) {
  return itemPool.has(getNormalizedItem(config));
}

export function hasTrackedMove(config, movePool) {
  return getNormalizedMoveNames(config).some((name) => movePool.has(name));
}

export function hasMove(config, moveName) {
  return getNormalizedMoveNames(config).includes(normalizeName(moveName));
}

function getPoints(config = {}) {
  const raw = config.championPoints || config.points || {};
  return Object.fromEntries(STAT_IDS.map((stat) => [stat, Number(raw[stat] || 0)]));
}

function getRoleStat(config = {}, stat) {
  const explicit = Number(config.stats?.[stat]);
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  const base = Number(config.baseStats?.[stat] || 0);
  if (!base) {
    return 0;
  }
  const points = getPoints(config);
  const offset = stat === "hp" ? HP_BASE_OFFSET : OTHER_STAT_BASE_OFFSET;
  const rawValue = base + offset + Number(points[stat] || 0);
  return stat === "hp" ? rawValue : Math.floor(rawValue * getNatureMultiplier(config.nature, stat));
}

function getMoveCounts(config = {}) {
  const categories = (config.moves || []).map((move) => move.category || "Status");
  return {
    physical: categories.filter((category) => category === "Physical").length,
    special: categories.filter((category) => category === "Special").length,
    status: categories.filter((category) => category === "Status").length,
    total: categories.length || getNormalizedMoveNames(config).length,
  };
}

function getBulkScore(config = {}) {
  return (
    getRoleStat(config, "hp")
    + getRoleStat(config, "def")
    + getRoleStat(config, "spd")
  ) / 3;
}

function getOffenseScore(config = {}) {
  return Math.max(getRoleStat(config, "atk"), getRoleStat(config, "spa"));
}

function getSpeedScore(config = {}) {
  return getRoleStat(config, "spe");
}

function getInvestmentFlags(points) {
  const offensivePoints = Math.max(points.atk, points.spa);
  const physicalBulkPoints = points.hp + points.def;
  const specialBulkPoints = points.hp + points.spd;
  return {
    offensivePoints,
    physicalBulkPoints,
    specialBulkPoints,
    hasOffensiveInvestment: offensivePoints >= OFFENSE_INVESTMENT_THRESHOLD,
    hasOffensiveIntent: offensivePoints >= OFFENSE_INTENT_THRESHOLD,
    hasPhysicalBulkInvestment: physicalBulkPoints >= DEFENSE_INVESTMENT_THRESHOLD,
    hasSpecialBulkInvestment: specialBulkPoints >= DEFENSE_INVESTMENT_THRESHOLD,
  };
}

export function getDamagingMoves(config = {}) {
  return (config.moves || []).filter((move) => move.category === "Physical" || move.category === "Special");
}

function isStrongDamagingMove(move = {}, config = {}) {
  const basePower = Number(move.basePower || 0);
  const isStab = (config.types || []).includes(move.type);
  return basePower >= STRONG_MOVE_BASE_POWER_THRESHOLD
    || (isStab && basePower >= STAB_MOVE_BASE_POWER_THRESHOLD);
}

function getPracticalAttackFlags(config, damagingCount, investment) {
  const offenseScore = getOffenseScore(config);
  const speed = getSpeedScore(config);
  const strongDamagingCount = getDamagingMoves(config)
    .filter((move) => isStrongDamagingMove(move, config))
    .length;
  const hasStatBackedOffense = damagingCount >= PRACTICAL_ATTACK_MOVE_TARGET
    && strongDamagingCount >= 1
    && (
      offenseScore >= WALLBREAKER_ATTACK_THRESHOLD
      || (offenseScore >= SWEEPER_ATTACK_THRESHOLD && speed >= FAST_ATTACKER_SPEED_THRESHOLD)
    );
  // Top-level rule: low offense + high bulk = wall, period. A Pokémon's
  // attack plan is "practical" only when its actual offense stat clears the
  // sweeper threshold — having 3+ attack moves on a Shuckle does NOT make it
  // an attacker. Setup moves and offensive point allocation likewise can't
  // override the stat reality.
  const hasOffensiveStatFloor = offenseScore >= SWEEPER_ATTACK_THRESHOLD;
  return {
    strongDamagingCount,
    hasOffensiveStatFloor,
    hasPracticalAttackPlan:
      (damagingCount >= 3 && hasOffensiveStatFloor)
      || (damagingCount >= PRACTICAL_ATTACK_MOVE_TARGET
          && investment.hasOffensiveIntent
          && hasOffensiveStatFloor)
      || hasStatBackedOffense,
    hasStatBackedOffense,
  };
}

export function getRoleMetrics(config = {}, utilityRoles = []) {
  const moveCounts = getMoveCounts(config);
  const points = getPoints(config);
  const supportSignalCount = utilityRoles.filter((roleId) => SUPPORT_SIGNAL_ROLES.has(roleId)).length;
  const damagingCount = moveCounts.physical + moveCounts.special;
  const investment = getInvestmentFlags(points);
  const hasSetup = hasTrackedMove(config, SETUP_MOVES);
  const attackFlags = getPracticalAttackFlags(config, damagingCount, investment);
  const isSupport = !damagingCount
    || (!attackFlags.hasPracticalAttackPlan && moveCounts.status >= 3)
    || (!attackFlags.hasPracticalAttackPlan && supportSignalCount >= 3 && damagingCount <= 3)
    || (!attackFlags.hasPracticalAttackPlan && supportSignalCount >= 2 && moveCounts.status >= 1 && damagingCount <= 2);
  return {
    ...moveCounts,
    ...investment,
    ...attackFlags,
    points,
    bulkScore: getBulkScore(config),
    offenseScore: getOffenseScore(config),
    speed: getSpeedScore(config),
    hasSetup,
    supportSignalCount,
    damagingCount,
    isSupport,
  };
}
