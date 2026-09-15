import type {BattleEngine} from './engine';
import type {BattleField, PokemonSet} from '../types';
import {hitCounts} from './hit-counts';

export interface MoveRisk {
  moveId: string; baseAccuracy: number | true; accuracy: number; fullConnection: number;
  koIncludingMiss: number; expectedDamage: number; recoil: [number, number];
  hitDistribution: {hits: number; probability: number}[];
  minPercent: number; maxPercent: number; conditions: string[];
}
export interface RiskComparison {moves: MoveRisk[]; alternatives: {replaces: string; result: MoveRisk}[]; dependencies: string[]}

/** Resolve accuracy using the pinned Showdown implementation, with neutral partners. */
export function moveRisk(engine: BattleEngine, attacker: PokemonSet, defender: PokemonSet, moveId: string, field: BattleField): MoveRisk {
  const team = (set: PokemonSet) => [engine.toPS(set), ...Array.from({length: 3}, () => ({...engine.toPS(set), ability: 'Run Away', item: ''}))];
  const battle = new engine.ps.Battle({format: engine.ps.Dex.formats.get(engine.formatId + '@@@!Open Team Sheets'), seed: [1, 3, 5, 7], p1: {name: 'A', team: team(attacker)}, p2: {name: 'B', team: team(defender)}});
  try {
    battle.makeChoices('team 1234', 'team 1234');
    const a = battle.p1.active[0]; const d = battle.p2.active[0];
    for (const [pokemon, side] of [[a, 'attacker'], [d, 'defender']] as const) {
      if (field[`${side}Mega`] !== false && pokemon.canMegaEvo) battle.actions.runMegaEvo(pokemon);
      if (field[`${side}AbilityActive`] === false && pokemon.species.id === 'mimikyu') pokemon.formeChange('Mimikyu-Busted');
      if (field[`${side}AbilityActive`] === false && pokemon.species.id === 'eiscue') pokemon.formeChange('Eiscue-Noice');
      pokemon.clearBoosts();
      if (field[`${side}AbilityId`] !== undefined) pokemon.setAbility(field[`${side}AbilityId`]);
      if (field[`${side}ItemId`] !== undefined) pokemon.setItem(field[`${side}ItemId`]);
      if (field[`${side}ItemConsumed`]) pokemon.clearItem();
      if (field[`${side}HPPercent`] !== undefined) pokemon.hp = Math.max(1, Math.floor(pokemon.maxhp * field[`${side}HPPercent`]! / 100));
      if (field[`${side}Status`]) pokemon.setStatus(field[`${side}Status`]);
    }
    battle.field.clearWeather(); battle.field.clearTerrain();
    if (field.weather) battle.field.setWeather(({Sun: 'sunnyday', Rain: 'raindance', Sand: 'sandstorm', Snow: 'snow'} as Record<string, string>)[field.weather], a);
    if (field.terrain) battle.field.setTerrain(field.terrain.toLowerCase() + 'terrain', a);
    let move = engine.dex.getActiveMove(moveId);
    battle.setActiveMove(move, a, d);
    battle.singleEvent('ModifyMove', move, null, a, d, move, move);
    move = battle.runEvent('ModifyMove', a, d, move, move);
    let accuracy = 1;
    battle.randomChance = (numerator: number, denominator: number) => {accuracy = Math.min(1, Math.max(0, numerator / denominator)); return true;};
    if (!battle.actions.hitStepAccuracy([d], a, move)[0]) accuracy = 0;
    const counts = hitCounts(move.multihit, a.getAbility().name, a.getItem().name, field.hits);
    const hitDistribution = new Map<number, number>([[0, 1 - accuracy]]);
    for (const count of counts) {
      if (move.multiaccuracy) {
        for (let hit = 1; hit <= count.hits; hit++) {
          const probability = count.probability * accuracy ** hit * (hit === count.hits ? 1 : 1 - accuracy);
          hitDistribution.set(hit, (hitDistribution.get(hit) ?? 0) + probability);
        }
      } else hitDistribution.set(count.hits, (hitDistribution.get(count.hits) ?? 0) + accuracy * count.probability);
    }
    let koIncludingMiss = 0; let expectedDamage = 0;
    for (const [hits, probability] of hitDistribution) if (hits && probability) {
      const row = engine.damage(attacker, defender, {...field, hits}, [moveId])[0];
      koIncludingMiss += probability * row.ohko; expectedDamage += probability * row.expectedDamage;
    }
    const damage = engine.damage(attacker, defender, field, [moveId])[0];
    const recoil = (amount: number) => move.recoil && !a.hasAbility(['Rock Head', 'Magic Guard']) ? Math.max(1, Math.round(Math.min(amount, d.hp) * move.recoil[0] / move.recoil[1])) : 0;
    const conditions = ['保持所列天气、特性、道具及 HP；命中与伤害仍不代表回合获胜概率', '不包含畏缩、睡眠等行动阻止、命中／闪避等级变化、接触反伤与对手换人'];
    if (move.hasCrashDamage) conditions.push('未命中还会产生失败反伤；替代招式比较不把该风险藏进总分');
    if (move.selfdestruct || move.selfBoost?.boosts) conditions.push('该招式会付出退场或能力变化代价，后续回合需在模拟中比较');
    return {moveId, baseAccuracy: engine.dex.moves.get(moveId).accuracy, accuracy, fullConnection: counts.reduce((sum, count) => sum + count.probability * (move.multiaccuracy ? accuracy ** count.hits : accuracy), 0),
      koIncludingMiss: Math.min(1, koIncludingMiss), expectedDamage, recoil: [recoil(damage.min), recoil(damage.max)], hitDistribution: [...hitDistribution].map(([hits, probability]) => ({hits, probability})), minPercent: damage.minPercent, maxPercent: damage.maxPercent, conditions};
  } finally {battle.destroy();}
}

export function compareRisks(engine: BattleEngine, attacker: PokemonSet, defender: PokemonSet, field: BattleField): RiskComparison {
  const moves = attacker.moves.filter(id => engine.dex.moves.get(id).category !== 'Status').map(id => moveRisk(engine, attacker, defender, id, field));
  const alternatives: RiskComparison['alternatives'] = [];
  for (const original of moves.filter(row => row.accuracy < 1 || row.recoil[1] > 0)) {
    const move = engine.dex.moves.get(original.moveId);
    const candidates = engine.dex.moves.all().filter((candidate: any) => candidate.exists && candidate.type === move.type && candidate.category === move.category && !attacker.moves.includes(candidate.id) && (candidate.accuracy === true || candidate.accuracy > (original.baseAccuracy === true ? 100 : original.baseAccuracy) || move.recoil && !candidate.recoil));
    for (const candidate of candidates) {
      const changed = {...attacker, moves: attacker.moves.map(id => id === original.moveId ? candidate.id : id)};
      if (engine.validateSet(changed).length) continue;
      const result = moveRisk(engine, changed, defender, candidate.id, field);
      if (result.accuracy > original.accuracy || result.recoil[1] < original.recoil[1]) alternatives.push({replaces: original.moveId, result});
    }
  }
  const dependencies = [field.weather ? `依赖当前${field.weather}天气；可在条件模板中对照失去天气` : '', field.terrain ? `依赖当前${field.terrain}场地；场地争夺会改变结果` : '', field.helpingHand ? '本次伤害依赖队友成功使用帮助' : '', field.friendGuard ? '本次生存依赖友情防守队友留场' : ''].filter(Boolean);
  return {moves, alternatives: alternatives.sort((a, b) => b.result.koIncludingMiss - a.result.koIncludingMiss || b.result.expectedDamage - a.result.expectedDamage), dependencies};
}
