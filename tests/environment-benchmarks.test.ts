import {describe, expect, test} from 'vitest';
import {environmentBenchmarks, durabilityBenchmarks} from '../packages/core/analysis/environment-benchmarks';
import {bootstrap, engine, meta} from './fixtures';

const environmentId = bootstrap.environment.id;
const field = {attackerMega: true, defenderMega: true};

describe('环境速度、输出与耐久基准', () => {
  test('覆盖全部当前真实配置与输出招式，历史配置不计入当前环境', () => {
    const current = meta.configurations.filter(row => row.currentCount > 0);
    const overview = environmentBenchmarks(engine, meta, {environmentId, field});
    expect(overview.configurations).toBe(current.length);
    expect(new Set(overview.speeds.map(row => row.configurationId))).toEqual(new Set(current.map(row => row.id)));
    expect(overview.attacks.length).toBe(current.reduce((sum, row) => sum + row.set.moves.filter(id => engine.dex.moves.get(id).category !== 'Status').length, 0));
    expect(overview.attacks.every(row => meta.configurationById.get(row.configurationId)!.set.moves.includes(row.moveId))).toBe(true);
    const sneasler = current.find(row => row.speciesId === 'sneasler' && row.set.itemId === 'whiteherb')!;
    const speed = overview.speeds.find(row => row.configurationId === sneasler.id)!;
    const boosted = environmentBenchmarks(engine, meta, {environmentId, field: {...field, attackerTailwind: true}});
    expect(boosted.speeds.find(row => row.configurationId === sneasler.id)!.effective).toBe(speed.effective * 2);
    expect(boosted.speeds.find(row => row.configurationId === sneasler.id)!.natural).toBe(speed.natural);
  });
  test('真实雪妖女配置最高伤害后剩余1HP，减少1点HP后有1/16概率倒下', () => {
    const attackerId = '8e55c2c64636514b1a1c'; const defenderId = '5130cbbc0e80fb205f86';
    const before = structuredClone(meta.configurationById.get(defenderId)!.set);
    const result = durabilityBenchmarks(engine, meta, {environmentId, field, attackerId, moveId: 'woodhammer'});
    const row = result.rows.find(row => row.configurationId === defenderId)!;
    expect(row).toMatchObject({status: 'survives', margin: 1, damage: {max: 169, currentHP: 170, ohko: 0}, thresholds: [{stat: 'hp', from: 25, to: 24, max: 169, hp: 169, ohko: 1 / 16}]});
    expect(meta.configurationById.get(defenderId)!.set).toEqual(before);
    expect(result.rows.length).toBe(meta.configurations.filter(row => row.currentCount > 0).length);
    // A weather/terrain change invalidates the neutral-condition survival claim.
    const grassy = durabilityBenchmarks(engine, meta, {environmentId, field: {...field, terrain: 'Grassy'}, attackerId, moveId: 'woodhammer'}).rows.find(row => row.configurationId === defenderId)!;
    expect(grassy.damage.ohko).toBeGreaterThan(0); expect(grassy.thresholds).toEqual([]);
  });
  test('气腰或画皮的保护不当作耐久配点证据，击倒和未知攻击明确处理', () => {
    const attacker = meta.configurations.find(row => row.currentCount > 0 && row.speciesId === 'gholdengo' && row.set.moves.includes('makeitrain'))!;
    const result = durabilityBenchmarks(engine, meta, {environmentId, field, attackerId: attacker.id, moveId: 'makeitrain'});
    const protectedRows = result.rows.filter(row => row.damage.ohko === 0 && row.damage.max >= row.damage.currentHP);
    expect(protectedRows.length).toBeGreaterThan(0);
    expect(protectedRows.every(row => row.status === 'conditional' && !row.thresholds.length)).toBe(true);
    const shieldRows = result.rows.filter(row => meta.configurationById.get(row.configurationId)!.speciesId === 'mimikyu' && row.damage.ohko === 0 && row.damage.max > 0);
    expect(shieldRows.length).toBeGreaterThan(0); expect(shieldRows.every(row => row.status === 'conditional' && !row.thresholds.length)).toBe(true);
    expect(result.rows.some(row => row.status === 'ohko')).toBe(true);
    expect(() => durabilityBenchmarks(engine, meta, {environmentId, field, attackerId: attacker.id, moveId: 'protect'})).toThrow('变化招式');
    expect(() => durabilityBenchmarks(engine, meta, {environmentId, field, attackerId: attacker.id, moveId: 'woodhammer'})).toThrow('真实配置');
  });
});
