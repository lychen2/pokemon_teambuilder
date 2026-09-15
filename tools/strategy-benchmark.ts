import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {BootstrapData, SourceTeam, SimulationResult} from '../packages/core/types';
import {BattleEngine} from '../packages/core/battle/engine';
import {MetaModel} from '../packages/core/analysis/model';
import {simulate, BattleRunError} from '../packages/core/battle/simulation';
import {createPreviewPolicy} from '../packages/core/battle/preview-policy';
import {Evaluator} from '../packages/core/analysis/evaluate';
import {ALGORITHM_VERSION, createDraft, member} from '../packages/core/domain';
import {configurationMechanisms} from '../packages/core/analysis/mechanisms';

const b: BootstrapData = JSON.parse(await readFile('assets/bootstrap.json', 'utf8'));
const engine = new BattleEngine(resolve('assets/engines', b.engine.id), b.environment.formatId, b.translations);
const meta = new MetaModel(b.corpus, b.model, b.environment.season);
const evaluator = new Evaluator(engine, meta);
const sets = (team: SourceTeam) => team.observationIds.map(id => meta.observationById.get(id)!.set);
const sources = b.corpus.teams.filter(t => t.status === 'valid' && t.season === meta.season);
const expanded = process.argv.includes('--mechanisms');
if (process.argv.slice(2).some(arg => arg !== '--mechanisms')) throw new Error('用法：strategy-benchmark.ts [--mechanisms]');
const mechanismIndex = new Map(sources.map(team => [team.id, new Set(sets(team).flatMap(set => configurationMechanisms(set, b.dex.species.find(species => species.id === set.speciesId)).map(match => match.rule.id)))]));
const common = [
  {name: '顺风控速', ids: ['tailwind']}, {name: '空间控速', ids: ['trickroom']},
  {name: '雨天', ids: ['rain']}, {name: '晴天', ids: ['sun']}, {name: '沙暴', ids: ['sand']}, {name: '雪天', ids: ['snow']},
  {name: '精神场地', ids: ['psychic']}, {name: '青草场地', ids: ['grassy']},
  {name: '掩护', ids: ['redirection']}, {name: '广域防守', ids: ['wideguard']},
  {name: '屏障减伤', ids: ['screens', 'veil']}, {name: '异常干扰', ids: ['sleep', 'burn', 'paralysis']},
  {name: '封印', ids: ['imprison']}, {name: '先制阻断', ids: ['priorityblock', 'quickguard']},
];
const categories = expanded ? common.map(category => ({name: category.name, predicate: (team: SourceTeam) => category.ids.some(id => mechanismIndex.get(team.id)!.has(id))})) : [
  {name: '灭歌', predicate: (t: SourceTeam) => sets(t).some(s => s.moves.includes('perishsong'))},
  {name: '复活', predicate: (t: SourceTeam) => sets(t).some(s => s.moves.includes('revivalblessing'))},
  {name: '空间', predicate: (t: SourceTeam) => sets(t).some(s => s.moves.includes('trickroom'))},
  {name: '场地轻装', predicate: (t: SourceTeam) => sets(t).some(s => s.abilityId === 'unburden')},
  {name: '晴天', predicate: (t: SourceTeam) => sets(t).some(s => s.itemId === 'charizarditey')},
  {name: '常规轮转', predicate: (t: SourceTeam) => sets(t).some(s => s.moves.includes('partingshot'))},
];
const chosen = new Set<string>();
const cases = categories.map(({name, predicate}) => {const team = sources.find(t => !chosen.has(t.fingerprint) && predicate(t)); if (!team) throw new Error(`缺少真实 ${name} 用例。`); chosen.add(team.fingerprint); return {name, team};});
const rows: {category: string; source: string; url: string; budget: string; result: SimulationResult; events: Record<string, number>}[] = [];
for (const [index, entry] of cases.entries()) {
  const draft = {...createDraft(b.environment.id, entry.name), members: sets(entry.team).map(member)};
  const opponent = cases[(index + 1) % cases.length].team;
  for (const strategy of ['mixed', 'damage', 'support'] as const) for (const budget of ['fixed-games', 'fixed-time'] as const) {
    let result: SimulationResult;
    try {result = simulate(engine, meta, {draft, opponentTeamId: opponent.id, seconds: 3, strategy, beliefSamples: 2, opponentPolicies: ['mixed', 'damage', 'support'], seed: 260914 + index * 97, mode: 'closed', ...(budget === 'fixed-games' ? {trainingTrials: 8, trials: 6} : {})}, {cancelled: () => false, progress: () => {}, preview: createPreviewPolicy(evaluator)});}
    catch (error) {await writeFile('.local/strategy-failure.json', JSON.stringify({source: entry.team.id, opponent: opponent.id, strategy, budget, failure: error instanceof BattleRunError ? error.failure : null, error: String(error)}, null, 2)); throw error;}
    const logs = result.replays?.flatMap(replay => replay.trace) ?? [];
    const events = {misses: logs.filter(l => l.startsWith('|-miss|p1')).length, immuneTargets: logs.filter(l => l.startsWith('|-immune|p2')).length, revivals: logs.filter(l => l.startsWith('|move|p1') && l.includes('|Revival Blessing|')).length, perishSongs: logs.filter(l => l.startsWith('|move|p1') && l.includes('|Perish Song|')).length, switches: logs.filter(l => l.startsWith('|switch|p1')).length};
    rows.push({category: entry.name, source: entry.team.id, url: entry.team.url, budget, result, events});
    console.log(`${entry.name} ${strategy} ${budget}: ${result.wins}/${result.completed}，${result.trainingGames} 场训练，${result.elapsedMs.toFixed(0)}ms，${result.unfinished} 场未完成`);
  }
}
const report = {createdAt: new Date().toISOString(), algorithmVersion: ALGORITHM_VERSION, engine: b.engine, environment: b.environment.id, corpusVersion: b.corpus.version, modelVersion: b.model.version, suite: expanded ? 'common-mechanisms' : 'original-six', rows,
  notes: ['每类选择一支不同的真实当前队伍；这是有意覆盖机制的开发集，不代表环境整体样本。', '配置具备该机制不代表策略成功执行，实际出招与状态需查看逐场日志。', '扩展组与原六类使用不同对手配对，不能直接比较总体胜场来宣称算法进步。', '相同对手、随机种子与配置采样预算；分别报告相同对局数和相同墙钟时间的结果。', '时间预算实验不可逐场完全复现；固定场数记录可按相同版本与种子重放。', '事件计数仅为失败审阅线索，不把未命中或免疫事件自动判为整场失利原因。', '有限对局与策略先验下的成绩不代表真实排位胜率。完整已完成复评日志随报告保存。']};
await mkdir('docs/reports', {recursive: true}); await writeFile(`docs/reports/${expanded ? 'strategy-mechanisms-' + ALGORITHM_VERSION : 'strategy-benchmark'}.json`, JSON.stringify(report, null, 2));
