import type {Evaluator, EvaluationTarget} from '../analysis/evaluate';
import type {PokemonSet, TeamMember} from '../types';
import type {BattleObservation} from './observation';
import type {Action} from './policy';
import type {PolicyEvidence} from './belief-policy';
import {compareLeads} from '../analysis/selections';
import {rankLineups} from '../analysis/lineups';
import {hash, sample, seededRandom, setKey} from '../domain';
import {conditionedConfigurations} from './configuration-beliefs';

export type PreviewPolicy = (input: {observation: BattleObservation; own: PokemonSet[]; actions: Action[]; seed: number; samples: number}) => {actions: Action[]; evidence: PolicyEvidence};

/** One simulation-local hypothesis bank, keyed only by public opponents and known sheets.
 * Sampling is separate from battle seeds; the actual hidden opponent team is never an input. */
export function createPreviewPolicy(evaluator: Evaluator): PreviewPolicy {
  const hypotheses = new Map<string, {targets: EvaluationTarget[]; generated: number}>();
  const priors = new Map<string, Map<string, number>>();
  return ({observation, own, actions, seed, samples}) => {
    if (!Number.isInteger(samples) || samples < 1) throw new Error('预览配置采样数必须是正整数。');
    const evidence: PolicyEvidence = {beliefs: 0, generated: 0, queries: 0};
    const species = [...observation.preview].sort();
    const sheets = [...(observation.openSheets ?? [])].sort((a, b) => a.speciesId.localeCompare(b.speciesId));
    const publicKey = hash([species, sheets, seed, samples]);
    let bank = hypotheses.get(publicKey);
    if (!bank) {
      const random = seededRandom(parseInt(publicKey.slice(0, 8), 16));
      const targets = new Map<string, EvaluationTarget>(); let generated = 0;
      for (const id of species) {
        const known = sheets.find(row => row.speciesId === id) ?? {};
        const beliefs = conditionedConfigurations(evaluator.meta, evaluator.engine, id, species, known);
        for (let index = 0; index < samples; index++) {
          const drawn = sample(beliefs, beliefs.map(row => row.probability), random);
          const key = setKey(drawn.set); const prior = targets.get(key);
          generated += Number(drawn.generated);
          targets.set(key, {configuration: {id: hash(key), archetypeId: '', speciesId: id, set: drawn.set}, weight: (prior?.weight ?? 0) + 1 / (samples * species.length)});
        }
      }
      bank = {targets: [...targets.values()], generated}; hypotheses.set(publicKey, bank);
      evidence.beliefs = species.length * samples; evidence.generated = generated;
    }
    const ownKey = hash([publicKey, own.map(setKey), observation.request.maxChosenTeamSize]);
    let scores = priors.get(ownKey);
    if (!scores) {
      const previousQueries = evaluator.damageQueries;
      const members: TeamMember[] = own.map((set, index) => ({id: String(index + 1), set, lock: {species: false, fields: []}}));
      const routes = rankLineups(evaluator, members, bank.targets);
      scores = new Map();
      for (const route of routes) {
        for (const lead of compareLeads(evaluator, route, bank.targets)) {
          const key = [route.members.map(member => member.id).sort().join(','), [...lead.members].sort().join(',')].join(':');
          // The selected four and immediate lead each contribute in the same scoring units.
          const score = (route.score + lead.score) / 2;
          if (!scores.has(key) || score > scores.get(key)!) scores.set(key, score);
        }
      }
      evidence.queries = evaluator.damageQueries - previousQueries;
      priors.set(ownKey, scores);
    }
    const ranked = actions.map(action => {
      const order = action.command.slice(5).split(',');
      const key = [[...order].sort().join(','), order.slice(0, 2).sort().join(',')].join(':');
      const prior = scores.get(key);
      if (prior === undefined) throw new Error(`配置级预览未覆盖合法选出：${action.command}。请检查环境的选出人数。`);
      return {...action, prior};
    }).sort((a, b) => b.prior - a.prior || a.command.localeCompare(b.command));
    return {actions: ranked, evidence};
  };
}
