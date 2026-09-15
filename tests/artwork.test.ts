import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {bootstrap} from './fixtures';
import manifest from '../assets/pokemon/manifest.json';

test('当前规则的全部初始与 Mega 形态都有经校验的 Champions 原图', () => {
  expect(manifest.version).toBe(createHash('sha256').update(JSON.stringify([manifest.sources, manifest.entries])).digest('hex').slice(0, 20));
  const entries = manifest.entries as Record<string, {file: string; width: number; height: number; sha256: string; sourceName: string}>;
  const required = bootstrap.dex.species.flatMap(species => [species.id, ...species.megaForms.map(form => form.speciesId)]);
  for (const id of required) {
    const entry = entries[id]; expect(entry, id).toBeDefined();
    const png = readFileSync(`assets/pokemon/images/${entry.file}`);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(entry.width); expect(png.readUInt32BE(20)).toBe(entry.height);
    expect(Math.min(entry.width, entry.height)).toBeGreaterThanOrEqual(120);
    expect(createHash('sha256').update(png).digest('hex')).toBe(entry.sha256);
  }
});

test('雌雄、地区、Mega 和家庭数量分别对应其完整形态，不能共用全国图鉴编号', () => {
  for (const [male, female] of [['indeedee', 'indeedeef'], ['meowstic', 'meowsticf'], ['basculegion', 'basculegionf']] as const) {
    expect(manifest.entries[male].sourceName).toContain('male');
    expect(manifest.entries[female].sourceName).toContain('female');
    expect(manifest.entries[male].file).not.toBe(manifest.entries[female].file);
  }
  expect(manifest.entries.indeedeef.path.endsWith('/10186.png')).toBe(true);
  for (const [a, b] of [['charizardmegax', 'charizardmegay'], ['raichu', 'raichualola'], ['maushold', 'mausholdfour'], ['pyroar', 'pyroarfemale']] as const) expect(manifest.entries[a].file).not.toBe(manifest.entries[b].file);
});
