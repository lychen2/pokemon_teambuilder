import type {BattleEngine} from '../battle/engine';
import type {MetaModel} from './model';
import type {BattleField, DamageResult, Stats} from '../types';
import {ALGORITHM_VERSION} from '../domain';

export interface EnvironmentBenchmarkRequest {environmentId: string; field: BattleField}
export interface EnvironmentBenchmarks {
  environmentId: string; corpusVersion: string; modelVersion: string; algorithmVersion: string;
  field: BattleField; configurations: number;
  speeds: {configurationId: string; natural: number; effective: number}[];
  attacks: {configurationId: string; moveId: string; category: 'Physical' | 'Special'; power: number}[];
}
export interface DurabilityRequest extends EnvironmentBenchmarkRequest {attackerId: string; moveId: string}
export interface DurabilityRow {
  configurationId: string; stats: Stats; damage: DamageResult;
  status: 'survives' | 'conditional' | 'roll' | 'ohko' | 'immune';
  margin: number;
  thresholds: {stat: 'hp' | 'def' | 'spd'; from: number; to: number; max: number; hp: number; ohko: number}[];
}
export interface DurabilityAnalysis {
  environmentId: string; corpusVersion: string; modelVersion: string; algorithmVersion: string;
  attackerId: string; moveId: string; field: BattleField; rows: DurabilityRow[];
}
const context = (meta: MetaModel, environmentId: string) => ({environmentId, corpusVersion: meta.corpus.version, modelVersion: meta.model.version, algorithmVersion: ALGORITHM_VERSION});

/** Complete, current, observed configurations only. Counts describe shared teams, not ladder usage. */
export function environmentBenchmarks(engine: BattleEngine, meta: MetaModel, request: EnvironmentBenchmarkRequest): EnvironmentBenchmarks {
  const configurations = meta.configurations.filter(row => row.currentCount > 0);
  const speeds = configurations.map(row => ({configurationId: row.id, natural: engine.stats(row.set, request.field.attackerMega ?? true).spe,
    effective: engine.speeds(row.set, row.set, request.field).attacker})).sort((a, b) => b.effective - a.effective || a.configurationId.localeCompare(b.configurationId));
  const attacks = configurations.flatMap(row => row.set.moves.flatMap(moveId => {
    const move = engine.dex.moves.get(moveId);
    return move.category === 'Physical' || move.category === 'Special' ? [{configurationId: row.id, moveId, category: move.category as 'Physical' | 'Special', power: move.basePower}] : [];
  }));
  return {...context(meta, request.environmentId), field: request.field, configurations: configurations.length, speeds, attacks};
}

/** Check one observed attack against every current spread, then perturb bulk by one legal point. */
export function durabilityBenchmarks(engine: BattleEngine, meta: MetaModel, request: DurabilityRequest): DurabilityAnalysis {
  const attacker = meta.configurationById.get(request.attackerId);
  if (!attacker?.currentCount || !attacker.set.moves.includes(request.moveId)) throw new Error('请选择当前真实配置中存在的输出招式。');
  if (engine.dex.moves.get(request.moveId).category === 'Status') throw new Error('变化招式不提供直接输出线。');
  const rows = meta.configurations.filter(row => row.currentCount > 0).map(configuration => {
    const defender = configuration.set;
    const damage = engine.damage(attacker.set, defender, request.field, [request.moveId])[0];
    const margin = damage.currentHP - damage.max;
    // A zero KO chance can come from Sash, Sturdy or healing; it alone is not evidence of bulk investment.
    const shield = request.field.defenderAbilityActive !== false && (defender.speciesId === 'mimikyu' || (defender.speciesId === 'eiscue' && engine.dex.moves.get(request.moveId).category === 'Physical'));
    const status: DurabilityRow['status'] = damage.max === 0 ? 'immune' : damage.ohko === 0 ? margin > 0 && !shield ? 'survives' : 'conditional' : damage.ohko >= 1 - 1e-12 ? 'ohko' : 'roll';
    const thresholds: DurabilityRow['thresholds'] = [];
    if (status === 'survives') for (const stat of ['hp', 'def', 'spd'] as const) {
      const from = defender.points![stat]; if (from === 0) continue;
      const reduced = {...defender, points: {...defender.points!, [stat]: from - 1}};
      const next = engine.damage(attacker.set, reduced, request.field, [request.moveId])[0];
      if (next.ohko > 0) thresholds.push({stat, from, to: from - 1, max: next.max, hp: next.currentHP, ohko: next.ohko});
    }
    return {configurationId: configuration.id, stats: engine.stats(defender, request.field.defenderMega ?? true), damage, status, margin, thresholds};
  });
  rows.sort((a, b) => Number(b.thresholds.length > 0) - Number(a.thresholds.length > 0) || Math.abs(a.margin) - Math.abs(b.margin) || a.configurationId.localeCompare(b.configurationId));
  return {...context(meta, request.environmentId), attackerId: request.attackerId, moveId: request.moveId, field: request.field, rows};
}
