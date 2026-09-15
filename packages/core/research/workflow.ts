import type {EnvironmentSnapshot, TeamDraft} from '../types';
import type {MatchRecord, MatchSummary, ResearchEntry} from './types';

export function validateResearch(entry: ResearchEntry, environment: EnvironmentSnapshot): void {
  if (entry.environmentId !== environment.id) throw new Error('记录与规则环境不一致。');
  const checkSelection = (snapshot: TeamDraft, selection: string[], leads: string[], required: boolean) => {
    const ids = new Set(snapshot.members.map(member => member.id));
    if (new Set(selection).size !== selection.length || selection.some(id => !ids.has(id))) throw new Error('选出必须来自这份队伍版本，且不能重复。');
    if ((required || selection.length > 0) && selection.length !== environment.pickedTeamSize) throw new Error(`该规则需要选出 ${environment.pickedTeamSize} 位成员；未知选出可以留空。`);
    if (new Set(leads).size !== leads.length || leads.some(id => !selection.includes(id)) || leads.length > 2) throw new Error('首发必须是选出中的两位不同成员；未知首发可以留空。');
  };
  if ('snapshot' in entry) {
    if (entry.snapshot.id !== entry.draftId || entry.snapshot.environmentId !== entry.environmentId) throw new Error('记录必须关联其真实队伍快照。');
    if (entry.opponentSpecies.length > environment.teamSize) throw new Error('对手物种数超过规则队伍人数。');
  }
  if (entry.kind === 'plan') for (const route of entry.routes) checkSelection(entry.snapshot, route.selection, route.leads, route.status === 'tested');
  if (entry.kind === 'match') checkSelection(entry.snapshot, entry.selection, entry.leads, false);
  if (entry.kind === 'source' && entry.parentSourceIds.includes(entry.sourceId)) throw new Error('来源不能作为自己的上游。');
  if (entry.kind === 'document') for (const claim of entry.claims) {
    if (!claim.quote.trim() || !entry.raw.includes(claim.quote)) throw new Error('每项提取结论必须包含可在原文定位的引文。');
  }
}

export function matchSummary(records: readonly MatchRecord[]): MatchSummary {
  const members = new Map<string, MatchSummary['members'][number]>();
  const reasons = new Map<string, number>();
  for (const record of records) {
    if (record.selection.length) for (const member of record.snapshot.members) {
      const row = members.get(member.set.speciesId) ?? {speciesId: member.set.speciesId, available: 0, selected: 0, led: 0};
      row.available++;
      if (record.selection.includes(member.id)) row.selected++;
      if (record.leads.includes(member.id)) row.led++;
      members.set(row.speciesId, row);
    }
    for (const reason of new Set(record.reasons)) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  return {
    total: records.length, labelled: records.filter(r => r.result !== 'unknown').length,
    wins: records.filter(r => r.result === 'win').length, losses: records.filter(r => r.result === 'loss').length,
    ties: records.filter(r => r.result === 'tie').length, selectionKnown: records.filter(r => r.selection.length > 0).length,
    members: [...members.values()].sort((a, b) => a.selected / a.available - b.selected / b.available),
    reasons: [...reasons].map(([label, count]) => ({label, count})).sort((a, b) => b.count - a.count),
    environments: [...new Set(records.map(r => r.environmentId))],
  };
}
