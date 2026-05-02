import {
  ANTI_SETUP_MOVES,
  CLERIC_MOVES,
  DISRUPTION_MOVES,
  GUARD_MOVES,
  HELPING_HAND_MOVES,
  INTIMIDATE_ABILITIES,
  OFFENSIVE_DEBUFF_MOVES,
  PARALYSIS_CONTROL_MOVES,
  PHASING_MOVES,
  PIVOT_MOVES,
  PRIORITY_MOVES,
  RECOVERY_MOVES,
  REDIRECTION_MOVES,
  SCREEN_MOVES,
  SETUP_MOVES,
  SLEEP_MOVES,
  SPEED_DEBUFF_MOVES,
  STATUS_SPREAD_MOVES,
  STAT_DROP_MOVES,
  TAILWIND_MOVES,
  TERRAIN_ABILITIES,
  TERRAIN_ABUSER_MOVES,
  TERRAIN_MOVES,
  TRICK_ROOM_MOVE,
  WEATHER_ABILITIES,
  WEATHER_ABUSER_MOVES,
  WEATHER_MOVES,
  WILL_O_WISP_MOVES,
} from "./team-role-rules.js";
import {
  hasMove,
  hasTrackedAbility,
  hasTrackedItem,
  hasTrackedMove,
} from "./team-role-metrics.js";

const FOCUS_SASH_ITEMS = new Set(["focussash"]);
const HAZARD_MOVES = new Set(["stealthrock", "spikes", "toxicspikes", "stickyweb"]);
const HAZARD_REMOVAL_MOVES = new Set(["rapidspin", "defog", "courtchange", "mortalspin", "tidyup"]);
const TRAPPING_MOVES = new Set(["meanlook", "block", "spiderweb", "infestation", "firespin", "whirlpool", "sandtomb", "magmastorm"]);
const TRAPPING_ABILITIES = new Set(["arenatrap", "shadowtag", "magnetpull"]);
const CONSISTENCY_ABILITIES = new Set(["innerfocus"]);
const CONSISTENCY_ITEMS = new Set(["focussash", "covertcloak"]);

const SINGLE_MOVE_ROLE_RULES = Object.freeze([
  ["stealthrock", ["hazardsetter", "stealthrocksetter"]],
  ["spikes", ["hazardsetter", "spikessetter"]],
  ["toxicspikes", ["hazardsetter", "toxicspikessetter"]],
  ["stickyweb", ["hazardsetter", "stickywebsetter", "speeddebuff"]],
  ["rapidspin", ["hazardremoval", "rapidspin"]],
  ["defog", ["hazardremoval", "defog"]],
  ["courtchange", ["hazardremoval", "courtchange"]],
  ["mortalspin", ["hazardremoval", "mortalspin", "statusspreader"]],
  ["tidyup", ["hazardremoval", "tidyup", "setup"]],
  ["flipturn", ["pivot", "flipturnpivot"]],
]);

const STATUS_MOVE_ROLE_RULES = Object.freeze([
  [TAILWIND_MOVES, ["tailwind", "speedcontrol"]],
  [SPEED_DEBUFF_MOVES, ["softspeedcontrol", "speeddebuff", "speedcontrol", "debuffer"]],
  [PARALYSIS_CONTROL_MOVES, ["softspeedcontrol", "paralysiscontrol", "speedcontrol", "statusspreader"]],
  [PIVOT_MOVES, ["pivot", "tempocontrol"]],
  [REDIRECTION_MOVES, ["redirection", "support"]],
  [GUARD_MOVES, ["guard", "support"]],
  [HELPING_HAND_MOVES, ["helpinghand", "support"]],
  [DISRUPTION_MOVES, ["disruption", "tempocontrol"]],
  [STAT_DROP_MOVES, ["debuffer"]],
  [OFFENSIVE_DEBUFF_MOVES, ["offensivedebuffer", "debuffer"]],
  [SETUP_MOVES, ["setup", "setupsweeper"]],
  [RECOVERY_MOVES, ["recovery", "tank"]],
  [CLERIC_MOVES, ["cleric", "support"]],
  [ANTI_SETUP_MOVES, ["antisetup", "techcheck"]],
  [PHASING_MOVES, ["phazer", "antisetup", "techcheck"]],
  [SCREEN_MOVES, ["screens", "support"]],
  [WEATHER_MOVES, ["weather", "weathersetter", "modeenabler"]],
  [WEATHER_ABUSER_MOVES, ["weather", "weatherabuser"]],
  [TERRAIN_MOVES, ["terrain", "terrainsetter", "modeenabler"]],
  [TERRAIN_ABUSER_MOVES, ["terrain", "terrainabuser"]],
  [PRIORITY_MOVES, ["priority", "cleaner"]],
  [SLEEP_MOVES, ["sleep", "disruption", "statusspreader"]],
  [WILL_O_WISP_MOVES, ["willowisp", "statusspreader", "debuffer"]],
  [STATUS_SPREAD_MOVES, ["statusspreader", "disruption"]],
  [HAZARD_MOVES, ["hazardsetter"]],
  [HAZARD_REMOVAL_MOVES, ["hazardremoval"]],
  [TRAPPING_MOVES, ["trapper"]],
]);

function pushRole(roles, roleId) {
  if (roleId && !roles.includes(roleId)) roles.push(roleId);
}

function pushRoles(roles, roleIds = []) {
  roleIds.forEach((roleId) => pushRole(roles, roleId));
}

function hasAnyStatusSpreader(config) {
  return hasTrackedMove(config, STATUS_SPREAD_MOVES)
    || hasTrackedMove(config, SLEEP_MOVES)
    || hasTrackedMove(config, PARALYSIS_CONTROL_MOVES)
    || hasTrackedMove(config, WILL_O_WISP_MOVES);
}

function hasTempoTool(config) {
  return hasMove(config, "fakeout")
    || hasMove(config, TRICK_ROOM_MOVE)
    || hasTrackedMove(config, TAILWIND_MOVES)
    || hasTrackedMove(config, SPEED_DEBUFF_MOVES)
    || hasTrackedMove(config, PARALYSIS_CONTROL_MOVES)
    || hasTrackedMove(config, DISRUPTION_MOVES)
    || hasTrackedMove(config, PIVOT_MOVES);
}

function hasModeEnabler(config) {
  return hasMove(config, TRICK_ROOM_MOVE)
    || hasTrackedMove(config, TAILWIND_MOVES)
    || hasTrackedMove(config, WEATHER_MOVES)
    || hasTrackedAbility(config, WEATHER_ABILITIES)
    || hasTrackedMove(config, TERRAIN_MOVES)
    || hasTrackedAbility(config, TERRAIN_ABILITIES);
}

function addSingleMoveUtilityRoles(config, roles) {
  SINGLE_MOVE_ROLE_RULES.forEach(([moveId, roleIds]) => {
    if (hasMove(config, moveId)) pushRoles(roles, roleIds);
  });
  if (hasTrackedMove(config, HAZARD_MOVES)) pushRole(roles, "hazardsetter");
  if (hasTrackedMove(config, HAZARD_REMOVAL_MOVES)) pushRole(roles, "hazardremoval");
}

function addCompositeUtilityRoles(config, roles) {
  if (hasAnyStatusSpreader(config)) pushRole(roles, "statusspreader");
  if (hasTempoTool(config)) pushRole(roles, "tempocontrol");
  if (hasModeEnabler(config)) pushRole(roles, "modeenabler");
  if (hasMove(config, "fakeout") || hasTrackedMove(config, TAILWIND_MOVES) || hasMove(config, "taunt") || hasTrackedItem(config, FOCUS_SASH_ITEMS)) pushRole(roles, "lead");
  if (hasMove(config, "fakeout")) pushRole(roles, "disruption");
  if (hasTrackedAbility(config, INTIMIDATE_ABILITIES)) pushRoles(roles, ["debuffer"]);
  if (hasMove(config, "fakeout") && hasTrackedMove(config, PIVOT_MOVES)) pushRole(roles, "fakeoutpivot");
  if (hasTrackedAbility(config, INTIMIDATE_ABILITIES) && (hasTrackedMove(config, PIVOT_MOVES) || hasMove(config, "fakeout"))) pushRole(roles, "intimidatepivot");
  if (hasTrackedAbility(config, WEATHER_ABILITIES)) pushRole(roles, "weatherresetpivot");
  if (hasTrackedAbility(config, TERRAIN_ABILITIES)) pushRole(roles, "terrainresetpivot");
  if (hasTrackedMove(config, TRAPPING_MOVES) || hasTrackedAbility(config, TRAPPING_ABILITIES)) pushRole(roles, "trapper");
  if (hasTrackedItem(config, CONSISTENCY_ITEMS) || hasTrackedAbility(config, CONSISTENCY_ABILITIES)) pushRole(roles, "consistentaction");
}

function getSingleMoveRoles(moveId) {
  const match = SINGLE_MOVE_ROLE_RULES.find(([candidate]) => candidate === moveId);
  return match?.[1] || [];
}

export function getDeterministicUtilityRoles(config = {}) {
  const roles = [];
  addSingleMoveUtilityRoles(config, roles);
  addCompositeUtilityRoles(config, roles);
  return roles;
}

export function getDeterministicMoveRoleIds(moveId = "") {
  const roles = STATUS_MOVE_ROLE_RULES.flatMap(([pool, roleIds]) => (pool.has(moveId) ? roleIds : []));
  pushRoles(roles, getSingleMoveRoles(moveId));
  if (TAILWIND_MOVES.has(moveId) || moveId === TRICK_ROOM_MOVE) pushRoles(roles, ["tempocontrol", "modeenabler"]);
  if (moveId === TRICK_ROOM_MOVE) pushRoles(roles, ["trickroom", "speedcontrol"]);
  return [...new Set(roles)];
}
