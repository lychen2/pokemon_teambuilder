import {TYPE_ORDER} from "./constants.js";
import {getEffectiveSpeed, getResistanceProfileForConfig} from "./battle-semantics.js";
import {getRoleSummaryIds, getStructureRoles, getUtilityRoles} from "./team-roles.js";
import {countMegaConfigs, formatConfigName, getTypeLabel, uniqueStrings} from "./utils.js";

const MAX_LIBRARY_CANDIDATES = 6;
const FOCUS_PATCH_WEIGHT = 4;
const TEAM_PATCH_WEIGHT = 2.5;
const IMMUNITY_PATCH_WEIGHT = 1.2;
const ROLE_PATCH_WEIGHT = 1.8;
const SPEED_FIT_WEIGHT = 1.2;
const SHARED_RISK_WEIGHT = 2.1;
const DUPLICATE_TYPE_WEIGHT = 1.3;
const EXTRA_MEGA_WEIGHT = 4;

function getResistanceProfile(config, fieldState) {
  return getResistanceProfileForConfig(config, {fieldState, side: "ally"});
}

function getWeaknessTypes(config, fieldState) {
  const profile = getResistanceProfile(config, fieldState);
  return TYPE_ORDER.filter((type) => Number(profile[type] || 1) > 1);
}

function getCoveredTypes(config, types, fieldState, matcher) {
  const profile = getResistanceProfile(config, fieldState);
  return types.filter((type) => matcher(Number(profile[type] || 1)));
}

function getRolePatchIds(config, missingRoles, roleContext) {
  const roleOptions = {roleContext};
  const candidateRoles = uniqueStrings([
    ...getRoleSummaryIds(config, 8, roleOptions),
    ...getUtilityRoles(config, roleOptions),
    ...getStructureRoles(config, roleOptions),
  ]);
  return candidateRoles.filter((roleId) => missingRoles.includes(roleId));
}

function getSpeedFitScore(config, speedContext, fieldState) {
  const speed = getEffectiveSpeed(config, "ally", fieldState);
  if (speedContext.mode === "trickroom") {
    return speed <= Number(speedContext.trickRoomCutoff || 0) ? 1.4 : -0.8;
  }
  if (speedContext.mode === "hybrid") {
    if (speed <= Number(speedContext.trickRoomCutoff || 0)) return 0.8;
    return speed >= Number(speedContext.medianSpeed || 0) ? 0.8 : 0.2;
  }
  return speed >= Number(speedContext.medianSpeed || 0) ? 1 : 0.2;
}

function countDuplicateTypes(team, candidate) {
  const seen = new Set(team.flatMap((config) => config.types || []));
  return (candidate.types || []).filter((type) => seen.has(type)).length;
}

function buildRiskLabels(candidate, focusWeaknessTypes, teamWeaknessTypes, fieldState, language) {
  const candidateWeaknesses = getWeaknessTypes(candidate, fieldState);
  return uniqueStrings([
    ...candidateWeaknesses.filter((type) => focusWeaknessTypes.includes(type)),
    ...candidateWeaknesses.filter((type) => teamWeaknessTypes.includes(type)),
  ]).map((type) => getTypeLabel(type, language));
}

function buildCandidateScore(entry) {
  return (
    entry.focusCoveredLabels.length * FOCUS_PATCH_WEIGHT
    + entry.teamCoveredLabels.length * TEAM_PATCH_WEIGHT
    + entry.immunityLabels.length * IMMUNITY_PATCH_WEIGHT
    + entry.roleIds.length * ROLE_PATCH_WEIGHT
    + entry.speedFit * SPEED_FIT_WEIGHT
    - entry.riskLabels.length * SHARED_RISK_WEIGHT
    - entry.duplicateTypes * DUPLICATE_TYPE_WEIGHT
    - (entry.extraMega ? EXTRA_MEGA_WEIGHT : 0)
  );
}

function buildCandidateEntry(candidate, context) {
  const focusCovered = getCoveredTypes(candidate, context.focusWeaknessTypes, context.fieldState, (value) => value < 1);
  const teamCovered = getCoveredTypes(candidate, context.teamWeaknessTypes, context.fieldState, (value) => value < 1);
  const immunityTypes = getCoveredTypes(candidate, context.focusWeaknessTypes, context.fieldState, (value) => value === 0);
  const roleIds = getRolePatchIds(candidate, context.missingRoles, context.roleContext);
  const riskLabels = buildRiskLabels(candidate, context.focusWeaknessTypes, context.teamWeaknessTypes, context.fieldState, context.language);
  const entry = {
    configId: candidate.id,
    speciesId: candidate.speciesId || "",
    speciesName: candidate.speciesName || candidate.displayName || "",
    label: formatConfigName(candidate.displayName || candidate.speciesName || "", candidate.note || ""),
    focusCoveredLabels: focusCovered.map((type) => getTypeLabel(type, context.language)),
    teamCoveredLabels: teamCovered.map((type) => getTypeLabel(type, context.language)),
    immunityLabels: immunityTypes.map((type) => getTypeLabel(type, context.language)),
    riskLabels,
    roleIds,
    duplicateTypes: countDuplicateTypes(context.team, candidate),
    extraMega: context.teamMegaCount > 0 && countMegaConfigs([candidate]) > 0,
    speedFit: getSpeedFitScore(candidate, context.speedContext, context.fieldState),
  };
  return {...entry, score: buildCandidateScore(entry)};
}

function isUsefulCandidate(entry) {
  return (
    entry.focusCoveredLabels.length
    || entry.teamCoveredLabels.length
    || entry.roleIds.length
  ) && entry.score > 0;
}

function sortCandidates(left, right) {
  return right.score - left.score
    || left.riskLabels.length - right.riskLabels.length
    || left.duplicateTypes - right.duplicateTypes
    || left.label.localeCompare(right.label, "zh-Hans-CN");
}

export function buildLibraryCoreCandidates(options = {}) {
  const {
    focusMember,
    team = [],
    library = [],
    missingRoles = [],
    weaknesses = [],
    speedContext = {},
    fieldState = {},
    language = "zh",
    roleContext,
  } = options;
  if (!focusMember || !library.length) return [];
  const context = {
    team,
    missingRoles,
    teamMegaCount: countMegaConfigs(team),
    teamWeaknessTypes: weaknesses.map((entry) => entry.type),
    focusWeaknessTypes: getWeaknessTypes(focusMember, fieldState),
    speedContext,
    fieldState,
    language,
    roleContext,
  };
  const teamIds = new Set(team.map((config) => config.id));
  const teamSpeciesIds = new Set(team.map((config) => config.speciesId));
  return library
    .filter((config) => !teamIds.has(config.id) && !teamSpeciesIds.has(config.speciesId))
    .map((config) => buildCandidateEntry(config, context))
    .filter(isUsefulCandidate)
    .sort(sortCandidates)
    .slice(0, MAX_LIBRARY_CANDIDATES);
}
