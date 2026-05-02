import {isSpreadMove} from "./battle-semantics.js";
import {normalizeName} from "./utils.js";
import {
  ANTI_FAKE_OUT_ABILITIES,
  ANTI_FAKE_OUT_ITEMS,
  ANTI_INTIMIDATE_ABILITIES,
  ANTI_INTIMIDATE_ITEMS,
  ANTI_PRIORITY_ABILITIES,
  ANTI_SETUP_MOVES,
  CLERIC_MOVES,
  GUARD_MOVES,
  HELPING_HAND_MOVES,
  INTIMIDATE_ABILITIES,
  OFFENSIVE_DEBUFF_MOVES,
  PARALYSIS_CONTROL_MOVES,
  PASSIVE_DAMAGE_MOVES,
  PHASING_MOVES,
  PIVOT_MOVES,
  POWDER_IMMUNE_ABILITIES,
  POWDER_IMMUNE_ITEMS,
  PRIORITY_MOVES,
  QUICK_GUARD_MOVES,
  RECOVERY_MOVES,
  REDIRECTION_MOVES,
  SCREEN_MOVES,
  SLEEP_IMMUNE_ABILITIES,
  SLEEP_MOVES,
  SPEED_DEBUFF_MOVES,
  TAILWIND_MOVES,
  TERRAIN_ABILITIES,
  TERRAIN_ABUSER_ABILITIES,
  TERRAIN_MOVES,
  TERRAIN_ABUSER_MOVES,
  TRICK_ROOM_MOVE,
  WEATHER_ABILITIES,
  WEATHER_ABUSER_ABILITIES,
  WEATHER_MOVES,
  WEATHER_ABUSER_MOVES,
  WEATHER_SPEED_ABILITIES,
  WIDE_GUARD_MOVES,
  WILL_O_WISP_MOVES,
} from "./team-role-rules.js";
import {
  getEstimatedRoleMetrics,
} from "./team-role-proxy.js";
import {getConfigOnlyUtilityRoles} from "./team-role-config-only.js";
import {
  getNormalizedAbility,
  getNormalizedItem,
  getNormalizedMoveNames,
  hasMove,
  hasTrackedAbility,
  hasTrackedItem,
  hasTrackedMove,
} from "./team-role-metrics.js";

const ATTACKER_RANK = 0.7;
const MIXED_ATTACKER_RANK = 0.6;
const FAST_ATTACKER_SPEED_RANK = 0.75;
const SPEED_PRESSURE_RANK = 0.8;
const PRIMARY_ATTACKER_RANK = 0.75;
const SECONDARY_ATTACKER_RANK = 0.55;
const TRICK_ROOM_SWEEPER_SPEED_RANK = 0.25;
const WALL_RANK = 0.75;
const MIXED_WALL_RANK = 0.65;
const BULKY_RANK = 0.5;
const RECOVERY_WALL_RANK = 0.6;
const DAMAGE_SPONGE_RANK = 0.7;
// "Heavy offense" cuts off pure-wall labels: a Pokémon whose offense ranks in
// the upper tier should be classed as bulkyattacker (or wallbreaker), not as a
// passive wall — even if it has high single-side bulk.
const HEAVY_OFFENSE_RANK = 0.7;
const SPECIAL_ANTI_INTIMIDATE_RANK = 0.7;
const LOW_PHYSICAL_ATTACK_RANK = 0.4;
const SUPPORT_MOVE_TARGET = 2;
const ASSAULT_VEST = "assaultvest";
const CHOICE_SCARF = "choicescarf";
const LEFTOVERS = "leftovers";
const GHOST_TYPE = "Ghost";
const GRASS_TYPE = "Grass";

const SINGLE_MOVE_ROLE_RULES = Object.freeze([
  ["wideguard", "wideguard"],
  ["quickguard", "quickguard"],
  ["reflect", "reflectsetter"],
  ["lightscreen", "lightscreensetter"],
  ["auroraveil", "auroraveilsetter"],
  ["followme", "followme"],
  ["ragepowder", "ragepowder"],
  ["taunt", "taunt"],
  ["haze", "haze"],
  ["clearsmog", "clearsmog"],
  ["encore", "encore"],
  ["imprison", "imprison"],
  ["disable", "disable"],
  ["snarl", "snarl"],
  ["eerieimpulse", "eerieimpulse"],
  ["faketears", "faketears"],
  ["screech", "screech"],
  ["metalsound", "metalsound"],
  ["acidspray", "acidspray"],
  ["partingshot", "partingshot"],
  ["uturn", "uturnpivot"],
  ["voltswitch", "voltswitchpivot"],
  ["nobleroar", "nobleroar"],
  ["tickle", "tickle"],
  ["floralhealing", "floralhealing"],
]);

const WEATHER_SETTER_RULES = Object.freeze([
  ["rainsetter", "drizzle", "raindance"],
  ["sunsetter", "drought", "sunnyday"],
  ["sandsetter", "sandstream", "sandstorm"],
  ["snowsetter", "snowwarning", "snowscape"],
]);

const TERRAIN_SETTER_RULES = Object.freeze([
  ["electricterrainsetter", "electricsurge", "electricterrain"],
  ["psychicterrainsetter", "psychicsurge", "psychicterrain"],
  ["grassyterrainsetter", "grassysurge", "grassyterrain"],
  ["mistyterrainsetter", "mistysurge", "mistyterrain"],
]);

function uniqueRoleIds(roleIds = []) {
  return [...new Set(roleIds.filter(Boolean))];
}

function hasType(config = {}, type) {
  return (config.types || []).includes(type);
}

function hasTeraType(config = {}, type) {
  return String(config.teraType || "") === type;
}

function hasSpreadAttack(config = {}) {
  return (config.moves || []).some((move) => move.category !== "Status" && isSpreadMove(move));
}

function hasPowderImmunity(config = {}) {
  return hasType(config, GRASS_TYPE)
    || hasTrackedAbility(config, POWDER_IMMUNE_ABILITIES)
    || hasTrackedItem(config, POWDER_IMMUNE_ITEMS);
}

function supportMoveCount(config = {}) {
  return (config.moves || []).filter((move) => move.category === "Status").length;
}

function hasRecoveryOrLeftovers(config = {}) {
  return hasTrackedMove(config, RECOVERY_MOVES) || getNormalizedItem(config) === LEFTOVERS;
}

function hasWallMaintenanceTool(config = {}) {
  return hasRecoveryOrLeftovers(config)
    || hasTrackedMove(config, SCREEN_MOVES)
    || hasTrackedMove(config, CLERIC_MOVES)
    || hasTrackedMove(config, SLEEP_MOVES)
    || hasTrackedMove(config, PARALYSIS_CONTROL_MOVES)
    || hasTrackedMove(config, WILL_O_WISP_MOVES)
    || hasTrackedMove(config, ANTI_SETUP_MOVES);
}

function isWeatherSetter(config = {}) {
  return hasTrackedMove(config, WEATHER_MOVES) || hasTrackedAbility(config, WEATHER_ABILITIES);
}

function isWeatherAbuser(config = {}) {
  return hasTrackedMove(config, WEATHER_ABUSER_MOVES) || hasTrackedAbility(config, WEATHER_ABUSER_ABILITIES);
}

function isTerrainSetter(config = {}) {
  return hasTrackedMove(config, TERRAIN_MOVES) || hasTrackedAbility(config, TERRAIN_ABILITIES);
}

function isTerrainAbuser(config = {}) {
  return hasTrackedMove(config, TERRAIN_ABUSER_MOVES) || hasTrackedAbility(config, TERRAIN_ABUSER_ABILITIES);
}

function getMaxOffenseRank(proxy) {
  return Math.max(Number(proxy.estimatedAtkRank || 0), Number(proxy.estimatedSpaRank || 0));
}

function getMaxBulkRank(proxy) {
  return Math.max(Number(proxy.estimatedPhysBulkRank || 0), Number(proxy.estimatedSpBulkRank || 0));
}

function addSingleMoveRoles(config, roles) {
  const moveIds = new Set(getNormalizedMoveNames(config));
  SINGLE_MOVE_ROLE_RULES.forEach(([moveId, roleId]) => {
    if (moveIds.has(moveId)) roles.push(roleId);
  });
}

function addModeSetterRoles(config, roles) {
  WEATHER_SETTER_RULES.forEach(([roleId, abilityId, moveId]) => {
    if (getNormalizedAbility(config) === abilityId || hasMove(config, moveId)) roles.push(roleId);
  });
  TERRAIN_SETTER_RULES.forEach(([roleId, abilityId, moveId]) => {
    if (getNormalizedAbility(config) === abilityId || hasMove(config, moveId)) roles.push(roleId);
  });
}

function addDeterministicSupportRoles(config, roles) {
  addSingleMoveRoles(config, roles);
  addModeSetterRoles(config, roles);
  if (getNormalizedItem(config) === CHOICE_SCARF) roles.push("choicescarf");
  if (hasMove(config, "fakeout") || hasTrackedMove(config, TAILWIND_MOVES) || hasMove(config, "taunt")) roles.push("leadpressure");
  if (hasTrackedMove(config, OFFENSIVE_DEBUFF_MOVES)) roles.push("offensivedebuffer");
  if (hasTrackedMove(config, WILL_O_WISP_MOVES)) roles.push("willowisp");
  if (hasTrackedMove(config, PARALYSIS_CONTROL_MOVES)) roles.push("paralysisspreader");
  if (hasTrackedMove(config, CLERIC_MOVES)) roles.push("healingsupport");
  if (hasRecoveryOrLeftovers(config) && hasTrackedMove(config, PASSIVE_DAMAGE_MOVES)) roles.push("attritioncore");
  if (isWeatherSetter(config) && isWeatherAbuser(config)) roles.push("weathercore");
  if (hasTrackedAbility(config, WEATHER_SPEED_ABILITIES)) roles.push("weathersweeper");
  if (isTerrainSetter(config) && isTerrainAbuser(config)) roles.push("terraincore");
  if (hasTrackedMove(config, REDIRECTION_MOVES) || hasTrackedMove(config, GUARD_MOVES) || hasMove(config, "allyswitch") || hasTrackedMove(config, HELPING_HAND_MOVES) || hasMove(config, "fakeout")) {
    roles.push("protectivesupport");
  }
}

function addDeterministicCounterRoles(config, roles) {
  if (hasMove(config, TRICK_ROOM_MOVE) || hasMove(config, "taunt") || hasMove(config, "imprison") || hasTrackedMove(config, PHASING_MOVES)) roles.push("antitrickroom");
  if (hasMove(config, TRICK_ROOM_MOVE) || hasTrackedMove(config, SPEED_DEBUFF_MOVES) || hasTrackedMove(config, PRIORITY_MOVES)) roles.push("antitailwind");
  if (hasSpreadAttack(config) || hasPowderImmunity(config)) roles.push("antiredirection");
  if (hasTrackedAbility(config, ANTI_INTIMIDATE_ABILITIES) || hasTrackedItem(config, ANTI_INTIMIDATE_ITEMS)) roles.push("antiintimidate");
  if (hasTrackedMove(config, WEATHER_MOVES) || hasTrackedAbility(config, WEATHER_ABILITIES)) roles.push("antiweather");
  if (hasTrackedMove(config, TERRAIN_MOVES) || hasTrackedAbility(config, TERRAIN_ABILITIES)) roles.push("antiterrain");
  if (hasPowderImmunity(config) || hasTeraType(config, GRASS_TYPE)) roles.push("antipowder");
  if (hasTrackedAbility(config, SLEEP_IMMUNE_ABILITIES) || roles.includes("electricterrainsetter") || roles.includes("mistyterrainsetter")) roles.push("antisleep");
  if (hasTrackedAbility(config, ANTI_PRIORITY_ABILITIES) || roles.includes("psychicterrainsetter")) roles.push("antipriority");
  if (hasType(config, GHOST_TYPE) || hasTeraType(config, GHOST_TYPE) || hasTrackedAbility(config, ANTI_FAKE_OUT_ABILITIES) || hasTrackedItem(config, ANTI_FAKE_OUT_ITEMS)) roles.push("fakeoutproof");
  if (hasTrackedMove(config, WIDE_GUARD_MOVES)) roles.push("antispread");
  if (hasTrackedMove(config, QUICK_GUARD_MOVES)) roles.push("antipriority");
}

function addProxyAttackRoles(config, roles, proxy) {
  const atkRank = Number(proxy.estimatedAtkRank || 0);
  const spaRank = Number(proxy.estimatedSpaRank || 0);
  const maxOffenseRank = getMaxOffenseRank(proxy);
  if (atkRank >= ATTACKER_RANK && spaRank < atkRank) roles.push("physical");
  if (spaRank >= ATTACKER_RANK && atkRank < spaRank) roles.push("special");
  if (atkRank >= MIXED_ATTACKER_RANK && spaRank >= MIXED_ATTACKER_RANK) roles.push("mixed");
  if (Number(proxy.estimatedSpeedRank || 0) >= FAST_ATTACKER_SPEED_RANK && maxOffenseRank >= ATTACKER_RANK) roles.push("fastattacker");
  if (Number(proxy.estimatedSpeedRank || 0) >= SPEED_PRESSURE_RANK && maxOffenseRank >= MIXED_ATTACKER_RANK) roles.push("speedpressure");
  if (Number(proxy.estimatedSpeedRank || 0) >= SPEED_PRESSURE_RANK && maxOffenseRank >= MIXED_ATTACKER_RANK) roles.push("leadpressure");
  if (maxOffenseRank >= PRIMARY_ATTACKER_RANK) roles.push("primaryattacker");
  if (maxOffenseRank >= SECONDARY_ATTACKER_RANK && maxOffenseRank < PRIMARY_ATTACKER_RANK) roles.push("secondaryattacker");
  if (hasTrackedMove(config, PRIORITY_MOVES) && atkRank >= MIXED_ATTACKER_RANK) roles.push("priorityattacker");
  if (spaRank >= SPECIAL_ANTI_INTIMIDATE_RANK && atkRank < LOW_PHYSICAL_ATTACK_RANK) roles.push("antiintimidate");
}

function addProxyBulkRoles(config, roles, proxy) {
  const physBulkRank = Number(proxy.estimatedPhysBulkRank || 0);
  const spBulkRank = Number(proxy.estimatedSpBulkRank || 0);
  const maxOffenseRank = getMaxOffenseRank(proxy);
  const maxBulkRank = getMaxBulkRank(proxy);
  // Top-level rule: high single-side bulk only counts as a "wall" when output
  // is not heavy. If output is heavy, the appropriate label is bulkyattacker
  // (kept below); we suppress the passive-wall labels in that case.
  const isHeavyOffense = maxOffenseRank >= HEAVY_OFFENSE_RANK;
  if (Number(proxy.estimatedSpeedRank || 0) <= 1 - WALL_RANK && maxOffenseRank >= MIXED_ATTACKER_RANK) roles.push("slowattacker");
  if (Number(proxy.estimatedSpeedRank || 0) <= TRICK_ROOM_SWEEPER_SPEED_RANK && maxOffenseRank >= SECONDARY_ATTACKER_RANK) roles.push("trickroomsweeper");
  if (physBulkRank >= WALL_RANK && !isHeavyOffense) roles.push("physicalwall");
  if (spBulkRank >= WALL_RANK && !isHeavyOffense) roles.push("specialwall");
  if (physBulkRank >= MIXED_WALL_RANK && spBulkRank >= MIXED_WALL_RANK) roles.push("mixedwall");
  if (maxBulkRank >= WALL_RANK && hasWallMaintenanceTool(config) && !isHeavyOffense) roles.push("wall");
  if ((physBulkRank >= DAMAGE_SPONGE_RANK || spBulkRank >= DAMAGE_SPONGE_RANK) && !isHeavyOffense) roles.push("damagesponge");
  if (maxBulkRank >= BULKY_RANK && maxOffenseRank >= MIXED_ATTACKER_RANK) roles.push("bulkyattacker");
  if (maxBulkRank >= BULKY_RANK && supportMoveCount(config) >= SUPPORT_MOVE_TARGET) roles.push("bulkysupport");
  if (maxBulkRank >= BULKY_RANK && (hasTrackedMove(config, PIVOT_MOVES) || hasRecoveryOrLeftovers(config) || hasTrackedAbility(config, INTIMIDATE_ABILITIES))) roles.push("midgamestabilizer");
  if (hasTrackedMove(config, RECOVERY_MOVES) && maxBulkRank >= RECOVERY_WALL_RANK && !isHeavyOffense) roles.push("recoverywall");
  if (getNormalizedItem(config) === ASSAULT_VEST && spBulkRank >= MIXED_WALL_RANK && maxOffenseRank >= BULKY_RANK) roles.push("assaultvesttank");
}

function addProxyRoles(config, roles, roleContext) {
  const proxy = getEstimatedRoleMetrics(config, roleContext);
  if (!proxy.available) return;
  addProxyAttackRoles(config, roles, proxy);
  addProxyBulkRoles(config, roles, proxy);
}

export function getAdditionalUtilityRoles(config = {}, options = {}) {
  const roles = [];
  addDeterministicSupportRoles(config, roles);
  addDeterministicCounterRoles(config, roles);
  getConfigOnlyUtilityRoles(config).forEach((roleId) => roles.push(roleId));
  addProxyRoles(config, roles, options.roleContext);
  return uniqueRoleIds(roles);
}

export function getRoleProxyStatus(roleContext) {
  const proxy = getEstimatedRoleMetrics({}, roleContext);
  return {
    available: proxy.available,
    reasonKey: proxy.unavailableReasonKey || "",
  };
}
