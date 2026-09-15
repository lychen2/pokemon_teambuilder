import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {BootstrapData, PokemonSet} from '../packages/core/types';
import {BattleEngine} from '../packages/core/battle/engine';
import {MetaModel} from '../packages/core/analysis/model';
import {Evaluator} from '../packages/core/analysis/evaluate';
import {analyzeSelections} from '../packages/core/analysis/selections';
import {ALGORITHM_VERSION, createDraft, member, toID} from '../packages/core/domain';

const b: BootstrapData = JSON.parse(await readFile('assets/bootstrap.json', 'utf8'));
const sources: {id: string; url: string; pasteUrl: string; season: string; raw: string; setText: string; claims: {quote: string; interpretation: string}[]; actualSelections: null; battleOutcomes: null}[] = JSON.parse(await readFile('docs/research/source-intent-cases.json', 'utf8'));
const engine = new BattleEngine(resolve('assets/engines', b.engine.id), b.environment.formatId, b.translations);
const meta = new MetaModel(b.corpus, b.model, b.environment.season);
const evaluator = new Evaluator(engine, meta);
const rows = [];
for (const source of sources) {
  if (source.claims.some(claim => !source.raw.includes(claim.quote))) throw new Error(`${source.id} 的引文不在原文内。`);
  const parsed = engine.parse(source.setText, 'historical');
  let hypotheses: PokemonSet[][] = [[]];
  for (const set of parsed.sets) {
    const variants = set.abilityId === null ? (Object.values(engine.dex.species.get(set.speciesId).abilities) as string[]).map(ability => ({...set, abilityId: toID(ability), sourceKind: 'generated' as const})) : [set];
    const legal = variants.filter(variant => !engine.validateSet(variant).length);
    if (!legal.length) throw new Error(`${source.id} 的 ${set.speciesId} 无合法配置，未用默认数值补齐。`);
    hypotheses = hypotheses.flatMap(team => legal.map(set => [...team, set]));
  }
  const comparisons = hypotheses.map(sets => {
    const draft = {...createDraft(b.environment.id, source.id), members: sets.map(set => ({...member(set), id: set.speciesId}))};
    const problems = engine.validateDraft(draft); if (problems.length) throw new Error(problems.map(problem => problem.message).join('；'));
    const result = analyzeSelections(evaluator, draft);
    const targetMembers = ['mawile', 'sinistcha', 'incineroar', 'basculegion'];
    const route = result.routes.find(route => route.megaId === 'mawile' && targetMembers.every(id => route.members.includes(id)))!;
    const lead = route.leadOptions.find(lead => ['mawile', 'sinistcha'].every(id => lead.members.includes(id)))!;
    const withoutBeneficiary = analyzeSelections(evaluator, {...draft, members: draft.members.filter(member => member.id !== 'mawile')});
    const withoutSupport = analyzeSelections(evaluator, {...draft, members: draft.members.filter(member => member.id !== 'sinistcha')});
    return {
      legalInTargetEnvironment: true,
      generatedFields: sets.filter(set => set.sourceKind === 'generated').map(set => ({speciesId: set.speciesId, field: 'abilityId', value: set.abilityId})),
      routeForAuthoredMechanisms: {members: targetMembers, expectedMegaId: 'mawile', comparedRoutes: result.routes.length, quickRank: result.routes.indexOf(route) + 1, leadRank: route.leadOptions.indexOf(lead) + 1, lead, route},
      leadingQuickRoute: result.routes[0],
      recoveryDependency: result.routes.flatMap(route => route.dependencies).find(d => d.supportId === 'sinistcha' && d.beneficiaryId === 'dragonite' && d.reason.includes('多重鳞片')),
      removalChecks: {
        withoutMawileHasNoMawileDependency: withoutBeneficiary.routes.every(route => route.dependencies.every(d => d.beneficiaryId !== 'mawile')),
        withoutMawileHasNoSetupRoute: withoutBeneficiary.routes.every(route => route.winConditions.every(text => !text.includes('强化窗口'))),
        withoutSinistchaHasNoHospitalityRoute: withoutSupport.routes.every(route => route.dependencies.every(d => !d.reason.includes('款待'))),
      },
    };
  });
  rows.push({sourceId: source.id, url: source.url, pasteUrl: source.pasteUrl, originalSeason: source.season, targetSeason: b.environment.season, parseIssues: parsed.issues, claims: source.claims, comparisons, actualSelections: source.actualSelections, battleOutcomes: source.battleOutcomes});
}
await writeFile('docs/reports/source-intent-benchmark.json', JSON.stringify({createdAt: new Date().toISOString(), algorithmVersion: ALGORITHM_VERSION, environmentId: b.environment.id, modelVersion: b.model.version, rows,
  notes: ['历史作者意图开发用例；未加入当前共享构筑频率或独立盲测。', '原始大嘴娃仅提供 Mega 后特性，初始特性保持未知；按当前规则枚举合法特性作为显式生成假设，不将任何一种说成作者原配置。', '四人组合从作者描述的配合关系构造，是可核对的研究假设；作者没有提供实际选出、逐局首发或胜负。', '快速排序与作者意图是否一致分别列出；存在路线不表示算法已经找到最优选出。', '款待回复及依赖移除另有真实 Showdown 回合回归；没有把文字标签当成模拟战果。']}, null, 2));
console.log(JSON.stringify(rows.map(row => ({source: row.sourceId, parseIssues: row.parseIssues, hypotheses: row.comparisons.length, routeRanks: row.comparisons.map(c => c.routeForAuthoredMechanisms.quickRank), removalChecks: row.comparisons.map(c => c.removalChecks)})), null, 2));
