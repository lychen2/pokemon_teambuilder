import {describe, expect, test} from 'vitest';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {bootstrap, engine, meta, observed, fullDraft} from './fixtures';
import {STAT_KEYS} from '../packages/core/types';
import {applyProposal, complete, createDraft, member, setKey, respectsLock} from '../packages/core/domain';
import {Evaluator} from '../packages/core/analysis/evaluate';
import {TeamSearch, proposalFor} from '../packages/core/analysis/search';
import {optimizeSpread} from '../packages/core/analysis/spread';
import {clusterFeatures} from '../packages/core/analysis/clustering';
import {MetaModel, tunePrior} from '../packages/core/analysis/model';
import {BattleEngine, convolve, directKO} from '../packages/core/battle/engine';
import {verifyEngine, verifyMechanics} from '../packages/core/battle/verify';
import {parseSheet, canonicalPasteUrl, importCorpus, PasteCache} from '../packages/core/sources/corpus';
import {Store} from '../packages/core/storage';
import {validateInput} from '../packages/core/schema';
import {speedInField} from '../packages/core/analysis/evaluate';
import {speedBenchmarks} from '../packages/core/analysis/speed';

describe('Champions 规则与伤害', () => {
  test('机制回归矩阵逐档对照真实引擎', () => {expect(verifyMechanics(engine)).toHaveLength(10);});
  test('复用规则数据时，战斗对象变化不能改写规则或其他环境', () => {
    const other = new BattleEngine(engine.engineDirectory, `${engine.formatId}@@@-Rillaboom`, bootstrap.translations);
    const set = observed('salamence', s => s.itemId === 'salamencite');
    const species = engine.generation.species.get('salamencemega');
    const move = engine.generation.moves.get('hypervoice');
    const original = structuredClone({baseStats: species.baseStats, flags: move.flags});
    const pokemon = engine.pokemon(set, true);
    pokemon.species.baseStats.atk = 1;
    pokemon.stats.spe = 1;
    const attack = new engine.calc.Move(engine.generation, 'Hyper Voice');
    attack.flags.sound = 0;
    expect(engine.generation.species.get('salamencemega').baseStats).toEqual(original.baseStats);
    expect(engine.generation.moves.get('hypervoice').flags).toEqual(original.flags);
    expect(other.generation.species.get('salamencemega').baseStats).toEqual(original.baseStats);
    expect(other.generation.species.get('salamencemega')).not.toBe(species);
    expect(engine.stats(set, true).spe).toBeGreaterThan(1);
  });
  test('能力点、导入导出及伤害与 Showdown 对照', () => {
    expect(verifyEngine(engine, observed('rillaboom')).length).toBe(4);
    const original = observed('sneasler'); const parsed = engine.parse(engine.export([original])).sets[0];
    expect(setKey(parsed)).toBe(setKey(original));
    expect(engine.validateSet({...original, points: {...original.points!, atk: 252}})).not.toHaveLength(0);
    const missing = engine.parse(engine.export([original]).split('\n').filter(line => !line.startsWith('EVs:')).join('\n')).sets[0];
    expect(missing.points).toBeNull(); expect(complete(missing)).toBe(false);
  });
  test('省略等级与显式等级均遵循环境的实战等级调整', () => {
    const excadrill = observed('excadrill');
    const omitted = engine.parse(engine.export([excadrill]).split('\n').filter(line => !line.startsWith('Level:')).join('\n')).sets[0];
    expect(omitted.level).toBe(engine.ruleTable.adjustLevel);
    expect(verifyEngine(engine, omitted)).toHaveLength(4);
    const explicit = engine.parse(engine.export([{...excadrill, level: 100}])).sets[0];
    expect(explicit.level).toBe(100);
    expect(verifyEngine(engine, explicit)).toHaveLength(4);
    expect(engine.validateSet({...excadrill, level: 101}).length).toBeGreaterThan(0);
  });
  test('最高乱数击杀、气腰、多段与回合中树果', () => {
    expect(directKO([[85, 100]], 100, '', '')).toBe(0.5);
    expect(directKO([[100, 110]], 100, '', '')).toBe(1);
    expect(directKO([[100, 110]], 100, 'Focus Sash', '')).toBe(0);
    expect(directKO([[100], [10]], 100, 'Focus Sash', '')).toBe(1);
    expect(directKO([[60], [50]], 100, 'Sitrus Berry', '')).toBe(0);
    expect(directKO([[60], [50]], 100, 'Sitrus Berry', '', 'Unnerve')).toBe(1);
    expect(convolve([[10, 20], [10, 20]]).get(30)).toBe(0.5);
    const attacker = observed('rillaboom'); const defender = observed('tyranitar');
    const damage = engine.damage(attacker, defender);
    for (const d of damage) {if (d.min < d.defenderHP && d.max >= d.defenderHP && d.hits === 1) expect(d.ohko).toBeLessThan(1);}
  });
  test('Mega 前后、威吓免疫、精神场地与范围衰减', () => {
    const salamence = observed('salamence', s => s.itemId === 'salamencite');
    expect(engine.pokemon(salamence, false).ability).toBe('Intimidate');
    expect(engine.pokemon(salamence, true).ability).toBe('Aerilate');
    expect(engine.stats(salamence, true).spe).toBeGreaterThan(engine.stats(salamence, false).spe);
    const sneasler = observed('sneasler', s => s.moves.includes('fakeout'));
    const rillaboom = observed('rillaboom');
    expect(engine.damage(sneasler, rillaboom, {terrain: 'Psychic'}).find(d => d.moveId === 'fakeout')!.max).toBe(0);
    const metagross = observed('metagross', s => s.abilityId === 'clearbody');
    expect(engine.damage(metagross, rillaboom, {attackerMega: false})).toEqual(engine.damage(metagross, rillaboom, {attackerMega: false, intimidateAttacker: true}));
    const hyperVoice = engine.damage(salamence, rillaboom, {singleTarget: false}).find(d => d.moveId === 'hypervoice')!;
    const single = engine.damage(salamence, rillaboom, {singleTarget: true}).find(d => d.moveId === 'hypervoice')!;
    expect(hyperVoice.max).toBeLessThan(single.max);
    const water = observed('basculegion', s => s.moves.includes('wavecrash'));
    expect(engine.damage(water, rillaboom, {weather: 'Rain'}).find(d => d.moveId === 'wavecrash')!.min).toBeGreaterThan(engine.damage(water, rillaboom, {weather: 'Sun'}).find(d => d.moveId === 'wavecrash')!.max);
  });
  test('实际入场的种子轻装、顺风与空间速度顺序', () => {
    const sneasler = observed('sneasler', s => s.itemId === 'grassyseed');
    const grass = observed('rillaboom'); const rest = fullDraft().members.filter(m => !['sneasler', 'rillaboom'].includes(m.set.speciesId)).map(m => m.set);
    const team = [sneasler, grass, ...rest].map(s => engine.toPS(s));
    const battle = new engine.ps.Battle({formatid: engine.formatId, seed: [4, 3, 2, 1], p1: {name: 'A', team}, p2: {name: 'B', team: structuredClone(team)}});
    try {
      battle.makeChoices('team 1234', 'team 1234');
      const a = battle.p1.active[0]; const b = battle.p1.active[1];
      expect(a.item).toBe(''); expect(a.getStat('spe')).toBe(speedInField(engine, sneasler, [grass], false, {terrain: 'Grassy'}));
      battle.p1.addSideCondition('tailwind', b);
      expect(a.getStat('spe')).toBe(speedInField(engine, sneasler, [grass], false, {terrain: 'Grassy', attackerTailwind: true}));
      expect(a.getActionSpeed()).toBeGreaterThan(b.getActionSpeed());
      battle.field.addPseudoWeather('trickroom', b);
      expect(a.getActionSpeed()).toBeLessThan(b.getActionSpeed());
      battle.boost({spe: -1}, a, a); a.setStatus('par');
      expect(a.getStat('spe')).toBe(engine.speeds(sneasler, grass, {attackerMega: false, terrain: 'Grassy', attackerTailwind: true, attackerBoosts: {spe: -1}, attackerStatus: 'par'}).attacker);
      expect(() => validateInput('damage', {attacker: sneasler, defender: grass, environmentId: engine.snapshot().id, field: {attackerBoosts: {atk: -1}}})).not.toThrow();
    } finally {battle.destroy();}
  });
  test('双方速度分别计算，铁球、围巾、同速与空间不混淆', () => {
    const set = {...observed('sneasler'), itemId: ''}; const natural = engine.stats(set).spe;
    expect(engine.speeds({...set, itemId: 'ironball'}, set).attacker).toBe(Math.floor(natural / 2));
    expect(engine.speeds({...set, itemId: 'choicescarf'}, set).attacker).toBe(Math.floor(natural * 1.5));
    const speeds = engine.speeds(set, set, {defenderTailwind: true});
    expect(speeds.attacker).toBe(natural); expect(speeds.defender).toBe(natural * 2);
    const archetype = meta.model.archetypes.find(a => a.currentCount > 0 && a.speciesId === 'sneasler')!;
    const draft = {...createDraft(engine.snapshot().id), members: [member(archetype.representative)]};
    const normal = speedBenchmarks(engine, meta, {draft, memberId: draft.members[0].id, field: {attackerMega: false, defenderMega: false}});
    const reversed = speedBenchmarks(engine, meta, {draft, memberId: draft.members[0].id, field: {attackerMega: false, defenderMega: false, trickRoom: true}});
    expect(normal.rows.find(r => r.configurationId === archetype.id)!.order).toBe('tie');
    expect(normal.rows.filter(r => r.order === 'before').length).toBe(reversed.rows.filter(r => r.order === 'after').length);
  });
});

describe('来源与统计', () => {
  test('表头重排、失败来源、未知配点保留', async () => {
    const raw = engine.export([observed('sneasler')]).split('\n').filter(line => !line.startsWith('EVs:')).join('\n');
    const csv = 'VGCPastes Repository (Champions M-C)\nOwner,Date Shared,Pokepaste,Team ID,Rank,Team Description,Tournament / Event,Link to Source\nAlice,2026-09-01,https://pokepast.es/1111111111111111,MC1,1,Test,Event,\nBob,2026-09-02,https://pokepast.es/2222222222222222,MC2,2,Error,Event,';
    expect(parseSheet(csv, {season: 'M-C', gid: '1'}).rows[0].author).toBe('Alice');
    const evolved = parseSheet('VGCPastes Repository (Champions M-C)\nTEAM_ID,POKEPASTE LINK,AUTHOR\nMC1,https://pokepast.es/1111111111111111,Alice', {season: 'M-C', gid: '1'});
    expect(evolved.rows[0].date).toBe(''); expect(evolved.missingColumns).toContain('date'); expect(evolved.rows[0].author).toBe('Alice');
    expect(() => parseSheet(csv, {season: 'M-D', gid: '1'})).toThrow('赛季不匹配');
    expect(canonicalPasteUrl('http://pokepast.es/1111111111111111')).toBe('https://pokepast.es/1111111111111111/raw');
    const dir = mkdtempSync(join(tmpdir(), 'poke-source-'));
    try {const result = await importCorpus({sources: [{season: 'M-C', gid: '1'}], engine, cache: new PasteCache(dir), fetcher: async url => {if (url.includes('docs.google.com')) return csv; if (url.includes('111111')) return raw; throw new Error('HTTP 503');}});
      expect(result.reports[0].failed).toBe(1); expect(result.reports[0].errors[0].message).toContain('503'); expect(result.observations[0].set.points).toBeNull(); expect(result.observations[0].currentLegal).toBe(false);
    } finally {rmSync(dir, {recursive: true});}
  });
  test('转贴不放大共现，历史不污染当前频率', () => {
    const original = bootstrap.corpus.teams.find(t => t.season === 'M-C' && t.status === 'valid')!;
    const duplicate = {...original, id: 'copy', observationIds: original.observationIds.map((_, i) => `copy:${i}`)};
    const observations = original.observationIds.map((id, i) => ({...meta.observationById.get(id)!, id: `copy:${i}`, teamId: 'copy'}));
    const corpus = {...bootstrap.corpus, teams: [...bootstrap.corpus.teams, duplicate], observations: [...bootstrap.corpus.observations, ...observations]};
    const copy = new MetaModel(corpus, bootstrap.model, 'M-C');
    const species = original.observationIds.map(id => meta.observationById.get(id)!.set.speciesId);
    expect(copy.pairing(species[0], species[1])).toEqual(meta.pairing(species[0], species[1]));
    // Pairing is a source-level statistic; this isolated current-only corpus has no fitted clusters.
    const currentOnly = new MetaModel({...bootstrap.corpus, observations: bootstrap.corpus.observations.filter(o => o.season === 'M-C'), teams: bootstrap.corpus.teams.filter(t => t.season === 'M-C')}, {...bootstrap.model, archetypes: []}, 'M-C');
    expect(currentOnly.pairing(species[0], species[1])).toEqual(meta.pairing(species[0], species[1]));
    expect(meta.posterior('sneasler', ['rillaboom']).reduce((sum, p) => sum + p.probability, 0)).toBeCloseTo(1, 10);
  });
  test('真实代表、加权流派与缺字段的距离', () => {
    const rows = bootstrap.model.archetypes.filter(a => a.speciesId === 'sneasler');
    for (const row of rows) expect(row.observationIds.some(id => setKey(meta.observationById.get(id)!.set) === setKey(row.representative))).toBe(true);
    const sets = [observed('sneasler', s => s.itemId === 'grassyseed'), observed('sneasler', s => s.itemId === 'focussash')];
    const groups = clusterFeatures(sets.map(set => ({set, stats: engine.stats(set), thresholds: [], weight: 1})));
    expect(groups.groups).toHaveLength(2); expect(groups.matrix[0][1]).toBeGreaterThan(0);
    const repeated = sets.flatMap(set => [1, 2, 3, 4].map(weight => ({set, stats: null, thresholds: [], weight})));
    const stable = clusterFeatures(repeated);
    expect(stable.groups).toHaveLength(2); expect(stable.stability).toEqual([1, 1]);
    expect(stable.groups.map(group => group.map(i => repeated[i].set.itemId))).toEqual(expect.arrayContaining([
      Array(4).fill('grassyseed'), Array(4).fill('focussash'),
    ]));
  });
  test('先验扫描保留固定语料的时间留出校准结果', () => {
    expect(tunePrior(bootstrap.corpus, bootstrap.environment.season)).toEqual({strength: bootstrap.model.priorStrength,
      samples: bootstrap.model.tuning.validationSamples, loss: bootstrap.model.tuning.negativeLogLikelihood});
  });
});

describe('构筑、配点与本地版本', () => {
  const evaluator = new Evaluator(engine, meta);
  test('推荐合法、核心与字段锁保持、旧结果拒绝应用', () => {
    const draft = {...createDraft(engine.snapshot().id), members: [member(observed('sneasler', s => s.itemId === 'grassyseed'))]};
    draft.members[0].lock = {species: true, fields: ['moves', 'points']};
    const result = new TeamSearch(evaluator).recommend({draft, kind: 'add'});
    expect(result.length).toBeGreaterThan(0);
    for (const p of result) {expect(engine.validateDraft({...draft, members: p.members}).filter(v => v.severity === 'error')).toEqual([]); expect(p.members[0]).toEqual(draft.members[0]);}
    expect(() => applyProposal({...draft, revision: 2, analysisRevision: 2}, result[0], meta.corpus.version, meta.model.version)).toThrow('已改变');
    expect(() => applyProposal({...draft, id: 'another'}, result[0], meta.corpus.version, meta.model.version)).toThrow('已改变');
    const modified = structuredClone(result[0]); modified.members[0].set.itemId = 'focussash'; modified.members[0].set.moves = ['protect', 'taunt', 'fakeout', 'closecombat'];
    expect(() => applyProposal(draft, modified, meta.corpus.version, meta.model.version)).toThrow('锁定');
  });
  test('分析随配置改变；固定性格配点达到最小速度阈值', () => {
    const draft = {...createDraft(engine.snapshot().id), members: [member(observed('sneasler', s => s.itemId === 'grassyseed'))]};
    const first = evaluator.analyze(draft);
    const altered = {...draft, members: [{...draft.members[0], set: {...draft.members[0].set, points: {...draft.members[0].set.points!, atk: 0}}}]};
    const second = evaluator.analyze(altered);
    expect(second.inputHash).not.toBe(first.inputHash); expect(second.metrics.pressure).not.toBe(first.metrics.pressure);
    const result = optimizeSpread(evaluator, {draft, memberId: draft.members[0].id, speedTarget: 170});
    expect(result.status).toBe('success');
    const set = result.proposal!.members[0].set;
    expect(engine.stats(set, true).spe).toBeGreaterThan(170);
    expect(engine.stats({...set, points: {...set.points!, spe: set.points!.spe - 1}}, true).spe).toBeLessThanOrEqual(170);
    expect(engine.validateSet(set)).toEqual([]); expect(result.exact).toBe(true);
  });
  test('速度、击杀、生存联合目标均在最终配点上成立', () => {
    const draft = fullDraft(); const own = draft.members.find(m => m.set.speciesId === 'rillaboom')!;
    const target = observed('basculegion', s => s.itemId === 'lifeorb');
    const attacker = observed('salamence', s => s.itemId === 'salamencite' && s.natureId === 'timid');
    const result = optimizeSpread(evaluator, {draft, memberId: own.id, speedTarget: 115, attackTarget: target, attackMove: 'woodhammer', defendTarget: attacker, defendMove: 'hypervoice'});
    expect(result.status).toBe('success');
    const updated = result.proposal!.members.find(m => m.id === own.id)!.set;
    expect(engine.stats(updated).spe).toBeGreaterThan(115);
    expect(engine.damage(updated, target).find(r => r.moveId === 'woodhammer')!.ohko).toBe(1);
    expect(engine.damage(attacker, updated).find(r => r.moveId === 'hypervoice')!.maxPercent).toBeLessThan(100);
    expect(updated.points!.spd + updated.points!.hp).toBeGreaterThan(0);
    expect(engine.validateDraft({...draft, members: result.proposal!.members})).toEqual([]);
  });
  test('SQLite 草稿修订、重启恢复及旧版本内容保留', () => {
    const dir = mkdtempSync(join(tmpdir(), 'poke-store-')); let store = new Store(dir, resolve('assets'));
    try {const draft = fullDraft(); store.saveDraft(draft); store.saveDraft({...draft, revision: 1, name: '新版'}); expect(() => store.saveDraft({...draft, name: '旧版覆盖'})).toThrow('更新'); store.close(); store = new Store(dir, resolve('assets')); expect(store.drafts()[0].name).toBe('新版'); expect(store.history(draft.id).map(d => d.revision)).toEqual([1, 0]); expect(store.history(draft.id)[1].name).toBe(draft.name);} finally {store.close(); rmSync(dir, {recursive: true});}
  });
});
