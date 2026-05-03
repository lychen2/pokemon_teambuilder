export const HIDDEN_ROLE_IDS = new Set([
  "externalspeed",
  "coverdependent",
  "timingdependent",
  "stabattacker",
  "coverageattacker",
  "singlebreaker",
]);

const ROLE_IMPLICATIONS = Object.freeze([
  ["pivot", ["fakeoutpivot", "intimidatepivot", "regeneratorpivot", "partingshot", "uturnpivot", "voltswitchpivot", "flipturnpivot"]],
  ["fakeout", ["fakeoutpivot"]],
  ["intimidate", ["intimidatepivot"]],
  ["redirection", ["followme", "ragepowder"]],
  ["antiredirection", ["followme", "ragepowder"]],
  ["powderimmune", ["antipowder"]],
  ["cleric", ["healingsupport"]],
  ["speedboostself", ["tailwind"]],
  ["priority", ["fakeout", "priorityattacker"]],
  ["focussash", ["consistentaction"]],
  ["support", ["fakeout", "redirection", "followme", "ragepowder", "helpinghand", "cleric", "healingsupport", "screens", "protectivesupport", "guard", "wideguard", "quickguard"]],
  ["protectivesupport", ["fakeout", "redirection", "followme", "ragepowder", "wideguard", "quickguard"]],
  ["disruption", ["taunt", "encore", "disable", "imprison", "sleep", "willowisp", "intimidate", "paralysisspreader", "haze", "clearsmog"]],
  ["statusspreader", ["sleep", "willowisp", "paralysisspreader"]],
  ["debuffer", ["snarl", "eerieimpulse", "faketears", "screech", "metalsound", "acidspray", "intimidate", "willowisp", "nobleroar", "tickle", "offensivedebuffer"]],
  ["lead", ["leadpressure"]],
  ["tempocontrol", ["fakeout", "partingshot", "willowisp", "sleep", "taunt", "encore", "disable"]],
  ["attacker", ["nuke", "cleaner", "wallbreaker", "fastattacker", "primaryattacker", "secondaryattacker", "trickroomsweeper", "metacounter"]],
  ["hazardsetter", ["stealthrocksetter", "spikessetter", "toxicspikessetter", "stickywebsetter"]],
  ["hazardremoval", ["rapidspin", "defog", "courtchange", "mortalspin", "tidyup"]],
  ["weathersetter", ["rainsetter", "sunsetter", "sandsetter", "snowsetter"]],
  ["weather", ["rainsetter", "sunsetter", "sandsetter", "snowsetter", "weathercore"]],
  ["terrainsetter", ["electricterrainsetter", "psychicterrainsetter", "grassyterrainsetter", "mistyterrainsetter"]],
  ["terrain", ["electricterrainsetter", "psychicterrainsetter", "grassyterrainsetter", "mistyterrainsetter", "terraincore"]],
  ["wall", ["mixedwall", "recoverywall"]],
  ["physicalwall", ["mixedwall"]],
  ["specialwall", ["mixedwall"]],
  ["damagesponge", ["mixedwall", "recoverywall"]],
  ["modeenabler", ["weathersetter", "terrainsetter", "tailwind", "trickroom", "rainsetter", "sunsetter", "sandsetter", "snowsetter", "electricterrainsetter", "psychicterrainsetter", "grassyterrainsetter", "mistyterrainsetter"]],
]);

const MOVE_QUALITY_COMPACT_MIN_MAPPED = 4;
const MOVE_QUALITY_SPLIT_SECONDARY_MIN = 4;
const MOVE_QUALITY_SPLIT_MAPPED_MAX = 2;
const MOVE_QUALITY_OPTIMIZABLE_UNMAPPED_MIN = 2;

function uniqueRoleIds(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function dedupeRoleIds(roleIds = []) {
  const original = new Set(roleIds);
  const result = new Set(roleIds);
  ROLE_IMPLICATIONS.forEach(([generic, specifics]) => {
    if (specifics.some((roleId) => original.has(roleId))) {
      result.delete(generic);
    }
  });
  return [...result];
}

export function getVisibleRoleIds(roleIds = []) {
  return dedupeRoleIds(uniqueRoleIds(roleIds).filter((roleId) => !HIDDEN_ROLE_IDS.has(roleId)));
}

function getMappedMoveCount(moveRoles = []) {
  return moveRoles.filter((entry) => getVisibleRoleIds(entry.roleIds).length).length;
}

function getUnmappedMoveCount(moveRoles = []) {
  return moveRoles.length - getMappedMoveCount(moveRoles);
}

export function getMoveSlotSummary(moveRoles = [], secondary = []) {
  const mappedMoveCount = getMappedMoveCount(moveRoles);
  const unmappedMoveCount = getUnmappedMoveCount(moveRoles);
  const visibleSecondary = getVisibleRoleIds(secondary);
  const conflictCount = Math.max(0, visibleSecondary.length - mappedMoveCount);
  const compact = mappedMoveCount >= MOVE_QUALITY_COMPACT_MIN_MAPPED && conflictCount <= 1;
  const split = visibleSecondary.length >= MOVE_QUALITY_SPLIT_SECONDARY_MIN
    && mappedMoveCount <= MOVE_QUALITY_SPLIT_MAPPED_MAX;
  const optimizable = unmappedMoveCount >= MOVE_QUALITY_OPTIMIZABLE_UNMAPPED_MIN;
  if (split) return {quality: "split", conflictCount, mappedMoveCount, unmappedMoveCount};
  if (optimizable) return {quality: "optimizable", conflictCount, mappedMoveCount, unmappedMoveCount};
  if (compact) return {quality: "compact", conflictCount, mappedMoveCount, unmappedMoveCount};
  return {quality: "medium", conflictCount, mappedMoveCount, unmappedMoveCount};
}

export function getRoleReasons(primary, secondary = []) {
  const visibleSecondary = getVisibleRoleIds(secondary);
  return {
    primary: [`analysis.roleReason.${primary}`],
    secondary: Object.fromEntries(
      visibleSecondary.map((roleId) => [roleId, [`analysis.roleReason.${roleId}`]]),
    ),
  };
}

export function getItemRoleSummary(itemInfluences = []) {
  return itemInfluences
    .map((entry) => ({
      item: entry.item,
      roleIds: getVisibleRoleIds(entry.roleIds),
    }))
    .filter((entry) => entry.item && entry.roleIds.length);
}

export function getOneLineSummaryParams(primary, secondary = [], compressionTier = "low") {
  return {
    primary,
    secondary: getVisibleRoleIds(secondary).slice(0, 3),
    compressionTier,
  };
}
