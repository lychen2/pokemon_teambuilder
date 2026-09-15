import type {MetaModel} from '../analysis/model';
import type {BattleEngine} from './engine';
import type {PokemonSet} from '../types';
import {setKey} from '../domain';

export interface ConfigurationBelief {set: PokemonSet; probability: number; generated: boolean}

/** Empirical conditional sets first. An unobserved combination is explicitly generated
 * from observed stat priors and public fields, and is counted separately in every run. */
export function conditionedConfigurations(meta: MetaModel, engine: BattleEngine, species: string, teammates: string[], known: Partial<PokemonSet>): ConfigurationBelief[] {
  const empirical = meta.configurationPosterior(species, teammates, known);
  if (empirical.length) return empirical.map(row => ({set: meta.configurationById.get(row.configurationId)!.set, probability: row.probability, generated: false}));
  const knownMoves = [...new Set(known.moves ?? [])];
  if (knownMoves.length > 4) throw new Error(`${engine.display(species)}公开的原配置招式超过四个：${knownMoves.join(', ')}。需要检查变身或临时招式的观察记录。`);
  const prior = meta.configurationPosterior(species, teammates);
  const generated = new Map<string, ConfigurationBelief>(); const errors = new Set<string>();
  for (const row of prior) {
    const original = meta.configurationById.get(row.configurationId)!.set;
    const set: PokemonSet = {...original, ...known, speciesId: species, moves: [...knownMoves, ...original.moves.filter(id => !knownMoves.includes(id))].slice(0, 4), sourceKind: 'generated', sourceIds: [...original.sourceIds]};
    const invalid = engine.validateSet(set);
    if (invalid.length) {invalid.forEach(error => errors.add(error)); continue;}
    const key = setKey(set); const previous = generated.get(key);
    generated.set(key, {set, probability: row.probability + (previous?.probability ?? 0), generated: true});
  }
  if (!generated.size) throw new Error(`${engine.display(species)}没有与公开信息一致的合法配置先验：已观察招式 ${knownMoves.join(', ')}；${[...errors].join('；') || '没有完整合法观察'}`);
  const total = [...generated.values()].reduce((sum, row) => sum + row.probability, 0);
  return [...generated.values()].map(row => ({...row, probability: row.probability / total}));
}
