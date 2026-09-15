import {readFile, writeFile, mkdtemp, cp, rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import type {BootstrapData, JobProgress} from '../packages/core/types';
import type {MaintenanceReport as Report} from '../packages/core/maintenance';
import {createDraft, member, ALGORITHM_VERSION} from '../packages/core/domain';

const require = createRequire(import.meta.url);
const {LocalService} = require('../dist/service.cjs') as typeof import('../apps/desktop/main/service');
const bootstrapText = await readFile('assets/bootstrap.json', 'utf8');
const b: BootstrapData = JSON.parse(bootstrapText);
const durationOption = process.argv.slice(2).find(arg => arg.startsWith('--duration-minutes='));
const durationMs = durationOption ? Number(durationOption.slice('--duration-minutes='.length)) * 60_000 : 0;
const outputOption = process.argv.slice(2).find(arg => arg.startsWith('--output='));
const output = outputOption ? resolve(outputOption.slice('--output='.length)) : resolve(`docs/reports/${durationMs ? 'storage-soak-' + ALGORITHM_VERSION : 'storage-benchmark'}.json`);
if (!Number.isFinite(durationMs) || durationMs < 0 || process.argv.slice(2).some(arg => !arg.startsWith('--duration-minutes=') && !arg.startsWith('--output='))) throw new Error('用法：storage-benchmark.ts [--duration-minutes=120] [--output=报告路径]；时长必须是非负数。');
const applicationVersion = JSON.parse(await readFile('package.json', 'utf8')).version;
const sha256 = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');
const inputs = {applicationVersion, algorithmVersion: ALGORITHM_VERSION, environmentId: b.environment.id, corpusVersion: b.corpus.version, modelVersion: b.model.version,
  bootstrapSHA256: sha256(bootstrapText), serviceSHA256: sha256(await readFile('dist/service.cjs')), workerSHA256: sha256(await readFile('dist/compute-worker.cjs'))};
const directory = await mkdtemp(join(tmpdir(), 'poke-storage-benchmark-'));
const service = new LocalService(directory, resolve('assets'), job => {if (job.status !== 'running') console.log(`${job.kind}: ${job.status}`);});
const observations = new Map(b.corpus.observations.map(o => [o.id, o]));
const teams = b.corpus.teams.filter(t => t.status === 'valid' && t.season === b.environment.season);
const source = teams[0];
const draft = {...createDraft(b.environment.id, '运行占用验证'), members: source.observationIds.map(id => member(observations.get(id)!.set))};
const rows: {phase: string; elapsedMs: number; report: Report; sourceId?: string; jobs?: {id: string; status: string; message: string}[]}[] = [];
const started = performance.now();
const memorySamples: {elapsedMs: number; rss: number; serviceHeapUsed: number; serviceExternal: number}[] = [];
const memoryTimer = setInterval(() => {const {rss, heapUsed, external} = process.memoryUsage(); memorySamples.push({elapsedMs: performance.now() - started, rss, serviceHeapUsed: heapUsed, serviceExternal: external});}, 1000);
let completed = false; let syncCycles = 0; let snapshotSwitches = 0; let simulatedGames = 0; let cycles = 0;
const settings = {requestedDurationMs: durationMs, memorySampleIntervalMs: 1000, cycleIntervalMs: durationMs ? 60_000 : 0, syncIntervalMs: durationMs ? 30 * 60_000 : 0};
const reportData = () => ({...inputs, settings, directory, elapsedMs: performance.now() - started, rows, memorySamples,
  checks: {syncCycles, snapshotSwitches, simulatedGames, cycles}, sampledPeakRss: memorySamples.reduce((maximum, sample) => Math.max(maximum, sample.rss), 0)});
async function snapshot(phase: string, sourceId?: string, jobs?: typeof rows[number]['jobs']) {
  rows.push({phase, elapsedMs: performance.now() - started, report: await service.call('maintenance', undefined), sourceId, jobs});
  await writeFile(output, JSON.stringify({status: 'running', ...reportData()}, null, 2));
  console.log(`${phase}: ${(performance.now() - started).toFixed(0)}ms，RSS ${(process.memoryUsage().rss / 2 ** 20).toFixed(1)} MiB`);
}
async function waitJob(id: string): Promise<JobProgress> {
  while (true) {
    const job = (await service.call('jobs', undefined)).find(job => job.id === id)!;
    if (job.status === 'failed' || job.status === 'cancelled') throw new Error(job.error || job.message);
    if (job.status === 'completed') return job;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}
try {
  const initial = await service.call('bootstrap', undefined);
  if (initial.algorithmVersion !== ALGORITHM_VERSION) throw new Error('编译版本与源码不一致，请先构建再执行持续运行验证。');
  await service.call('saveDraft', draft);
  await snapshot('initial');
  const local = join(directory, 'showdown-source');
  await cp(resolve('.upstream', `pokemon-showdown-${b.engine.showdownRevision}`), local, {recursive: true});
  const path = join(local, 'data/pokedex.ts'); const code = await readFile(path, 'utf8');
  const previous = 'hp: 95, atk: 135, def: 80, spa: 110, spd: 80, spe: 100';
  if (!code.includes(previous)) throw new Error('压力用例的暴飞龙原始种族值已改变，需要更新用例。');
  await writeFile(path, code.replace(previous, previous.replace('atk: 135', 'atk: 136')));
  const prepared = await waitJob(await service.call('prepareUpdate', {source: 'local', localPath: local}));
  if (!prepared.result || !('environment' in prepared.result)) throw new Error('候选规则没有验证结果。');
  const nextEnvironment = prepared.result.environment.id;
  const migrated = (await service.call('migrateDraft', {draft, environmentId: nextEnvironment})).draft;
  await service.call('saveDraft', migrated); await snapshot('two-real-environments');
  const sources = b.corpus.reports.map(report => ({season: report.season, gid: report.gid, documentId: report.documentId}));
  let lastSync = -Infinity;
  while (durationMs ? performance.now() - started < durationMs : cycles < 4) {
    const cycleStarted = performance.now(); cycles++;
    const jobs: NonNullable<typeof rows[number]['jobs']> = [];
    if (cycleStarted - lastSync >= settings.syncIntervalMs) {
      const job = await waitJob(await service.call('sync', {environmentId: b.environment.id, sources}));
      jobs.push({id: job.id, status: job.status, message: job.message}); syncCycles++; lastSync = cycleStarted;
    }
    const team = teams[(cycles - 1) % teams.length];
    const members = team.observationIds.map(id => member(observations.get(id)!.set));
    const cycleDrafts = [draft, migrated].map(current => ({...current, id: `${current.id}:cycle-${cycles}`, members}));
    for (let repeat = 0; repeat < 3; repeat++) for (const environmentId of [nextEnvironment, b.environment.id]) {
      await service.call('activateEnvironment', {environmentId});
      await service.call('environmentState', {environmentId});
      const activeDraft = cycleDrafts.find(current => current.environmentId === environmentId)!;
      const issues = await service.call('validate', activeDraft);
      if (issues.length) throw new Error(`${team.id}: ${issues.map(issue => issue.message).join('；')}`);
      await service.call('analyze', activeDraft); snapshotSwitches++;
    }
    const game = await waitJob(await service.call('simulate', {draft: cycleDrafts[0], seconds: 30, trainingTrials: 0, trials: 1, seed: 260914 + cycles, mode: 'closed', strategy: 'support', opponentPolicies: [['mixed', 'damage', 'support'][cycles % 3]]}));
    if (!game.result || !('completed' in game.result) || game.result.completed !== 1 || game.result.cancelled) throw new Error('持续运行中的真实对局没有完成，未记为成功。');
    simulatedGames += game.result.completed;
    jobs.push({id: game.id, status: game.status, message: game.message});
    await snapshot(`six-switches-and-battle-${cycles}`, team.id, jobs);
    if (durationMs) {
      const untilNext = Math.min(cycleStarted + settings.cycleIntervalMs, started + durationMs) - performance.now();
      if (untilNext > 0) await new Promise(resolve => setTimeout(resolve, untilNext));
    }
  }
  const before = await service.call('maintenance', undefined);
  await service.call('cleanStorage', {planHash: before.storage.plan.hash, analysisCache: true, memoryCache: true, unusedVersions: false, compact: true});
  await snapshot('explicit-cache-cleanup');
  const state = await service.call('bootstrap', undefined);
  if (!state.drafts.some(d => d.id === draft.id) || !state.drafts.some(d => d.id === migrated.id)) throw new Error('维护过程丢失队伍版本。');
  await writeFile(output, JSON.stringify({status: 'completed', createdAt: new Date().toISOString(), ...reportData(), environmentIds: [b.environment.id, nextEnvironment], finalCorpus: state.corpus.version,
    checks: {...reportData().checks, originalDraftPreserved: true, migratedDraftPreserved: true}, notes: ['在隔离数据库中执行真实来源同步和本地规则编译，未接触日常使用的数据库。', '每轮使用另一支真实当前队伍，切换六次环境并完成一场真实模拟；长时模式每分钟一轮，每30分钟在线同步。', 'RSS 为共享进程统计，不叠加各 Worker；峰值来自每秒采样，堆、缓存条数和磁盘内容另行记录。', '最后的清理是测试显式选择，只删除可重算缓存，不删除原文、规则、模型或队伍历史。', '这是后台服务与计算线程的持续运行记录，不等同于桌面渲染器或物理设备长时间验收。']}, null, 2));
  completed = true;
} catch (error) {
  await writeFile(output, JSON.stringify({status: 'failed', createdAt: new Date().toISOString(), ...reportData(), error: error instanceof Error ? error.stack : String(error), retainedDirectory: directory}, null, 2));
  throw error;
} finally {clearInterval(memoryTimer); service.close(); if (completed) await rm(directory, {recursive: true});}
