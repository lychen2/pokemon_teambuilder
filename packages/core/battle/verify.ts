import {strict as assert} from 'node:assert';
import type {BattleEngine} from './engine';
import type {PokemonSet, BattleField} from '../types';
import {STAT_KEYS} from '../types';

export function verifyEngine(engine: BattleEngine, sample: PokemonSet): string[] {
  assert.equal(engine.validateSet(sample).length, 0, '验证配置必须合法');
  const team = [engine.toPS(sample), ...Array.from({length: 3}, () => ({...engine.toPS(sample), ability: 'Run Away', item: ''}))];
  const battle = new engine.ps.Battle({format: engine.ps.Dex.formats.get(engine.formatId + '@@@!Open Team Sheets'), seed: [1, 2, 3, 4], p1: {name: 'Oracle A', team}, p2: {name: 'Oracle B', team: structuredClone(team)}});
  const checks: string[] = [];
  try {
    battle.makeChoices('team 1234', 'team 1234');
    battle.field.clearTerrain(); battle.field.clearWeather();
    for (const side of battle.sides) for (const pokemon of side.pokemon) pokemon.clearBoosts();
    const pokemon = battle.p1.pokemon[0];
    const stats = engine.stats(sample, false);
    for (const key of STAT_KEYS) assert.equal(stats[key], key === 'hp' ? pokemon.maxhp : pokemon.storedStats[key], `Showdown / calc 能力值 ${key}`);
    checks.push('六项能力值与 Showdown 一致');
    const invalid = {...sample, points: {...sample.points!, hp: 33}};
    assert.ok(engine.validateSet(invalid).length, '单项配点约束发生变化，需要更新能力点适配器');
    assert.equal(engine.ruleTable.evLimit, engine.snapshot().points.total);
    checks.push('配点边界与规则校验一致');
    const damagingMove = sample.moves.find(id => {const move = engine.dex.moves.get(id); return move.basePower && ['Physical', 'Special'].includes(move.category) && !move.multihit && !move.damageCallback && !move.basePowerCallback;});
    if (!damagingMove) throw new Error('验证配置需要一个固定威力的单次伤害招式。');
    verifyDamageCase(engine, sample, sample, damagingMove, {attackerMega: false, defenderMega: false, singleTarget: true});
    checks.push('单次伤害区间与 Showdown 16 档乱数一致');
    const parsed = engine.parse(engine.export([sample]));
    assert.deepEqual(parsed.sets[0].points, sample.points);
    assert.deepEqual(parsed.sets[0].moves, sample.moves);
    checks.push('Showdown 配点与招式导入导出往返一致');
    return checks;
  } finally {battle.destroy();}
}

export function verifyDamageCase(engine: BattleEngine, attacker: PokemonSet, defender: PokemonSet, moveId: string, field: BattleField): void {
  const team = (set: PokemonSet) => [engine.toPS(set), ...Array.from({length: 3}, () => ({...engine.toPS(set), ability: 'Run Away', item: ''}))];
  const battle = new engine.ps.Battle({format: engine.ps.Dex.formats.get(engine.formatId + '@@@!Open Team Sheets'), seed: [17, 29, 41, 53], p1: {name: 'A', team: team(attacker)}, p2: {name: 'B', team: team(defender)}});
  try {
    battle.makeChoices('team 1234', 'team 1234');
    const a = battle.p1.active[0]; const d = battle.p2.active[0];
    if (field.attackerMega !== false && a.canMegaEvo) battle.actions.runMegaEvo(a);
    if (field.defenderMega !== false && d.canMegaEvo) battle.actions.runMegaEvo(d);
    battle.field.clearWeather(); battle.field.clearTerrain();
    for (const side of battle.sides) for (const p of side.pokemon) p.clearBoosts();
    if (field.weather) battle.field.setWeather(({Sun: 'sunnyday', Rain: 'raindance', Sand: 'sandstorm', Snow: 'snow'} as Record<string, string>)[field.weather], a);
    if (field.terrain) battle.field.setTerrain(field.terrain.toLowerCase() + 'terrain', a);
    if (field.helpingHand) a.addVolatile('helpinghand', battle.p1.active[1]);
    if (field.reflect) d.side.addSideCondition('reflect', d);
    if (field.lightScreen) d.side.addSideCondition('lightscreen', d);
    if (field.attackerBoosts) battle.boost(field.attackerBoosts, a, a);
    if (field.defenderBoosts) battle.boost(field.defenderBoosts, d, d);
    if (field.intimidateAttacker) battle.boost({atk: -1}, a, d, engine.dex.abilities.get('intimidate'));
    if (field.attackerStatus) a.setStatus(field.attackerStatus);
    if (field.defenderStatus) d.setStatus(field.defenderStatus);
    if (field.attackerHPPercent !== undefined) a.hp = Math.max(1, Math.floor(a.maxhp * field.attackerHPPercent / 100));
    if (field.defenderHPPercent !== undefined) d.hp = Math.max(1, Math.floor(d.maxhp * field.defenderHPPercent / 100));
    if (field.attackerItemConsumed) a.clearItem();
    if (field.defenderItemConsumed) d.clearItem();
    let move = engine.dex.getActiveMove(moveId);
    battle.setActiveMove(move, a, d);
    battle.singleEvent('ModifyType', move, null, a, d, move, move);
    battle.singleEvent('ModifyMove', move, null, a, d, move, move);
    move = battle.runEvent('ModifyType', a, d, move, move);
    move = battle.runEvent('ModifyMove', a, d, move, move);
    move.willCrit = field.critical ?? !!move.willCrit;
    move.spreadHit = !field.singleTarget && ['allAdjacent', 'allAdjacentFoes'].includes(move.target);
    const expected = engine.damage(attacker, defender, field).find(row => row.moveId === moveId)!;
    assert.ok(expected, '伤害用例必须选择攻击方持有的招式');
    const rolls = Array.from({length: 16}, (_, i) => {
      battle.randomizer = (base: number) => Math.floor(base * (85 + i) / 100);
      return Number(battle.actions.getDamage(a, d, {...move}, true)) || 0;
    });
    assert.deepEqual(expected.rolls, [...new Set(rolls)].sort((x, y) => x - y), `${attacker.speciesId} ${moveId} → ${defender.speciesId} ${JSON.stringify(field)}`);
  } finally {battle.destroy();}
}

export function verifyMechanics(engine: BattleEngine): string[] {
  const fixture = (speciesId: string, abilityId: string, itemId: string, move: string, special = false): PokemonSet => ({speciesId, abilityId, itemId, moves: [move, 'protect', 'rest', 'sleeptalk'], natureId: special ? 'modest' : 'adamant', points: {hp: 32, atk: special ? 0 : 32, def: 0, spa: special ? 32 : 0, spd: 2, spe: 0}, level: 50, sourceKind: 'manual', sourceIds: []});
  const grass = fixture('rillaboom', 'grassysurge', 'miracleseed', 'woodhammer');
  const rock = fixture('tyranitar', 'sandstream', '', 'rockslide');
  const dragon = fixture('salamence', 'intimidate', 'salamencite', 'hypervoice', true);
  const fire = fixture('charizard', 'blaze', 'charizarditey', 'heatwave', true);
  const water = fixture('basculegion', 'adaptability', '', 'wavecrash');
  const steel = fixture('metagross', 'clearbody', '', 'bulletpunch');
  const cases: [string, PokemonSet, PokemonSet, string, BattleField][] = [
    ['Mega 飞行皮肤与双目标衰减', dragon, grass, 'hypervoice', {}],
    ['Mega 前初始特性', dragon, grass, 'hypervoice', {attackerMega: false}],
    ['Mega 日照、晴天与范围伤害', fire, grass, 'heatwave', {weather: 'Sun'}],
    ['雨天与适应力', water, rock, 'wavecrash', {weather: 'Rain'}],
    ['青草场地与道具增幅', grass, rock, 'woodhammer', {terrain: 'Grassy'}],
    ['帮助与双打反射壁', grass, rock, 'woodhammer', {reflect: true, helpingHand: true}],
    ['沙暴岩石特防与光墙', dragon, rock, 'hypervoice', {weather: 'Sand', lightScreen: true}],
    ['恒净之躯的威吓免疫', steel, grass, 'bulletpunch', {intimidateAttacker: true}],
    ['烧伤与负能力等级', grass, rock, 'woodhammer', {attackerStatus: 'brn', attackerBoosts: {atk: -1}}],
  ];
  for (const [, a, d, move, field] of cases) verifyDamageCase(engine, a, d, move, field);
  assert.equal(engine.damage(steel, grass, {terrain: 'Psychic'}).find(row => row.moveId === 'bulletpunch')!.max, 0, '精神场地必须阻止对接地目标的先制招式');
  return [...cases.map(([label]) => `${label}：16 档乱数与 Showdown 一致`), '精神场地的先制限制正确'];
}
