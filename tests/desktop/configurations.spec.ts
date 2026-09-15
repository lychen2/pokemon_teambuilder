import {test, expect} from '@playwright/test';
import {mkdtemp, readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {launchDesktop} from './launch';
import {Store} from '../../packages/core/storage';
import {ResearchStore} from '../../packages/core/research/storage';
import type {BootstrapData} from '../../packages/core/types';
import {createDraft, hash, member} from '../../packages/core/domain';

test('中英文筛选非代表配置，保留准确配点来源并选择技术招式变体', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'poke-configurations-ui-'));
  const app = await launchDesktop(directory);
  try {
    const page = await app.firstWindow();
    await page.getByLabel('搜索宝可梦').fill('炽焰咆哮虎'); await page.getByLabel('搜索宝可梦').press('Enter');
    const filter = page.getByLabel('筛选真实配置');
    await filter.fill('Helping Hand');
    await filter.dispatchEvent('keydown', {key: 'Enter', code: 'Enter', isComposing: true});
    await expect(filter).toBeFocused();
    const card = page.locator('.configuration-card').first();
    await expect(card).toContainText('帮助');
    const configurationId = await card.getAttribute('data-configuration-id');
    const state = await page.evaluate(() => window.poke.call('bootstrap', undefined));
    const original = state.configurations.find(c => c.id === configurationId)!;
    expect(original.set.moves).toContain('helpinghand'); expect(original.isRepresentative).toBe(false);
    await filter.fill('帮助'); await expect(card).toHaveAttribute('data-configuration-id', original.id);
    await card.getByRole('button', {name: '加入', exact: true}).click();
    await expect(page.getByTestId('team-member')).toHaveCount(1);
    await expect(page.getByText('已自动保存', {exact: true})).toBeVisible();
    const saved = (await page.evaluate(() => window.poke.call('bootstrap', undefined))).drafts.find(d => d.members.length === 1)!;
    expect(saved.members[0].set).toEqual(original.set);
    await page.getByText('推荐偏好与保留变体', {exact: true}).click();
    const preferences = page.locator('.search-preferences');
    await preferences.getByLabel('选择要保留变体的宝可梦').fill('Sneasler');
    await preferences.getByRole('option').first().click();
    await preferences.getByLabel('保留在候选池的配置').fill('Feint');
    await expect(preferences.getByRole('option').first()).toContainText('佯攻');
    await preferences.getByRole('option').first().click();
    await preferences.getByRole('button', {name: '保存推荐偏好'}).click();
    await expect(preferences).toContainText('已保存');
    const research = await page.evaluate(input => window.poke.call('research', input), {draftId: saved.id, environmentId: saved.environmentId});
    const preference = research.entries.find(entry => entry.kind === 'preferences')!;
    expect(preference.kind).toBe('preferences');
    if (preference.kind !== 'preferences') throw new Error('没有已保存的推荐偏好');
    expect(state.configurations.find(c => c.id === preference.retainedConfigurationIds[0])!.set.moves).toContain('feint');
    await page.screenshot({path: 'test-results/real-configurations.png'});
  } finally {await app.close();}
});

test('应用升级使用同语料的新模型，保留旧模型和已保存偏好', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'poke-model-upgrade-ui-'));
  const bootstrap: BootstrapData = JSON.parse(await readFile('assets/bootstrap.json', 'utf8'));
  const store = new Store(directory, resolve('assets'));
  new ResearchStore(store.db);
  const {algorithmVersion, ...previousModel} = bootstrap.model;
  const legacy = {...previousModel, version: 'previous-algorithm-model'};
  store.install({...bootstrap, model: {...legacy, algorithmVersion: 'mc-1.2.1'}});
  // Released 0.1.0 databases did not serialize a model algorithmVersion field.
  store.db.prepare('UPDATE models SET data=? WHERE version=?').run(JSON.stringify(legacy), legacy.version);
  const preference = {id: 'legacy-preference', kind: 'preferences', draftId: 'legacy-draft', environmentId: bootstrap.environment.id, revision: 2, updatedAt: '2026-09-14', retainedArchetypeIds: [bootstrap.model.archetypes[0].id], weights: {pressure: 3, resilience: 1, speed: .6, coverage: 1, tailRisk: 1.5}, notes: '旧偏好'};
  store.db.prepare('INSERT INTO research_entries VALUES(?,?,?,?,?,?)').run(preference.id, preference.kind, preference.draftId, preference.environmentId, preference.revision, JSON.stringify(preference));
  store.close();
  const app = await launchDesktop(directory);
  try {
    const page = await app.firstWindow(); await expect(page.getByLabel('搜索宝可梦')).toBeVisible();
    const current = await page.evaluate(() => window.poke.call('bootstrap', undefined));
    expect(current.model.version).toBe(bootstrap.model.version);
    expect(current.model.algorithmVersion).toBe(current.algorithmVersion);
    const persisted = new Store(directory, resolve('assets'), true);
    try {
      expect(persisted.model(legacy.version)).toEqual(legacy);
      const record = persisted.db.prepare('SELECT data FROM research_entries WHERE id=?').get(preference.id) as {data: string};
      const upgraded = JSON.parse(record.data);
      expect(upgraded.retainedConfigurationIds).toEqual(preference.retainedArchetypeIds);
      expect(upgraded).not.toHaveProperty('retainedArchetypeIds'); expect(upgraded.revision).toBe(2);
    } finally {persisted.close();}
  } finally {await app.close();}
});

test('自定义语料自动重建新算法模型，完成后恢复原队伍', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'poke-custom-upgrade-ui-'));
  const b: BootstrapData = JSON.parse(await readFile('assets/bootstrap.json', 'utf8'));
  const team = b.corpus.teams.find(team => team.season === b.environment.season && team.status === 'valid')!;
  const corpus = {...b.corpus, version: hash(['custom-upgrade', team.id]), teams: [team], observations: b.corpus.observations.filter(o => o.teamId === team.id), reports: []};
  const legacy = {...b.model, version: 'custom-legacy-model', corpusVersion: corpus.version, algorithmVersion: 'mc-1.2.1'};
  const draft = {...createDraft(b.environment.id, '升级前保存的队伍'), members: corpus.observations.map(o => member(o.set))};
  const store = new Store(directory, resolve('assets'));
  store.install({...b, corpus, model: legacy}); store.saveDraft(draft); store.close();
  const app = await launchDesktop(directory);
  try {
    const page = await app.firstWindow();
    await expect(page.getByLabel('队伍名称')).toHaveValue(draft.name);
    await expect(page.getByTestId('team-member')).toHaveCount(6);
    const current = await page.evaluate(() => window.poke.call('bootstrap', undefined));
    expect(current.corpus.version).toBe(corpus.version);
    expect(current.model.algorithmVersion).toBe(current.algorithmVersion);
    expect(current.model.version).not.toBe(legacy.version);
    expect(current.model.version).not.toBe(b.model.version);
    expect(current.drafts.find(d => d.id === draft.id)!.members).toEqual(draft.members);
    const jobs = await page.evaluate(() => window.poke.call('jobs', undefined));
    expect(jobs.filter(job => job.kind === 'model')).toHaveLength(1);
    expect(jobs.find(job => job.kind === 'model')!.status).toBe('completed');
  } finally {await app.close();}
});

test('启动页显示自定义模型重建并可取消，取消保留旧语料与模型', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'poke-cancel-upgrade-ui-'));
  const b: BootstrapData = JSON.parse(await readFile('assets/bootstrap.json', 'utf8'));
  const corpus = {...b.corpus, version: hash(['custom-source-index', b.corpus.version]), reports: []};
  const legacy = {...b.model, version: 'cancelled-legacy-model', corpusVersion: corpus.version, algorithmVersion: 'mc-1.2.1'};
  const store = new Store(directory, resolve('assets'));
  store.install({...b, corpus, model: legacy}); store.close();
  const app = await launchDesktop(directory);
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('status')).toContainText('正在更新配置分析');
    await page.getByRole('button', {name: '取消模型重建'}).click();
    await expect(page.getByRole('alert')).toContainText('取消');
    await expect(page.getByRole('button', {name: '重新加载本地数据'})).toBeVisible();
    const persisted = new Store(directory, resolve('assets'), true);
    try {
      expect(persisted.environment(b.environment.id).modelVersion).toBe(legacy.version);
      expect(persisted.corpus(corpus.version)).toEqual(corpus);
      expect(persisted.jobs().find(job => job.kind === 'model')!.status).toBe('cancelled');
    } finally {persisted.close();}
  } finally {await app.close();}
});
