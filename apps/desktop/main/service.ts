import {randomUUID} from 'node:crypto';
import {appendFileSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Store} from '../../../packages/core/storage';
import {Contexts} from '../../../packages/core/context';
import {validateInput} from '../../../packages/core/schema';
import {ALGORITHM_VERSION, applyProposal, hash} from '../../../packages/core/domain';
import {getRevision} from '../../../packages/core/sources/engine-build';
import type {AppState, BootstrapData, JobProgress, Method, ServiceMethods, TeamDraft, SimulationRequest, SimulationResult} from '../../../packages/core/types';
import {ComputePool} from './pool';
import {ResearchStore} from '../../../packages/core/research/storage';
import {validateResearch} from '../../../packages/core/research/workflow';
import {SPREADSHEET_ID} from '../../../packages/core/sources/corpus';
import {roleKnowledge} from '../../../packages/core/analysis/role-knowledge';
import {storageReport, cleanStorage} from '../../../packages/core/maintenance';
import {prepareDocument} from '../../../packages/core/research/documents';
import {memberStats} from '../../../packages/core/analysis/member-stats';

export class LocalService {
  readonly store: Store; readonly contexts: Contexts; readonly pool: ComputePool;
  readonly research: ResearchStore;
  private cancellation = new Map<string, SharedArrayBuffer>();
  private runningJobs = new Map<string, Promise<void>>();
  private modelUpdates = new Map<string, Promise<void>>();
  constructor(directory: string, assets: string, readonly emit: (job: JobProgress) => void) {
    this.store = new Store(directory, assets); this.contexts = new Contexts(this.store); this.pool = new ComputePool(directory, assets);
    this.research = new ResearchStore(this.store.db);
    for (const job of this.store.jobs().filter(j => j.status === 'running')) {const failed = {...job, status: 'failed' as const, error: '上次关闭应用时任务尚未完成，未将中断结果视为完成。'}; this.store.db.prepare('UPDATE jobs SET data=? WHERE id=?').run(JSON.stringify(failed), job.id);}
  }
  private state(environmentId = this.store.activeEnvironment()): AppState {
    const record = this.store.environment(environmentId);
    const {observations, ...corpus} = this.store.corpus(record.corpusVersion);
    return {algorithmVersion: ALGORITHM_VERSION, activeEnvironmentId: this.store.activeEnvironment(), environment: record.environment, environments: this.store.environments(), dex: record.dex, drafts: this.store.drafts(), corpus, model: this.store.model(record.modelVersion), configurations: this.contexts.get(environmentId).meta.configurations, dataDirectory: this.store.directory, recoveredDraftId: this.store.getMeta('lastDraft')};
  }
  private async ensureModel(environmentId: string): Promise<void> {
    const record = this.store.environment(environmentId);
    if (this.store.model(record.modelVersion).algorithmVersion === ALGORITHM_VERSION) return;
    const pending = this.modelUpdates.get(environmentId); if (pending) return pending;
    const update = (async () => {
      const bundled = JSON.parse(readFileSync(join(this.store.assets, 'bootstrap.json'), 'utf8')) as BootstrapData;
      if (bundled.environment.id === environmentId && bundled.corpus.version === record.corpusVersion && bundled.model.algorithmVersion === ALGORITHM_VERSION) {
        this.store.install({...bundled, environment: record.environment, engine: record.engine, dex: record.dex, translations: record.translations});
        return;
      }
      const id = this.launch('model', {}, environmentId);
      await this.runningJobs.get(id);
      const job = this.store.jobs().find(job => job.id === id)!;
      if (job.status !== 'completed') throw new Error(job.error || '本地模型重建已取消，原始资料和旧模型仍保留。');
    })();
    this.modelUpdates.set(environmentId, update);
    try {await update;} finally {this.modelUpdates.delete(environmentId);}
  }
  private launch(kind: JobProgress['kind'], input: any, environmentId: string): string {
    const id = randomUUID(); const cancel = new SharedArrayBuffer(4); this.cancellation.set(id, cancel);
    let job: JobProgress = {id, kind, status: 'running', phase: kind === 'simulate' ? 'search' : 'prepare', progress: null, message: '任务已进入后台队列', environmentId, draftRevision: input.draft?.revision, draftId: input.draft?.id};
    const publish = () => {this.store.saveJob(job, input); this.emit(job);}; publish();
    const lane = kind === 'simulate' ? this.pool.deep : this.pool.maintenance;
    const execution = lane.run(kind, input, environmentId, {cancel, progress: update => {job = {...job, message: update.message, result: update.result, phase: update.result ? 'evaluate' : job.phase}; publish();}}).then(value => {
      const cancelled = Atomics.load(new Int32Array(cancel), 0) !== 0;
      if (!cancelled && (kind === 'sync' || kind === 'model')) this.store.install(value as BootstrapData);
      if (!cancelled && kind === 'engine') this.store.install(value.bootstrap);
      job = {...job, status: cancelled ? 'cancelled' : 'completed', phase: 'done', progress: 1, message: cancelled ? '已取消，未完成结果不视为成功' : kind === 'model' ? '已按新算法重建本地配置模型，旧版本仍保留' : kind === 'sync' ? '构筑数据与配置模型已更新' : kind === 'engine' ? '候选环境校验完成，等待启用' : '深入评估完成', result: kind === 'simulate' ? value : kind === 'engine' ? value.update : undefined};
      publish();
    }).catch(error => {const cancelled = Atomics.load(new Int32Array(cancel), 0) !== 0; job = {...job, status: cancelled ? 'cancelled' : 'failed', message: cancelled ? '任务已取消' : '任务失败', error: error.message, failure: error.failure}; appendFileSync(join(this.store.directory, 'errors.log'), `${new Date().toISOString()} ${kind}: ${error.stack}\n`); publish();})
      .finally(() => {this.cancellation.delete(id); this.runningJobs.delete(id);});
    this.runningJobs.set(id, execution);
    return id;
  }
  async call<M extends Method>(method: M, raw: unknown): Promise<ServiceMethods[M]['output']> {
    let input = validateInput(method, raw) as any;
    if (method === 'recommend') {
      const preference = this.research.entries().find(entry => entry.kind === 'preferences' && entry.draftId === input.draft.id && entry.environmentId === input.draft.environmentId);
      if (preference?.kind === 'preferences') input = {...input, options: {weights: preference.weights, retainedConfigurationIds: preference.retainedConfigurationIds, allowHistorical: preference.allowHistorical, ...input.options}};
    }
    const env = input?.environmentId || input?.draft?.environmentId || this.store.activeEnvironment();
    if (['bootstrap', 'environmentState', 'posterior', 'analyze', 'recommend', 'optimizeSpread', 'damage', 'speed', 'scenarios', 'selections', 'risk', 'simulate', 'validate', 'export', 'parse', 'roleKnowledge', 'applyProposal', 'migrateDraft'].includes(method)) await this.ensureModel(env);
    const record = this.store.environment(env);
    const context = () => this.contexts.get(env);
    let result: any;
    switch (method) {
      case 'documents': result = this.research.entries().filter(entry => entry.kind === 'document' && entry.environmentId === env); break;
      case 'prepareDocument': result = await prepareDocument(input); break;
      case 'maintenance': {
        const workers = await Promise.all((['fast', 'deep', 'maintenance'] as const).map(name => this.pool[name].run('runtime', {name}, env)));
        const {heapUsed, external, rss} = process.memoryUsage();
        result = {storage: storageReport(this.store), runtime: [{process: 'service', heapUsed, external, rss, contexts: this.contexts.statistics()}, ...workers], collectedAt: new Date().toISOString()}; break;
      }
      case 'cleanStorage': {
        if (input.memoryCache) {await Promise.all((['fast', 'deep', 'maintenance'] as const).map(name => this.pool[name].run('clearContexts', {name}, env))); this.contexts.clear();}
        result = cleanStorage(this.store, input); break;
      }
      case 'roleKnowledge': result = roleKnowledge(context().engine); break;
      case 'research': result = this.research.state(input.draftId, env); break;
      case 'saveResearch': validateResearch(input, record.environment); result = this.research.save(input); break;
      case 'deleteResearch': this.research.remove(input.id, input.revision); break;
      case 'sources': {
        result = this.research.sources(env);
        if (!result.length) {
          result = this.store.corpus(record.corpusVersion).reports.map(r => ({id: hash([env, r.documentId ?? SPREADSHEET_ID, r.gid]), environmentId: env, documentId: r.documentId ?? SPREADSHEET_ID, gid: r.gid, season: r.season, title: r.title, enabled: true, sampleMethod: '公开共享构筑；转贴归组，不代表排位使用率', permissionNotes: '用户指定的公开共享表，只读获取'}));
          for (const source of result) this.research.saveSource(source);
        }
        break;
      }
      case 'saveSource': {
        result = {...input, id: hash([env, input.documentId, input.gid])};
        this.research.saveSource(result, input.id); break;
      }
      case 'bootstrap': result = this.state(); break;
      case 'environmentState': result = this.state(env); break;
      case 'saveDraft': result = this.store.saveDraft(input); this.store.setMeta('lastDraft', input.id); break;
      case 'deleteDraft': this.store.deleteDraft(input.id); break;
      case 'history': result = this.store.history(input.id); break;
      case 'parse': result = context().engine.parse(input.text); break;
      case 'export': result = context().engine.export(input.members.map((m: any) => m.set)); break;
      case 'validate': result = context().engine.validateDraft(input); break;
      // A tiny stat query bypasses long recommendation jobs and persistent caches.
      case 'memberStats': result = memberStats(context().engine, input.set, input.field); break;
      case 'posterior': result = context().meta.configurationPosterior(input.speciesId, input.teammates, input.known); break;
      case 'analyze': case 'recommend': case 'optimizeSpread': case 'damage': case 'speed': case 'scenarios': case 'selections': case 'risk': {
        const draft = input.draft ?? (method === 'analyze' ? input : undefined);
        const computationInput = draft ? {...input, ...(method === 'analyze' ? {name: '', notes: '', updatedAt: '', revision: draft.analysisRevision} : {draft: {...draft, name: '', notes: '', updatedAt: '', revision: draft.analysisRevision}})} : input;
        const key = hash([method, computationInput, record.corpusVersion, record.modelVersion, ALGORITHM_VERSION]);
        result = this.store.cached(key);
        if (result === undefined) {result = await this.pool.fast.run(method, input, env); this.store.cache(key, result);}
        break;
      }
      case 'applyProposal': {
        const changed = applyProposal(input.draft, input.proposal, record.corpusVersion, record.modelVersion);
        const errors = context().engine.validateDraft(changed).filter(i => i.severity === 'error' || i.memberId);
        if (errors.length) throw new Error(`建议不满足当前规则：${errors.map(i => i.message).join('；')}`);
        result = changed; break;
      }
      case 'sync': result = this.launch('sync', input, env); break;
      case 'prepareUpdate': {
        if (input.source === 'local' && !input.localPath) throw new Error('请选择本地 Showdown 检出目录。');
        result = this.launch('engine', input, env); break;
      }
      case 'checkUpdates': {
        const [revision, calcRevision] = await Promise.all([getRevision('pokemon-showdown'), getRevision('damage-calc')]);
        result = {revision, current: record.engine.showdownRevision, available: revision !== record.engine.showdownRevision || calcRevision !== record.engine.calcRevision}; break;
      }
      case 'activateEnvironment': {
        if (!record.environment.verified) throw new Error('该环境尚未通过规则与伤害一致性校验。');
        this.store.setMeta('activeEnvironment', env); break;
      }
      case 'migrateDraft': {
        const draft: TeamDraft = {...input.draft, id: randomUUID(), name: `${input.draft.name} · ${record.environment.season}`, environmentId: env, revision: 0, updatedAt: new Date().toISOString()};
        result = {draft, issues: context().engine.validateDraft(draft)}; break;
      }
      case 'simulate': result = this.launch('simulate', {...input, context: input.context ?? {corpusVersion: record.corpusVersion, modelVersion: record.modelVersion, algorithmVersion: ALGORITHM_VERSION}}, env); break;
      case 'replayJob': {
        const job = this.store.jobs().find(j => j.id === input.id);
        if (!job || job.kind !== 'simulate' || !job.result || !('wins' in job.result)) throw new Error('该任务没有可重放的模拟结果。');
        const previous = job.result as SimulationResult;
        if (previous.algorithmVersion !== ALGORITHM_VERSION) throw new Error(`该记录需要算法 ${previous.algorithmVersion}；请使用对应应用版本复现。`);
        if (!previous.completed) throw new Error('该任务没有已完成的复评对局。');
        const request = this.store.jobRequest(input.id) as SimulationRequest;
        result = this.launch('simulate', {...request, trainingTrials: previous.trainingGames, trials: previous.completed, context: {corpusVersion: previous.corpusVersion, modelVersion: previous.modelVersion, algorithmVersion: previous.algorithmVersion}}, previous.environmentId);
        break;
      }
      case 'cancelJob': {const cancel = this.cancellation.get(input.id); if (cancel) Atomics.store(new Int32Array(cancel), 0, 1); else if (!this.store.jobs().some(j => j.id === input.id)) throw new Error('找不到后台任务。'); break;}
      case 'jobs': result = this.store.jobs(); break;
      default: throw new Error(`未知操作：${String(method)}`);
    }
    return result;
  }
  close() {this.pool.close(); this.store.close();}
}

const port = (process as any).parentPort;
if (port) {
  const service = new LocalService(process.env.POKE_DATA!, process.env.POKE_ASSETS!, job => port.postMessage({type: 'progress', job}));
  port.on('message', async (event: {data: {id: string; method: Method; input: unknown}}) => {
    const {id, method, input} = event.data;
    try {port.postMessage({id, result: await service.call(method, input)});}
    catch (error) {const message = error instanceof Error ? error.message : String(error); appendFileSync(join(service.store.directory, 'errors.log'), `${new Date().toISOString()} ${method}: ${message}\n`); port.postMessage({id, error: message});}
  });
  port.postMessage({type: 'ready'});
  process.on('exit', () => service.close());
}
