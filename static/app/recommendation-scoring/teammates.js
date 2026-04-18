import {SCORE_WEIGHTS} from "../constants.js";
import {getUsageForSpecies, getUsageTeammateShare} from "../usage.js";
import {clamp} from "../utils.js";
import {getTopAverage} from "./helpers.js";

const TEAMMATE_MATCH_LIMIT = 2;
const TEAMMATE_MIN_SHARE = 0.05;
const LIFT_BASELINE = 1.3;
const LIFT_SATURATION = 3.5;

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
    const lift = !candidateUsage || share < TEAMMATE_MIN_SHARE
      ? 0
      : share / Math.max(candidateUsage, 0.01);
    const affinity = lift <= LIFT_BASELINE
      ? 0
      : Math.min(1, (lift - LIFT_BASELINE) / LIFT_SATURATION);
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
