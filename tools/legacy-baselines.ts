import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import type {BattleEngine} from '../packages/core/battle/engine';
import type {MetaModel} from '../packages/core/analysis/model';
import type {PokemonSet, SetObservation} from '../packages/core/types';
import {STAT_KEYS} from '../packages/core/types';
import {setKey, toID} from '../packages/core/domain';

// Port of vgcpastes.py:358. Linkage is updated algebraically, with the original
// first-pair tie order, unweighted unique configurations and fixed k <= 3.
export function legacyDistance(a: PokemonSet, b: PokemonSet): number {
  const union = new Set([...a.moves, ...b.moves]);
  const intersection = a.moves.filter(m => b.moves.includes(m)).length;
  return Number(a.itemId !== b.itemId) + 5 * Number(a.abilityId !== b.abilityId) + 2 * Number(a.natureId !== b.natureId)
    + (union.size ? 4 * (union.size - intersection) / union.size : 0)
    + 2 * Math.min(1, STAT_KEYS.reduce((sum, s) => sum + Math.abs(a.points![s] - b.points![s]), 0) / 132);
}

export function legacyArchetypes(observations: SetObservation[]): PokemonSet[] {
  const records = new Map<string, SetObservation>();
  for (const o of observations) {const key = setKey(o.set); const previous = records.get(key); if (!previous || Date.parse(o.date) > Date.parse(previous.date)) records.set(key, o);}
  const rows = [...records.values()]; const n = rows.length;
  if (n <= 3) return rows.map(o => o.set);
  const matrix = rows.map(a => rows.map(b => legacyDistance(a.set, b.set)));
  const clusters = rows.map((_, i) => [i]); const distances = matrix.map(row => [...row]);
  while (clusters.length > 3) {
    let left = 0; let right = 1; let distance = Infinity;
    for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) if (distances[i][j] < distance) {left = i; right = j; distance = distances[i][j];}
    const a = clusters[left].length; const b = clusters[right].length;
    for (let i = 0; i < clusters.length; i++) if (i !== left && i !== right) distances[left][i] = distances[i][left] = (distances[left][i] * a + distances[right][i] * b) / (a + b);
    clusters[left].push(...clusters[right]); clusters.splice(right, 1); distances.splice(right, 1); for (const row of distances) row.splice(right, 1);
  }
  const recordScore = (keys: string[], get: (s: PokemonSet) => string[]) => {
    const counts = new Map<string, number>(); for (const row of observations) for (const key of get(row.set)) counts.set(key, (counts.get(key) ?? 0) + 1);
    const peak = Math.max(1, ...counts.values()); return keys.reduce((sum, key) => sum + (counts.get(key) ?? 0) / peak, 0) / keys.length;
  };
  const usage = rows.map(o => 3 * recordScore([o.set.itemId!], s => [s.itemId!]) + 2 * recordScore([o.set.abilityId!], s => [s.abilityId!]) + recordScore(o.set.moves, s => s.moves));
  return clusters.sort((a, b) => b.length - a.length).map(group => {
    const cost = (i: number) => group.reduce((sum, j) => sum + matrix[i][j], 0);
    const index = [...group].sort((a, b) => cost(a) - cost(b) || usage[b] - usage[a] || (Date.parse(rows[b].date) || 0) - (Date.parse(rows[a].date) || 0))[0];
    return rows[index].set;
  });
}

export async function loadLegacyRecommender(reference: string, engine: BattleEngine, meta: MetaModel) {
  const {recommendConfigs} = await import(pathToFileURL(join(reference, 'static/app/recommendations.js')).href);
  const {buildUsageLookup} = await import(pathToFileURL(join(reference, 'static/app/usage.js')).href);
  const pokedex = Object.fromEntries(engine.dex.species.all().map((s: any) => [s.id, s]));
  const usageData: Record<string, unknown> = {};
  for (const [species, teams] of meta.teamsBySpecies) {
    const pairCounts: Record<string, number> = {};
    for (const team of teams) for (const partner of meta.speciesByTeam.get(team) ?? []) if (partner !== species) pairCounts[partner] = (pairCounts[partner] ?? 0) + 100 / teams.size;
    usageData[species] = {usage: teams.size / Math.max(1, meta.model.currentTeams) * 100, Teammates: pairCounts};
  }
  const datasets = {pokedex, availableSpecies: [], localizedSpeciesNames: new Map(engine.dexData().species.map(s => [s.id, s.zh])), usageLookup: buildUsageLookup(usageData), moveLookup: new Map(engine.dex.moves.all().map((m: any) => [m.id, m]))};
  const convert = (set: PokemonSet, id = setKey(set)) => {
    const p = engine.pokemon(set, true); const species = engine.dex.species.get(p.name);
    const moves = set.moves.map(m => engine.dex.moves.get(m));
    return {id, speciesId: species.id, speciesName: species.name, displayName: engine.zh(species.name), types: species.types, ability: p.ability, item: p.item, nature: p.nature, championPoints: set.points, stats: engine.stats(set, true), baseStats: species.baseStats, moves, moveNames: moves.map((m: any) => m.name), offensiveTypes: [...new Set(moves.filter((m: any) => m.category !== 'Status').map((m: any) => m.type))], usage: meta.teamsBySpecies.get(set.speciesId)?.size ?? 0, abilityInfo: engine.dex.abilities.get(toID(p.ability)), itemInfo: engine.dex.items.get(set.itemId ?? '')};
  };
  const library = meta.model.archetypes.map(a => convert(a.representative, a.id));
  const speedTiers = library.map(c => ({speed: c.stats.spe, totalCount: Math.max(1, c.usage), configs: [c]}));
  const byId = new Map(meta.model.archetypes.map(a => [a.id, a.representative]));
  return (team: PokemonSet[]): PokemonSet[] => recommendConfigs(library, team.map(s => convert(s)), speedTiers, 'zh', {datasets}).recommendations.map((row: any) => {
    const set = byId.get(row.id); if (!set) throw new Error(`旧推荐返回候选库外配置 ${row.id}`); return set;
  });
}
