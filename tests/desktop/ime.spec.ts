import {test, expect} from '@playwright/test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {launchDesktop} from './launch';

const command = promisify(execFile);
test('系统 Fcitx5／Rime 的真实中文组合输入、确认候选与搜索焦点', async () => {
  test.skip(!process.env.POKE_REAL_IME, '需要使用独立系统输入法验收入口：pnpm test:ime');
  const app = await launchDesktop(await mkdtemp(join(tmpdir(), 'poke-ime-ui-')));
  try {
    const page = await app.firstWindow(); const nativeWindow = await app.browserWindow(page); await nativeWindow.evaluate(w => w.focus());
    const nativeId = await nativeWindow.evaluate(w => w.getNativeWindowHandle().readUInt32LE(0));
    await command('python3', ['tools/send-x11-keys.py', '', String(nativeId)]);
    await expect(page.getByLabel('搜索宝可梦')).toBeVisible();
    await command('fcitx5-remote', ['--check']);
    await page.getByLabel('搜索宝可梦').click();
    await page.getByLabel('搜索宝可梦').evaluate(input => {const events: string[] = []; (window as any).__imeEvents = events; for (const event of ['compositionstart', 'compositionupdate', 'compositionend']) input.addEventListener(event, () => events.push(event));});
    await expect.poll(async () => (await command('fcitx5-remote', ['-n'])).stdout.trim()).not.toBe('');
    await command('fcitx5-remote', ['-s', 'rime']); await command('fcitx5-remote', ['-o']);
    await expect.poll(async () => (await command('fcitx5-remote', ['-n'])).stdout.trim()).toBe('rime');
    await expect.poll(async () => (await command('fcitx5-remote', [])).stdout.trim()).toBe('2');
    await command('python3', ['tools/send-x11-keys.py', 'pikaqiu ']);
    await expect(page.getByLabel('搜索宝可梦')).toHaveValue(/[\u3400-\u9fff]/);
    await expect(page.getByLabel('搜索宝可梦')).toBeFocused();
    const events = await page.evaluate(() => (window as any).__imeEvents as string[]);
    expect(events).toContain('compositionstart'); expect(events).toContain('compositionend');
    await writeFile('.local/ime-validation.json', JSON.stringify({createdAt: new Date().toISOString(), inputMethod: 'Fcitx5 / Rime luna_pinyin_simp', text: await page.getByLabel('搜索宝可梦').inputValue(), events, focusPreserved: true}, null, 2));
    await page.screenshot({path: 'test-results/system-ime.png'});
    await command('fcitx5-remote', ['-c']);
  } finally {await app.close();}
});
