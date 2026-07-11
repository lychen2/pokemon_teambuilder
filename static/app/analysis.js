import {TYPE_ORDER} from "./constants.js";
import {
  getBestMoveEffectiveness,
  getBestMoveEffectivenessAgainstTypes,
  getCoverageProfileForConfig,
  getEffectiveSpeed,
  getFieldFlags,
  getResistanceProfileForConfig,
} from "./battle-semantics.js";
import {buildOffensiveGapCards} from "./coverage-potential.js";
import {evaluatePairSynergy, evaluateTrioSynergy} from "./core-synergy.js";
import {t} from "./i18n.js";
import {normalizeRecommendationPreferences} from "./recommendation-preferences.js";
import {buildLibraryCoreCandidates} from "./core-candidates.js";
import {
  ATTACK_BIAS_ORDER,
  RECOMMENDATION_ROLE_IDS,
  STRUCTURE_ROLE_ORDER,
  SUPPORT_ROLE_ORDER,
  TACTICAL_ROLE_ORDER,
  analyzePokemonRoles,
  createRoleContext,
  getAttackBias,
  getEstimatedRoleMetrics,
  getStructureRoles,
  getUtilityRoles,
  hasMove,
} from "./team-roles.js";
import {summarizeTeamIdentity} from "./team-identity.js";
import {clamp, getBattleEquivalentSpeciesId, getTypeLabel, isMegaConfig, uniqueStrings} from "./utils.js";

const TRICK_ROOM_MOVE = "trickroom";
const SPEED_MODE_STANDARD = "standard";
const SPEED_MODE_TRICK_ROOM = "trickroom";
const SPEED_MODE_HYBRID = "hybrid";
const TRICK_ROOM_SLOW_PERCENTILE = 0.25;
const TRICK_ROOM_CORE_RATIO = 0.5;
const TRICK_ROOM_FAST_MEMBER_RATIO = 0.34;
const SPEED_PREVIEW_LIMIT = 3;
const THREAT_PREVIEW_LIMIT = 3;
const SUPER_EFFECTIVE_THRESHOLD = 2;
const BLIND_SPOT_THRESHOLD = 0.5;
const SINGLE_TYPE_NEUTRAL_THRESHOLD = 1;
const WEAKNESS_AVERAGE_THRESHOLD = 1.15;
const MAX_SUGGESTED_COVERS = 3;
const CORE_PREVIEW_LIMIT = 4;
const CORE_RISK_LIMIT = 3;
const TRIO_PREVIEW_LIMIT = 3;
const BLIND_SPOT_PREVIEW_LIMIT = 8;
const DEFENSIVE_TYPE_PAIRS = buildDefensiveTypePairs();
const PARTNER_TYPE_COMBOS = buildPartnerTypeCombos();

const REFERENCE_MEGA_PICK_BONUS = 2.4;
const REFERENCE_TEAM_LIMIT = 64;
const REFERENCE_BASE_SAMPLE_LIMIT = 240;
const REFERENCE_TEAM_MIN_SAMPLES = 6;
const REFERENCE_CLUSTER_ITERATIONS = 8;
const REFERENCE_FEATURE_KEYS = Object.freeze([
  "sun",
  "rain",
  "sand",
  "snow",
  "trickRoom",
  "tailwind",
  "fast",
  "slow",
  "mega",
  "physical",
  "special",
  "support",
  "fakeout",
  "redirection",
  "guard",
  "disruption",
  "pivot",
  "spread",
]);
const REFERENCE_ARCHETYPE_WEIGHTS = Object.freeze({
  sun: 3.2,
  rain: 3.2,
  sand: 3,
  snow: 3,
  trickroom: 3.4,
  tailwind: 2.6,
  mega: 2.2,
  balance: 1,
});
const WEATHER_ROLE_IDS = Object.freeze(["sunsetter", "rainsetter", "sandsetter", "snowsetter", "weatherresetpivot"]);
const REFERENCE_WEATHER_IDS = Object.freeze(["sun", "rain", "sand", "snow"]);
const DEFENSIVE_ANSWER_LIMIT = 3;
const OFFENSIVE_ANSWER_LIMIT = 3;
const ROLE_ANSWER_LIMIT = 4;

function getConfigLabel(config = {}, language = "zh") {
  return config.displayName || config.speciesName || t(language, "common.unknown");
}

function hasRole(config, roleId, roleContext) {
  return getUtilityRoles(config, {roleContext}).includes(roleId);
}

function hasAnyRole(config, roleIds = [], roleContext) {
  const roles = getUtilityRoles(config, {roleContext});
  return roleIds.some((roleId) => roles.includes(roleId));
}

function hasSpreadMove(config = {}) {
  return (config.moves || []).some((move) => ["alladjacent", "alladjacentfoes"].includes(move?.target));
}
function getMedianSpeed(speedTiers = []) {
  const totalCount = speedTiers.reduce((sum, tier) => sum + tier.totalCount, 0);
  if (!totalCount) return 0;
  let seen = 0;
  const midpoint = totalCount / 2;
  for (const tier of [...speedTiers].sort((left, right) => left.speed - right.speed)) {
    seen += tier.totalCount;
    if (seen >= midpoint) return tier.speed;
  }
  return speedTiers[0]?.speed || 0;
}

function getSpeedPercentile(speedTiers = [], percentile = 0.5) {
  const totalCount = speedTiers.reduce((sum, tier) => sum + tier.totalCount, 0);
  if (!totalCount) return 0;
  const target = totalCount * percentile;
  let seen = 0;
  for (const tier of [...speedTiers].sort((left, right) => left.speed - right.speed)) {
    seen += tier.totalCount;
    if (seen >= target) return tier.speed;
  }
  return speedTiers[0]?.speed || 0;
}

function getSpeedContext(team = [], speedTiers = [], fieldState = {}) {
  const teamSize = team.length;
  if (!teamSize) {
    return {
      mode: SPEED_MODE_STANDARD,
      medianSpeed: getMedianSpeed(speedTiers),
      setterCount: 0,
      slowCount: 0,
      fastCount: 0,
      speedBoostCount: 0,
      teamSize: 0,
      trickRoomCutoff: 0,
    };
  }
  const medianSpeed = getMedianSpeed(speedTiers);
  const trickRoomCutoff = Math.min(medianSpeed || Infinity, getSpeedPercentile(speedTiers, TRICK_ROOM_SLOW_PERCENTILE) || Infinity);
  const speeds = team.map((config) => getEffectiveSpeed(config, "ally", fieldState));
  const setterCount = team.filter((config) => hasMove(config, TRICK_ROOM_MOVE)).length;
  const slowCount = speeds.filter((speed) => speed > 0 && speed <= trickRoomCutoff).length;
  const fastCount = speeds.filter((speed) => speed > medianSpeed).length;
  const speedBoostCount = team.filter((config) => {
    const roles = getUtilityRoles(config);
    return roles.includes("tailwind") || roles.includes("speedboostself");
  }).length;
  const trickRoomCoreSize = Math.max(2, Math.ceil(teamSize * TRICK_ROOM_CORE_RATIO));
  const fastMemberCap = Math.floor(teamSize * TRICK_ROOM_FAST_MEMBER_RATIO);
  if (setterCount && slowCount >= trickRoomCoreSize && fastCount <= fastMemberCap && speedBoostCount === 0) {
    return {mode: SPEED_MODE_TRICK_ROOM, medianSpeed, setterCount, slowCount, fastCount, speedBoostCount, teamSize, trickRoomCutoff};
  }
  if (setterCount && slowCount >= 2 && fastCount >= 2) {
    return {mode: SPEED_MODE_HYBRID, medianSpeed, setterCount, slowCount, fastCount, speedBoostCount, teamSize, trickRoomCutoff};
  }
  return {mode: SPEED_MODE_STANDARD, medianSpeed, setterCount, slowCount, fastCount, speedBoostCount, teamSize, trickRoomCutoff};
}

function getResistanceProfile(subject = [], options = {}) {
  const config = Array.isArray(subject) ? {types: subject} : subject;
  return getResistanceProfileForConfig(config, options);
}

function getCoverageProfile(subject = [], options = {}) {
  const config = Array.isArray(subject)
    ? {moves: subject.map((type) => ({name: type, id: type, type, category: "Special"}))}
    : subject;
  return getCoverageProfileForConfig(config, options);
}

function buildDefensiveTypePairs() {
  const pairs = [];
  for (let leftIndex = 0; leftIndex < TYPE_ORDER.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < TYPE_ORDER.length; rightIndex += 1) {
      pairs.push([TYPE_ORDER[leftIndex], TYPE_ORDER[rightIndex]]);
    }
  }
  return pairs;
}

function buildPartnerTypeCombos() {
  const combos = [];
  for (let leftIndex = 0; leftIndex < TYPE_ORDER.length; leftIndex += 1) {
    for (let rightIndex = leftIndex; rightIndex < TYPE_ORDER.length; rightIndex += 1) {
      combos.push(leftIndex === rightIndex ? [TYPE_ORDER[leftIndex]] : [TYPE_ORDER[leftIndex], TYPE_ORDER[rightIndex]]);
    }
  }
  return combos;
}

function compareLabels(left, right) {
  return left.label.localeCompare(right.label, "zh-Hans-CN");
}

function summarizeDefensiveMatrix(team, language, fieldState) {
  return TYPE_ORDER.map((attackType) => {
    const members = team.map((config) => ({
      member: createMemberReference(config),
      multiplier: getResistanceProfile(config, {fieldState, side: "ally"})[attackType] ?? 1,
    }));
    const average = members.reduce((sum, entry) => sum + entry.multiplier, 0) / Math.max(members.length, 1);
    const weakCount = members.filter((entry) => entry.multiplier > 1).length;
    const resistCount = members.filter((entry) => entry.multiplier < 1 && entry.multiplier > 0).length;
    const immuneCount = members.filter((entry) => entry.multiplier === 0).length;
    return {
      type: attackType,
      label: getTypeLabel(attackType, language),
      average,
      weakCount,
      resistCount,
      immuneCount,
      members,
    };
  }).sort((left, right) => (
    right.average - left.average
    || right.weakCount - left.weakCount
    || left.resistCount - right.resistCount
    || compareLabels(left, right)
  ));
}

function summarizeDefensive(team, language, fieldState) {
  return summarizeDefensiveMatrix(team, language, fieldState).map((entry) => ({
    type: entry.type,
    label: entry.label,
    average: entry.average,
    weakCount: entry.weakCount,
    resistCount: entry.resistCount,
    immuneCount: entry.immuneCount,
  }));
}

function summarizeOffensiveMatrix(team, language, fieldState) {
  return TYPE_ORDER.map((defendType) => {
    const members = team.map((config) => ({
      member: createMemberReference(config),
      effectiveness: getCoverageProfile(config, {fieldState, side: "ally"})[defendType] || 0,
    }));
    const bestEffectiveness = members.reduce((best, entry) => Math.max(best, entry.effectiveness), 0);
    return {
      type: defendType,
      label: getTypeLabel(defendType, language),
      bestEffectiveness,
      superEffectiveCount: members.filter((entry) => entry.effectiveness >= SUPER_EFFECTIVE_THRESHOLD).length,
      neutralCount: members.filter((entry) => entry.effectiveness === SINGLE_TYPE_NEUTRAL_THRESHOLD).length,
      noHitCount: members.filter((entry) => entry.effectiveness < SINGLE_TYPE_NEUTRAL_THRESHOLD).length,
      members,
    };
  }).sort((left, right) => (
    left.bestEffectiveness - right.bestEffectiveness
    || left.superEffectiveCount - right.superEffectiveCount
    || compareLabels(left, right)
  ));
}

function summarizeOffensive(team, language, fieldState) {
  return summarizeOffensiveMatrix(team, language, fieldState).map((entry) => ({
    type: entry.type,
    label: entry.label,
    effectiveness: entry.bestEffectiveness,
  }));
}

function summarizeOffensivePairs(team, language, fieldState) {
  return DEFENSIVE_TYPE_PAIRS
    .map((types) => ({
      types,
      label: types.map((type) => getTypeLabel(type, language)).join(" / "),
      effectiveness: team.reduce((best, config) => {
        return Math.max(best, getBestMoveEffectivenessAgainstTypes(config, types, {fieldState, side: "ally"}));
      }, 0),
    }))
    .filter((entry) => entry.effectiveness <= BLIND_SPOT_THRESHOLD)
    .sort((left, right) => (
      left.effectiveness - right.effectiveness
      || left.label.localeCompare(right.label, "zh-Hans-CN")
    ));
}

function summarizeOffensiveSinglesNeutral(offensive = []) {
  return offensive
    .filter((entry) => entry.effectiveness === SINGLE_TYPE_NEUTRAL_THRESHOLD)
    .sort((left, right) => (
      left.effectiveness - right.effectiveness
      || left.label.localeCompare(right.label, "zh-Hans-CN")
    ));
}

function createMemberReference(config) {
  const battleFlags = config.battleFlags || {};
  return {
    id: config.id,
    speciesId: config.speciesId || "",
    speciesName: config.speciesName || config.displayName || t("zh", "common.unknown"),
    label: config.displayName || config.speciesName || t("zh", "common.unknown"),
    note: "",
    speed: config.stats?.spe || 0,
    battleFlags,
    spritePosition: config.spritePosition || null,
  };
}

function getSuggestedSpeedScore(candidate, speedContext, speedTiers = [], fieldState = {}) {
  const medianSpeed = getMedianSpeed(speedTiers);
  const candidateSpeed = getEffectiveSpeed(candidate, "ally", fieldState);
  const topSpeed = getThreatSpeed(candidate, fieldState);
  if (speedContext.mode === SPEED_MODE_TRICK_ROOM) {
    return candidateSpeed <= medianSpeed ? 2.5 : hasMove(candidate, TRICK_ROOM_MOVE) ? 2 : 0;
  }
  if (speedContext.mode === SPEED_MODE_HYBRID) {
    if (topSpeed >= medianSpeed) {
      return 1.6;
    }
    return hasMove(candidate, TRICK_ROOM_MOVE) && candidateSpeed <= medianSpeed ? 0.9 : 0.35;
  }
  return topSpeed >= medianSpeed ? 2 : 0.5;
}

function getFocusPatchScore(multiplier) {
  if (multiplier === 0) return 6;
  if (multiplier <= 0.25) return 5;
  if (multiplier <= 0.5) return 4;
  if (multiplier === SINGLE_TYPE_NEUTRAL_THRESHOLD) return 1;
  return -3;
}

function buildSuggestedCoverEntry(candidate, context) {
  const profile = getResistanceProfile(candidate, {fieldState: context.fieldState, side: "ally"});
  const roleOptions = {roleContext: context.roleContext};
  const candidateRoles = getUtilityRoles(candidate, roleOptions)
    .filter((roleId) => RECOMMENDATION_ROLE_IDS.includes(roleId));
  const missingRoles = candidateRoles.filter((roleId) => !context.teamRoles.has(roleId));
  const duplicateTypes = (candidate.types || []).filter((type) => context.teamTypes.has(type)).length;
  const focusMultiplier = profile[context.attackType] ?? 1;
  const weaknessHelp = context.weaknessTypes.filter((type) => (profile[type] ?? 1) < 1);
  const score = (
    getFocusPatchScore(focusMultiplier) * (context.preferences.patchWeakness ? 1.4 : 0.8)
    + weaknessHelp.length * 1.25
    + missingRoles.length * (context.preferences.patchRoles ? 1.4 : 0.6)
    + getSuggestedSpeedScore(candidate, context.speedContext, context.speedTiers, context.fieldState) * (context.preferences.patchSpeed ? 1.2 : 0.5)
    - duplicateTypes * (context.preferences.avoidDuplicateTypes ? 1.4 : 0.5)
  );
  return {
    id: candidate.id,
    speciesId: candidate.speciesId || "",
    battleEquivalentSpeciesId: getBattleEquivalentSpeciesId(candidate.speciesId, context.datasets),
    speciesName: candidate.speciesName || candidate.displayName || t(context.language, "common.unknown"),
    displayName: candidate.displayName || candidate.speciesName || t(context.language, "common.unknown"),
    note: candidate.note || "",
    resistance: focusMultiplier,
    coveredWeaknesses: weaknessHelp.map((type) => getTypeLabel(type, context.language)),
    roleIds: missingRoles.slice(0, 3),
    duplicateTypes,
    score,
  };
}

function chooseBestSuggestedCoversBySpecies(entries = []) {
  const bestBySpecies = new Map();
  entries.forEach((entry) => {
    const speciesKey = String(entry.battleEquivalentSpeciesId || entry.speciesId || entry.id || "");
    const current = bestBySpecies.get(speciesKey);
    if (!current) {
      bestBySpecies.set(speciesKey, entry);
      return;
    }
    if (
      entry.score > current.score
      || (entry.score === current.score && entry.resistance < current.resistance)
      || (entry.score === current.score && entry.resistance === current.resistance && entry.duplicateTypes < current.duplicateTypes)
    ) {
      bestBySpecies.set(speciesKey, entry);
    }
  });
  return [...bestBySpecies.values()];
}

function buildSuggestedCoversByType(team, weakRows, library, language, speedTiers, speedContext, preferences, fieldState, datasets, roleContext) {
  const currentSpecies = new Set(team.map((config) => getBattleEquivalentSpeciesId(config.speciesId, datasets)));
  const teamTypes = new Set(team.flatMap((config) => config.types || []));
  const teamRoles = new Set(
    team.flatMap((config) => getUtilityRoles(config, {roleContext}))
      .filter((roleId) => RECOMMENDATION_ROLE_IDS.includes(roleId)),
  );
  const weaknessTypes = weakRows.map((entry) => entry.type);
  return Object.fromEntries(weakRows.map((row) => {
    const context = {attackType: row.type, language, preferences, speedContext, speedTiers, teamRoles, teamTypes, weaknessTypes, fieldState, datasets, roleContext};
    const entries = library
      .filter((candidate) => !currentSpecies.has(getBattleEquivalentSpeciesId(candidate.speciesId, datasets)))
      .map((candidate) => buildSuggestedCoverEntry(candidate, context))
      .sort((left, right) => (
        right.score - left.score
        || left.resistance - right.resistance
        || left.duplicateTypes - right.duplicateTypes
      ));
    const uniqueEntries = chooseBestSuggestedCoversBySpecies(entries);
    const resistEntries = uniqueEntries.filter((entry) => entry.resistance < 1);
    return [row.type, (resistEntries.length ? resistEntries : uniqueEntries).slice(0, MAX_SUGGESTED_COVERS)];
  }));
}

function summarizeCoverage(team, blindSpots, language, library, speedTiers, speedContext, preferences, fieldState, datasets, roleContext) {
  const defensiveMatrix = summarizeDefensiveMatrix(team, language, fieldState);
  const offensiveMatrix = summarizeOffensiveMatrix(team, language, fieldState);
  const weakRows = defensiveMatrix
    .filter((entry) => entry.average > WEAKNESS_AVERAGE_THRESHOLD)
    .slice(0, 6);
  const suggestedCoversByType = buildSuggestedCoversByType(
    team,
    weakRows,
    library,
    language,
    speedTiers,
    speedContext,
    preferences,
    fieldState,
    datasets,
    roleContext,
  );
  const defensiveRows = defensiveMatrix.map((entry) => ({
    ...entry,
    suggestedCovers: suggestedCoversByType[entry.type] || [],
  }));
  const offensiveGapCards = buildOffensiveGapCards(team, blindSpots, datasets, fieldState);
  return {
    rows: offensiveMatrix,
    defensiveMatrix: defensiveRows,
    offensiveMatrix,
    weakRows: defensiveRows.filter((entry) => entry.average > WEAKNESS_AVERAGE_THRESHOLD).slice(0, 6),
    suggestedCoversByType,
    offensiveGapCards,
    strongCount: offensiveMatrix.filter((entry) => entry.bestEffectiveness >= SUPER_EFFECTIVE_THRESHOLD).length,
  };
}

function getSortedSpeedTiers(speedTiers = []) {
  return [...speedTiers].sort((left, right) => left.speed - right.speed);
}

function createTierReference(tier, language) {
  const entry = tier?.entries?.[0];
  if (!tier || !entry) {
    return null;
  }
  return {
    speciesId: entry.speciesId || "",
    speed: tier.speed,
    label: entry.speciesName || entry.displayName || entry.speciesLabel || t(language, "common.unknown"),
    note: entry.note || "",
  };
}

function getThreatSpeed(candidate, fieldState = {}) {
  return getEffectiveSpeed(candidate, "ally", fieldState);
}

function summarizePressureThreats(config, library = [], selectedSpeciesIds = new Set(), language = "zh", fieldState = {}) {
  const memberSpeed = getEffectiveSpeed(config, "ally", fieldState);
  return library
    .filter((candidate) => (
      candidate.id !== config.id
      && candidate.speciesId !== config.speciesId
      && !selectedSpeciesIds.has(candidate.speciesId)
    ))
    .map((candidate) => ({
      speciesId: candidate.speciesId || "",
      label: candidate.speciesName || candidate.displayName || t(language, "common.unknown"),
      note: candidate.note || "",
      speed: getThreatSpeed(candidate, fieldState),
      effectiveness: getBestMoveEffectiveness(candidate, config, {fieldState, side: "ally", defenderSide: "ally"}),
    }))
    .filter((candidate) => candidate.speed > memberSpeed && candidate.effectiveness >= SUPER_EFFECTIVE_THRESHOLD)
    .sort((left, right) => (
      right.effectiveness - left.effectiveness
      || left.speed - right.speed
      || left.label.localeCompare(right.label, "zh-Hans-CN")
    ))
    .slice(0, THREAT_PREVIEW_LIMIT);
}

function summarizeSpeed(team, speedTiers, language, speedContext, library, fieldState) {
  const sortedSpeedTiers = getSortedSpeedTiers(speedTiers);
  const selectedSpeciesIds = new Set(team.map((config) => config.speciesId).filter(Boolean));
  return [...team]
    .sort((left, right) => getEffectiveSpeed(right, "ally", fieldState) - getEffectiveSpeed(left, "ally", fieldState))
    .map((config) => {
      const speed = getEffectiveSpeed(config, "ally", fieldState);
      const slowerTiers = sortedSpeedTiers.filter((tier) => {
        const delta = fieldState?.trickRoom ? tier.speed > speed : tier.speed < speed;
        return delta;
      });
      const fasterTiers = sortedSpeedTiers.filter((tier) => {
        const delta = fieldState?.trickRoom ? tier.speed < speed : tier.speed > speed;
        return delta;
      });
      return {
        id: config.id,
        label: config.displayName,
        note: config.note || "",
        speed,
        isTrickRoomSetter: hasMove(config, TRICK_ROOM_MOVE),
        aheadOf: slowerTiers.slice(-SPEED_PREVIEW_LIMIT).reverse().map((tier) => createTierReference(tier, language)).filter(Boolean),
        nextThreat: createTierReference(fasterTiers[0], language),
        trickRoomAheadOf: speedContext.mode === SPEED_MODE_STANDARD
          ? []
          : fasterTiers.slice(0, SPEED_PREVIEW_LIMIT).map((tier) => createTierReference(tier, language)).filter(Boolean),
        pressureThreats: summarizePressureThreats(config, library, selectedSpeciesIds, language, fieldState),
      };
    });
}

function summarizeStructure(team, language) {
  const moveCategories = team.flatMap((config) => config.moves || []).map((move) => move.category);
  const typeSpread = team.flatMap((config) => config.types || []);
  return {
    physical: moveCategories.filter((category) => category === "Physical").length,
    special: moveCategories.filter((category) => category === "Special").length,
    support: moveCategories.filter((category) => category === "Status").length,
    duplicateTypes: Object.entries(
      typeSpread.reduce((counts, type) => ({...counts, [type]: (counts[type] || 0) + 1}), {}),
    )
      .filter(([, count]) => count > 1)
      .map(([type, count]) => `${getTypeLabel(type, language)}×${count}`),
  };
}

function summarizeRoleMembers(team, roleId, extractor) {
  return team
    .filter((config) => extractor(config).includes(roleId))
    .map(createMemberReference);
}

function summarizeSingleRoles(team, roleContext, damageRolesByConfigId) {
  return team.map((config) => {
    const result = analyzePokemonRoles(config, {roleContext});
    const damageRoles = damageRolesByConfigId?.get(config.id) || [];
    return {
      member: createMemberReference(config),
      metaPosition: getEstimatedRoleMetrics(config, roleContext),
      ...result,
      secondary: [...new Set([...result.secondary, ...damageRoles])],
      damageRoles,
    };
  });
}

function rolesForConfig(config, roleContext, damageRolesByConfigId) {
  const utility = getUtilityRoles(config, {roleContext});
  const damage = damageRolesByConfigId?.get(config.id) || [];
  return [...new Set([...utility, ...damage])];
}

function summarizeRoles(team, speedContext, roleContext, damageRolesByConfigId) {
  const tactical = TACTICAL_ROLE_ORDER.map((roleId) => {
    const members = summarizeRoleMembers(team, roleId, (config) => rolesForConfig(config, roleContext, damageRolesByConfigId));
    return {id: roleId, count: members.length, members};
  });
  const support = SUPPORT_ROLE_ORDER.map((roleId) => {
    const members = summarizeRoleMembers(team, roleId, (config) => rolesForConfig(config, roleContext, damageRolesByConfigId));
    return {id: roleId, count: members.length, members};
  });
  const structure = STRUCTURE_ROLE_ORDER.map((roleId) => {
    const members = summarizeRoleMembers(team, roleId, (config) => getStructureRoles(config, {roleContext}));
    return {id: roleId, count: members.length, members};
  });
  const attackBiases = ATTACK_BIAS_ORDER.map((roleId) => {
    const members = summarizeRoleMembers(team, roleId, (config) => [getAttackBias(config)]);
    return {id: roleId, count: members.length, members};
  });
  const requiredRolesByMode = {
    [SPEED_MODE_STANDARD]: ["speedboostself", "speeddebuff", "fakeout", "pivot", "disruption"],
    [SPEED_MODE_TRICK_ROOM]: ["trickroom", "slowattacker", "fakeout", "redirection", "tank"],
    [SPEED_MODE_HYBRID]: ["speedboostself", "trickroom", "slowattacker", "fakeout", "pivot", "disruption"],
  };
  const allRoleEntries = [...tactical, ...support, ...structure];
  const requiredRoles = requiredRolesByMode[speedContext.mode] || requiredRolesByMode[SPEED_MODE_STANDARD];
  return {
    tactical,
    support,
    structure,
    attackBiases,
    single: summarizeSingleRoles(team, roleContext, damageRolesByConfigId),
    missing: allRoleEntries.filter((entry) => requiredRoles.includes(entry.id) && entry.count === 0).map((entry) => entry.id),
    filledUtilityCount: [...tactical, ...support].filter((entry) => entry.count > 0).length,
  };
}

function getCombinationEntries(team = [], size = 2) {
  const entries = [];
  function walk(startIndex, picked) {
    if (picked.length === size) {
      entries.push([...picked]);
      return;
    }
    for (let index = startIndex; index < team.length; index += 1) {
      picked.push(team[index]);
      walk(index + 1, picked);
      picked.pop();
    }
  }
  if (team.length < size) {
    return [];
  }
  walk(0, []);
  return entries;
}

function countCorePatches(core, typeList = TYPE_ORDER) {
  return typeList.filter((type) => {
    const multipliers = core.map((config) => getResistanceProfile(config)[type] ?? 1);
    return multipliers.some((value) => value > 1) && multipliers.some((value) => value < 1);
  }).length;
}

function countCoreImmunityPatches(core) {
  return TYPE_ORDER.filter((type) => {
    const multipliers = core.map((config) => getResistanceProfile(config)[type] ?? 1);
    return multipliers.some((value) => value > 1) && multipliers.some((value) => value === 0);
  }).length;
}

function countSharedWeaknesses(core, minimumCount = 2) {
  return TYPE_ORDER.filter((type) => {
    return core.filter((config) => (getResistanceProfile(config)[type] ?? 1) > 1).length >= minimumCount;
  }).length;
}

function countSingleCoverage(core = []) {
  return TYPE_ORDER.filter((defendType) => {
    return core.some((config) => getBestMoveEffectivenessAgainstTypes(config, [defendType]) >= SUPER_EFFECTIVE_THRESHOLD);
  }).length;
}

function countDualCoverage(core = []) {
  return DEFENSIVE_TYPE_PAIRS.filter((types) => {
    return core.some((config) => getBestMoveEffectivenessAgainstTypes(config, types) >= SUPER_EFFECTIVE_THRESHOLD);
  }).length;
}

function getCoreRoles(core, roleContext) {
  return uniqueStrings(
    core.flatMap((config) => getUtilityRoles(config, {roleContext}))
      .filter((roleId) => RECOMMENDATION_ROLE_IDS.includes(roleId)),
  );
}

function scoreCoreEntry(entry) {
  return (
    entry.teamWeaknessPatches * 2.5
    + entry.patchedWeaknesses * 2
    + entry.immunityPatches * 1.5
    + entry.singleCoverageCount * 0.45
    + entry.pairCoverageCount * 0.05
    + entry.comboBonus
    + entry.roles.length * 0.75
    - entry.sharedWeaknesses * 2.2
    - (entry.hasAttacker ? 0 : 3)
  );
}

function getWeaknessTypes(member = {}) {
  return TYPE_ORDER.filter((type) => (getResistanceProfile(member)[type] ?? 1) > 1);
}

function buildPartnerSuggestion(member, team, language) {
  const weaknessTypes = getWeaknessTypes(member);
  const otherMembers = team.filter((config) => config.id !== member.id);
  const coveredByTeam = weaknessTypes
    .map((type) => ({
      type,
      label: getTypeLabel(type, language),
      members: otherMembers
        .filter((config) => (getResistanceProfile(config)[type] ?? 1) < 1)
        .map(createMemberReference),
    }))
    .filter((entry) => entry.members.length);
  const suggestions = PARTNER_TYPE_COMBOS
    .map((types) => {
      const partner = {types};
      const covered = weaknessTypes.filter((type) => (getResistanceProfile(partner)[type] ?? 1) < 1);
      const immune = weaknessTypes.filter((type) => (getResistanceProfile(partner)[type] ?? 1) === 0);
      const partnerWeaknesses = getWeaknessTypes(partner);
      const synergy = partnerWeaknesses.filter((type) => (getResistanceProfile(member)[type] ?? 1) < 1).length;
      return {
        label: types.map((type) => getTypeLabel(type, language)).join(" / "),
        types,
        covered,
        immune,
        synergy,
        score: covered.length * 3 + immune.length * 2 + synergy * 2,
      };
    })
    .filter((entry) => entry.covered.length)
    .sort((left, right) => right.score - left.score || left.types.length - right.types.length)
    .slice(0, 8)
    .map((entry) => ({
      ...entry,
      typeLabels: entry.types.map((type) => getTypeLabel(type, language)),
      coveredLabels: entry.covered.map((type) => getTypeLabel(type, language)),
    }));
  return {
    member: createMemberReference(member),
    weaknessLabels: weaknessTypes.map((type) => getTypeLabel(type, language)),
    coveredByTeam,
    suggestions,
  };
}

function summarizePartnerSuggestions(team, context = {}) {
  const suggestionsById = Object.fromEntries(
    team.map((member) => {
      const entry = buildPartnerSuggestion(member, team, context.language);
      return [member.id, {
        ...entry,
        libraryCandidates: buildLibraryCoreCandidates({
          focusMember: member,
          team,
          library: context.library,
          missingRoles: context.missingRoles,
          weaknesses: context.weaknesses,
          speedContext: context.speedContext,
          fieldState: context.fieldState,
          language: context.language,
          roleContext: context.roleContext,
        }),
      }];
    }),
  );
  return {
    memberOptions: team.map(createMemberReference),
    suggestionsById,
  };
}

function getSynergyLabels(reasonIds = [], language = "zh") {
  return reasonIds.map((id) => t(language, `analysis.coreSynergy.${id}`));
}

function hasAttackerPresence(core = []) {
  return core.some((config) => {
    const moves = config?.moves || [];
    const damagingCount = moves.filter((move) => move?.category === "Physical" || move?.category === "Special").length;
    const points = config?.championPoints || config?.points || {};
    const offensivePoints = Math.max(Number(points.atk || 0), Number(points.spa || 0));
    return damagingCount >= 2 && offensivePoints >= 12;
  });
}

function buildCoreEntry(core, weaknessTypes, language, roleContext) {
  const pairSynergy = evaluatePairSynergy(core);
  const entry = {
    members: core.map(createMemberReference),
    roles: getCoreRoles(core, roleContext),
    teamWeaknessPatches: countCorePatches(core, weaknessTypes),
    patchedWeaknesses: countCorePatches(core),
    immunityPatches: countCoreImmunityPatches(core),
    sharedWeaknesses: countSharedWeaknesses(core, 2),
    singleCoverageCount: countSingleCoverage(core),
    pairCoverageCount: countDualCoverage(core),
    comboBonus: pairSynergy.bonus,
    synergyReasons: getSynergyLabels(pairSynergy.reasonIds, language),
    hasAttacker: hasAttackerPresence(core),
  };
  return {...entry, score: scoreCoreEntry(entry)};
}

function buildTrioEntry(trio, weaknessTypes, language, roleContext) {
  const pairEntries = getCombinationEntries(trio, 2)
    .map((pair) => buildCoreEntry(pair, weaknessTypes, language, roleContext));
  const trioSynergy = evaluateTrioSynergy(trio);
  const teamWeaknessPatches = Math.max(...pairEntries.map((entry) => entry.teamWeaknessPatches), 0);
  const patchedWeaknesses = Math.max(...pairEntries.map((entry) => entry.patchedWeaknesses), 0);
  const immunityPatches = Math.max(...pairEntries.map((entry) => entry.immunityPatches), 0);
  const entry = {
    members: trio.map(createMemberReference),
    roles: getCoreRoles(trio, roleContext),
    teamWeaknessPatches,
    patchedWeaknesses,
    immunityPatches,
    sharedWeaknesses: countSharedWeaknesses(trio, 2),
    singleCoverageCount: countSingleCoverage(trio),
    pairCoverageCount: countDualCoverage(trio),
    comboBonus: pairEntries.reduce((sum, item) => sum + Number(item.comboBonus || 0), 0) + trioSynergy.bonus,
    synergyReasons: uniqueStrings([
      ...pairEntries.flatMap((entryItem) => entryItem.synergyReasons || []),
      ...getSynergyLabels(trioSynergy.reasonIds, language),
    ]),
  };
  return {...entry, score: scoreCoreEntry(entry)};
}

function summarizeCores(team, weaknesses = [], language = "zh", context = {}) {
  if (team.length < 2) {
    return {bestPairs: [], bestTrios: [], riskyPairs: [], memberOptions: [], suggestionsById: {}};
  }

  const weaknessTypes = weaknesses.map((entry) => entry.type);
  const roleContext = context.roleContext;
  const pairs = getCombinationEntries(team, 2)
    .map((pair) => buildCoreEntry(pair, weaknessTypes, language, roleContext));
  const trios = getCombinationEntries(team, 3)
    .map((trio) => buildTrioEntry(trio, weaknessTypes, language, roleContext));
  const bestPairs = [...pairs]
    .sort((left, right) => right.score - left.score || left.sharedWeaknesses - right.sharedWeaknesses)
    .slice(0, CORE_PREVIEW_LIMIT);
  const bestTrios = [...trios]
    .sort((left, right) => right.score - left.score || left.sharedWeaknesses - right.sharedWeaknesses)
    .slice(0, TRIO_PREVIEW_LIMIT);
  const riskyPairs = pairs
    .filter((entry) => entry.sharedWeaknesses > 0)
    .sort((left, right) => right.sharedWeaknesses - left.sharedWeaknesses || left.score - right.score)
    .slice(0, CORE_RISK_LIMIT);
  return {
    bestPairs,
    bestTrios,
    riskyPairs,
    ...summarizePartnerSuggestions(team, {
      ...context,
      language,
      weaknesses,
    }),
  };
}

function getReferenceTeamKey(config = {}, index = 0) {
  const sourceTeamId = config.source?.teamId || String(config.note || "").match(/PC[0-9A-Z]+/i)?.[0];
  if (sourceTeamId) return `source:${String(sourceTeamId).toUpperCase()}`;
  return `local:${Math.floor(index / 6)}`;
}

function buildReferenceSamples(library = []) {
  const groups = new Map();
  library.forEach((config, index) => {
    if (!config?.speciesId) return;
    const key = getReferenceTeamKey(config, index);
    const group = groups.get(key) || [];
    group.push(config);
    groups.set(key, group);
  });
  return [...groups.values()]
    .map((configs) => configs.slice(0, 6))
    .filter((configs) => configs.length >= 4);
}

function buildMegaReferenceSamples(library = []) {
  const groups = new Map();
  library.forEach((config, index) => {
    if (!config?.speciesId || !isMegaConfig(config)) return;
    const key = getReferenceTeamKey(config, index);
    const group = groups.get(key) || [];
    group.push(config);
    groups.set(key, group);
  });
  return [...groups.values()].map((configs) => configs.slice(0, 6));
}

function mergeReferenceSampleEntries(primaryEntries = [], extraEntries = []) {
  const selected = [...primaryEntries];
  const selectedKeys = new Set(selected.map((entry) => getReferenceTeamKey(entry.configs?.[0])));
  for (const entry of extraEntries) {
    const key = getReferenceTeamKey(entry.configs?.[0]);
    if (selectedKeys.has(key)) continue;
    selected.push(entry);
    selectedKeys.add(key);
  }
  return selected;
}

function selectReferenceSamples(samples = []) {
  const selected = samples.slice(0, REFERENCE_BASE_SAMPLE_LIMIT);
  const selectedKeys = new Set(selected.map((configs) => getReferenceTeamKey(configs[0])));
  const megaSamples = samples.filter((configs) => configs.some(isMegaConfig));
  for (const configs of megaSamples) {
    const key = getReferenceTeamKey(configs[0]);
    if (selectedKeys.has(key)) continue;
    selected.push(configs);
    selectedKeys.add(key);
  }
  return selected;
}

function getReferenceTeamVector(configs = [], context = {}) {
  const medianSpeed = Number(context.speedContext?.medianSpeed || getMedianSpeed(context.speedTiers));
  const size = Math.max(1, configs.length);
  const roleCount = (roleId) => configs.filter((config) => hasRole(config, roleId, context.roleContext)).length / size;
  const anyWeather = WEATHER_ROLE_IDS.some((roleId) => configs.some((config) => hasRole(config, roleId, context.roleContext)));
  const moveCategories = configs.flatMap((config) => config.moves || []).map((move) => move.category);
  return {
    sun: roleCount("sunsetter"),
    rain: roleCount("rainsetter"),
    sand: roleCount("sandsetter"),
    snow: roleCount("snowsetter"),
    trickRoom: roleCount("trickroom"),
    tailwind: roleCount("tailwind") + roleCount("speedboostself") * 0.5,
    fast: configs.filter((config) => getEffectiveSpeed(config, "ally", context.fieldState) > medianSpeed).length / size,
    slow: configs.filter((config) => getEffectiveSpeed(config, "ally", context.fieldState) <= medianSpeed).length / size,
    mega: configs.filter(isMegaConfig).length / size,
    physical: moveCategories.filter((category) => category === "Physical").length / Math.max(1, moveCategories.length),
    special: moveCategories.filter((category) => category === "Special").length / Math.max(1, moveCategories.length),
    support: moveCategories.filter((category) => category === "Status").length / Math.max(1, moveCategories.length),
    fakeout: roleCount("fakeout"),
    redirection: roleCount("redirection"),
    guard: roleCount("guard") + roleCount("wideguard"),
    disruption: roleCount("disruption"),
    pivot: roleCount("pivot"),
    spread: configs.filter(hasSpreadMove).length / size,
    weather: anyWeather ? 1 : 0,
  };
}

function vectorToArray(vector = {}) {
  return REFERENCE_FEATURE_KEYS.map((key) => Number(vector[key] || 0));
}

function standardizeVectors(vectors = []) {
  const means = REFERENCE_FEATURE_KEYS.map((_, index) => vectors.reduce((sum, vector) => sum + vector[index], 0) / Math.max(1, vectors.length));
  const deviations = means.map((mean, index) => {
    const variance = vectors.reduce((sum, vector) => sum + (vector[index] - mean) ** 2, 0) / Math.max(1, vectors.length);
    return Math.sqrt(variance) || 1;
  });
  return vectors.map((vector) => vector.map((value, index) => (value - means[index]) / deviations[index]));
}

function dot(left = [], right = []) {
  return left.reduce((sum, value, index) => sum + value * Number(right[index] || 0), 0);
}

function normalizeVector(vector = []) {
  const length = Math.sqrt(dot(vector, vector)) || 1;
  return vector.map((value) => value / length);
}

function multiplyCovariance(vectors = [], axis = []) {
  return axis.map((_, featureIndex) => {
    return vectors.reduce((sum, vector) => sum + vector[featureIndex] * dot(vector, axis), 0) / Math.max(1, vectors.length - 1);
  });
}

function derivePrincipalAxis(vectors = [], seedIndex = 0) {
  let axis = REFERENCE_FEATURE_KEYS.map((_, index) => (index === seedIndex ? 1 : 0.37));
  for (let step = 0; step < 12; step += 1) {
    axis = normalizeVector(multiplyCovariance(vectors, axis));
  }
  return axis;
}

function projectReferenceVectors(vectors = []) {
  if (!vectors.length) return [];
  const primaryAxis = derivePrincipalAxis(vectors, 0);
  const secondarySeed = REFERENCE_FEATURE_KEYS.map((_, index) => (index === 1 ? 1 : 0.19));
  const primaryComponent = dot(secondarySeed, primaryAxis);
  const secondaryAxis = normalizeVector(secondarySeed.map((value, index) => value - primaryComponent * primaryAxis[index]));
  return vectors.map((vector) => ({x: dot(vector, primaryAxis), y: dot(vector, secondaryAxis)}));
}

function distanceSquared(left, right) {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

function assignClusters(points = [], centroids = []) {
  return points.map((point) => centroids.reduce((best, centroid, index) => {
    const distance = distanceSquared(point, centroid);
    return distance < best.distance ? {index, distance} : best;
  }, {index: 0, distance: Infinity}).index);
}

function updateCentroids(points = [], assignments = [], clusterCount = 1) {
  return Array.from({length: clusterCount}, (_, index) => {
    const members = points.filter((_, pointIndex) => assignments[pointIndex] === index);
    if (!members.length) return points[index % Math.max(1, points.length)] || {x: 0, y: 0};
    return {
      x: members.reduce((sum, point) => sum + point.x, 0) / members.length,
      y: members.reduce((sum, point) => sum + point.y, 0) / members.length,
    };
  });
}

function clusterReferencePoints(points = [], clusterCount = 1) {
  if (!points.length) return [];
  let centroids = [...points]
    .sort((left, right) => left.x - right.x || left.y - right.y)
    .filter((_, index) => index % Math.max(1, Math.floor(points.length / clusterCount)) === 0)
    .slice(0, clusterCount);
  while (centroids.length < clusterCount) centroids.push(points[centroids.length % points.length]);
  let assignments = assignClusters(points, centroids);
  for (let step = 0; step < REFERENCE_CLUSTER_ITERATIONS; step += 1) {
    centroids = updateCentroids(points, assignments, clusterCount);
    assignments = assignClusters(points, centroids);
  }
  return centroids.map((centroid, clusterIndex) => {
    const memberIndexes = assignments
      .map((assignment, pointIndex) => (assignment === clusterIndex ? pointIndex : -1))
      .filter((pointIndex) => pointIndex >= 0);
    const representativeIndex = memberIndexes.reduce((bestIndex, pointIndex) => {
      if (bestIndex < 0) return pointIndex;
      return distanceSquared(points[pointIndex], centroid) < distanceSquared(points[bestIndex], centroid) ? pointIndex : bestIndex;
    }, -1);
    return {centroid, memberIndexes, representativeIndex};
  }).filter((cluster) => cluster.representativeIndex >= 0);
}

function getReferenceArchetypeId(vector = {}) {
  const scores = {
    sun: vector.sun * REFERENCE_ARCHETYPE_WEIGHTS.sun,
    rain: vector.rain * REFERENCE_ARCHETYPE_WEIGHTS.rain,
    sand: vector.sand * REFERENCE_ARCHETYPE_WEIGHTS.sand,
    snow: vector.snow * REFERENCE_ARCHETYPE_WEIGHTS.snow,
    trickroom: vector.trickRoom * REFERENCE_ARCHETYPE_WEIGHTS.trickroom + vector.slow,
    tailwind: vector.tailwind * REFERENCE_ARCHETYPE_WEIGHTS.tailwind + vector.fast,
    mega: vector.mega * REFERENCE_ARCHETYPE_WEIGHTS.mega,
    balance: REFERENCE_ARCHETYPE_WEIGHTS.balance + Math.min(vector.physical, vector.special) + vector.support,
  };
  return Object.entries(scores).sort((left, right) => right[1] - left[1])[0]?.[0] || "balance";
}

function getReferenceCoreMembers(configs = [], vector = {}, context = {}) {
  const seenSpecies = new Set();
  const preferred = configs
    .map((config) => {
      const roles = getUtilityRoles(config, {roleContext: context.roleContext});
      const score = Number(isMegaConfig(config)) * 3
        + Number(roles.some((roleId) => ["trickroom", "tailwind", "sunsetter", "rainsetter", "sandsetter", "snowsetter"].includes(roleId))) * 2
        + Number(hasSpreadMove(config)) * 0.8
        + Number((config.moves || []).some((move) => move.category !== "Status")) * 0.5
        + Number(vector.mega > 0 && isMegaConfig(config));
      return {config, score};
    })
    .sort((left, right) => right.score - left.score || getConfigLabel(left.config).localeCompare(getConfigLabel(right.config), "zh-Hans-CN"));
  return preferred
    .filter(({config}) => {
      const key = getReferenceDisplaySpeciesKey(config, context);
      if (seenSpecies.has(key)) return false;
      seenSpecies.add(key);
      return true;
    })
    .slice(0, 3)
    .map(({config}) => createMemberReference(config));
}

function getReferenceSpeciesKey(config = {}) {
  return getBattleEquivalentSpeciesId(config.speciesId) || config.speciesId || config.id;
}

function getReferenceDisplaySpeciesKey(config = {}, context = {}) {
  const speciesId = config.speciesId || "";
  const entry = context.datasets?.pokedex?.[speciesId];
  return getBattleEquivalentSpeciesId(entry?.baseSpecies || speciesId, context.datasets) || speciesId || config.id;
}

function getReferenceDisplayLabel(config = {}, context = {}) {
  if (context.language === "zh") {
    const localized = context.datasets?.localizedSpeciesNames?.get(config.speciesId);
    if (localized) return localized;
  }
  return getConfigLabel(config, context.language);
}

function getMegaReferenceCoreMembers(megaConfig = {}, entries = [], context = {}) {
  const targetKey = getReferenceDisplaySpeciesKey(megaConfig, context);
  const teammateCounts = new Map();
  const teammateConfigs = new Map();
  for (const entry of entries) {
    for (const config of entry.configs || []) {
      const key = getReferenceDisplaySpeciesKey(config, context);
      if (!key || key === targetKey || isMegaConfig(config)) continue;
      teammateCounts.set(key, (teammateCounts.get(key) || 0) + 1);
      if (!teammateConfigs.has(key)) teammateConfigs.set(key, config);
    }
  }
  const teammates = [...teammateCounts.entries()]
    .sort((left, right) => right[1] - left[1] || getConfigLabel(teammateConfigs.get(left[0])).localeCompare(getConfigLabel(teammateConfigs.get(right[0])), "zh-Hans-CN"))
    .slice(0, 2)
    .map(([key]) => createMemberReference(teammateConfigs.get(key)));
  return [createMemberReference(megaConfig), ...teammates];
}

function getMegaReferenceConfigs(megaConfig = {}, entries = []) {
  const targetKey = getReferenceSpeciesKey(megaConfig);
  return entries
    .flatMap((entry) => entry.configs || [])
    .filter((config) => getReferenceSpeciesKey(config) === targetKey)
    .slice(0, 6);
}

function getTopReferenceThreatTypes(configs = [], context = {}) {
  return TYPE_ORDER.map((type) => {
    const pressure = configs.reduce((sum, config) => {
      return sum + getBestMoveEffectiveness(config, {types: [type]}, {fieldState: context.fieldState, side: "ally", defenderSide: "ally"});
    }, 0) / Math.max(1, configs.length);
    return {type, pressure};
  }).sort((left, right) => right.pressure - left.pressure).slice(0, 3);
}

function getReferenceDefensiveAnswers(team = [], threatTypes = [], context = {}) {
  return team.map((config) => {
    const profile = getResistanceProfile(config, {fieldState: context.fieldState, side: "ally"});
    const covered = threatTypes.filter((entry) => (profile[entry.type] ?? 1) < 1);
    return {
      member: createMemberReference(config),
      labels: covered.map((entry) => getTypeLabel(entry.type, context.language)),
      score: covered.length * 2 + threatTypes.reduce((sum, entry) => sum + Math.max(0, 1 - (profile[entry.type] ?? 1)), 0),
    };
  }).filter((entry) => entry.score > 0).sort((left, right) => right.score - left.score).slice(0, DEFENSIVE_ANSWER_LIMIT);
}

function getReferenceOffensiveAnswers(team = [], referenceConfigs = [], context = {}) {
  return team.map((config) => {
    const hits = referenceConfigs.map((target) => ({
      target: createMemberReference(target),
      effectiveness: getBestMoveEffectiveness(config, target, {fieldState: context.fieldState, side: "ally", defenderSide: "opponent"}),
    })).filter((entry) => entry.effectiveness >= SUPER_EFFECTIVE_THRESHOLD);
    return {member: createMemberReference(config), hits, score: hits.reduce((sum, entry) => sum + entry.effectiveness, 0)};
  }).filter((entry) => entry.hits.length).sort((left, right) => right.score - left.score).slice(0, OFFENSIVE_ANSWER_LIMIT);
}

function getReferenceRoleAnswers(team = [], archetypeId = "balance", context = {}) {
  const roleIds = {
    sun: ["weatherresetpivot", "speeddebuff", "fakeout", "guard"],
    rain: ["weatherresetpivot", "speeddebuff", "redirection", "guard"],
    sand: ["weatherresetpivot", "wideguard", "redirection", "intimidatepivot"],
    snow: ["weatherresetpivot", "guard", "disruption", "fakeout"],
    trickroom: ["taunt", "fakeout", "disruption", "redirection"],
    tailwind: ["speeddebuff", "paralysiscontrol", "fakeout", "guard"],
    mega: ["intimidatepivot", "fakeout", "redirection", "speeddebuff"],
    balance: ["pivot", "fakeout", "disruption", "redirection"],
  }[archetypeId] || ["pivot", "fakeout", "disruption"];
  return roleIds.map((roleId) => ({
    roleId,
    members: team.filter((config) => hasRole(config, roleId, context.roleContext)).map(createMemberReference),
  })).filter((entry) => entry.members.length).slice(0, ROLE_ANSWER_LIMIT);
}

function getReferenceRoleIds(archetypeId = "balance") {
  return {
    mega: ["fakeout", "intimidatepivot", "redirection", "speeddebuff", "disruption"],
    weather: ["weatherresetpivot", "speeddebuff", "fakeout", "guard", "wideguard"],
    trickroom: ["taunt", "fakeout", "disruption", "redirection", "slowattacker"],
    tailwind: ["speeddebuff", "paralysiscontrol", "fakeout", "guard", "priority"],
    balance: ["pivot", "fakeout", "disruption", "redirection"],
  }[archetypeId] || ["pivot", "fakeout", "disruption"];
}

function scoreReferenceLineupMember(config, referenceConfigs = [], threatTypes = [], archetypeId = "balance", context = {}, options = {}) {
  const profile = getResistanceProfile(config, {fieldState: context.fieldState, side: "ally"});
  const defensiveScore = threatTypes.reduce((sum, entry) => sum + Math.max(0, 1.25 - (profile[entry.type] ?? 1)), 0) * 2;
  const offensiveScore = referenceConfigs.reduce((sum, target) => {
    const hit = getBestMoveEffectiveness(config, target, {fieldState: context.fieldState, side: "ally", defenderSide: "opponent"});
    return sum + (hit >= SUPER_EFFECTIVE_THRESHOLD ? hit : hit >= 1 ? 0.35 : 0);
  }, 0);
  const roles = getUtilityRoles(config, {roleContext: context.roleContext});
  const roleScore = getReferenceRoleIds(archetypeId).filter((roleId) => roles.includes(roleId)).length * 1.6;
  const speed = getEffectiveSpeed(config, "ally", context.fieldState);
  const speedScore = archetypeId === "trickroom"
    ? Number(hasMove(config, TRICK_ROOM_MOVE) || roles.includes("slowattacker")) * 1.2
    : Number(speed >= Number(context.speedContext?.medianSpeed || 0)) * 0.6;
  const megaPickBonus = options.includeMegaPickBonus && isMegaConfig(config) ? REFERENCE_MEGA_PICK_BONUS : 0;
  return defensiveScore + offensiveScore + roleScore + speedScore + megaPickBonus;
}

function buildReferenceLineup(team = [], referenceConfigs = [], threatTypes = [], archetypeId = "balance", context = {}) {
  const ranked = team
    .map((config) => ({config, score: scoreReferenceLineupMember(config, referenceConfigs, threatTypes, archetypeId, context, {includeMegaPickBonus: true})}))
    .sort((left, right) => right.score - left.score || getConfigLabel(left.config, context.language).localeCompare(getConfigLabel(right.config, context.language), "zh-Hans-CN"));
  const picked = [];
  const pickedSpecies = new Set();
  const pickEntry = (entry, options = {}) => {
    if (picked.length >= 4) return false;
    const key = getReferenceDisplaySpeciesKey(entry.config, context);
    if (pickedSpecies.has(key)) return false;
    if (!options.allowExtraMega && isMegaConfig(entry.config) && picked.some(isMegaConfig)) return false;
    picked.push(entry.config);
    pickedSpecies.add(key);
    return true;
  };
  for (const entry of ranked) {
    pickEntry(entry);
  }
  for (const entry of ranked) {
    pickEntry(entry, {allowExtraMega: true});
  }
  return picked
    .map((config) => ({config, leadScore: scoreReferenceLineupMember(config, referenceConfigs, threatTypes, archetypeId, context)}))
    .sort((left, right) => right.leadScore - left.leadScore || getConfigLabel(left.config, context.language).localeCompare(getConfigLabel(right.config, context.language), "zh-Hans-CN"))
    .map(({config}) => createMemberReference(config));
}
function getWeatherLabelId(vector = {}) {
  return REFERENCE_WEATHER_IDS.sort((left, right) => Number(vector[right] || 0) - Number(vector[left] || 0))[0] || "weather";
}
function getReferenceModeScore(entry, archetypeId) {
  const vector = entry.vector || {};
  if (archetypeId === "mega") return vector.mega * 5;
  if (REFERENCE_WEATHER_IDS.includes(archetypeId)) return Number(vector[archetypeId] || 0) * 5;
  if (archetypeId === "weather") return Math.max(vector.sun, vector.rain, vector.sand, vector.snow) * 5;
  if (archetypeId === "trickroom") return vector.trickRoom * 5 + vector.slow;
  if (archetypeId === "tailwind") return vector.tailwind * 4 + vector.fast;
  return Math.min(vector.physical, vector.special) + vector.support;
}


function pickReferenceSampleForMode(sampleEntries = [], archetypeId) {
  return sampleEntries
    .map((entry) => ({...entry, modeScore: getReferenceModeScore(entry, archetypeId)}))
    .filter((entry) => entry.modeScore > 0.55)
    .sort((left, right) => right.modeScore - left.modeScore)[0] || null;
}

function getMegaReferenceConfig(configs = []) {
  return configs.find((config) => isMegaConfig(config)) || null;
}

function getMegaReferenceKey(config = {}) {
  return getBattleEquivalentSpeciesId(config.speciesId) || config.speciesId || config.id || "mega";
}

function getUsageProfileForReference(config = {}, context = {}) {
  const keys = [config.speciesId, config.speciesName, config.displayName]
    .map((value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, ""))
    .filter(Boolean);
  for (const key of keys) {
    const profile = context.datasets?.usageLookup?.get(key)?.profile;
    if (profile) return profile;
  }
  return null;
}

function getReferenceUsageRank(config = {}, context = {}) {
  return Number(getUsageProfileForReference(config, context)?.rank || Number.MAX_SAFE_INTEGER);
}

function getMegaReferenceLimit(entries = []) {
  return entries.length;
}


function buildMegaReferenceEntries(sampleEntries = [], context = {}) {
  const groups = new Map();
  for (const entry of sampleEntries) {
    for (const megaConfig of (entry.configs || []).filter(isMegaConfig)) {
      const key = getMegaReferenceKey(megaConfig);
      const current = groups.get(key) || {megaConfig, entries: []};
      current.entries.push(entry);
      groups.set(key, current);
    }
  }
  return [...groups.values()]
    .map((group) => {
      const representative = group.entries
        .map((entry) => ({...entry, modeScore: getReferenceModeScore(entry, "mega") + Number(entry.configs.some((config) => getMegaReferenceKey(config) === getMegaReferenceKey(group.megaConfig))) * 2}))
        .sort((left, right) => right.modeScore - left.modeScore)[0];
      if (!representative) return null;
      const threatTypes = getTopReferenceThreatTypes(getMegaReferenceConfigs(group.megaConfig, group.entries), context);
      const referenceConfigs = getMegaReferenceConfigs(group.megaConfig, group.entries);
      return {
        id: `reference-mega-${getMegaReferenceKey(group.megaConfig)}`,
        archetypeId: "mega",
        subModeId: "mega",
        title: getReferenceDisplayLabel(group.megaConfig, context),
        _megaConfig: group.megaConfig,
        sampleCount: group.entries.length,
        confidence: clamp(group.entries.length / Math.max(1, sampleEntries.length), 0.12, 1),
        pca: representative.pca,
        coreMembers: getMegaReferenceCoreMembers(group.megaConfig, group.entries, context),
        pressureLabels: threatTypes.map((entry) => getTypeLabel(entry.type, context.language)),
        defensiveAnswers: getReferenceDefensiveAnswers(context.team, threatTypes, context),
        offensiveAnswers: getReferenceOffensiveAnswers(context.team, referenceConfigs, context),
        roleAnswers: getReferenceRoleAnswers(context.team, "mega", context),
        lineup: buildReferenceLineup(context.team, referenceConfigs, threatTypes, "mega", context),
      };
    })
    .filter(Boolean)
    .sort((left, right) => getReferenceUsageRank(left._megaConfig, context) - getReferenceUsageRank(right._megaConfig, context) || right.sampleCount - left.sampleCount || right.confidence - left.confidence);
}

function buildWeatherReferenceEntries(sampleEntries = [], context = {}) {
  return REFERENCE_WEATHER_IDS
    .map((weatherId) => {
      const representative = pickReferenceSampleForMode(sampleEntries, weatherId);
      if (!representative) return null;
      const threatTypes = getTopReferenceThreatTypes(representative.configs, context);
      return {
        id: `reference-weather-${weatherId}`,
        archetypeId: "weather",
        subModeId: weatherId,
        sampleCount: sampleEntries.filter((entry) => getReferenceModeScore(entry, weatherId) > 0.55).length,
        confidence: clamp(representative.modeScore / 5, 0.12, 1),
        pca: representative.pca,
        coreMembers: getReferenceCoreMembers(representative.configs, representative.vector, context),
        pressureLabels: threatTypes.map((entry) => getTypeLabel(entry.type, context.language)),
        defensiveAnswers: getReferenceDefensiveAnswers(context.team, threatTypes, context),
        offensiveAnswers: getReferenceOffensiveAnswers(context.team, representative.configs, context),
        roleAnswers: getReferenceRoleAnswers(context.team, "weather", context),
        lineup: buildReferenceLineup(context.team, representative.configs, threatTypes, "weather", context),
      };
    })
    .filter(Boolean);
}



function buildReferenceModeEntry(sampleEntries = [], archetypeId, context = {}) {
  const representative = pickReferenceSampleForMode(sampleEntries, archetypeId);
  if (!representative) return null;
  const threatTypes = getTopReferenceThreatTypes(representative.configs, context);
  const displayArchetypeId = archetypeId;
  const subModeId = archetypeId === "weather" ? getWeatherLabelId(representative.vector) : "";
  return {
    id: `reference-${displayArchetypeId}`,
    archetypeId: displayArchetypeId,
    subModeId,
    sampleCount: sampleEntries.filter((entry) => getReferenceModeScore(entry, archetypeId) > 0.55).length,
    confidence: clamp(representative.modeScore / 5, 0.12, 1),
    pca: representative.pca,
    coreMembers: getReferenceCoreMembers(representative.configs, representative.vector, context),
    pressureLabels: threatTypes.map((entry) => getTypeLabel(entry.type, context.language)),
    defensiveAnswers: getReferenceDefensiveAnswers(context.team, threatTypes, context),
    offensiveAnswers: getReferenceOffensiveAnswers(context.team, representative.configs, context),
    roleAnswers: getReferenceRoleAnswers(context.team, displayArchetypeId, context),
    lineup: buildReferenceLineup(context.team, representative.configs, threatTypes, displayArchetypeId, context),
  };
}

function buildReferenceEntry(cluster, sampleEntries = [], context = {}) {
  const representative = sampleEntries[cluster.representativeIndex];
  if (!representative) return null;
  const clusterVectors = cluster.memberIndexes.map((index) => sampleEntries[index]?.vector).filter(Boolean);
  const vector = Object.fromEntries(REFERENCE_FEATURE_KEYS.map((key) => [
    key,
    clusterVectors.reduce((sum, item) => sum + Number(item[key] || 0), 0) / Math.max(1, clusterVectors.length),
  ]));
  const archetypeId = getReferenceArchetypeId(vector);
  const threatTypes = getTopReferenceThreatTypes(representative.configs, context);
  return {
    id: `reference-${archetypeId}-${cluster.representativeIndex}`,
    archetypeId,
    sampleCount: cluster.memberIndexes.length,
    confidence: clamp(cluster.memberIndexes.length / Math.max(1, sampleEntries.length), 0.12, 1),
    pca: representative.pca,
    coreMembers: getReferenceCoreMembers(representative.configs, vector, context),
    pressureLabels: threatTypes.map((entry) => getTypeLabel(entry.type, context.language)),
    defensiveAnswers: getReferenceDefensiveAnswers(context.team, threatTypes, context),
    offensiveAnswers: getReferenceOffensiveAnswers(context.team, representative.configs, context),
    roleAnswers: getReferenceRoleAnswers(context.team, archetypeId, context),
  };
}

function summarizeReferenceTeams(team = [], library = [], context = {}) {
  const samples = selectReferenceSamples(buildReferenceSamples(library))
    .filter((configs) => configs.some((config) => !team.some((member) => member.id === config.id)));
  if (samples.length < REFERENCE_TEAM_MIN_SAMPLES) {
    return {entries: [], filters: []};
  }
  const sampleVectors = samples.map((configs) => getReferenceTeamVector(configs, context));
  const projected = projectReferenceVectors(standardizeVectors(sampleVectors.map(vectorToArray)));
  const sampleEntries = samples.map((configs, index) => ({configs, vector: sampleVectors[index], pca: projected[index] || {x: 0, y: 0}}));
  const megaOnlySamples = buildMegaReferenceSamples(library)
    .filter((configs) => configs.some((config) => !team.some((member) => member.id === config.id)));
  const megaOnlyEntries = megaOnlySamples.map((configs) => ({configs, vector: getReferenceTeamVector(configs, context), pca: {x: 0, y: 0}}));
  const modeOrder = ["mega", "weather", "trickroom", "tailwind"];
  const allMegaEntries = buildMegaReferenceEntries(mergeReferenceSampleEntries(sampleEntries, megaOnlyEntries), {...context, team});
  const megaEntries = allMegaEntries.slice(0, getMegaReferenceLimit(allMegaEntries));
  const weatherEntries = buildWeatherReferenceEntries(sampleEntries, {...context, team});
  const speedEntries = ["trickroom", "tailwind"]
    .map((archetypeId) => buildReferenceModeEntry(sampleEntries, archetypeId, {...context, team}))
    .filter(Boolean);
  const entries = [...megaEntries, ...weatherEntries, ...speedEntries].slice(0, REFERENCE_TEAM_LIMIT);
  return {
    entries,
    filters: modeOrder.filter((archetypeId) => entries.some((entry) => entry.archetypeId === archetypeId)),
  };
}

export function analyzeTeam(team, speedTiers = [], language = "zh", library = [], preferences = {}, options = {}) {
  if (!team.length) {
    return null;
  }

  const fieldState = options.fieldState || {};
  const datasets = options.datasets || null;
  const roleContext = options.roleContext || createRoleContext(library);
  const teamWithFlags = team.map((config) => ({
    ...config,
    battleFlags: getFieldFlags(config, "ally", fieldState),
  }));
  const recommendPreferences = normalizeRecommendationPreferences(preferences);
  const defensive = summarizeDefensive(teamWithFlags, language, fieldState);
  const offensive = summarizeOffensive(teamWithFlags, language, fieldState);
  const offensivePairs = summarizeOffensivePairs(teamWithFlags, language, fieldState);
  const offensiveSinglesNeutral = summarizeOffensiveSinglesNeutral(offensive);
  const blindSpots = (offensivePairs.length ? offensivePairs : offensiveSinglesNeutral).slice(0, BLIND_SPOT_PREVIEW_LIMIT);
  const structure = summarizeStructure(teamWithFlags, language);
  const speedContext = getSpeedContext(teamWithFlags, speedTiers, fieldState);
  const coverage = summarizeCoverage(
    teamWithFlags,
    blindSpots,
    language,
    library,
    speedTiers,
    speedContext,
    recommendPreferences,
    fieldState,
    datasets,
    roleContext,
  );
  const weaknesses = coverage.weakRows;
  const damageRolesByConfigId = options.damageRoles instanceof Map ? options.damageRoles : null;
  const roles = summarizeRoles(teamWithFlags, speedContext, roleContext, damageRolesByConfigId);
  const identity = summarizeTeamIdentity(teamWithFlags, speedContext, language);
  const referenceTeams = summarizeReferenceTeams(teamWithFlags, library, {
    team: teamWithFlags,
    speedTiers,
    speedContext,
    fieldState,
    roleContext,
    datasets,
    language,
  });
  return {
    fieldState,
    defensive,
    offensive,
    offensivePairs,
    offensiveSinglesNeutral,
    coverage,
    roles,
    cores: summarizeCores(teamWithFlags, weaknesses, language, {
      library,
      missingRoles: roles.missing,
      speedContext,
      fieldState,
      roleContext,
    }),
    speed: summarizeSpeed(teamWithFlags, speedTiers, language, speedContext, library, fieldState),
    speedContext,
    roleContext,
    structure,
    identity,
    weaknesses,
    blindSpots,
    referenceTeams,
  };
}
