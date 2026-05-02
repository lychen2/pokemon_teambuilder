import {SCORE_WEIGHTS} from "../constants.js";
import {clamp} from "../utils.js";

const AXIS_EPSILON = 1e-6;
const FLAT_AXIS_PERCENT = 0.5;
const NEUTRAL_PAIRING_SHARE = 0.5;
const TEAM_SHAPE_BREAKDOWN_KEYS = Object.freeze([
  "resistance",
  "coverage",
  "speed",
  "synergy",
  "quality",
  "focus",
  "counterChain",
]);

export const MAX_RECOMMENDATION_SCORE = TEAM_SHAPE_BREAKDOWN_KEYS
  .reduce((sum, key) => sum + Number(SCORE_WEIGHTS[key] || 0), 0);

function getBreakdownBlockScore(breakdown = {}, keys = []) {
  return keys.reduce((sum, key) => sum + Number(breakdown[key] || 0), 0);
}

function getAxisBlendPercent(value = 0, minValue = 0, maxValue = 0, rank = 0, lastRank = 0) {
  // If an axis cannot separate candidates at all, keep it neutral instead of collapsing the full score to 0.
  if (Math.abs(maxValue - minValue) <= AXIS_EPSILON) {
    return FLAT_AXIS_PERCENT;
  }
  const rankPercent = lastRank > 0 ? rank / lastRank : FLAT_AXIS_PERCENT;
  const spreadPercent = clamp((value - minValue) / (maxValue - minValue), 0, 1);
  return (rankPercent + spreadPercent) / 2;
}

function buildAxisPercents(entries = [], getValue) {
  if (!entries.length) {
    return [];
  }
  const sorted = entries
    .map((entry, index) => ({index, value: Number(getValue(entry) || 0)}))
    .sort((left, right) => left.value - right.value);
  const minValue = sorted[0]?.value ?? 0;
  const maxValue = sorted.at(-1)?.value ?? 0;
  const percents = new Array(entries.length).fill(FLAT_AXIS_PERCENT);
  let start = 0;
  while (start < sorted.length) {
    let end = start;
    while (end + 1 < sorted.length && Math.abs(sorted[end + 1].value - sorted[start].value) <= AXIS_EPSILON) {
      end += 1;
    }
    const rank = (start + end) / 2;
    const percent = getAxisBlendPercent(sorted[start].value, minValue, maxValue, rank, sorted.length - 1);
    for (let cursor = start; cursor <= end; cursor += 1) {
      percents[sorted[cursor].index] = percent;
    }
    start = end + 1;
  }
  return percents;
}

function getCompositePercent(entry = {}, pairingShare = NEUTRAL_PAIRING_SHARE) {
  const pairingPercent = Number(entry.recommendationAxes?.pairingPercent ?? FLAT_AXIS_PERCENT);
  const teamShapePercent = Number(entry.recommendationAxes?.teamShapePercent ?? FLAT_AXIS_PERCENT);
  return teamShapePercent * (1 - pairingShare) + pairingPercent * pairingShare;
}

function sortByPairingShare(left, right, pairingShare) {
  return (
    getCompositePercent(right, pairingShare) - getCompositePercent(left, pairingShare)
    || Number(right.recommendationAxes?.teamShapePercent || 0) - Number(left.recommendationAxes?.teamShapePercent || 0)
    || Number(right.recommendationAxes?.pairingPercent || 0) - Number(left.recommendationAxes?.pairingPercent || 0)
    || Number(right.recommendationAxes?.teamShapeScore || 0) - Number(left.recommendationAxes?.teamShapeScore || 0)
    || Number(right.recommendationAxes?.pairingScore || 0) - Number(left.recommendationAxes?.pairingScore || 0)
  );
}

function buildAxisAnnotatedEntries(entries = []) {
  const teamShapePercents = buildAxisPercents(
    entries,
    (entry) => entry.recommendationAxes?.teamShapeScore,
  );
  const pairingPercents = buildAxisPercents(
    entries,
    (entry) => entry.recommendationAxes?.pairingScore,
  );
  return entries.map((entry, index) => ({
    ...entry,
    recommendationAxes: {
      ...entry.recommendationAxes,
      teamShapePercent: teamShapePercents[index],
      pairingPercent: pairingPercents[index],
    },
  }));
}

function getPairingFlipShare(leader = {}, challenger = {}) {
  const leaderTeam = Number(leader.recommendationAxes?.teamShapePercent ?? FLAT_AXIS_PERCENT);
  const leaderPair = Number(leader.recommendationAxes?.pairingPercent ?? FLAT_AXIS_PERCENT);
  const challengerTeam = Number(challenger.recommendationAxes?.teamShapePercent ?? FLAT_AXIS_PERCENT);
  const challengerPair = Number(challenger.recommendationAxes?.pairingPercent ?? FLAT_AXIS_PERCENT);
  const numerator = leaderTeam - challengerTeam;
  const denominator = (challengerPair - challengerTeam) - (leaderPair - leaderTeam);
  if (Math.abs(denominator) <= AXIS_EPSILON) {
    return null;
  }
  const share = numerator / denominator;
  if (share <= AXIS_EPSILON || share >= 1 - AXIS_EPSILON) {
    return null;
  }
  return clamp(share, 0, 1);
}

function hasSameRecommendationSpecies(left = {}, right = {}) {
  const leftSpeciesId = String(left.battleEquivalentSpeciesId || left.speciesId || "");
  const rightSpeciesId = String(right.battleEquivalentSpeciesId || right.speciesId || "");
  return Boolean(leftSpeciesId && leftSpeciesId === rightSpeciesId);
}

export function buildRecommendationAxisSnapshot(breakdown = {}) {
  return {
    teamShapeScore: getBreakdownBlockScore(breakdown, TEAM_SHAPE_BREAKDOWN_KEYS),
    pairingScore: clamp(Number(breakdown.teammates || 0), 0, SCORE_WEIGHTS.teammates),
  };
}

export function annotateRecommendationAxisPercents(entries = []) {
  return buildAxisAnnotatedEntries(entries);
}

function getEffectiveScoreAtShare(entry, share) {
  const team = Number(entry?.recommendationAxes?.teamShapePercent ?? FLAT_AXIS_PERCENT);
  const pair = Number(entry?.recommendationAxes?.pairingPercent ?? FLAT_AXIS_PERCENT);
  const floor = Number(entry?.recommendationFloorPenalty ?? 1);
  return (team * (1 - share) + pair * share) * floor;
}

function findTopAtShare(entries, share) {
  let bestEntry = null;
  let bestScore = -Infinity;
  for (const entry of entries) {
    if (!entry) continue;
    const score = getEffectiveScoreAtShare(entry, share);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }
  return bestEntry;
}

export function getRecommendationPairingCrossoverBias(entries = []) {
  if (entries.length < 2) {
    return null;
  }
  const initialTop = findTopAtShare(entries, 1);
  if (!initialTop) {
    return null;
  }
  for (let bias = 99; bias >= 0; bias -= 1) {
    const top = findTopAtShare(entries, bias / 100);
    if (top && top !== initialTop && !hasSameRecommendationSpecies(top, initialTop)) {
      return bias;
    }
  }
  return null;
}

export function finalizeRecommendationScores(entries = [], scoreMix = {}) {
  const axisAnnotatedEntries = buildAxisAnnotatedEntries(entries);
  return axisAnnotatedEntries.map((entry) => {
    const teamShapeShare = Number(entry.scoreMix?.teamShapeShare ?? 0.5);
    const pairingShare = Number(entry.scoreMix?.pairingShare ?? 0.5);
    const activeScoreMix = {
      ...entry.scoreMix,
      ...scoreMix,
    };
    const activeTeamShapeShare = Number(activeScoreMix.teamShapeShare ?? teamShapeShare);
    const activePairingShare = Number(activeScoreMix.pairingShare ?? pairingShare);
    const compositePercent = getCompositePercent(entry, activePairingShare);
    return {
      ...entry,
      scoreMix: activeScoreMix,
      recommendationScore: compositePercent * MAX_RECOMMENDATION_SCORE * Number(entry.recommendationFloorPenalty ?? 1),
    };
  });
}
