import type {Archetype, Configuration, Corpus, SetObservation} from '../types';
import {complete, hash, setKey} from '../domain';
import {matchesKnown} from './partial-evidence';
import {roles} from './roles';

/** Derive the configuration library from versioned observations; no synthetic modal sets. */
export function configurationLibrary(corpus: Corpus, archetypes: Archetype[], season: string): Configuration[] {
  const observations = new Map(corpus.observations.map(row => [row.id, row]));
  const fingerprints = new Map(corpus.teams.map(team => [team.id, team.fingerprint]));
  const independent = (rows: SetObservation[]) => new Set(rows.map(row => fingerprints.get(row.teamId))).size;
  const speciesCounts = new Map<string, Set<string>>();
  for (const row of corpus.observations.filter(row => row.currentLegal && complete(row.set) && row.season === season)) {
    const teams = speciesCounts.get(row.set.speciesId) ?? new Set<string>();
    teams.add(fingerprints.get(row.teamId)!); speciesCounts.set(row.set.speciesId, teams);
  }
  return archetypes.flatMap(archetype => {
    const groups = new Map<string, SetObservation[]>();
    for (const id of archetype.observationIds) {
      const row = observations.get(id);
      if (!row || !row.currentLegal || !complete(row.set)) throw new Error(`流派引用的配置观察无效：${archetype.id} / ${id}`);
      const key = setKey(row.set); const group = groups.get(key) ?? [];
      group.push(row); groups.set(key, group);
    }
    const configurations: Configuration[] = [...groups].map(([key, rows]) => {
      const ordered = [...rows].sort((a, b) => Number(b.season === season) - Number(a.season === season) || b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
      const currentCount = independent(rows.filter(row => row.season === season));
      const sourceKind = currentCount ? 'observed' : 'historical';
      const set = {...structuredClone(ordered[0].set), sourceKind: sourceKind as 'observed' | 'historical', sourceIds: ordered.map(row => row.id)};
      return {id: hash([archetype.speciesId, key]), archetypeId: archetype.id, speciesId: archetype.speciesId, set,
        isRepresentative: key === setKey(archetype.representative), roles: roles(set), observationIds: rows.map(row => row.id),
        currentCount, historyCount: independent(rows.filter(row => row.season !== season)),
        currentShare: currentCount / Math.max(1, speciesCounts.get(archetype.speciesId)?.size ?? 0), partialEvidence: []};
    });
    // A partial observation keeps its already-assigned archetype mass. Within that
    // archetype only compatible real configurations can receive it; unknowns stay unknown.
    for (const partial of archetype.partialEvidence ?? []) {
      const observation = observations.get(partial.observationId)!;
      const compatible = configurations.filter(configuration => matchesKnown(configuration.set, observation.set));
      if (!compatible.length) throw new Error(`缺字段观察与流派内配置不一致：${observation.id}`);
      const weights = compatible.map(configuration => (observation.season === season ? configuration.currentCount : configuration.historyCount) + 1 / compatible.length);
      const total = weights.reduce((sum, value) => sum + value, 0);
      compatible.forEach((configuration, index) => configuration.partialEvidence.push({observationId: observation.id, weight: partial.weight * weights[index] / total}));
    }
    return configurations;
  }).sort((a, b) => b.currentCount - a.currentCount || b.historyCount - a.historyCount || a.id.localeCompare(b.id));
}
