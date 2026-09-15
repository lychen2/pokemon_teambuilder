import {expect, test} from 'vitest';
import {bootstrap, engine, meta} from './fixtures';
import {MetaModel, fitModel} from '../packages/core/analysis/model';
import {Evaluator} from '../packages/core/analysis/evaluate';
import {TeamSearch} from '../packages/core/analysis/search';
import {configurationAvailability, opponentSources, referenceSeasons} from '../packages/core/analysis/evidence';
import {revalidateCorpus} from '../packages/core/sources/revalidate';
import {createDraft, member, setKey} from '../packages/core/domain';
import {createPreviewPolicy} from '../packages/core/battle/preview-policy';
import {simulate} from '../packages/core/battle/simulation';

const oldTeams = ['M-B', 'M-A'].map(season => bootstrap.corpus.teams.find(team => team.season === season && team.status === 'valid')!);
const invalid = bootstrap.corpus.teams.find(team => team.season !== meta.season && team.status === 'invalid')!;
const coldCorpus = revalidateCorpus({...bootstrap.corpus, teams: [...oldTeams, invalid]}, engine);
const cold = new MetaModel(coldCorpus, fitModel(coldCorpus, engine, undefined, false), meta.season);

test('新赛季零样本时，真实历史配置通过当前规则校验后可推荐，当前频率仍为零', () => {
  expect(coldCorpus.teams.find(team => team.id === invalid.id)!.status).toBe('invalid');
  expect(cold.configurations.length).toBeGreaterThan(0);
  expect(cold.configurations.every(c => c.currentCount === 0 && c.currentShare === 0 && c.set.sourceKind === 'historical')).toBe(true);
  expect(cold.configurations.every(c => !engine.validateSet(c.set).length)).toBe(true);
  const evaluator = new Evaluator(engine, cold);
  expect(evaluator.threats.length).toBeGreaterThan(0);
  expect(evaluator.referenceSeasons).not.toContain(meta.season);
  const draft = createDraft(engine.snapshot().id);
  const candidate = cold.configurations[0];
  expect(configurationAvailability(cold.configurationsBySpecies.get(candidate.speciesId)!, cold.model.priorStrength).borrowHistorical).toBe(true);
  const search = new TeamSearch(evaluator);
  const proposals = search.recommend({draft, kind: 'add', options: {candidateBudget: 1, retainedConfigurationIds: [candidate.id]}});
  expect(setKey(proposals[0].members[0].set)).toBe(setKey(candidate.set));
  expect(proposals[0].tradeoffs.join('；')).toContain('历史配置');
  expect(proposals[0].tradeoffs.join('；')).toContain('不能解释为新赛季使用率');
  expect(search.candidates(draft, {allowHistorical: false})).toEqual([]);
  expect(() => search.recommend({draft, kind: 'add', options: {allowHistorical: false}})).toThrow('当前赛季没有符合条件');
});

test('新赛季观察出现后当前来源主导，历史配置不抬高当前频率', () => {
  const source = {...oldTeams[0], id: 'new-season-observation', season: meta.season};
  const corpus = revalidateCorpus({...coldCorpus, teams: [...coldCorpus.teams, source]}, engine);
  const updated = new MetaModel(corpus, fitModel(corpus, engine, undefined, false), meta.season);
  const evaluator = new Evaluator(engine, updated);
  expect(evaluator.referenceSeasons).toEqual([meta.season]);
  expect(opponentSources(corpus.teams, meta.season).map(team => team.id)).toEqual([source.id]);
  for (const id of corpus.teams.find(team => team.id === source.id)!.observationIds) {
    const set = updated.observationById.get(id)!.set;
    const configuration = updated.configurations.find(c => setKey(c.set) === setKey(set))!;
    expect(configuration.currentCount).toBe(1); expect(configuration.currentShare).toBe(1);
    expect(configuration.historyCount).toBeGreaterThan(0); expect(configuration.set.sourceKind).toBe('observed');
  }
  expect(referenceSeasons([{season: 'old', date: 'unknown'}, {season: 'recent', date: '2026-09-10'}], 'new')).toEqual(['recent']);
  expect(referenceSeasons([{season: 'B', date: ''}, {season: 'A', date: ''}], 'new')).toEqual(['A', 'B']);
});

test('关闭历史推荐时，保留项冲突显式报告，锁定物种也只新增当前配置', () => {
  const current = meta.configurations.find(c => c.speciesId === 'sneasler' && c.currentCount > 0)!;
  const historical = meta.configurations.find(c => c.speciesId === 'sneasler' && !c.currentCount)!;
  const draft = {...createDraft(engine.snapshot().id), members: [{...member(current.set), lock: {species: true, fields: []}}]};
  const search = new TeamSearch(new Evaluator(engine, meta));
  expect(() => search.candidates(draft, {allowHistorical: false, retainedConfigurationIds: [historical.id]})).toThrow('历史赛季');
  const proposals = search.recommend({draft, kind: 'replace', options: {allowHistorical: false, candidateBudget: 1}});
  expect(proposals.length).toBeGreaterThan(0);
  for (const proposal of proposals) {
    expect(proposal.members[0].set.speciesId).toBe('sneasler');
    expect(meta.configurations.find(c => setKey(c.set) === setKey(proposal.members[0].set))!.currentCount).toBeGreaterThan(0);
  }
});

test('冷启动模拟使用真实历史队伍并记录赛季，关闭后明确缺少当前对手', () => {
  const source = opponentSources(coldCorpus.teams, cold.season)[0];
  const draft = {...createDraft(engine.snapshot().id), members: source.observationIds.map(id => member(cold.observationById.get(id)!.set))};
  const evaluator = new Evaluator(engine, cold);
  const control = {cancelled: () => false, progress: () => {}, preview: createPreviewPolicy(evaluator)};
  const request = {draft, seconds: 1, trials: 1, trainingTrials: 0, seed: 221, mode: 'closed' as const};
  const result = simulate(engine, cold, request, control);
  expect(result.completed).toBe(1);
  expect(result.trace.some(line => /^\|(win|tie)\|/.test(line))).toBe(true);
  expect(result.opponentEvidence?.historical).toBe(true);
  expect(result.opponentEvidence?.seasons).not.toContain(meta.season);
  expect(result.opponents.every(row => coldCorpus.teams.find(team => team.id === row.teamId)!.season !== meta.season)).toBe(true);
  expect(() => simulate(engine, cold, {...request, allowHistoricalOpponents: false}, control)).toThrow('开启历史对手参考');
  const provided = simulate(engine, cold, {...request, allowHistoricalOpponents: false, opponentTeam: draft.members.map(m => m.set)}, control);
  expect(provided.completed).toBe(1); expect(provided.opponentEvidence?.mode).toBe('provided');
});
