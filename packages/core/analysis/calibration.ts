import type {Corpus, PokemonSet, SourceTeam} from '../types';
import type {MetaModel} from './model';
import {hash} from '../domain';

export const dateValue = (value: string) => {const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : 0;};
export function temporalSplit(corpus: Corpus, season: string, fraction = .75): {train: Corpus; held: SourceTeam[]; cutoff: string | null} {
  const current = corpus.teams.filter(t => t.season === season && t.status === 'valid' && dateValue(t.date))
    .filter((t, i, all) => all.findIndex(other => other.fingerprint === t.fingerprint) === i).sort((a, b) => dateValue(a.date) - dateValue(b.date) || a.id.localeCompare(b.id));
  if (!current.length) return {train: corpus, held: [], cutoff: null};
  const cutoff = dateValue(current[Math.floor((current.length - 1) * fraction)].date);
  const held = current.filter(t => dateValue(t.date) >= cutoff);
  const fingerprints = new Set(held.map(t => t.fingerprint));
  const duplicates = corpus.teams.filter(t => fingerprints.has(t.fingerprint));
  const authors = new Set(duplicates.map(t => t.author.trim().toLowerCase()).filter(Boolean));
  const origins = new Set(duplicates.map(t => t.originUrl).filter(Boolean));
  const teams = corpus.teams.filter(t => dateValue(t.date) && dateValue(t.date) < cutoff && !fingerprints.has(t.fingerprint) && !authors.has(t.author.trim().toLowerCase()) && (!t.originUrl || !origins.has(t.originUrl)));
  const ids = new Set(teams.map(t => t.id));
  return {train: {...corpus, version: hash([corpus.version, [...ids].sort()]), teams, observations: corpus.observations.filter(o => ids.has(o.teamId)), reports: []}, held, cutoff: new Date(cutoff).toISOString()};
}

export type ProbabilityField = 'itemId' | 'abilityId' | 'moves';
const valueOf = (set: PokemonSet, field: ProbabilityField) => field === 'moves' ? [...set.moves].sort().join(',') : set[field] ?? '?';

/** The same joint configuration posterior used by search/simulation, plus an unseen-label bucket. */
export function fieldDistribution(meta: MetaModel, species: string, teammates: string[], field: ProbabilityField, temperature = 1): Map<string, number> {
  const posterior = meta.configurationPosterior(species, teammates, {}, temperature);
  if (!posterior.length) return new Map([['__unseen__', 1]]);
  const values = new Map<string, number>();
  for (const row of posterior) {
    const value = valueOf(meta.configurationById.get(row.configurationId)!.set, field);
    values.set(value, (values.get(value) ?? 0) + row.probability);
  }
  // One explicit unseen category shares smoothing mass with the known labels.
  // Historical labels remain in the library even when their prior strength is zero.
  const unseen = 1 / (meta.configurationSupport(species) + 2);
  return new Map([...values].map(([key, probability]) => [key, probability * (1 - unseen)] as [string, number]).concat([['__unseen__', unseen]]));
}

export interface ProbabilityReport {samples: number; logLoss: number | null; brier: number | null; accuracy: number | null; unseen: number; bins: {lower: number; count: number; confidence: number | null; accuracy: number | null}[]}
export function scoreProbabilities(meta: MetaModel, corpus: Corpus, held: SourceTeam[], temperature = 1): ProbabilityReport {
  const observations = new Map(corpus.observations.map(o => [o.id, o]));
  const bins = Array.from({length: 10}, (_, i) => ({lower: i / 10, count: 0, confidence: 0, accuracy: 0}));
  let loss = 0; let brier = 0; let correct = 0; let samples = 0; let unseen = 0;
  for (const team of held) {
    const sets = team.observationIds.map(id => observations.get(id)!.set);
    for (const set of sets) for (const field of ['itemId', 'abilityId', 'moves'] as const) {
      const distribution = fieldDistribution(meta, set.speciesId, sets.map(s => s.speciesId), field, temperature);
      const actual = valueOf(set, field); const known = distribution.has(actual); const truth = known ? actual : '__unseen__';
      if (!known) unseen++;
      const probability = distribution.get(truth)!;
      if (!(probability > 0 && probability <= 1)) throw new Error(`配置概率无效：${set.speciesId} ${field} ${truth} = ${probability}`);
      loss -= Math.log(probability);
      for (const [label, p] of distribution) brier += (p - Number(label === truth)) ** 2;
      const [predicted, confidence] = [...distribution].sort((a, b) => b[1] - a[1])[0];
      const success = Number(predicted === actual); correct += success; samples++;
      const bin = bins[Math.min(9, Math.floor(confidence * 10))]; bin.count++; bin.confidence += confidence; bin.accuracy += success;
    }
  }
  return {samples, logLoss: samples ? loss / samples : null, brier: samples ? brier / samples : null, accuracy: samples ? correct / samples : null, unseen,
    bins: bins.map(bin => ({...bin, confidence: bin.count ? bin.confidence / bin.count : null, accuracy: bin.count ? bin.accuracy / bin.count : null}))};
}
