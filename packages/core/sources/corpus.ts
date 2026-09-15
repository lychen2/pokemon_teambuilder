import {parse} from 'csv-parse/sync';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import type {BattleEngine} from '../battle/engine';
import {complete, hash, teamKey} from '../domain';
import type {Corpus, SetObservation, SourceReport, SourceTeam} from '../types';

export const SPREADSHEET_ID = '1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw';
export interface SheetSource {season: string; gid: string; documentId?: string}
export interface SheetRow {id: string; description: string; author: string; date: string; event: string; rank: string; url: string; originUrl: string}
export type TextFetcher = (url: string, signal?: AbortSignal) => Promise<string>;
export const fetchText: TextFetcher = async (url, signal) => {
  const response = await fetch(url, {signal, headers: {'User-Agent': 'Poke-Teambuilder/0.1'}});
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.text();
};

export function parseSheet(csv: string, source: SheetSource): {title: string; rows: SheetRow[]; missingColumns: string[]} {
  const data = parse(csv, {bom: true, relax_column_count: true}) as string[][];
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s_/-]+/g, ' ');
  const aliases: Record<keyof SheetRow, string[]> = {
    id: ['team id', 'team number', '队伍编号'], url: ['pokepaste', 'poke paste', 'pokepaste link', 'paste url'],
    description: ['team description', 'description', '队伍说明'], author: ['owner', 'author', '作者'],
    date: ['date shared', 'shared date', 'date', '分享日期'], event: ['tournament event', 'tournament', 'event', '赛事'],
    rank: ['rank', 'placing', 'placement', '名次'], originUrl: ['link to source', 'source link', '来源链接'],
  };
  const headerIndex = data.findIndex(row => ['id', 'url'].every(key => row.some(cell => aliases[key as keyof SheetRow].includes(normalize(cell)))));
  if (headerIndex < 0) throw new Error(`${source.season} 分表缺少 Team ID / Pokepaste 表头。`);
  const title = data.flat().find(cell => /VGCPastes Repository.*Champions/.test(cell)) ?? '';
  if (!title.includes(source.season)) throw new Error(`分表赛季不匹配：期望 ${source.season}，实际 ${title}`);
  const headers = data[headerIndex].map(normalize);
  const columns = Object.entries(aliases).map(([key, names]) => ({key: key as keyof SheetRow, index: headers.findIndex(h => names.includes(h))}));
  const missingColumns = columns.filter(c => c.index < 0).map(c => c.key);
  const rows = data.slice(headerIndex + 1).map(row => Object.fromEntries(columns.map(({key, index}) => [key, index < 0 ? '' : (row[index] ?? '').trim()])) as unknown as SheetRow)
    .filter(row => /^[A-Za-z]+\d+$/.test(row.id) || row.url.includes('pokepast.es/'));
  if (!rows.length) throw new Error(`${source.season} 分表中没有队伍条目。`);
  return {title, rows, missingColumns};
}

export function canonicalPasteUrl(url: string): string {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.hostname !== 'pokepast.es' || !/^\/[a-f0-9]{16}\/?$/.test(parsed.pathname)) throw new Error(`无效的 PokePaste 地址：${url}`);
  return `https://pokepast.es/${parsed.pathname.split('/')[1]}/raw`;
}

export class PasteCache {
  constructor(readonly directory: string, readonly bundledDirectory?: string) {}
  async get(url: string): Promise<string | null> {
    for (const directory of [this.directory, this.bundledDirectory].filter((d): d is string => !!d)) {
      try {return await readFile(join(directory, `${hash(url)}.txt`), 'utf8');}
      catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;}
    }
    return null;
  }
  async put(url: string, text: string): Promise<void> {await mkdir(this.directory, {recursive: true}); await writeFile(join(this.directory, `${hash(url)}.txt`), text);}
}

export async function importCorpus(options: {
  sources: SheetSource[]; engine: BattleEngine; cache: PasteCache; fetcher?: TextFetcher;
  refresh?: boolean; signal?: AbortSignal; progress?: (message: string, done: number, total: number) => void;
}): Promise<Corpus> {
  const fetcher = options.fetcher ?? fetchText;
  const teams: SourceTeam[] = []; const observations: SetObservation[] = []; const reports: SourceReport[] = [];
  const targetSeason = options.engine.snapshot().season;
  for (const source of options.sources) {
    options.signal?.throwIfAborted();
    const documentId = source.documentId ?? SPREADSHEET_ID;
    if (!/^[\w-]+$/.test(documentId) || !/^\d+$/.test(source.gid)) throw new Error('共享表 documentId 或 gid 格式不正确。');
    const csv = await fetcher(`https://docs.google.com/spreadsheets/d/${documentId}/export?format=csv&gid=${encodeURIComponent(source.gid)}`, options.signal);
    const sheet = parseSheet(csv, source);
    const report: SourceReport = {season: source.season, gid: source.gid, documentId, title: sheet.title, rows: sheet.rows.length, fetched: 0, complete: 0, partial: 0, invalid: 0, failed: 0, errors: [], missingColumns: sheet.missingColumns};
    let next = 0; let done = 0;
    const worker = async () => {
      while (next < sheet.rows.length) {
        options.signal?.throwIfAborted();
        const row = sheet.rows[next++];
        const id = `${documentId}:${source.gid}:${row.id}`;
        const team: SourceTeam = {...row, id, sheetId: source.gid, documentId, season: source.season, raw: '', fingerprint: '', observationIds: [], status: 'fetch-error', errors: []};
        try {
          const rawUrl = canonicalPasteUrl(row.url);
          const cached = options.refresh ? null : await options.cache.get(rawUrl);
          const raw = cached ?? await fetcher(rawUrl, options.signal);
          if (cached === null) await options.cache.put(rawUrl, raw);
          report.fetched++;
          team.raw = raw;
          const parsed = options.engine.parse(raw, source.season === targetSeason ? 'observed' : 'historical');
          if (parsed.sets.length !== options.engine.ruleTable.maxTeamSize) team.errors.push(`队伍包含 ${parsed.sets.length} 只，期望 ${options.engine.ruleTable.maxTeamSize} 只。`);
          team.fingerprint = teamKey(parsed.sets);
          for (const [slot, set] of parsed.sets.entries()) {
            const observationId = `${id}:${slot}`;
            const known = {points: set.points !== null, nature: set.natureId !== null, ability: set.abilityId !== null, item: set.itemId !== null, moves: set.moves.length === 4};
            const errors = options.engine.validateKnownSet(set);
            const observation: SetObservation = {id: observationId, teamId: id, season: source.season, slot, set: {...set, sourceIds: [observationId]}, date: row.date, author: row.author, url: row.url, known, currentLegal: complete(set) && !errors.length, knownLegal: !errors.length, errors};
            observations.push(observation); team.observationIds.push(observationId);
            team.errors.push(...errors.map(e => `${options.engine.display(set.speciesId)}：${e}`));
          }
          const allComplete = parsed.sets.every(complete);
          if (allComplete && parsed.sets.length === options.engine.ruleTable.maxTeamSize) team.errors.push(...(options.engine.validator.validateTeam(parsed.sets.map(s => options.engine.toPS(s))) ?? []));
          team.status = team.errors.length ? 'invalid' : allComplete && !parsed.issues.length ? 'valid' : 'partial';
          team.errors.push(...parsed.issues);
          if (team.status === 'valid') report.complete++;
          else if (team.status === 'partial') report.partial++;
          else report.invalid++;
        } catch (error) {
          if (options.signal?.aborted) throw error;
          const message = error instanceof Error ? error.message : String(error);
          team.status = 'fetch-error'; team.errors.push(message); report.failed++;
          report.errors.push({id, url: row.url, message});
        }
        teams.push(team); done++;
        if (done % 20 === 0 || done === sheet.rows.length) options.progress?.(`${source.season}：${done}/${sheet.rows.length}，失败 ${report.failed}`, done, sheet.rows.length);
      }
    };
    // Modest I/O concurrency; every unsuccessful row remains visible in the report.
    await Promise.all(Array.from({length: 6}, worker));
    reports.push(report);
  }
  teams.sort((a, b) => a.id.localeCompare(b.id)); observations.sort((a, b) => a.id.localeCompare(b.id));
  return {version: hash(teams.map(t => [t.id, t.fingerprint, t.raw, t.errors])), updatedAt: new Date().toISOString(), teams, observations, reports};
}
