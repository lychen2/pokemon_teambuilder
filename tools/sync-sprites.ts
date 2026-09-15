import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parse} from 'csv-parse/sync';
import type {BootstrapData} from '../packages/core/types';

// Pinned sources make artwork updates independent from combat rules and reproducible offline.
const sources = {
  primary: {repository: 'PokeAPI/sprites', revision: '2ecb4eeacd5a1718621fc30f12772e3f60d830b9', branch: 'master'},
  names: {repository: 'PokeAPI/pokeapi', revision: '4b82c204ddd19ecb8eda2ea044ccb59e222b721c', branch: 'master'},
  patterns: {repository: 'KevinToodlepoot/pokemon-champions-sprites', revision: '65f3c0d7434ef9206ddda61856d8938b82cfc710', branch: 'main'},
};
const aliases: Record<string, string> = {
  taurospaldeacombat: 'tauros-paldea-combat-breed', taurospaldeablaze: 'tauros-paldea-blaze-breed', taurospaldeaaqua: 'tauros-paldea-aqua-breed',
  pyroar: 'pyroar-male', meowstic: 'meowstic-male', meowsticf: 'meowstic-female', meowsticmmega: 'meowstic-male-mega', meowsticfmega: 'meowstic-female-mega',
  aegislash: 'aegislash-shield', gourgeist: 'gourgeist-average', lycanroc: 'lycanroc-midday', mimikyu: 'mimikyu-disguised', toxtricity: 'toxtricity-amped',
  indeedee: 'indeedee-male', indeedeef: 'indeedee-female', morpeko: 'morpeko-full-belly', basculegion: 'basculegion-male', basculegionf: 'basculegion-female',
  maushold: 'maushold-family-of-three', mausholdfour: 'maushold-family-of-four', squawkabilly: 'squawkabilly-green-plumage', squawkabillyblue: 'squawkabilly-blue-plumage',
  squawkabillyyellow: 'squawkabilly-yellow-plumage', squawkabillywhite: 'squawkabilly-white-plumage', palafin: 'palafin-zero',
};
// These forms differ by a mark on the underside; the published front artwork is shared.
const sharedFronts: Record<string, {speciesId: string; reason: string}> = {
  polteageistantique: {speciesId: 'polteageist', reason: '真货区别是底部印记；公开的正面 Champions 素材相同'},
  sinistchamasterpiece: {speciesId: 'sinistcha', reason: '杰作区别是底部印记；公开的正面 Champions 素材相同'},
};
const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
const raw = (source: typeof sources.primary, path: string) => `https://raw.githubusercontent.com/${source.repository}/${source.revision}/${path}`;
async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, {headers: {'User-Agent': 'PokeTeambuilder-artwork-sync'}, signal: AbortSignal.timeout(30_000)});
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
async function json(url: string): Promise<any> {return JSON.parse((await download(url)).toString('utf8'));}
if (process.argv.includes('--latest')) for (const source of Object.values(sources)) source.revision = (await json(`https://api.github.com/repos/${source.repository}/commits/${source.branch}`)).sha;
const bootstrap: BootstrapData = JSON.parse(await readFile('assets/bootstrap.json', 'utf8'));
const primaryPath = 'sprites/pokemon/versions/generation-ix/champions';
const [listing, patterns, nameText] = await Promise.all([
  json(`https://api.github.com/repos/${sources.primary.repository}/contents/${primaryPath}?ref=${sources.primary.revision}`),
  json(`https://api.github.com/repos/${sources.patterns.repository}/git/trees/${sources.patterns.revision}?recursive=1`),
  download(raw(sources.names, 'data/v2/csv/pokemon.csv')),
]);
if (!Array.isArray(listing) || patterns.truncated || !Array.isArray(patterns.tree)) throw new Error('上游素材目录不完整，未安装不完整索引。');
const pokemon = new Map<string, {id: string; identifier: string}>((parse(nameText, {columns: true}) as {id: string; identifier: string}[]).map(row => [normalize(row.identifier), row]));
const primaryFiles = new Map<string, {path: string; sha: string}>(listing.filter(row => row.type === 'file').map(row => [row.name, row]));
const patternFiles = new Map<string, {path: string; sha: string}>(patterns.tree.filter((row: any) => row.type === 'blob' && /^sprites\/.+\.png$/.test(row.path)).map((row: any) => [normalize(row.path.slice(8, -4)), row]));
const targets = [...bootstrap.dex.species.map(row => ({id: row.id, name: row.name})), ...bootstrap.dex.species.flatMap(row => row.megaForms.map(mega => ({id: mega.speciesId, name: mega.name}))), {id: 'pyroarfemale', name: 'Pyroar-Female'}];
const requests = targets.map(target => {
  const id = sharedFronts[target.id]?.speciesId ?? target.id;
  const name = pokemon.get(normalize(aliases[id] ?? id));
  const primary = name && primaryFiles.get(name.id + '.png');
  const pattern = patternFiles.get(id);
  if (!primary && !pattern) throw new Error(`缺少 ${target.name}（${target.id}）的 Champions 素材；需要补充形态映射或上游图片，未用基础物种替代。`);
  const source = primary ? sources.primary : sources.patterns;
  const file = (primary ?? pattern)!;
  return {...target, source: source.repository, revision: source.revision, path: file.path, gitBlob: file.sha, url: raw(source, file.path), sourceName: primary ? name!.identifier : file.path.slice(8, -4), sharedFront: sharedFronts[target.id]?.reason};
});
await mkdir('assets/pokemon/images', {recursive: true});
const entries: Record<string, {file: string; width: number; height: number; sha256: string; source: string; revision: string; path: string; url: string; sourceName: string; name: string; sharedFront?: string}> = {};
for (let index = 0; index < requests.length; index += 8) {
  await Promise.all(requests.slice(index, index + 8).map(async row => {
    const png = await download(row.url);
    if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`${row.url} 不是 PNG。`);
    const blob = createHash('sha1').update(Buffer.from(`blob ${png.length}\0`)).update(png).digest('hex');
    if (blob !== row.gitBlob) throw new Error(`${row.url} 内容与固定提交不一致。`);
    const width = png.readUInt32BE(16); const height = png.readUInt32BE(20);
    if (width < 120 || height < 120) throw new Error(`${row.name} 的源图只有 ${width}×${height}，不符合本次素材要求。`);
    const sha256 = createHash('sha256').update(png).digest('hex'); const file = `${sha256.slice(0, 20)}.png`;
    await writeFile(`assets/pokemon/images/${file}`, png);
    const {id, gitBlob, ...record} = row;
    entries[id] = {...record, file, width, height, sha256};
  }));
  console.log(`Champions 素材 ${Math.min(index + 8, requests.length)}/${requests.length}`);
}
for (const [male, female] of [['indeedee', 'indeedeef'], ['meowstic', 'meowsticf'], ['basculegion', 'basculegionf']]) if (entries[male] && entries[female] && entries[male].file === entries[female].file) throw new Error(`${male}/${female} 的雌雄形态错误地共用了图片。`);
const sortedEntries = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
const manifest = {version: createHash('sha256').update(JSON.stringify([sources, sortedEntries])).digest('hex').slice(0, 20), createdAt: new Date().toISOString(), environmentId: bootstrap.environment.id, sources, entries: sortedEntries};
await writeFile('assets/pokemon/manifest.json.tmp', JSON.stringify(manifest, null, 2));
await rename('assets/pokemon/manifest.json.tmp', 'assets/pokemon/manifest.json');
console.log(JSON.stringify({forms: Object.keys(entries).length, files: new Set(Object.values(entries).map(row => row.file)).size, version: manifest.version}));
