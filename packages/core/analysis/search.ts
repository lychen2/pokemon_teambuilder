import type {Configuration, Proposal, RecommendationRequest, TeamDraft, TeamMember, TeamAnalysis, PokemonSet, ThreatResult} from '../types';
import {ALGORITHM_VERSION, complete, draftHash, hash, member, respectsLock, setKey, teamKey} from '../domain';
import {Evaluator, QUICK_SEARCH, type Evaluation} from './evaluate';
import {roles, roleGroups, teamMechanics} from './roles';
import {evaluateRoster} from './lineups';

export function dominates(a: TeamAnalysis['metrics'], b: TeamAnalysis['metrics']): boolean {
  const left = [a.pressure, a.resilience, a.speed, a.coverage, -a.tailRisk];
  const right = [b.pressure, b.resilience, b.speed, b.coverage, -b.tailRisk];
  return left.every((v, i) => v >= right[i] - 1e-8) && left.some((v, i) => v > right[i] + 1e-8);
}

export class SearchBudgetError extends Error {
  constructor(readonly statistics: NonNullable<Proposal['search']>) {super('指定时间预算内尚未找到完成的合法方案；未将中间草稿作为推荐结果。');}
}

function describeMatchupChange(before: ThreatResult, after: ThreatResult): string {
  return [
    Math.abs(before.bestDamage - after.bestDamage) >= 0.5 ? `最佳最低乱数 ${before.bestDamage.toFixed(0)}% → ${after.bestDamage.toFixed(0)}%` : '',
    before.outspeedCount !== after.outspeedCount ? `先手成员 ${before.outspeedCount} → ${after.outspeedCount}` : '',
    Math.abs(before.incomingDamage - after.incomingDamage) >= 0.5 ? `平均承伤（单成员最多计100%） ${before.incomingDamage.toFixed(0)}% → ${after.incomingDamage.toFixed(0)}%` : '',
    Math.abs(before.bestKO - after.bestKO) >= 0.001 ? `命中时击杀概率 ${(100 * before.bestKO).toFixed(1)}% → ${(100 * after.bestKO).toFixed(1)}%` : '',
  ].filter(Boolean).join('；');
}

export function proposalFor(evaluator: Evaluator, draft: TeamDraft, members: TeamMember[], kind: Proposal['kind'], title: string, start: number): Proposal {
  const beforeRoster = evaluateRoster(evaluator, draft.members); const afterRoster = evaluateRoster(evaluator, members);
  const before = beforeRoster.reference; const after = afterRoster.reference;
  const difference = after.threats.map(t => ({after: t, before: before.threats.find(p => p.configurationId === t.configurationId)!}));
  const changes = members.filter(m => !draft.members.some(old => setKey(old.set) === setKey(m.set)));
  const benefits = difference.filter(d => d.before.difficulty - d.after.difficulty > 0.035).sort((a, b) => b.before.difficulty - b.after.difficulty - (a.before.difficulty - a.after.difficulty)).slice(0, 3).map(d => `对${evaluator.engine.display(d.after.speciesId)}：${describeMatchupChange(d.before, d.after)}`);
  const tradeoffs = difference.filter(d => d.after.difficulty - d.before.difficulty > 0.025).sort((a, b) => b.after.difficulty - b.before.difficulty - (a.after.difficulty - a.before.difficulty)).slice(0, 2).map(d => `对${evaluator.engine.display(d.after.speciesId)}的处理变难：${describeMatchupChange(d.before, d.after)}`);
  const mechanics = teamMechanics(after.effectiveMembers.map(m => m.set));
  benefits.push(...mechanics.benefits); tradeoffs.push(...mechanics.conflicts);
  const explainRoute = (route: typeof after) => `${route.members.map(m => evaluator.engine.display(m.set.speciesId)).join('、') || '尚无成员'}；${route.megaId ? `${evaluator.engine.display(route.members.find(m => m.id === route.megaId)!.set.speciesId)}使用 Mega` : '保留 Mega'}${route.field.weather || route.field.terrain ? `；假设 ${route.field.weather || ''} ${route.field.terrain || ''} 成立` : ''}`;
  tradeoffs.push(`以上单只对照的参考选出：调整前 ${explainRoute(before)}；调整后 ${explainRoute(after)}。后排未选成员不贡献场地、伤害或支援。`);
  const comparisons = afterRoster.matchups.map(row => ({after: row, before: beforeRoster.matchups.find(previous => previous.scenario.id === row.scenario.id)!}));
  const changedMatchups = comparisons.filter(row => Math.abs(row.after.score - row.before.score) > 0.025).sort((a, b) => Math.abs(b.after.score - b.before.score) - Math.abs(a.after.score - a.before.score)).slice(0, 5);
  const evidence = (row: typeof comparisons[number]['after']) => ({members: row.route.members.map(m => m.id), megaId: row.route.megaId, field: row.route.field, metrics: row.metrics});
  const lineupComparisons = changedMatchups.map(row => ({opponentSpecies: row.after.scenario.species, sourceIds: row.after.scenario.sourceIds, seasons: row.after.scenario.seasons, missingSpecies: row.after.scenario.missingSpecies, coveredProbability: row.after.scenario.coveredProbability, before: evidence(row.before), after: evidence(row.after)}));
  const sourceUrls = changes.flatMap(m => m.set.sourceIds.map(id => evaluator.meta.observationById.get(id)?.url).filter((v): v is string => Boolean(v)));
  const historical = changes.filter(m => m.set.sourceIds.length && m.set.sourceIds.every(id => evaluator.meta.observationById.get(id)?.season !== evaluator.meta.season));
  if (historical.length) {
    const seasons = [...new Set(historical.flatMap(m => m.set.sourceIds.map(id => evaluator.meta.observationById.get(id)?.season).filter((season): season is string => Boolean(season))))];
    tradeoffs.unshift(`${historical.map(m => evaluator.engine.display(m.set.speciesId)).join('、')}参考 ${seasons.join('、')} 的历史配置，已按当前规则校验；尚无相同配置的本赛季完整观察。`);
  }
  if (evaluator.referenceSeasons.length && !evaluator.referenceSeasons.includes(evaluator.meta.season)) tradeoffs.push(`对照样本来自 ${evaluator.referenceSeasons.join('、')}，不能解释为新赛季使用率或胜率。`);
  if (!benefits.length) benefits.push('在当前约束下可组成合法方案；快速对照没有发现明显的伤害或速度提升。');
  if (!tradeoffs.length) tradeoffs.push('这组快速对照未发现明显退步；选出与回合交互需要深入模拟确认。');
  return {id: hash([draftHash(draft), teamKey(members.map(m => m.set)), kind]), draftId: draft.id, inputHash: draftHash(draft), modelVersion: evaluator.meta.model.version, kind, title, baseRevision: draft.analysisRevision, environmentId: draft.environmentId, corpusVersion: evaluator.meta.corpus.version, algorithmVersion: ALGORITHM_VERSION,
    members, benefits: [...new Set(benefits)], tradeoffs: [...new Set(tradeoffs)], metrics: afterRoster.metrics, lineupComparisons, sourceUrls: [...new Set(sourceUrls)], generated: changes.some(m => m.set.sourceKind === 'generated'), elapsedMs: performance.now() - start};
}

export class TeamSearch {
  private legal = new Map<string, boolean>();
  constructor(readonly evaluator: Evaluator) {}
  private isLegal(members: TeamMember[]): boolean {
    const key = teamKey(members.map(m => m.set));
    const cached = this.legal.get(key); if (cached !== undefined) return cached;
    const engine = this.evaluator.engine;
    const ids = members.map(m => engine.dex.species.get(m.set.speciesId).baseSpecies);
    const items = members.map(m => m.set.itemId).filter(Boolean);
    const valid = (!engine.ruleTable.has('speciesclause') || new Set(ids).size === ids.length) && (!engine.ruleTable.has('itemclause') || new Set(items).size === items.length)
      && members.every(m => this.evaluator.legalSet(m.set))
      && (members.length < engine.ruleTable.maxTeamSize || !engine.validator.validateTeam(members.map(m => engine.toPS(m.set))));
    this.legal.set(key, valid); return valid;
  }

  candidates(draft: TeamDraft, options: RecommendationRequest['options'] = {}): Configuration[] {
    const {meta} = this.evaluator;
    const species = draft.members.map(m => m.set.speciesId);
    const existingRoles = new Set(draft.members.flatMap(m => roleGroups(m.set)));
    const posterior = new Map([...meta.configurationsBySpecies.keys()].flatMap(id => meta.configurationPosterior(id, species).map(row => [row.configurationId, row.probability] as const)));
    const lifts = new Map([...meta.configurationsBySpecies.keys()].map(id => [id, species.reduce((sum, s) => sum + meta.pairing(s, id).lift, 0) / Math.max(1, species.length)]));
    const existingMechanics = teamMechanics(draft.members.map(m => m.set));
    const rated = meta.configurations.filter(a => options.allowHistorical !== false || a.currentCount > 0).map(a => {
      const mechanics = teamMechanics([...draft.members.map(m => m.set), a.set]);
      const synergy = mechanics.benefitResources.filter(id => !existingMechanics.benefitResources.includes(id)).length * 1.5 - mechanics.conflictResources.filter(id => !existingMechanics.conflictResources.includes(id)).length;
      const groups = roleGroups(a.set);
      const roleGain = groups.filter(group => !existingRoles.has(group)).length * 0.15;
      return {a, groups, score: Math.log1p(a.currentCount) + 0.5 * Math.log1p(a.historyCount) * posterior.get(a.id)! + synergy + lifts.get(a.speciesId)! + roleGain};
    }).sort((a, b) => b.score - a.score || a.a.id.localeCompare(b.a.id));
    const budget = options.candidateBudget ?? QUICK_SEARCH.candidates;
    const retained = options.retainedConfigurationIds ?? [];
    const missing = retained.filter(id => !meta.configurationById.has(id));
    if (missing.length) throw new Error('保留的配置已不属于当前模型，请重新选择候选变体。');
    if (options.allowHistorical === false && retained.some(id => !meta.configurationById.get(id)!.currentCount)) throw new Error('保留的变体中包含仅见于历史赛季的配置；请移除该保留项或启用历史配置推荐。');
    const selected = new Map(retained.map(id => [id, meta.configurationById.get(id)!]));
    // Reserve team functions, not one slot for every tag or conditional ability.
    const missingRoles = new Set(rated.flatMap(row => row.groups).filter(role => !existingRoles.has(role)));
    for (const role of missingRoles) {
      if (selected.size >= budget) break;
      const match = rated.find(row => row.groups.includes(role));
      if (match) selected.set(match.a.id, match.a);
    }
    const signature = (a: Configuration) => `${a.speciesId}:${[...a.set.moves].sort().join(',')}:${a.set.itemId}:${a.set.abilityId}`;
    const signatures = new Set([...selected.values()].map(signature));
    const speciesKeys = new Map([...meta.configurationsBySpecies.keys()].map(id => [id, this.evaluator.engine.dex.species.get(id).baseSpecies as string]));
    const queues = new Map<string, typeof rated>();
    for (const row of rated) {const key = speciesKeys.get(row.a.speciesId)!; const queue = queues.get(key) ?? []; queue.push(row); queues.set(key, queue);}
    const positions = new Map<string, number>(); const counts = new Map<string, number>();
    for (const set of [...draft.members.map(member => member.set), ...[...selected.values()].map(configuration => configuration.set)]) {
      const key = this.evaluator.engine.dex.species.get(set.speciesId).baseSpecies as string;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // Greedy proportional allocation: repeated variants of one species have diminishing
    // retrieval value. There is no fixed per-species cap, and retained variants stay intact.
    while (selected.size < budget) {
      let best: {species: string; row: typeof rated[number]; priority: number} | undefined;
      for (const [species, queue] of queues) {
        let position = positions.get(species) ?? 0;
        while (position < queue.length && (selected.has(queue[position].a.id) || signatures.has(signature(queue[position].a)))) position++;
        positions.set(species, position);
        if (position === queue.length) continue;
        const row = queue[position];
        const relevance = Math.max(row.score, 0) + Math.log1p(Math.exp(-Math.abs(row.score)));
        const priority = relevance / (1 + (counts.get(species) ?? 0));
        if (!best || priority > best.priority) best = {species, row, priority};
      }
      if (!best) break;
      selected.set(best.row.a.id, best.row.a); signatures.add(signature(best.row.a));
      counts.set(best.species, (counts.get(best.species) ?? 0) + 1);
    }
    for (const {a} of rated) {if (selected.size >= budget) break; selected.set(a.id, a);}
    return [...selected.values()];
  }

  private variants(original: TeamMember, pool: Configuration[], allowHistorical = true): TeamMember[] {
    const matching = (original.lock.species ? this.evaluator.meta.configurationsBySpecies.get(original.set.speciesId) ?? [] : pool).filter(configuration => allowHistorical || configuration.currentCount > 0);
    const variants = matching.map(a => {
      const set: PokemonSet = structuredClone(a.set);
      for (const field of original.lock.fields) Object.assign(set, {[field]: structuredClone(original.set[field])});
      if (setKey(set) !== setKey(a.set)) set.sourceKind = 'generated';
      return {...original, set};
    });
    return [original, ...variants].filter((v, i, all) => respectsLock(original, v) && all.findIndex(m => setKey(m.set) === setKey(v.set)) === i);
  }

  recommend(request: RecommendationRequest): Proposal[] {
    const start = performance.now(); const {draft, kind} = request;
    const budgetMs = request.options?.timeBudgetMs ?? null;
    if (budgetMs !== null && !(Number.isFinite(budgetMs) && budgetMs > 0)) throw new Error('搜索时间预算必须是正数。');
    const statistics: NonNullable<Proposal['search']> = {budgetMs, deadlineReached: false, evaluatedStates: 0, reusedStates: 0, completedLayers: 0};
    const expired = () => {if (budgetMs !== null && performance.now() - start >= budgetMs) statistics.deadlineReached = true; return statistics.deadlineReached;};
    const issues = this.evaluator.engine.validateDraft(draft).filter(i => i.severity === 'error' || (i.memberId && i.severity === 'incomplete'));
    if (issues.length) throw new Error(`先修正当前配置：${issues.map(i => i.message).join('；')}`);
    if (!this.evaluator.threats.length) throw new Error('当前与历史赛季均无通过本规则校验的完整配置，无法生成推荐。请接入构筑来源。');
    if (kind === 'add' && draft.members.length >= this.evaluator.engine.ruleTable.maxTeamSize) throw new Error('队伍已满，请使用替换建议。');
    if (kind === 'replace' && !draft.members.length) throw new Error('请先加入一位成员。');
    const pool = this.candidates(draft, request.options);
    if (!pool.length) throw new Error(request.options?.allowHistorical === false ? '当前赛季没有符合条件的完整配置；可启用历史配置推荐或接入新赛季来源。' : '没有符合条件的合法候选配置。');
    const beamWidth = request.options?.beamWidth ?? QUICK_SEARCH.beam;
    type State = {members: TeamMember[]; metrics: TeamAnalysis['metrics']; score: number};
    const evaluated = new Map<string, Pick<State, 'metrics' | 'score'>>();
    // This cache belongs to one request and is released after search completes.
    const lineups = new Map<string, Evaluation>();
    const state = (members: TeamMember[]): State => {
      // Preserve member order and the deterministic order used to resolve tied routes.
      const key = members.map(member => setKey(member.set)).join('>');
      let value = evaluated.get(key);
      if (value) statistics.reusedStates!++;
      else {const evaluation = evaluateRoster(this.evaluator, members, request.options?.weights, lineups); value = {metrics: evaluation.metrics, score: evaluation.score}; evaluated.set(key, value);}
      statistics.evaluatedStates++;
      return {members, ...value};
    };
    const ranked = (states: State[], size: number): State[] => {
      const seen = new Set<string>();
      return states.sort((a, b) => b.score - a.score).filter(s => {const key = teamKey(s.members.map(m => m.set)); if (seen.has(key)) return false; seen.add(key); return true;}).slice(0, size);
    };
    let beam: State[] = [state(draft.members)];
    if (kind === 'add' || kind === 'complete' && draft.members.length < this.evaluator.engine.ruleTable.maxTeamSize) {
      const target = kind === 'add' ? draft.members.length + 1 : this.evaluator.engine.ruleTable.maxTeamSize;
      while (beam.length && beam[0].members.length < target) {
        const expanded: State[] = [];
        expand: for (const s of beam) for (const candidate of pool) {
          if (expired()) break expand;
          const members = [...s.members, member(candidate.set)];
          if (this.isLegal(members)) expanded.push(state(members));
        }
        beam = ranked(expanded, beamWidth);
        if (statistics.deadlineReached) break;
        statistics.completedLayers++;
      }
      beam = beam.filter(s => s.members.length === target);
    } else {
      const targets = draft.members.filter(m => !request.memberId || m.id === request.memberId);
      const expanded: State[] = [];
      replace: for (const old of targets) for (const variant of this.variants(old, pool, request.options?.allowHistorical)) {
        if (expired()) break replace;
        const members = draft.members.map(m => m.id === old.id ? variant : m);
        if (this.isLegal(members)) expanded.push(state(members));
      }
      beam = ranked(expanded, beamWidth);
      if (!statistics.deadlineReached) statistics.completedLayers++;
    }
    // Two-coordinate neighborhoods can escape item conflicts that block one-slot replacement.
    if (kind !== 'add') {
      const improved: State[] = [...beam];
      neighborhood: for (const s of beam.slice(0, 3)) {
        const movable = s.members.filter(m => !draft.members.some(old => old.id === m.id && (kind === 'complete' || request.memberId && old.id !== request.memberId)));
        for (let i = 0; i < movable.length; i++) for (let j = i + 1; j < movable.length; j++) {
          const left = this.variants(movable[i], pool, request.options?.allowHistorical).slice(0, QUICK_SEARCH.neighbors);
          const right = this.variants(movable[j], pool, request.options?.allowHistorical).slice(0, QUICK_SEARCH.neighbors);
          for (const a of left) for (const b of right) {
            if (expired()) break neighborhood;
            const members = s.members.map(m => m.id === a.id ? a : m.id === b.id ? b : m);
            if (this.isLegal(members)) improved.push(state(members));
          }
        }
      }
      beam = ranked(improved, beamWidth * 3);
    }
    const changed = beam.filter(s => teamKey(s.members.map(m => m.set)) !== teamKey(draft.members.map(m => m.set)));
    if (!changed.length) {
      if (statistics.deadlineReached) throw new SearchBudgetError(statistics);
      throw new Error('当前锁定、物种与道具约束下没有找到不同的合法方案；可检查冲突的道具或放开指定字段。');
    }
    const front = changed.filter(s => !changed.some(t => dominates(t.metrics, s.metrics)));
    const selected: State[] = [];
    const diversity = (s: State) => selected.length ? Math.min(...selected.map(other => s.members.filter(m => !other.members.some(n => n.set.speciesId === m.set.speciesId)).length + 0.2 * s.members.filter(m => !other.members.some(n => setKey(n.set) === setKey(m.set))).length)) : 0;
    while (front.length && selected.length < (request.limit ?? QUICK_SEARCH.solutions)) {front.sort((a, b) => b.score + 0.25 * diversity(b) - (a.score + 0.25 * diversity(a))); selected.push(front.shift()!);}
    return selected.map((s, i) => {
      const changed = s.members.filter(m => !draft.members.some(o => setKey(o.set) === setKey(m.set)));
      const title = kind === 'add' ? `加入${this.evaluator.engine.display(changed[0].set.speciesId)}` : kind === 'replace' ? `调整${changed.map(m => this.evaluator.engine.display(m.set.speciesId)).join('、')}` : `方案 ${i + 1} · ${[...new Set(changed.flatMap(m => roles(m.set)))].slice(0, 2).join(' / ') || '均衡构筑'}`;
      const proposal = proposalFor(this.evaluator, draft, s.members, kind, title, start);
      if (statistics.deadlineReached) proposal.tradeoffs.push(`已达到 ${budgetMs} 毫秒搜索预算；这是预算内完成的合法方案，候选与局部改进尚未全部比较。`);
      return {...proposal, search: {...statistics}};
    });
  }
}
