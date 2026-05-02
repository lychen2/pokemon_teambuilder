import {SCORE_WEIGHTS, TYPE_ORDER} from "../constants.js";
import {
  getCoverageProfileForConfig,
  getEffectiveSpeed,
  getResistanceProfileForConfig,
} from "../battle-semantics.js";
import {getSuggestedMoveNamesForSpecies} from "../matchup-board-data.js";
import {RECOMMENDATION_ROLE_IDS, getAttackBias, getUtilityRoles, hasMove} from "../team-roles.js";
import {clamp, normalizeName} from "../utils.js";
import {applyWeightPreference, countCoveredEntries, getCoverSummary} from "./helpers.js";

const THREAT_COVER_SCORE = 2.4;
const THREAT_IMMUNITY_SCORE = 3.2;
const TEAM_PATCH_SCORE = 1;
const SUPPORT_MOVES_PER_MEMBER_TARGET = 1.5;
const MISSING_ROLE_SCORE = 0.72;
const OFFENSE_BALANCE_SCORE = 0.9;
const SUPPORT_BIAS_SCORE = 0.6;
const NEW_TYPE_SCORE = 0.3;
const DUPLICATE_TYPE_PENALTY = 0.24;
const SHARED_TYPE_PENALTY = 0.72;
const FOCUS_IMMUNITY_SCORE = 4;
const FOCUS_RESIST_SCORE = 3;
const FOCUS_WEAKNESS_PENALTY = 1.5;
const TRICK_ROOM_SETTER_BONUS = 1;
const HYBRID_TRICK_ROOM_BONUS = 0.45;
const TRICK_ROOM_BASE_WEIGHT = 3.4;
const SUPPLEMENTAL_STAB_WEIGHT = 0.45;
const SUPPLEMENTAL_NON_STAB_WEIGHT = 0.12;
const SUPPLEMENTAL_COVERAGE_BONUS = 0.9;
const SUPPLEMENTAL_NEUTRAL_BONUS = 0.24;
const SUPPLEMENTAL_COVERAGE_CAP = 1.4;

function getConfiguredAttackMoves(candidate) {
  return (candidate.moves || []).filter((move) => move.category !== "Status" && Number(move.basePower || 0) > 0);
}

function getSupplementalSlotFactor(candidate) {
  const totalMoves = Math.max(candidate.moveNames?.length || 0, candidate.moves?.length || 0);
  const attackCount = getConfiguredAttackMoves(candidate).length;
  const emptySlots = Math.max(0, 4 - totalMoves);
  const supportSlots = Math.max(0, totalMoves - attackCount);
  return clamp(0.12 + emptySlots * 0.18 + supportSlots * 0.08, 0.12, 0.45);
}

function buildSupplementalCoverage(candidate, datasets) {
  if (!datasets?.moveLookup || !candidate?.speciesId) {
    return null;
  }
  const selectedMoveNames = candidate.moveNames || (candidate.moves || []).map((move) => move.name).filter(Boolean);
  const suggestedMoveNames = getSuggestedMoveNamesForSpecies(candidate.speciesId, datasets, selectedMoveNames, 6);
  if (!suggestedMoveNames.length) {
    return null;
  }
  const slotFactor = getSupplementalSlotFactor(candidate);
  const coverage = Object.fromEntries(TYPE_ORDER.map((type) => [type, {multiplier: 0, weight: 0}]));
  suggestedMoveNames.forEach((moveName) => {
    const move = datasets.moveLookup.get(normalizeName(moveName));
    if (!move?.type) {
      return;
    }
    const isStab = (candidate.types || []).includes(move.type);
    const moveWeight = slotFactor * (isStab ? SUPPLEMENTAL_STAB_WEIGHT : SUPPLEMENTAL_NON_STAB_WEIGHT);
    const moveCoverage = getCoverageProfileForConfig({
      moves: [{name: move.name, id: move.id || move.name, type: move.type, category: move.category || "Special"}],
    });
    TYPE_ORDER.forEach((defendType) => {
      const multiplier = moveCoverage[defendType] || 0;
      const current = coverage[defendType];
      const nextValue = multiplier * moveWeight;
      const currentValue = current.multiplier * current.weight;
      if (nextValue > currentValue || (nextValue === currentValue && multiplier > current.multiplier)) {
        coverage[defendType] = {multiplier, weight: moveWeight};
      }
    });
  });
  return coverage;
}

function scoreStandardSpeed(candidate, speedTiers, analysis) {
  const totalCount = speedTiers.reduce((sum, tier) => sum + tier.totalCount, 0);
  if (!totalCount) {
    return 0;
  }
  const speed = getEffectiveSpeed(candidate, "ally", analysis.fieldState || {});
  const bestCoverage = countCoveredEntries(speedTiers, (tier) => tier.speed < speed) / totalCount;
  return clamp(bestCoverage * SCORE_WEIGHTS.speed, 0, SCORE_WEIGHTS.speed);
}

function scoreTrickRoomSpeed(candidate, speedTiers, analysis) {
  const totalCount = speedTiers.reduce((sum, tier) => sum + tier.totalCount, 0);
  if (!totalCount) {
    return 0;
  }
  const coveredCount = countCoveredEntries(speedTiers, (tier) => tier.speed > getEffectiveSpeed(candidate, "ally", analysis.fieldState || {}));
  return clamp((coveredCount / totalCount) * TRICK_ROOM_BASE_WEIGHT, 0, TRICK_ROOM_BASE_WEIGHT);
}

function hasTrickRoomBonus(candidate, analysis) {
  return hasMove(candidate, "trickroom") && (candidate.stats?.spe || 0) <= Number(analysis.speedContext?.medianSpeed || 0);
}

export function scoreResistance(candidate, analysis, preferences, weights) {
  const profile = getResistanceProfileForConfig(candidate, {fieldState: analysis.fieldState, side: "ally"});
  const coverSummary = getCoverSummary(candidate, analysis);
  const rawScore = analysis.weaknesses.reduce((score, weakness) => {
    const multiplier = profile[weakness.type] ?? 1;
    if (multiplier === 0) return score + THREAT_IMMUNITY_SCORE;
    if (multiplier <= 0.5) return score + THREAT_COVER_SCORE;
    if (multiplier >= 2) return score - 0.8;
    return score;
  }, coverSummary.coveredThreats.length * TEAM_PATCH_SCORE);
  return clamp(
    applyWeightPreference(rawScore, preferences.patchWeakness, weights.patchWeakness),
    0,
    SCORE_WEIGHTS.resistance,
  );
}

export function scoreFocus(candidate, focusType = "") {
  if (!focusType) {
    return 0;
  }
  const multiplier = getResistanceProfileForConfig(candidate)[focusType] ?? 1;
  if (multiplier === 0) return FOCUS_IMMUNITY_SCORE;
  if (multiplier < 1) return FOCUS_RESIST_SCORE;
  if (multiplier > 1) return -FOCUS_WEAKNESS_PENALTY;
  return 0;
}

export function scoreCoverage(candidate, analysis, preferences, weights, datasets) {
  const current = Object.fromEntries(analysis.offensive.map((entry) => [entry.type, entry.effectiveness]));
  const next = getCoverageProfileForConfig(candidate, {fieldState: analysis.fieldState, side: "ally"});
  const supplemental = buildSupplementalCoverage(candidate, datasets);
  const directScore = TYPE_ORDER.reduce((score, type) => {
    if ((next[type] || 0) <= (current[type] || 0)) return score;
    if ((current[type] || 0) <= 1 && (next[type] || 0) >= 2) return score + 1.5;
    if ((current[type] || 0) < 4 && (next[type] || 0) === 4) return score + 1;
    return score + 0.7;
  }, 0);
  const supplementalScore = supplemental
    ? TYPE_ORDER.reduce((score, type) => {
      const suggested = supplemental[type];
      if (!suggested || suggested.multiplier <= Math.max(current[type] || 0, next[type] || 0)) {
        return score;
      }
      if ((current[type] || 0) <= 1 && suggested.multiplier >= 2) {
        return score + suggested.weight * SUPPLEMENTAL_COVERAGE_BONUS;
      }
      if ((current[type] || 0) < 1 && suggested.multiplier >= 1) {
        return score + suggested.weight * SUPPLEMENTAL_NEUTRAL_BONUS;
      }
      return score;
    }, 0)
    : 0;
  const rawScore = directScore + Math.min(supplementalScore, SUPPLEMENTAL_COVERAGE_CAP);
  return clamp(
    applyWeightPreference(rawScore, preferences.patchCoverage, weights.patchCoverage),
    0,
    SCORE_WEIGHTS.coverage,
  );
}

export function scoreSpeed(candidate, speedTiers, analysis, preferences, weights) {
  const standardScore = scoreStandardSpeed(candidate, speedTiers, analysis);
  const trickRoomScore = scoreTrickRoomSpeed(candidate, speedTiers, analysis);
  const trickRoomBonus = hasTrickRoomBonus(candidate, analysis) ? TRICK_ROOM_SETTER_BONUS : 0;
  let rawScore = standardScore;
  if (analysis.speedContext.mode === "trickroom") {
    rawScore = trickRoomScore + trickRoomBonus;
  } else if (analysis.speedContext.mode === "hybrid") {
    const teamSize = Math.max(1, Number(analysis.speedContext.teamSize || 0));
    const trickRoomWeight = clamp(Number(analysis.speedContext.slowCount || 0) / teamSize, 0.15, 0.35);
    rawScore = standardScore * (1 - trickRoomWeight) + trickRoomScore * trickRoomWeight;
    if (trickRoomBonus) {
      rawScore += HYBRID_TRICK_ROOM_BONUS * trickRoomWeight;
    }
  }
  return clamp(
    applyWeightPreference(rawScore, preferences.patchSpeed, weights.patchSpeed),
    0,
    SCORE_WEIGHTS.speed,
  );
}

export function scoreSynergy(team, candidate, analysis, preferences, weights, roleContext) {
  const teamTypes = new Set(team.flatMap((member) => member.types || []));
  const roleOptions = {roleContext};
  const teamRoles = new Set(team.flatMap((member) => getUtilityRoles(member, roleOptions)).filter((roleId) => RECOMMENDATION_ROLE_IDS.includes(roleId)));
  const candidateRoles = getUtilityRoles(candidate, roleOptions).filter((roleId) => RECOMMENDATION_ROLE_IDS.includes(roleId));
  const candidateBias = getAttackBias(candidate);
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
  const roleScore = applyWeightPreference(missingRoles * MISSING_ROLE_SCORE, preferences.patchRoles, weights.patchRoles);
  const duplicatePenalty = applyWeightPreference(duplicateTypes * DUPLICATE_TYPE_PENALTY, preferences.avoidDuplicateTypes, weights.avoidDuplicateTypes);
  const sharedPenalty = duplicateTypes
    ? applyWeightPreference(SHARED_TYPE_PENALTY, preferences.avoidDuplicateTypes, weights.avoidDuplicateTypes)
    : 0;
  const rawScore = roleScore + balanceScore + supportScore + newTypes * NEW_TYPE_SCORE - duplicatePenalty - sharedPenalty;
  return clamp(rawScore, 0, SCORE_WEIGHTS.synergy);
}
