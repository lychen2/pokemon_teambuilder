import type {BattleEngine} from '../battle/engine';
import type {MetaModel} from './model';
import type {Configuration, BattleField, PokemonSet, TeamAnalysis, TeamDraft, TeamMember, ThreatResult} from '../types';
import {ALGORITHM_VERSION, complete, draftHash, setKey} from '../domain';
import {fieldFromTeam, pairMechanics, roles, teamMechanics} from './roles';
import {reverseField} from '../battle/fields';
import {evaluateRoster, opponentScenarios, rankLineups, routeMembers, type OpponentScenario} from './lineups';
import {referenceSeasons} from './evidence';

export const QUICK_SEARCH = {threats: 24, candidates: 48, beam: 7, neighbors: 12, solutions: 4} as const;
export const SEARCH_WEIGHTS = {pressure: 3, resilience: 1, speed: .6, coverage: 1, tailRisk: 1.5};
const clamp = (v: number) => Math.max(0, Math.min(1, v));

export function speedInField(engine: BattleEngine, set: PokemonSet, team: PokemonSet[], mega: boolean, field: BattleField): number {
  return engine.speeds(set, set, {...field, attackerMega: mega, defenderMega: mega}).attacker;
}

interface Matchup {damage: number; ko: number; incoming: number; faster: boolean; moveId: string | null}
export interface EvaluationTarget {configuration: Pick<Configuration, 'id' | 'archetypeId' | 'speciesId' | 'set'>; weight: number}
export interface Evaluation {
  members: TeamMember[];
  effectiveMembers: TeamMember[];
  metrics: TeamAnalysis['metrics'];
  threats: ThreatResult[];
  threatOrder: number[];
  field: BattleField;
  megaId: string | null;
  supportScore: number;
  score: number;
}
export class Evaluator {
  readonly threats: EvaluationTarget[];
  readonly sampleMass: number;
  readonly referenceSeasons: string[];
  readonly scenarios: OpponentScenario[];
  damageQueries = 0;
  private matchups = new Map<string, Map<string, Matchup>>();
  private validity = new Map<string, boolean>();
  private projections = new WeakMap<Evaluation, Map<OpponentScenario, TeamAnalysis['metrics']>>();
  constructor(readonly engine: BattleEngine, readonly meta: MetaModel, threatCount = QUICK_SEARCH.threats) {
    const legal = meta.corpus.observations.filter(row => row.currentLegal);
    this.referenceSeasons = referenceSeasons(legal, meta.season);
    const counts = new Map(meta.model.archetypes.map(archetype => [archetype.id, new Set(archetype.observationIds.map(id => meta.observationById.get(id)!).filter(row => this.referenceSeasons.includes(row.season)).map(row => meta.canonicalTeamIds.get(row.teamId)!)).size]));
    const current = meta.model.archetypes.filter(a => counts.get(a.id)! > 0).sort((a, b) => counts.get(b.id)! - counts.get(a.id)!);
    const total = current.reduce((sum, a) => sum + counts.get(a.id)!, 0);
    const selected = current.slice(0, threatCount);
    const mass = selected.reduce((sum, a) => sum + counts.get(a.id)!, 0);
    this.sampleMass = total ? mass / total : 0;
    this.threats = selected.map(archetype => ({configuration: meta.configurationById.get(archetype.id)!, weight: counts.get(archetype.id)! / mass}));
    this.scenarios = opponentScenarios(meta, this.threats);
  }

  legalSet(set: PokemonSet): boolean {
    const key = setKey(set); let valid = this.validity.get(key);
    if (valid === undefined) {valid = complete(set) && !this.engine.validateSet(set).length; this.validity.set(key, valid);}
    return valid;
  }

  private calculateMatchup(set: PokemonSet, threat: PokemonSet, field: BattleField, mega: boolean): Matchup {
    const outgoing = this.engine.damage(set, threat, {...field, attackerMega: mega, defenderMega: true});
    const incoming = this.engine.damage(threat, set, {...reverseField(field), attackerMega: true, defenderMega: mega});
    this.damageQueries += 2;
    const speed = this.engine.speeds(set, threat, {...field, attackerMega: mega, defenderMega: true});
    const best = [...outgoing].sort((a, b) => b.minPercent - a.minPercent || b.ohko - a.ohko)[0];
    return {
      damage: best?.minPercent ?? 0, ko: best?.ohko ?? 0, moveId: best?.moveId ?? null,
      incoming: Math.max(0, ...incoming.map(d => d.maxPercent)),
      faster: field.trickRoom ? speed.attacker < speed.defender : speed.attacker > speed.defender,
    };
  }

  lineup(members: TeamMember[], opponents: EvaluationTarget[], megaId: string | null, weights = SEARCH_WEIGHTS): Evaluation {
    if (megaId && !members.some(m => m.id === megaId && this.engine.dex.items.get(m.set.itemId ?? '').megaStone?.[this.engine.name('species', m.set.speciesId)])) throw new Error('该选出中没有指定的 Mega 使用者。');
    const effectiveMembers = routeMembers(this.engine, members, megaId);
    const field = fieldFromTeam(effectiveMembers.map(m => m.set));
    const conditions = JSON.stringify(field);
    // Resolve each attacker/condition row once, instead of serializing both full
    // configurations for every cell of every repeated four-member lineup.
    const rows = members.map(member => {
      const mega = member.id === megaId;
      const key = [setKey(member.set), conditions, mega].join('>');
      let cache = this.matchups.get(key);
      if (!cache) {cache = new Map(); this.matchups.set(key, cache);}
      return {member, mega, cache};
    });
    const threats = opponents.map(({configuration: a, weight}): ThreatResult => {
        const key = setKey(a.set);
        let best: Matchup | undefined; let bestMember: TeamMember | undefined;
        let incomingTotal = 0; let fast = 0;
        for (const row of rows) {
          let result = row.cache.get(key);
          if (!result) {result = this.calculateMatchup(row.member.set, a.set, field, row.mega); row.cache.set(key, result);}
          if (!best || result.damage > best.damage) {best = result; bestMember = row.member;}
          incomingTotal += clamp(result.incoming / 100); fast += Number(result.faster);
        }
        const incoming = rows.length ? incomingTotal / rows.length : 1;
        const pressure = clamp((best?.damage ?? 0) / 100);
        const difficulty = clamp(0.52 * (1 - pressure) + 0.34 * incoming + 0.14 * (1 - fast / Math.max(1, members.length)));
        return {archetypeId: a.archetypeId, configurationId: a.id, speciesId: a.speciesId, set: a.set, weight, bestAttackerId: bestMember?.id ?? null, bestDamage: best?.damage ?? 0, bestKO: best?.ko ?? 0, moveId: best?.moveId ?? null, field: {...field, attackerMega: bestMember?.id === megaId, defenderMega: true}, incomingDamage: incoming * 100, outspeedCount: fast, difficulty};
      });
    const supportScore = this.supportScore(effectiveMembers);
    const threatOrder = threats.map((_, index) => index).sort((a, b) => threats[b].difficulty - threats[a].difficulty);
    const metrics = this.metrics(threats, members.length, threatOrder);
    return {metrics, threats, threatOrder, field, megaId, members, effectiveMembers, supportScore, score: this.metricScore(metrics, weights) + supportScore};
  }

  evaluate(members: TeamMember[], opponents = this.threats, weights = SEARCH_WEIGHTS): Evaluation {
    return rankLineups(this, members, opponents, weights)[0];
  }

  metrics(threats: ThreatResult[], selected: number, order = threats.map((_, index) => index).sort((a, b) => threats[b].difficulty - threats[a].difficulty)): TeamAnalysis['metrics'] {
    const expected = (f: (t: ThreatResult) => number) => threats.reduce((sum, t) => sum + t.weight * f(t), 0);
    let tailMass = 0; let tailValue = 0;
    for (const index of order) {const t = threats[index]; const mass = Math.min(t.weight, 0.2 - tailMass); tailValue += mass * t.difficulty; tailMass += mass; if (tailMass >= 0.2) break;}
    return {pressure: expected(t => clamp(t.bestDamage / 100)), resilience: expected(t => 1 - t.incomingDamage / 100), speed: expected(t => t.outspeedCount / Math.max(1, selected)), coverage: expected(t => Number(t.bestDamage >= 50)), tailRisk: tailMass ? tailValue / tailMass : 1};
  }

  projectMetrics(route: Evaluation, scenario: OpponentScenario): TeamAnalysis['metrics'] {
    let projected = this.projections.get(route);
    if (!projected) {projected = new Map(); this.projections.set(route, projected);}
    const cached = projected.get(scenario);
    if (cached) return cached;
    let pressure = 0; let resilience = 0; let speed = 0; let coverage = 0;
    for (const {index, weight} of scenario.targets) {
      const threat = route.threats[index];
      pressure += weight * clamp(threat.bestDamage / 100);
      resilience += weight * (1 - threat.incomingDamage / 100);
      speed += weight * threat.outspeedCount / Math.max(1, route.members.length);
      coverage += weight * Number(threat.bestDamage >= 50);
    }
    let tailMass = 0; let tailValue = 0;
    for (const index of route.threatOrder) {
      const mass = Math.min(scenario.weights[index], .2 - tailMass);
      tailValue += mass * route.threats[index].difficulty; tailMass += mass;
      if (tailMass >= .2) break;
    }
    const metrics = {pressure, resilience, speed, coverage, tailRisk: tailMass ? tailValue / tailMass : 1};
    projected.set(scenario, metrics);
    return metrics;
  }

  metricScore(metrics: TeamAnalysis['metrics'], weights = SEARCH_WEIGHTS): number {
    return weights.pressure * metrics.pressure + weights.resilience * metrics.resilience + weights.speed * metrics.speed + weights.coverage * metrics.coverage - weights.tailRisk * metrics.tailRisk;
  }

  private supportScore(members: TeamMember[]): number {
    const tags = new Set(members.flatMap(m => roles(m.set)));
    const mechanism = teamMechanics(members.map(m => m.set));
    const protection = ['掩护', '范围防护', '先制阻断', '威吓', '双墙', '减伤支援'].some(role => tags.has(role));
    // Weather/terrain already enter numerical matchups; extra descriptions cannot add strength.
    const support = mechanism.benefitResources.filter(id => id !== 'weather' && id !== 'terrain').length;
    return 0.12 * Number(tags.has('控速')) + 0.1 * Number(protection) + 0.035 * (support - mechanism.conflictResources.length);
  }

  score(metrics: TeamAnalysis['metrics'], members: TeamMember[], weights = SEARCH_WEIGHTS): number {
    return this.metricScore(metrics, weights) + this.supportScore(members);
  }

  analyze(draft: TeamDraft): TeamAnalysis {
    const start = performance.now();
    const validation = this.engine.validateDraft(draft);
    const roster = evaluateRoster(this, draft.members);
    const result = roster.reference;
    const strengths: string[] = []; const concerns: string[] = [];
    const ready = draft.members.filter(m => complete(m.set) && !validation.some(i => i.memberId === m.id));
    const members = ready.map(m => {
      const partners = ready.filter(p => p.id !== m.id).flatMap(p => pairMechanics(m.set, p.set).benefits.map(b => `${this.engine.display(p.set.speciesId)}：${b}`));
      const stats = this.engine.stats(m.set, false);
      const hasMega = this.engine.dex.items.get(m.set.itemId || '').megaStone?.[this.engine.name('species', m.set.speciesId)];
      return {memberId: m.id, stats, megaStats: hasMega ? this.engine.stats(m.set, true) : undefined, roles: roles(m.set), partners};
    });
    const mechanics = teamMechanics(result.effectiveMembers.map(m => m.set));
    strengths.push(...mechanics.benefits); concerns.push(...mechanics.conflicts);
    const tags = new Set(members.flatMap(m => m.roles));
    if (ready.length && !tags.has('控速')) concerns.push('尚无顺风、戏法空间或降速招式；速度关系按自然速度与已建立的场地计算。');
    for (const m of ready) {
      if (m.set.abilityId === 'unburden' && /seed$/.test(m.set.itemId || '') && !ready.some(p => pairMechanics(p.set, m.set).benefits.some(b => /轻装/.test(b)))) concerns.push(`${this.engine.display(m.set.speciesId)}的种子轻装尚缺少对应场地支持。`);
    }
    if (!this.threats.length) concerns.push('当前与历史赛季均无通过新规则校验的完整配置，无法生成对照；请接入构筑来源。');
    if (this.referenceSeasons.length && !this.referenceSeasons.includes(this.meta.season)) concerns.push(`新赛季尚无完整合法配置，正在参考 ${this.referenceSeasons.join('、')} 的历史配置；这不是新赛季使用率。`);
    const worst = [...result.threats].sort((a, b) => b.difficulty - a.difficulty).slice(0, 3);
    concerns.push(...worst.filter(t => t.difficulty > 0.38).map(t => `对${this.engine.display(t.speciesId)}：最佳最低乱数 ${t.bestDamage.toFixed(0)}%，${t.outspeedCount} 位成员能先手。`));
    const selectedNames = result.members.map(m => this.engine.display(m.set.speciesId)).join('、');
    const conditions = ['满血、命中、非要害；不预设顺风或强化；单只对手分别按其可用 Mega 对照，不代表双方同时推进回合', `下列伤害与先手人数统一来自选出：${selectedNames || '尚无完整配置'}`, '伤害与速度对照不等同于完整对局胜率'];
    const represented = roster.matchups.reduce((sum, row) => sum + row.scenario.count, 0);
    const total = this.scenarios.reduce((sum, row) => sum + row.count, 0);
    if (represented) {
      const mass = roster.matchups.reduce((sum, row) => sum + row.scenario.count * row.scenario.coveredProbability, 0) / represented;
      conditions.push(`构筑评分分别为 ${represented}/${total} 支独立共享队伍选择可用路线；快速矩阵覆盖这些对手的条件流派概率的 ${(mass * 100).toFixed(0)}%，未覆盖部分不作已解决处理`);
    } else conditions.push('尚无完整共享对手队伍可组成选出场景，仅比较已知单只配置');
    if (result.field.weather || result.field.terrain) conditions.push(`假设队内场地手成功建立${result.field.weather || ''} ${result.field.terrain || ''}`.trim());
    if (result.megaId) conditions.push(`此路线由${this.engine.display(ready.find(m => m.id === result.megaId)!.set.speciesId)}使用 Mega 资源`);
    return {draftId: draft.id, inputHash: draftHash(draft), modelVersion: this.meta.model.version, environmentId: draft.environmentId, corpusVersion: this.meta.corpus.version, revision: draft.analysisRevision, algorithmVersion: ALGORITHM_VERSION, elapsedMs: performance.now() - start,
      metrics: roster.metrics, members, threats: [...result.threats].sort((a, b) => b.difficulty - a.difficulty), strengths: [...new Set(strengths)], concerns: [...new Set(concerns)], validation,
      complete: draft.members.length === this.engine.ruleTable.maxTeamSize && !validation.length, scope: {archetypes: this.threats.length, sampleMass: this.sampleMass, conditions}};
  }
}
