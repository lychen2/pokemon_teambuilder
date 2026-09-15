import {expect, test} from 'vitest';
import {memberStats} from '../packages/core/analysis/member-stats';
import {optimizeSpread} from '../packages/core/analysis/spread';
import {Evaluator} from '../packages/core/analysis/evaluate';
import {createDraft, member, zeros} from '../packages/core/domain';
import {engine, meta, observed} from './fixtures';

const evaluator = new Evaluator(engine, meta);
const draftFor = (set: ReturnType<typeof observed>) => ({...createDraft(engine.snapshot().id), members: [member(set)]});

test('实时能力值跟随当前点数和性格；招式未填完不阻塞，道具与控速作用于对局速度', () => {
  const set = {...observed('sneasler'), itemId: 'choicescarf', points: {...zeros()}, moves: ['protect']};
  const first = memberStats(engine, set, {attackerMega: false});
  expect(first.stats).toEqual(engine.stats(set));
  expect(first.battleSpeed).toBe(Math.floor(first.stats!.spe * 1.5));
  const changed = {...set, points: {...set.points, spe: 15}, natureId: 'jolly'};
  const next = memberStats(engine, changed, {attackerMega: false, attackerTailwind: true});
  expect(next.stats).toEqual(engine.stats(changed));
  expect(next.stats!.spe).toBeGreaterThan(first.stats!.spe);
  expect(next.battleSpeed).toBe(engine.speeds(changed, changed, {attackerMega: false, attackerTailwind: true}).attacker);
});

test('未知配点或性格不填零；未知道具不冒充无道具速度，Mega 能力值独立显示', () => {
  const set = observed('salamence', s => s.itemId === 'salamencite');
  const preview = memberStats(engine, set, {});
  expect(preview.megaStats).toEqual(engine.stats(set, true));
  expect(preview.stats).not.toEqual(preview.megaStats);
  expect(memberStats(engine, {...set, points: null}, {}).stats).toBeNull();
  expect(memberStats(engine, {...set, natureId: null}, {}).stats).toBeNull();
  const unknownItem = memberStats(engine, {...set, itemId: null}, {});
  expect(unknownItem.stats).toEqual(engine.stats(set)); expect(unknownItem.battleSpeed).toBeNull();
  expect(unknownItem.missing).toContain('道具');
});

test('数字追速按围巾后的实际速度配点，无须先保存编辑内容', () => {
  const set = {...observed('sneasler'), itemId: 'choicescarf', points: {...zeros()}};
  const draft = draftFor(set); const target = engine.stats(set).spe + 10;
  const result = optimizeSpread(evaluator, {draft, memberId: draft.members[0].id, speedTarget: target, field: {attackerMega: false}, previewOnly: true});
  expect(result.status).toBe('success'); expect(result.optimizedSet!.points!.spe).toBe(0);
  expect(engine.speeds(result.optimizedSet!, set, {attackerMega: false}).attacker).toBeGreaterThan(target);
  expect(result.proposal).toBeNull(); expect(result.remainingPoints).toBe(engine.snapshot().points.total);
  expect(draft.members[0].set).toEqual(set);
});

test('暴风雪无法保证击杀轰擂金刚猩时返回真实可达范围，不抛出无解异常或生成假方案', () => {
  const own = observed('ninetalesalola', s => s.moves.includes('blizzard'));
  // Champions M-C 的道具池没有突击背心，伤害引擎也会明确拒绝它；
  // 这里用真实存在的防御型流派（奇迹种子）构造「打不死」的目标。
  const target = observed('rillaboom', s => s.itemId === 'miracleseed');
  const draft = draftFor(own);
  const result = optimizeSpread(evaluator, {draft, memberId: draft.members[0].id, attackTarget: target, attackMove: 'blizzard', previewOnly: true});
  expect(result.status).toBe('unreachable'); expect(result.optimizedSet).toBeNull(); expect(result.proposal).toBeNull();
  expect(result.goals[0].achievable).toBe(false);
  const best = engine.damage({...own, points: result.goals[0].bestPoints}, target, {}, ['blizzard'])[0];
  expect(best.ohko).toBeLessThan(1);
  expect(result.goals[0].best).toContain(`${best.minPercent.toFixed(1)}%–${best.maxPercent.toFixed(1)}%`);
  expect(result.goals[0].best).toContain(`${(100 * best.ohko).toFixed(1)}%`);
  expect(draft.members[0].set).toEqual(own);
});

test('最高伤害可击杀不等于必定击杀；只有显式降低概率要求才采用对应配点', () => {
  const own = observed('ninetalesalola', s => s.moves.includes('blizzard'));
  // 与上一条相同：目标必须是当前规则里真实存在、且引擎能算的配置。
  const target = observed('rillaboom', s => s.itemId === 'miracleseed');
  const maximized = {...own, points: {...zeros(), spa: engine.snapshot().points.perStat}};
  const full = engine.damage(maximized, target, {}, ['blizzard'])[0];
  const hp = Math.ceil((full.min + full.max) / 2);
  const field = {defenderHPPercent: (hp + 0.01) / full.defenderHP * 100};
  const ceiling = engine.damage(maximized, target, field, ['blizzard'])[0];
  expect(ceiling.ohko).toBeGreaterThan(0); expect(ceiling.ohko).toBeLessThan(1);
  const draft = draftFor(own);
  const request = {draft, memberId: draft.members[0].id, attackTarget: target, attackMove: 'blizzard', field, previewOnly: true};
  expect(optimizeSpread(evaluator, request).status).toBe('unreachable');
  const relaxed = optimizeSpread(evaluator, {...request, attackChance: ceiling.ohko});
  expect(relaxed.status).toBe('success');
  expect(engine.damage(relaxed.optimizedSet!, target, field, ['blizzard'])[0].ohko).toBeGreaterThanOrEqual(ceiling.ohko);
});
