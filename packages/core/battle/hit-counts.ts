/** Champions' 2–5 hit distribution, conditional on connecting all accuracy checks. */
export function hitCounts(multihit: number | [number, number] | undefined, ability: string, item: string, requested?: number): {hits: number; probability: number}[] {
  if (!multihit) return [{hits: 1, probability: 1}];
  const [min, max] = Array.isArray(multihit) ? multihit : [multihit, multihit];
  if (requested !== undefined) {
    if (!Number.isInteger(requested) || requested < 1 || requested > max || Array.isArray(multihit) && requested < min) throw new Error(`该招式连击次数应为 ${min}–${max}。`);
    return [{hits: requested, probability: 1}];
  }
  if (ability === 'Skill Link') return [{hits: max, probability: 1}];
  if (min === 2 && max === 5) return item === 'Loaded Dice' ? [{hits: 4, probability: 0.5}, {hits: 5, probability: 0.5}] : [2, 3, 4, 5].map((hits, i) => ({hits, probability: [0.35, 0.35, 0.15, 0.15][i]}));
  if (max === 10 && item === 'Loaded Dice') return Array.from({length: 7}, (_, i) => ({hits: i + 4, probability: 1 / 7}));
  return Array.from({length: max - min + 1}, (_, i) => ({hits: min + i, probability: 1 / (max - min + 1)}));
}
