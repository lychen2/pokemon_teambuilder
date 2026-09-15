import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename, dirname, join, resolve} from 'node:path';
import type {BootstrapData, Corpus, PokemonSet, SetObservation, SourceTeam} from '../packages/core/types';
import {ALGORITHM_VERSION, complete, hash, setKey, teamKey} from '../packages/core/domain';
import {BattleEngine} from '../packages/core/battle/engine';
import {fitModel, MetaModel} from '../packages/core/analysis/model';
import {dateValue, scoreProbabilities} from '../packages/core/analysis/calibration';
import {matchesKnown} from '../packages/core/analysis/partial-evidence';
import {canonicalPasteUrl, fetchText, parseSheet} from '../packages/core/sources/corpus';

const [protocolPath, sheetPath, outputPath] = process.argv.slice(2);
if (!protocolPath || !sheetPath || !outputPath || process.argv.length !== 5) throw new Error('用法：window-benchmark.ts 协议.json 原始分表.csv 报告.json');
const protocolText = await readFile(protocolPath, 'utf8'); const protocol = JSON.parse(protocolText);
const bootstrapText = await readFile('assets/bootstrap.json', 'utf8'); const b: BootstrapData = JSON.parse(bootstrapText);
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
if (ALGORITHM_VERSION !== protocol.algorithmVersion || b.model.version !== protocol.modelBeforeExternalLabels || b.corpus.version !== protocol.corpusVersion || sha256(bootstrapText) !== protocol.bootstrapSHA256) throw new Error('算法、模型或语料已偏离读取新配置前的冻结协议。');
for (const [path, expected] of Object.entries(protocol.coreSourceSHA256)) if (sha256(await readFile(path, 'utf8')) !== expected) throw new Error(`冻结算法源码已改变：${path}`);
const sheetText = await readFile(sheetPath, 'utf8');
const sheet = parseSheet(sheetText, protocol.source);
const engine = new BattleEngine(resolve('assets/engines', b.engine.id), b.environment.formatId, b.translations);
const sourceDirectory = join(dirname(outputPath), basename(outputPath, '.json') + '-sources');
await mkdir(sourceDirectory, {recursive: true});
const originalObservations = new Map(b.corpus.observations.map(observation => [observation.id, observation]));
const knownPastes = new Set(b.corpus.teams.filter(team => team.url).map(team => canonicalPasteUrl(team.url)));
const sameSets = (left: PokemonSet[], right: PokemonSet[]) => left.length === right.length && left.every(set => right.some(other => matchesKnown(set, other) && matchesKnown(other, set)));
const teams: SourceTeam[] = []; const observations: SetObservation[] = []; const audit: Record<string, unknown>[] = [];
for (const row of sheet.rows) {
  if (!dateValue(row.date) || dateValue(row.date) < dateValue(protocol.heldFrom)) {audit.push({sourceId: row.id, date: row.date, status: 'outside-date-window'}); continue;}
  let rawUrl: string;
  try {rawUrl = canonicalPasteUrl(row.url);} catch (error) {audit.push({sourceId: row.id, status: 'invalid-paste-url', error: String(error)}); continue;}
  if (knownPastes.has(rawUrl)) {audit.push({sourceId: row.id, status: 'known-paste-url', url: row.url}); continue;}
  const sourcePath = join(sourceDirectory, hash(rawUrl) + '.json');
  let acquired: {url: string; acquiredAt: string; raw: string; sha256: string};
  try {
    acquired = JSON.parse(await readFile(sourcePath, 'utf8'));
    if (acquired.url !== rawUrl || sha256(acquired.raw) !== acquired.sha256) throw new Error(`已保存的外部原文内容不一致：${sourcePath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    try {
      const raw = await fetchText(rawUrl);
      acquired = {url: rawUrl, acquiredAt: new Date().toISOString(), raw, sha256: sha256(raw)};
      await writeFile(sourcePath, JSON.stringify(acquired, null, 2));
    } catch (error) {audit.push({sourceId: row.id, status: 'fetch-error', url: row.url, error: String(error)}); continue;}
  }
  const parsed = engine.parse(acquired.raw);
  const issues = [...parsed.issues, ...parsed.sets.flatMap(set => engine.validateKnownSet(set))];
  if (parsed.sets.length !== b.environment.teamSize || !parsed.sets.every(complete)) {
    audit.push({sourceId: row.id, status: 'incomplete-team', members: parsed.sets.length, issues, sourcePath}); continue;
  }
  issues.push(...(engine.validator.validateTeam(parsed.sets.map(set => engine.toPS(set))) ?? []));
  if (issues.length) {audit.push({sourceId: row.id, status: 'invalid-team', issues, sourcePath}); continue;}
  const duplicatedTraining = b.corpus.teams.filter(team => sameSets(parsed.sets, team.observationIds.map(id => originalObservations.get(id)!.set))).map(team => team.id);
  const duplicatedWindow = teams.filter(team => sameSets(parsed.sets, observations.filter(observation => observation.teamId === team.id).map(observation => observation.set))).map(team => team.id);
  if (duplicatedTraining.length || duplicatedWindow.length) {audit.push({sourceId: row.id, status: 'duplicate-team', duplicatedTraining, duplicatedWindow, sourcePath}); continue;}
  const id = `window:${hash(rawUrl)}`;
  const observationIds = parsed.sets.map((_, slot) => `${id}:${slot}`);
  teams.push({...row, id, documentId: protocol.source.documentId, sheetId: protocol.source.gid, season: protocol.source.season, raw: acquired.raw,
    observationIds, fingerprint: teamKey(parsed.sets), status: 'valid', errors: []});
  parsed.sets.forEach((set, slot) => observations.push({id: observationIds[slot], teamId: id, slot, season: protocol.source.season, date: row.date, author: row.author, url: row.url,
    set: {...set, sourceKind: 'observed', sourceIds: [observationIds[slot]]}, known: {item: true, ability: true, nature: true, points: true, moves: true}, currentLegal: true, knownLegal: true, errors: []}));
  audit.push({sourceId: row.id, status: 'independent-complete-team', id, date: row.date, author: row.author, url: row.url, originUrl: row.originUrl, sourcePath, sourceSHA256: acquired.sha256});
}
const held: Corpus = {version: hash([teams, observations]), updatedAt: new Date().toISOString(), teams, observations, reports: []};
const inputAudit = {createdAt: new Date().toISOString(), algorithmVersion: ALGORITHM_VERSION, environmentId: b.environment.id, corpusVersion: b.corpus.version,
  protocolPath, protocolSHA256: sha256(protocolText), sheetSHA256: sha256(sheetText), classification: protocol.classification, window: protocol.heldFrom,
  sourceRows: sheet.rows.length, independentNewTeams: teams.length, configurations: observations.length, audit, held};
await writeFile(outputPath, JSON.stringify({status: 'sources-checked', ...inputAudit}, null, 2));
if (!teams.length) throw new Error(`没有通过日期、去重与合法性检查的独立完整队伍；逐条原因已保存至 ${outputPath}`);
const authorKey = (author: string) => author.trim().toLowerCase();
const authors = new Set(teams.map(team => authorKey(team.author)).filter(Boolean));
const origins = new Set(teams.map(team => team.originUrl).filter(Boolean));
const trainingExclusions = b.corpus.teams.flatMap(team => {
  const reasons = [!dateValue(team.date) ? '日期不可解析' : dateValue(team.date) >= dateValue(protocol.heldFrom) ? '不早于验证窗口' : '',
    authors.has(authorKey(team.author)) ? '相同作者标识' : '', origins.has(team.originUrl) ? '相同原始来源' : ''].filter(Boolean);
  return reasons.length ? [{sourceId: team.id, reasons}] : [];
});
const excluded = new Set(trainingExclusions.map(row => row.sourceId));
const training: Corpus = {...b.corpus, version: hash([b.corpus.version, [...excluded].sort()]), teams: b.corpus.teams.filter(team => !excluded.has(team.id)), observations: b.corpus.observations.filter(observation => !excluded.has(observation.teamId)), reports: []};
const model = fitModel(training, engine, console.log); const meta = new MetaModel(training, model, b.environment.season);
const variants = {calibrated: meta, noHistory: new MetaModel(training, {...model, priorStrength: 0}, meta.season), noPartialEvidence: new MetaModel(training, {...model, archetypes: model.archetypes.map(archetype => ({...archetype, partialEvidence: []}))}, meta.season)};
const probability = Object.fromEntries(Object.entries(variants).map(([name, variant]) => [name, scoreProbabilities(variant, held, teams, model.calibration?.temperature ?? 1)]));
const recovery = teams.flatMap(team => {
  const sets = observations.filter(observation => observation.teamId === team.id).map(observation => observation.set);
  return sets.map(actual => {
    const posterior = meta.configurationPosterior(actual.speciesId, sets.map(set => set.speciesId));
    const rank = posterior.findIndex(row => {const candidate = meta.configurationById.get(row.configurationId)!.set; return matchesKnown(actual, candidate) && matchesKnown(candidate, actual);});
    return {sourceId: team.id, speciesId: actual.speciesId, exactKnownFieldsRank: rank < 0 ? null : rank + 1,
      literalSetKeyRank: posterior.findIndex(row => setKey(meta.configurationById.get(row.configurationId)!.set) === setKey(actual)) + 1 || null,
      candidateAvailable: posterior.length > 0, predictions: posterior.slice(0, 5).map(row => ({probability: row.probability, set: meta.configurationById.get(row.configurationId)!.set}))};
  });
});
const summary = {available: recovery.filter(row => row.candidateAvailable).length, exactKnownFieldsTop1: recovery.filter(row => row.exactKnownFieldsRank === 1).length, exactKnownFieldsTop3: recovery.filter(row => row.exactKnownFieldsRank !== null && row.exactKnownFieldsRank <= 3).length};
await writeFile(outputPath, JSON.stringify({status: 'completed', ...inputAudit, completedAt: new Date().toISOString(), trainingCorpusVersion: training.version,
  modelVersion: model.version, trainingExclusions, trainingSources: training.teams.length, probability, recovery, summary, newLabelsUsedForTuning: false,
  notes: ['名单元数据已读且日期边界修订发生在配置正文读取前；按协议保留这一限制，不称严格未见盲测。', '完整队伍在训练语料与窗口内去重，未提供的性别不制造新配置；非法或缺字段队伍不补全。', '相同作者按标准化文本标识排除；未声称识别全部未公开的作者别名。', '温度与历史强度只在训练资料内部选择；外部结果没有用于修改默认参数。', '已知字段精确复原忽略未提供的性别，另存包含性别的原始setKey复原；未知字段不填零。', '共享表没有真实选出与胜负标签；构筑复原、校准误差不代表真实排位胜率。', '本次原文与报告单独保存，没有合并进发布语料。']}, null, 2));
console.log(JSON.stringify({independentNewTeams: teams.length, configurations: observations.length, trainingSources: training.teams.length, summary, probability}, null, 2));
