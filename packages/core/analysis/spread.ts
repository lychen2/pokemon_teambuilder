import {STAT_KEYS, type DamageResult, type PokemonSet, type SpreadGoalCheck, type SpreadRequest, type SpreadResult, type Stat, type Stats} from '../types';
import {complete, zeros} from '../domain';
import type {Evaluator} from './evaluate';
import {proposalFor} from './search';
import {reverseField} from '../battle/fields';

interface Constraint {stats: Stat[]; rows: number[][]; label: string; verify: (set: PokemonSet) => boolean}
interface Measurement {satisfied: boolean; rank: number[]; description: string}
const statName: Record<Stat, string> = {hp: 'HP', atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度'};
const damageDescription = (damage: DamageResult) => `伤害 ${damage.minPercent.toFixed(1)}%–${damage.maxPercent.toFixed(1)}%（${damage.min}–${damage.max} HP）；命中时击杀概率 ${(100 * damage.ohko).toFixed(1)}%`;

export function optimizeSpread(evaluator: Evaluator, request: SpreadRequest): SpreadResult {
  const start = performance.now(); const {engine} = evaluator;
  const original = request.draft.members.find(m => m.id === request.memberId);
  if (!original || !complete(original.set)) throw new Error('请选择一份完整的配置进行配点优化。');
  if (original.lock.fields.includes('points')) throw new Error('该成员的配点已锁定。');
  if (request.speedTarget === undefined && !request.speedBenchmark && !request.attackTarget && !request.defendTarget) throw new Error('请指定速度、击杀或生存目标。');
  const {perStat, total} = engine.snapshot().points;
  const constraints: Constraint[] = [];
  const goals: SpreadGoalCheck[] = [];
  let visited = 0; let pruned = 0;
  const unreachable = (explanation: string[]): SpreadResult => ({status: 'unreachable', proposal: null, optimizedSet: null, goals, visited, pruned, explanation, exact: true, pointBudget: total, remainingPoints: null});
  const enumerate = (stats: Stat[], measure: (set: PokemonSet) => Measurement, label: string, kind: SpreadGoalCheck['kind']) => {
    const rows: number[][] = []; const points = zeros();
    let best: {value: Measurement; points: Stats; cost: number} | undefined;
    const walk = (depth: number) => {
      if (depth === stats.length) {
        const cost = stats.reduce((sum, stat) => sum + points[stat], 0);
        if (cost > total) {pruned++; return;}
        visited++;
        const value = measure({...original.set, points: {...points}});
        const different = best ? value.rank.findIndex((rank, i) => rank !== best!.value.rank[i]) : -1;
        if (!best || (different < 0 ? cost < best.cost : value.rank[different] > best.value.rank[different])) best = {value, points: {...points}, cost};
        if (value.satisfied) rows.push(stats.map(s => points[s]));
        return;
      }
      const stat = stats[depth];
      for (let value = 0; value <= perStat; value++) {points[stat] = value; walk(depth + 1);}
      points[stat] = 0;
    };
    walk(0);
    goals.push({kind, label, achievable: rows.length > 0, current: measure(original.set).description, best: best!.value.description, bestPoints: best!.points,
      minimumPoints: rows.length ? Math.min(...rows.map(row => row.reduce((sum, n) => sum + n, 0))) : null});
    constraints.push({stats, rows, label, verify: set => measure(set).satisfied});
  };
  if (request.speedTarget !== undefined) {
    const field = request.field ?? {};
    enumerate(['spe'], set => {
      const actual = engine.speeds(set, set, field).attacker;
      const margin = field.trickRoom ? request.speedTarget! - actual : actual - request.speedTarget!;
      return {satisfied: margin > 0, rank: [margin], description: `对局速度 ${actual}；目标速度 ${request.speedTarget}；${margin > 0 ? '我方先手' : margin === 0 ? '同速随机' : '我方后手'}（同优先度）`};
    }, `对局速度${field.trickRoom ? '低于' : '超过'} ${request.speedTarget}，计入当前道具、特性和所选条件`, 'speed');
  }
  if (request.speedBenchmark) {
    const target = request.speedBenchmark;
    enumerate(['spe'], set => {
      const speed = engine.speeds(set, target.opponent, target.field);
      const margin = target.field.trickRoom ? speed.defender - speed.attacker : speed.attacker - speed.defender;
      return {satisfied: target.order === 'before' ? margin > 0 : margin >= 0, rank: [margin], description: `我方对局速度 ${speed.attacker} / 对手 ${speed.defender}；${margin > 0 ? '我方先手' : margin === 0 ? '同速随机' : '我方后手'}`};
    }, `${target.field.trickRoom ? '戏法空间内' : '同优先度下'}${target.order === 'before' ? '先于' : '不后于'}${engine.display(target.opponent.speciesId)}；保留所选形态、顺风、状态和场地条件`, 'speed');
  }
  const dependencies = (set: PokemonSet, moveId: string, defending: boolean): Stat[] => {
    const move = engine.dex.moves.get(moveId);
    const attack = moveId === 'bodypress' ? 'def' : move.category === 'Physical' ? 'atk' : 'spa';
    const defense = ['psyshock', 'psystrike', 'secretsword'].includes(moveId) ? 'def' : move.category === 'Physical' ? 'def' : 'spd';
    const stats: Stat[] = defending ? ['hp', defense] : [attack];
    if (['photongeyser', 'shellsidearm', 'terablast'].includes(moveId)) stats.push(defending ? 'def' : 'atk', defending ? 'spd' : 'spa');
    if (['gyroball', 'electroball'].includes(moveId)) stats.push('spe');
    if (moveId === 'foulplay') {if (defending) stats.push('atk'); else stats.splice(0, stats.length);}
    if (['finalgambit', 'eruption', 'waterspout', 'dragonenergy', 'flail', 'reversal'].includes(moveId) && !defending) stats.push('hp');
    return [...new Set(stats)];
  };
  const conditions = request.conditions?.length ? request.conditions : [{name: '当前对局条件', field: request.field ?? {}}];
  for (const condition of conditions) {
  if (request.attackTarget) {
    if (!request.attackMove || !original.set.moves.includes(request.attackMove)) throw new Error('请选择当前配置中的进攻招式。');
    const moveId = request.attackMove;
    if (engine.dex.moves.get(moveId).category === 'Status') throw new Error('击杀目标需要选择伤害招式。');
    const target = condition.attackTarget ?? request.attackTarget;
    const chance = request.attackChance ?? 1;
    if (!(chance > 0 && chance <= 1)) throw new Error('击杀概率目标必须大于 0 且不超过 100%。');
    enumerate(dependencies(original.set, moveId, false), set => {
      const damage = engine.damage(set, target, condition.field, [moveId])[0];
      return {satisfied: damage.ohko >= chance, rank: [damage.ohko, damage.min, damage.max], description: damageDescription(damage)};
    }, `${condition.name}：对${engine.display(target.speciesId)}使用${engine.zh(engine.name('moves', moveId))}，${chance === 1 ? '命中时全部乱数击杀' : `命中时击杀概率至少 ${100 * chance}%`}`, 'attack');
  }
  if (request.defendTarget) {
    if (!request.defendMove || !request.defendTarget.moves.includes(request.defendMove)) throw new Error('请选择对手配置中的进攻招式。');
    const target = condition.defendTarget ?? request.defendTarget; const moveId = request.defendMove;
    if (!target.moves.includes(moveId) || engine.dex.moves.get(moveId).category === 'Status') throw new Error(`${condition.name}：生存目标必须包含指定的伤害招式。`);
    const limit = request.survivePercent ?? 99.99;
    enumerate(dependencies(target, moveId, true), set => {
      const damage = engine.damage(target, set, reverseField(condition.field), [moveId])[0];
      return {satisfied: damage.maxPercent <= limit && damage.max < damage.currentHP, rank: [-damage.ohko, -damage.max / damage.currentHP], description: `${damageDescription(damage)}；当前血量 ${damage.currentHP} HP`};
    }, `${condition.name}：承受${engine.display(target.speciesId)}的${engine.zh(engine.name('moves', moveId))}，最高乱数不超过 ${limit}% 且保留 HP`, 'defend');
  }
  }
  if (goals.some(goal => !goal.achievable)) return unreachable([
    `固定当前性格、道具、特性、招式与对局条件，在单项 ${perStat} 点、总计 ${total} 点内，以下目标无法达到。`,
    ...goals.filter(goal => !goal.achievable).map(goal => `${goal.label}：${goal.best}`),
    '没有生成可应用配点。可以据此主动调整目标、配置或对局条件。',
  ]);
  const activeStats = [...new Set(constraints.flatMap(c => c.stats))];
  activeStats.sort((a, b) => constraints.filter(c => c.stats.includes(b)).length - constraints.filter(c => c.stats.includes(a)).length);
  let best: Stats | null = null; let bestCost = total + 1;
  const assigned = new Map<Stat, number>();
  // Integer branch-and-bound with forward checking over exact damage/velocity tables.
  const branch = (depth: number, cost: number, tables: number[][][]) => {
    if (cost >= bestCost || cost > total) {pruned++; return;}
    if (depth === activeStats.length) {best = {...zeros(), ...Object.fromEntries(assigned)}; bestCost = cost; return;}
    let lowerBound = cost;
    for (const stat of activeStats.slice(depth)) {
      let lower = 0;
      constraints.forEach((c, i) => {const col = c.stats.indexOf(stat); if (col >= 0) lower = Math.max(lower, Math.min(...tables[i].map(row => row[col])));});
      lowerBound += lower;
    }
    if (lowerBound >= bestCost || lowerBound > total) {pruned++; return;}
    const stat = activeStats[depth];
    for (let value = 0; value <= Math.min(perStat, total - cost); value++) {
      const next = tables.map((rows, i) => {const col = constraints[i].stats.indexOf(stat); return col < 0 ? rows : rows.filter(row => row[col] === value);});
      if (next.some(rows => !rows.length)) {pruned++; continue;}
      assigned.set(stat, value); branch(depth + 1, cost + value, next); assigned.delete(stat);
    }
  };
  branch(0, 0, constraints.map(c => c.rows));
  if (!best) return unreachable([`各目标单独可达到，但在总计 ${total} 点内没有同时满足全部条件的分配。`, '未改变任何目标或配置；请检查相互冲突的速度、进攻与生存要求。']);
  const set: PokemonSet = {...original.set, points: best, sourceKind: 'generated'};
  for (const constraint of constraints) if (!constraint.verify(set)) throw new Error(`配点目标存在未建模的能力值交互：${constraint.label}。未生成可应用建议。`);
  const issues = engine.validateSet(set); if (issues.length) throw new Error(issues.join('；'));
  const members = request.draft.members.map(m => m.id === original.id ? {...m, set} : m);
  const explanation = [...constraints.map(c => c.label), `固定性格、道具、招式与特性，精确枚举阈值后分支定界：使用 ${bestCost}/${total} 点，剩余 ${total - bestCost} 点。`, STAT_KEYS.map(s => `${statName[s]} ${original.set.points![s]} → ${set.points![s]}`).join('；')];
  const proposal = request.previewOnly ? null : proposalFor(evaluator, request.draft, members, 'spread', `${engine.display(set.speciesId)} · 阈值配点`, start);
  if (proposal) {
    proposal.benefits = explanation;
    proposal.tradeoffs = [...proposal.tradeoffs, '只保证上述明确的目标和条件；未指定的对手、天气与其他能力值阈值需要另行检查。'];
  }
  return {status: 'success', proposal, optimizedSet: set, goals, visited, pruned, explanation, exact: true, pointBudget: total, remainingPoints: total - bestCost};
}
