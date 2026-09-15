import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import type {BootstrapData, Corpus, SourceTeam, SetObservation} from '../packages/core/types';
import {BattleEngine} from '../packages/core/battle/engine';
import {fitModel, MetaModel} from '../packages/core/analysis/model';
import {dateValue, scoreProbabilities} from '../packages/core/analysis/calibration';
import {matchesKnown} from '../packages/core/analysis/partial-evidence';
import {ALGORITHM_VERSION, complete, hash, setKey} from '../packages/core/domain';

const bootstrapText = await readFile('assets/bootstrap.json', 'utf8');
const b: BootstrapData = JSON.parse(bootstrapText);
const protocol = JSON.parse(await readFile('docs/reports/external-holdout-protocol.json', 'utf8'));
const sources: {id: string; url: string; author: string; date: string; rule: string; raw: string; setText: string; sampleMethod: string}[] = JSON.parse(await readFile('docs/research/independent-configurations.json', 'utf8'));
if (ALGORITHM_VERSION !== protocol.algorithmVersion || b.model.version !== protocol.modelBeforeExternalLabels || b.corpus.version !== protocol.corpusVersion) throw new Error('外部验证必须使用预先冻结的算法、模型和语料版本。');
if (createHash('sha256').update(bootstrapText).digest('hex') !== protocol.bootstrapSHA256) throw new Error('冻结输入文件的 SHA-256 已改变，不能将当前资料当作原盲测输入。');
const engine = new BattleEngine(resolve('assets/engines', b.engine.id), b.environment.formatId, b.translations);
const audit = []; const teams: SourceTeam[] = []; const observations: SetObservation[] = [];
for (const source of sources) {
  if (source.rule !== b.environment.season) {audit.push({source: source.id, status: 'different-season'}); continue;}
  if (dateValue(source.date) < dateValue(protocol.heldFrom)) {audit.push({source: source.id, status: 'before-window'}); continue;}
  const parsed = engine.parse(source.setText);
  if (parsed.issues.length) throw new Error(`${source.id}: ${parsed.issues.join('；')}`);
  const duplicates = parsed.sets.flatMap(set => b.corpus.observations.filter(o => o.currentLegal && complete(o.set) && matchesKnown(o.set, set) && matchesKnown(set, o.set)).map(o => o.id));
  if (duplicates.length) {audit.push({source: source.id, status: 'duplicate-configuration', duplicates}); continue;}
  for (const [slot, set] of parsed.sets.entries()) {
    const errors = engine.validateSet(set); if (errors.length) throw new Error(`${source.id}: ${errors.join('；')}`);
    observations.push({id: `${source.id}:${slot}`, teamId: source.id, season: source.rule, slot, set: {...set, sourceKind: 'observed', sourceIds: [`${source.id}:${slot}`]}, date: source.date, author: source.author, url: source.url,
      known: {item: true, ability: true, nature: true, points: true, moves: true}, currentLegal: true, knownLegal: true, errors: []});
  }
  teams.push({id: source.id, sheetId: '', season: source.rule, description: '独立发表的单份配置', author: source.author, date: source.date, event: '', rank: '', url: source.url, originUrl: source.url,
    raw: source.setText, fingerprint: hash(parsed.sets.map(setKey)), observationIds: observations.filter(o => o.teamId === source.id).map(o => o.id), status: 'partial', errors: ['原作者只提供单只配置，其余成员未知；不作为完整队伍或模拟胜负样本。']});
  audit.push({source: source.id, status: 'independent-complete-configuration', configurations: parsed.sets.length});
}
const authors = new Set(teams.map(t => t.author.trim().toLowerCase())); const origins = new Set(teams.map(t => t.originUrl));
const trainingTeams = b.corpus.teams.filter(team => dateValue(team.date) > 0 && dateValue(team.date) < dateValue(protocol.heldFrom) && !authors.has(team.author.trim().toLowerCase()) && !origins.has(team.originUrl));
const allowed = new Set(trainingTeams.map(team => team.id));
const trainingExclusions = b.corpus.teams.filter(team => !allowed.has(team.id)).map(team => ({sourceId: team.id, date: team.date,
  reasons: [!dateValue(team.date) ? '日期不可解析，未推断时间先后' : dateValue(team.date) >= dateValue(protocol.heldFrom) ? '不早于冻结时间窗口' : '', authors.has(team.author.trim().toLowerCase()) ? '相关作者' : '', origins.has(team.originUrl) ? '相同原始来源' : ''].filter(Boolean)}));
const training: Corpus = trainingTeams.length === b.corpus.teams.length ? b.corpus : {...b.corpus, version: hash([b.corpus.version, [...allowed].sort()]), teams: trainingTeams, observations: b.corpus.observations.filter(o => allowed.has(o.teamId)), reports: []};
const model = training === b.corpus ? b.model : fitModel(training, engine, console.log);
const meta = new MetaModel(training, model, b.environment.season);
const held: Corpus = {version: hash([teams, observations]), updatedAt: new Date().toISOString(), teams, observations, reports: []};
const variants = {frozen: meta, noHistory: new MetaModel(training, {...model, priorStrength: 0}, meta.season), noPartialEvidence: new MetaModel(training, {...model, archetypes: model.archetypes.map(a => ({...a, partialEvidence: []}))}, meta.season)};
const probability = Object.fromEntries(Object.entries(variants).map(([name, meta]) => [name, scoreProbabilities(meta, held, teams, model.calibration?.temperature ?? 1)]));
const recovery = observations.map(o => {
  const posterior = meta.configurationPosterior(o.set.speciesId);
  const exactRank = posterior.findIndex(row => setKey(meta.configurationById.get(row.configurationId)!.set) === setKey(o.set));
  return {source: o.id, speciesId: o.set.speciesId, exactRank: exactRank < 0 ? null : exactRank + 1, observedInTraining: exactRank >= 0, predictions: posterior.slice(0, 5).map(row => ({...row, set: meta.configurationById.get(row.configurationId)!.set}))};
});
await writeFile('docs/reports/external-benchmark.json', JSON.stringify({createdAt: new Date().toISOString(), algorithmVersion: ALGORITHM_VERSION, environmentId: b.environment.id, corpusVersion: b.corpus.version, modelVersion: model.version,
  window: protocol.heldFrom, independentNewConfigurations: observations.length, independentNewTeams: 0, excludedTrainingSources: trainingExclusions.map(row => row.sourceId), trainingExclusions, audit, probability, recovery,
  notes: ['发表日期晚于冻结训练语料的新配置；按完整配置排除重复，并隔离相关作者和来源。', '一份独立配置只产生三个字段预测，数量不足以证明模型优劣；不将其记为一支完整队伍。', '其余队友、实战选出及胜负未知，没有填充或推断成观测事实。', '内部温度与历史强度仅由训练资料决定；外部结果未用于调参，使用后该窗口保留为已观察测试集。']}, null, 2));
console.log(JSON.stringify({independentNewConfigurations: observations.length, independentNewTeams: 0, probability}, null, 2));
