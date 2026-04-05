import {SCORE_WEIGHTS, TYPE_ORDER} from "./constants.js";
import {analyzeTeam, getCoverageProfile, getResistanceProfile} from "./analysis.js";
import {t} from "./i18n.js";
import {clamp, getTypeLabel, isMegaConfig, normalizeName} from "./utils.js";

const TRICK_ROOM_MOVE = "trickroom";
const SPEED_CONTROL_MOVES = new Set(["tailwind", "icywind", "electroweb", "thunderwave"]);
const PIVOT_MOVES = new Set(["partingshot", "uturn", "voltswitch", "flipturn", "batonpass", "teleport", "chillyreception"]);
const REDIRECTION_MOVES = new Set(["followme", "ragepowder"]);
const GUARD_MOVES = new Set(["wideguard", "quickguard"]);
const DISRUPTION_MOVES = new Set(["taunt", "encore", "haze", "spore", "willowisp", "nuzzle"]);
const SUPPORT_MOVES_PER_MEMBER_TARGET = 1.5;
const MISSING_ROLE_SCORE = 1.2;
const OFFENSE_BALANCE_SCORE = 1.5;
const SUPPORT_BIAS_SCORE = 1;
const NEW_TYPE_SCORE = 0.5;
const DUPLICATE_TYPE_PENALTY = 0.4;
const TRICK_ROOM_SETTER_BONUS = 1.5;
const HYBRID_TRICK_ROOM_BONUS = 0.75;
const TRICK_ROOM_BASE_WEIGHT = 4.5;
const DUPLICATE_MEGA_PENALTY = 5;

function getNormalizedMoveNames(config) {
  return (config.moveNames || config.moves?.map((move) => move.name) || []).map((name) => normalizeName(name));
}

function hasTrackedMove(config, movePool) {
  return getNormalizedMoveNames(config).some((name) => movePool.has(name));
}

function hasMove(config, moveName) {
  return getNormalizedMoveNames(config).includes(normalizeName(moveName));
}

function getUtilityRoles(config) {
  const roles = [];
  if (hasTrackedMove(config, PIVOT_MOVES)) roles.push("pivot");
  if (hasTrackedMove(config, REDIRECTION_MOVES)) roles.push("redirection");
  if (hasTrackedMove(config, GUARD_MOVES)) roles.push("guard");
  if (hasTrackedMove(config, DISRUPTION_MOVES)) roles.push("disruption");
  if (hasTrackedMove(config, SPEED_CONTROL_MOVES)) roles.push("speedcontrol");
  if (hasMove(config, TRICK_ROOM_MOVE)) roles.push("trickroom");
  if (hasMove(config, "Fake Out")) roles.push("fakeout");
  return roles;
}

function getAttackBias(config) {
  const physicalCount = (config.moves || []).filter((move) => move.category === "Physical").length;
  const specialCount = (config.moves || []).filter((move) => move.category === "Special").length;
  if (!physicalCount && !specialCount) return "support";
  if (physicalCount === specialCount) return "mixed";
  return physicalCount > specialCount ? "physical" : "special";
}

function countCoveredEntries(speedTiers, predicate) {
  return speedTiers.filter(predicate).reduce((sum, tier) => sum + tier.totalCount, 0);
}

function scoreResistance(candidate, analysis) {
  const profile = getResistanceProfile(candidate.types);
  const total = analysis.weaknesses.reduce((score, weakness) => {
    const multiplier = profile[weakness.type] ?? 1;
    if (multiplier === 0 || multiplier <= 0.25) return score + 2;
    if (multiplier <= 0.5) return score + 1.5;
    if (multiplier >= 2) return score - 0.5;
    return score;
  }, 0);
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
  const isTrickRoomSetter = hasMove(candidate, TRICK_ROOM_MOVE);
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
  const teamRoles = new Set(team.flatMap((member) => getUtilityRoles(member)));
  const candidateRoles = getUtilityRoles(candidate);
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
  const total = (
    missingRoles * MISSING_ROLE_SCORE
    + balanceScore
    + supportScore
    + newTypes * NEW_TYPE_SCORE
    - duplicateTypes * DUPLICATE_TYPE_PENALTY
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
  const reasons = [];
  if (breakdown.resistance >= 4) reasons.push(t(language, "recommend.reason.resistance"));
  if (breakdown.coverage >= 4) reasons.push(t(language, "recommend.reason.coverage"));
  if (breakdown.speed >= 3) {
    reasons.push(
      analysis.speedContext.mode === "trickroom" && (hasMove(candidate, TRICK_ROOM_MOVE) || (candidate.stats?.spe || 0) <= analysis.speedContext.medianSpeed)
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
        breakdown,
        reasons: buildReasons(candidate, breakdown, language, analysis),
        weaknessHelp: analysis.weaknesses.map((entry) => {
          const multiplier = getResistanceProfile(candidate.types)[entry.type] ?? 1;
          return `${getTypeLabel(entry.type, language)} ${multiplier}x`;
        }).slice(0, 3),
      };
    })
    .sort((left, right) => right.recommendationScore - left.recommendationScore)
    .slice(0, 12);
}
