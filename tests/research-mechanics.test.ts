import {expect, test} from 'vitest';
import {mkdtempSync, rmSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {engine, meta, observed, fullDraft, bootstrap} from './fixtures';
import {moveRisk, compareRisks} from '../packages/core/battle/risk';
import {observe, publicLog, healthFraction} from '../packages/core/battle/observation';
import {legalActions} from '../packages/core/battle/policy';
import {Store} from '../packages/core/storage';
import {ResearchStore} from '../packages/core/research/storage';
import {storageReport, cleanStorage} from '../packages/core/maintenance';
import {extractArticle, evidenceCandidates, prepareDocument} from '../packages/core/research/documents';
import {validateResearch} from '../packages/core/research/workflow';
import {temporalSplit, fieldDistribution} from '../packages/core/analysis/calibration';
import {attachPartialEvidence} from '../packages/core/analysis/partial-evidence';
import {MetaModel} from '../packages/core/analysis/model';
import {pairMechanics} from '../packages/core/analysis/roles';
import {verifyDamageCase} from '../packages/core/battle/verify';
import {beliefActions} from '../packages/core/battle/belief-policy';
import {seededRandom} from '../packages/core/domain';

test('魔法镜反弹保留公开执行与特性，但不伪造原配置的招式', () => {
  const incineroar = observed('incineroar', s => s.moves.includes('partingshot'));
  const hatterene = observed('hatterene', s => s.abilityId === 'magicbounce');
  const own = [incineroar, ...fullDraft().members.map(m => m.set).filter(s => s.speciesId !== 'incineroar')].slice(0, 6);
  const opposing = [hatterene, ...fullDraft().members.map(m => m.set).filter(s => s.speciesId !== 'hatterene')].slice(0, 6);
  const battle = new engine.ps.Battle({format: engine.ps.Dex.formats.get(engine.formatId + '@@@!Open Team Sheets'), seed: [11, 7, 3, 5], p1: {name: 'A', team: own.map(s => engine.toPS(s))}, p2: {name: 'B', team: opposing.map(s => engine.toPS(s))}});
  try {
    battle.makeChoices('team 1234', 'team 1234');
    battle.actions.useMove('partingshot', battle.p1.active[0], {target: battle.p2.active[0]});
    const state = observe('p1', battle.p1.activeRequest, publicLog(battle.log), opposing.map(s => s.speciesId));
    expect(state.active.p2a.moves).not.toContain('partingshot');
    expect(state.active.p2a.invokedMoves.partingshot).toBe('ability: Magic Bounce');
    expect(state.active.p2a.ability).toBe('magicbounce');
    expect(state.active.p1a.moves).toContain('partingshot');
    expect(() => beliefActions({engine, meta, observation: state, own, actions: legalActions(engine, state), policy: 'support', random: seededRandom(13), samples: 2})).not.toThrow();
  } finally {battle.destroy();}
});

test('特殊 Mega 的初始形态由 battleOnly 确定，不丢失永恒之花形态', () => {
  const floette = observed('floetteeternal');
  expect(engine.initialSpeciesId('floettemega')).toBe('floetteeternal');
  const parsed = engine.parse(engine.export([floette]).replace('Floette-Eternal', 'Floette-Mega'));
  expect(parsed.sets[0].speciesId).toBe('floetteeternal'); expect(parsed.sets[0].abilityId).toBe(floette.abilityId);
});

test('破坏光线后的强制充能是等待行动，带颜色的公开血条按比例读取', () => {
  const sylveon = observed('sylveon', s => s.moves.includes('hyperbeam'));
  const own = [sylveon, ...fullDraft().members.map(m => m.set).filter(s => s.speciesId !== 'sylveon')].slice(0, 6);
  const opposing = fullDraft().members.map(m => m.set);
  const battle = new engine.ps.Battle({format: engine.ps.Dex.formats.get(engine.formatId + '@@@!Open Team Sheets'), seed: [2, 3, 5, 7], p1: {name: 'A', team: own.map(s => engine.toPS(s))}, p2: {name: 'B', team: opposing.map(s => engine.toPS(s))}});
  try {
    battle.makeChoices('team 1234', 'team 1234');
    battle.actions.useMove('hyperbeam', battle.p1.active[0], {target: battle.p2.active[0]});
    battle.makeRequest('move');
    const state = observe('p1', battle.p1.activeRequest, publicLog(battle.log), opposing.map(s => s.speciesId));
    expect(state.request.active[0].moves[0].id).toBe('recharge');
    const ranked = beliefActions({engine, meta, observation: state, own, actions: legalActions(engine, state), policy: 'support', random: seededRandom(13), samples: 2});
    expect(ranked.actions.every(action => Number.isFinite(action.prior))).toBe(true);
    expect(healthFraction('50/100g')).toBe(.5); expect(healthFraction('32/100y par')).toBe(.32);
  } finally {battle.destroy();}
});

test('PP 耗尽后的挣扎为无属性伤害，对幽灵不受普通系免疫', () => {
  const attacker = {...observed('rillaboom'), moves: ['struggle', 'protect', 'rest', 'sleeptalk']};
  const defender = observed('gengar');
  verifyDamageCase(engine, attacker, defender, 'struggle', {attackerMega: false, defenderMega: false, singleTarget: true});
  expect(engine.damage(attacker, defender).find(row => row.moveId === 'struggle')!.max).toBeGreaterThan(0);
});

test('命中风险由真实天气机制决定；多次命中提前落空；替代方案重新校验', () => {
  const fire = observed('charizard', s => s.moves.includes('heatwave')); const grass = observed('rillaboom');
  const heat = moveRisk(engine, fire, grass, 'heatwave', {weather: 'Sun'});
  expect(heat.accuracy).toBe(.9); expect(heat.koIncludingMiss).toBeLessThanOrEqual(.9);
  const ice = observed('weavile', s => s.moves.includes('tripleaxel'));
  const multi = moveRisk(engine, ice, grass, 'tripleaxel', {});
  expect(multi.fullConnection).toBeCloseTo(.9 ** 3);
  expect(multi.hitDistribution.reduce((sum, row) => sum + row.probability, 0)).toBeCloseTo(1);
  const thunder = {...observed('pawmot'), moves: ['thunder', 'protect', 'rest', 'sleeptalk']};
  expect(moveRisk(engine, thunder, grass, 'thunder', {weather: 'Rain'}).accuracy).toBe(1);
  expect(moveRisk(engine, thunder, grass, 'thunder', {weather: 'Sun'}).accuracy).toBe(.5);
  const comparison = compareRisks(engine, fire, grass, {});
  expect(comparison.alternatives.some(row => row.result.accuracy > .9)).toBe(true);
  for (const alternative of comparison.alternatives) expect(engine.validateSet({...fire, moves: fire.moves.map(move => move === alternative.replaces ? alternative.result.moveId : move)})).toEqual([]);
});

test('画皮和结冻头的首次命中、失效后伤害及形态速度与实际 Showdown 一致', () => {
  const attacker = observed('rillaboom', s => s.moves.includes('woodhammer'));
  for (const [speciesId, abilityId] of [['mimikyu', 'disguise'], ['eiscue', 'iceface']]) {
    const defender = {...attacker, speciesId, abilityId, itemId: ''};
    const team = (set: typeof attacker) => [engine.toPS(set), ...Array.from({length: 3}, () => ({...engine.toPS(set), ability: 'Run Away', item: ''}))];
    const battle = new engine.ps.Battle({format: engine.ps.Dex.formats.get(engine.formatId + '@@@!Open Team Sheets'), seed: [1, 3, 5, 7], p1: {name: 'A', team: team(attacker)}, p2: {name: 'B', team: team(defender)}});
    try {
      battle.makeChoices('team 1234', 'team 1234'); battle.field.clearWeather(); battle.field.clearTerrain();
      const a = battle.p1.active[0]; const d = battle.p2.active[0]; a.clearBoosts(); d.clearBoosts();
      battle.randomizer = (base: number) => Math.floor(base * .85);
      const attack = () => {const move = engine.dex.getActiveMove('woodhammer'); move.willCrit = false; battle.actions.useMove(move, a, {target: d});};
      const before = engine.damage(attacker, defender, {}, ['woodhammer'])[0];
      attack(); expect(d.maxhp - d.hp).toBe(before.min);
      expect(d.species.id).toBe(speciesId === 'mimikyu' ? 'mimikyubusted' : 'eiscuenoice');
      d.hp = d.maxhp; a.hp = a.maxhp;
      const after = engine.damage(attacker, defender, {defenderAbilityActive: false}, ['woodhammer'])[0];
      attack(); expect(d.maxhp - d.hp).toBe(Math.min(d.maxhp, after.min));
      expect(engine.speeds(attacker, defender, {defenderAbilityActive: false}).defender).toBe(d.storedStats.spe);
    } finally {battle.destroy();}
  }
});

test('复生祈祷选择倒下队友，实际 Showdown 恢复其一半 HP', () => {
  const pawmot = observed('pawmot', s => s.moves.includes('revivalblessing'));
  const own = [pawmot, ...fullDraft().members.map(m => m.set).filter(s => s.speciesId !== 'pawmot')].slice(0, 6);
  const battle = new engine.ps.Battle({format: engine.ps.Dex.formats.get(engine.formatId + '@@@!Open Team Sheets'), seed: [2, 3, 5, 7], p1: {name: 'A', team: own.map(s => engine.toPS(s))}, p2: {name: 'B', team: fullDraft().members.map(m => engine.toPS(m.set))}});
  try {
    battle.makeChoices('team 1234', 'team 1234');
    const target = battle.p1.pokemon[2]; target.faint(); battle.faintMessages();
    battle.actions.useMove('revivalblessing', battle.p1.active[0]);
    battle.makeRequest('switch');
    const state = observe('p1', battle.p1.activeRequest, publicLog(battle.log), own.map(s => s.speciesId));
    expect(state.request.side.pokemon[0].reviving).toBe(true);
    const actions = legalActions(engine, state);
    expect(actions.every(action => action.command.startsWith('switch 3'))).toBe(true);
    expect(battle.choose('p1', actions[0].command)).toBe(true);
    expect(target.fainted).toBe(false); expect(target.hp).toBe(Math.floor(target.maxhp / 2));
  } finally {battle.destroy();}
});

test('灭歌倒数与换出重置来自实际回合，支援依赖随关键队友消失', () => {
  const singer = observed('gengar', s => s.moves.includes('perishsong'));
  const own = [singer, ...fullDraft().members.map(m => m.set).filter(s => s.speciesId !== 'gengar')].slice(0, 6);
  const battle = new engine.ps.Battle({format: engine.ps.Dex.formats.get(engine.formatId + '@@@!Open Team Sheets'), seed: [11, 3, 5, 7], p1: {name: 'A', team: own.map(s => engine.toPS(s))}, p2: {name: 'B', team: fullDraft().members.map(m => engine.toPS(m.set))}});
  try {
    battle.makeChoices('team 1234', 'team 1234');
    battle.actions.useMove('perishsong', battle.p1.active[0]);
    const state = () => observe('p1', battle.p1.activeRequest, publicLog(battle.log), own.map(s => s.speciesId));
    expect(state().active.p1a.perishCount).toBe(3); expect(state().active.p2a.perishCount).toBe(3);
    battle.actions.switchIn(battle.p1.pokemon[2], 0);
    expect(state().active.p1a.perishCount).toBeUndefined();
    const trapper = meta.model.archetypes.find(a => a.representative.abilityId === 'shadowtag')!.representative;
    expect(pairMechanics(singer, trapper).benefits.some(text => text.includes('灭'))).toBe(true);
    expect(pairMechanics({...singer, moves: singer.moves.filter(move => move !== 'perishsong')}, trapper).benefits.some(text => text.includes('灭'))).toBe(false);
  } finally {battle.destroy();}
});

test('引文不伪造作者意图，解析失败可见，回放胜负不混入构筑频率', async () => {
  const article = extractArticle('<html><head><title>作者队报</title></head><body><nav>导航</nav><article><p>I chose this spread to survive the common attack.</p><script>secret()</script></article></body></html>');
  expect(article.raw).not.toContain('secret'); expect(article.raw).not.toContain('导航');
  const claims = evidenceCandidates(article.raw); expect(claims).toHaveLength(1); expect(claims[0].confirmed).toBe(false); expect(claims[0].interpretation).toBe('');
  const document = await prepareDocument({environmentId: bootstrap.environment.id, sourceType: 'rmt', url: 'https://example.test/report', raw: article.raw});
  validateResearch(document, bootstrap.environment);
  expect(() => validateResearch({...document, claims: [{quote: 'never in original text', interpretation: '', confirmed: true}]}, bootstrap.environment)).toThrow('引文');
  await expect(prepareDocument({environmentId: bootstrap.environment.id, sourceType: 'rmt', url: 'https://example.test/report'}, async () => new Response('Unavailable', {status: 503}))).rejects.toThrow('503');
  const replay = await prepareDocument({environmentId: bootstrap.environment.id, sourceType: 'replay', url: '', raw: '|player|p1|Alpha\n|player|p2|Beta\n|tier|[Gen 9] Champions VGC 2026 Regulation M-C\n|poke|p1|Gengar, M\n|start\n|turn|1\n|turn|2\n|win|Alpha'});
  expect(replay.replay?.winner).toBe('Alpha'); expect(replay.replay?.turns).toBe(2);
});

test('清理预览保留被回放引用的版本和研究快照，拒绝过期预览', () => {
  const directory = mkdtempSync(join(tmpdir(), 'poke-maintenance-')); const store = new Store(directory, resolve('assets')); new ResearchStore(store.db);
  try {
    store.saveDraft(fullDraft()); store.cache('analysis', {value: 1});
    store.db.prepare('INSERT INTO models(version,data) VALUES(?,?)').run('unused', JSON.stringify({version: 'unused', corpusVersion: 'unused-corpus'}));
    store.db.prepare('INSERT INTO corpora(version,data) VALUES(?,?)').run('unused-corpus', '{}');
    let report = storageReport(store); expect(report.plan.models).toContain('unused');
    store.saveJob({id: 'saved-replay', kind: 'simulate', status: 'completed', phase: 'done', progress: 1, message: '版本保留测试'}, {context: {modelVersion: 'unused', corpusVersion: 'unused-corpus'}});
    expect(() => cleanStorage(store, {planHash: report.plan.hash, unusedVersions: true, analysisCache: true, compact: false})).toThrow('引用已变化');
    report = storageReport(store); expect(report.plan.models).not.toContain('unused');
    cleanStorage(store, {planHash: report.plan.hash, unusedVersions: true, analysisCache: true, compact: true});
    expect(store.cached('analysis')).toBeUndefined(); expect(store.drafts()).toHaveLength(1); expect(store.model('unused')).toBeDefined();
    expect(statSync(join(directory, 'teambuilder.sqlite-wal')).size).toBe(0);
  } finally {store.close(); rmSync(directory, {recursive: true});}
});

test('时间留出隔离队伍、作者、链接，不纳入未来历史资料', () => {
  const split = temporalSplit(bootstrap.corpus, 'M-C');
  const fingerprints = new Set(split.held.map(t => t.fingerprint)); const linked = bootstrap.corpus.teams.filter(t => fingerprints.has(t.fingerprint));
  const authors = new Set(linked.map(t => t.author.trim().toLowerCase()).filter(Boolean)); const urls = new Set(linked.map(t => t.originUrl).filter(Boolean));
  for (const team of split.train.teams) {expect(fingerprints.has(team.fingerprint)).toBe(false); expect(authors.has(team.author.trim().toLowerCase())).toBe(false); expect(urls.has(team.originUrl)).toBe(false); expect(Date.parse(team.date)).toBeLessThan(Date.parse(split.cutoff!));}
});

test('未知性格与道具可贡献已知招式，去历史先验不留下零概率标签', () => {
  const original = bootstrap.corpus.observations.find(o => o.currentLegal && o.set.speciesId === 'sneasler' && o.season === 'M-C')!;
  const set = {...original.set, points: null, natureId: null, itemId: null};
  expect(engine.validateKnownSet(set)).toEqual([]);
  const masked = {...original, id: 'masked-evidence', set, currentLegal: false, knownLegal: true, known: {...original.known, points: false, nature: false, item: false}};
  const result = attachPartialEvidence({...bootstrap.corpus, observations: [...bootstrap.corpus.observations, masked]}, bootstrap.model.archetypes, 'M-C');
  expect(result.archetypes.some(a => a.partialEvidence?.some(row => row.observationId === masked.id))).toBe(true);
  expect(result.archetypes.map(a => a.representative)).toEqual(bootstrap.model.archetypes.map(a => a.representative));
  expect(set.natureId).toBeNull(); expect(set.points).toBeNull();
  const noHistory = new MetaModel(bootstrap.corpus, {...bootstrap.model, priorStrength: 0}, 'M-C');
  for (const species of new Set(bootstrap.model.archetypes.map(a => a.speciesId))) {
    const distribution = fieldDistribution(noHistory, species, [], 'itemId');
    expect([...distribution.keys()].sort()).toEqual([...fieldDistribution(meta, species, [], 'itemId').keys()].sort());
    const probabilities = [...distribution.values()];
    expect(probabilities.every(p => p > 0 && p <= 1)).toBe(true);
    expect(probabilities.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1);
  }
});
