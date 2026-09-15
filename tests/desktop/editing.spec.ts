import {launchDesktop} from './launch';
import {test, expect} from '@playwright/test';
import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import type {BootstrapData} from '../../packages/core/types';

test('导入满队、配点错误与预览、伤害条件、模拟期间编辑和取消', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'poke-edit-ui-'));
  const app = await launchDesktop(directory);
  let closed = false;
  try {
    const page = await app.firstWindow();
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const bootstrap: BootstrapData = JSON.parse(await readFile('assets/bootstrap.json', 'utf8'));
    const raw = bootstrap.corpus.teams.find(t => t.url.includes('73e5d6533b781089'))!.raw;
    await page.getByRole('button', {name: '导入', exact: true}).click();
    await page.getByLabel('Showdown 队伍文本').fill(raw);
    await page.getByRole('button', {name: '解析队伍'}).click();
    await page.getByRole('button', {name: '开始构筑'}).click();
    await expect(page.getByTestId('team-member')).toHaveCount(6);
    await page.getByRole('button', {name: '编辑大狃拉', exact: true}).click();
    await page.getByRole('button', {name: '按目标优化配点'}).click();
    await page.getByRole('button', {name: '输入速度值', exact: true}).click();
    await page.getByLabel('对手的对局速度').fill('999');
    await page.getByRole('button', {name: '搜索阈值配点'}).click();
    await expect(page.getByRole('alert')).toContainText('当前条件下无法达到目标');
    await expect(page.getByRole('alert')).toContainText('目标范围内最有利的分配');
    await page.getByLabel('对手的对局速度').fill('170');
    await page.getByRole('button', {name: '搜索阈值配点'}).click();
    await expect(page.getByRole('dialog')).toContainText('对局速度超过 170');
    await page.getByRole('button', {name: '采用这份配点'}).click();
    await page.getByRole('button', {name: '应用修改'}).click();
    await expect(page.getByTestId('team-member')).toHaveCount(6);
    await page.getByRole('tab', {name: '困难对局'}).click();
    await page.locator('.threat-row').first().click();
    await expect(page.locator('.damage-card')).toHaveCount(4);
    await page.getByLabel('对手使用守住', {exact: true}).check();
    await expect(page.locator('.damage-numbers').first()).toContainText('0.0');
    await page.getByRole('dialog').getByRole('button', {name: '关闭', exact: true}).click();
    await page.getByRole('tab', {name: '深入评估'}).click();
    await page.getByRole('button', {name: '开始深入评估'}).click();
    await expect(page.getByRole('button', {name: '取消任务', exact: true})).toBeVisible();
    await page.getByLabel('队伍名称').fill('模拟仍在后台，界面可以编辑');
    await expect(page.getByLabel('队伍名称')).toHaveValue('模拟仍在后台，界面可以编辑');
    await page.getByRole('button', {name: '取消任务', exact: true}).click();
    await expect(page.locator('.job-status.cancelled')).toBeVisible();
    expect(errors).toEqual([]);
    await page.screenshot({path: 'test-results/editing-and-simulation.png'});
    // Close immediately, inside the save debounce window, through the actual native close.
    await page.getByLabel('队伍名称').fill('关闭前最后一次修改');
    await app.close(); closed = true;
    const restarted = await launchDesktop(directory);
    try {await expect((await restarted.firstWindow()).getByLabel('队伍名称')).toHaveValue('关闭前最后一次修改');} finally {await restarted.close();}
  } finally {if (!closed) await app.close();}
});
