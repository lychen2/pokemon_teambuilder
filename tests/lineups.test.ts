import {expect, test, vi} from 'vitest';
import {engine, meta, fullDraft, observed} from './fixtures';
import {Evaluator, type Evaluation} from '../packages/core/analysis/evaluate';
import {evaluateRoster, rankLineups} from '../packages/core/analysis/lineups';
import {analyzeSelections} from '../packages/core/analysis/selections';
import {teamMechanics} from '../packages/core/analysis/roles';
import {createPreviewPolicy} from '../packages/core/battle/preview-policy';
import {legalActions} from '../packages/core/battle/policy';
import {observe, publicLog} from '../packages/core/battle/observation';
import {member, createDraft} from '../packages/core/domain';
import {BattleEngine} from '../packages/core/battle/engine';
import {resolve} from 'node:path';
import {bootstrap} from './fixtures';
import {simulate} from '../packages/core/battle/simulation';

const evaluator = new Evaluator(engine, meta);

test('未选出的场地手不触发种子，参考伤害保留相同形态与场地条件', () => {
  const draft = fullDraft(); const routes = rankLineups(evaluator, draft.members);
  expect(routes.every(route => route.members.length === engine.ruleTable.pickedTeamSize)).toBe(true);
  const withoutGrass = routes.find(route => route.members.some(m => m.set.itemId === 'grassyseed') && route.members.every(m => m.set.abilityId !== 'grassysurge'))!;
  expect(withoutGrass).toBeDefined(); expect(withoutGrass.field.terrain).toBeUndefined();
  const seed = withoutGrass.members.find(m => m.set.itemId === 'grassyseed')!;
  const actual = engine.speeds(seed.set, seed.set, {...withoutGrass.field, attackerMega: false, defenderMega: false}).attacker;
  expect(actual).toBe(engine.stats(seed.set).spe);
  const analysis = evaluator.analyze(draft);
  for (const threat of analysis.threats) {
    const attacker = draft.members.find(m => m.id === threat.bestAttackerId)!;
    const damage = engine.damage(attacker.set, threat.set, threat.field).find(row => row.moveId === threat.moveId)!;
    expect(damage.minPercent).toBe(threat.bestDamage); expect(damage.ohko).toBe(threat.bestKO);
    expect(threat.outspeedCount).toBeLessThanOrEqual(engine.ruleTable.pickedTeamSize);
  }
});

test('Mega 耿鬼的踩影只属于耿鬼进化路线，后排 Mega 天气不能提前借给首发', () => {
  const sets = [observed('gengar', s => s.itemId === 'gengarite' && s.moves.includes('perishsong')), observed('charizard', s => s.itemId === 'charizarditey'), observed('sneasler', s => s.itemId === 'grassyseed'), observed('rillaboom')];
  const draft = {...createDraft(engine.snapshot().id), members: sets.map(set => ({...member(set), id: set.speciesId}))};
  const result = analyzeSelections(evaluator, draft);
  const ghost = result.routes.find(route => route.megaId === 'gengar')!;
  expect(ghost.winConditions).toContain('限制换人后以灭亡倒数结束对局');
  expect(ghost.dependencies.some(row => row.supportId === 'gengar' && row.beneficiaryId === 'gengar')).toBe(true);
  expect(result.routes.filter(route => route.megaId !== 'gengar').every(route => !route.winConditions.includes('限制换人后以灭亡倒数结束对局'))).toBe(true);
  expect(ghost.field.weather).toBeUndefined();
  const sun = result.routes.find(route => route.megaId === 'charizard')!;
  expect(sun.field.weather).toBe('Sun');
  const reserve = sun.leadOptions.find(lead => !lead.members.includes('charizard'))!;
  expect(reserve.megaId).toBeNull(); expect(reserve.field.weather).toBeUndefined();
  expect(reserve.concerns.join('；')).toContain('后排');
});

test('复活是同一份有限资源，新增受益队友不会重复累计同一句支援收益', () => {
  const healer = observed('pawmot', s => s.moves.includes('revivalblessing'));
  const partners = [observed('garchomp'), observed('salamence'), observed('sylveon')];
  const short = teamMechanics([healer, partners[0]]).benefits.filter(text => text.includes('复生祈祷'));
  expect(short).toHaveLength(1);
  expect(teamMechanics([healer, ...partners]).benefits.filter(text => text.includes('复生祈祷'))).toEqual(short);
});

test('按真实对手名单选出，未覆盖配置保留范围，选出人数随 Showdown 规则变化', () => {
  const draft = fullDraft(); const result = evaluateRoster(evaluator, draft.members);
  expect(result.matchups.length).toBeGreaterThan(0);
  expect(result.matchups.every(row => row.route.members.length === 4)).toBe(true);
  expect(result.matchups.some(row => row.scenario.coveredProbability < 1)).toBe(true);
  expect(result.matchups.every(row => row.scenario.targets.every(target => row.scenario.species.includes(evaluator.threats[target.index].configuration.speciesId)))).toBe(true);
  const next = new BattleEngine(resolve('assets/engines', bootstrap.engine.id), `${engine.formatId}@@@!!Picked Team Size = 3`, bootstrap.translations);
  expect(next.ruleTable.pickedTeamSize).toBe(3);
  expect(rankLineups(new Evaluator(next, meta), draft.members).every(route => route.members.length === 3)).toBe(true);
  const played = simulate(next, meta, {draft: {...draft, environmentId: next.snapshot().id}, opponentTeam: draft.members.map(member => member.set), trials: 1, trainingTrials: 0, mode: 'closed', seconds: 1, seed: 231}, {cancelled: () => false, progress: () => {}, preview: createPreviewPolicy(new Evaluator(next, meta))});
  expect(played.completed).toBe(1); expect(played.selections.every(selection => selection.members.length === 3)).toBe(true);
  expect(played.trace.some(line => line.startsWith('|showteam|'))).toBe(false);
  expect(() => new BattleEngine(resolve('assets/engines', bootstrap.engine.id), `${engine.formatId}@@@Picked Team Size = 3`, bootstrap.translations)).toThrow();
});

test('预览只依赖公开对手和己方配置，实际配点改变评分，固定采样可复现', () => {
  const own = fullDraft().members.map(m => m.set);
  const battle = new engine.ps.Battle({format: engine.ps.Dex.formats.get(engine.formatId + '@@@!Open Team Sheets'), seed: [1, 2, 3, 4], p1: {name: 'A', team: own.map(s => engine.toPS(s))}, p2: {name: 'B', team: own.map(s => engine.toPS(s))}});
  try {
    const observation = observe('p1', battle.p1.activeRequest, publicLog(battle.log), own.map(s => s.speciesId));
    const input = {observation, own, actions: legalActions(engine, observation), seed: 417, samples: 2};
    const queries = vi.spyOn(engine, 'damage');
    const first = createPreviewPolicy(evaluator)(input);
    const queryCount = queries.mock.calls.length; queries.mockRestore();
    expect(first.evidence.queries).toBe(queryCount);
    expect(first.actions).toHaveLength(180);
    battle.p2.pokemon[0].set.item = 'Life Orb'; battle.p2.pokemon[0].set.moves = ['Splash'];
    expect(createPreviewPolicy(evaluator)(input).actions).toEqual(first.actions);
    const edited = own.map((set, index) => index ? set : {...set, points: {...set.points!, atk: 0, spe: 0}});
    expect(createPreviewPolicy(evaluator)({...input, own: edited}).actions.map(action => action.prior)).not.toEqual(first.actions.map(action => action.prior));
  } finally {battle.destroy();}
});

test('选出缓存保留完整指标，配点与权重改变后不能复用旧结果', () => {
  const draft = fullDraft(); const cache = new Map<string, Evaluation>();
  const original = evaluateRoster(evaluator, draft.members);
  expect(evaluateRoster(evaluator, draft.members, undefined, cache)).toEqual(original);
  expect(evaluateRoster(evaluator, structuredClone(draft.members), undefined, cache)).toEqual(original);
  const changed = draft.members.map((member, index) => index ? member : {...member, set: {...member.set, points: {...member.set.points!, atk: 0, spa: 0, spe: 0}}});
  const updated = evaluateRoster(evaluator, changed, undefined, cache);
  expect(updated).toEqual(evaluateRoster(evaluator, changed));
  expect(updated.metrics).not.toEqual(original.metrics);
  const weights = {pressure: 0, resilience: 5, speed: 0, coverage: 0, tailRisk: 5};
  expect(evaluateRoster(evaluator, draft.members, weights, cache)).toEqual(evaluateRoster(evaluator, draft.members, weights));
});
