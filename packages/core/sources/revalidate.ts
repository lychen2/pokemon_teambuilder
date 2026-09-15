import type {BattleEngine} from '../battle/engine';
import type {Corpus, SetObservation, SourceTeam} from '../types';
import {SPREADSHEET_ID} from './corpus';
import {complete, hash, teamKey} from '../domain';

export function revalidateCorpus(source: Corpus, engine: BattleEngine): Corpus {
  const environment = engine.snapshot();
  const observations: SetObservation[] = [];
  const teams = source.teams.map((original): SourceTeam => {
    if (!original.raw) return {...original, status: 'fetch-error'};
    const parsed = engine.parse(original.raw, original.season === environment.season ? 'observed' : 'historical');
    const errors: string[] = [];
    const team: SourceTeam = {...original, errors: [...parsed.issues], observationIds: [], fingerprint: teamKey(parsed.sets)};
    for (const [slot, set] of parsed.sets.entries()) {
      const id = `${team.id}:${slot}`; const issues = engine.validateKnownSet(set);
      observations.push({id, teamId: team.id, season: team.season, slot, set: {...set, sourceIds: [id]}, date: team.date, author: team.author, url: team.url,
        known: {points: set.points !== null, nature: set.natureId !== null, ability: set.abilityId !== null, item: set.itemId !== null, moves: set.moves.length === 4}, currentLegal: complete(set) && !issues.length, knownLegal: !issues.length, errors: issues});
      team.observationIds.push(id); errors.push(...issues.map(e => `${engine.display(set.speciesId)}：${e}`));
    }
    if (parsed.sets.length !== engine.ruleTable.maxTeamSize) errors.push(`队伍包含 ${parsed.sets.length} 只，规则需要 ${engine.ruleTable.maxTeamSize} 只。`);
    if (parsed.sets.length === engine.ruleTable.maxTeamSize && parsed.sets.every(complete)) errors.push(...(engine.validator.validateTeam(parsed.sets.map(s => engine.toPS(s))) ?? []));
    team.errors.push(...errors);
    team.status = errors.length ? 'invalid' : parsed.issues.length || !parsed.sets.every(complete) ? 'partial' : 'valid';
    return team;
  });
  const reports = source.reports.map(report => {const rows = teams.filter(t => t.sheetId === report.gid && (t.documentId ?? SPREADSHEET_ID) === (report.documentId ?? SPREADSHEET_ID)); return {...report, complete: rows.filter(t => t.status === 'valid').length, partial: rows.filter(t => t.status === 'partial').length, invalid: rows.filter(t => t.status === 'invalid').length};});
  return {version: hash([environment.id, teams, observations.map(o => [o.id, o.currentLegal, o.known])]), updatedAt: new Date().toISOString(), teams, observations, reports};
}
