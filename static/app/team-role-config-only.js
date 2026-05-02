import {
  PIVOT_MOVES,
  TERRAIN_MOVES,
  WEATHER_MOVES,
} from "./team-role-rules.js";
import {
  getNormalizedAbility,
  getNormalizedItem,
  hasMove,
  hasTrackedMove,
} from "./team-role-metrics.js";

const ASSAULT_VEST = "assaultvest";
const CLEAR_AMULET = "clearamulet";
const COVERT_CLOAK = "covertcloak";
const FOCUS_SASH = "focussash";
const LEFTOVERS = "leftovers";
const SAFETY_GOGGLES = "safetygoggles";

const ITEM_ROLE_RULES = Object.freeze({
  [ASSAULT_VEST]: ["assaultvest"],
  [CLEAR_AMULET]: ["clearamulet"],
  [COVERT_CLOAK]: ["covertcloak"],
  [FOCUS_SASH]: ["focussash"],
  [LEFTOVERS]: ["leftoverssustain"],
  [SAFETY_GOGGLES]: ["safetygoggles"],
});

const WEATHER_ABILITY_ROLES = Object.freeze({
  drizzle: ["rainsetter"],
  primordialsea: ["rainsetter"],
  drought: ["sunsetter"],
  desolateland: ["sunsetter"],
  orichalcumpulse: ["sunsetter"],
  megasol: ["sunsetter"],
  sandstream: ["sandsetter"],
  snowwarning: ["snowsetter"],
});

const TERRAIN_ABILITY_ROLES = Object.freeze({
  electricsurge: ["electricterrainsetter", "terrainstatusguard"],
  hadronengine: ["electricterrainsetter", "terrainstatusguard"],
  psychicsurge: ["psychicterrainsetter", "terrainpriorityguard"],
  grassysurge: ["grassyterrainsetter"],
  seedsower: ["grassyterrainsetter"],
  mistysurge: ["mistyterrainsetter", "terrainstatusguard"],
});

const TERRAIN_MOVE_ROLES = Object.freeze({
  electricterrain: ["terrainstatusguard"],
  psychicterrain: ["terrainpriorityguard"],
  mistyterrain: ["terrainstatusguard"],
});

function pushRoles(roles, roleIds = []) {
  roleIds.forEach((roleId) => {
    if (roleId && !roles.includes(roleId)) roles.push(roleId);
  });
}

function addItemRoles(config, roles) {
  pushRoles(roles, ITEM_ROLE_RULES[getNormalizedItem(config)] || []);
}

function addWeatherAbilityRoles(config, roles) {
  pushRoles(roles, WEATHER_ABILITY_ROLES[getNormalizedAbility(config)] || []);
}

function addTerrainAbilityRoles(config, roles) {
  pushRoles(roles, TERRAIN_ABILITY_ROLES[getNormalizedAbility(config)] || []);
}

function addTerrainMoveRoles(config, roles) {
  Object.entries(TERRAIN_MOVE_ROLES).forEach(([moveId, roleIds]) => {
    if (hasMove(config, moveId)) pushRoles(roles, roleIds);
  });
}

function addRegeneratorPivotRole(config, roles) {
  if (getNormalizedAbility(config) === "regenerator" && hasTrackedMove(config, PIVOT_MOVES)) {
    pushRoles(roles, ["regeneratorpivot"]);
  }
}

function addCoreRoles(config, roles) {
  if (hasTrackedMove(config, WEATHER_MOVES)) pushRoles(roles, ["weathersetter"]);
  if (hasTrackedMove(config, TERRAIN_MOVES)) pushRoles(roles, ["terrainsetter"]);
}

export function getConfigOnlyUtilityRoles(config = {}) {
  const roles = [];
  addItemRoles(config, roles);
  addWeatherAbilityRoles(config, roles);
  addTerrainAbilityRoles(config, roles);
  addTerrainMoveRoles(config, roles);
  addRegeneratorPivotRole(config, roles);
  addCoreRoles(config, roles);
  return roles;
}
