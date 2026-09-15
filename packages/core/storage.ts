import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import type {BootstrapData, Corpus, Model, EnvironmentSnapshot, DexData, EngineManifest, TeamDraft, JobProgress} from './types';
import {hash} from './domain';
import {calculationContent} from './revisions';

export interface StoredEnvironment {environment: EnvironmentSnapshot; engine: EngineManifest; dex: DexData; translations: Record<string, string>; corpusVersion: string; modelVersion: string}
export class Store {
  readonly db: DatabaseSync;
  constructor(readonly directory: string, readonly assets: string, readonlyOnly = false) {
    if (!readonlyOnly) mkdirSync(directory, {recursive: true});
    this.db = new DatabaseSync(join(directory, 'teambuilder.sqlite'), {readOnly: readonlyOnly});
    if (readonlyOnly) return;
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS environments(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS corpora(version TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS models(version TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,updated_at TEXT NOT NULL,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS history(draft_id TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(draft_id,revision));
      CREATE TABLE IF NOT EXISTS analysis_cache(key TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,data TEXT NOT NULL,request TEXT NOT NULL);
      `);
    const version = (this.db.prepare('PRAGMA user_version').get() as {user_version: number}).user_version;
    if (version < 2) {
      this.db.exec(`BEGIN IMMEDIATE;
        UPDATE drafts SET data=json_set(data,'$.analysisRevision',revision) WHERE json_extract(data,'$.analysisRevision') IS NULL;
        UPDATE history SET data=json_set(data,'$.analysisRevision',revision) WHERE json_extract(data,'$.analysisRevision') IS NULL;
        PRAGMA user_version=2; COMMIT;`);
    }
    if (!this.db.prepare('SELECT value FROM meta WHERE key=?').get('activeEnvironment')) {
      const bootstrap = JSON.parse(readFileSync(join(assets, 'bootstrap.json'), 'utf8')) as BootstrapData;
      this.install(bootstrap);
      this.setMeta('activeEnvironment', bootstrap.environment.id);
    }
  }
  getMeta(key: string): string | undefined {return (this.db.prepare('SELECT value FROM meta WHERE key=?').get(key) as {value: string} | undefined)?.value;}
  setMeta(key: string, value: string): void {this.db.prepare('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)').run(key, value);}
  activeEnvironment(): string {const id = this.getMeta('activeEnvironment'); if (!id) throw new Error('没有已激活的规则环境。'); return id;}
  install(data: BootstrapData): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT OR IGNORE INTO corpora(version,data) VALUES(?,?)').run(data.corpus.version, JSON.stringify(data.corpus));
      this.db.prepare('INSERT OR IGNORE INTO models(version,data) VALUES(?,?)').run(data.model.version, JSON.stringify(data.model));
      const environment: StoredEnvironment = {environment: data.environment, engine: data.engine, dex: data.dex, translations: data.translations, corpusVersion: data.corpus.version, modelVersion: data.model.version};
      this.db.prepare('INSERT OR REPLACE INTO environments(id,data) VALUES(?,?)').run(data.environment.id, JSON.stringify(environment));
      this.db.exec('COMMIT');
    } catch (error) {this.db.exec('ROLLBACK'); throw error;}
  }
  environment(id: string): StoredEnvironment {
    const row = this.db.prepare('SELECT data FROM environments WHERE id=?').get(id) as {data: string} | undefined;
    if (!row) throw new Error(`找不到规则快照：${id}`);
    return JSON.parse(row.data);
  }
  environments(): EnvironmentSnapshot[] {return (this.db.prepare('SELECT data FROM environments').all() as {data: string}[]).map(row => (JSON.parse(row.data) as StoredEnvironment).environment);}
  corpus(version: string): Corpus {const row = this.db.prepare('SELECT data FROM corpora WHERE version=?').get(version) as {data: string} | undefined; if (!row) throw new Error(`找不到语料版本：${version}`); return JSON.parse(row.data);}
  model(version: string): Model {const row = this.db.prepare('SELECT data FROM models WHERE version=?').get(version) as {data: string} | undefined; if (!row) throw new Error(`找不到模型版本：${version}`); return JSON.parse(row.data);}
  engineDirectory(id: string): string {
    const local = join(this.directory, 'engines', id);
    const bundled = join(this.assets, 'engines', id);
    if (existsSync(join(local, 'manifest.json'))) return local;
    if (existsSync(join(bundled, 'manifest.json'))) return bundled;
    throw new Error(`缺少引擎版本 ${id}，无法复现这个环境。`);
  }
  drafts(): TeamDraft[] {return (this.db.prepare('SELECT data FROM drafts ORDER BY updated_at DESC').all() as {data: string}[]).map(r => JSON.parse(r.data));}
  saveDraft(draft: TeamDraft): TeamDraft {
    const previous = this.db.prepare('SELECT data,revision FROM drafts WHERE id=?').get(draft.id) as {data: string; revision: number} | undefined;
    if (previous && previous.revision > draft.revision) throw new Error('本地已有更新的队伍修订，未覆盖已保存内容。');
    if (previous && previous.revision === draft.revision) {
      const old = JSON.parse(previous.data) as TeamDraft;
      if (hash([old.name, old.members, old.notes, old.environmentId]) !== hash([draft.name, draft.members, draft.notes, draft.environmentId])) throw new Error('同一修订号对应不同队伍内容。');
      return old;
    }
    if (previous) {
      const old = JSON.parse(previous.data) as TeamDraft;
      const changed = calculationContent(old) !== calculationContent(draft);
      if (draft.analysisRevision < old.analysisRevision || changed && draft.analysisRevision <= old.analysisRevision) throw new Error('计算内容已改变，但计算修订号未更新。');
    }
    this.environment(draft.environmentId);
    const saved = {...draft, updatedAt: new Date().toISOString()};
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT OR REPLACE INTO drafts(id,revision,updated_at,data) VALUES(?,?,?,?)').run(saved.id, saved.revision, saved.updatedAt, JSON.stringify(saved));
      this.db.prepare('INSERT INTO history(draft_id,revision,data) VALUES(?,?,?)').run(saved.id, saved.revision, JSON.stringify(saved));
      this.db.exec('COMMIT');
    } catch (error) {this.db.exec('ROLLBACK'); throw error;}
    return saved;
  }
  history(id: string): TeamDraft[] {return (this.db.prepare('SELECT data FROM history WHERE draft_id=? ORDER BY revision DESC').all(id) as {data: string}[]).map(row => JSON.parse(row.data));}
  deleteDraft(id: string): void {this.db.exec('BEGIN IMMEDIATE'); try {this.db.prepare('DELETE FROM drafts WHERE id=?').run(id); this.db.prepare('DELETE FROM history WHERE draft_id=?').run(id); this.db.exec('COMMIT');} catch (error) {this.db.exec('ROLLBACK'); throw error;}}
  cached<T>(key: string): T | undefined {const row = this.db.prepare('SELECT data FROM analysis_cache WHERE key=?').get(key) as {data: string} | undefined; return row ? JSON.parse(row.data) : undefined;}
  cache(key: string, value: unknown): void {this.db.prepare('INSERT OR REPLACE INTO analysis_cache(key,data) VALUES(?,?)').run(key, JSON.stringify(value));}
  saveJob(job: JobProgress, request: unknown): void {this.db.prepare('INSERT OR REPLACE INTO jobs(id,data,request) VALUES(?,?,?)').run(job.id, JSON.stringify(job), JSON.stringify(request));}
  jobs(): JobProgress[] {return (this.db.prepare('SELECT data FROM jobs ORDER BY rowid DESC').all() as {data: string}[]).map(row => JSON.parse(row.data));}
  jobRequest(id: string): unknown {const row = this.db.prepare('SELECT request FROM jobs WHERE id=?').get(id) as {request: string} | undefined; if (!row) throw new Error('找不到任务输入。'); return JSON.parse(row.request);}
  close(): void {this.db.close();}
}
