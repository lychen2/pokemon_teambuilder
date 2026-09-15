import {test, expect} from '@playwright/test';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {launchDesktop} from './launch';
import manifest from '../../assets/pokemon/manifest.json' with {type: 'json'};

test('雌性爱管侍使用独立高清素材，加入队伍和窄窗口后图片仍正确', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'poke-artwork-'));
  const app = await launchDesktop(directory);
  try {
    const page = await app.firstWindow();
    await page.getByLabel('搜索宝可梦').fill('indeedee');
    const female = page.getByRole('option', {name: '选择爱管侍-雌性的样子的配置'});
    const maleImage = page.locator('img[data-species-id="indeedee"]').first();
    const femaleImage = female.locator('img');
    await expect(femaleImage).toBeVisible();
    await expect(femaleImage).not.toHaveAttribute('src', (await maleImage.getAttribute('src'))!);
    await expect(femaleImage).toHaveAttribute('src', new RegExp(manifest.entries.indeedeef.file.slice(0, -4)));
    await expect.poll(() => femaleImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(128);
    await female.click();
    await page.getByRole('button', {name: '加入', exact: true}).first().click();
    const portrait = page.getByTestId('team-member').locator('img[data-species-id="indeedeef"]');
    await expect(portrait).toBeVisible();
    await expect(portrait).toHaveAttribute('src', new RegExp(manifest.entries.indeedeef.file.slice(0, -4)));
    const window = await app.browserWindow(page); await window.evaluate(w => w.setSize(840, 890));
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await portrait.evaluate(image => getComputedStyle(image).imageRendering)).toBe('auto');
    await page.screenshot({path: 'test-results/champions-indeedee-female.png'});
  } finally {await app.close(); await rm(directory, {recursive: true, force: true});}
});
