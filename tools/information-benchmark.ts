import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {BootstrapData} from '../packages/core/types';
import type {BattleObservation} from '../packages/core/battle/observation';
import {BattleEngine} from '../packages/core/battle/engine';
import {MetaModel} from '../packages/core/analysis/model';
import {InformationTree} from '../packages/core/battle/policy';
import {simulate} from '../packages/core/battle/simulation';
import {createPreviewPolicy} from '../packages/core/battle/preview-policy';
import {Evaluator} from '../packages/core/analysis/evaluate';
import {informationKey} from '../packages/core/battle/information-state';
import {ALGORITHM_VERSION, createDraft, hash, member} from '../packages/core/domain';

const b: BootstrapData = JSON.parse(await readFile('assets/bootstrap.json', 'utf8'));
const meta = new MetaModel(b.corpus, b.model, b.environment.season);
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
// Encoding-only ablation of mc-1.2.1. Policies, hidden-set model and engine are held fixed.
function previousKey(observation: BattleObservation): string {
  const request = structuredClone(observation.request);
  if (request) {delete request.rqid; if (request.side) delete request.side.name;}
  const normalize = (pokemon: BattleObservation['active'][string]) => ({...pokemon, moves: [...pokemon.moves].sort(), entered: observation.turn - pokemon.entered});
  const {trickRoomStarted, ...previous} = observation;
  return hash(canonical({...previous, request, active: Object.fromEntries(Object.entries(observation.active).map(([id, pokemon]) => [id, normalize(pokemon)])), seen: Object.fromEntries(Object.entries(observation.seen).map(([id, pokemon]) => [id, normalize(pokemon)]))}));
}
const sources = b.corpus.teams.filter(team => team.season === meta.season && team.status === 'valid');
const selected = ['perishsong', 'trickroom', 'fakeout'].map(move => sources.find(team => team.observationIds.some(id => meta.observationById.get(id)!.set.moves.includes(move)))!);
const rows = [];
for (const [index, source] of selected.entries()) for (const budget of ['fixed-games', 'fixed-time'] as const) {
  const draft = {...createDraft(b.environment.id), members: source.observationIds.map(id => member(meta.observationById.get(id)!.set))};
  const order = index % 2 ? ['canonical-public-v2', 'previous-public-v1'] as const : ['previous-public-v1', 'canonical-public-v2'] as const;
  for (const encoding of order) {
    const engine = new BattleEngine(resolve('assets/engines', b.engine.id), b.environment.formatId, b.translations);
    const result = simulate(engine, meta, {draft, opponentTeamId: selected[(index + 1) % selected.length].id, seconds: 3, mode: 'closed', seed: 141026 + index * 71, strategy: 'mixed', opponentPolicies: ['mixed', 'control', 'pressure'], ...(budget === 'fixed-games' ? {trainingTrials: 24, trials: 12} : {})},
      {cancelled: () => false, progress: () => {}, preview: createPreviewPolicy(new Evaluator(engine, meta)), createTree: () => new InformationTree(encoding === 'canonical-public-v2' ? informationKey : previousKey)});
    rows.push({source: source.id, encoding, budget, result});
    console.log(`${source.id} ${encoding} ${budget}: ${result.trainingGames} 训练，${result.wins}/${result.completed} 复评胜局，复用 ${result.treeDiagnostics!.evaluationReuse}/${result.treeDiagnostics!.evaluationDecisions}`);
  }
}
await writeFile('docs/reports/information-state-benchmark.json', JSON.stringify({createdAt: new Date().toISOString(), algorithmVersion: ALGORITHM_VERSION, environmentId: b.environment.id, corpusVersion: b.corpus.version, modelVersion: b.model.version, rows,
  notes: ['只比较状态编码；两侧均使用当前配置模型、行动策略和同一引擎。', '当前编码保留精确 HP/PP、全部已知招式/道具/特性、在场计时与绝对回合；新增空间计时，删除已消失场地的时钟和换出重置状态。', '保留绝对回合是因为上游真实回合上限影响终局；没有用丢弃已知招式或道具来提高复用数字。', '独立复评种子与训练种子分开，未完成对局不记胜负；有限开发对局不能证明实战强度。']}, null, 2));
