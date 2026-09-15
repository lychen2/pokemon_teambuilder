import type {Evaluator, Evaluation, EvaluationTarget} from './evaluate';
import type {BattleEngine} from '../battle/engine';
import type {MetaModel} from './model';
import type {TeamMember, TeamAnalysis} from '../types';
import {combinations, hash, setKey, toID} from '../domain';
import {opponentSources} from './evidence';

export interface OpponentScenario {
  id: string;
  species: string[];
  sourceIds: string[];
  seasons: string[];
  count: number;
  targets: {index: number; weight: number}[];
  weights: number[];
  missingSpecies: string[];
  coveredProbability: number;
}
export interface RosterEvaluation {
  metrics: TeamAnalysis['metrics'];
  score: number;
  reference: Evaluation;
  matchups: {scenario: OpponentScenario; route: Evaluation; metrics: TeamAnalysis['metrics']; score: number}[];
}

export function routeMembers(engine: BattleEngine, members: TeamMember[], megaId: string | null): TeamMember[] {
  return members.map(member => member.id === megaId ? {...member, set: {...member.set, abilityId: toID(engine.pokemon(member.set, true).ability)}} : member);
}

export function rankLineups(evaluator: Evaluator, members: TeamMember[], targets = evaluator.threats, weights?: TeamAnalysis['metrics'], cache?: Map<string, Evaluation>): Evaluation[] {
  const ready = members.filter(member => evaluator.legalSet(member.set));
  const size = Math.min(ready.length, evaluator.engine.ruleTable.pickedTeamSize);
  const context = cache && hash([targets.map(target => [target.configuration.id, target.configuration.archetypeId, setKey(target.configuration.set), target.weight]), weights]);
  const keys = cache && new Map(ready.map(member => [member, `${member.id}:${setKey(member.set)}`]));
  return combinations(ready, size).flatMap(selected => {
    const megas = selected.filter(member => evaluator.engine.dex.items.get(member.set.itemId ?? '').megaStone?.[evaluator.engine.name('species', member.set.speciesId)]);
    return [null, ...megas.map(member => member.id)].map(megaId => {
      if (!cache) return evaluator.lineup(selected, targets, megaId, weights);
      const key = `${context}:${selected.map(member => keys!.get(member)).join('>')}:${megaId}`;
      let result = cache.get(key);
      if (!result) {result = evaluator.lineup(selected, targets, megaId, weights); cache.set(key, result);}
      return result;
    });
  }).sort((a, b) => b.score - a.score);
}

/** Public species rosters define scenarios; an author's hidden configuration never selects our lineup. */
export function opponentScenarios(meta: MetaModel, threats: EvaluationTarget[]): OpponentScenario[] {
  const groups = new Map<string, OpponentScenario>();
  for (const team of opponentSources(meta.corpus.teams, meta.season)) {
    const species = team.observationIds.map(id => meta.observationById.get(id)!.set.speciesId).sort();
    const id = hash(species); const existing = groups.get(id);
    if (existing) {existing.count++; existing.sourceIds.push(team.id); if (!existing.seasons.includes(team.season)) existing.seasons.push(team.season); continue;}
    const targets: OpponentScenario['targets'] = []; let coveredProbability = 0;
    const missingSpecies: string[] = [];
    for (const pokemon of species) {
      const posterior = meta.posterior(pokemon, species);
      const matches = threats.flatMap((target, index) => target.configuration.speciesId === pokemon ? [{index, weight: posterior.find(row => row.archetypeId === target.configuration.archetypeId)!.probability}] : []);
      const mass = matches.reduce((sum, row) => sum + row.weight, 0);
      if (!mass) {missingSpecies.push(pokemon); continue;}
      coveredProbability += mass / species.length;
      targets.push(...matches.map(row => ({index: row.index, weight: row.weight / mass})));
    }
    const represented = species.length - missingSpecies.length;
    const normalized = targets.map(row => ({...row, weight: row.weight / represented}));
    const weights = new Array<number>(threats.length).fill(0);
    for (const row of normalized) weights[row.index] = row.weight;
    groups.set(id, {id, species, sourceIds: [team.id], seasons: [team.season], count: 1, targets: normalized, weights, missingSpecies, coveredProbability});
  }
  return [...groups.values()];
}

export function evaluateRoster(evaluator: Evaluator, members: TeamMember[], weights?: TeamAnalysis['metrics'], cache?: Map<string, Evaluation>): RosterEvaluation {
  const routes = rankLineups(evaluator, members, evaluator.threats, weights, cache);
  const reference = routes[0];
  const matchups = evaluator.scenarios.filter(scenario => scenario.targets.length).map(scenario => {
    let best: RosterEvaluation['matchups'][number] | undefined;
    for (const route of routes) {
      const metrics = evaluator.projectMetrics(route, scenario);
      const score = evaluator.metricScore(metrics, weights) + route.supportScore;
      if (!best || score > best.score) best = {scenario, route, metrics, score};
    }
    return best!;
  });
  // A corpus may have only single-set observations. Expose that scope to the UI instead of inventing teams.
  if (!matchups.length) return {reference, metrics: reference.metrics, score: reference.score, matchups};
  const total = matchups.reduce((sum, row) => sum + row.scenario.count, 0);
  const mean = (field: keyof TeamAnalysis['metrics']) => matchups.reduce((sum, row) => sum + row.metrics[field] * row.scenario.count, 0) / total;
  return {reference, matchups, metrics: {pressure: mean('pressure'), resilience: mean('resilience'), speed: mean('speed'), coverage: mean('coverage'), tailRisk: mean('tailRisk')}, score: matchups.reduce((sum, row) => sum + row.score * row.scenario.count, 0) / total};
}
