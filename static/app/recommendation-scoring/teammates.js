import {SCORE_WEIGHTS} from "../constants.js";
import {getUsageForSpecies, getUsageTeammateShare} from "../usage.js";
import {clamp} from "../utils.js";
import {getTopAverage} from "./helpers.js";

const TEAMMATE_MATCH_LIMIT = 2;
const MIN_USAGE_BASELINE = 0.01;
const TEAMMATE_SHARE_TARGET = 0.05;
const TEAMMATE_LIFT_TARGET = 1.3;
const TEAMMATE_SHARE_WEIGHT = 0.6;
const TEAMMATE_LIFT_WEIGHT = 0.4;

function getTeammateAffinity(share = 0, candidateUsage = 0) {
  const shareScore = clamp(share / TEAMMATE_SHARE_TARGET, 0, 1);
  const usageBaseline = Math.max(Number(candidateUsage || 0), MIN_USAGE_BASELINE);
  const liftScore = clamp((share / usageBaseline) / TEAMMATE_LIFT_TARGET, 0, 1);
  return shareScore * TEAMMATE_SHARE_WEIGHT + liftScore * TEAMMATE_LIFT_WEIGHT;
}

export function buildTeammateUsageSummary(team, candidate, datasets) {
  if (!datasets?.usageLookup?.size || !team.length || !candidate?.speciesId) {
    return {score: 0, matches: []};
  }
  const candidateUsage = getUsageForSpecies(
    datasets,
    candidate.speciesId,
    datasets?.pokedex?.[candidate.speciesId]?.name || candidate.speciesId,
  );
  const pairings = team.map((member) => {
    const share = getUsageTeammateShare(datasets, member.speciesId, candidate.speciesId);
    const lift = share / Math.max(candidateUsage, MIN_USAGE_BASELINE);
    const affinity = getTeammateAffinity(share, candidateUsage);
    return {
      member,
      share,
      lift,
      affinity,
    };
  });
  const matches = pairings
  .filter((entry) => entry.affinity > 0)
    .sort((left, right) => right.affinity - left.affinity);
  if (!matches.length) {
    return {score: 0, matches: []};
  }
  return {
    score: clamp(getTopAverage(matches.map((entry) => entry.affinity), TEAMMATE_MATCH_LIMIT) * SCORE_WEIGHTS.teammates, 0, SCORE_WEIGHTS.teammates),
    matches: matches.slice(0, TEAMMATE_MATCH_LIMIT),
  };
}
