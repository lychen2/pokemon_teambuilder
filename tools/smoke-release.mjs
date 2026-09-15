import {_electron as electron, expect} from '@playwright/test';
import {mkdtemp, readFile, writeFile, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const {version} = JSON.parse(await readFile('package.json', 'utf8'));
const executable = resolve(process.env.POKE_EXECUTABLE || `release/${version}/linux-unpacked/sixfold`);
const directory = await mkdtemp(join(tmpdir(), `poke-native-${version}-`));
const env = {...process.env, POKE_DATA: directory};
delete env.POKE_TEST;
delete env.POKE_DEV_URL;
const errors = [];
const started = performance.now();
const app = await electron.launch({executablePath: executable, args: [], env, timeout: 20000});
try {
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByRole('button', {name: '选择我的核心', exact: true})).toBeVisible({timeout: 20000});
  const readyMs = performance.now() - started;
  const viewport = await page.evaluate(() => ({width: window.innerWidth, height: window.innerHeight}));
  const runtime = await app.evaluate(({app, BrowserWindow}) => ({
    version: app.getVersion(), packaged: app.isPackaged, dataDirectory: app.getPath('userData'),
    windowVisible: BrowserWindow.getAllWindows().some(window => window.isVisible()),
    testMode: Boolean(process.env.POKE_TEST), gpuDisabled: app.commandLine.hasSwitch('disable-gpu'),
    ozonePlatform: app.commandLine.getSwitchValue('ozone-platform'), gpu: app.getGPUFeatureStatus(),
  }));
  expect(runtime.version).toBe(version);
  expect(runtime.packaged).toBe(true);
  expect(runtime.dataDirectory).toBe(directory);
  expect(runtime.windowVisible).toBe(true);
  expect(runtime.testMode).toBe(false);
  expect(runtime.gpuDisabled).toBe(false);
  console.log(JSON.stringify({readyMs, viewport, runtime}, null, 2));
  await page.getByLabel('队伍名称').fill('大狃拉 · 核心构筑');
  await page.getByRole('button', {name: '选择我的核心', exact: true}).click();
  await page.getByRole('combobox', {name: '搜索宝可梦'}).fill('大狃拉');
  await page.getByRole('option', {name: '选择大狃拉的配置'}).click();
  await page.getByRole('button', {name: '加入', exact: true}).first().click();
  await page.getByRole('button', {name: '锁定大狃拉核心', exact: true}).click();
  const completeStarted = performance.now();
  await page.getByRole('button', {name: '生成完整方案', exact: true}).first().click();
  if (viewport.width <= 1000) await page.getByRole('button', {name: /^构筑推荐/}).click();
  await expect(page.locator('.proposal-card:visible').first()).toBeVisible({timeout: 25000});
  const completeMs = performance.now() - completeStarted;
  await page.locator('.proposal-card:visible').first().getByRole('button', {name: '比较并应用'}).click();
  await page.getByRole('button', {name: '应用这个方案'}).click();
  await expect(page.getByTestId('team-member')).toHaveCount(6);
  await expect(page.getByText('快速对照', {exact: true})).toBeVisible({timeout: 15000});
  await expect(page.locator('.stale-result')).toHaveCount(0);
  await mkdir('docs/reports/screenshots', {recursive: true});
  const capture = await app.evaluate(async ({BrowserWindow}) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.focus();
    const image = await window.webContents.capturePage();
    return {size: image.getSize(), png: image.toPNG().toString('base64')};
  });
  expect(capture.size.width).toBeGreaterThan(0);
  await writeFile(`docs/reports/screenshots/workspace-native-${version}.png`, Buffer.from(capture.png, 'base64'));
  const replacementStarted = performance.now();
  await page.getByRole('button', {name: '寻找改进方案', exact: true}).click();
  if (viewport.width <= 1000) await page.getByRole('button', {name: /^构筑推荐/}).click();
  await expect(page.locator('.proposal-card:not(.stale):visible').first()).toBeVisible({timeout: 60000});
  const replaceMs = performance.now() - replacementStarted;
  if (viewport.width <= 1000) await page.getByRole('dialog').getByRole('button', {name: '关闭', exact: true}).click();
  await expect(page.locator('.save-status')).toHaveText('已自动保存');
  expect(errors).toEqual([]);
  const report = {createdAt: new Date().toISOString(), executable, desktop: process.env.XDG_CURRENT_DESKTOP,
    sessionType: process.env.XDG_SESSION_TYPE, readyMs, viewport, runtime, rendererErrors: errors,
    searchTimings: {completeMs, replaceMs, completeWithinThreeSeconds: completeMs <= 3000, replaceWithinThreeSeconds: replaceMs <= 3000},
    checks: ['visible packaged window', 'isolated data directory', 'search', 'core lock', 'complete team', 'current analysis', 'replacement proposals', 'autosave'],
    limits: '普通桌面会话启动并操作，无 POKE_TEST 或禁用 GPU 参数；整队改进最多等待60秒，仅检查功能完成，实际耗时与三秒目标分别记录。自动操作不等同于物理设备与人工读屏验收。'};
  await writeFile(`docs/reports/native-startup-${version}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await app.close();
}
