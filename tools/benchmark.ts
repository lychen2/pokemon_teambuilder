import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {cpus, totalmem} from 'node:os';
import {BattleEngine} from '../packages/core/battle/engine';
import {fitModel, MetaModel} from '../packages/core/analysis/model';
import {Evaluator} from '../packages/core/analysis/evaluate';
import {TeamSearch} from '../packages/core/analysis/search';
import {simulate} from '../packages/core/battle/simulation';
import {createPreviewPolicy} from '../packages/core/battle/preview-policy';
import {ALGORITHM_VERSION, createDraft, hash, member, setKey, teamKey} from '../packages/core/domain';
import {STAT_KEYS, type BootstrapData, type Corpus, type PokemonSet, type SourceTeam} from '../packages/core/types';
import {legacyArchetypes, loadLegacyRecommender} from './legacy-baselines';

const b: BootstrapData = JSON.parse(await readFile('assets/bootstrap.json', 'utf8'));
const engine = new BattleEngine(resolve('assets/engines', b.engine.id), b.environment.formatId, b.translations);
const parameter = (name: string, value: number) => {const text = process.argv.find(a => a.startsWith(`--${name}=`)); return text ? Number(text.split('=')[1]) : value;};
const caseCount = parameter('team-cases', 6); const trials = parameter('sim-trials', 24);
if (![caseCount, trials].every(n => Number.isInteger(n) && n > 0)) throw new Error('评测案例数与模拟场数必须是正整数。');
const date = (s: string) => Number.isFinite(Date.parse(s)) ? Date.parse(s) : 0;
const fingerprintGroups = new Map<string, SourceTeam[]>();
for (const team of b.corpus.teams) {const group = fingerprintGroups.get(team.fingerprint) ?? []; group.push(team); fingerprintGroups.set(team.fingerprint, group);}
const current = b.corpus.teams.filter(t => t.season === b.environment.season && t.status === 'valid' && date(t.date))
  .filter((t, i, rows) => rows.findIndex(o => o.fingerprint === t.fingerprint) === i).sort((a, b) => date(a.date) - date(b.date) || a.id.localeCompare(b.id));
const cutoff = date(current[Math.floor(current.length * 0.75)].date);
const held = current.filter(t => date(t.date) >= cutoff);
const fingerprints = new Set(held.map(t => t.fingerprint));
const authors = new Set(held.flatMap(t => fingerprintGroups.get(t.fingerprint)!.map(o => o.author.trim().toLowerCase())).filter(Boolean));
const origins = new Set(held.flatMap(t => fingerprintGroups.get(t.fingerprint)!.map(o => o.originUrl)).filter(Boolean));
const eligible = b.corpus.teams.filter(t => date(t.date) && date(t.date) < cutoff && !fingerprints.has(t.fingerprint) && !authors.has(t.author.trim().toLowerCase()) && (!t.originUrl || !origins.has(t.originUrl)));
const allowed = new Set(eligible.map(t => t.id));
const corpus: Corpus = {...b.corpus, version: hash(['holdout-v1', b.corpus.version, [...allowed].sort()]), teams: eligible, observations: b.corpus.observations.filter(o => allowed.has(o.teamId)), reports: []};
console.log(`时间切分 ${new Date(cutoff).toISOString().slice(0, 10)}：训练 ${eligible.length} 条来源，留出 ${held.length} 个独立 M-C 队伍；隔离作者、相同队伍及相同来源链接。`);
const fitted = fitModel(corpus, engine, console.log); const meta = new MetaModel(corpus, fitted, b.environment.season);
const evaluator = new Evaluator(engine, meta); const search = new TeamSearch(evaluator);
const oldRecommend = await loadLegacyRecommender(resolve(process.env.POKE_REFERENCE_DIR || '../poke-type'), engine, meta);
const rowsBySpecies = new Map<string, typeof corpus.observations>();
const seenObservation = new Set<string>(); const teamFingerprints = new Map(corpus.teams.map(t => [t.id, t.fingerprint]));
for (const o of corpus.observations.filter(o => o.currentLegal)) {
  const key = `${teamFingerprints.get(o.teamId)}:${o.set.speciesId}`; if (seenObservation.has(key)) continue; seenObservation.add(key);
  const rows = rowsBySpecies.get(o.set.speciesId) ?? []; rows.push(o); rowsBySpecies.set(o.set.speciesId, rows);
}
const oldClusters = new Map<string, PokemonSet[]>();
const popularSets = new Map<string, PokemonSet[]>();
for (const [species, rows] of rowsBySpecies) {
  oldClusters.set(species, legacyArchetypes(rows));
  const counts = new Map<string, {set: PokemonSet; now: number; old: number}>();
  for (const row of rows) {const key = setKey(row.set); const item = counts.get(key) ?? {set: row.set, now: 0, old: 0}; if (row.season === meta.season) item.now++; else item.old++; counts.set(key, item);}
  popularSets.set(species, [...counts.values()].sort((a, b) => b.now - a.now || b.old - a.old).map(c => c.set));
}
const observations = new Map(b.corpus.observations.map(o => [o.id, o]));
const setsOf = (t: SourceTeam) => t.observationIds.map(id => observations.get(id)!.set);
const scoreSets = (predictions: PokemonSet[], actual: PokemonSet) => {
  const predicted = predictions[0];
  if (!predicted) return {available: 0, item: 0, ability: 0, moves: 0, exact: 0, top3: 0, pointMAE: null};
  const union = new Set([...predicted.moves, ...actual.moves]);
  return {available: 1, item: Number(predicted.itemId === actual.itemId), ability: Number(predicted.abilityId === actual.abilityId), moves: predicted.moves.filter(m => actual.moves.includes(m)).length / union.size, exact: Number(setKey(predicted) === setKey(actual)), top3: Number(predictions.slice(0, 3).some(s => setKey(s) === setKey(actual))), pointMAE: STAT_KEYS.reduce((sum, stat) => sum + Math.abs(predicted.points![stat] - actual.points![stat]), 0) / 6};
};
const reconstruction: Record<string, ReturnType<typeof scoreSets>[]> = {popular: [], legacyClusters: [], conditionalModel: []};
for (const team of held) {
  const sets = setsOf(team); const teammates = sets.map(s => s.speciesId);
  for (const set of sets) {
    reconstruction.popular.push(scoreSets(popularSets.get(set.speciesId) ?? [], set));
    reconstruction.legacyClusters.push(scoreSets(oldClusters.get(set.speciesId) ?? [], set));
    reconstruction.conditionalModel.push(scoreSets(meta.configurationPosterior(set.speciesId, teammates).map(p => meta.configurationById.get(p.configurationId)!.set), set));
  }
}
const averages = Object.fromEntries(Object.entries(reconstruction).map(([name, rows]) => [name, {samples: rows.length, ...Object.fromEntries(['available', 'item', 'ability', 'moves', 'exact', 'top3', 'pointMAE'].map(key => {const values = rows.map(row => row[key as keyof typeof row]).filter((n): n is number => n !== null); return [key, values.reduce((a, b) => a + b, 0) / values.length];}))}]));
const popular = fitted.archetypes.map(a => a.representative);
const appendLegal = (team: PokemonSet[], candidates: PokemonSet[]) => {
  const chosen = candidates.find(set => {
    const draft = {...createDraft(b.environment.id), members: [...team, set].map(member)};
    return !engine.validateDraft(draft).some(v => v.severity === 'error' || v.memberId);
  });
  if (!chosen) throw new Error('评测基线没有合法候选，未补造配置。');
  return [...team, chosen];
};
const cases = held.filter((_, i) => i % Math.max(1, Math.floor(held.length / caseCount)) === 0).slice(0, caseCount);
const constructions: any[] = []; const simulationResults: any[] = []; const timings: any[] = [];
for (const [index, source] of cases.entries()) {
  const actual = setsOf(source); const core = actual.slice(0, 2);
  const draft = {...createDraft(b.environment.id, `留出 ${source.id}`), members: core.map(s => ({...member(s), lock: {species: true, fields: []}}))};
  const start = performance.now(); const proposals = search.recommend({draft, kind: 'complete'});
  timings.push({source: source.id, operation: 'complete', ms: performance.now() - start});
  const teams: Record<string, PokemonSet[]> = {newSearch: proposals[0].members.map(m => m.set), popular: [...core], legacyHeuristic: [...core]};
  while (teams.popular.length < 6) teams.popular = appendLegal(teams.popular, popular);
  while (teams.legacyHeuristic.length < 6) teams.legacyHeuristic = appendLegal(teams.legacyHeuristic, oldRecommend(teams.legacyHeuristic));
  const target = actual.slice(2).map(s => s.speciesId);
  for (const [method, sets] of Object.entries(teams)) {
    const candidate = {...draft, members: sets.map(member)};
    const recovery = sets.slice(2).filter(s => target.includes(s.speciesId)).length / target.length;
    const problems = engine.validateDraft(candidate); if (problems.length) throw new Error(`${method} 基线结果不合法：${problems.map(p => p.message).join('；')}`);
    constructions.push({source: source.id, method, recovery, species: sets.map(s => s.speciesId), fingerprint: teamKey(sets), legal: true});
    const opponentSource = held[(index * 7 + 1) % held.length];
    const request = {draft: candidate, opponentTeam: setsOf(opponentSource), seconds: 120, trials, seed: 7013 + index * 97, mode: 'closed' as const};
    const simulation = simulate(engine, meta, request, {cancelled: () => false, progress: () => {}, preview: createPreviewPolicy(evaluator)});
    simulationResults.push({source: source.id, opponentSource: opponentSource.id, method, completed: simulation.completed, wins: simulation.wins, ties: simulation.ties, interval: simulation.interval, elapsedMs: simulation.elapsedMs, trainingGames: simulation.trainingGames});
  }
  console.log(`构筑与实战复评 ${index + 1}/${cases.length}`);
}
const performanceDraft = {...createDraft(b.environment.id), members: [member(fitted.archetypes.find(a => a.speciesId === 'sneasler')!.representative)]};
search.recommend({draft: performanceDraft, kind: 'add'});
for (let run = 0; run < 5; run++) {const start = performance.now(); search.recommend({draft: performanceDraft, kind: 'add'}); timings.push({operation: 'warm-add', ms: performance.now() - start});}
const report = {createdAt: new Date().toISOString(), algorithm: ALGORITHM_VERSION, environment: b.environment, corpusVersion: b.corpus.version, trainingCorpusVersion: corpus.version, modelVersion: fitted.version, machine: {cpu: cpus()[0].model, threads: cpus().length, ramGiB: totalmem() / 2 ** 30}, split: {cutoff: new Date(cutoff).toISOString(), trainingSources: eligible.length, heldTeams: held.length, heldObservations: held.length * 6, excludedAuthors: authors.size, originLinksIsolated: origins.size}, configurationReconstruction: averages, constructions, simulationResults, timings,
  method: ['配置复原与实际对局分别报告；精确配置命中包括性格、六维点数、招式、道具与特性。', '旧聚类为 vgcpastes.py 的固定三类、去重后等权距离与 medoid 的 TypeScript 移植；平均链接使用等价增量更新。', '旧启发式直接加载旧项目 recommendConfigs 原函数；三种构筑方法使用相同训练候选库与规则校验，使用训练样本构造其频率和搭档输入。', '构筑案例按留出来源顺序等间隔选择，核心固定原队伍前两只；复原率不等于构筑强度。', '模拟为固定场数、相同种子、三种对手策略；有限模拟样本不代表真实排位胜率或统计显著的优势。']};
await mkdir('docs/reports', {recursive: true}); await writeFile('docs/reports/benchmark.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({configurationReconstruction: averages, constructions: constructions.map(({source, method, recovery}) => ({source, method, recovery})), simulation: simulationResults, timings}, null, 2));
