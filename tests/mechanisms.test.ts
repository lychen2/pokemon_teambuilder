import {expect, test} from 'vitest';
import {resolve} from 'node:path';
import {bootstrap, engine, meta, observed} from './fixtures';
import {BattleEngine} from '../packages/core/battle/engine';
import {MECHANISMS, MECHANISM_GROUPS, configurationMechanisms, setMechanisms} from '../packages/core/analysis/mechanisms';
import {roleKnowledge} from '../packages/core/analysis/role-knowledge';
import {fieldFromTeam, pairMechanics, roleGroups, roles, teamMechanics} from '../packages/core/analysis/roles';
import {Evaluator} from '../packages/core/analysis/evaluate';
import {createDraft, member} from '../packages/core/domain';
import {TeamSearch} from '../packages/core/analysis/search';

test('机制目录引用真实 Showdown 数据，范围和降速分类与规则内容一致', () => {
  expect(new Set(MECHANISMS.map(rule => rule.id)).size).toBe(MECHANISMS.length);
  for (const rule of MECHANISMS) {
    expect(MECHANISM_GROUPS.some(group => group.id === rule.group)).toBe(true);
    for (const kind of ['moves', 'abilities', 'items'] as const) for (const id of rule[kind] ?? []) {
      expect(id, `${rule.id}/${kind}`).toMatch(/^[a-z0-9]+$/);
      expect(engine.dex[kind].get(id).exists, `${rule.id}/${id}`).toBe(true);
    }
  }
  for (const id of MECHANISMS.find(rule => rule.id === 'spread')!.moves!) {
    expect(['allAdjacent', 'allAdjacentFoes'].includes(engine.dex.moves.get(id).target) || id === 'expandingforce', id).toBe(true);
  }
  for (const id of MECHANISMS.find(rule => rule.id === 'speeddrop')!.moves!) {
    const move = engine.dex.moves.get(id);
    expect([move.boosts, move.secondary?.boosts, ...(move.secondaries ?? []).map((entry: any) => entry.boosts)].some(boosts => boosts?.spe < 0), id).toBe(true);
  }
});

test('机制按八类用途覆盖，轻装与种子不变成独立角色或重复控速分', () => {
  const base = {...observed('sneasler'), moves: [], abilityId: 'unburden', itemId: 'grassyseed'};
  expect(setMechanisms(base).map(rule => rule.id)).toEqual(['unburden', 'terrainseed']);
  expect(roles(base)).toEqual([]); expect(roleGroups(base)).toEqual([]);
  const speed = {...base, moves: ['tailwind', 'icywind', 'thunderwave', 'trickroom']};
  expect(roles(speed)).toEqual(['控速', '范围输出']);
  expect(roleGroups(speed)).toEqual(['speed', 'offense']);
  const knowledge = roleKnowledge(engine);
  expect(knowledge.groups).toHaveLength(8);
  for (const id of ['rain', 'sand', 'snow', 'electric', 'misty', 'protect', 'wideguard', 'screens', 'sleep', 'taunt', 'imprison', 'antisetup', 'pivot', 'allyheal']) {
    const rule = knowledge.entries.find(row => row.id === id)!;
    expect(rule.availableMoves.length + rule.availableAbilities.length, id).toBeGreaterThan(0);
  }
});

test('更新规则会改变机制可用项与版本，不影响其他机制', () => {
  const original = roleKnowledge(engine);
  const next = new BattleEngine(resolve('assets/engines', bootstrap.engine.id), `${engine.formatId}@@@-Wide Guard`, bootstrap.translations);
  const updated = roleKnowledge(next);
  expect(original.entries.find(row => row.id === 'wideguard')!.availableMoves).toContain('wideguard');
  expect(updated.entries.find(row => row.id === 'wideguard')!.availableMoves).toEqual([]);
  expect(updated.entries.find(row => row.id === 'rain')!.availableAbilities).toEqual(original.entries.find(row => row.id === 'rain')!.availableAbilities);
  expect(updated.version).not.toBe(original.version);
});

test('配置筛选只按实际招式、道具与对应 Mega 石识别日照和踩影', () => {
  const charizard = observed('charizard', set => set.itemId === 'charizarditey');
  const data = bootstrap.dex.species.find(species => species.id === 'charizard')!;
  const matches = configurationMechanisms(charizard, data);
  expect(matches.find(match => match.rule.id === 'sun')?.mega).toBe(true);
  expect(setMechanisms(charizard).some(rule => rule.id === 'sun')).toBe(false);
  expect(configurationMechanisms({...charizard, itemId: 'charizarditex'}, data).some(match => match.rule.id === 'sun')).toBe(false);
  const gengar = observed('gengar', set => set.itemId === 'gengarite');
  expect(configurationMechanisms(gengar, bootstrap.dex.species.find(species => species.id === 'gengar')).find(match => match.rule.id === 'trap')?.mega).toBe(true);
  const without = {...gengar, moves: gengar.moves.filter(move => move !== 'perishsong')};
  expect(configurationMechanisms(without).some(match => match.rule.id === 'perish')).toBe(false);
});

test('天气场地配合及冲突随真实配置变化，手动设置招式不提前激活场地', () => {
  const rain = {...observed('pelipper'), abilityId: 'drizzle'};
  const swift = {...observed('basculegion'), abilityId: 'swiftswim'};
  expect(pairMechanics(rain, swift).benefitResources).toContain('weather');
  expect(pairMechanics({...rain, abilityId: 'keeneye', moves: rain.moves.filter(id => id !== 'raindance')}, swift).benefitResources).not.toContain('weather');
  const manual = {...rain, abilityId: 'keeneye', moves: ['raindance']};
  expect(fieldFromTeam([manual])).toEqual({weather: undefined, terrain: undefined});
  expect(pairMechanics(manual, swift).benefits.join('；')).toContain('成功建立');
  const psychic = observed('indeedeef', set => set.abilityId === 'psychicsurge');
  const ice = {...observed('weavile'), moves: ['iceshard']};
  expect(pairMechanics(psychic, ice).conflictResources).toContain('terrain-priority');
  const misty = {...psychic, abilityId: 'mistysurge'};
  const sleepMoves = MECHANISMS.find(rule => rule.id === 'sleep')!.moves!;
  const sleeper = meta.configurations.find(configuration => configuration.set.moves.some(move => sleepMoves.includes(move)))!.set;
  expect(pairMechanics(misty, sleeper).conflicts.join('；')).toContain('接地');
  expect(pairMechanics(psychic, {...ice, moves: []}).conflictResources).not.toContain('terrain-priority');
});

test('同一行动窗口或复活资源不随标签与受益成员数量重复计分', () => {
  const cover = {...observed('indeedeef'), abilityId: 'owntempo', moves: ['followme']};
  const flinch = {...observed('incineroar'), abilityId: 'blaze', moves: ['fakeout']};
  const setup = {...observed('hatterene'), moves: ['calmmind']};
  const before = teamMechanics([cover, setup]); const after = teamMechanics([cover, setup, flinch]);
  expect(before.benefitResources).toEqual(['action-window']);
  expect(after.benefitResources).toEqual(before.benefitResources);
  expect(after.benefits.length).toBeGreaterThan(before.benefits.length);
  const evaluator = new Evaluator(engine, meta); const metrics = {pressure: 0, resilience: 0, speed: 0, coverage: 0, tailRisk: 0};
  expect(evaluator.score(metrics, [cover, setup].map(member))).toBe(evaluator.score(metrics, [cover, setup, flinch].map(member)));
  const healer = observed('pawmot', set => set.moves.includes('revivalblessing'));
  expect(teamMechanics([healer, cover, setup]).benefitResources.filter(id => id === 'revive')).toHaveLength(1);
  expect(pairMechanics({...cover, moves: ['haze']}, setup).conflictResources).toContain('setup-reset');
});

test('机制候选不能被单一物种的变体占满，沙暴核心能保留原配置补齐', () => {
  const source = meta.corpus.teams.find(team => team.id === '2001945654:MC177')!;
  const core = source.observationIds.slice(0, 2).map(id => member(meta.observationById.get(id)!.set));
  const draft = {...createDraft(engine.snapshot().id), members: core};
  const search = new TeamSearch(new Evaluator(engine, meta));
  const candidates = search.candidates(draft);
  const species = new Set([...core.map(member => member.set.speciesId), ...candidates.map(configuration => configuration.speciesId)].map(id => engine.dex.species.get(id).baseSpecies));
  expect(species.size).toBeGreaterThanOrEqual(engine.ruleTable.maxTeamSize);
  const proposals = search.recommend({draft, kind: 'complete', limit: 1});
  expect(proposals[0].members.slice(0, core.length)).toEqual(core);
  expect(engine.validateDraft({...draft, members: proposals[0].members})).toEqual([]);
  expect(proposals[0].members).toHaveLength(engine.ruleTable.maxTeamSize);
});
