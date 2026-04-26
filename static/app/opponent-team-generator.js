import {TYPE_CHART} from "./constants.js";
import {getMoveEffectiveness} from "./battle-semantics.js";
import {
  getBasePower,
  getConditionalAttackInfo,
  getConditionalBpInfo,
  getEffectiveType,
  getFinalDamageInfo,
  getHitCount,
  getItemPowerMultiplier,
  getOffenseStatKey,
  getRawMove,
  getRestrictedReasonIds,
  getSpreadMultiplier,
  getStabMultiplier,
  getStaticAttackMultiplier,
  getStaticBpMultiplier,
  isDamagingMove,
} from "./output-strength-rules.js";
import {getUtilityRoles} from "./team-roles.js";
import {getUsageForSpecies, getUsageTeammateShare} from "./usage.js";

const MAX_GENERATED_OPPONENTS = 6;
const TARGET_COVERAGE_SCORE = 12;
const STAB_BONUS = 1.5;
const SPEED_EDGE_VERY_FAST_RATIO = 2;
const SPEED_EDGE_FAST_RATIO = 1.2;
const SPEED_EDGE_SLIGHT_FAST_RATIO = 1.05;
const SPEED_EDGE_SLIGHT_SLOW_RATIO = 0.95;
const SPEED_EDGE_SLOW_RATIO = 0.8;
const SPEED_EDGE_VERY_SLOW_RATIO = 0.5;
const SPEED_EDGE_VERY_FAST_SCORE = 6;
const SPEED_EDGE_FAST_SCORE = 4;
const SPEED_EDGE_SLIGHT_FAST_SCORE = 1.5;
const SPEED_EDGE_SLIGHT_SLOW_SCORE = -1.5;
const SPEED_EDGE_SLOW_SCORE = -3;
const SPEED_EDGE_VERY_SLOW_SCORE = -6;
const LEVEL_DAMAGE_FACTOR = 22;
const DAMAGE_DIVISOR = 50;
const DAMAGE_OFFSET = 2;
const ACCURACY_SCALE = 100;
const FAST_OHKO_DAMAGE_RATIO = 1;
const FAST_OHKO_BONUS = 6;
const FAST_OHKO_BLOCKED_REASON_IDS = new Set(["conditional", "charge", "recharge", "selfdestruct", "ohko"]);
const SYNERGY_EPSILON = 1e-6;
const OPPONENT_GEN_WEIGHTS = Object.freeze({
  total: 0.34,
  peak: 0.12,
  coverage: 0.2,
  usage: 0.18,
  marginalCoverage: 0.5,
  shortfallCoverage: 0.32,
  synergy: 0.18,
  repeatedTypePenalty: 0.12,
});
const SPEED_MODE_WEIGHTS = Object.freeze({
  base: 1,
  plusOne: 0.38,
  scarf: 0.42,
  double: 0.24,
});
const ROLE_PRESSURE_BONUS = Object.freeze({
  fakeout: 0.18,
  disruption: 0.14,
  speedcontrol: 0.12,
  tailwind: 0.12,
  intimidate: 0.14,
  redirection: 0.12,
});

function getAttackMultiplier(attackType, defendTypes = []) {
  return defendTypes.reduce((total, defendType) => {
    const next = TYPE_CHART[attackType]?.[defendType];
    return total * (next ?? 1);
  }, 1);
}

function getBestAttackMultiplier(config = {}, defendTypes = []) {
  return (config.offensiveTypes || []).reduce((best, attackType) => {
    const stab = (config.types || []).includes(attackType) ? STAB_BONUS : 1;
    const multiplier = getAttackMultiplier(attackType, defendTypes) * stab;
    return Math.max(best, multiplier);
  }, 0);
}

function getSpeedModes(config = {}) {
  const modes = [{speed: Number(config.stats?.spe || 0), weight: SPEED_MODE_WEIGHTS.base}];
  if (config.plusOneSpeed?.speed) {
    modes.push({speed: Number(config.plusOneSpeed.speed || 0), weight: SPEED_MODE_WEIGHTS.plusOne});
  }
  if (config.choiceScarfSpeed?.speed) {
    modes.push({speed: Number(config.choiceScarfSpeed.speed || 0), weight: SPEED_MODE_WEIGHTS.scarf});
  }
  if (config.doubleSpeed?.speed) {
    modes.push({speed: Number(config.doubleSpeed.speed || 0), weight: SPEED_MODE_WEIGHTS.double});
  }
  return modes.filter((mode) => mode.speed > 0 && mode.weight > 0);
}

function getModeSpeedEdgeScore(attackerSpeed, defenderSpeed) {
  if (!attackerSpeed || !defenderSpeed) {
    return 0;
  }
  const ratio = attackerSpeed / defenderSpeed;
  if (ratio >= SPEED_EDGE_VERY_FAST_RATIO) return SPEED_EDGE_VERY_FAST_SCORE;
  if (ratio >= SPEED_EDGE_FAST_RATIO) return SPEED_EDGE_FAST_SCORE;
  if (ratio >= SPEED_EDGE_SLIGHT_FAST_RATIO) return SPEED_EDGE_SLIGHT_FAST_SCORE;
  if (ratio > SPEED_EDGE_SLIGHT_SLOW_RATIO) return 0;
  if (ratio > SPEED_EDGE_SLOW_RATIO) return SPEED_EDGE_SLIGHT_SLOW_SCORE;
  if (ratio > SPEED_EDGE_VERY_SLOW_RATIO) return SPEED_EDGE_SLOW_SCORE;
  return SPEED_EDGE_VERY_SLOW_SCORE;
}

function getSpeedEdgeScore(attacker = {}, defender = {}) {
  const attackerModes = getSpeedModes(attacker);
  const defenderModes = getSpeedModes(defender);
  let weightedScore = 0;
  let totalWeight = 0;
  attackerModes.forEach((attackerMode) => {
    defenderModes.forEach((defenderMode) => {
      const weight = attackerMode.weight * defenderMode.weight;
      weightedScore += getModeSpeedEdgeScore(attackerMode.speed, defenderMode.speed) * weight;
      totalWeight += weight;
    });
  });
  return totalWeight ? weightedScore / totalWeight : 0;
}

function getReliableConditionalMultiplier(info = {}) {
  return info.triggerSource ? info.maxMultiplier : info.baseMultiplier;
}

function getMoveReliability(move = {}) {
  if (move.accuracy === true) {
    return 1;
  }
  const accuracy = Number(move.accuracy || ACCURACY_SCALE);
  return Math.max(0, Math.min(1, accuracy / ACCURACY_SCALE));
}

function isStableOhkoMove(move = {}) {
  return !getRestrictedReasonIds(move).some((reasonId) => FAST_OHKO_BLOCKED_REASON_IDS.has(reasonId));
}

function getMoveDamageRatio(attacker = {}, defender = {}, move = {}, datasets) {
  const rawMove = getRawMove(move, datasets);
  if (!isDamagingMove(rawMove) || !isStableOhkoMove(rawMove)) {
    return 0;
  }
  const statKey = getOffenseStatKey(rawMove);
  const defenseKey = rawMove.category === "Physical" ? "def" : "spd";
  const attackStat = Number(attacker.stats?.[statKey] || 0);
  const defenseStat = Number(defender.stats?.[defenseKey] || 0);
  const hpStat = Number(defender.stats?.hp || 0);
  const basePower = getBasePower(rawMove);
  const effectiveType = getEffectiveType(rawMove, attacker);
  const effectiveness = getMoveEffectiveness(rawMove, attacker, defender);
  if (!attackStat || !defenseStat || !hpStat || !basePower || !effectiveType || !effectiveness) {
    return 0;
  }
  const attackMultiplier = getStaticAttackMultiplier(attacker, statKey, effectiveType)
    * getReliableConditionalMultiplier(getConditionalAttackInfo(rawMove, attacker, statKey, effectiveType));
  const bpMultiplier = getStaticBpMultiplier(rawMove, attacker, effectiveType, basePower)
    * getReliableConditionalMultiplier(getConditionalBpInfo(rawMove, attacker, statKey, effectiveType));
  const baseDamage = (((LEVEL_DAMAGE_FACTOR * basePower * attackStat * attackMultiplier) / defenseStat) / DAMAGE_DIVISOR) + DAMAGE_OFFSET;
  const modifier = getHitCount(rawMove, attacker)
    * getSpreadMultiplier(rawMove)
    * getStabMultiplier(attacker, effectiveType)
    * getItemPowerMultiplier(rawMove, attacker, effectiveType)
    * getFinalDamageInfo(rawMove, attacker, effectiveType).multiplier
    * bpMultiplier
    * effectiveness;
  return (baseDamage * modifier) / hpStat;
}

function getFastOhkoBonus(attacker = {}, defender = {}, datasets) {
  if (!datasets) {
    return 0;
  }
  const attackerModes = getSpeedModes(attacker);
  const defenderModes = getSpeedModes(defender);
  const bestRatio = (attacker.moves || []).reduce((best, move) => {
    return Math.max(best, getMoveDamageRatio(attacker, defender, move, datasets));
  }, 0);
  if (bestRatio < FAST_OHKO_DAMAGE_RATIO) {
    return 0;
  }
  let fasterWeight = 0;
  let totalWeight = 0;
  attackerModes.forEach((attackerMode) => {
    defenderModes.forEach((defenderMode) => {
      const weight = attackerMode.weight * defenderMode.weight;
      if (attackerMode.speed > defenderMode.speed) {
        fasterWeight += weight;
      }
      totalWeight += weight;
    });
  });
  if (!totalWeight || !fasterWeight) {
    return 0;
  }
  const bestMove = (attacker.moves || [])
    .map((move) => ({move, ratio: getMoveDamageRatio(attacker, defender, move, datasets)}))
    .filter((entry) => entry.ratio >= FAST_OHKO_DAMAGE_RATIO)
    .sort((left, right) => right.ratio - left.ratio)[0];
  return FAST_OHKO_BONUS * (fasterWeight / totalWeight) * getMoveReliability(bestMove?.move);
}

function getOffenseStat(config = {}) {
  return Math.max(Number(config.stats?.atk || 0), Number(config.stats?.spa || 0));
}

function getRolePressureBonus(config = {}, roleCounts = new Map()) {
  return getUtilityRoles(config).reduce((total, roleId) => {
    const baseBonus = ROLE_PRESSURE_BONUS[roleId];
    if (!baseBonus) {
      return total;
    }
    const currentCount = Number(roleCounts.get(roleId) || 0);
    return total + baseBonus * (Math.sqrt(currentCount + 1) - Math.sqrt(currentCount));
  }, 0);
}

export function getCounterScore(attacker = {}, defender = {}, datasets) {
  const outgoing = getBestAttackMultiplier(attacker, defender.types || []);
  const incoming = getBestAttackMultiplier(defender, attacker.types || []);
  const offensePressure = outgoing * 12 + getOffenseStat(attacker) / 18;
  const resistanceBonus = incoming > 0 ? Math.max(0, Math.log2(1 / Math.max(incoming, 0.25))) * 3 : 6;
  return offensePressure - incoming * 5 + resistanceBonus + getSpeedEdgeScore(attacker, defender) + getFastOhkoBonus(attacker, defender, datasets);
}

function summarizeConfigPerformance(config = {}, team = [], datasets) {
  const perTargetScores = team.map((target) => getCounterScore(config, target, datasets));
  const totalScore = perTargetScores.reduce((sum, score) => sum + score, 0);
  return {
    config,
    speciesId: config.speciesId,
    speciesName: config.speciesName || config.displayName || config.speciesId,
    dexNumber: Number(datasets?.pokedex?.[config.speciesId]?.num || 0),
    usage: getUsageForSpecies(datasets, config.speciesId, config.speciesName),
    perTargetScores,
    totalScore,
    peakScore: Math.max(...perTargetScores, 0),
    coverageCount: perTargetScores.filter((score) => score >= TARGET_COVERAGE_SCORE).length,
    primaryType: config.types?.[0] || "",
  };
}

function buildMetricStats(candidates = []) {
  const emptyStat = {min: 0, max: 0};
  return ["totalScore", "peakScore", "coverageCount", "usage"].reduce((stats, key) => {
    const values = candidates.map((candidate) => Number(candidate[key] || 0));
    stats[key] = values.length ? {min: Math.min(...values), max: Math.max(...values)} : emptyStat;
    return stats;
  }, {});
}

function normalizeMetric(value, stat = {}) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (!Number.isFinite(stat.min) || !Number.isFinite(stat.max) || stat.max <= stat.min) {
    return 0.5;
  }
  return (value - stat.min) / (stat.max - stat.min);
}

function withNormalizedMetrics(candidates = []) {
  const stats = buildMetricStats(candidates);
  return candidates.map((candidate) => {
    const totalNorm = normalizeMetric(candidate.totalScore, stats.totalScore);
    const peakNorm = normalizeMetric(candidate.peakScore, stats.peakScore);
    const coverageNorm = normalizeMetric(candidate.coverageCount, stats.coverageCount);
    const usageNorm = normalizeMetric(candidate.usage, stats.usage);
    return {
      ...candidate,
      totalNorm,
      peakNorm,
      coverageNorm,
      usageNorm,
      baseScore: totalNorm * OPPONENT_GEN_WEIGHTS.total
        + peakNorm * OPPONENT_GEN_WEIGHTS.peak
        + coverageNorm * OPPONENT_GEN_WEIGHTS.coverage
        + usageNorm * OPPONENT_GEN_WEIGHTS.usage,
    };
  });
}

function buildSpeciesPools(matchupLibrary = [], team = [], datasets) {
  const candidates = withNormalizedMetrics(
    matchupLibrary.flatMap((entry) => (entry.configs || []).map((config) => summarizeConfigPerformance(config, team, datasets))),
  );
  return candidates.reduce((pools, candidate) => {
    const speciesCandidates = pools.get(candidate.speciesId) || [];
    speciesCandidates.push(candidate);
    pools.set(candidate.speciesId, speciesCandidates);
    return pools;
  }, new Map());
}

function getSynergyScore(selected = [], candidate = {}, datasets) {
  if (!selected.length) {
    return 0;
  }
  const shares = selected.map((member) => {
    const shareAB = getUsageTeammateShare(datasets, candidate.speciesId, member.speciesId);
    const shareBA = getUsageTeammateShare(datasets, member.speciesId, candidate.speciesId);
    if (!shareAB && !shareBA) {
      return 0;
    }
    return (2 * shareAB * shareBA) / (shareAB + shareBA + SYNERGY_EPSILON);
  });
  shares.sort((left, right) => right - left);
  const topShares = shares.slice(0, 2);
  return topShares.reduce((sum, share) => sum + share, 0) / topShares.length;
}

function getCoverageImprovement(perTargetScores = [], coverage = []) {
  const baseTotal = perTargetScores.length * TARGET_COVERAGE_SCORE || 1;
  let marginal = 0;
  let shortfallWeighted = 0;
  perTargetScores.forEach((score, index) => {
    const current = Math.min(Number(coverage[index] || 0), TARGET_COVERAGE_SCORE);
    const next = Math.min(Math.max(Number(coverage[index] || 0), score), TARGET_COVERAGE_SCORE);
    const improvement = Math.max(0, next - current);
    const shortfallRatio = (TARGET_COVERAGE_SCORE - current) / TARGET_COVERAGE_SCORE;
    marginal += improvement;
    shortfallWeighted += improvement * shortfallRatio;
  });
  return {
    marginal: marginal / baseTotal,
    shortfallWeighted: shortfallWeighted / baseTotal,
  };
}

function scoreCandidateChoice(candidate = {}, context) {
  const {coverage, selected, roleCounts} = context;
  const coverageGain = getCoverageImprovement(candidate.perTargetScores, coverage);
  const synergyScore = getSynergyScore(selected, candidate, context.datasets);
  const repeatedTypeCount = selected.filter((member) => member.primaryType && member.primaryType === candidate.primaryType).length;
  return candidate.baseScore
    + coverageGain.marginal * OPPONENT_GEN_WEIGHTS.marginalCoverage
    + coverageGain.shortfallWeighted * OPPONENT_GEN_WEIGHTS.shortfallCoverage
    + synergyScore * OPPONENT_GEN_WEIGHTS.synergy
    + getRolePressureBonus(candidate.config, roleCounts)
    - repeatedTypeCount * OPPONENT_GEN_WEIGHTS.repeatedTypePenalty;
}

function compareChoices(left, right) {
  return right.score - left.score
    || right.candidate.usage - left.candidate.usage
    || left.candidate.dexNumber - right.candidate.dexNumber
    || left.candidate.speciesName.localeCompare(right.candidate.speciesName, "zh-Hans-CN")
    || String(left.candidate.config.id).localeCompare(String(right.candidate.config.id));
}

function chooseBestSpeciesChoice(speciesPools = new Map(), context) {
  const takenSpecies = new Set(context.selected.map((candidate) => candidate.speciesId));
  const choices = [];
  speciesPools.forEach((candidates, speciesId) => {
    if (takenSpecies.has(speciesId)) {
      return;
    }
    const bestChoice = candidates
      .map((candidate) => ({candidate, score: scoreCandidateChoice(candidate, context)}))
      .sort(compareChoices)[0];
    if (bestChoice) {
      choices.push(bestChoice);
    }
  });
  return choices.sort(compareChoices)[0] || null;
}

function updateCoverage(coverage = [], perTargetScores = []) {
  return coverage.map((score, index) => Math.max(score, Number(perTargetScores[index] || 0)));
}

function updateRoleCounts(roleCounts = new Map(), config = {}) {
  const nextCounts = new Map(roleCounts);
  getUtilityRoles(config).forEach((roleId) => {
    nextCounts.set(roleId, Number(nextCounts.get(roleId) || 0) + 1);
  });
  return nextCounts;
}

function getLockedCandidate(selection = {}, speciesPools = new Map()) {
  const candidates = speciesPools.get(selection.speciesId) || [];
  if (!candidates.length) {
    return null;
  }
  if (selection.selectedConfigId) {
    return candidates.find((candidate) => candidate.config.id === selection.selectedConfigId) || candidates[0];
  }
  return [...candidates].sort((left, right) => right.baseScore - left.baseScore)[0] || null;
}

export function buildCounterOpponentSelections(team = [], matchupLibrary = [], datasets, options = {}) {
  if (!team.length || !matchupLibrary.length) {
    return [];
  }
  const speciesPools = buildSpeciesPools(matchupLibrary, team, datasets);
  const limit = Math.min(MAX_GENERATED_OPPONENTS, speciesPools.size);
  const lockedSelections = (options.lockedSelections || []).slice(0, limit);
  const pinnedSpeciesIds = new Set(lockedSelections.map((entry) => entry.speciesId).filter(Boolean));
  let coverage = new Array(team.length).fill(0);
  let roleCounts = new Map();
  const selected = [];

  lockedSelections.forEach((selection) => {
    const candidate = getLockedCandidate(selection, speciesPools);
    if (!candidate || selected.some((entry) => entry.speciesId === candidate.speciesId)) {
      return;
    }
    selected.push(candidate);
    coverage = updateCoverage(coverage, candidate.perTargetScores);
    roleCounts = updateRoleCounts(roleCounts, candidate.config);
  });

  while (selected.length < limit) {
    const choice = chooseBestSpeciesChoice(speciesPools, {
      coverage,
      datasets,
      roleCounts,
      selected,
    });
    if (!choice) {
      break;
    }
    selected.push(choice.candidate);
    coverage = updateCoverage(coverage, choice.candidate.perTargetScores);
    roleCounts = updateRoleCounts(roleCounts, choice.candidate.config);
  }

  return selected.map((candidate) => ({
    speciesId: candidate.speciesId,
    selectedConfigId: candidate.config.id,
    pinned: pinnedSpeciesIds.has(candidate.speciesId),
  }));
}
