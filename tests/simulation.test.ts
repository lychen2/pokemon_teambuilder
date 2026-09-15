import {expect, test, vi} from 'vitest';
import {engine, meta, fullDraft, observed} from './fixtures';
import {publicLog, observe} from '../packages/core/battle/observation';
import {InformationTree, legalActions} from '../packages/core/battle/policy';
import {beliefActions} from '../packages/core/battle/belief-policy';
import {informationKey} from '../packages/core/battle/information-state';
import {seededRandom} from '../packages/core/domain';
import {simulate, wilson, drawHiddenTeam} from '../packages/core/battle/simulation';
import {createPreviewPolicy} from '../packages/core/battle/preview-policy';
import {Evaluator} from '../packages/core/analysis/evaluate';

const control = () => ({cancelled: () => false, progress: () => {}, preview: createPreviewPolicy(new Evaluator(engine, meta))});

test('封闭信息集过滤精确 HP 与队表，行动生成只接收观察对象', () => {
  const visible = publicLog(['|split|p2', '|-damage|p2a: Target|155/201', '|-damage|p2a: Target|78/100', '|showteam|p2|secret-packed-team', '|turn|1']);
  expect(visible.join('\n')).not.toContain('155/201'); expect(visible.join('\n')).not.toContain('secret-packed-team'); expect(visible.join('\n')).toContain('78/100');
  const draft = fullDraft();
  const battle = new engine.ps.Battle({format: engine.ps.Dex.formats.get(engine.formatId + '@@@!Open Team Sheets'), seed: [1, 2, 3, 4], p1: {name: 'A', team: draft.members.map(m => engine.toPS(m.set))}, p2: {name: 'B', team: draft.members.map(m => engine.toPS(m.set))}});
  try {const state = observe('p1', battle.p1.activeRequest, publicLog(battle.log), draft.members.map(m => m.set.speciesId)); const commands = legalActions(engine, state).map(a => a.command); battle.p2.pokemon[0].set.item = 'Life Orb'; battle.p2.pokemon[0].set.moves = ['Splash']; expect(legalActions(engine, state).map(a => a.command)).toEqual(commands); expect(commands.length).toBe(180);} finally {battle.destroy();}
});

test('实际回合、固定种子复现、取消不伪造胜负', () => {
  const draft = fullDraft(); const request = {draft, seconds: 0.0001, trials: 8, seed: 4192, mode: 'closed' as const, opponentTeamId: meta.corpus.teams.find(t => t.season === 'M-C' && t.status === 'valid')!.id};
  const a = simulate(engine, meta, request, control()); const b = simulate(engine, meta, request, control());
  expect(a.completed).toBe(8); expect(a.wins + a.losses + a.ties).toBe(a.completed); expect(a.trace.some(t => t.startsWith('|move|'))).toBe(true); expect(a.trace.some(t => t.startsWith('|win|') || t.startsWith('|tie|'))).toBe(true);
  expect({...a, elapsedMs: 0}).toEqual({...b, elapsedMs: 0});
  const cancelled = simulate(engine, meta, request, {...control(), cancelled: () => true});
  expect(cancelled.cancelled).toBe(true); expect(cancelled.completed).toBe(0); expect(cancelled.winRate).toBeNull(); expect(wilson(1, 1)![0]).toBeLessThan(0.25);
});

test('配对训练预算一致，相同队伍收益差为零，无解物种立即暴露', () => {
  const draft = fullDraft();
  const result = simulate(engine, meta, {draft, baseline: draft.members, seconds: 0.001, trials: 4, trainingTrials: 8, seed: 219, mode: 'closed'}, control());
  expect(result.trainingGames).toBe(8); expect(result.baselineTrainingGames).toBe(8); expect(result.paired?.trials).toBe(4); expect(result.paired?.delta).toBe(0);
  expect(() => drawHiddenTeam(meta, engine, ['rillaboom', 'rillaboom'], () => 0.5)).toThrow('物种条款');
});

test('伤害与支援策略完成真实回合并保留逐场决策证据', () => {
  for (const strategy of ['damage', 'support'] as const) {
    const result = simulate(engine, meta, {draft: fullDraft(), seconds: 30, trainingTrials: 0, trials: 1, seed: 221, mode: 'closed', strategy, beliefSamples: 2, opponentPolicies: [strategy]}, control());
    expect(result.completed).toBe(1); expect(result.beliefEvidence!.queries).toBeGreaterThan(0);
    expect(result.replays![0].trace.some(line => /^\|(win|tie)\|/.test(line))).toBe(true);
    expect(result.replays![0].decisions.some(row => row.side === 'p2')).toBe(true);
  }
});

test('信息键保留已知招式、道具和计时，策略无法读取对手私有字段', () => {
  const draft = fullDraft(); const own = draft.members.map(m => m.set);
  const battle = new engine.ps.Battle({format: engine.ps.Dex.formats.get(engine.formatId + '@@@!Open Team Sheets'), seed: [2, 3, 5, 7], p1: {name: 'A', team: own.map(s => engine.toPS(s))}, p2: {name: 'B', team: own.map(s => engine.toPS(s))}});
  try {
    battle.makeChoices('team 1234', 'team 1234');
    const state = observe('p1', battle.p1.activeRequest, publicLog(battle.log), own.map(s => s.speciesId));
    const ranked = () => beliefActions({engine, meta, observation: state, own, actions: legalActions(engine, state), policy: 'support', random: seededRandom(29), samples: 2});
    const before = ranked(); battle.p2.pokemon[0].set.item = 'Life Orb'; battle.p2.pokemon[0].set.moves = ['Splash'];
    expect(ranked()).toEqual(before);
    const transport = structuredClone(state); transport.request.rqid = 999; transport.request.side.name = 'changed';
    expect(informationKey(transport)).toBe(informationKey(state));
    const revealed = structuredClone(state); revealed.active.p2a.moves.push('protect');
    expect(informationKey(revealed)).not.toBe(informationKey(state));
    const item = structuredClone(state); item.active.p2a.item = 'choicescarf';
    expect(informationKey(item)).not.toBe(informationKey(state));
    const tree = new InformationTree(); const actions = legalActions(engine, state); const decision = tree.choose(state, actions, seededRandom(1), true);
    tree.backpropagate([{key: decision.key, command: decision.action.command}], 1);
    tree.choose(transport, actions, seededRandom(1), false);
    expect(tree.diagnostics().evaluationReuse).toBe(1);
  } finally {battle.destroy();}
});

test('过期场地与已换出成员的临时状态不阻止树复用，公开知识及空间剩余回合不可合并', () => {
  const preview = fullDraft().members.map(member => member.set.speciesId);
  const lines = ['|turn|1', '|switch|p2a: Sneasler|Sneasler, F|100/100', '|move|p2a: Sneasler|Feint|p1a: Target', '|-item|p2a: Sneasler|Focus Sash', '|-boost|p2a: Sneasler|atk|2', '|turn|2', '|switch|p2a: Rillaboom|Rillaboom, M|100/100', '|turn|4'];
  const state = observe('p1', {wait: true}, lines, preview);
  const same = structuredClone(state); same.weatherStarted = 3; same.terrainStarted = 2; same.tailwind.p1 = false;
  same.seen['p2: Sneasler'].entered = 0; same.seen['p2: Sneasler'].boosts.atk = 0;
  expect(informationKey(same)).toBe(informationKey(state));
  const hiddenKnowledge = structuredClone(same); hiddenKnowledge.seen['p2: Sneasler'].moves.push('helpinghand');
  expect(informationKey(hiddenKnowledge)).not.toBe(informationKey(state));
  const item = structuredClone(same); item.seen['p2: Sneasler'].item = 'grassyseed';
  expect(informationKey(item)).not.toBe(informationKey(state));
  const room = observe('p1', {wait: true}, [...lines, '|-fieldstart|move: Trick Room', '|turn|5'], preview);
  const olderRoom = {...room, trickRoomStarted: room.trickRoomStarted - 1};
  expect(informationKey(olderRoom)).not.toBe(informationKey(room));
});

test('策略不奖励被精神场地挡住的击掌奇袭，帮助按队友同时行动评分', () => {
  const incineroar = meta.corpus.observations.find(o => o.currentLegal && o.set.speciesId === 'incineroar' && o.set.moves.includes('fakeout') && o.set.moves.includes('helpinghand'))!.set;
  const sinistcha = observed('sinistcha', s => s.moves.includes('protect') && s.moves.includes('matchagotcha'));
  const indeedee = observed('indeedeef', s => s.abilityId === 'psychicsurge');
  const hatterene = observed('hatterene');
  const roster = (leads: typeof incineroar[]) => [...leads, ...fullDraft().members.map(m => m.set).filter(s => !leads.some(p => p.speciesId === s.speciesId))].slice(0, 6);
  const own = roster([incineroar, sinistcha]); const opponent = roster([indeedee, hatterene]);
  const battle = new engine.ps.Battle({format: engine.ps.Dex.formats.get(engine.formatId + '@@@!Open Team Sheets'), seed: [1, 3, 5, 7], p1: {name: 'A', team: own.map(s => engine.toPS(s))}, p2: {name: 'B', team: opponent.map(s => engine.toPS(s))}});
  try {
    battle.makeChoices('team 1234', 'team 1234');
    const state = observe('p1', battle.p1.activeRequest, publicLog(battle.log), opponent.map(s => s.speciesId));
    expect(state.terrain).toBe('psychicterrain');
    const index = (slot: number, id: string) => state.request.active[slot].moves.findIndex((m: any) => m.id === id) + 1;
    const fakeout = `move ${index(0, 'fakeout')} 1`; const help = `move ${index(0, 'helpinghand')} -2`;
    const protect = `move ${index(1, 'protect')}`; const attack = `move ${index(1, 'matchagotcha')}`;
    for (const policy of ['mixed', 'damage', 'support'] as const) {
      const actions = legalActions(engine, state, policy);
      const ranked = beliefActions({engine, meta, observation: state, own, actions, policy, random: seededRandom(41), samples: 2}).actions;
      const prior = (command: string) => ranked.find(a => a.command === command)!.prior;
      expect(prior(`${fakeout}, ${protect}`)).toBeLessThan(0);
      expect(prior(`${help}, ${protect}`)).toBeLessThan(0);
      expect(prior(`${help}, ${attack}`)).toBeGreaterThan(prior(`${help}, ${protect}`) + 4);
    }
    const target = battle.p2.active[0]; const hp = target.hp;
    battle.actions.useMove('fakeout', battle.p1.active[0], {target});
    expect(target.hp).toBe(hp); expect(target.volatiles.flinch).toBeUndefined();
    expect(publicLog(battle.log).some(line => line.includes('move: Psychic Terrain'))).toBe(true);
  } finally {battle.destroy();}
});

test('灭歌策略识别本回合Mega后的踩影，并在真实回合建立倒数', () => {
  const sourceSets = (id: string) => meta.corpus.teams.find(team => team.id === id)!.observationIds.map(id => meta.observationById.get(id)!.set);
  const source = sourceSets('2001945654:MC101'); const opposing = sourceSets('2001945654:MC111');
  const own = [...source.filter(s => s.speciesId === 'gengar'), ...source.filter(s => s.speciesId === 'incineroar'), ...source.filter(s => !['gengar', 'incineroar'].includes(s.speciesId))];
  const opponent = [...opposing.filter(s => s.speciesId === 'pawmot'), ...opposing.filter(s => s.speciesId === 'delphox'), ...opposing.filter(s => !['pawmot', 'delphox'].includes(s.speciesId))];
  const battle = new engine.ps.Battle({format: engine.ps.Dex.formats.get(engine.formatId + '@@@!Open Team Sheets'), seed: [8, 6, 4, 2], p1: {name: 'A', team: own.map(s => engine.toPS(s))}, p2: {name: 'B', team: opponent.map(s => engine.toPS(s))}});
  try {
    battle.makeChoices('team 1234', 'team 1234');
    const state = observe('p1', battle.p1.activeRequest, publicLog(battle.log), opponent.map(s => s.speciesId));
    const index = (slot: number, id: string) => state.request.active[slot].moves.findIndex((m: any) => m.id === id) + 1;
    const plain = `move ${index(0, 'perishsong')}, move ${index(1, 'fakeout')} 1`;
    const mega = plain.replace(', ', ' mega, ');
    const actions = legalActions(engine, state, 'support').filter(action => [plain, mega].includes(action.command));
    expect(actions).toHaveLength(2);
    const ranked = beliefActions({engine, meta, observation: state, own, actions, policy: 'support', random: seededRandom(44), samples: 2}).actions;
    expect(ranked.find(action => action.command === mega)!.prior).toBeGreaterThan(ranked.find(action => action.command === plain)!.prior);
    battle.makeChoices(mega, 'switch 3, switch 4');
    expect(battle.p1.active[0].ability).toBe('shadowtag');
    expect(battle.p2.active.every((pokemon: any) => pokemon.volatiles.perishsong)).toBe(true);
    expect(publicLog(battle.log).some(line => line.includes('|-mega|p1a: Gengar|'))).toBe(true);
  } finally {battle.destroy();}
});

test('队友共享本回合Mega建立的天气，历史晴雨队的气象球按晴天计算', () => {
  const sourceSets = (id: string) => meta.corpus.teams.find(team => team.id === id)!.observationIds.map(id => meta.observationById.get(id)!.set);
  const source = sourceSets('1458357160:MB399'); const opposing = sourceSets('2001945654:MC100');
  const own = [...source.filter(s => s.speciesId === 'charizard'), ...source.filter(s => s.speciesId === 'pelipper'), ...source.filter(s => !['charizard', 'pelipper'].includes(s.speciesId))];
  const opponent = [...opposing.filter(s => s.speciesId === 'rillaboom'), ...opposing.filter(s => s.speciesId === 'primarina'), ...opposing.filter(s => !['rillaboom', 'primarina'].includes(s.speciesId))];
  expect(own.flatMap(set => engine.validateSet(set))).toEqual([]);
  const battle = new engine.ps.Battle({format: engine.ps.Dex.formats.get(engine.formatId + '@@@!Open Team Sheets'), seed: [9, 7, 5, 3], p1: {name: 'A', team: own.map(s => engine.toPS(s))}, p2: {name: 'B', team: opponent.map(s => engine.toPS(s))}});
  const damage = vi.spyOn(engine, 'damage');
  try {
    battle.makeChoices('team 1234', 'team 1234');
    const state = observe('p1', battle.p1.activeRequest, publicLog(battle.log), opponent.map(s => s.speciesId));
    expect(state.weather).toBe('raindance');
    const index = (slot: number, id: string) => state.request.active[slot].moves.findIndex((m: any) => m.id === id) + 1;
    const plain = `move ${index(0, 'protect')}, move ${index(1, 'weatherball')} 1`;
    const mega = plain.replace(', ', ' mega, ');
    const actions = legalActions(engine, state, 'support').filter(action => [plain, mega].includes(action.command));
    expect(actions).toHaveLength(2);
    beliefActions({engine, meta, observation: state, own, actions, policy: 'support', random: seededRandom(46), samples: 2});
    const calculated = damage.mock.calls.flatMap(([attacker, defender, field], i) => attacker.speciesId === 'pelipper' && defender.speciesId === 'rillaboom'
      ? [{weather: field!.weather, result: damage.mock.results[i].value.find((row: {moveId: string}) => row.moveId === 'weatherball')}] : []);
    const rain = calculated.filter(row => row.weather === 'Rain'); const sun = calculated.filter(row => row.weather === 'Sun');
    expect(rain).toHaveLength(2); expect(sun).toHaveLength(2);
    sun.forEach((row, i) => expect(row.result.expectedDamage).toBeGreaterThan(rain[i].result.expectedDamage));
    battle.makeChoices(mega, `move ${opponent[0].moves.indexOf('fakeout') + 1} 1, move ${opponent[1].moves.indexOf('protect') + 1}`);
    expect(battle.field.weather).toBe('sunnyday');
    const log = publicLog(battle.log);
    expect(log.some(line => line.startsWith('|move|p1b: Pelipper|Weather Ball|'))).toBe(true);
    expect(log.some(line => line.startsWith('|-supereffective|p2a: Rillaboom'))).toBe(true);
  } finally {damage.mockRestore(); battle.destroy();}
});

test('雪天对局从真实天气协议读取物防加成，不按无天气评分', () => {
  const sourceSets = (id: string) => meta.corpus.teams.find(team => team.id === id)!.observationIds.map(id => meta.observationById.get(id)!.set);
  const own = sourceSets('2001945654:MC103'); const source = sourceSets('2001945654:MC101');
  const opponent = [...source.filter(s => s.speciesId === 'dragonite'), ...source.filter(s => s.speciesId === 'incineroar'), ...source.filter(s => !['dragonite', 'incineroar'].includes(s.speciesId))];
  const battle = new engine.ps.Battle({format: engine.ps.Dex.formats.get(engine.formatId + '@@@!Open Team Sheets'), seed: [4, 5, 6, 7], p1: {name: 'A', team: own.map(s => engine.toPS(s))}, p2: {name: 'B', team: opponent.map(s => engine.toPS(s))}});
  const damage = vi.spyOn(engine, 'damage');
  try {
    battle.makeChoices('team 1234', 'team 1234');
    const state = observe('p1', battle.p1.activeRequest, publicLog(battle.log), opponent.map(s => s.speciesId));
    expect(state.weather).toBe('snowscape');
    const index = (slot: number, id: string) => state.request.active[slot].moves.findIndex((m: any) => m.id === id) + 1;
    const command = `move ${index(0, 'protect')}, move ${index(1, 'blizzard')}`;
    const actions = legalActions(engine, state, 'support').filter(action => action.command === command);
    expect(actions).toHaveLength(1);
    beliefActions({engine, meta, observation: state, own, actions, policy: 'support', random: seededRandom(48), samples: 2});
    const callIndex = damage.mock.calls.findIndex(([attacker, defender]) => attacker.speciesId === 'dragonite' && defender.speciesId === 'baxcalibur');
    expect(callIndex).toBeGreaterThanOrEqual(0);
    const [, , field] = damage.mock.calls[callIndex];
    expect(field!.weather).toBe('Snow');
    const snowy = engine.damage(opponent[0], own[0], field).find(row => row.moveId === 'dragonclaw')!;
    const clear = engine.damage(opponent[0], own[0], {...field, weather: undefined}).find(row => row.moveId === 'dragonclaw')!;
    expect(snowy.expectedDamage).toBeLessThan(clear.expectedDamage);
  } finally {damage.mockRestore(); battle.destroy();}
});
