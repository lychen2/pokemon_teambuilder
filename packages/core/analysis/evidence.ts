import type {Configuration, SourceTeam} from '../types';

/** The fitted prior mass defines when a species still has less current evidence than historical prior support. */
export function configurationAvailability(configurations: readonly Configuration[], priorStrength: number) {
  const current = configurations.reduce((sum, configuration) => sum + configuration.currentCount, 0);
  const historical = configurations.reduce((sum, configuration) => sum + configuration.historyCount, 0);
  return {current, historical, borrowHistorical: historical > 0 && current < Math.max(1, priorStrength)};
}

/** New seasons can start without observations. Prefer dated, recent evidence; never relabel its season. */
export function referenceSeasons(rows: readonly {season: string; date: string}[], currentSeason: string): string[] {
  if (rows.some(row => row.season === currentSeason)) return [currentSeason];
  const dates = new Map<string, number>();
  for (const row of rows) {
    const parsed = Date.parse(row.date);
    dates.set(row.season, Math.max(dates.get(row.season) ?? 0, Number.isFinite(parsed) ? parsed : 0));
  }
  const ranked = [...dates].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked[0]?.[1] ? [ranked[0][0]] : ranked.map(([season]) => season);
}

export function opponentSources(teams: readonly SourceTeam[], season: string, allowHistorical = true): SourceTeam[] {
  const legal = teams.filter(team => team.status === 'valid' && (allowHistorical || team.season === season));
  const selected = referenceSeasons(legal, season); const seen = new Set<string>();
  return legal.filter(team => {if (!selected.includes(team.season) || seen.has(team.fingerprint)) return false; seen.add(team.fingerprint); return true;});
}
