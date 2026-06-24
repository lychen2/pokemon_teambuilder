import {
  countResults,
  safeRate,
  tallyFailureTags,
  tallyKoChains,
  tallyLineupCombos,
  tallyMembers,
  tallyOpponentSpecies,
} from "./helpers.js";

const TOP_LIMIT = 5;

export function computeTeamStats(records, teamId) {
  const filtered = Array.isArray(records)
    ? records.filter((r) => r && r.teamId === teamId)
    : [];
  const tallies = countResults(filtered);
  const winRate = safeRate(tallies.win, tallies.total);

  const members = tallyMembers(filtered, "ourLineup")
    .map((entry) => ({
      ...entry,
      pickRate: safeRate(entry.picks, tallies.total),
      winRate: safeRate(entry.wins, entry.picks),
    }))
    .sort((a, b) => b.picks - a.picks);

  const leadCombos = tallyLineupCombos(filtered, "ourLead")
    .map((entry) => ({...entry, winRate: safeRate(entry.wins, entry.count)}))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_LIMIT);

  const lineupCombos = tallyLineupCombos(filtered, "ourLineup")
    .map((entry) => ({...entry, winRate: safeRate(entry.wins, entry.count)}))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_LIMIT);

  const opponents = tallyOpponentSpecies(filtered)
    .map((entry) => ({
      ...entry,
      appearRate: safeRate(entry.appearances, tallies.total),
      winRate: safeRate(entry.wins, entry.appearances),
    }))
    .sort((a, b) => b.appearances - a.appearances);

  const failureTags = tallyFailureTags(filtered);
  const koChains = tallyKoChains(filtered);

  return {
    scope: "team",
    teamId,
    totals: tallies,
    winRate,
    members,
    leadCombos,
    lineupCombos,
    opponents,
    failureTags,
    koChains,
    records: filtered,
  };
}
