import type {PokemonSet, Stats} from '../types';
import {STAT_KEYS} from '../types';
import {seededRandom} from '../domain';
import {roles} from './roles';

export interface Feature {set: PokemonSet; stats: Stats | null; thresholds: number[]; weight: number}
const jaccard = (a: string[], b: string[]) => {
  const union = new Set([...a, ...b]);
  return union.size ? 1 - [...new Set(a)].filter(x => b.includes(x)).length / union.size : 0;
};

type MetricFeature = Feature & {roleTags: string[]};
function gower(a: MetricFeature, b: MetricFeature, ranges: Stats): number {
  let distance = 0; let weight = 0;
  const category = (x: string | null, y: string | null, w: number) => {if (x !== null && y !== null) {distance += w * Number(x !== y); weight += w;}};
  category(a.set.itemId, b.set.itemId, 1); category(a.set.abilityId, b.set.abilityId, 1.5);
  category(a.set.natureId, b.set.natureId, 0.5);
  if (a.set.moves.length && b.set.moves.length) {distance += 3 * jaccard(a.set.moves, b.set.moves); weight += 3;}
  distance += jaccard(a.roleTags, b.roleTags); weight++;
  if (a.stats && b.stats) {
    distance += STAT_KEYS.reduce((sum, stat) => sum + Math.abs(a.stats![stat] - b.stats![stat]) / Math.max(1, ranges[stat]), 0) / 6;
    weight++;
  }
  if (a.thresholds.length && b.thresholds.length) {
    distance += a.thresholds.reduce((sum, value, i) => sum + Math.abs(value - b.thresholds[i]), 0) / a.thresholds.length;
    weight++;
  }
  return distance / weight;
}

type Pair = {a: number; b: number; distance: number};
class PairHeap {
  // Dense columns retain the original heap's tie order without millions of boxed pairs.
  private a: Uint32Array;
  private b: Uint32Array;
  private distances: Float64Array;
  private length = 0;
  constructor(capacity: number) {
    this.a = new Uint32Array(Math.max(1, capacity));
    this.b = new Uint32Array(this.a.length);
    this.distances = new Float64Array(this.a.length);
  }
  push(value: Pair) {
    if (this.length === this.a.length) {
      const a = new Uint32Array(this.a.length * 2); a.set(this.a); this.a = a;
      const b = new Uint32Array(this.b.length * 2); b.set(this.b); this.b = b;
      const distances = new Float64Array(this.distances.length * 2); distances.set(this.distances); this.distances = distances;
    }
    let i = this.length++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.distances[p] <= value.distance) break;
      this.a[i] = this.a[p]; this.b[i] = this.b[p]; this.distances[i] = this.distances[p]; i = p;
    }
    this.a[i] = value.a; this.b[i] = value.b; this.distances[i] = value.distance;
  }
  pop(): Pair | undefined {
    if (!this.length) return undefined;
    const first = {a: this.a[0], b: this.b[0], distance: this.distances[0]};
    const last = --this.length;
    if (this.length) {
      const a = this.a[last]; const b = this.b[last]; const distance = this.distances[last];
      let i = 0;
      while (i * 2 + 1 < this.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.length && this.distances[child + 1] < this.distances[child]) child++;
        if (this.distances[child] >= distance) break;
        this.a[i] = this.a[child]; this.b[i] = this.b[child]; this.distances[i] = this.distances[child]; i = child;
      }
      this.a[i] = a; this.b[i] = b; this.distances[i] = distance;
    }
    return first;
  }
}
export interface Merge {left: number; right: number; node: number; height: number}
export function linkage(matrix: number[][], weights: number[]): Merge[] {
  const n = matrix.length;
  const active = new Set(Array.from({length: n}, (_, i) => i));
  const sizes = [...weights]; const distances = matrix.map(row => [...row]);
  const heap = new PairHeap(n * (n - 1) / 2);
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) heap.push({a: i, b: j, distance: matrix[i][j]});
  const merges: Merge[] = [];
  while (active.size > 1) {
    let best = heap.pop();
    while (best && (!active.has(best.a) || !active.has(best.b))) best = heap.pop();
    if (!best) throw new Error('聚类距离矩阵不完整。');
    const {a, b, distance} = best; const node = n + merges.length;
    merges.push({left: a, right: b, node, height: distance});
    active.delete(a); active.delete(b); sizes[node] = sizes[a] + sizes[b]; distances[node] = [];
    for (const other of active) {
      const d = (distances[a][other] * sizes[a] + distances[b][other] * sizes[b]) / sizes[node];
      distances[node][other] = d; distances[other][node] = d;
      heap.push({a: node, b: other, distance: d});
    }
    active.add(node);
  }
  return merges;
}

export function cut(n: number, merges: Merge[], k: number): number[][] {
  const clusters = new Map(Array.from({length: n}, (_, i) => [i, [i]]));
  for (const m of merges.slice(0, n - k)) {clusters.set(m.node, [...clusters.get(m.left)!, ...clusters.get(m.right)!]); clusters.delete(m.left); clusters.delete(m.right);}
  return [...clusters.values()];
}

export function silhouette(matrix: number[][], groups: number[][], weights: number[]): number {
  if (groups.length === 1) return 0;
  let total = 0; let totalWeight = 0;
  for (const group of groups) for (const i of group) {
    const ownWeight = group.filter(j => j !== i).reduce((sum, j) => sum + weights[j], 0);
    if (!ownWeight) {totalWeight += weights[i]; continue;}
    const a = group.reduce((sum, j) => sum + matrix[i][j] * weights[j], 0) / ownWeight;
    const b = Math.min(...groups.filter(g => g !== group).map(g => g.reduce((sum, j) => sum + matrix[i][j] * weights[j], 0) / g.reduce((sum, j) => sum + weights[j], 0)));
    total += weights[i] * ((b - a) / Math.max(a, b, 1e-12)); totalWeight += weights[i];
  }
  return total / totalWeight;
}

export function clusterFeatures(features: Feature[]): {groups: number[][]; stability: (number | null)[]; matrix: number[][]} {
  const n = features.length;
  const metricFeatures = features.map(feature => ({...feature, roleTags: roles(feature.set)}));
  const ranges = Object.fromEntries(STAT_KEYS.map(stat => {const values = features.flatMap(f => f.stats ? [f.stats[stat]] : []); return [stat, values.length ? Math.max(...values) - Math.min(...values) : 1];})) as Stats;
  const matrix = Array.from({length: n}, () => Array(n).fill(0) as number[]);
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) matrix[i][j] = matrix[j][i] = gower(metricFeatures[i], metricFeatures[j], ranges);
  if (n < 4) return {groups: features.map((_, i) => [i]), stability: features.map(() => null), matrix};
  const weights = features.map(f => f.weight); const merges = linkage(matrix, weights);
  // Candidate cuts are the largest discontinuities in the actual dendrogram.
  const gaps = merges.slice(1).map((m, i) => ({k: n - i - 1, gap: m.height - merges[i].height})).filter(g => g.k > 1).sort((a, b) => b.gap - a.gap);
  const candidates = [1, ...gaps.slice(0, Math.ceil(Math.log2(n))).map(g => g.k)];
  // Reweight observed support once per replicate, then compare every candidate
  // cut against those same trees. Instability participates in selection itself.
  const random = seededRandom(42 + n);
  const bootstraps = Array.from({length: 8}, () => {
    const sampled = weights.map(w => {let product = 1; let count = 0; do {count++; product *= random();} while (product > Math.exp(-1)); return w * (count - 1 + 0.1);});
    return linkage(matrix, sampled);
  });
  const agreement = (groups: number[][]) => {
    const partitions = bootstraps.map(tree => cut(n, tree, groups.length).map(other => ({
      members: new Set(other), support: other.reduce((sum, i) => sum + weights[i], 0),
    })));
    return groups.map(group => {
      const support = group.reduce((sum, i) => sum + weights[i], 0);
      return partitions.reduce((total, partition) => total + Math.max(...partition.map(other => {
        const shared = group.filter(i => other.members.has(i)).reduce((sum, i) => sum + weights[i], 0);
        return shared / (support + other.support - shared);
      })), 0) / bootstraps.length;
    });
  };
  let groups = [features.map((_, i) => i)]; let stability: (number | null)[] = [1]; let score = 0;
  for (const k of candidates.filter(k => k > 1)) {
    const partition = cut(n, merges, k);
    const stable = agreement(partition);
    const meanStability = partition.reduce((sum, group, i) => sum + stable[i] * group.reduce((s, j) => s + weights[j], 0), 0) / weights.reduce((a, b) => a + b, 0);
    const value = silhouette(matrix, partition, weights) * meanStability - 0.05 * (k - 1) / Math.sqrt(n);
    if (value > score) {score = value; groups = partition; stability = stable;}
  }
  return {groups, stability, matrix};
}
