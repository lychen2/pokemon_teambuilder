import type {BattleEngine} from '../battle/engine';
import type {BattleField, DamageResult, PokemonSet} from '../types';
import type {ConditionTemplate} from '../research/types';

export interface ScenarioResult {
  name: string;
  field: BattleField;
  defender: PokemonSet;
  damage: DamageResult[];
  speeds: {attacker: number; defender: number};
  warnings: string[];
}

export function evaluateScenarios(engine: BattleEngine, template: Pick<ConditionTemplate, 'attacker' | 'defender' | 'field' | 'variants'>): ScenarioResult[] {
  const rows = [{name: '基准条件', defender: template.defender, field: template.field}, ...template.variants.map(v => ({name: v.name, defender: v.defender ?? template.defender, field: {...template.field, ...v.field}}))];
  return rows.map(row => ({...row, damage: engine.damage(template.attacker, row.defender, row.field), speeds: engine.speeds(template.attacker, row.defender, row.field), warnings: [
    ...(row.field.attackerItemConsumed ? ['我方道具已消耗；轻装状态按明确条件保留'] : []),
    ...(row.field.weather ? [`依赖 ${row.field.weather} 天气仍在场`] : []),
    '伤害与击杀概率以所列命中条件为前提，不包含行动被阻止的概率',
  ]}));
}
