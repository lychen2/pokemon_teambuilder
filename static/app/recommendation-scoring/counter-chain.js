import {SCORE_WEIGHTS} from "../constants.js";
import {getCounterScore} from "../opponent-team-generator.js";
import {clamp} from "../utils.js";
import {enrichCandidateForScoring} from "./candidate.js";
import {getTopAverage} from "./helpers.js";

const COUNTER_CHAIN_THREAT_LIMIT = 3;
const COUNTER_CHAIN_TARGET_SCORE = 18;
const COUNTER_CHAIN_MIN_THREAT_SCORE = 8;
const COUNTER_CHAIN_TARGET_LIMIT = 3;

function getConfigLabel(config = {}) {
  return config.displayName || config.speciesName || config.speciesId || "";
}

function summarizeThreatConfig(config = {}, team = [], datasets) {
  const scoringConfig = enrichCandidateForScoring(config, datasets);
  const scores = team.map((member) => getCounterScore(scoringConfig, member, datasets));
  return {
    config: scoringConfig,
    label: getConfigLabel(scoringConfig),
    speciesId: scoringConfig.speciesId,
    score: getTopAverage(scores, 2),
  };
}

function chooseBestThreatBySpecies(library = [], team = [], datasets) {
  const teamSpecies = new Set(team.map((member) => member.speciesId).filter(Boolean));
  return library.reduce((bestBySpecies, config) => {
    if (!config?.speciesId || teamSpecies.has(config.speciesId)) {
      return bestBySpecies;
    }
    const threat = summarizeThreatConfig(config, team, datasets);
    const current = bestBySpecies.get(threat.speciesId);
    if (!current || threat.score > current.score) {
      bestBySpecies.set(threat.speciesId, threat);
    }
    return bestBySpecies;
  }, new Map());
}

function sortThreats(left, right) {
  return right.score - left.score || left.label.localeCompare(right.label, "zh-Hans-CN");
}

function getCounterChainTargets(candidate = {}, threats = [], datasets) {
  return threats
    .filter((threat) => threat.speciesId !== candidate.speciesId)
    .map((threat) => ({
      label: threat.label,
      localizedLabel: datasets?.localizedSpeciesNames?.get(threat.speciesId) || threat.label,
      score: getCounterScore(candidate, threat.config, datasets),
      threatScore: threat.score,
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, COUNTER_CHAIN_TARGET_LIMIT);
}

function getWeightedScore(targets = []) {
  const totalWeight = targets.reduce((sum, target) => sum + target.threatScore, 0);
  if (!totalWeight) {
    return 0;
  }
  return targets.reduce((sum, target) => {
    const cappedScore = Math.min(target.score, COUNTER_CHAIN_TARGET_SCORE);
    return sum + cappedScore * target.threatScore;
  }, 0) / totalWeight;
}

export function buildCounterChainContext(library = [], team = [], datasets) {
  if (!team.length || !library.length) {
    return {threats: [], datasets};
  }
  const threats = [...chooseBestThreatBySpecies(library, team, datasets).values()]
    .filter((threat) => threat.score >= COUNTER_CHAIN_MIN_THREAT_SCORE)
    .sort(sortThreats)
    .slice(0, COUNTER_CHAIN_THREAT_LIMIT);
  return {threats, datasets};
}

export function scoreCounterChain(candidate = {}, context = {}) {
  const targets = getCounterChainTargets(candidate, context.threats || [], context.datasets);
  const weightedScore = getWeightedScore(targets);
  return {
    score: clamp(
      (weightedScore / COUNTER_CHAIN_TARGET_SCORE) * SCORE_WEIGHTS.counterChain,
      0,
      SCORE_WEIGHTS.counterChain,
    ),
    targets,
  };
}
