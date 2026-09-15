import {readdirSync, statSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import type {Store} from './storage';
import {hash} from './domain';

const TABLES = ['drafts', 'history', 'research_entries', 'jobs', 'environments', 'corpora', 'models', 'analysis_cache', 'source_registry'] as const;
export interface CleanupPlan {hash: string; models: string[]; corpora: string[]; cacheRows: number; removableBytes: number}
export interface StorageReport {
  tables: {table: string; rows: number; bytes: number}[];
  disk: {name: string; bytes: number; files: number}[];
  plan: CleanupPlan;
}
export interface RuntimeReport {
  process: string; heapUsed: number; external: number; rss: number;
  contexts: {key: string; observations: number; archetypes: number; damageEntries: number}[];
}
export interface MaintenanceReport {storage: StorageReport; runtime: RuntimeReport[]; collectedAt: string}

function directorySize(path: string): {bytes: number; files: number} {
  if (!existsSync(path)) return {bytes: 0, files: 0};
  const stat = statSync(path);
  if (!stat.isDirectory()) return {bytes: stat.size, files: 1};
  return readdirSync(path, {withFileTypes: true}).filter(entry => !entry.isSymbolicLink()).reduce((sum, entry) => {const size = directorySize(join(path, entry.name)); return {bytes: sum.bytes + size.bytes, files: sum.files + size.files};}, {bytes: 0, files: 0});
}

export function storageReport(store: Store): StorageReport {
  const tables = TABLES.map(table => ({table, ...(store.db.prepare(`SELECT count(*) AS rows,coalesce(sum(length(cast(data AS BLOB))),0) AS bytes FROM ${table}`).get() as {rows: number; bytes: number})}));
  const models = new Set<string>(); const corpora = new Set<string>();
  const references = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'modelVersion' && typeof child === 'string') models.add(child);
      if (key === 'corpusVersion' && typeof child === 'string') corpora.add(child);
      references(child);
    }
  };
  for (const table of ['environments', 'jobs', 'research_entries'] as const) for (const row of store.db.prepare(`SELECT data FROM ${table}`).all() as {data: string}[]) references(JSON.parse(row.data));
  for (const row of store.db.prepare('SELECT request FROM jobs').all() as {request: string}[]) references(JSON.parse(row.request));
  const storedModels = store.db.prepare('SELECT version,data FROM models ORDER BY version').all() as {version: string; data: string}[];
  for (const model of storedModels) if (models.has(model.version)) references(JSON.parse(model.data));
  const unusedModels = storedModels.filter(model => !models.has(model.version));
  const unusedCorpora = (store.db.prepare('SELECT version,length(cast(data AS BLOB)) AS bytes FROM corpora ORDER BY version').all() as {version: string; bytes: number}[]).filter(row => !corpora.has(row.version));
  const removableBytes = unusedModels.reduce((sum, row) => sum + Buffer.byteLength(row.data), 0) + unusedCorpora.reduce((sum, row) => sum + row.bytes, 0);
  const content = {models: unusedModels.map(row => row.version), corpora: unusedCorpora.map(row => row.version)};
  const plan = {...content, hash: hash(content), cacheRows: tables.find(row => row.table === 'analysis_cache')!.rows, removableBytes};
  const disk = ['teambuilder.sqlite', 'teambuilder.sqlite-wal', 'raw', 'engines'].map(name => ({name, ...directorySize(join(store.directory, name))}));
  return {tables, disk, plan};
}

export function cleanStorage(store: Store, options: {planHash: string; analysisCache: boolean; unusedVersions: boolean; compact: boolean}): StorageReport {
  const current = storageReport(store);
  if (options.unusedVersions && current.plan.hash !== options.planHash) throw new Error('版本引用已变化，请刷新清理预览后重新选择。');
  store.db.exec('BEGIN IMMEDIATE');
  try {
    if (options.analysisCache) store.db.prepare('DELETE FROM analysis_cache').run();
    if (options.unusedVersions) {
      for (const version of current.plan.models) store.db.prepare('DELETE FROM models WHERE version=?').run(version);
      for (const version of current.plan.corpora) store.db.prepare('DELETE FROM corpora WHERE version=?').run(version);
    }
    store.db.exec('COMMIT');
  } catch (error) {store.db.exec('ROLLBACK'); throw error;}
  if (options.compact) {
    store.db.exec('VACUUM');
    const checkpoint = store.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get() as {busy: number};
    if (checkpoint.busy) throw new Error('所选数据已清理，但仍有读取事务占用数据库日志，日志空间尚未回收。请在当前计算结束后重新压缩。');
  }
  return storageReport(store);
}
