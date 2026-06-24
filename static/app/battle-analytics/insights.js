import {
  COMMON_FAILURE_COUNT_MIN,
  FAVORED_WIN_MIN,
  META_APPEAR_COUNT_MIN,
  META_APPEAR_RATE_MIN,
  MIN_SAMPLE,
  OVERRATED_PICK_MIN,
  OVERRATED_WIN_MAX,
  TOUGH_WIN_MAX,
  UNDERRATED_PICK_MAX,
  UNDERRATED_WIN_MIN,
} from "./thresholds.js";

function makeInsight(type, params = {}, extra = {}) {
  return {type, params, ...extra};
}

function pickUnderratedMembers(stats) {
  if (stats.scope !== "team" || stats.totals.total < MIN_SAMPLE) return [];
  return stats.members
    .filter((m) => m.picks >= MIN_SAMPLE
      && m.pickRate <= UNDERRATED_PICK_MAX
      && m.winRate >= UNDERRATED_WIN_MIN)
    .map((m) => makeInsight("underrated", {
      speciesId: m.speciesId,
      pickRate: Math.round(m.pickRate * 100),
      winRate: Math.round(m.winRate * 100),
      n: m.picks,
    }));
}

function pickOverratedMembers(stats) {
  if (stats.scope !== "team" || stats.totals.total < MIN_SAMPLE) return [];
  return stats.members
    .filter((m) => m.picks >= MIN_SAMPLE
      && m.pickRate >= OVERRATED_PICK_MIN
      && m.winRate <= OVERRATED_WIN_MAX)
    .map((m) => makeInsight("overrated", {
      speciesId: m.speciesId,
      pickRate: Math.round(m.pickRate * 100),
      winRate: Math.round(m.winRate * 100),
      n: m.picks,
    }));
}

function pickToughMatchups(stats) {
  if (stats.totals.total < MIN_SAMPLE) return [];
  return stats.opponents
    .filter((o) => o.appearances >= META_APPEAR_COUNT_MIN
      && o.appearRate >= META_APPEAR_RATE_MIN
      && o.winRate <= TOUGH_WIN_MAX)
    .map((o) => makeInsight("tough", {
      speciesId: o.speciesId,
      winRate: Math.round(o.winRate * 100),
      n: o.appearances,
    }));
}

function pickFavoredMatchups(stats) {
  if (stats.totals.total < MIN_SAMPLE) return [];
  return stats.opponents
    .filter((o) => o.appearances >= META_APPEAR_COUNT_MIN
      && o.appearRate >= META_APPEAR_RATE_MIN
      && o.winRate >= FAVORED_WIN_MIN)
    .map((o) => makeInsight("favored", {
      speciesId: o.speciesId,
      winRate: Math.round(o.winRate * 100),
      n: o.appearances,
    }));
}

function pickCommonFailures(stats) {
  if (!stats.failureTags?.length) return [];
  return stats.failureTags
    .filter((f) => f.count >= COMMON_FAILURE_COUNT_MIN)
    .slice(0, 3)
    .map((f) => makeInsight("commonFailure", {tag: f.tag, n: f.count}));
}

function pickBestLead(stats) {
  if (stats.scope !== "team" || !stats.leadCombos?.length) return [];
  const qualified = stats.leadCombos.filter((c) => c.count >= MIN_SAMPLE);
  if (!qualified.length) return [];
  const best = qualified.reduce(
    (acc, cur) => (cur.winRate > acc.winRate ? cur : acc),
    qualified[0],
  );
  if (!best || best.winRate <= 0) return [];
  return [makeInsight("bestLead", {
    members: best.members,
    winRate: Math.round(best.winRate * 100),
    n: best.count,
  })];
}

export function computeInsights(stats) {
  if (!stats || !stats.totals) return [];
  return [
    ...pickUnderratedMembers(stats),
    ...pickOverratedMembers(stats),
    ...pickToughMatchups(stats),
    ...pickFavoredMatchups(stats),
    ...pickCommonFailures(stats),
    ...pickBestLead(stats),
  ];
}
