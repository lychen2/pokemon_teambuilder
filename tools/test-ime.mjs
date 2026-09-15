import {mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';

if (!process.env.DISPLAY || !process.env.DBUS_SESSION_BUS_ADDRESS) throw new Error('请在独立 Xvfb 与 dbus-run-session 中运行此验收。');
const directory = await mkdtemp(join(tmpdir(), 'poke-fcitx-'));
const config = join(directory, 'config'); const data = join(directory, 'data'); const cache = join(directory, 'cache');
await mkdir(join(config, 'fcitx5'), {recursive: true}); await mkdir(join(data, 'fcitx5/rime'), {recursive: true}); await mkdir(cache);
await writeFile(join(config, 'fcitx5/profile'), '[Groups/0]\nName=Test\nDefault Layout=us\nDefaultIM=rime\n\n[Groups/0/Items/0]\nName=keyboard-us\nLayout=\n\n[Groups/0/Items/1]\nName=rime\nLayout=\n\n[GroupOrder]\n0=Test\n');
await writeFile(join(data, 'fcitx5/rime/default.custom.yaml'), 'patch:\n  schema_list:\n    - schema: luna_pinyin_simp\n');
await writeFile(join(data, 'fcitx5/rime/luna_pinyin_simp.custom.yaml'), 'patch:\n  switches/@0/reset: 0\n');
const env = {...process.env, XDG_CONFIG_HOME: config, XDG_DATA_HOME: data, XDG_CACHE_HOME: cache, XDG_SESSION_TYPE: 'x11', GTK_IM_MODULE: 'fcitx', QT_IM_MODULE: 'fcitx', XMODIFIERS: '@im=fcitx', POKE_REAL_IME: '1'};
delete env.WAYLAND_DISPLAY;
const run = promisify(execFile);
const rimeDirectory = join(data, 'fcitx5/rime');
const deployment = await run('rime_deployer', ['--build', rimeDirectory, '/usr/share/rime-data', join(rimeDirectory, 'build')], {env});
await writeFile('.local/rime-deploy.log', deployment.stdout + deployment.stderr);
await run('rime_deployer', ['--set-active-schema', 'luna_pinyin_simp'], {env, cwd: rimeDirectory});
const log = createWriteStream('.local/fcitx-ime.log');
const fcitx = spawn('fcitx5', ['-D'], {env, stdio: ['ignore', 'pipe', 'pipe']}); fcitx.stdout.pipe(log); fcitx.stderr.pipe(log);
fcitx.on('error', error => {throw error;});
try {
  const test = spawn('pnpm', ['exec', 'playwright', 'test', 'tests/desktop/ime.spec.ts'], {env, stdio: 'inherit'});
  process.exitCode = await new Promise((resolve, reject) => {test.on('error', reject); test.on('close', code => resolve(code ?? 1));});
} finally {fcitx.kill('SIGTERM'); log.end();}
