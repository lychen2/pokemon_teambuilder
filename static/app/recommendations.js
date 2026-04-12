import {getScaledAbilityScore} from "./ability-scores.js";
import {SCORE_WEIGHTS, TYPE_ORDER} from "./constants.js";
import {analyzeTeam, getCoverageProfile, getResistanceProfile} from "./analysis.js";
import {buildSpeciesTemplateConfigs} from "./champions-vgc.js";
import {t} from "./i18n.js";
import {normalizeRecommendationPreferences} from "./recommendation-preferences.js";
import {RECOMMENDATION_ROLE_IDS, getAttackBias, getUtilityRoles, hasMove} from "./team-roles.js";
import {clamp, getTypeLabel, isMegaConfig} from "./utils.js";

const SUPPORT_MOVES_PER_MEMBER_TARGET = 1.5;
const THREAT_COVER_SCORE = 3;
const THREAT_IMMUNITY_SCORE = 4;
const TEAM_PATCH_SCORE = 1.5;
const SHARED_TYPE_PENALTY = 1.2;
const MISSING_ROLE_SCORE = 1.2;
const OFFENSE_BALANCE_SCORE = 1.5;
const SUPPORT_BIAS_SCORE = 1;
const NEW_TYPE_SCORE = 0.5;
const DUPLICATE_TYPE_PENALTY = 0.4;
const TRICK_ROOM_SETTER_BONUS = 1.5;
const HYBRID_TRICK_ROOM_BONUS = 0.75;
const TRICK_ROOM_BASE_WEIGHT = 4.5;
const FOCUS_TYPE_PATCH_BONUS = 5;
const FOCUS_TYPE_IMMUNITY_BONUS = 6;
const FOCUS_TYPE_WEAKNESS_PENALTY = 3;
const MAX_TEAM_MEGAS = 2;
const QUALITY_DAMAGE_PRODUCT_REFERENCE = 46000;
const QUALITY_SPEED_EXTREME_ANCHOR = 240;
const QUALITY_SPEED_EXTREME_REFERENCE = 220;
const QUALITY_PRIMARY_OFFENSE_REFERENCE = 220;
const QUALITY_PHYSICAL_BULK_REFERENCE = 38000;
const QUALITY_SPECIAL_BULK_REFERENCE = 38000;
const QUALITY_OFFENSE_CAP = 1.3;
const QUALITY_PHYSICAL_BULK_CAP = 0.55;
const QUALITY_SPECIAL_BULK_CAP = 0.55;
const QUALITY_SPEED_CAP = 0.7;
const QUALITY_ABILITY_CAP = 0.45;
const QUALITY_ROLE_CAP = 0.8;
const QUALITY_MOVE_CAP = 0.6;
const QUALITY_KEYS = Object.freeze(["hp", "atk", "def", "spa", "spd", "spe"]);

function countCoveredEntries(speedTiers, predicate) {
  return speedTiers.filter(predicate).reduce((sum, tier) => sum + tier.totalCount, 0);
}

function getThreatTypes(analysis) {
  const pressureTypes = analysis.defensive
    .filter((entry) => entry.weakCount > entry.resistCount + entry.immuneCount)
    .map((entry) => entry.type);
  if (pressureTypes.length) {
    return pressureTypes;
  }
  return analysis.weaknesses.map((entry) => entry.type);
}

function getCoverSummary(candidate, analysis) {
  const profile = getResistanceProfile(candidate.types);
  const threatTypes = getThreatTypes(analysis);
  const teamWeaknessTypes = analysis.weaknesses.map((entry) => entry.type);
  return {
    threatTypes,
    coveredThreats: threatTypes.filter((type) => (profile[type] ?? 1) < 1),
    immuneThreats: threatTypes.filter((type) => (profile[type] ?? 1) === 0),
    patchedWeaknesses: teamWeaknessTypes.filter((type) => (profile[type] ?? 1) < 1),
  };
}

function scoreResistance(candidate, analysis, preferences, focusType = "") {
  const profile = getResistanceProfile(candidate.types);
  const coverSummary = getCoverSummary(candidate, analysis);
  const total = analysis.weaknesses.reduce((score, weakness) => {
    const multiplier = profile[weakness.type] ?? 1;
    if (multiplier === 0) return score + THREAT_IMMUNITY_SCORE;
    if (multiplier <= 0.25) return score + 3;
    if (multiplier <= 0.5) return score + THREAT_COVER_SCORE;
    if (multiplier >= 2) return score - 1;
    return score;
  }, 0) + (
    coverSummary.coveredThreats.length
      * TEAM_PATCH_SCORE
      * (preferences.patchWeakness ? 1.25 : 0.8)
  );
  const focusMultiplier = focusType ? (profile[focusType] ?? 1) : 1;
  const focusBonus = focusType
    ? focusMultiplier === 0
      ? FOCUS_TYPE_IMMUNITY_BONUS
      : focusMultiplier < 1
        ? FOCUS_TYPE_PATCH_BONUS
        : focusMultiplier > 1
          ? -FOCUS_TYPE_WEAKNESS_PENALTY
          : 0
    : 0;
  return clamp(total + focusBonus, 0, SCORE_WEIGHTS.resistance);
}

function scoreCoverage(candidate, analysis) {
  const current = Object.fromEntries(analysis.offensive.map((entry) => [entry.type, entry.effectiveness]));
  const next = getCoverageProfile(candidate.offensiveTypes || []);
  const total = TYPE_ORDER.reduce((score, type) => {
    if ((next[type] || 0) <= (current[type] || 0)) return score;
    if ((current[type] || 0) <= 1 && (next[type] || 0) >= 2) return score + 2;
    if ((current[type] || 0) < 4 && (next[type] || 0) === 4) return score + 1.5;
    return score + 1;
  }, 0);
  return clamp(total, 0, SCORE_WEIGHTS.coverage);
}

function scoreStandardSpeed(candidate, speedTiers) {
  const totalCount = speedTiers.reduce((sum, tier) => sum + tier.totalCount, 0);
  if (!totalCount) return 0;
  const speeds = [
    candidate.stats?.spe || 0,
    candidate.plusOneSpeed?.speed || 0,
    candidate.choiceScarfSpeed?.speed || 0,
  ].filter(Boolean);
  const bestCoverage = speeds.reduce((best, speed) => {
    const coveredCount = countCoveredEntries(speedTiers, (tier) => tier.speed < speed);
    return Math.max(best, coveredCount / totalCount);
  }, 0);
  return clamp(bestCoverage * SCORE_WEIGHTS.speed, 0, SCORE_WEIGHTS.speed);
}

function scoreTrickRoomSpeed(candidate, speedTiers) {
  const totalCount = speedTiers.reduce((sum, tier) => sum + tier.totalCount, 0);
  if (!totalCount) return 0;
  const coveredCount = countCoveredEntries(speedTiers, (tier) => tier.speed > (candidate.stats?.spe || 0));
  return clamp((coveredCount / totalCount) * TRICK_ROOM_BASE_WEIGHT, 0, TRICK_ROOM_BASE_WEIGHT);
}

function applyWeightPreference(value, enabled, weightValue) {
  const toggleFactor = enabled ? 1.25 : 0.8;
  const sliderFactor = Math.max(0, Number(weightValue || 0)) / 100;
  return value * toggleFactor * sliderFactor;
}

function scoreSpeed(candidate, speedTiers, analysis, preferences, weights) {
  const standardScore = scoreStandardSpeed(candidate, speedTiers);
  const trickRoomScore = scoreTrickRoomSpeed(candidate, speedTiers);
  const isTrickRoomSetter = hasMove(candidate, "trickroom");
  const weight = Math.max(0, Number(weights.patchSpeed || 0)) / 100;
  if (analysis.speedContext.mode === "trickroom") {
    return clamp((trickRoomScore + (isTrickRoomSetter ? TRICK_ROOM_SETTER_BONUS : 0)) * (preferences.patchSpeed ? 1.25 : 0.8) * weight, 0, SCORE_WEIGHTS.speed);
  }
  if (analysis.speedContext.mode === "hybrid") {
    return clamp((((standardScore + trickRoomScore) / 2) + (isTrickRoomSetter ? HYBRID_TRICK_ROOM_BONUS : 0)) * (preferences.patchSpeed ? 1.25 : 0.8) * weight, 0, SCORE_WEIGHTS.speed);
  }
  return clamp(standardScore * (preferences.patchSpeed ? 1.25 : 0.8) * weight, 0, SCORE_WEIGHTS.speed);
}

function scoreSynergy(team, candidate, analysis, preferences, weights) {
  const teamTypes = new Set(team.flatMap((member) => member.types || []));
  const teamRoles = new Set(team.flatMap((member) => getUtilityRoles(member)).filter((roleId) => RECOMMENDATION_ROLE_IDS.includes(roleId)));
  const candidateRoles = getUtilityRoles(candidate).filter((roleId) => RECOMMENDATION_ROLE_IDS.includes(roleId));
  const candidateBias = getAttackBias(candidate);
  const coverSummary = getCoverSummary(candidate, analysis);
  const needsSpecial = analysis.structure.physical > analysis.structure.special + 2;
  const needsPhysical = analysis.structure.special > analysis.structure.physical + 2;
  const supportTarget = team.length * SUPPORT_MOVES_PER_MEMBER_TARGET;
  const balanceScore = (
    (needsSpecial && candidateBias === "special")
    || (needsPhysical && candidateBias === "physical")
    || ((needsSpecial || needsPhysical) && candidateBias === "mixed")
  ) ? OFFENSE_BALANCE_SCORE : 0;
  const supportScore = analysis.structure.support < supportTarget && candidateBias === "support"
    ? SUPPORT_BIAS_SCORE
    : 0;
  const newTypes = (candidate.types || []).filter((type) => !teamTypes.has(type)).length;
  const duplicateTypes = (candidate.types || []).filter((type) => teamTypes.has(type)).length;
  const missingRoles = candidateRoles.filter((role) => !teamRoles.has(role)).length;
  const roleWeight = applyWeightPreference(MISSING_ROLE_SCORE, preferences.patchRoles, weights.patchRoles);
  const duplicatePenalty = applyWeightPreference(DUPLICATE_TYPE_PENALTY, preferences.avoidDuplicateTypes, weights.avoidDuplicateTypes);
  const sharedPenalty = applyWeightPreference(SHARED_TYPE_PENALTY, preferences.avoidDuplicateTypes, weights.avoidDuplicateTypes);
  const total = (
    coverSummary.coveredThreats.length * 1.5
    + missingRoles * roleWeight
    + balanceScore
    + supportScore
    + newTypes * NEW_TYPE_SCORE
    - duplicateTypes * duplicatePenalty
    - ((duplicateTypes && !coverSummary.coveredThreats.length) ? sharedPenalty : 0)
  );
  return clamp(total, 0, SCORE_WEIGHTS.synergy);
}

function getStatsTotal(stats = {}) {
  return QUALITY_KEYS.reduce((sum, stat) => sum + Number(stats[stat] || 0), 0);
}

function getPrimaryOffenseValue(stats = {}) {
  return Math.max(Number(stats.atk || 0), Number(stats.spa || 0));
}

function getExtremeSpeedValue(speedValue) {
  return Math.max(speedValue, Math.max(0, QUALITY_SPEED_EXTREME_ANCHOR - speedValue));
}

function scaleQualityPart(value, reference, cap) {
  if (!Number.isFinite(value) || value <= 0 || !reference) {
    return 0;
  }
  return clamp((value / reference) * cap, 0, cap);
}

function getCandidateAbilityQuality(candidate) {
  if (candidate.ability) {
    return getScaledAbilityScore(candidate.ability, QUALITY_ABILITY_CAP, QUALITY_ABILITY_CAP * -0.4);
  }
  const legalAbilities = [...new Set(Object.values(candidate.abilities || {}).filter(Boolean))];
  if (!legalAbilities.length) {
    return 0;
  }
  return legalAbilities.reduce((bestScore, abilityName) => (
    Math.max(bestScore, getScaledAbilityScore(abilityName, QUALITY_ABILITY_CAP, QUALITY_ABILITY_CAP * -0.4))
  ), QUALITY_ABILITY_CAP * -0.4);
}

function buildQualityBreakdown(candidate) {
  const battleStats = candidate.stats || candidate.baseStats || {};
  const hpValue = Number(battleStats.hp || 0);
  const offenseValue = getPrimaryOffenseValue(battleStats);
  const speedValue = Number(battleStats.spe || 0);
  const physicalBulkValue = hpValue * Number(battleStats.def || 0);
  const specialBulkValue = hpValue * Number(battleStats.spd || 0);
  const extremeSpeedValue = getExtremeSpeedValue(speedValue);
  const damageValue = offenseValue * extremeSpeedValue;
  const utilityRoles = getUtilityRoles(candidate).length;
  const output = (
    scaleQualityPart(damageValue, QUALITY_DAMAGE_PRODUCT_REFERENCE, QUALITY_OFFENSE_CAP * 0.75)
    + scaleQualityPart(offenseValue, QUALITY_PRIMARY_OFFENSE_REFERENCE, QUALITY_OFFENSE_CAP * 0.25)
  );
  const physicalBulk = scaleQualityPart(physicalBulkValue, QUALITY_PHYSICAL_BULK_REFERENCE, QUALITY_PHYSICAL_BULK_CAP);
  const specialBulk = scaleQualityPart(specialBulkValue, QUALITY_SPECIAL_BULK_REFERENCE, QUALITY_SPECIAL_BULK_CAP);
  const speedFlex = scaleQualityPart(extremeSpeedValue, QUALITY_SPEED_EXTREME_REFERENCE, QUALITY_SPEED_CAP);
  const ability = getCandidateAbilityQuality(candidate);
  const utility = clamp(utilityRoles * 0.16, 0, QUALITY_ROLE_CAP);
  const moves = clamp(((candidate.moves || []).length / 4) * QUALITY_MOVE_CAP, 0, QUALITY_MOVE_CAP);
  const templateFloor = candidate.source === "template" ? 1.5 : 0;
  const total = clamp(
    Math.max(output + physicalBulk + specialBulk + speedFlex + ability + utility + moves, templateFloor),
    0,
    SCORE_WEIGHTS.quality,
  );
  return {
    total,
    parts: {output, physicalBulk, specialBulk, speedFlex, ability, utility, moves},
    totals: {
      base: getStatsTotal(candidate.baseStats || {}),
      battle: getStatsTotal(battleStats),
      damage: Math.round(damageValue),
      physicalBulk: Math.round(physicalBulkValue),
      specialBulk: Math.round(specialBulkValue),
    },
  };
}

function buildReasons(candidate, breakdown, language, analysis, focusType = "") {
  const coverSummary = getCoverSummary(candidate, analysis);
  const reasons = [];
  const focusMultiplier = focusType ? (getResistanceProfile(candidate.types)[focusType] ?? 1) : 1;
  if (focusType && focusMultiplier < 1) {
    reasons.push(t(language, "recommend.reason.focusType", {value: getTypeLabel(focusType, language)}));
  }
  if (coverSummary.coveredThreats.length) {
    reasons.push(t(language, "recommend.reason.coverThreats", {
      value: coverSummary.coveredThreats.map((type) => getTypeLabel(type, language)).join(" / "),
    }));
  }
  if (breakdown.resistance >= 4) reasons.push(t(language, "recommend.reason.resistance"));
  if (breakdown.coverage >= 4) reasons.push(t(language, "recommend.reason.coverage"));
  if (breakdown.speed >= 3) {
    reasons.push(
      analysis.speedContext.mode === "trickroom" && (hasMove(candidate, "trickroom") || (candidate.stats?.spe || 0) <= analysis.speedContext.medianSpeed)
        ? t(language, "recommend.reason.trickRoom", {speed: candidate.stats?.spe || 0})
        : t(language, "recommend.reason.speed", {speed: candidate.stats?.spe || 0}),
    );
  }
  if (breakdown.synergy >= 2) reasons.push(t(language, "recommend.reason.synergy"));
  if (breakdown.quality >= 2) reasons.push(t(language, "recommend.reason.quality"));
  return reasons.length ? reasons : [t(language, "recommend.reason.balance")];
}

function buildPenalties(candidate, team, analysis, language, focusType = "") {
  const teamTypes = new Set(team.flatMap((member) => member.types || []));
  const duplicateTypes = (candidate.types || []).filter((type) => teamTypes.has(type));
  const penalties = [];
  if (duplicateTypes.length) {
    penalties.push(t(language, "recommend.penalty.duplicateTypes", {
      value: duplicateTypes.map((type) => getTypeLabel(type, language)).join(" / "),
    }));
  }
  if (focusType && (getResistanceProfile(candidate.types)[focusType] ?? 1) > 1) {
    penalties.push(t(language, "recommend.penalty.focusWeak", {value: getTypeLabel(focusType, language)}));
  }
  if (analysis.weaknesses.length && !getCoverSummary(candidate, analysis).coveredThreats.length) {
    penalties.push(t(language, "recommend.penalty.noPatch"));
  }
  return penalties.slice(0, 2);
}

function buildRecommendationEntry(candidate, team, analysis, speedTiers, language, preferences, weights, focusType = "") {
  const coverSummary = getCoverSummary(candidate, analysis);
  const qualityBreakdown = buildQualityBreakdown(candidate);
  const breakdown = {
    resistance: clamp(
      scoreResistance(candidate, analysis, preferences, focusType)
      * (Math.max(0, Number(weights.patchWeakness || 0)) / 100),
      0,
      SCORE_WEIGHTS.resistance,
    ),
    coverage: scoreCoverage(candidate, analysis),
    speed: scoreSpeed(candidate, speedTiers, analysis, preferences, weights),
    synergy: scoreSynergy(team, candidate, analysis, preferences, weights),
    quality: qualityBreakdown.total,
  };
  const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  return {
    ...candidate,
    recommendationKey: `${candidate.source || "library"}:${candidate.id}`,
    recommendationScore: score,
    coveredThreats: coverSummary.coveredThreats,
    breakdown,
    qualityBreakdown,
    reasons: buildReasons(candidate, breakdown, language, analysis, focusType),
    penalties: buildPenalties(candidate, team, analysis, language, focusType),
    weaknessHelp: coverSummary.coveredThreats.length
      ? coverSummary.coveredThreats.map((type) => getTypeLabel(type, language)).slice(0, 3)
      : analysis.weaknesses.map((entry) => {
        const multiplier = getResistanceProfile(candidate.types)[entry.type] ?? 1;
        return `${getTypeLabel(entry.type, language)} ${multiplier}x`;
      }).slice(0, 3),
  };
}

function buildTemplateRecommendations(library, team, datasets, analysis, speedTiers, language, preferences, weights, focusType = "") {
  if (!datasets?.availableSpecies?.length) {
    return [];
  }
  const configuredSpecies = new Set(library.map((config) => config.speciesId));
  const currentSpecies = new Set(team.map((config) => config.speciesId));
  return datasets.availableSpecies
    .filter((species) => !configuredSpecies.has(species.speciesId) && !currentSpecies.has(species.speciesId))
    .map((species) => {
      const templates = buildSpeciesTemplateConfigs(species, datasets, language);
      if (!templates.length) {
        return null;
      }
      const bestTemplate = templates
        .map((template) => buildRecommendationEntry(template, team, analysis, speedTiers, language, preferences, weights, focusType))
        .sort((left, right) => right.recommendationScore - left.recommendationScore)[0];
      if (!bestTemplate) {
        return null;
      }
      return {
        ...bestTemplate,
        recommendationSource: "template",
        recommendationAction: "configure",
      };
    })
    .filter(Boolean);
}

export function recommendConfigs(library, team, speedTiers, language = "zh", options = {}) {
  if (!team.length || team.length >= 6) {
    return [];
  }

  const recommendPreferences = normalizeRecommendationPreferences(options.preferences);
  const recommendWeights = options.weights || {};
  const focusType = options.focusType || "";
  const analysis = analyzeTeam(team, speedTiers, language, library, recommendPreferences);
  const currentSpecies = new Set(team.map((config) => config.speciesId));
  const dismissedKeys = new Set(options.dismissedKeys || []);
  const megaCount = team.filter((member) => isMegaConfig(member)).length;
  const configuredRecommendations = library
    .filter((candidate) => !currentSpecies.has(candidate.speciesId))
    .filter((candidate) => !(megaCount >= MAX_TEAM_MEGAS && isMegaConfig(candidate)))
    .map((candidate) => ({
      ...buildRecommendationEntry(candidate, team, analysis, speedTiers, language, recommendPreferences, recommendWeights, focusType),
      recommendationSource: "library",
      recommendationAction: "add",
    }));
  const templateRecommendations = buildTemplateRecommendations(
    library,
    team,
    options.datasets,
    analysis,
    speedTiers,
    language,
    recommendPreferences,
    recommendWeights,
    focusType,
  ).filter((candidate) => !(megaCount >= MAX_TEAM_MEGAS && isMegaConfig(candidate)));

  return [...configuredRecommendations, ...templateRecommendations]
    .filter((entry) => !dismissedKeys.has(entry.recommendationKey))
    .sort((left, right) => (
      right.recommendationScore - left.recommendationScore
      || right.coveredThreats.length - left.coveredThreats.length
      || right.breakdown.quality - left.breakdown.quality
    ))
    .slice(0, 12);
}
