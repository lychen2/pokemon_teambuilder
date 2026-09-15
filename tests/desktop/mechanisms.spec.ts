import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {launchDesktop} from './launch';

test('常用机制分组检索，具体配置和历史开关保持机制筛选', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'poke-mechanisms-ui-'));
  const app = await launchDesktop(directory);
  try {
    const page = await app.firstWindow();
    await page.getByLabel('筛选功能', {exact: true}).click();
    await expect(page.getByLabel('机制类别').locator('option')).toHaveCount(8);
    await expect(page.getByRole('button', {name: /^顺风/})).toBeVisible();
    await expect(page.getByRole('button', {name: /^轻装/})).toBeHidden();
    await page.getByLabel('机制类别').selectOption('protection');
    await expect(page.getByRole('button', {name: /^反射壁与光墙/})).toBeVisible();
    await page.getByRole('button', {name: /^广域防守/}).click();
    await page.getByLabel('筛选功能', {exact: true}).click();
    await expect(page.locator('.active-mechanism')).toContainText('广域防守');
    await page.getByLabel('搜索宝可梦').fill('Pelipper'); await page.getByLabel('搜索宝可梦').press('Enter');
    await expect(page.locator('.mechanism-selection')).toContainText('广域防守');
    await expect(page.locator('.configuration-card').first()).toBeVisible();
    for (const moves of await page.locator('.configuration-card .move-tags').allTextContents()) expect(moves).toContain('广域防守');
    await page.getByRole('button', {name: '真实配置', exact: true}).click();
    await page.getByLabel('包括历史合法配置').check();
    const state = await page.evaluate(() => window.poke.call('bootstrap', undefined));
    for (const id of await page.locator('.configuration-card').evaluateAll(cards => cards.map(card => card.getAttribute('data-configuration-id')))) {
      expect(state.configurations.find(c => c.id === id)!.set.moves).toContain('wideguard');
    }
    const selected = await page.locator('.configuration-card').first().getAttribute('data-configuration-id');
    await page.locator('.configuration-card').first().getByRole('button', {name: '加入', exact: true}).click();
    await expect(page.getByText('已自动保存', {exact: true})).toBeVisible();
    const saved = (await page.evaluate(() => window.poke.call('bootstrap', undefined))).drafts.find(draft => draft.members.length === 1)!;
    expect(saved.members[0].set).toEqual(state.configurations.find(c => c.id === selected)!.set);
    await page.screenshot({path: 'test-results/mechanism-configuration.png'});
  } finally {await app.close();}
});

test('晴天筛选保留正确 Mega 石，条件特性可单独检索且不会丢失输入焦点', async () => {
  const app = await launchDesktop(await mkdtemp(join(tmpdir(), 'poke-mega-filter-ui-')));
  try {
    const page = await app.firstWindow();
    await page.getByLabel('筛选功能', {exact: true}).click();
    await page.getByLabel('机制类别').selectOption('weather');
    await page.getByRole('button', {name: /^晴天/}).click();
    await page.getByLabel('搜索宝可梦').fill('喷火龙'); await page.getByLabel('搜索宝可梦').press('Enter');
    await page.getByRole('button', {name: '真实配置', exact: true}).click();
    await expect(page.locator('.mechanism-match').first()).toContainText('仅 Mega 后获得');
    const state = await page.evaluate(() => window.poke.call('bootstrap', undefined));
    const ids = await page.locator('.configuration-card').evaluateAll(cards => cards.map(card => card.getAttribute('data-configuration-id')));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(state.configurations.find(c => c.id === id)!.set.itemId).toBe('charizarditey');
    await page.getByRole('button', {name: '返回宝可梦'}).click();
    await page.getByLabel('清除机制筛选').click(); await page.getByLabel('清空搜索').click();
    const filter = page.getByLabel('查找机制'); await filter.fill('Unburden');
    await filter.dispatchEvent('keydown', {key: 'Enter', code: 'Enter', isComposing: true});
    await expect(filter).toBeFocused();
    await expect(page.getByRole('button', {name: /^轻装/})).toBeVisible();
    await page.getByRole('button', {name: /^轻装/}).click();
    await page.getByLabel('搜索宝可梦').fill('大狃拉'); await page.getByLabel('搜索宝可梦').press('Enter');
    await expect(page.locator('.configuration-card').first().locator('.set-ability')).toContainText('轻装');
  } finally {await app.close();}
});

test('机制图谱区分条件精算与识别，可中英文查找并通过可访问性检查', async () => {
  const app = await launchDesktop(await mkdtemp(join(tmpdir(), 'poke-knowledge-ui-')));
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', {name: '环境', exact: true}).click();
    await page.locator('.knowledge-panel>summary').filter({hasText: '当前规则的机制图谱'}).click();
    await expect(page.locator('.knowledge-count')).toHaveText('8 类 · 62 项');
    const input = page.getByLabel('筛选角色知识');
    await input.fill('Wide Guard');
    await expect(page.locator('.mechanism-knowledge-card').first()).toContainText('广域防守');
    await expect(page.locator('.coverage-recognition').first()).toHaveText('配置识别');
    await input.fill('雨天');
    await expect(page.locator('.mechanism-knowledge-card').filter({has: page.locator('summary strong', {hasText: /^雨天$/})})).toContainText('有条件精算');
    // Electron uses one document; Axe's additional aggregation page is unavailable.
    const axe = await new AxeBuilder({page}).setLegacyMode(true).include('.knowledge-panel').analyze();
    expect(axe.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
    await input.fill('');
    await page.screenshot({path: 'test-results/mechanism-knowledge.png'});
  } finally {await app.close();}
});
