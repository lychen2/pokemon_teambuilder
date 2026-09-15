import type {Archetype, Corpus, PokemonSet} from '../types';
import {complete, setKey} from '../domain';

export function matchesKnown(set: PokemonSet, known: Partial<PokemonSet>): boolean {
  if (known.speciesId && known.speciesId !== set.speciesId) return false;
  if (known.gender && set.gender && known.gender !== set.gender) return false;
  if (known.level !== undefined && known.level !== set.level) return false;
  for (const field of ['itemId', 'abilityId', 'natureId'] as const) if (known[field] != null && known[field] !== set[field]) return false;
  if (known.moves?.some(move => !set.moves.includes(move))) return false;
  if (known.points && (!set.points || Object.keys(known.points).some(key => known.points![key as keyof typeof known.points] !== set.points![key as keyof typeof set.points]))) return false;
  return true;
}

export function attachPartialEvidence(corpus: Corpus, archetypes: Archetype[], season: string) {
  const observations = new Map(corpus.observations.map(o => [o.id, o]));
  const teams = new Map(corpus.teams.map(team => [team.id, team]));
  const seen = new Set<string>();
  const assignments = new Map<string, {observationId: string; weight: number}[]>();
  const report = {considered: 0, assigned: 0, unmatched: 0, invalid: 0};
  for (const observation of corpus.observations.filter(o => !complete(o.set))) {
    const team = teams.get(observation.teamId)!;
    const key = `${observation.season}:${team.fingerprint}:${setKey(observation.set)}`;
    if (seen.has(key)) continue; seen.add(key); report.considered++;
    if (!observation.knownLegal) {report.invalid++; continue;}
    const compatible = archetypes.filter(archetype => archetype.speciesId === observation.set.speciesId && archetype.observationIds.some(id => matchesKnown(observations.get(id)!.set, observation.set)));
    if (!compatible.length) {report.unmatched++; continue;}
    const weights = compatible.map(a => (observation.season === season ? a.currentCount : a.historyCount) + 1 / compatible.length);
    const total = weights.reduce((sum, n) => sum + n, 0);
    compatible.forEach((a, i) => assignments.set(a.id, [...(assignments.get(a.id) ?? []), {observationId: observation.id, weight: weights[i] / total}]));
    report.assigned++;
  }
  return {archetypes: archetypes.map(a => ({...a, partialEvidence: assignments.get(a.id) ?? []})), report};
}
