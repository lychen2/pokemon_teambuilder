import {expect, test, vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {BattleEngine} from '../packages/core/battle/engine';
import {bootstrap, engine, meta, fullDraft} from './fixtures';
import {MetaModel} from '../packages/core/analysis/model';
import {Evaluator} from '../packages/core/analysis/evaluate';
import {SearchBudgetError, TeamSearch} from '../packages/core/analysis/search';
import {fieldDistribution} from '../packages/core/analysis/calibration';
import {conditionedConfigurations} from '../packages/core/battle/configuration-beliefs';
import {ResearchStore} from '../packages/core/research/storage';
import {ALGORITHM_VERSION, createDraft, member, setKey} from '../packages/core/domain';
import {analyzeSelections} from '../packages/core/analysis/selections';
import {selectionIsCurrent} from '../packages/core/analysis/selection-context';
import type {ResearchPreferences} from '../packages/core/research/types';

test('非代表的帮助咆哮虎和佯攻大狃拉保留真实配置、条件概率和搜索来源', () => {
  const search = new TeamSearch(new Evaluator(engine, meta));
  for (const [species, move] of [['incineroar', 'helpinghand'], ['sneasler', 'feint']]) {
    const configuration = meta.configurations.find(c => c.speciesId === species && !c.isRepresentative && c.currentCount > 0 && c.set.moves.includes(move))!;
    expect(configuration).toBeDefined();
    const posterior = meta.configurationPosterior(species, [], {moves: [move]});
    expect(posterior.length).toBeGreaterThan(0);
    expect(posterior.reduce((sum, row) => sum + row.probability, 0)).toBeCloseTo(1);
    expect(posterior.every(row => meta.configurationById.get(row.configurationId)!.set.moves.includes(move))).toBe(true);
    const hypotheses = conditionedConfigurations(meta, engine, species, [], {moves: [move]});
    expect(hypotheses.every(row => !row.generated && row.set.moves.includes(move))).toBe(true);
    const draft = createDraft(engine.snapshot().id);
    const result = search.recommend({draft, kind: 'add', options: {candidateBudget: 1, retainedConfigurationIds: [configuration.id]}});
    expect(result).toHaveLength(1);
    expect(setKey(result[0].members[0].set)).toBe(setKey(configuration.set));
    expect(engine.validateSet(result[0].members[0].set)).toEqual([]);
    expect(result[0].generated).toBe(false);
    expect(result[0].sourceUrls).toContain(meta.observationById.get(configuration.observationIds[0])!.url);
    expect(configuration.observationIds.every(id => setKey(meta.observationById.get(id)!.set) === setKey(configuration.set))).toBe(true);
  }
});

test('配置与流派后验、字段概率使用同一个分布，原代表 ID 稳定', () => {
  for (const archetype of bootstrap.model.archetypes) expect(meta.configurationById.get(archetype.id)?.isRepresentative).toBe(true);
  const posterior = meta.configurationPosterior('sneasler', ['rillaboom']);
  const archetypes = meta.posterior('sneasler', ['rillaboom']);
  for (const archetype of archetypes) expect(archetype.probability).toBeCloseTo(posterior.filter(row => row.archetypeId === archetype.archetypeId).reduce((sum, row) => sum + row.probability, 0));
  const fields = fieldDistribution(meta, 'sneasler', ['rillaboom'], 'moves', bootstrap.model.calibration?.temperature ?? 1);
  const key = (moves: string[]) => [...moves].sort().join(',');
  for (const [value, probability] of fields) {
    if (value === '__unseen__') continue;
    const expected = posterior.filter(row => key(meta.configurationById.get(row.configurationId)!.set.moves) === value).reduce((sum, row) => sum + row.probability, 0) * (1 - fields.get('__unseen__')!);
    expect(probability).toBeCloseTo(expected);
  }
});

test('完全相同的转贴只增加来源，历史不提高当前样本频率', () => {
  const c = meta.configurations.find(c => c.currentCount > 0 && c.set.moves.includes('helpinghand'))!;
  const observation = c.observationIds.map(id => meta.observationById.get(id)!).find(row => row.season === meta.season)!;
  const original = bootstrap.corpus.teams.find(team => team.id === observation.teamId)!;
  const copies = ['copy', 'history-copy'].map(id => ({...original, id, season: id === 'copy' ? meta.season : 'PREVIOUS', observationIds: [`${id}:0`]}));
  const newObservations = copies.map(team => ({...observation, id: team.observationIds[0], teamId: team.id, season: team.season}));
  const model = {...bootstrap.model, archetypes: bootstrap.model.archetypes.map(a => a.id === c.archetypeId ? {...a, observationIds: [...a.observationIds, ...newObservations.map(row => row.id)]} : a)};
  const augmented = new MetaModel({...bootstrap.corpus, teams: [...bootstrap.corpus.teams, ...copies], observations: [...bootstrap.corpus.observations, ...newObservations]}, model, meta.season);
  const changed = augmented.configurationById.get(c.id)!;
  expect(changed.currentCount).toBe(c.currentCount); expect(changed.currentShare).toBe(c.currentShare);
  expect(changed.observationIds.length).toBe(c.observationIds.length + 2);
  expect(changed.set.points).toEqual(c.set.points);
});

test('已保存的代表保留项迁移为真实配置 ID，重复打开不改变记录', () => {
  const db = new DatabaseSync(':memory:');
  try {
    new ResearchStore(db);
    const legacy = {id: 'pref', kind: 'preferences', revision: 3, draftId: 'draft', environmentId: bootstrap.environment.id, updatedAt: '2026-09-14', weights: {pressure: 3, resilience: 1, speed: .6, coverage: 1, tailRisk: 1.5}, retainedArchetypeIds: [bootstrap.model.archetypes[0].id], notes: '保留原选择'};
    db.prepare('INSERT INTO research_entries VALUES(?,?,?,?,?,?)').run(legacy.id, legacy.kind, legacy.draftId, legacy.environmentId, legacy.revision, JSON.stringify(legacy));
    const store = new ResearchStore(db); const migrated = store.entries()[0] as ResearchPreferences;
    expect(migrated.retainedConfigurationIds).toEqual(legacy.retainedArchetypeIds);
    expect(migrated).not.toHaveProperty('retainedArchetypeIds'); expect(migrated.revision).toBe(3); expect(migrated.notes).toBe(legacy.notes);
    expect(meta.configurationById.has(migrated.retainedConfigurationIds[0])).toBe(true);
    expect(new ResearchStore(db).entries()[0]).toEqual(migrated);
  } finally {db.close();}
});

test('选出比较全部首发；换队、换对手、规则或数据变化不能保存旧路线', () => {
  const draft = fullDraft();
  const result = analyzeSelections(new Evaluator(engine, meta), draft, ['sneasler']);
  expect(result.routes).toHaveLength(35); // 15 four-member selections, plus 10 routes for each of the two Mega users.
  expect(new Set(result.routes.map(route => [...route.members].sort().join(','))).size).toBe(15);
  expect(new Set(result.routes.map(route => route.megaId)).size).toBe(3);
  expect(result.routes.every(route => route.leadOptions.length === 6 && route.leadOptions.every(lead => lead.members.every(id => route.members.includes(id))))).toBe(true);
  const versions = {corpusVersion: meta.corpus.version, modelVersion: meta.model.version, algorithmVersion: ALGORITHM_VERSION};
  expect(selectionIsCurrent(result, {...draft, notes: '新笔记', revision: 1}, versions, ['sneasler'])).toBe(true);
  expect(selectionIsCurrent(result, {...draft, id: 'other-draft'}, versions, ['sneasler'])).toBe(false);
  expect(selectionIsCurrent(result, draft, versions, ['incineroar'])).toBe(false);
  expect(selectionIsCurrent(result, {...draft, environmentId: 'next-rule'}, versions, ['sneasler'])).toBe(false);
  expect(selectionIsCurrent(result, draft, {...versions, corpusVersion: 'next-data'}, ['sneasler'])).toBe(false);
  expect(selectionIsCurrent(result, {...draft, analysisRevision: 1}, versions, ['sneasler'])).toBe(false);
});

test('显式搜索时间预算不足时不返回未完成队伍，正常调用没有隐含时间上限', () => {
  const draft = {...fullDraft(), members: fullDraft().members.slice(0, 2)};
  const search = new TeamSearch(new Evaluator(engine, meta));
  expect(() => search.recommend({draft, kind: 'complete', options: {timeBudgetMs: 0.001}})).toThrow(SearchBudgetError);
  const configuration = meta.configurations.find(c => c.currentCount > 0)!;
  const result = search.recommend({draft: createDraft(engine.snapshot().id), kind: 'add', options: {candidateBudget: 1, retainedConfigurationIds: [configuration.id]}});
  expect(result[0].search?.budgetMs).toBeNull(); expect(result[0].search?.deadlineReached).toBe(false);
});

test('补齐提案保持核心与选出引用，重复请求结果一致且候选标识独立', () => {
  const original = fullDraft();
  const draft = {...original, members: original.members.slice(0, 2)};
  const evaluator = new Evaluator(engine, meta); const search = new TeamSearch(evaluator);
  const pool = original.members.slice(2).map(member => meta.configurations.find(configuration => setKey(configuration.set) === setKey(member.set))!);
  expect(pool.every(Boolean)).toBe(true);
  const candidates = vi.spyOn(search, 'candidates').mockReturnValue(pool);
  try {
    const first = search.recommend({draft, kind: 'complete'});
    expect(first.length).toBeGreaterThan(0);
    for (const proposal of first) {
      expect(engine.validateDraft({...draft, members: proposal.members})).toEqual([]);
      expect(proposal.members.slice(0, 2)).toEqual(draft.members);
      expect(new Set(proposal.members.map(member => member.id)).size).toBe(6);
      for (const comparison of proposal.lineupComparisons ?? []) {
        expect(comparison.before.members.every(id => draft.members.some(member => member.id === id))).toBe(true);
        expect(comparison.after.members.every(id => proposal.members.some(member => member.id === id))).toBe(true);
        expect(comparison.after.megaId === null || comparison.after.members.includes(comparison.after.megaId)).toBe(true);
      }
    }
    const second = search.recommend({draft, kind: 'complete'});
    expect(second.map(proposal => proposal.members.map(member => setKey(member.set)))).toEqual(first.map(proposal => proposal.members.map(member => setKey(member.set))));
    expect(second.map(proposal => proposal.metrics)).toEqual(first.map(proposal => proposal.metrics));
    const firstIds = new Set(first.flatMap(proposal => proposal.members.slice(2).map(member => member.id)));
    expect(second.every(proposal => proposal.members.slice(2).every(member => !firstIds.has(member.id)))).toBe(true);
  } finally {candidates.mockRestore();}
});

test('允许重复物种的规则下跨层补齐仍为每位成员分配独立标识', () => {
  const next = new BattleEngine(resolve('assets/engines', bootstrap.engine.id), `${engine.formatId}@@@!Species Clause,!Item Clause`, bootstrap.translations);
  expect(next.ruleTable.has('speciesclause')).toBe(false);
  const search = new TeamSearch(new Evaluator(next, meta));
  const configuration = meta.configurations.find(configuration => configuration.set.speciesId === 'rillaboom' && configuration.currentCount > 0)!;
  const candidates = vi.spyOn(search, 'candidates').mockReturnValue([configuration]);
  try {
    const draft = createDraft(next.snapshot().id);
    const proposals = search.recommend({draft, kind: 'complete'});
    expect(proposals).toHaveLength(1);
    expect(proposals[0].members).toHaveLength(6);
    expect(new Set(proposals[0].members.map(member => member.id)).size).toBe(6);
    expect(next.validateDraft({...draft, members: proposals[0].members})).toEqual([]);
  } finally {candidates.mockRestore();}
});

test('作者队报的掩护、空间及款待路线随关键队友改变，未知初始特性不冒充原配置', () => {
  const [source] = JSON.parse(readFileSync('docs/research/source-intent-cases.json', 'utf8'));
  expect(source.claims.every((claim: {quote: string}) => source.raw.includes(claim.quote))).toBe(true);
  const parsed = engine.parse(source.setText, 'historical');
  expect(parsed.issues).toEqual(['Mawile-Mega 需要补充 Mega 前的特性。']);
  expect(parsed.sets.find(set => set.speciesId === 'mawile')!.abilityId).toBeNull();
  const sets = parsed.sets.map(set => set.speciesId === 'mawile' ? {...set, abilityId: 'intimidate', sourceKind: 'generated' as const} : set);
  const draft = {...createDraft(engine.snapshot().id), members: sets.map(set => ({...member(set), id: set.speciesId}))};
  expect(engine.validateDraft(draft)).toEqual([]);
  const evaluator = new Evaluator(engine, meta); const result = analyzeSelections(evaluator, draft);
  const expected = result.routes.find(route => ['mawile', 'sinistcha', 'incineroar', 'basculegion'].every(id => route.members.includes(id)))!;
  expect(expected.dependencies.some(d => d.supportId === 'sinistcha' && d.beneficiaryId === 'mawile' && d.reason.includes('强化'))).toBe(true);
  expect(expected.dependencies.some(d => d.supportId === 'incineroar' && d.beneficiaryId === 'sinistcha' && d.reason.includes('空间'))).toBe(true);
  expect(expected.winConditions.some(text => text.includes('幽尾玄鱼') && text.includes('高速'))).toBe(true);
  expect(result.routes.some(route => route.dependencies.some(d => d.supportId === 'sinistcha' && d.beneficiaryId === 'dragonite' && d.reason.includes('多重鳞片')))).toBe(true);
  const withoutMawile = analyzeSelections(evaluator, {...draft, members: draft.members.filter(m => m.id !== 'mawile')});
  expect(withoutMawile.routes.flatMap(route => route.dependencies).some(d => d.beneficiaryId === 'mawile')).toBe(false);
  expect(withoutMawile.routes.flatMap(route => route.winConditions).some(text => text.includes('强化窗口'))).toBe(false);
  const own = ['dragonite', 'incineroar', 'sinistcha', 'mawile', 'basculegion', 'ninetalesalola'].map(id => sets.find(s => s.speciesId === id)!);
  const battle = new engine.ps.Battle({format: engine.ps.Dex.formats.get(engine.formatId + '@@@!Open Team Sheets'), seed: [7, 13, 17, 29], p1: {name: 'A', team: own.map(s => engine.toPS(s))}, p2: {name: 'B', team: own.map(s => engine.toPS(s))}});
  try {
    battle.makeChoices('team 1234', 'team 1432');
    const dragonite = battle.p1.active[0]; dragonite.hp -= Math.floor(dragonite.maxhp / 8);
    battle.makeChoices('move protect, switch 3', 'move protect, move protect');
    expect(dragonite.hp).toBe(dragonite.maxhp);
    expect(battle.log.some((line: string) => line.includes('Hospitality'))).toBe(true);
  } finally {battle.destroy();}
});
