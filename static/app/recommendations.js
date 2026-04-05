import {SCORE_WEIGHTS, TYPE_ORDER} from "./constants.js";
import {analyzeTeam, getCoverageProfile, getResistanceProfile} from "./analysis.js";
import {t} from "./i18n.js";
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
const DUPLICATE_MEGA_PENALTY = 5;

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

function scoreResistance(candidate, analysis) {
  const profile = getResistanceProfile(candidate.types);
  const coverSummary = getCoverSummary(candidate, analysis);
  const total = analysis.weaknesses.reduce((score, weakness) => {
    const multiplier = profile[weakness.type] ?? 1;
    if (multiplier === 0) return score + THREAT_IMMUNITY_SCORE;
    if (multiplier <= 0.25) return score + 3;
    if (multiplier <= 0.5) return score + THREAT_COVER_SCORE;
    if (multiplier >= 2) return score - 1;
    return score;
  }, 0) + (coverSummary.coveredThreats.length * TEAM_PATCH_SCORE);
  return clamp(total, 0, SCORE_WEIGHTS.resistance);
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

function scoreSpeed(candidate, speedTiers, analysis) {
  const standardScore = scoreStandardSpeed(candidate, speedTiers);
  const trickRoomScore = scoreTrickRoomSpeed(candidate, speedTiers);
  const isTrickRoomSetter = hasMove(candidate, "trickroom");
  if (analysis.speedContext.mode === "trickroom") {
    return clamp(trickRoomScore + (isTrickRoomSetter ? TRICK_ROOM_SETTER_BONUS : 0), 0, SCORE_WEIGHTS.speed);
  }
  if (analysis.speedContext.mode === "hybrid") {
    return clamp(((standardScore + trickRoomScore) / 2) + (isTrickRoomSetter ? HYBRID_TRICK_ROOM_BONUS : 0), 0, SCORE_WEIGHTS.speed);
  }
  return standardScore;
}

function scoreSynergy(team, candidate, analysis) {
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
  const total = (
    coverSummary.coveredThreats.length * 1.5
    + missingRoles * MISSING_ROLE_SCORE
    + balanceScore
    + supportScore
    + newTypes * NEW_TYPE_SCORE
    - duplicateTypes * DUPLICATE_TYPE_PENALTY
    - ((duplicateTypes && !coverSummary.coveredThreats.length) ? SHARED_TYPE_PENALTY : 0)
  );
  return clamp(total, 0, SCORE_WEIGHTS.synergy);
}

function scoreQuality(candidate) {
  const bst = Object.values(candidate.baseStats || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  const statPart = clamp(((bst - 350) / 300) * 2.5, 0, 2.5);
  const movePart = clamp(((candidate.moves || []).length / 4) * 1.5, 0, 1.5);
  return clamp(statPart + movePart, 0, SCORE_WEIGHTS.quality);
}

function getContextPenalty(candidate, team) {
  const teamHasMega = team.some((member) => isMegaConfig(member));
  if (!teamHasMega || !isMegaConfig(candidate)) {
    return 0;
  }
  return DUPLICATE_MEGA_PENALTY;
}

function buildReasons(candidate, breakdown, language, analysis) {
  const coverSummary = getCoverSummary(candidate, analysis);
  const reasons = [];
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

export function recommendConfigs(library, team, speedTiers, language = "zh") {
  if (!team.length || team.length >= 6) {
    return [];
  }

  const analysis = analyzeTeam(team, speedTiers, language, library);
  const currentSpecies = new Set(team.map((config) => config.speciesId));

  return library
    .filter((candidate) => !currentSpecies.has(candidate.speciesId))
    .map((candidate) => {
      const coverSummary = getCoverSummary(candidate, analysis);
      const breakdown = {
        resistance: scoreResistance(candidate, analysis),
        coverage: scoreCoverage(candidate, analysis),
        speed: scoreSpeed(candidate, speedTiers, analysis),
        synergy: scoreSynergy(team, candidate, analysis),
        quality: scoreQuality(candidate),
      };
      const contextPenalty = getContextPenalty(candidate, team);
      const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0) - contextPenalty;
      return {
        ...candidate,
        recommendationScore: score,
        coveredThreats: coverSummary.coveredThreats,
        breakdown,
        reasons: buildReasons(candidate, breakdown, language, analysis),
        weaknessHelp: coverSummary.coveredThreats.length
          ? coverSummary.coveredThreats.map((type) => getTypeLabel(type, language)).slice(0, 3)
          : analysis.weaknesses.map((entry) => {
            const multiplier = getResistanceProfile(candidate.types)[entry.type] ?? 1;
            return `${getTypeLabel(entry.type, language)} ${multiplier}x`;
          }).slice(0, 3),
      };
    })
    .sort((left, right) => (
      right.coveredThreats.length - left.coveredThreats.length
      || right.recommendationScore - left.recommendationScore
    ))
    .slice(0, 12);
}
