import {normalizeName} from "./utils.js";
import {
  ANTI_SETUP_MOVES,
  ATTACK_BIAS_ORDER,
  BULKY_SUPPORT_THRESHOLD,
  CLERIC_MOVES,
  FAST_ATTACKER_SPEED_THRESHOLD,
  GUARD_MOVES,
  HELPING_HAND_MOVES,
  INTIMIDATE_ABILITIES,
  ITEM_ROLE_HINTS,
  PARALYSIS_CONTROL_MOVES,
  PHASING_MOVES,
  PIVOT_MOVES,
  POWDER_IMMUNE_ABILITIES,
  POWDER_IMMUNE_ITEMS,
  PRIMARY_ROLE_ORDER,
  PRIORITY_MOVES,
  RECOVERY_MOVES,
  REDIRECTION_MOVES,
  SCREEN_MOVES,
  SETUP_MOVES,
  SLEEP_IMMUNE_ABILITIES,
  SLEEP_MOVES,
  SLOW_ATTACKER_ATTACK_THRESHOLD,
  SLOW_ATTACKER_SPEED_THRESHOLD,
  SPEED_DEBUFF_MOVES,
  STRUCTURE_ROLE_ORDER,
  SUPPORT_ROLE_ORDER,
  TACTICAL_ROLE_ORDER,
  TAILWIND_MOVES,
  TERRAIN_ABILITIES,
  TERRAIN_ABUSER_ABILITIES,
  TERRAIN_ABUSER_MOVES,
  TERRAIN_MOVES,
  TRICK_ROOM_MOVE,
  WALLBREAKER_ATTACK_THRESHOLD,
  WEATHER_ABILITIES,
  WEATHER_ABUSER_ABILITIES,
  WEATHER_ABUSER_MOVES,
  WEATHER_MOVES,
  DISRUPTION_MOVES,
  STAT_DROP_MOVES,
} from "./team-role-rules.js";
import {
  getDamagingMoves,
  getNormalizedItem,
  getRoleMetrics,
  hasMove,
  hasTrackedAbility,
  hasTrackedItem,
  hasTrackedMove,
} from "./team-role-metrics.js";
import {getLegacyStructureRole, selectPrimaryRole} from "./team-role-primary.js";
import {
  getItemRoleSummary,
  getMoveSlotSummary,
  getOneLineSummaryParams,
  getRoleReasons,
  getVisibleRoleIds,
} from "./team-role-explanations.js";
import {getAdditionalUtilityRoles, getRoleProxyStatus} from "./team-role-extra.js";
import {
  getDeterministicMoveRoleIds,
  getDeterministicUtilityRoles,
} from "./team-role-deterministic.js";
import {getScoringCategoryCount} from "./team-role-categories.js";

export {
  ATTACK_BIAS_ORDER,
  PRIMARY_ROLE_ORDER,
  STRUCTURE_ROLE_ORDER,
  SUPPORT_ROLE_ORDER,
  TACTICAL_ROLE_ORDER,
};

function uniqueRoleIds(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function pushRole(roles, roleId) {
  if (!roles.includes(roleId)) roles.push(roleId);
}

export function getUtilityRoles(config = {}, options = {}) {
  const roles = [];
  if (hasTrackedMove(config, TAILWIND_MOVES)) pushRole(roles, "speedboostself");
  if (hasTrackedMove(config, SPEED_DEBUFF_MOVES)) pushRole(roles, "speeddebuff");
  if (hasTrackedMove(config, PARALYSIS_CONTROL_MOVES)) pushRole(roles, "paralysiscontrol");
  if (hasTrackedMove(config, SPEED_DEBUFF_MOVES) || hasTrackedMove(config, PARALYSIS_CONTROL_MOVES)) pushRole(roles, "softspeedcontrol");
  if (hasTrackedMove(config, TAILWIND_MOVES)) pushRole(roles, "tailwind");
  if (hasMove(config, TRICK_ROOM_MOVE)) pushRole(roles, "trickroom");
  if (hasTrackedMove(config, SCREEN_MOVES)) pushRole(roles, "screens");
  addWeatherRoles(config, roles);
  addTerrainRoles(config, roles);
  if (hasTrackedMove(config, SETUP_MOVES)) pushRole(roles, "setup");
  if (hasMove(config, "Fake Out")) pushRole(roles, "fakeout");
  addSupportUtilityRoles(config, roles);
  getDeterministicUtilityRoles(config).forEach((roleId) => pushRole(roles, roleId));
  getAdditionalUtilityRoles(config, options).forEach((roleId) => pushRole(roles, roleId));
  return roles;
}

function addWeatherRoles(config, roles) {
  const setter = hasTrackedMove(config, WEATHER_MOVES) || hasTrackedAbility(config, WEATHER_ABILITIES);
  const abuser = hasTrackedMove(config, WEATHER_ABUSER_MOVES) || hasTrackedAbility(config, WEATHER_ABUSER_ABILITIES);
  if (setter || abuser) pushRole(roles, "weather");
  if (setter) pushRole(roles, "weathersetter");
  if (abuser) pushRole(roles, "weatherabuser");
}

function addTerrainRoles(config, roles) {
  const setter = hasTrackedMove(config, TERRAIN_MOVES) || hasTrackedAbility(config, TERRAIN_ABILITIES);
  const abuser = hasTrackedMove(config, TERRAIN_ABUSER_MOVES) || hasTrackedAbility(config, TERRAIN_ABUSER_ABILITIES);
  if (setter || abuser) pushRole(roles, "terrain");
  if (setter) pushRole(roles, "terrainsetter");
  if (abuser) pushRole(roles, "terrainabuser");
}

function addSupportUtilityRoles(config, roles) {
  if (hasTrackedMove(config, PIVOT_MOVES)) pushRole(roles, "pivot");
  if (hasTrackedMove(config, REDIRECTION_MOVES)) pushRole(roles, "redirection");
  if (hasTrackedMove(config, GUARD_MOVES)) pushRole(roles, "guard");
  if (hasTrackedMove(config, HELPING_HAND_MOVES)) pushRole(roles, "helpinghand");
  if (hasTrackedMove(config, DISRUPTION_MOVES)) pushRole(roles, "disruption");
  if (hasTrackedMove(config, STAT_DROP_MOVES)) pushRole(roles, "debuffer");
  if (hasTrackedMove(config, SLEEP_MOVES)) pushRole(roles, "sleep");
  if (hasTrackedMove(config, RECOVERY_MOVES)) pushRole(roles, "recovery");
  if (hasTrackedMove(config, CLERIC_MOVES)) pushRole(roles, "cleric");
  if (hasTrackedMove(config, ANTI_SETUP_MOVES)) pushRole(roles, "antisetup");
  if (hasTrackedMove(config, PHASING_MOVES)) pushRole(roles, "phazer");
  if (hasTrackedMove(config, PRIORITY_MOVES)) pushRole(roles, "priority");
  if (hasTrackedAbility(config, INTIMIDATE_ABILITIES)) pushRole(roles, "intimidate");
  if (hasPowderImmunity(config)) pushRole(roles, "powderimmune");
  if (hasPowderImmunity(config)) pushRole(roles, "antipowder");
  if (hasTrackedAbility(config, SLEEP_IMMUNE_ABILITIES)) pushRole(roles, "antisleep");
}

function hasPowderImmunity(config = {}) {
  return (config.types || []).includes("Grass")
    || hasTrackedAbility(config, POWDER_IMMUNE_ABILITIES)
    || hasTrackedItem(config, POWDER_IMMUNE_ITEMS);
}

function getItemInfluences(config = {}) {
  const item = getNormalizedItem(config);
  const roleIds = ITEM_ROLE_HINTS[item] || [];
  return item ? [{item, roleIds}] : [];
}

function isSpreadMove(move = {}) {
  return move.target === "allAdjacentFoes" || move.target === "allAdjacent";
}

function getDamagingMoveRoleIds(move = {}, config = {}) {
  const moveId = normalizeName(move.name);
  const roles = ["attacker"];
  if (isSpreadMove(move)) roles.push("spreadattacker");
  if (!isSpreadMove(move)) roles.push("singlebreaker");
  if ((config.types || []).includes(move.type)) roles.push("stabattacker");
  if (move.type && !(config.types || []).includes(move.type)) roles.push("coverageattacker");
  if (WEATHER_ABUSER_MOVES.has(moveId)) roles.push("weatherabuser");
  if (TERRAIN_ABUSER_MOVES.has(moveId)) roles.push("terrainabuser");
  return roles;
}

function getMoveRoleIds(move = {}, config = {}) {
  const moveId = normalizeName(move.name);
  if (moveId === "protect") return ["protect", "sustain"];
  if (moveId === "fakeout") return ["fakeout", "lead", "tempocontrol", "disruption"];
  const deterministicRoles = getDeterministicMoveRoleIds(moveId);
  if (move.category === "Physical" || move.category === "Special") {
    return uniqueRoleIds([...getDamagingMoveRoleIds(move, config), ...deterministicRoles]);
  }
  return deterministicRoles;
}

function getMoveRoles(config = {}) {
  return (config.moves || []).map((move) => ({
    moveName: move.name,
    roleIds: getVisibleRoleIds(getMoveRoleIds(move, config)),
  }));
}

function getDerivedSecondaryRoles(config, metrics, utilityRoles, itemRoles) {
  const roles = [...utilityRoles, ...itemRoles];
  const damagingMoves = getDamagingMoves(config);
  if (metrics.speed >= FAST_ATTACKER_SPEED_THRESHOLD && metrics.damagingCount >= 1) roles.push("cleaner");
  if (metrics.damagingCount >= 2 && metrics.offenseScore >= WALLBREAKER_ATTACK_THRESHOLD) roles.push("nuke");
  if (metrics.damagingCount >= 2 && metrics.speed <= SLOW_ATTACKER_SPEED_THRESHOLD && metrics.offenseScore >= SLOW_ATTACKER_ATTACK_THRESHOLD) roles.push("slowattacker");
  if (metrics.hasSetup && metrics.hasOffensiveInvestment) roles.push("setupsweeper");
  if (damagingMoves.some(isSpreadMove)) roles.push("spreadattacker");
  if (damagingMoves.some((move) => !isSpreadMove(move))) roles.push("singlebreaker");
  if (damagingMoves.some((move) => move.type && !(config.types || []).includes(move.type))) roles.push("coverageattacker");
  if (damagingMoves.some((move) => (config.types || []).includes(move.type))) roles.push("stabattacker");
  if (metrics.hasPhysicalBulkInvestment && metrics.bulkScore >= BULKY_SUPPORT_THRESHOLD) roles.push("physicalwall");
  if (metrics.hasSpecialBulkInvestment && metrics.bulkScore >= BULKY_SUPPORT_THRESHOLD) roles.push("specialwall");
  if (metrics.bulkScore >= BULKY_SUPPORT_THRESHOLD && utilityRoles.includes("pivot")) roles.push("defensiveswitchin");
  return uniqueRoleIds(roles);
}

function getConditionalRoles(metrics, utilityRoles, itemRoles, primary = "attacker") {
  const roles = [];
  if (itemRoles.includes("externalspeed")) roles.push("externalspeed");
  if (primary === "attacker" && metrics.speed < FAST_ATTACKER_SPEED_THRESHOLD && metrics.damagingCount >= 2) roles.push("externalspeed");
  if (metrics.hasSetup && metrics.bulkScore < BULKY_SUPPORT_THRESHOLD) roles.push("coverdependent");
  if (utilityRoles.includes("disruption") && metrics.speed < FAST_ATTACKER_SPEED_THRESHOLD) roles.push("timingdependent");
  return uniqueRoleIds(roles);
}

function getCompressionScore(primary, secondary, conditional, moveRoles, itemRoles) {
  const mappedMoveCount = moveRoles.filter((entry) => entry.roleIds.length).length;
  const totalMoveCount = Math.max(moveRoles.length, 1);
  const stablePrimary = primary === "compression" ? 1 : 2;
  const moveCoverage = mappedMoveCount / totalMoveCount * 2;
  const itemBonus = itemRoles.length ? 0.6 : 0;
  const categoryCount = getScoringCategoryCount(primary, secondary);
  const categoryDiversityBonus = Math.max(0, categoryCount - 1) * 1.2;
  const depthBonus = Math.min(secondary.length, 6) * 0.18;
  const conflictPenalty = Math.max(0, secondary.length - mappedMoveCount - 2) * 0.25;
  const dependencyPenalty = conditional.length * 0.7;
  return Math.max(0, Math.min(10,
    stablePrimary + categoryDiversityBonus + depthBonus + moveCoverage + itemBonus
    - conflictPenalty - dependencyPenalty,
  ));
}

function getCompressionTier(score, secondary, conditional, moveRoles, primary) {
  const mappedMoveCount = moveRoles.filter((entry) => entry.roleIds.length).length;
  const categoryCount = getScoringCategoryCount(primary, secondary);
  if (categoryCount >= 5 && mappedMoveCount <= 2) return "fake";
  if (score >= 7 && categoryCount >= 3 && conditional.length <= 1) return "high";
  if (score >= 5 && categoryCount >= 2) return "medium";
  return "low";
}

export function analyzePokemonRoles(config = {}, options = {}) {
  const utilityRoles = getUtilityRoles(config, options);
  const itemInfluences = getItemInfluences(config);
  const itemRoles = uniqueRoleIds(itemInfluences.flatMap((entry) => entry.roleIds));
  const metrics = getRoleMetrics(config, utilityRoles);
  const moveRoles = getMoveRoles(config);
  const allSecondary = getDerivedSecondaryRoles(config, metrics, utilityRoles, itemRoles);
  const initialConditional = getConditionalRoles(metrics, utilityRoles, itemRoles);
  const initialScore = getCompressionScore("attacker", allSecondary, initialConditional, moveRoles, itemRoles);
  const primary = selectPrimaryRole(metrics, utilityRoles, itemRoles, initialScore);
  const conditional = getConditionalRoles(metrics, utilityRoles, itemRoles, primary);
  const secondary = allSecondary.filter((roleId) => roleId !== primary);
  const compressionScore = getCompressionScore(primary, secondary, conditional, moveRoles, itemRoles);
  const visibleSecondary = getVisibleRoleIds(secondary);
  const moveSlotSummary = getMoveSlotSummary(moveRoles, visibleSecondary);
  return {
    primary,
    secondary: visibleSecondary,
    conditional,
    compressionScore,
    compressionTier: getCompressionTier(compressionScore, secondary, conditional, moveRoles, primary),
    moveRoles,
    itemInfluences,
    itemRoleSummary: getItemRoleSummary(itemInfluences),
    roleReasons: getRoleReasons(primary, visibleSecondary),
    moveSlotQuality: moveSlotSummary.quality,
    moveSlotConflicts: moveSlotSummary.conflictCount,
    moveSlotSummary,
    oneLineSummaryKey: "analysis.roleOneLine",
    oneLineSummaryParams: getOneLineSummaryParams(primary, visibleSecondary, getCompressionTier(compressionScore, secondary, conditional, moveRoles, primary)),
    dependencies: conditional,
    roleProxyStatus: getRoleProxyStatus(options.roleContext),
    legacyStructureRole: getLegacyStructureRole(config, metrics, itemRoles),
  };
}

export function getAttackBias(config = {}) {
  const metrics = getRoleMetrics(config, getUtilityRoles(config));
  if (!metrics.physical && !metrics.special) return "support";
  if (metrics.isSupport && !metrics.hasPracticalAttackPlan) return "support";
  if (metrics.physical === metrics.special) return "mixed";
  return metrics.physical > metrics.special ? "physical" : "special";
}

export function getStructureRoles(config = {}, options = {}) {
  return [analyzePokemonRoles(config, options).legacyStructureRole];
}

export function getRoleSummaryIds(config = {}, limit = 5, options = {}) {
  const roleAnalysis = analyzePokemonRoles(config, options);
  return uniqueRoleIds([
    roleAnalysis.primary,
    ...roleAnalysis.secondary,
  ]).slice(0, limit);
}
