import {
  countResults,
  safeRate,
  tallyFailureTags,
  tallyOpponentSpecies,
} from "./helpers.js";

export function computeGlobalStats(records) {
  const list = Array.isArray(records) ? records.filter(Boolean) : [];
  const tallies = countResults(list);
  const winRate = safeRate(tallies.win, tallies.total);

  const perTeam = new Map();
  for (const r of list) {
    if (!perTeam.has(r.teamId)) {
      perTeam.set(r.teamId, {
        teamId: r.teamId,
        teamLabel: r.teamLabel || r.teamId,
        total: 0,
        wins: 0,
      });
    }
    const slot = perTeam.get(r.teamId);
    slot.total += 1;
    if (r.result === "win") slot.wins += 1;
    slot.teamLabel = r.teamLabel || slot.teamLabel;
  }
  const teamRankings = [...perTeam.values()]
    .map((entry) => ({...entry, winRate: safeRate(entry.wins, entry.total)}))
    .sort((a, b) => b.winRate - a.winRate);

  const opponents = tallyOpponentSpecies(list)
    .map((entry) => ({
      ...entry,
      appearRate: safeRate(entry.appearances, tallies.total),
      winRate: safeRate(entry.wins, entry.appearances),
    }))
    .sort((a, b) => b.appearances - a.appearances);

  const failureTags = tallyFailureTags(list);

  return {
    scope: "global",
    totals: tallies,
    winRate,
    teamRankings,
    opponents,
    failureTags,
    records: list,
  };
}
