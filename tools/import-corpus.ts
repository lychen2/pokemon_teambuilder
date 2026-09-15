import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {BattleEngine} from '../packages/core/battle/engine';
import {importCorpus, PasteCache} from '../packages/core/sources/corpus';
const engineManifest = JSON.parse(await readFile('assets/engine.json', 'utf8'));
const translations = JSON.parse(await readFile('assets/translations.json', 'utf8'));
const engine = new BattleEngine(resolve('assets/engines', engineManifest.id), 'gen9championsvgc2026regmc', translations);
const sourceRegistry = JSON.parse(await readFile('assets/sources.json', 'utf8'));
const cache = new PasteCache(resolve('assets/raw'));
const oldCachePath = process.argv.find(a => a.startsWith('--seed-cache='))?.slice('--seed-cache='.length);
if (oldCachePath) {
  const cacheData = JSON.parse(await readFile(oldCachePath, 'utf8')) as Record<string, {text: string}>;
  for (const [url, record] of Object.entries(cacheData)) await cache.put(url, record.text);
  console.log(`导入 ${Object.keys(cacheData).length} 份已有公开 PokePaste 缓存；缺少的链接从原站获取。`);
}
const corpus = await importCorpus({sources: sourceRegistry.sources, engine, cache, progress: console.log});
await mkdir('assets', {recursive: true});
await writeFile('assets/corpus.json', JSON.stringify(corpus));
await writeFile('assets/dex.json', JSON.stringify(engine.dexData()));
console.log(JSON.stringify({observations: corpus.observations.length, reports: corpus.reports.map(r => ({...r, errors: r.errors.slice(0, 2)}))}, null, 2));
