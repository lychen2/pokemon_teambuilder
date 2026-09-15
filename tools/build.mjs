import {build} from 'esbuild';
import {build as viteBuild} from 'vite';
import {mkdir, copyFile, access} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {esbuildBinary} from './esbuild-runtime.mjs';
const require = createRequire(import.meta.url);
await access('assets/bootstrap.json');
await mkdir('assets/runtime', {recursive: true});
const nativeEsbuild = esbuildBinary();
await copyFile(nativeEsbuild.source, resolve('assets/runtime', nativeEsbuild.name));
// External rule compilation cannot read modules inside Electron's ASAR archive.
await build({entryPoints: [require.resolve('ts-chacha20')], outfile: 'assets/runtime/ts-chacha20.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node24'});
await build({entryPoints: {'main': 'apps/desktop/main/index.ts', preload: 'apps/desktop/main/preload.ts', service: 'apps/desktop/main/service.ts', 'compute-worker': 'apps/desktop/main/compute-worker.ts'}, outdir: 'dist', outExtension: {'.js': '.cjs'}, platform: 'node', target: 'node24', format: 'cjs', define: {'import.meta.url': '__filename'}, bundle: true, external: ['electron', 'esbuild', 'ts-chacha20'], sourcemap: true, logLevel: 'info'});
await viteBuild();
