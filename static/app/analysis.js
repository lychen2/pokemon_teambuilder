import {TYPE_CHART, TYPE_ORDER} from "./constants.js";
import {t} from "./i18n.js";
import {normalizeRecommendationPreferences} from "./recommendation-preferences.js";
import {
  ATTACK_BIAS_ORDER,
  RECOMMENDATION_ROLE_IDS,
  STRUCTURE_ROLE_ORDER,
  SUPPORT_ROLE_ORDER,
  TACTICAL_ROLE_ORDER,
  getAttackBias,
  getStructureRoles,
  getUtilityRoles,
  hasMove,
} from "./team-roles.js";
import {getTypeLabel, uniqueStrings} from "./utils.js";

const TRICK_ROOM_MOVE = "trickroom";
const SPEED_MODE_STANDARD = "standard";
const SPEED_MODE_TRICK_ROOM = "trickroom";
const SPEED_MODE_HYBRID = "hybrid";
const SPEED_PREVIEW_LIMIT = 3;
const THREAT_PREVIEW_LIMIT = 3;
const SUPER_EFFECTIVE_THRESHOLD = 2;
const BLIND_SPOT_THRESHOLD = 0.5;
const SINGLE_TYPE_NEUTRAL_THRESHOLD = 1;
const WEAKNESS_AVERAGE_THRESHOLD = 1.15;
const MAX_SUGGESTED_COVERS = 3;
const CORE_PREVIEW_LIMIT = 4;
const CORE_RISK_LIMIT = 3;
const DEFENSIVE_TYPE_PAIRS = buildDefensiveTypePairs();
const PARTNER_TYPE_COMBOS = buildPartnerTypeCombos();

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

export function getSpeedContext(team = [], speedTiers = []) {
  const medianSpeed = getMedianSpeed(speedTiers);
  const setterCount = team.filter((config) => hasMove(config, TRICK_ROOM_MOVE)).length;
  const slowCount = team.filter((config) => (config.stats?.spe || 0) <= medianSpeed).length;
  const fastCount = team.length - slowCount;
  if (setterCount && slowCount >= fastCount) {
    return {mode: SPEED_MODE_TRICK_ROOM, medianSpeed, setterCount};
  }
  if (setterCount) {
    return {mode: SPEED_MODE_HYBRID, medianSpeed, setterCount};
  }
  return {mode: SPEED_MODE_STANDARD, medianSpeed, setterCount};
}

export function getResistanceProfile(types = []) {
  return Object.fromEntries(
    TYPE_ORDER.map((attackType) => {
      return [attackType, getAttackMultiplier(attackType, types)];
    }),
  );
}

export function getCoverageProfile(moveTypes = []) {
  return Object.fromEntries(
    TYPE_ORDER.map((defendType) => {
      return [defendType, getBestAttackMultiplier(moveTypes, [defendType])];
    }),
  );
}

function getAttackMultiplier(attackType, defendTypes = []) {
  return defendTypes.reduce((total, defendType) => {
    const next = TYPE_CHART[attackType]?.[defendType];
    return total * (next ?? 1);
  }, 1);
}

function getBestAttackMultiplier(attackTypes = [], defendTypes = []) {
  return attackTypes.reduce(
    (maxValue, attackType) => Math.max(maxValue, getAttackMultiplier(attackType, defendTypes)),
    0,
  );
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

function summarizeDefensiveMatrix(team, language) {
  return TYPE_ORDER.map((attackType) => {
    const members = team.map((config) => ({
      member: createMemberReference(config),
      multiplier: getResistanceProfile(config.types)[attackType] ?? 1,
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

function summarizeDefensive(team, language) {
  return summarizeDefensiveMatrix(team, language).map((entry) => ({
    type: entry.type,
    label: entry.label,
    average: entry.average,
    weakCount: entry.weakCount,
    resistCount: entry.resistCount,
    immuneCount: entry.immuneCount,
  }));
}

function summarizeOffensiveMatrix(team, language) {
  return TYPE_ORDER.map((defendType) => {
    const members = team.map((config) => ({
      member: createMemberReference(config),
      effectiveness: getCoverageProfile(config.offensiveTypes || [])[defendType] || 0,
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

function summarizeOffensive(team, language) {
  return summarizeOffensiveMatrix(team, language).map((entry) => ({
    type: entry.type,
    label: entry.label,
    effectiveness: entry.bestEffectiveness,
  }));
}

function summarizeOffensivePairs(team, language) {
  const teamMoveTypes = uniqueStrings(team.flatMap((config) => config.offensiveTypes || []));
  return DEFENSIVE_TYPE_PAIRS
    .map((types) => ({
      types,
      label: types.map((type) => getTypeLabel(type, language)).join(" / "),
      effectiveness: getBestAttackMultiplier(teamMoveTypes, types),
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
  return {
    id: config.id,
    label: config.displayName || config.speciesName || t("zh", "common.unknown"),
    note: "",
    speed: config.stats?.spe || 0,
  };
}

function getSuggestedSpeedScore(candidate, speedContext, speedTiers = []) {
  const medianSpeed = getMedianSpeed(speedTiers);
  const candidateSpeed = Number(candidate.stats?.spe || 0);
  const topSpeed = getThreatSpeed(candidate);
  if (speedContext.mode === SPEED_MODE_TRICK_ROOM) {
    return candidateSpeed <= medianSpeed ? 2.5 : hasMove(candidate, TRICK_ROOM_MOVE) ? 2 : 0;
  }
  if (speedContext.mode === SPEED_MODE_HYBRID) {
    return topSpeed >= medianSpeed ? 1.5 : hasMove(candidate, TRICK_ROOM_MOVE) ? 1 : 0.5;
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
  const profile = getResistanceProfile(candidate.types);
  const candidateRoles = getUtilityRoles(candidate)
    .filter((roleId) => RECOMMENDATION_ROLE_IDS.includes(roleId));
  const missingRoles = candidateRoles.filter((roleId) => !context.teamRoles.has(roleId));
  const duplicateTypes = (candidate.types || []).filter((type) => context.teamTypes.has(type)).length;
  const focusMultiplier = profile[context.attackType] ?? 1;
  const weaknessHelp = context.weaknessTypes.filter((type) => (profile[type] ?? 1) < 1);
  const score = (
    getFocusPatchScore(focusMultiplier) * (context.preferences.patchWeakness ? 1.4 : 0.8)
    + weaknessHelp.length * 1.25
    + missingRoles.length * (context.preferences.patchRoles ? 1.4 : 0.6)
    + getSuggestedSpeedScore(candidate, context.speedContext, context.speedTiers) * (context.preferences.patchSpeed ? 1.2 : 0.5)
    - duplicateTypes * (context.preferences.avoidDuplicateTypes ? 1.4 : 0.5)
  );
  return {
    id: candidate.id,
    displayName: candidate.displayName || candidate.speciesName || t(context.language, "common.unknown"),
    note: candidate.note || "",
    resistance: focusMultiplier,
    coveredWeaknesses: weaknessHelp.map((type) => getTypeLabel(type, context.language)),
    roleIds: missingRoles.slice(0, 3),
    duplicateTypes,
    score,
  };
}

function buildSuggestedCoversByType(team, weakRows, library, language, speedTiers, speedContext, preferences) {
  const currentSpecies = new Set(team.map((config) => config.speciesId));
  const teamTypes = new Set(team.flatMap((config) => config.types || []));
  const teamRoles = new Set(
    team.flatMap((config) => getUtilityRoles(config))
      .filter((roleId) => RECOMMENDATION_ROLE_IDS.includes(roleId)),
  );
  const weaknessTypes = weakRows.map((entry) => entry.type);
  return Object.fromEntries(weakRows.map((row) => {
    const context = {attackType: row.type, language, preferences, speedContext, speedTiers, teamRoles, teamTypes, weaknessTypes};
    const entries = library
      .filter((candidate) => !currentSpecies.has(candidate.speciesId))
      .map((candidate) => buildSuggestedCoverEntry(candidate, context))
      .sort((left, right) => (
        right.score - left.score
        || left.resistance - right.resistance
        || left.duplicateTypes - right.duplicateTypes
      ));
    const resistEntries = entries.filter((entry) => entry.resistance < 1);
    return [row.type, (resistEntries.length ? resistEntries : entries).slice(0, MAX_SUGGESTED_COVERS)];
  }));
}

function summarizeCoverage(team, language, library, speedTiers, speedContext, preferences) {
  const defensiveMatrix = summarizeDefensiveMatrix(team, language);
  const offensiveMatrix = summarizeOffensiveMatrix(team, language);
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
  );
  const defensiveRows = defensiveMatrix.map((entry) => ({
    ...entry,
    suggestedCovers: suggestedCoversByType[entry.type] || [],
  }));
  return {
    rows: offensiveMatrix,
    defensiveMatrix: defensiveRows,
    offensiveMatrix,
    weakRows: defensiveRows.filter((entry) => entry.average > WEAKNESS_AVERAGE_THRESHOLD).slice(0, 6),
    suggestedCoversByType,
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
    speed: tier.speed,
    label: entry.speciesName || entry.displayName || entry.speciesLabel || t(language, "common.unknown"),
    note: entry.note || "",
  };
}

function getThreatSpeed(candidate) {
  return Math.max(
    Number(candidate.stats?.spe || 0),
    Number(candidate.plusOneSpeed?.speed || 0),
    Number(candidate.choiceScarfSpeed?.speed || 0),
  );
}

function summarizePressureThreats(config, library = [], selectedSpeciesIds = new Set(), language = "zh") {
  const memberSpeed = Number(config.stats?.spe || 0);
  return library
    .filter((candidate) => (
      candidate.id !== config.id
      && candidate.speciesId !== config.speciesId
      && !selectedSpeciesIds.has(candidate.speciesId)
    ))
    .map((candidate) => ({
      label: candidate.speciesName || candidate.displayName || t(language, "common.unknown"),
      note: candidate.note || "",
      speed: getThreatSpeed(candidate),
      effectiveness: getBestAttackMultiplier(candidate.offensiveTypes || [], config.types || []),
    }))
    .filter((candidate) => candidate.speed > memberSpeed && candidate.effectiveness >= SUPER_EFFECTIVE_THRESHOLD)
    .sort((left, right) => (
      right.effectiveness - left.effectiveness
      || left.speed - right.speed
      || left.label.localeCompare(right.label, "zh-Hans-CN")
    ))
    .slice(0, THREAT_PREVIEW_LIMIT);
}

function summarizeSpeed(team, speedTiers, language, speedContext, library) {
  const sortedSpeedTiers = getSortedSpeedTiers(speedTiers);
  const selectedSpeciesIds = new Set(team.map((config) => config.speciesId).filter(Boolean));
  return [...team]
    .sort((left, right) => (right.stats?.spe || 0) - (left.stats?.spe || 0))
    .map((config) => {
      const speed = config.stats?.spe || 0;
      const slowerTiers = sortedSpeedTiers.filter((tier) => tier.speed < speed);
      const fasterTiers = sortedSpeedTiers.filter((tier) => tier.speed > speed);
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
        pressureThreats: summarizePressureThreats(config, library, selectedSpeciesIds, language),
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

function summarizeRoles(team, speedContext) {
  const tactical = TACTICAL_ROLE_ORDER.map((roleId) => {
    const members = summarizeRoleMembers(team, roleId, getUtilityRoles);
    return {id: roleId, count: members.length, members};
  });
  const support = SUPPORT_ROLE_ORDER.map((roleId) => {
    const members = summarizeRoleMembers(team, roleId, getUtilityRoles);
    return {id: roleId, count: members.length, members};
  });
  const structure = STRUCTURE_ROLE_ORDER.map((roleId) => {
    const members = summarizeRoleMembers(team, roleId, getStructureRoles);
    return {id: roleId, count: members.length, members};
  });
  const attackBiases = ATTACK_BIAS_ORDER.map((roleId) => {
    const members = summarizeRoleMembers(team, roleId, (config) => [getAttackBias(config)]);
    return {id: roleId, count: members.length, members};
  });
  const requiredRolesByMode = {
    [SPEED_MODE_STANDARD]: ["speedcontrol", "fakeout", "pivot", "disruption", "recovery"],
    [SPEED_MODE_TRICK_ROOM]: ["trickroom", "fakeout", "redirection", "recovery", "tank"],
    [SPEED_MODE_HYBRID]: ["speedcontrol", "trickroom", "fakeout", "pivot", "disruption"],
  };
  const allRoleEntries = [...tactical, ...support, ...structure];
  const requiredRoles = requiredRolesByMode[speedContext.mode] || requiredRolesByMode[SPEED_MODE_STANDARD];
  return {
    tactical,
    support,
    structure,
    attackBiases,
    missing: allRoleEntries.filter((entry) => requiredRoles.includes(entry.id) && entry.count === 0).map((entry) => entry.id),
    filledUtilityCount: [...tactical, ...support].filter((entry) => entry.count > 0).length,
  };
}

function getPairEntries(team) {
  const pairs = [];
  for (let leftIndex = 0; leftIndex < team.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < team.length; rightIndex += 1) {
      pairs.push([team[leftIndex], team[rightIndex]]);
    }
  }
  return pairs;
}

function countPairPatches(pair, typeList = TYPE_ORDER) {
  return typeList.filter((type) => {
    const multipliers = pair.map((config) => getResistanceProfile(config.types)[type] ?? 1);
    return multipliers.some((value) => value > 1) && multipliers.some((value) => value < 1);
  }).length;
}

function countPairImmunityPatches(pair) {
  return TYPE_ORDER.filter((type) => {
    const multipliers = pair.map((config) => getResistanceProfile(config.types)[type] ?? 1);
    return multipliers.some((value) => value > 1) && multipliers.some((value) => value === 0);
  }).length;
}

function countSharedWeaknesses(pair) {
  return TYPE_ORDER.filter((type) => {
    return pair.every((config) => (getResistanceProfile(config.types)[type] ?? 1) > 1);
  }).length;
}

function countSingleCoverage(attackTypes = []) {
  return TYPE_ORDER.filter((defendType) => getBestAttackMultiplier(attackTypes, [defendType]) >= SUPER_EFFECTIVE_THRESHOLD).length;
}

function countDualCoverage(attackTypes = []) {
  return DEFENSIVE_TYPE_PAIRS.filter((types) => getBestAttackMultiplier(attackTypes, types) >= SUPER_EFFECTIVE_THRESHOLD).length;
}

function getPairRoles(pair) {
  return uniqueStrings(
    pair.flatMap((config) => getUtilityRoles(config))
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
    + entry.roles.length * 0.75
    - entry.sharedWeaknesses * 2.2
  );
}

function getWeaknessTypes(types = []) {
  return TYPE_ORDER.filter((type) => getAttackMultiplier(type, types) > 1);
}

function buildPartnerSuggestion(member, team, language) {
  const weaknessTypes = getWeaknessTypes(member.types || []);
  const otherMembers = team.filter((config) => config.id !== member.id);
  const coveredByTeam = weaknessTypes
    .map((type) => ({
      type,
      label: getTypeLabel(type, language),
      members: otherMembers
        .filter((config) => getAttackMultiplier(type, config.types || []) < 1)
        .map(createMemberReference),
    }))
    .filter((entry) => entry.members.length);
  const suggestions = PARTNER_TYPE_COMBOS
    .map((types) => {
      const covered = weaknessTypes.filter((type) => getAttackMultiplier(type, types) < 1);
      const immune = weaknessTypes.filter((type) => getAttackMultiplier(type, types) === 0);
      const partnerWeaknesses = getWeaknessTypes(types);
      const synergy = partnerWeaknesses.filter((type) => getAttackMultiplier(type, member.types || []) < 1).length;
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

function summarizePartnerSuggestions(team, language) {
  const suggestionsById = Object.fromEntries(
    team.map((member) => [member.id, buildPartnerSuggestion(member, team, language)]),
  );
  return {
    memberOptions: team.map(createMemberReference),
    suggestionsById,
  };
}

function buildCoreEntry(pair, weaknessTypes) {
  const attackTypes = uniqueStrings(pair.flatMap((config) => config.offensiveTypes || []));
  const entry = {
    members: pair.map(createMemberReference),
    roles: getPairRoles(pair),
    teamWeaknessPatches: countPairPatches(pair, weaknessTypes),
    patchedWeaknesses: countPairPatches(pair),
    immunityPatches: countPairImmunityPatches(pair),
    sharedWeaknesses: countSharedWeaknesses(pair),
    singleCoverageCount: countSingleCoverage(attackTypes),
    pairCoverageCount: countDualCoverage(attackTypes),
  };
  return {...entry, score: scoreCoreEntry(entry)};
}

function summarizeCores(team, weaknesses = [], language = "zh") {
  if (team.length < 2) {
    return {bestPairs: [], riskyPairs: [], memberOptions: [], suggestionsById: {}};
  }

  const weaknessTypes = weaknesses.map((entry) => entry.type);
  const pairs = getPairEntries(team).map((pair) => buildCoreEntry(pair, weaknessTypes));
  const bestPairs = [...pairs]
    .sort((left, right) => right.score - left.score || left.sharedWeaknesses - right.sharedWeaknesses)
    .slice(0, CORE_PREVIEW_LIMIT);
  const riskyPairs = pairs
    .filter((entry) => entry.sharedWeaknesses > 0)
    .sort((left, right) => right.sharedWeaknesses - left.sharedWeaknesses || left.score - right.score)
    .slice(0, CORE_RISK_LIMIT);
  return {
    bestPairs,
    riskyPairs,
    ...summarizePartnerSuggestions(team, language),
  };
}

export function analyzeTeam(team, speedTiers = [], language = "zh", library = [], preferences = {}) {
  if (!team.length) {
    return null;
  }

  const recommendPreferences = normalizeRecommendationPreferences(preferences);
  const defensive = summarizeDefensive(team, language);
  const offensive = summarizeOffensive(team, language);
  const offensivePairs = summarizeOffensivePairs(team, language);
  const offensiveSinglesNeutral = summarizeOffensiveSinglesNeutral(offensive);
  const structure = summarizeStructure(team, language);
  const speedContext = getSpeedContext(team, speedTiers);
  const coverage = summarizeCoverage(team, language, library, speedTiers, speedContext, recommendPreferences);
  const weaknesses = coverage.weakRows;
  const blindSpots = (offensivePairs.length ? offensivePairs : offensiveSinglesNeutral).slice(0, 8);
  return {
    defensive,
    offensive,
    offensivePairs,
    offensiveSinglesNeutral,
    coverage,
    roles: summarizeRoles(team, speedContext),
    cores: summarizeCores(team, weaknesses, language),
    speed: summarizeSpeed(team, speedTiers, language, speedContext, library),
    speedContext,
    structure,
    weaknesses,
    blindSpots,
  };
}
