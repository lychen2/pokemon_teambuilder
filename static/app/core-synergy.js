import {getAttackBias, getStructureRoles, getUtilityRoles, hasMove} from "./team-roles.js";
import {normalizeName} from "./utils.js";

const WEATHER_PAYOFF_ABILITIES = new Set([
  "chlorophyll",
  "swiftswim",
  "sandrush",
  "slushrush",
  "protosynthesis",
  "solarpower",
]);
const WEATHER_PAYOFF_MOVES = new Set([
  "weatherball",
  "solarbeam",
  "solarblade",
  "thunder",
  "hurricane",
  "hydrosteam",
]);
const TERRAIN_PAYOFF_MOVES = new Set([
  "grassyglide",
  "expandingforce",
  "risingvoltage",
  "terrainpulse",
]);
const SPEED_CONTROL_ROLES = new Set([
  "speedboostself",
  "speeddebuff",
  "paralysiscontrol",
  "tailwind",
  "trickroom",
]);
const CARRY_ROLES = new Set(["sweeper", "frailsweeper"]);
const SETUP_MOVE_IDS = new Set([
  "swordsdance",
  "nastyplot",
  "quiverdance",
  "dragondance",
  "calmmind",
  "bulkup",
  "bellydrum",
  "coil",
]);
const SLOW_SPEED_THRESHOLD = 110;

function hasAnyRole(config, roleSet) {
  return getUtilityRoles(config).some((roleId) => roleSet.has(roleId))
    || getStructureRoles(config).some((roleId) => roleSet.has(roleId));
}

function hasAnyMove(config, moveIds) {
  return (config.moveNames || []).some((moveName) => moveIds.has(normalizeName(moveName)));
}

function hasWeatherPayoff(config) {
  return WEATHER_PAYOFF_ABILITIES.has(normalizeName(config.ability))
    || hasAnyMove(config, WEATHER_PAYOFF_MOVES);
}

function hasTerrainPayoff(config) {
  return hasAnyMove(config, TERRAIN_PAYOFF_MOVES);
}

function isSetupCarry(config) {
  return hasAnyMove(config, SETUP_MOVE_IDS) || hasAnyRole(config, CARRY_ROLES);
}

function isSlowBreaker(config) {
  return Number(config.stats?.spe || 0) <= SLOW_SPEED_THRESHOLD && hasAnyRole(config, CARRY_ROLES);
}

function pushRule(results, id, bonus) {
  if (!results.some((entry) => entry.id === id)) {
    results.push({id, bonus});
  }
}

function evaluateDirectionalPair(left, right, results) {
  const leftUtility = new Set(getUtilityRoles(left));
  const rightUtility = new Set(getUtilityRoles(right));
  if (leftUtility.has("fakeout") && rightUtility.has("trickroom")) {
    pushRule(results, "fakeoutTrickRoom", 2.8);
  }
  if (leftUtility.has("redirection") && rightUtility.has("trickroom")) {
    pushRule(results, "redirectionTrickRoom", 2.4);
  }
  if (leftUtility.has("redirection") && isSetupCarry(right)) {
    pushRule(results, "redirectionSetup", 2.3);
  }
  if (leftUtility.has("weather") && hasWeatherPayoff(right)) {
    pushRule(results, "weatherMode", 2.2);
  }
  if (leftUtility.has("terrain") && hasTerrainPayoff(right)) {
    pushRule(results, "terrainMode", 1.8);
  }
  if (hasAnyRole(left, SPEED_CONTROL_ROLES) && hasAnyRole(right, CARRY_ROLES)) {
    pushRule(results, "speedBreaker", 1.8);
  }
  if (leftUtility.has("intimidate") && hasAnyRole(right, CARRY_ROLES) && getAttackBias(right) !== "support") {
    pushRule(results, "intimidateCarry", 1.4);
  }
}

function buildSummary(results) {
  return {
    bonus: results.reduce((sum, entry) => sum + Number(entry.bonus || 0), 0),
    reasonIds: results.map((entry) => entry.id),
  };
}

export function evaluatePairSynergy(pair = []) {
  if (pair.length < 2) {
    return {bonus: 0, reasonIds: []};
  }
  const results = [];
  evaluateDirectionalPair(pair[0], pair[1], results);
  evaluateDirectionalPair(pair[1], pair[0], results);
  return buildSummary(results);
}

export function evaluateTrioSynergy(trio = []) {
  if (trio.length < 3) {
    return {bonus: 0, reasonIds: []};
  }
  const utilityRoles = trio.flatMap((config) => getUtilityRoles(config));
  const hasFakeOut = utilityRoles.includes("fakeout");
  const hasTrickRoom = utilityRoles.includes("trickroom");
  const hasRedirection = utilityRoles.includes("redirection");
  const hasWeather = utilityRoles.includes("weather");
  const hasSpeedControl = utilityRoles.some((roleId) => SPEED_CONTROL_ROLES.has(roleId));
  const hasSetup = trio.some((config) => hasAnyMove(config, SETUP_MOVE_IDS));
  const hasWeatherAbuser = trio.some((config) => hasWeatherPayoff(config));
  const hasSlowCarry = trio.some((config) => isSlowBreaker(config));
  const results = [];
  if (hasFakeOut && hasTrickRoom && (hasRedirection || hasSlowCarry)) {
    pushRule(results, "trickRoomShell", 3.2);
  }
  if (hasWeather && hasWeatherAbuser && (hasSpeedControl || hasRedirection)) {
    pushRule(results, "weatherShell", 2.8);
  }
  if (hasRedirection && hasSetup && (hasSpeedControl || hasFakeOut)) {
    pushRule(results, "setupShell", 2.6);
  }
  return buildSummary(results);
}
