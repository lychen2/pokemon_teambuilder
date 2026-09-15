import {test, expect} from '@playwright/test';
import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {launchDesktop} from './launch';

test('后台构筑期间搜索与编辑保持响应，记录输入到渲染反馈的延迟', async () => {
  const app = await launchDesktop(await mkdtemp(join(tmpdir(), 'poke-input-latency-')));
  try {
    const page = await app.firstWindow();
    const search = page.getByLabel('搜索宝可梦');
    await search.fill('大狃拉'); await search.press('Enter');
    await page.getByRole('button', {name: '加入', exact: true}).first().click();
    await page.getByRole('button', {name: '返回宝可梦'}).click();
    await search.fill('');
    await page.evaluate(() => {
      (window as any).__inputLatency = [];
      document.addEventListener('input', event => {
        const input = event.target as HTMLInputElement;
        const field = input.getAttribute('aria-label');
        if (!['搜索宝可梦', '队伍名称'].includes(field ?? '')) return;
        const start = performance.now(); const value = input.value;
        requestAnimationFrame(() => requestAnimationFrame(() => (window as any).__inputLatency.push({field, value, feedbackMs: performance.now() - start, trusted: event.isTrusted, valuePreserved: input.value === value})));
      }, {capture: true});
    });
    await page.getByRole('button', {name: '生成完整方案', exact: true}).first().click();
    await search.pressSequentially('incineroar', {delay: 60});
    await expect(search).toBeFocused();
    await expect(page.getByRole('option', {name: '选择炽焰咆哮虎的配置'})).toBeVisible();
    const name = page.getByLabel('队伍名称');
    await name.fill(''); await name.pressSequentially('Responsive team', {delay: 60});
    await expect(name).toBeFocused(); await expect(name).toHaveValue('Responsive team');
    await expect(page.locator('.proposal-card').first()).toBeVisible({timeout: 25000});
    const rows: {field: string; value: string; feedbackMs: number; trusted: boolean; valuePreserved: boolean}[] = await page.evaluate(() => (window as any).__inputLatency);
    expect(rows.filter(row => row.field === '搜索宝可梦')).toHaveLength(10);
    expect(rows.filter(row => row.field === '队伍名称')).toHaveLength(16);
    const times = rows.map(row => row.feedbackMs).sort((a, b) => a - b);
    await writeFile('.local/input-latency.json', JSON.stringify({createdAt: new Date().toISOString(), samples: rows.length, medianMs: times[Math.floor(times.length * .5)], p95Ms: times[Math.ceil(times.length * .95) - 1], maxMs: times.at(-1), rows,
      method: 'Electron X11 自动键盘输入；从 input 事件到第二次 requestAnimationFrame 的反馈延迟。计算线程同时进行完整构筑搜索。',
      limits: '测量应用事件到渲染反馈的代理指标，不是物理按键到屏幕显示的硬件延迟。中文输入法另行验证。'}, null, 2));
  } finally {await app.close();}
});
