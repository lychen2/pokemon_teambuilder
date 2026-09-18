import {describe, test, expect} from 'vitest';
import {mkdtempSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {advanceDraft} from '../packages/core/revisions';
import {applyProposal, draftHash} from '../packages/core/domain';
import {Store} from '../packages/core/storage';
import {ResearchStore} from '../packages/core/research/storage';
import {validateInput} from '../packages/core/schema';
import {validateResearch, matchSummary, filterMatches} from '../packages/core/research/workflow';
import type {MatchRecord, MatchupPlan} from '../packages/core/research/types';
import {Evaluator} from '../packages/core/analysis/evaluate';
import {proposalFor} from '../packages/core/analysis/search';
import {optimizeSpread} from '../packages/core/analysis/spread';
import {hitCounts} from '../packages/core/battle/hit-counts';
import {verifyDamageCase} from '../packages/core/battle/verify';
import {bootstrap, engine, meta, fullDraft, observed} from './fixtures';

describe('构筑研究记录与统一条件', () => {
  test('笔记不使推荐过期，成员变化仍失效，异步建议保留最新笔记', () => {
    const before = fullDraft(); const evaluator = new Evaluator(engine, meta);
    const changed = before.members.map((member, index) => index ? member : {...member, set: {...member.set, points: {...member.set.points!, spe: member.set.points!.spe - 1}}});
    const proposal = proposalFor(evaluator, before, changed, 'spread', '可复查测试', performance.now());
    const renamed = advanceDraft(before, {...before, name: '测试名称', notes: '刚写的复盘'});
    expect(renamed.revision).toBe(1); expect(renamed.analysisRevision).toBe(0); expect(draftHash(renamed)).toBe(draftHash(before));
    const applied = applyProposal(renamed, proposal, meta.corpus.version, meta.model.version);
    expect(applied.notes).toBe('刚写的复盘'); expect(applied.analysisRevision).toBe(1);
    expect(() => applyProposal(advanceDraft(renamed, {...renamed, members: changed}), proposal, meta.corpus.version, meta.model.version)).toThrow('已改变');
  });
  test('两条计划与战绩重启保留，历史快照不可改写，未知选出不进入分母', () => {
    const directory = mkdtempSync(join(tmpdir(), 'poke-research-')); const snapshot = fullDraft();
    let store = new Store(directory, resolve('assets')); let records = new ResearchStore(store.db);
    try {
      const base = {id: 'plan', revision: 0, draftId: snapshot.id, environmentId: snapshot.environmentId, snapshot, updatedAt: new Date().toISOString(), opponentSpecies: snapshot.members.map(m => m.set.speciesId)};
      const plan: MatchupPlan = {...base, kind: 'plan', title: '两种路线', routes: [0, 1].map(i => ({id: String(i), name: `路线${i}`, selection: snapshot.members.slice(i, i + 4).map(m => m.id), leads: snapshot.members.slice(i, i + 2).map(m => m.id), winCondition: '待验证', concerns: '场地争夺', status: 'idea'}))};
      validateResearch(plan, bootstrap.environment); records.save(plan);
      const match: MatchRecord = {...base, id: 'match', kind: 'match', playedAt: '2026-09-14', selection: plan.routes[0].selection, leads: plan.routes[0].leads, result: 'loss', category: 'practice', reasons: ['选出失误'], notes: '', replayUrl: ''};
      records.save(match);
      expect(() => records.save({...match, revision: 1, snapshot: {...snapshot, name: '篡改'}})).toThrow('不可改写');
      expect(() => validateResearch({...match, selection: ['invalid']}, bootstrap.environment)).toThrow('队伍版本');
      const stats = matchSummary([match, {...match, id: 'unknown', result: 'unknown', selection: [], leads: []}]);
      expect(stats.total).toBe(2); expect(stats.labelled).toBe(1); expect(stats.selectionKnown).toBe(1); expect(stats.members.every(m => m.available === 1)).toBe(true);
      store.close(); store = new Store(directory, resolve('assets')); records = new ResearchStore(store.db);
      expect(records.state(snapshot.id, snapshot.environmentId).entries).toContainEqual(plan);
      expect(records.state(snapshot.id, snapshot.environmentId).summary.losses).toBe(1);
    } finally {store.close(); rmSync(directory, {recursive: true});}
  });
  test('路线证据经过输入解析与重启保留，计划修改或删除不改写实战', () => {
    const directory = mkdtempSync(join(tmpdir(), 'poke-route-evidence-')); const snapshot = fullDraft();
    let store = new Store(directory, resolve('assets')); let records = new ResearchStore(store.db);
    try {
      const plan: MatchupPlan = {id: 'plan', revision: 0, updatedAt: '', environmentId: snapshot.environmentId, draftId: snapshot.id, snapshot, kind: 'plan', title: '空间对策', opponentSpecies: [], routes: [0, 1].map(i => ({id: `route-${i}`, name: `路线${i}`, selection: snapshot.members.slice(i, i + 4).map(m => m.id), leads: snapshot.members.slice(i, i + 2).map(m => m.id), winCondition: '消耗空间回合', concerns: '后排血量', status: 'idea'}))};
      records.save(plan);
      const match: MatchRecord = {id: 'match', revision: 0, updatedAt: '', environmentId: snapshot.environmentId, draftId: snapshot.id, snapshot, kind: 'match', playedAt: '2026-09-18', opponentSpecies: [], selection: [], leads: [], result: 'unknown', category: 'practice', reasons: [], notes: '', replayUrl: '', planId: plan.id, planContext: {title: plan.title, revision: plan.revision, route: structuredClone(plan.routes[1])}};
      const parsed = validateInput('saveResearch', match) as MatchRecord;
      expect(parsed).toEqual(match); validateResearch(parsed, bootstrap.environment); records.save(parsed);
      expect(() => validateResearch({...match, planId: undefined}, bootstrap.environment)).toThrow('必须关联');
      expect(() => validateResearch({...match, planContext: {...match.planContext!, route: {...plan.routes[1], selection: ['foreign-member']}}}, bootstrap.environment)).toThrow('队伍版本');
      expect(() => records.save({...match, revision: 1, planContext: {...match.planContext!, route: plan.routes[0]}})).toThrow('不可改写');
      expect(() => records.save({...match, revision: 1, planContext: undefined})).toThrow('不可改写');
      expect(() => records.save({...match, revision: 1, planId: 'another-plan'})).toThrow('不可改写');
      records.save({...plan, revision: 1, title: '新计划', routes: []}); records.remove(plan.id, 1);
      records.save({...parsed, revision: 1, notes: '补充真实选出', selection: plan.routes[1].selection, leads: plan.routes[1].leads});
      const legacy = {...match, id: 'legacy', planContext: undefined};
      records.save(validateInput('saveResearch', legacy) as MatchRecord);
      store.close(); store = new Store(directory, resolve('assets')); records = new ResearchStore(store.db);
      const state = records.state(snapshot.id, snapshot.environmentId);
      expect(state.entries.find(entry => entry.id === match.id)).toMatchObject({planContext: match.planContext, notes: '补充真实选出', selection: plan.routes[1].selection});
      expect(state.entries.find(entry => entry.id === 'legacy')).not.toHaveProperty('planContext');
      expect(state.summary.selectionKnown).toBe(1); expect(state.summary.members.every(row => row.available === 1)).toBe(true);
    } finally {store.close(); rmSync(directory, {recursive: true});}
  });
  test('复盘筛选组合配置、类别与对手，元数据不改变配置，未知选出仍排除', () => {
    const snapshot = fullDraft();
    const match: MatchRecord = {id: 'known', kind: 'match', revision: 0, updatedAt: '', draftId: snapshot.id, environmentId: snapshot.environmentId, snapshot, playedAt: '', opponentSpecies: ['rillaboom'], selection: snapshot.members.slice(0, 4).map(m => m.id), leads: [], result: 'win', category: 'ranked', reasons: ['空间对策'], notes: '', replayUrl: ''};
    const changed = structuredClone(snapshot); changed.members[0].set.moves = ['protect'];
    // Revisions can coincide after branching; compare actual content.
    const records: MatchRecord[] = [match, {...match, id: 'old', snapshot: changed, result: 'loss'}, {...match, id: 'practice', category: 'practice'}, {...match, id: 'unknown', selection: [], opponentSpecies: [], result: 'unknown'}];
    const renamed = advanceDraft(snapshot, {...snapshot, name: '重命名', notes: '新笔记'});
    expect(filterMatches(records, {currentDraft: renamed}).map(row => row.id)).toEqual(['known', 'practice', 'unknown']);
    expect(filterMatches(records, {currentDraft: renamed, category: 'ranked', opponentSpecies: 'rillaboom'}).map(row => row.id)).toEqual(['known']);
    const summary = matchSummary(filterMatches(records, {currentDraft: renamed, category: 'ranked'}));
    expect(summary).toMatchObject({total: 2, wins: 1, losses: 0, labelled: 1, selectionKnown: 1});
    expect(summary.members.every(row => row.available === 1)).toBe(true);
    expect(filterMatches(records, {opponentSpecies: 'missing'})).toEqual([]);
    expect(filterMatches(records, {})).toEqual(records);
  });
  test('速度目标直接保留轻装与顺风条件，不能误用自然速度阈值', () => {
    const draft = fullDraft(); const own = draft.members.find(m => m.set.speciesId === 'sneasler')!;
    const opponent = observed('salamence'); const field = {attackerMega: false, defenderMega: true, terrain: 'Grassy', attackerTailwind: true};
    const result = optimizeSpread(new Evaluator(engine, meta), {draft, memberId: own.id, speedBenchmark: {opponent, field, order: 'before'}});
    expect(result.status).toBe('success');
    const updated = result.proposal!.members.find(m => m.id === own.id)!.set;
    expect(updated.points!.spe).toBe(0); const speed = engine.speeds(updated, opponent, field); expect(speed.attacker).toBeGreaterThan(speed.defender);
  });
  test('低血量伤害逐档一致，残血气腰不挡击杀；连击按机制分布', () => {
    const own = observed('typhlosionhisui', set => set.moves.includes('eruption'));
    const opponent = observed('rillaboom');
    verifyDamageCase(engine, own, opponent, 'eruption', {attackerHPPercent: 50, defenderHPPercent: 75});
    const grass = observed('rillaboom', s => s.moves.includes('woodhammer'));
    const target = {...observed('basculegion'), itemId: 'focussash'};
    expect(engine.damage(grass, target).find(r => r.moveId === 'woodhammer')!.ohko).toBe(0);
    expect(engine.damage(grass, target, {defenderHPPercent: 50}).find(r => r.moveId === 'woodhammer')!.ohko).toBe(1);
    expect(hitCounts([2, 5], '', '')).toEqual([{hits: 2, probability: .35}, {hits: 3, probability: .35}, {hits: 4, probability: .15}, {hits: 5, probability: .15}]);
    expect(hitCounts([2, 5], 'Skill Link', '')).toEqual([{hits: 5, probability: 1}]);
    expect(hitCounts([2, 5], '', 'Loaded Dice').reduce((s, c) => s + c.probability, 0)).toBe(1);
  });
});
