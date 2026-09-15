import type {DatabaseSync} from 'node:sqlite';
import type {ResearchEntry, ResearchState, SourceRegistration, MatchRecord} from './types';
import {matchSummary} from './workflow';

/** Uses the application's single writer and its transaction boundary. */
export class ResearchStore {
  constructor(readonly db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS research_entries(id TEXT PRIMARY KEY,kind TEXT NOT NULL,subject TEXT NOT NULL,environment_id TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS research_subject ON research_entries(subject,environment_id);
      CREATE TABLE IF NOT EXISTS source_registry(id TEXT PRIMARY KEY,environment_id TEXT NOT NULL,data TEXT NOT NULL);`);
    // Representative ids are the stable ids of their observed configurations.
    // Upgrade persisted preferences once, without discarding any saved selection.
    db.prepare(`UPDATE research_entries SET data=json_remove(json_set(data,'$.retainedConfigurationIds',json_extract(data,'$.retainedArchetypeIds')),'$.retainedArchetypeIds')
      WHERE kind=? AND json_type(data,'$.retainedArchetypeIds') IS NOT NULL AND json_type(data,'$.retainedConfigurationIds') IS NULL`).run('preferences');
  }
  entries(): ResearchEntry[] {
    return (this.db.prepare('SELECT data FROM research_entries ORDER BY rowid DESC').all() as {data: string}[]).map(row => JSON.parse(row.data));
  }
  state(draftId: string, environmentId: string): ResearchState {
    const entries = this.entries().filter(entry => 'draftId' in entry ? entry.draftId === draftId : entry.environmentId === environmentId);
    return {entries, summary: matchSummary(entries.filter((entry): entry is MatchRecord => entry.kind === 'match'))};
  }
  save(entry: ResearchEntry): ResearchEntry {
    if (entry.kind === 'source') {
      const links = new Map<string, string[]>(this.entries().flatMap(row => row.kind === 'source' && row.environmentId === entry.environmentId ? [[row.sourceId, row.parentSourceIds] as [string, string[]]] : []));
      links.set(entry.sourceId, entry.parentSourceIds);
      const visit = (id: string, path: Set<string>): void => {if (path.has(id)) throw new Error('变体来源链形成循环，请修正上游关系。'); for (const parent of links.get(id) ?? []) visit(parent, new Set([...path, id]));};
      visit(entry.sourceId, new Set());
    }
    const previous = this.db.prepare('SELECT data,revision FROM research_entries WHERE id=?').get(entry.id) as {data: string; revision: number} | undefined;
    if (previous) {
      const old = JSON.parse(previous.data) as ResearchEntry;
      if (entry.revision !== previous.revision + 1) throw new Error('研究记录已被修改，请重新读取后保存。');
      if (old.kind !== entry.kind || old.environmentId !== entry.environmentId) throw new Error('记录类型与环境不能改变，请建立新记录。');
      if (old.kind === 'match' && entry.kind === 'match' && JSON.stringify(old.snapshot) !== JSON.stringify(entry.snapshot)) throw new Error('实战记录的队伍版本不可改写。');
    } else if (entry.revision !== 0) throw new Error('新研究记录必须从修订 0 开始。');
    const subject = 'draftId' in entry ? entry.draftId : entry.kind === 'source' ? entry.sourceId : entry.url;
    this.db.prepare('INSERT OR REPLACE INTO research_entries(id,kind,subject,environment_id,revision,data) VALUES(?,?,?,?,?,?)')
      .run(entry.id, entry.kind, subject, entry.environmentId, entry.revision, JSON.stringify(entry));
    return entry;
  }
  remove(id: string, revision: number): void {
    const result = this.db.prepare('DELETE FROM research_entries WHERE id=? AND revision=?').run(id, revision);
    if (!result.changes) throw new Error('记录已改变或不存在，未删除。');
  }
  sources(environmentId: string): SourceRegistration[] {
    return (this.db.prepare('SELECT data FROM source_registry WHERE environment_id=?').all(environmentId) as {data: string}[]).map(row => JSON.parse(row.data));
  }
  saveSource(source: SourceRegistration, previousId = source.id): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (previousId !== source.id) this.db.prepare('DELETE FROM source_registry WHERE id=? AND environment_id=?').run(previousId, source.environmentId);
      this.db.prepare('INSERT OR REPLACE INTO source_registry(id,environment_id,data) VALUES(?,?,?)').run(source.id, source.environmentId, JSON.stringify(source));
      this.db.exec('COMMIT');
    } catch (error) {this.db.exec('ROLLBACK'); throw error;}
  }
}
