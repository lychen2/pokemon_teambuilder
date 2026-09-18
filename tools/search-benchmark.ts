import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {cpus, platform, arch} from 'node:os';
import {execFileSync} from 'node:child_process';
import type {BootstrapData, PokemonSet, Proposal} from '../packages/core/types';
import {BattleEngine} from '../packages/core/battle/engine';
import {MetaModel} from '../packages/core/analysis/model';
import {Evaluator, QUICK_SEARCH} from '../packages/core/analysis/evaluate';
import {TeamSearch} from '../packages/core/analysis/search';
import {ALGORITHM_VERSION, createDraft, member, setKey} from '../packages/core/domain';

const args = process.argv.slice(2);
if (args.some(arg => !/^--(output|compare)=.+/.test(arg))) throw new Error('Usage: search-benchmark.ts [--output=path] [--compare=baseline.json]');
const output = args.find(arg => arg.startsWith('--output='))?.slice(9) ?? '.local/search-benchmark.json';
const compare = args.find(arg => arg.startsWith('--compare='))?.slice(10);
const b: BootstrapData = JSON.parse(await readFile('assets/bootstrap.json', 'utf8'));
const meta = new MetaModel(b.corpus, b.model, b.environment.season);
const sources = b.corpus.teams.filter(team => team.status === 'valid' && team.season === meta.season);
const sets = (ids: string[]) => ids.map(id => meta.observationById.get(id)!.set);
const categories: {name: string; matches: (set: PokemonSet) => boolean}[] = [
  {name: 'perish-song', matches: set => set.moves.includes('perishsong')},
  {name: 'revival', matches: set => set.moves.includes('revivalblessing')},
  {name: 'trick-room', matches: set => set.moves.includes('trickroom')},
  {name: 'terrain-unburden', matches: set => set.abilityId === 'unburden'},
  {name: 'sun', matches: set => set.itemId === 'charizarditey'},
  {name: 'pivot', matches: set => set.moves.includes('partingshot')},
];
const chosen = new Set<string>();
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
// IDs are random UI identities. Compare their references by roster position,
// preserving ordered sets, Mega choices, explanations and opponent scenarios.
function signature(proposals: Proposal[], draft: ReturnType<typeof createDraft>): string {
  return digest(JSON.stringify(proposals.map(proposal => {
    const normalize = (side: NonNullable<Proposal['lineupComparisons']>[number]['before'], members: Proposal['members']) => ({
      ...side, members: side.members.map(id => {
        const index = members.findIndex(member => member.id === id); assert.ok(index >= 0); return index;
      }), megaId: side.megaId === null ? null : (() => {
        const index = members.findIndex(member => member.id === side.megaId); assert.ok(index >= 0); return index;
      })(),
    });
    return {sets: proposal.members.map(member => setKey(member.set)), locks: proposal.members.map(member => member.lock),
      metrics: proposal.metrics, title: proposal.title, benefits: proposal.benefits, tradeoffs: proposal.tradeoffs,
      sourceUrls: proposal.sourceUrls, generated: proposal.generated, search: proposal.search,
      lineups: proposal.lineupComparisons?.map(row => ({...row, before: normalize(row.before, draft.members), after: normalize(row.after, proposal.members)}))};
  })));
}
const rows = [];
for (const category of categories) {
  const source = sources.find(team => !chosen.has(team.fingerprint) && sets(team.observationIds).some(category.matches));
  assert.ok(source, `Missing real source for ${category.name}`); chosen.add(source.fingerprint);
  const engine = new BattleEngine(resolve('assets/engines', b.engine.id), b.environment.formatId, b.translations);
  const evaluator = new Evaluator(engine, meta); const search = new TeamSearch(evaluator);
  const draft = {...createDraft(b.environment.id), members: sets(source.observationIds).slice(0, 2).map(member)};
  let evaluations = 0;
  const lineup = evaluator.lineup.bind(evaluator);
  evaluator.lineup = (...args) => {evaluations++; return lineup(...args);};
  for (const cache of ['cold', 'warm'] as const) {
    const previousQueries = evaluator.damageQueries; const previousEvaluations = evaluations;
    const start = performance.now(); const proposals = search.recommend({draft, kind: 'complete'}); const elapsedMs = performance.now() - start;
    assert.ok(proposals.length);
    for (const proposal of proposals) {
      assert.equal(proposal.members.length, engine.ruleTable.maxTeamSize);
      assert.equal(new Set(proposal.members.map(member => member.id)).size, proposal.members.length);
      assert.deepEqual(proposal.members.slice(0, draft.members.length), draft.members);
      assert.deepEqual(engine.validateDraft({...draft, members: proposal.members}), []);
    }
    const row = {category: category.name, source: source.id, url: source.url, cache, input: draft.members.map(member => setKey(member.set)), elapsedMs,
      damageQueries: evaluator.damageQueries - previousQueries, lineupEvaluations: evaluations - previousEvaluations,
      search: proposals[0].search, solutions: proposals.length, signature: signature(proposals, draft)};
    rows.push(row); console.log(JSON.stringify({category: row.category, cache, elapsedMs, lineupEvaluations: row.lineupEvaluations}));
  }
}
const sourceFiles = ['packages/core/analysis/search.ts', 'packages/core/analysis/lineups.ts', 'packages/core/analysis/evaluate.ts', 'tools/search-benchmark.ts', 'assets/bootstrap.json'];
const report = {createdAt: new Date().toISOString(), applicationVersion: JSON.parse(await readFile('package.json', 'utf8')).version,
  algorithmVersion: ALGORITHM_VERSION, revision: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
  runtime: {node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model},
  sourceSha256: Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, digest(await readFile(path))]))),
  engine: b.engine.id, environment: b.environment.id, corpus: b.corpus.version, model: b.model.version, budget: QUICK_SEARCH, rows,
  comparison: null as null | {baseline: string; equivalent: boolean; elapsedRatio: number},
  notes: ['Six distinct real development sources; complete their first two members using the default search without a deadline.',
    'Cold means a new Evaluator and TeamSearch; warm repeats that request on those instances. Module and process caches may already be warm.',
    'Elapsed time covers recommend including proposal explanations, excluding fixture loading and assertions. One observation per case/cache, not a latency percentile.',
    'Signatures cover ordered sets, locks, scores, search counts, explanations and normalized lineup references; wall time and random IDs are excluded.',
    'This is a performance and equivalence check, not independent battle-quality evidence.']};
if (compare) {
  const baseline: typeof report = JSON.parse(await readFile(compare, 'utf8'));
  for (const field of ['engine', 'environment', 'corpus', 'model', 'budget'] as const) assert.deepEqual(report[field], baseline[field]);
  assert.equal(rows.length, baseline.rows.length);
  for (const [index, row] of rows.entries()) {
    const previous = baseline.rows[index];
    assert.deepEqual([row.category, row.source, row.cache, row.input], [previous.category, previous.source, previous.cache, previous.input]);
    assert.equal(row.signature, previous.signature, `Search output changed: ${row.category}/${row.cache}`);
  }
  report.comparison = {baseline: compare, equivalent: true, elapsedRatio: rows.reduce((sum, row) => sum + row.elapsedMs, 0) / baseline.rows.reduce((sum, row) => sum + row.elapsedMs, 0)};
}
await mkdir(dirname(output), {recursive: true}); await writeFile(output, JSON.stringify(report, null, 2) + '\n');
