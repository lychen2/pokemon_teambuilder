import {createHash, randomUUID} from 'node:crypto';
import {STAT_KEYS, type PokemonSet, type Stats, type TeamDraft, type TeamMember, type Proposal, type LockField} from './types';
import {advanceDraft} from './revisions';
export const ALGORITHM_VERSION = 'mc-1.6.0';
export function draftHash(draft: TeamDraft): string {return hash([draft.id, draft.environmentId, draft.members.map(m => [m.id, setKey(m.set), m.lock])]);}
export const toID = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');
export const zeros = (): Stats => ({hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0});
export function hash(value: unknown): string {return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex').slice(0, 20);}
export function setKey(set: PokemonSet): string {
  return [set.speciesId, set.itemId ?? '?', set.abilityId ?? '?', set.natureId ?? '?', set.points ? STAT_KEYS.map(s => set.points![s]).join(',') : '?', [...set.moves].sort().join(','), set.gender ?? '', set.level].join('|');
}
export function teamKey(sets: PokemonSet[]): string {return hash(sets.map(setKey).sort());}
export function complete(set: PokemonSet): boolean {return set.points !== null && set.natureId !== null && set.abilityId !== null && set.itemId !== null && set.moves.length === 4;}
export function member(set: PokemonSet): TeamMember {return {id: randomUUID(), set: structuredClone(set), lock: {species: false, fields: []}};}
export function createDraft(environmentId: string, name = '未命名队伍'): TeamDraft {
  return {id: randomUUID(), name, revision: 0, analysisRevision: 0, environmentId, members: [], notes: '', updatedAt: new Date().toISOString()};
}
export function sameField(a: PokemonSet, b: PokemonSet, field: LockField): boolean {
  if (field === 'moves') return [...a.moves].sort().join(',') === [...b.moves].sort().join(',');
  if (field === 'points') return a.points === null || b.points === null ? a.points === b.points : STAT_KEYS.every(s => a.points![s] === b.points![s]);
  return a[field] === b[field];
}
export function respectsLock(original: TeamMember, replacement: TeamMember | undefined): boolean {
  if (!replacement) return !original.lock.species && !original.lock.fields.length;
  if (original.lock.species && original.set.speciesId !== replacement.set.speciesId) return false;
  return original.lock.fields.every(field => sameField(original.set, replacement.set, field));
}
export function applyProposal(draft: TeamDraft, proposal: Proposal, corpusVersion: string, modelVersion: string): TeamDraft {
  if (draft.id !== proposal.draftId || draftHash(draft) !== proposal.inputHash || draft.analysisRevision !== proposal.baseRevision || draft.environmentId !== proposal.environmentId || corpusVersion !== proposal.corpusVersion || modelVersion !== proposal.modelVersion || proposal.algorithmVersion !== ALGORITHM_VERSION) {
    throw new Error('队伍、环境或样本已改变，请重新计算这条建议。');
  }
  for (const old of draft.members) {
    if (!respectsLock(old, proposal.members.find(m => m.id === old.id))) throw new Error('建议修改了已锁定的内容。');
  }
  return advanceDraft(draft, {...draft, members: structuredClone(proposal.members)});
}
export function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  return items.flatMap((item, i) => combinations(items.slice(i + 1), size - 1).map(rest => [item, ...rest]));
}
export function seededRandom(seed: number): () => number {
  let n = seed >>> 0;
  return () => {n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296;};
}
export function sample<T>(items: T[], weights: number[], random: () => number): T {
  if (!items.length || items.length !== weights.length) throw new Error('无法从空配置分布中采样。');
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) throw new Error('配置分布没有正概率。');
  let target = random() * total;
  for (let i = 0; i < items.length; i++) {target -= weights[i]; if (target <= 0) return items[i];}
  return items.at(-1)!;
}
