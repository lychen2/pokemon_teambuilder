import type {BattleEngine} from '../battle/engine';
import type {Archetype, Configuration, ConfigurationPosteriorEntry, Corpus, Model, PokemonSet, SetObservation, PosteriorEntry} from '../types';
import {ALGORITHM_VERSION, complete, hash, setKey} from '../domain';
import {clusterFeatures, type Feature} from './clustering';
import {roles} from './roles';
import {attachPartialEvidence, matchesKnown} from './partial-evidence';
import {temporalSplit, scoreProbabilities} from './calibration';
import {configurationLibrary} from './configurations';

const categoricalKey = (s: PokemonSet) => [s.speciesId, s.abilityId, s.itemId, [...s.moves].sort().join(',')].join('|');
const dateValue = (s: string) => {const value = Date.parse(s); return Number.isFinite(value) ? value : 0;};

export function tunePrior(corpus: Corpus, season: string): {strength: number; samples: number; loss: number | null} {
  const fingerprints = new Map(corpus.teams.map(t => [t.id, t.fingerprint]));
  const seen = new Set<string>();
  const independent = corpus.observations.filter(o => {const key = `${o.season}:${fingerprints.get(o.teamId)}:${o.slot}`; if (seen.has(key)) return false; seen.add(key); return true;});
  const current = independent.filter(o => o.season === season && o.currentLegal && dateValue(o.date) > 0).sort((a, b) => dateValue(a.date) - dateValue(b.date));
  if (current.length < 24) return {strength: 1, samples: 0, loss: null};
  const split = temporalSplit(corpus, season);
  const held = new Set(split.held.map(team => team.id)); const allowed = new Set(split.train.teams.map(team => team.id));
  const validation = current.filter(o => held.has(o.teamId));
  if (!validation.length) return {strength: 1, samples: 0, loss: null};
  const train = current.filter(o => allowed.has(o.teamId));
  const history = independent.filter(o => o.season !== season && o.currentLegal && allowed.has(o.teamId));
  const count = (rows: SetObservation[], species: string, key: string) => {
    const relevant = rows.filter(o => o.set.speciesId === species);
    return {total: relevant.length, matching: relevant.filter(o => categoricalKey(o.set) === key).length};
  };
  const evidence = validation.map(row => {
    const key = categoricalKey(row.set);
    const now = count(train, row.set.speciesId, key); const old = count(history, row.set.speciesId, key);
    const vocabulary = new Set([...train, ...history].filter(o => o.set.speciesId === row.set.speciesId).map(o => categoricalKey(o.set))).size + 1;
    return {now, old, vocabulary};
  });
  let best = {strength: 1, samples: validation.length, loss: Infinity};
  for (const strength of [0, 0.5, 1, 2, 4, 8, 16, 32]) {
    let loss = 0;
    for (const {now, old, vocabulary} of evidence) {
      const historical = (old.matching + 1 / vocabulary) / (old.total + 1);
      const probability = (now.matching + strength * historical + 1 / vocabulary) / (now.total + strength + 1);
      loss -= Math.log(probability);
    }
    loss /= validation.length;
    if (loss < best.loss) best = {strength, samples: validation.length, loss};
  }
  return best;
}

export function fitModel(corpus: Corpus, engine: BattleEngine, progress?: (message: string) => void, calibrate = true): Model {
  const season = engine.snapshot().season;
  const tuning = tunePrior(corpus, season);
  const teamFingerprints = new Map(corpus.teams.map(t => [t.id, t.fingerprint]));
  const observations = corpus.observations.filter(o => o.currentLegal && complete(o.set));
  const speciesGroups = new Map<string, SetObservation[]>();
  for (const o of observations) {const group = speciesGroups.get(o.set.speciesId) ?? []; group.push(o); speciesGroups.set(o.set.speciesId, group);}
  const referenceGroups = [...speciesGroups.values()].sort((a, b) => b.filter(o => o.season === season).length - a.filter(o => o.season === season).length);
  const references = referenceGroups.slice(0, 6).map(group => {
    const set = group.find(o => o.season === season)?.set ?? group[0].set;
    return {set, speed: engine.stats(set, true).spe};
  });
  const archetypes: Archetype[] = [];
  let processed = 0;
  for (const [speciesId, group] of speciesGroups) {
    const unique = new Map<string, SetObservation[]>();
    for (const row of group) {const key = setKey(row.set); const rows = unique.get(key) ?? []; rows.push(row); unique.set(key, rows);}
    const records = [...unique.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, rows]) => rows);
    const independent = (rows: SetObservation[]) => new Set(rows.map(o => teamFingerprints.get(o.teamId))).size;
    const now = records.map(rows => independent(rows.filter(o => o.season === season)));
    const old = records.map(rows => independent(rows.filter(o => o.season !== season)));
    const nowTotal = now.reduce((a, b) => a + b, 0); const oldTotal = old.reduce((a, b) => a + b, 0);
    const features: Feature[] = records.map((rows, i) => {
      const set = rows[0].set;
      const stats = engine.stats(set, true);
      const thresholds = references.flatMap(target => {
        const damage = engine.damage(set, target.set);
        return [Number(stats.spe > target.speed), Math.max(...damage.map(d => d.ohko)), Math.min(1, Math.max(...damage.map(d => d.minPercent)) / 100)];
      });
      const weight = nowTotal ? now[i] + old[i] * tuning.strength / Math.max(1, oldTotal) : old[i] / Math.max(1, oldTotal);
      return {set, stats, thresholds, weight: Math.max(weight, Number.EPSILON)};
    });
    const clustered = clusterFeatures(features);
    for (const [index, members] of clustered.groups.entries()) {
      const costs = new Map(members.map(i => [i, members.reduce((sum, j) => sum + clustered.matrix[i][j] * features[j].weight, 0)]));
      const medoid = [...members].sort((a, b) => costs.get(a)! - costs.get(b)! || now[b] - now[a] || setKey(features[a].set).localeCompare(setKey(features[b].set)))[0];
      const rows = members.flatMap(i => records[i]);
      const currentCount = independent(rows.filter(o => o.season === season));
      const historyCount = independent(rows.filter(o => o.season !== season));
      const representative = structuredClone(features[medoid].set);
      representative.sourceKind = records[medoid].some(o => o.season === season) ? 'observed' : 'historical';
      representative.sourceIds = records[medoid].sort((a, b) => Number(b.season === season) - Number(a.season === season) || dateValue(b.date) - dateValue(a.date)).map(o => o.id);
      const tags = roles(representative);
      const item = engine.zh(engine.name('items', representative.itemId || ''));
      archetypes.push({
        id: hash([speciesId, setKey(representative)]), speciesId,
        label: [item || '无道具', tags.find(role => role !== '守住') || engine.zh(engine.name('natures', representative.natureId!))].join(' · '),
        representative, observationIds: rows.map(o => o.id), currentCount, historyCount,
        currentShare: currentCount / Math.max(1, independent(group.filter(o => o.season === season))),
        stability: clustered.stability[index], spread: members.reduce((sum, j) => sum + clustered.matrix[medoid][j], 0) / members.length,
        roles: tags, sourceKind: representative.sourceKind,
      });
    }
    processed++;
    if (processed % 10 === 0) progress?.(`配置流派 ${processed}/${speciesGroups.size}`);
  }
  archetypes.sort((a, b) => b.currentCount - a.currentCount || b.historyCount - a.historyCount || a.id.localeCompare(b.id));
  const partial = attachPartialEvidence(corpus, archetypes, season);
  const model: Model = {version: '', algorithmVersion: ALGORITHM_VERSION, corpusVersion: corpus.version, archetypes: partial.archetypes, currentTeams: new Set(corpus.teams.filter(t => t.season === season && t.status !== 'fetch-error').map(t => t.fingerprint)).size, priorStrength: tuning.strength, tuning: {validationSamples: tuning.samples, negativeLogLikelihood: tuning.loss}, partialEvidence: partial.report};
  if (calibrate) {
    const split = temporalSplit(corpus, season);
    model.calibration = {temperature: 1, samples: 0, before: null, after: null, cutoff: split.cutoff};
    if (split.held.length && split.train.teams.some(team => team.season === season)) {
      progress?.('在隔离作者与重复来源的时间留出上校准配置概率');
      const training = fitModel(split.train, engine, undefined, false);
      const meta = new MetaModel(split.train, training, season);
      const before = scoreProbabilities(meta, corpus, split.held, 1);
      const trials = [1, .65, 1.5, 2, 3].map(temperature => ({temperature, score: scoreProbabilities(meta, corpus, split.held, temperature)}));
      const best = trials.sort((a, b) => (a.score.logLoss ?? Infinity) - (b.score.logLoss ?? Infinity))[0];
      model.calibration = {temperature: best.temperature, samples: before.samples, before: before.logLoss, after: best.score.logLoss, cutoff: split.cutoff, diagnostics: {before, after: best.score}};
    }
  }
  model.version = hash([ALGORITHM_VERSION, corpus.version, engine.snapshot().id, model]);
  return model;
}

export class MetaModel {
  readonly observationById: Map<string, SetObservation>;
  readonly speciesByTeam: Map<string, Set<string>>;
  readonly archetypesBySpecies = new Map<string, Archetype[]>();
  readonly teamsBySpecies = new Map<string, Set<string>>();
  readonly canonicalTeamIds: Map<string, string>;
  readonly configurations: Configuration[];
  readonly configurationById: Map<string, Configuration>;
  readonly configurationsBySpecies = new Map<string, Configuration[]>();
  readonly configurationsByArchetype = new Map<string, Configuration[]>();
  private readonly configurationTeams = new Map<string, Set<string>>();
  private readonly archetypeTeams = new Map<string, Set<string>>();
  private readonly configurationCounts = new Map<string, {current: number; history: number}>();
  private readonly logPrior = new Map<string, number>();
  private readonly effectiveSupport = new Map<string, number>();
  constructor(readonly corpus: Corpus, readonly model: Model, readonly season: string) {
    this.observationById = new Map(corpus.observations.map(o => [o.id, o]));
    this.canonicalTeamIds = new Map(corpus.teams.map(t => [t.id, `${t.season}:${t.fingerprint || t.id}`]));
    this.speciesByTeam = new Map(corpus.teams.map(t => [t.id, new Set(t.observationIds.flatMap(id => this.observationById.has(id) ? [this.observationById.get(id)!.set.speciesId] : []))]));
    for (const t of corpus.teams) this.speciesByTeam.set(this.canonicalTeamIds.get(t.id)!, this.speciesByTeam.get(t.id)!);
    for (const a of model.archetypes) {const group = this.archetypesBySpecies.get(a.speciesId) ?? []; group.push(a); this.archetypesBySpecies.set(a.speciesId, group);}
    for (const o of corpus.observations.filter(o => o.season === season)) {const set = this.teamsBySpecies.get(o.set.speciesId) ?? new Set(); set.add(this.canonicalTeamIds.get(o.teamId)!); this.teamsBySpecies.set(o.set.speciesId, set);}
    this.configurations = configurationLibrary(corpus, model.archetypes, season);
    this.configurationById = new Map(this.configurations.map(configuration => [configuration.id, configuration]));
    for (const configuration of this.configurations) {
      const species = this.configurationsBySpecies.get(configuration.speciesId) ?? [];
      species.push(configuration); this.configurationsBySpecies.set(configuration.speciesId, species);
      const archetype = this.configurationsByArchetype.get(configuration.archetypeId) ?? [];
      archetype.push(configuration); this.configurationsByArchetype.set(configuration.archetypeId, archetype);
      const teams = new Set(configuration.observationIds.map(id => this.observationById.get(id)!).filter(row => row.season === season).map(row => this.canonicalTeamIds.get(row.teamId)!));
      this.configurationTeams.set(configuration.id, teams);
      const groupTeams = this.archetypeTeams.get(configuration.archetypeId) ?? new Set<string>();
      for (const team of teams) groupTeams.add(team);
      this.archetypeTeams.set(configuration.archetypeId, groupTeams);
      const counts = {current: configuration.currentCount, history: configuration.historyCount};
      for (const partial of configuration.partialEvidence) counts[this.observationById.get(partial.observationId)!.season === season ? 'current' : 'history'] += partial.weight;
      this.configurationCounts.set(configuration.id, counts);
    }
    for (const [species, configurations] of this.configurationsBySpecies) {
      const groups = this.archetypesBySpecies.get(species)!;
      const current = configurations.reduce((sum, row) => sum + this.configurationCounts.get(row.id)!.current, 0);
      const history = configurations.reduce((sum, row) => sum + this.configurationCounts.get(row.id)!.history, 0);
      this.effectiveSupport.set(species, current + (history ? model.priorStrength : 0));
      for (const group of groups) {
        const variants = this.configurationsByArchetype.get(group.id)!;
        const groupHistory = variants.reduce((sum, row) => sum + this.configurationCounts.get(row.id)!.history, 0);
        const groupPrior = (groupHistory + 1 / groups.length) / (history + 1);
        for (const configuration of variants) {
          const counts = this.configurationCounts.get(configuration.id)!;
          const withinGroupPrior = (counts.history + 1 / variants.length) / (groupHistory + 1);
          // Hierarchical Dirichlet mass: historical archetype -> real variant. The
          // single smoothing unit is shared across archetypes and then variants.
          this.logPrior.set(configuration.id, Math.log((counts.current + model.priorStrength * groupPrior * withinGroupPrior + 1 / (groups.length * variants.length)) / (current + model.priorStrength + 1)));
        }
      }
    }
  }

  configurationSupport(speciesId: string): number {return this.effectiveSupport.get(speciesId) ?? 0;}

  configurationPosterior(speciesId: string, teammates: string[] = [], known: Partial<PokemonSet> = {}, temperature = this.model.calibration?.temperature ?? 1): ConfigurationPosteriorEntry[] {
    if (!(temperature > 0 && Number.isFinite(temperature))) throw new Error('配置概率温度必须是正数。');
    const candidates = (this.configurationsBySpecies.get(speciesId) ?? []).filter(configuration => matchesKnown(configuration.set, known));
    if (!candidates.length) return [];
    const partners = [...new Set(teammates)].filter(id => id !== speciesId);
    const speciesTeams = this.teamsBySpecies.get(speciesId) ?? new Set<string>();
    const paired = (teams: Set<string>, partner: string) => [...teams].filter(id => this.speciesByTeam.get(id)?.has(partner)).length;
    const baseRates = new Map(partners.map(partner => [partner, (paired(speciesTeams, partner) + 1) / (speciesTeams.size + 2)]));
    const groupRates = new Map((this.archetypesBySpecies.get(speciesId) ?? []).map(group => {
      const teams = this.archetypeTeams.get(group.id)!;
      return [group.id, new Map(partners.map(partner => [partner, (paired(teams, partner) + 4 * baseRates.get(partner)!) / (teams.size + 4)]))];
    }));
    const scored = candidates.map(configuration => {
      let logP = this.logPrior.get(configuration.id)!;
      const teams = this.configurationTeams.get(configuration.id)!;
      const counts = this.configurationCounts.get(configuration.id)!;
      const evidence = [`该完整配置：当前独立构筑 ${configuration.currentCount}，历史独立构筑 ${configuration.historyCount}`, configuration.isRepresentative ? '流派的真实代表配置' : '同一流派内的真实变体，招式与配点未合并'];
      if (configuration.partialEvidence.length) evidence.push(`缺字段兼容权重：当前 ${(counts.current - configuration.currentCount).toFixed(2)}，历史 ${(counts.history - configuration.historyCount).toFixed(2)}`);
      if (this.model.calibration?.samples) evidence.push(`时间留出温度校准 ${temperature}；内部校准不代表独立盲测`);
      for (const partner of partners) {
        const support = paired(teams, partner);
        const conditional = (support + 4 * groupRates.get(configuration.archetypeId)!.get(partner)!) / (teams.size + 4);
        logP += Math.log(conditional / baseRates.get(partner)!) / Math.sqrt(partners.length);
        if (support) evidence.push(`与 ${partner} 共同出现 ${support} 队`);
      }
      return {configurationId: configuration.id, archetypeId: configuration.archetypeId, logP: logP / temperature, evidence};
    });
    const max = Math.max(...scored.map(s => s.logP)); const total = scored.reduce((sum, s) => sum + Math.exp(s.logP - max), 0);
    return scored.map(s => ({configurationId: s.configurationId, archetypeId: s.archetypeId, probability: Math.exp(s.logP - max) / total, evidence: s.evidence})).sort((a, b) => b.probability - a.probability || a.configurationId.localeCompare(b.configurationId));
  }

  posterior(speciesId: string, teammates: string[] = [], known: Partial<PokemonSet> = {}, temperature = this.model.calibration?.temperature ?? 1): PosteriorEntry[] {
    const grouped = new Map<string, PosteriorEntry>();
    for (const row of this.configurationPosterior(speciesId, teammates, known, temperature)) {
      const group = grouped.get(row.archetypeId) ?? {archetypeId: row.archetypeId, probability: 0, evidence: ['概率由满足已知字段的真实配置变体汇总']};
      group.probability += row.probability; grouped.set(row.archetypeId, group);
    }
    return [...grouped.values()].sort((a, b) => b.probability - a.probability);
  }

  pairing(a: string, b: string): {lift: number; support: number} {
    const left = this.teamsBySpecies.get(a) ?? new Set(); const right = this.teamsBySpecies.get(b) ?? new Set();
    const support = [...left].filter(id => right.has(id)).length;
    const total = new Set(this.corpus.teams.filter(t => t.season === this.season && t.status !== 'fetch-error').map(t => t.fingerprint)).size;
    const base = (right.size + 1) / (total + 2);
    const conditional = (support + 8 * base) / (left.size + 8);
    return {lift: Math.log2(conditional / base), support};
  }
}
