import type {BattleEngine} from '../battle/engine';
import {STAT_KEYS, type BattleField, type MemberStats, type PokemonSet} from '../types';

/** Lightweight editor feedback uses the same engine as damage and simulation. */
export function memberStats(engine: BattleEngine, set: PokemonSet, field: BattleField): MemberStats {
  const missing = [!set.points && '能力点', !set.natureId && '性格'].filter((v): v is string => Boolean(v));
  const issues = engine.validateKnownSet(set);
  const raw = engine.toPS(set, false);
  const result: MemberStats = {stats: null, megaStats: null, battleSpeed: null, megaBattleSpeed: null,
    level: raw.adjustLevel ?? raw.level, missing, issues};
  if (missing.length || STAT_KEYS.some(stat => !Number.isInteger(set.points![stat]) || set.points![stat] < 0 || set.points![stat] > engine.snapshot().points.perStat)) return result;
  result.stats = engine.stats(set, false);
  const species = engine.dex.species.get(set.speciesId);
  const mega = set.itemId !== null && Boolean(engine.dex.items.get(set.itemId).megaStone?.[species.name]);
  if (mega) result.megaStats = engine.stats(set, true);
  if (set.itemId === null || set.abilityId === null) {
    result.missing.push(...[set.itemId === null && '道具', set.abilityId === null && '特性'].filter((v): v is string => Boolean(v)));
    return result;
  }
  result.battleSpeed = engine.speeds(set, set, {...field, attackerMega: false, defenderMega: false}).attacker;
  if (mega) result.megaBattleSpeed = engine.speeds(set, set, {...field, attackerMega: true, defenderMega: false}).attacker;
  return result;
}
