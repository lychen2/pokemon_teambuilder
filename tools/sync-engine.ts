import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {buildEngine, getRevision, INITIAL_CALC, INITIAL_SHOWDOWN} from '../packages/core/sources/engine-build';
import type {EngineManifest} from '../packages/core/types';
const {values} = parseArgs({options: {latest: {type: 'boolean'}, local: {type: 'string'}}});
const installed: EngineManifest | null = existsSync('assets/engine.json') ? JSON.parse(await readFile('assets/engine.json', 'utf8')) : null;
const revisions = values.latest ? await Promise.all([getRevision('pokemon-showdown'), getRevision('damage-calc')]) : [INITIAL_SHOWDOWN, values.local && installed ? installed.calcRevision : INITIAL_CALC];
const manifest = await buildEngine({
  enginesDirectory: resolve('assets/engines'),
  showdownRevision: revisions[0], calcRevision: revisions[1],
  reuseCalc: installed && existsSync(resolve('assets/engines', installed.id, 'manifest.json')) ? {directory: resolve('assets/engines', installed.id), revision: installed.calcRevision} : undefined,
  localPath: values.local, progress: console.log,
});
await mkdir('assets', {recursive: true});
await writeFile('assets/engine.json', JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
