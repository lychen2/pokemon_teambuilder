import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {cpus, totalmem} from 'node:os';
import type {BootstrapData, Corpus, PokemonSet} from '../packages/core/types';
import {BattleEngine} from '../packages/core/battle/engine';
import {fitModel, MetaModel} from '../packages/core/analysis/model';
import {temporalSplit, scoreProbabilities, fieldDistribution} from '../packages/core/analysis/calibration';
import {attachPartialEvidence} from '../packages/core/analysis/partial-evidence';
import {Evaluator} from '../packages/core/analysis/evaluate';
import {SearchBudgetError, TeamSearch} from '../packages/core/analysis/search';
import {ALGORITHM_VERSION, createDraft, hash, member, setKey} from '../packages/core/domain';

const input = process.argv.find(value => value.startsWith('--input='))?.slice(8) ?? 'assets/bootstrap.json';
const b: BootstrapData = JSON.parse(await readFile(input, 'utf8'));
const engine = new BattleEngine(resolve('assets/engines', b.engine.id), b.environment.formatId, b.translations);
const split = temporalSplit(b.corpus, b.environment.season);
if (!split.held.length) throw new Error('没有带日期的完整留出队伍。');
console.log(`训练 ${split.train.teams.length}，留出 ${split.held.length}；内部子集校准不会使用外层留出标签。`);
const model = fitModel(split.train, engine, console.log);
const meta = new MetaModel(split.train, model, b.environment.season);
const withoutPartial = new MetaModel(split.train, {...model, archetypes: model.archetypes.map(a => ({...a, partialEvidence: []}))}, meta.season);
const withoutHistory = new MetaModel(split.train, {...model, priorStrength: 0}, meta.season);
const probability = {
  uncalibrated: scoreProbabilities(meta, b.corpus, split.held, 1),
  calibrated: scoreProbabilities(meta, b.corpus, split.held, model.calibration?.temperature ?? 1),
  noPartialEvidence: scoreProbabilities(withoutPartial, b.corpus, split.held, model.calibration?.temperature ?? 1),
  noHistoryPrior: scoreProbabilities(withoutHistory, b.corpus, split.held, model.calibration?.temperature ?? 1),
};
const observations = new Map(b.corpus.observations.map(o => [o.id, o]));
const heldObservations = split.held.flatMap(team => team.observationIds.map(id => observations.get(id)!));
const exactGroups = new Map<string, Set<string>>();
for (const archetype of model.archetypes) for (const id of archetype.observationIds) {const key = setKey(meta.observationById.get(id)!.set); const group = exactGroups.get(key) ?? new Set<string>(); group.add(archetype.id); exactGroups.set(key, group);}
const masking = [];
for (const mode of ['points', 'points-nature', 'points-nature-item'] as const) {
  const masked = heldObservations.map(o => {
    const set: PokemonSet = {...o.set, points: null, natureId: mode === 'points' ? o.set.natureId : null, itemId: mode === 'points-nature-item' ? null : o.set.itemId};
    return {...o, set, currentLegal: false, knownLegal: engine.validateKnownSet(set).length === 0, known: {...o.known, points: false, nature: set.natureId !== null, item: set.itemId !== null}};
  });
  const corpus: Corpus = {...split.train, version: hash([mode, split.train.version]), teams: [...split.train.teams, ...split.held.map(t => ({...t, status: 'partial' as const}))], observations: [...split.train.observations, ...masked]};
  const partial = attachPartialEvidence(corpus, model.archetypes, meta.season);
  const changed = new MetaModel(corpus, {...model, archetypes: partial.archetypes}, meta.season);
  let assigned = 0; let identifiable = 0; let trueGroupMass = 0; let itemLoss = 0; let itemSamples = 0;
  for (const o of heldObservations) {
    const rows = partial.archetypes.flatMap(a => (a.partialEvidence ?? []).filter(p => p.observationId === o.id).map(p => ({id: a.id, weight: p.weight})));
    if (rows.length) assigned++;
    const truth = exactGroups.get(setKey(o.set));
    if (truth) {identifiable++; trueGroupMass += rows.filter(row => truth.has(row.id)).reduce((sum, row) => sum + row.weight, 0);}
    if (mode === 'points-nature-item') {
      const team = observations.get(o.id)!; const source = b.corpus.teams.find(t => t.id === team.teamId)!;
      const distribution = fieldDistribution(changed, o.set.speciesId, source.observationIds.map(id => observations.get(id)!.set.speciesId), 'itemId', model.calibration?.temperature ?? 1);
      itemLoss -= Math.log(distribution.get(o.set.itemId!) ?? distribution.get('__unseen__')!); itemSamples++;
    }
  }
  masking.push({mode, observations: masked.length, assigned, identifiableInTraining: identifiable, meanTrueGroupMass: identifiable ? trueGroupMass / identifiable : null, hiddenItemLogLoss: itemSamples ? itemLoss / itemSamples : null,
    medoidsUnchanged: partial.archetypes.every((a, i) => setKey(a.representative) === setKey(model.archetypes[i].representative)), missingPointsRemainUnknown: masked.every(o => o.set.points === null)});
}
console.log('概率校准与受控遮蔽完成，开始候选召回和搜索宽度消融。');
const search = new TeamSearch(new Evaluator(engine, meta));
const ablations = [];
const timedAblations = [];
for (const team of split.held.slice(0, 2)) {
  const sets = team.observationIds.map(id => observations.get(id)!.set);
  const draft = {...createDraft(b.environment.id), members: sets.slice(0, 2).map(s => ({...member(s), lock: {species: true, fields: []}}))};
  const rare = meta.configurations.filter(a => a.currentCount > 0 && a.currentCount <= 2 && a.set.moves.some(id => ['feint', 'helpinghand', 'revivalblessing', 'perishsong', 'wideguard', 'quickguard'].includes(id)));
  for (const candidateBudget of [24, 48, 96]) for (const beamWidth of [4, 7, 12]) {
    const start = performance.now(); const candidates = search.candidates(draft, {candidateBudget});
    const proposals = search.recommend({draft, kind: 'complete', options: {candidateBudget, beamWidth}});
    const forced = rare[0] ? search.candidates(draft, {candidateBudget, retainedConfigurationIds: [rare[0].id]}).some(a => a.id === rare[0].id) : null;
    ablations.push({source: team.id, candidateBudget, beamWidth, elapsedMs: performance.now() - start, retainedRare: rare.filter(a => candidates.some(c => c.id === a.id)).length, rareAvailable: rare.length, forcedRetention: forced,
      solutions: proposals.length, recovery: proposals[0].members.slice(2).filter(m => sets.slice(2).some(s => s.speciesId === m.set.speciesId)).length / 4,
      legal: proposals.every(p => !engine.validateDraft({...draft, members: p.members}).length), score: proposals[0].metrics});
  }
  for (const candidateBudget of [24, 48, 96]) for (const beamWidth of [4, 7, 12]) {
    const isolatedEngine = new BattleEngine(resolve('assets/engines', b.engine.id), b.environment.formatId, b.translations);
    const isolated = new TeamSearch(new Evaluator(isolatedEngine, meta));
    const candidates = isolated.candidates(draft, {candidateBudget});
    const start = performance.now(); const budgetMs = 3000;
    try {
      const proposals = isolated.recommend({draft, kind: 'complete', options: {candidateBudget, beamWidth, timeBudgetMs: budgetMs}});
      const elapsedMs = performance.now() - start;
      timedAblations.push({source: team.id, candidateBudget, beamWidth, budgetMs, elapsedMs, overrunMs: Math.max(0, elapsedMs - budgetMs), status: 'completed-proposals', statistics: proposals[0].search,
        retainedRare: rare.filter(a => candidates.some(c => c.id === a.id)).length, rareAvailable: rare.length, solutions: proposals.length,
        recovery: proposals[0].members.slice(2).filter(m => sets.slice(2).some(s => s.speciesId === m.set.speciesId)).length / 4,
        legal: proposals.every(p => !isolatedEngine.validateDraft({...draft, members: p.members}).length), score: proposals[0].metrics});
    } catch (error) {
      if (!(error instanceof SearchBudgetError)) throw error;
      const elapsedMs = performance.now() - start;
      timedAblations.push({source: team.id, candidateBudget, beamWidth, budgetMs, elapsedMs, overrunMs: Math.max(0, elapsedMs - budgetMs), status: 'budget-before-complete-team', statistics: error.statistics,
        retainedRare: rare.filter(a => candidates.some(c => c.id === a.id)).length, rareAvailable: rare.length, solutions: 0, recovery: null, legal: null, score: null});
    }
    console.log(`同墙钟预算 ${team.id} 候选 ${candidateBudget} / 束宽 ${beamWidth}: ${timedAblations.at(-1)!.status}`);
  }
}
const report = {createdAt: new Date().toISOString(), algorithmVersion: ALGORITHM_VERSION, corpusVersion: b.corpus.version, environmentId: b.environment.id, modelVersion: model.version,
  machine: {cpu: cpus()[0].model, threads: cpus().length, ramGiB: totalmem() / 1024 ** 3}, split: {cutoff: split.cutoff, training: split.train.teams.length, heldTeams: split.held.length, independentNewExternalSamples: 0}, probability, masking, ablations, timedAblations,
  notes: ['字段概率直接汇总搜索与模拟共用的真实配置后验；去掉历史先验时，历史配置标签仍保留。', '当前留出已用于开发，不是新的盲测；新的资料可通过 --input=bootstrap.json 使用相同流程评估。', '遮蔽实验将真实留出配置的部分字段作为已知观察，隐藏值不填零；只有训练中存在完全相同配置时，才能报告真实流派分配质量。', '遮蔽模式的隐藏道具损失是受控信息补充后的诊断，不与完全无已知字段的盲推断成绩混称同一指标。', '低频召回分母为训练中当前出现 1–2 次且含指定技术招式的真实完整变体；配点差异保留。不代表未知新配置的召回能力。', 'ablations 为不限制时间的节点参数实验；timedAblations 每组采用独立空伤害缓存和相同 3000 毫秒墙钟预算。超时前尚未成队则报告零方案；正在执行的单次评估及结果整理可能造成少量超时，另列 overrunMs。应用默认没有强加这一实验时间上限。']};
await mkdir('docs/reports', {recursive: true}); await writeFile('docs/reports/research-benchmark.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({probability, masking, ablations}, null, 2));
