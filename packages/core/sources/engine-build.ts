import {mkdir, readFile, writeFile, readdir, mkdtemp, rm, cp, access, rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import type {EngineManifest} from '../types';

const execute = promisify(execFile);
const require = createRequire(typeof __filename !== 'undefined' ? __filename : import.meta.url);
export const INITIAL_SHOWDOWN = 'aa17ca0fac8bc5605df673bd8774c2d0e91efa43';
export const INITIAL_CALC = 'e7fd7e59f3eef7ea42fba3c8b83261cb4a14109d';
export type Progress = (message: string) => void;

export async function getRevision(repository: 'pokemon-showdown' | 'damage-calc', signal?: AbortSignal): Promise<string> {
  const response = await fetch(`https://api.github.com/repos/smogon/${repository}/commits/master`, {headers: {'User-Agent': 'Poke-Teambuilder/0.1'}, signal});
  if (!response.ok) throw new Error(`GitHub ${repository}: HTTP ${response.status}`);
  const data = await response.json() as {sha?: string};
  if (!data.sha || !/^[a-f0-9]{40}$/.test(data.sha)) throw new Error('GitHub 没有返回合法的提交版本。');
  return data.sha;
}

async function download(repository: string, revision: string, root: string, signal?: AbortSignal): Promise<string> {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('引擎版本必须是完整的 Git 提交哈希。');
  const response = await fetch(`https://codeload.github.com/smogon/${repository}/tar.gz/${revision}`, {signal});
  if (!response.ok) throw new Error(`下载 ${repository} 失败：HTTP ${response.status}`);
  const archive = join(root, `${repository}.tar.gz`);
  await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  const folder = join(root, repository);
  await mkdir(folder);
  await execute('tar', ['-xzf', archive, '-C', folder, '--strip-components=1']);
  return folder;
}

async function sourceFiles(root: string, directory: string): Promise<string[]> {
  const base = join(root, directory);
  const entries = await readdir(base, {withFileTypes: true});
  const result: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) result.push(...await sourceFiles(root, join(directory, entry.name)));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) result.push(join(base, entry.name));
  }
  return result;
}

async function digestSources(root: string): Promise<string> {
  const digest = createHash('sha256');
  for (const dir of ['sim', 'lib', 'data', 'config']) {
    const paths = (await sourceFiles(root, dir)).sort();
    for (const path of paths) {digest.update(path.slice(root.length)); digest.update(await readFile(path));}
  }
  return digest.digest('hex');
}

export interface EngineBuildOptions {
  enginesDirectory: string;
  showdownRevision: string;
  calcRevision: string;
  localPath?: string;
  reuseCalc?: {directory: string; revision: string};
  runtimeDirectory?: string;
  progress?: Progress;
  signal?: AbortSignal;
}

export async function buildEngine(options: EngineBuildOptions): Promise<EngineManifest> {
  const progress = options.progress ?? (() => {});
  await mkdir(options.enginesDirectory, {recursive: true});
  const staging = await mkdtemp(join(options.enginesDirectory, '.building-'));
  try {
    progress(options.localPath ? '读取本地 Showdown 文件' : '下载固定版本的 Showdown');
    const showdown = options.localPath ? resolve(options.localPath) : await download('pokemon-showdown', options.showdownRevision, staging, options.signal);
    await access(join(showdown, 'sim', 'dex.ts'));
    await access(join(showdown, 'config', 'formats.ts'));
    const sourceHash = await digestSources(showdown);
    const id = `${sourceHash.slice(0, 12)}-${options.calcRevision.slice(0, 12)}`;
    const destination = join(options.enginesDirectory, id);
    try {return JSON.parse(await readFile(join(destination, 'manifest.json'), 'utf8')) as EngineManifest;}
    catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;}
    const reusedCalc = options.reuseCalc?.revision === options.calcRevision ? options.reuseCalc.directory : null;
    progress(reusedCalc ? '复用已验证版本的 Champions 伤害库' : '下载固定版本的 Champions 伤害库');
    const calc = reusedCalc ? null : await download('damage-calc', options.calcRevision, staging, options.signal);
    options.signal?.throwIfAborted();
    const out = join(staging, 'compiled');
    const psOut = join(out, 'showdown');
    await mkdir(psOut, {recursive: true});
    const entries: string[] = [];
    for (const directory of ['sim', 'lib', 'data', 'config']) entries.push(...await sourceFiles(showdown, directory));
    progress(`编译 ${entries.length} 个规则与战斗模块`);
    await build({entryPoints: entries, outbase: showdown, outdir: join(psOut, 'dist'), platform: 'node', format: 'cjs', target: 'node24', logLevel: 'silent'});
    await mkdir(join(psOut, 'config'), {recursive: true});
    await cp(join(showdown, 'config', 'config-example.js'), join(psOut, 'config', 'config.js'));
    await writeFile(join(psOut, 'package.json'), JSON.stringify({type: 'commonjs', main: 'dist/sim/index.js'}));
    const chachaOutput = join(psOut, 'node_modules/ts-chacha20/index.js');
    if (options.runtimeDirectory) {
      await mkdir(join(psOut, 'node_modules/ts-chacha20'), {recursive: true});
      await cp(join(options.runtimeDirectory, 'ts-chacha20.cjs'), chachaOutput);
    } else await build({entryPoints: [require.resolve('ts-chacha20')], outfile: chachaOutput, bundle: true, platform: 'node', format: 'cjs', target: 'node24', logLevel: 'silent'});
    if (calc) await build({entryPoints: [join(calc, 'calc/src/index.ts')], outfile: join(out, 'calc.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node24', logLevel: 'silent'});
    else await cp(join(reusedCalc!, 'calc.cjs'), join(out, 'calc.cjs'));
    await cp(join(showdown, 'LICENSE'), join(out, 'SHOWDOWN-LICENSE'));
    await cp(calc ? join(calc, 'LICENSE') : join(reusedCalc!, 'CALC-LICENSE'), join(out, 'CALC-LICENSE'));
    const manifest: EngineManifest = {
      id, showdownRevision: options.localPath ? `local:${sourceHash}` : options.showdownRevision,
      calcRevision: options.calcRevision, source: options.localPath ? 'local' : 'official', builtAt: new Date().toISOString(),
      hashes: {showdown: sourceHash, calc: createHash('sha256').update(await readFile(join(out, 'calc.cjs'))).digest('hex')},
    };
    await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
    options.signal?.throwIfAborted();
    await mkdir(options.enginesDirectory, {recursive: true});
    await rename(out, destination);
    progress('引擎已编译，等待规则与计算校验');
    return manifest;
  } finally {await rm(staging, {recursive: true, force: true});}
}
