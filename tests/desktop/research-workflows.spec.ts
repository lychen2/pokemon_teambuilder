import {test, expect, type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdtemp, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {launchDesktop} from './launch';
import type {BootstrapData} from '../../packages/core/types';

async function importTeam(page: Page) {
  const b: BootstrapData = JSON.parse(await readFile('assets/bootstrap.json', 'utf8'));
  await page.getByRole('button', {name: '导入', exact: true}).click();
  await page.getByLabel('Showdown 队伍文本').fill(b.corpus.teams.find(t => t.url.includes('73e5d6533b781089'))!.raw);
  await page.getByRole('button', {name: '解析队伍'}).click(); await page.getByRole('button', {name: '开始构筑'}).click();
  await expect(page.getByTestId('team-member')).toHaveCount(6);
}

test('多路线计划、实践快照、元数据编辑保留建议和重启记录', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'poke-research-flow-')); let app = await launchDesktop(directory);
  try {
    let page = await app.firstWindow(); await importTeam(page);
    await page.getByRole('button', {name: '寻找改进方案', exact: true}).click(); await expect(page.locator('.proposal-card').first()).toBeVisible();
    await page.getByLabel('队伍名称').fill('计划与证据验收'); await expect(page.getByText('已自动保存', {exact: true})).toBeVisible();
    await expect(page.locator('.proposal-card').first().getByRole('button', {name: '比较并应用'})).toBeEnabled();
    await page.getByRole('tab', {name: '构筑笔记'}).click(); await page.getByRole('button', {name: '对局计划', exact: true}).click();
    await page.getByRole('button', {name: '新建计划'}).click(); await page.getByLabel('计划名称').fill('对空间的两条路线');
    for (const name of ['大狃拉', '轰擂金刚猩', '赛富豪', '风速狗-洗翠']) {
      const control = page.getByRole('dialog').getByRole('button', {name: `选出${name}`, exact: true});
      if (await control.count()) await control.click();
    }
    const chosen = page.locator('.route-editor').first().locator('.lineup-picker>div.chosen');
    const total = await chosen.count();
    if (total < 4) for (let i = total; i < 4; i++) await page.locator('.route-editor').first().locator('.lineup-picker>div:not(.chosen)>button:first-child').first().click();
    await page.locator('.route-editor').first().getByLabel('如何赢下对局').fill('场地轻装抢先处理空间手；需要实战确认。');
    await page.getByRole('button', {name: '增加另一条路线'}).click(); await expect(page.getByLabel('路线名称')).toHaveCount(2);
    await page.getByLabel('路线名称').nth(1).fill('保留后排轮转'); await page.getByLabel('如何赢下对局').nth(1).fill('先消耗空间回合，再换入进攻核心。');
    await page.getByRole('button', {name: '保存对局计划'}).click(); await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.locator('.research-card')).toContainText('2 条路线');
    await page.getByRole('button', {name: '记录实践'}).click(); await page.getByLabel('实战结果').selectOption('loss'); await page.getByLabel('关键原因').fill('选出缺少干扰');
    await page.getByRole('button', {name: '保存实战记录'}).click(); await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('button', {name: '实战复盘', exact: true}).click(); await expect(page.locator('.record-summary')).toContainText('1 场有结果');
    const before = await page.evaluate(() => window.poke.call('bootstrap', undefined)); const draft = before.drafts.find(d => d.name === '计划与证据验收')!;
    const records = await page.evaluate(input => window.poke.call('research', input), {draftId: draft.id, environmentId: draft.environmentId});
    expect(records.entries.some(entry => entry.kind === 'match' && entry.snapshot.name === draft.name)).toBe(true);
    await page.getByLabel('队伍名称').fill('后来修改的名称'); await expect(page.getByText('已自动保存', {exact: true})).toBeVisible();
    await app.close(); app = await launchDesktop(directory); page = await app.firstWindow(); await expect(page.getByLabel('队伍名称')).toHaveValue('后来修改的名称');
    await page.getByRole('tab', {name: '构筑笔记'}).click(); await page.getByRole('button', {name: '实战复盘', exact: true}).click(); await expect(page.locator('.record-summary')).toContainText('1 场有结果');
    await page.screenshot({path: 'test-results/research-records.png'});
  } finally {await app.close();}
});

test('条件模板、风险比较与配点入口使用同一上下文', async () => {
  const app = await launchDesktop(await mkdtemp(join(tmpdir(), 'poke-conditions-ui-')));
  try {
    const page = await app.firstWindow(); await importTeam(page); await page.getByRole('tab', {name: '速度关系'}).click();
    await page.getByLabel('比较的成员').selectOption({label: '大狃拉'}); await page.locator('.speed-benchmark').first().click();
    await page.getByText('条件模板与范围检验', {exact: true}).click(); await page.getByLabel('条件模板名称').fill('无天气与削血');
    await page.getByRole('button', {name: '失去天气', exact: true}).click(); await page.getByRole('button', {name: '对手剩余 90% HP', exact: true}).click();
    await page.getByRole('button', {name: '保存条件模板'}).click(); await expect(page.getByLabel('读取条件模板').locator('option')).toContainText(['新的模板', '无天气与削血']);
    await expect(page.locator('.scenario-row')).toHaveCount(3);
    await page.getByText('命中风险与替代路线', {exact: true}).click(); await expect(page.locator('.risk-panel table').first()).toBeVisible();
    await page.getByRole('dialog').getByRole('button', {name: '关闭', exact: true}).click();
    await page.getByRole('button', {name: '编辑大狃拉', exact: true}).click(); await page.getByRole('button', {name: '按目标优化配点'}).click();
    await expect(page.getByRole('dialog')).toContainText('无天气与削血（3 个场景）'); await page.getByLabel('无天气与削血（3 个场景）').check();
    await page.screenshot({path: 'test-results/conditions-spread.png'});
  } finally {await app.close();}
});

test('独立资料核对、存储报告与主要页面可访问性', async () => {
  const app = await launchDesktop(await mkdtemp(join(tmpdir(), 'poke-documents-ui-')));
  try {
    const page = await app.firstWindow(); await page.getByRole('button', {name: '环境', exact: true}).click();
    await page.getByText('独立资料与对局回放', {exact: true}).click(); await page.getByText('粘贴已经取得的原文／公开回放日志', {exact: true}).click();
    await page.getByLabel('独立资料原文').fill('I chose this spread to survive the common attack.');
    await page.getByRole('button', {name: '读取并整理引文'}).click(); await page.getByLabel('资料标题').fill('本地引文核对验收');
    await page.getByLabel('引文解读1').fill('这是测试引用流程的原文，尚无当前规则实测结论。'); await page.getByLabel('已核对原文和适用条件').check();
    await page.getByRole('button', {name: '保存研究资料'}).click(); await expect(page.getByRole('dialog')).toBeHidden(); await expect(page.getByText('1 条已核对引文', {exact: false})).toBeVisible();
    await page.getByText('本地存储与运行占用', {exact: true}).click(); await page.getByRole('button', {name: '读取当前占用'}).click(); await expect(page.getByText('数据库中的内容大小（文件大小另列）')).toBeVisible();
    await page.getByLabel('删除可重算的分析缓存').check(); await page.getByRole('button', {name: '预览所选清理'}).click(); await expect(page.getByRole('dialog')).toContainText('队伍历史');
    await page.getByRole('button', {name: '执行所选清理'}).click(); await expect(page.getByRole('dialog')).toBeHidden();
    // Electron has one document and cannot create Axe's cross-frame aggregation page.
    const a11y = await new AxeBuilder({page}).setLegacyMode(true).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(a11y.violations.map(v => ({id: v.id, nodes: v.nodes.map(n => ({target: n.target, detail: n.failureSummary}))}))).toEqual([]);
    const window = await app.browserWindow(page); await window.evaluate(w => {w.setSize(840, 890); w.webContents.setZoomFactor(1.25);});
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path: 'test-results/environment-research-zoom.png'});
  } finally {await app.close();}
});

test('来源意图、偏好持久化与构筑编辑可访问性', async () => {
  const app = await launchDesktop(await mkdtemp(join(tmpdir(), 'poke-source-preferences-')));
  try {
    const page = await app.firstWindow();
    await page.getByLabel('搜索宝可梦').fill('大狃拉'); await page.getByLabel('搜索宝可梦').press('Enter');
    await page.locator('.archetype-card').first().getByRole('button', {name: '真实来源'}).click();
    await page.getByText('作者意图、配点成熟度与变体链', {exact: true}).click();
    await page.getByLabel('原作者标注').fill('待核验的作者记录');
    await page.getByLabel('来源变体改动').fill('保留原配置，记录待验证的替换思路。');
    await page.getByLabel('来源构筑意图').fill('场地与轻装联动；这是我的研究记录。');
    await page.getByRole('button', {name: '保存来源说明'}).click();
    await expect(page.getByRole('button', {name: '保存来源说明'})).toBeEnabled();
    await page.getByRole('dialog').getByRole('button', {name: '关闭', exact: true}).click();
    await page.locator('.archetype-card').first().getByRole('button', {name: '加入', exact: true}).click();
    await page.getByText('推荐偏好与保留变体', {exact: true}).click();
    await page.getByLabel('偏好pressure').fill('2.5'); await page.getByRole('button', {name: '保存推荐偏好'}).click();
    await expect(page.locator('.search-preferences')).toContainText('已保存');
    await expect(page.getByTestId('team-member')).toHaveCount(1);
    await expect(page.getByText('已自动保存', {exact: true})).toBeVisible();
    const state = await page.evaluate(() => window.poke.call('bootstrap', undefined)); const draft = state.drafts.find(d => d.members.length === 1)!;
    const research = await page.evaluate(input => window.poke.call('research', input), {draftId: draft.id, environmentId: draft.environmentId});
    expect(research.entries.some(entry => entry.kind === 'preferences' && entry.weights.pressure === 2.5)).toBe(true);
    expect(research.entries.some(entry => entry.kind === 'source' && entry.originalAuthor === '待核验的作者记录')).toBe(true);
    const main = await new AxeBuilder({page}).setLegacyMode(true).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(main.violations.map(v => ({id: v.id, nodes: v.nodes.map(n => ({target: n.target, detail: n.failureSummary}))}))).toEqual([]);
    await page.getByRole('button', {name: '编辑大狃拉', exact: true}).click();
    const editor = await new AxeBuilder({page}).setLegacyMode(true).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(editor.violations.map(v => ({id: v.id, nodes: v.nodes.map(n => ({target: n.target, detail: n.failureSummary}))}))).toEqual([]);
    await page.screenshot({path: 'test-results/member-editor.png'});
  } finally {await app.close();}
});

test('键盘搜索自动滚入视野，窄窗放大后仍能搜索配置', async () => {
  const app = await launchDesktop(await mkdtemp(join(tmpdir(), 'poke-keyboard-')));
  try {
    const page = await app.firstWindow(); const input = page.getByRole('combobox', {name: '搜索宝可梦'});
    await input.focus(); for (let i = 0; i < 20; i++) await input.press('ArrowDown');
    const active = page.getByRole('option', {selected: true});
    // Scroll positions round to physical pixels, while layout rectangles may be fractional.
    await expect.poll(() => active.evaluate(element => {const row = element.getBoundingClientRect(); const list = element.parentElement!.getBoundingClientRect(); return Math.max(list.top - row.top, row.bottom - list.bottom);})).toBeLessThanOrEqual(1);
    await expect(input).toBeFocused(); await input.press('Enter'); await expect(page.getByRole('button', {name: '返回宝可梦'})).toBeVisible();
    const nativeWindow = await app.browserWindow(page); await nativeWindow.evaluate(w => {w.setSize(840, 890); w.webContents.setZoomFactor(1.25);});
    await page.keyboard.press('Control+k');
    const search = page.getByRole('dialog').getByRole('combobox', {name: '搜索宝可梦'});
    await search.fill('大狃拉'); await search.press('Enter'); await expect(page.getByRole('dialog').locator('.archetype-card').first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path: 'test-results/keyboard-zoom.png'});
  } finally {await app.close();}
});
