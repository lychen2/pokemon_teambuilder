import {parentPort, workerData} from 'node:worker_threads';
import {join} from 'node:path';
import {Store} from '../../../packages/core/storage';
import {Contexts} from '../../../packages/core/context';
import {TeamSearch} from '../../../packages/core/analysis/search';
import {optimizeSpread} from '../../../packages/core/analysis/spread';
import {speedBenchmarks} from '../../../packages/core/analysis/speed';
import {environmentBenchmarks, durabilityBenchmarks} from '../../../packages/core/analysis/environment-benchmarks';
import {evaluateScenarios} from '../../../packages/core/analysis/scenarios';
import {analyzeSelections} from '../../../packages/core/analysis/selections';
import {simulate} from '../../../packages/core/battle/simulation';
import {createPreviewPolicy} from '../../../packages/core/battle/preview-policy';
import {compareRisks} from '../../../packages/core/battle/risk';
import {BattleEngine} from '../../../packages/core/battle/engine';
import {verifyEngine, verifyMechanics} from '../../../packages/core/battle/verify';
import {fitModel} from '../../../packages/core/analysis/model';
import {buildEngine, getRevision} from '../../../packages/core/sources/engine-build';
import {importCorpus, PasteCache} from '../../../packages/core/sources/corpus';
import {revalidateCorpus} from '../../../packages/core/sources/revalidate';
import {ALGORITHM_VERSION, hash} from '../../../packages/core/domain';
import type {BootstrapData, UpdateResult} from '../../../packages/core/types';

const store = new Store(workerData.directory, workerData.assets, true);
const contexts = new Contexts(store);
parentPort!.on('message', async task => {
  const cancelled = () => Atomics.load(new Int32Array(task.cancel), 0) !== 0;
  const progress = (message: string, result?: unknown) => parentPort!.postMessage({id: task.id, type: 'progress', value: {message, result}});
  const controller = new AbortController();
  const poll = setInterval(() => {if (cancelled()) controller.abort(new Error('任务已取消。'));}, 50);
  try {
    if (task.method === 'runtime' || task.method === 'clearContexts') {
      if (task.method === 'clearContexts') contexts.clear();
      const {heapUsed, external, rss} = process.memoryUsage();
      parentPort!.postMessage({id: task.id, result: {process: task.input.name, heapUsed, external, rss, contexts: contexts.statistics()}}); return;
    }
    const input = task.input; let result: unknown;
    const assertActive = () => {if (cancelled()) throw new Error('任务已取消。');};
    if (task.method === 'model' || task.method === 'sync' || task.method === 'engine') {
      const record = store.environment(task.environmentId);
      const engine = new BattleEngine(store.engineDirectory(record.engine.id), record.environment.formatId, record.translations);
      if (task.method === 'model') {
        progress('正在为新算法重建本地配置模型；规则、原文与队伍保持原版本');
        const corpus = store.corpus(record.corpusVersion);
        const model = fitModel(corpus, engine, message => {assertActive(); progress(message);}); assertActive();
        result = {...record, corpus, model} satisfies BootstrapData;
      } else if (task.method === 'sync') {
        const imported = await importCorpus({sources: input.sources, engine, cache: new PasteCache(join(workerData.directory, 'raw'), join(workerData.assets, 'raw')), signal: controller.signal, progress: message => progress(message)});
        const corpus = revalidateCorpus(imported, engine);
        const previous = store.model(record.modelVersion);
        const unchanged = corpus.version === record.corpusVersion && previous.algorithmVersion === ALGORITHM_VERSION;
        if (unchanged) progress('规则与来源内容未变化，复用同版本配置模型');
        const model = unchanged ? previous : fitModel(corpus, engine, message => {assertActive(); progress(message);}); assertActive();
        result = {...record, corpus, model} satisfies BootstrapData;
      } else {
        const revisions = input.source === 'official' ? await Promise.all([getRevision('pokemon-showdown', controller.signal), getRevision('damage-calc', controller.signal)]) : [record.engine.showdownRevision, record.engine.calcRevision];
        const manifest = await buildEngine({enginesDirectory: join(workerData.directory, 'engines'), showdownRevision: revisions[0], calcRevision: revisions[1], localPath: input.source === 'local' ? input.localPath : undefined, reuseCalc: {directory: store.engineDirectory(record.engine.id), revision: record.engine.calcRevision}, runtimeDirectory: join(workerData.assets, 'runtime'), signal: controller.signal, progress});
        const next = new BattleEngine(store.engineDirectory(manifest.id), input.formatId || record.environment.formatId, record.translations);
        progress('重新解析现有来源并检查新规则下的合法性');
        const corpus = revalidateCorpus(store.corpus(record.corpusVersion), next);
        const sample = corpus.observations.find(o => o.currentLegal && o.set.speciesId === 'rillaboom')?.set ?? corpus.observations.find(o => o.currentLegal)?.set;
        if (!sample) throw new Error('候选环境没有可用于计算校验的合法完整配置。');
        const tests = [...verifyEngine(next, sample), ...verifyMechanics(next)];
        const model = fitModel(corpus, next, message => {assertActive(); progress(message);}); assertActive();
        const environment = next.snapshot(true); const dex = next.dexData();
        const previousSpecies = new Map(record.dex.species.map(s => [s.id, s]));
        const changedData = (kind: 'moves' | 'items' | 'abilities') => {
          const previous = new Map(record.dex[kind].map(row => [row.id, row]));
          return dex[kind].filter(row => !previous.has(row.id) || hash(previous.get(row.id)) !== hash(row)).map(row => row.id);
        };
        const update: UpdateResult = {environment, formats: next.formats(), addedSpecies: environment.speciesIds.filter(id => !record.environment.speciesIds.includes(id)), removedSpecies: record.environment.speciesIds.filter(id => !environment.speciesIds.includes(id)),
          changedSpecies: dex.species.filter(s => previousSpecies.has(s.id) && hash(s) !== hash(previousSpecies.get(s.id))).map(s => s.id), changedMoves: changedData('moves'), changedItems: changedData('items'), changedAbilities: changedData('abilities'),
          changedRules: environment.ruleHash !== record.environment.ruleHash, mechanicsChanged: record.engine.hashes.showdown !== manifest.hashes.showdown || record.engine.hashes.calc !== manifest.hashes.calc, tests};
        result = {bootstrap: {environment, engine: manifest, dex, corpus, model, translations: record.translations} satisfies BootstrapData, update};
      }
      parentPort!.postMessage({id: task.id, result}); return;
    }
    const {engine, meta, evaluator} = contexts.get(task.environmentId, task.method === 'simulate' ? task.input.context : undefined);
    if (task.method === 'analyze') result = evaluator.analyze(input);
    else if (task.method === 'recommend') result = new TeamSearch(evaluator).recommend(input);
    else if (task.method === 'optimizeSpread') result = optimizeSpread(evaluator, input);
    else if (task.method === 'damage') result = engine.damage(input.attacker, input.defender, input.field);
    else if (task.method === 'speed') result = speedBenchmarks(engine, meta, input);
    else if (task.method === 'environmentBenchmarks') result = environmentBenchmarks(engine, meta, input);
    else if (task.method === 'durabilityBenchmarks') result = durabilityBenchmarks(engine, meta, input);
    else if (task.method === 'scenarios') result = evaluateScenarios(engine, input);
    else if (task.method === 'risk') result = compareRisks(engine, input.attacker, input.defender, input.field);
    else if (task.method === 'selections') result = analyzeSelections(evaluator, input.draft, input.opponentSpecies);
    else if (task.method === 'simulate') result = simulate(engine, meta, input, {cancelled, progress, preview: createPreviewPolicy(evaluator)});
    else throw new Error(`未知计算任务：${task.method}`);
    parentPort!.postMessage({id: task.id, result});
  } catch (error) {parentPort!.postMessage({id: task.id, error: error instanceof Error ? error.message : String(error), failure: error && typeof error === 'object' && 'failure' in error ? error.failure : undefined});}
  finally {clearInterval(poll);}
});
