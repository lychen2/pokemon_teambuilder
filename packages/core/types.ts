import type {ResearchEntry, ResearchState, SourceRegistration, ResearchDocument} from './research/types';
import type {DocumentInput} from './research/documents';
import type {ScenarioResult} from './analysis/scenarios';
import type {SelectionAnalysis} from './analysis/selections';
import type {RoleKnowledge} from './analysis/role-knowledge';
import type {RiskComparison} from './battle/risk';
import type {EnvironmentBenchmarkRequest, EnvironmentBenchmarks, DurabilityRequest, DurabilityAnalysis} from './analysis/environment-benchmarks';
import type {MaintenanceReport, StorageReport} from './maintenance';
export const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
export type Stat = typeof STAT_KEYS[number];
export type Stats = Record<Stat, number>;
export type Season = string;
export type SourceKind = 'observed' | 'historical' | 'generated' | 'manual';
export type LockField = 'itemId' | 'abilityId' | 'natureId' | 'moves' | 'points';

export interface PokemonSet {
  speciesId: string;
  itemId: string | null;
  abilityId: string | null;
  natureId: string | null;
  points: Stats | null;
  moves: string[];
  gender?: 'M' | 'F';
  level: number;
  sourceKind: SourceKind;
  sourceIds: string[];
}
export interface TeamMember {id: string; set: PokemonSet; lock: {species: boolean; fields: LockField[]}}
export interface TeamDraft {
  id: string;
  name: string;
  revision: number;
  analysisRevision: number;
  environmentId: string;
  members: TeamMember[];
  notes: string;
  updatedAt: string;
}
export interface EngineManifest {
  id: string;
  showdownRevision: string;
  calcRevision: string;
  source: 'official' | 'local';
  builtAt: string;
  hashes: Record<string, string>;
}
export interface EnvironmentSnapshot {
  id: string;
  engineId: string;
  formatId: string;
  name: string;
  season: Season;
  mod: string;
  rules: string[];
  ruleHash: string;
  generatedAt: string;
  sourceRevision: string;
  calcRevision: string;
  points: {total: number; perStat: number};
  teamSize: number;
  pickedTeamSize: number;
  speciesIds: string[];
  verified: boolean;
}
export interface NamedData {id: string; name: string; zh: string; description?: string}
export interface SpeciesData extends NamedData {
  baseSpeciesId: string;
  types: string[];
  stats: Stats;
  abilities: string[];
  moves: string[];
  megaForms: {speciesId: string; itemId: string; abilityId: string; name: string; zh: string; types: string[]; stats: Stats}[];
}
export interface DexData {
  species: SpeciesData[];
  items: NamedData[];
  abilities: NamedData[];
  moves: (NamedData & {type: string; category: string; basePower: number; priority: number; target: string; accuracy: number | true})[];
  natures: (NamedData & {plus?: Stat; minus?: Stat})[];
}
export interface SourceTeam {
  id: string;
  sheetId: string;
  documentId?: string;
  season: Season;
  description: string;
  author: string;
  date: string;
  event: string;
  rank: string;
  url: string;
  originUrl: string;
  raw: string;
  fingerprint: string;
  observationIds: string[];
  status: 'valid' | 'partial' | 'invalid' | 'fetch-error';
  errors: string[];
}
export interface SetObservation {
  id: string;
  teamId: string;
  season: Season;
  slot: number;
  set: PokemonSet;
  date: string;
  author: string;
  url: string;
  known: {points: boolean; nature: boolean; ability: boolean; item: boolean; moves: boolean};
  currentLegal: boolean;
  knownLegal?: boolean;
  errors: string[];
}
export interface SourceReport {
  season: string;
  gid: string;
  documentId?: string;
  title: string;
  rows: number;
  fetched: number;
  complete: number;
  partial: number;
  invalid: number;
  failed: number;
  errors: {id: string; url: string; message: string}[];
  missingColumns?: string[];
}
export interface Corpus {
  version: string;
  updatedAt: string;
  teams: SourceTeam[];
  observations: SetObservation[];
  reports: SourceReport[];
}
export interface Archetype {
  id: string;
  speciesId: string;
  label: string;
  representative: PokemonSet;
  observationIds: string[];
  currentCount: number;
  historyCount: number;
  currentShare: number;
  stability: number | null;
  spread: number;
  roles: string[];
  sourceKind: 'observed' | 'historical';
  partialEvidence?: {observationId: string; weight: number}[];
}
/** One complete, legal, actually observed set. An archetype may contain many configurations. */
export interface Configuration {
  id: string;
  archetypeId: string;
  speciesId: string;
  set: PokemonSet;
  isRepresentative: boolean;
  roles: string[];
  observationIds: string[];
  currentCount: number;
  historyCount: number;
  currentShare: number;
  partialEvidence: {observationId: string; weight: number}[];
}
export interface Model {
  version: string;
  algorithmVersion: string;
  corpusVersion: string;
  archetypes: Archetype[];
  currentTeams: number;
  priorStrength: number;
  tuning: {validationSamples: number; negativeLogLikelihood: number | null};
  partialEvidence?: {considered: number; assigned: number; unmatched: number; invalid: number};
  calibration?: {temperature: number; samples: number; before: number | null; after: number | null; cutoff: string | null; diagnostics?: {before: import('./analysis/calibration').ProbabilityReport; after: import('./analysis/calibration').ProbabilityReport}};
}
export interface ValidationIssue {memberId?: string; field?: string; message: string; severity: 'error' | 'incomplete'}
export interface BattleField {
  weather?: string;
  terrain?: string;
  trickRoom?: boolean;
  attackerTailwind?: boolean;
  defenderTailwind?: boolean;
  attackerMega?: boolean;
  defenderMega?: boolean;
  attackerBoosts?: Partial<Stats>;
  defenderBoosts?: Partial<Stats>;
  intimidateAttacker?: boolean;
  intimidateDefender?: boolean;
  helpingHand?: boolean;
  reflect?: boolean;
  lightScreen?: boolean;
  friendGuard?: boolean;
  defenderProtect?: boolean;
  attackerStatus?: string;
  defenderStatus?: string;
  singleTarget?: boolean;
  attackerHPPercent?: number;
  defenderHPPercent?: number;
  attackerItemConsumed?: boolean;
  defenderItemConsumed?: boolean;
  attackerAbilityActive?: boolean;
  defenderAbilityActive?: boolean;
  attackerFaintedAllies?: number;
  defenderFaintedAllies?: number;
  hits?: number;
  critical?: boolean;
  defenderHelpingHand?: boolean;
  attackerReflect?: boolean;
  attackerLightScreen?: boolean;
  attackerFriendGuard?: boolean;
  attackerProtect?: boolean;
  attackerAbilityId?: string;
  defenderAbilityId?: string;
  attackerItemId?: string;
  defenderItemId?: string;
}
export interface DamageResult {
  moveId: string;
  rolls: number[];
  min: number;
  max: number;
  defenderHP: number;
  minPercent: number;
  maxPercent: number;
  ohko: number;
  description: string;
  hits: number;
  hitCounts: {hits: number; probability: number}[];
  currentHP: number;
  expectedDamage: number;
  condition: string;
}
export interface PosteriorEntry {archetypeId: string; probability: number; evidence: string[]}
export interface ConfigurationPosteriorEntry extends PosteriorEntry {configurationId: string}
export interface ThreatResult {
  archetypeId: string;
  configurationId: string;
  speciesId: string;
  set: PokemonSet;
  weight: number;
  bestAttackerId: string | null;
  bestDamage: number;
  bestKO: number;
  moveId: string | null;
  field: BattleField;
  incomingDamage: number;
  outspeedCount: number;
  difficulty: number;
}
export interface TeamAnalysis {
  draftId: string;
  inputHash: string;
  modelVersion: string;
  environmentId: string;
  corpusVersion: string;
  revision: number;
  algorithmVersion: string;
  elapsedMs: number;
  metrics: {pressure: number; resilience: number; speed: number; coverage: number; tailRisk: number};
  members: {memberId: string; stats: Stats; megaStats?: Stats; roles: string[]; partners: string[]}[];
  threats: ThreatResult[];
  strengths: string[];
  concerns: string[];
  validation: ValidationIssue[];
  complete: boolean;
  scope: {archetypes: number; sampleMass: number; conditions: string[]};
}
export interface SpeedRequest {draft: TeamDraft; memberId: string; field: BattleField}
export interface SpeedAnalysis {
  draftId: string;
  revision: number;
  environmentId: string;
  corpusVersion: string;
  modelVersion: string;
  algorithmVersion: string;
  inputHash: string;
  memberId: string;
  field: BattleField;
  naturalSpeed: number;
  rows: {archetypeId: string; configurationId: string; speciesId: string; set: PokemonSet; label: string; currentCount: number; ownSpeed: number; opponentSpeed: number; order: 'before' | 'tie' | 'after'}[];
  conditions: string[];
}
export interface Proposal {
  id: string;
  draftId: string;
  inputHash: string;
  modelVersion: string;
  kind: 'add' | 'complete' | 'replace' | 'spread';
  title: string;
  baseRevision: number;
  environmentId: string;
  corpusVersion: string;
  algorithmVersion: string;
  members: TeamMember[];
  benefits: string[];
  tradeoffs: string[];
  metrics: TeamAnalysis['metrics'];
  sourceUrls: string[];
  generated: boolean;
  elapsedMs: number;
  lineupComparisons?: {opponentSpecies: string[]; sourceIds: string[]; seasons: string[]; missingSpecies: string[]; coveredProbability: number; before: LineupEvidence; after: LineupEvidence}[];
  search?: {budgetMs: number | null; deadlineReached: boolean; evaluatedStates: number; reusedStates?: number; completedLayers: number};
}
export interface LineupEvidence {members: string[]; megaId: string | null; field: BattleField; metrics: TeamAnalysis['metrics']}
export interface RecommendationRequest {
  draft: TeamDraft;
  kind: 'add' | 'complete' | 'replace';
  memberId?: string;
  limit?: number;
  options?: {candidateBudget?: number; beamWidth?: number; retainedConfigurationIds?: string[]; allowHistorical?: boolean; timeBudgetMs?: number; weights?: TeamAnalysis['metrics']};
}
export interface SpreadRequest {
  draft: TeamDraft;
  memberId: string;
  speedTarget?: number;
  field?: BattleField;
  attackTarget?: PokemonSet;
  attackMove?: string;
  attackChance?: number;
  defendTarget?: PokemonSet;
  defendMove?: string;
  survivePercent?: number;
  speedBenchmark?: {opponent: PokemonSet; field: BattleField; order: 'before' | 'tie-or-before'};
  conditions?: {name: string; field: BattleField; attackTarget?: PokemonSet; defendTarget?: PokemonSet}[];
  previewOnly?: boolean;
}
export interface SpreadGoalCheck {
  kind: 'speed' | 'attack' | 'defend'; label: string; achievable: boolean;
  current: string; best: string; bestPoints: Stats; minimumPoints: number | null;
}
export interface SpreadResult {
  status: 'success' | 'unreachable'; proposal: Proposal | null; optimizedSet: PokemonSet | null;
  goals: SpreadGoalCheck[]; visited: number; pruned: number; explanation: string[]; exact: boolean;
  pointBudget: number; remainingPoints: number | null;
}
export interface MemberStats {
  stats: Stats | null; megaStats: Stats | null; battleSpeed: number | null; megaBattleSpeed: number | null;
  level: number; missing: string[]; issues: string[];
}
export interface JobProgress {
  id: string;
  kind: 'sync' | 'engine' | 'model' | 'simulate' | 'benchmark';
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  phase: string;
  progress: number | null;
  message: string;
  draftRevision?: number;
  draftId?: string;
  environmentId?: string;
  result?: SimulationResult | UpdateResult;
  error?: string;
  failure?: {seed: number; turn: number; trace: string[]};
}
export interface SimulationRequest {
  draft: TeamDraft;
  opponentSpecies?: string[];
  opponentTeamId?: string;
  opponentTeam?: PokemonSet[];
  allowHistoricalOpponents?: boolean;
  seconds: number;
  seed: number;
  mode: 'closed' | 'open';
  baseline?: TeamMember[];
  trials?: number;
  trainingTrials?: number;
  strategy?: 'pressure' | 'control' | 'mixed' | 'damage' | 'support';
  opponentPolicies?: ('pressure' | 'control' | 'mixed' | 'damage' | 'support')[];
  beliefSamples?: number;
  context?: {corpusVersion: string; modelVersion: string; algorithmVersion: string};
}
export interface SimulationResult {
  draftId: string;
  inputHash: string;
  modelVersion: string;
  environmentId: string;
  revision: number;
  corpusVersion: string;
  algorithmVersion: string;
  seed: number;
  mode: 'closed' | 'open';
  completed: number;
  wins: number;
  losses: number;
  ties: number;
  unfinished: number;
  winRate: number | null;
  interval: [number, number] | null;
  meanTurns: number;
  elapsedMs: number;
  policies: string[];
  selections: {members: string[]; leads: string[]; count: number; wins: number}[];
  opponents: {teamId: string; trials: number; wins: number}[];
  opponentEvidence?: {seasons: string[]; historical: boolean; sourceCount: number; mode: 'sources' | 'species' | 'provided'};
  paired?: {wins: number; losses: number; ties: number; trials: number; delta: number};
  trace: string[];
  trainingGames: number;
  baselineTrainingGames: number;
  searchNodes: number;
  tailRisk: number | null;
  cancelled: boolean;
  replays?: {index: number; seed: number; opponentId: string; policy: string; reward: number; turns: number; selected: string[]; trace: string[]; decisions: {turn: number; side: string; command: string; informationKey: string}[]}[];
  strategy?: string;
  beliefEvidence?: {beliefs: number; generated: number; queries: number};
  treeDiagnostics?: {nodes: number; visited: number; decisions: number; reusedDecisions: number; evaluationDecisions: number; evaluationReuse: number; actions: number; visitHistogram: {upper: number; nodes: number}[]; above100: number};
}
export interface UpdateResult {
  environment: EnvironmentSnapshot;
  formats: {id: string; name: string}[];
  addedSpecies: string[];
  removedSpecies: string[];
  changedSpecies: string[];
  changedMoves: string[];
  changedItems: string[];
  changedAbilities: string[];
  changedRules: boolean;
  mechanicsChanged: boolean;
  tests: string[];
}
export interface AppState {
  algorithmVersion: string;
  activeEnvironmentId: string;
  environment: EnvironmentSnapshot;
  environments: EnvironmentSnapshot[];
  dex: DexData;
  drafts: TeamDraft[];
  corpus: Omit<Corpus, 'observations'>;
  model: Model;
  configurations: Configuration[];
  dataDirectory: string;
  recoveredDraftId?: string;
}
export interface BootstrapData {environment: EnvironmentSnapshot; engine: EngineManifest; dex: DexData; corpus: Corpus; model: Model; translations: Record<string, string>}
export interface ServiceMethods {
  environmentBenchmarks: {input: EnvironmentBenchmarkRequest; output: EnvironmentBenchmarks};
  durabilityBenchmarks: {input: DurabilityRequest; output: DurabilityAnalysis};
  documents: {input: {environmentId: string}; output: ResearchDocument[]};
  prepareDocument: {input: DocumentInput; output: ResearchDocument};
  maintenance: {input: undefined; output: MaintenanceReport};
  cleanStorage: {input: {planHash: string; analysisCache: boolean; unusedVersions: boolean; compact: boolean; memoryCache: boolean}; output: StorageReport};
  risk: {input: {environmentId: string; attacker: PokemonSet; defender: PokemonSet; field: BattleField}; output: RiskComparison};
  selections: {input: {draft: TeamDraft; opponentSpecies?: string[]}; output: SelectionAnalysis};
  roleKnowledge: {input: {environmentId: string}; output: RoleKnowledge};
  scenarios: {input: {environmentId: string; attacker: PokemonSet; defender: PokemonSet; field: BattleField; variants: {name: string; defender?: PokemonSet; field: BattleField}[]}; output: ScenarioResult[]};
  research: {input: {draftId: string; environmentId: string}; output: ResearchState};
  saveResearch: {input: ResearchEntry; output: ResearchEntry};
  deleteResearch: {input: {id: string; revision: number}; output: void};
  sources: {input: {environmentId: string}; output: SourceRegistration[]};
  saveSource: {input: SourceRegistration; output: SourceRegistration};
  bootstrap: {input: undefined; output: AppState};
  saveDraft: {input: TeamDraft; output: TeamDraft};
  deleteDraft: {input: {id: string}; output: void};
  history: {input: {id: string}; output: TeamDraft[]};
  parse: {input: {text: string; environmentId: string}; output: {sets: PokemonSet[]; issues: string[]}};
  export: {input: TeamDraft; output: string};
  validate: {input: TeamDraft; output: ValidationIssue[]};
  analyze: {input: TeamDraft; output: TeamAnalysis};
  recommend: {input: RecommendationRequest; output: Proposal[]};
  optimizeSpread: {input: SpreadRequest; output: SpreadResult};
  memberStats: {input: {environmentId: string; set: PokemonSet; field: BattleField}; output: MemberStats};
  damage: {input: {attacker: PokemonSet; defender: PokemonSet; field: BattleField; environmentId: string}; output: DamageResult[]};
  speed: {input: SpeedRequest; output: SpeedAnalysis};
  posterior: {input: {speciesId: string; teammates: string[]; known?: Partial<PokemonSet>; environmentId: string}; output: ConfigurationPosteriorEntry[]};
  applyProposal: {input: {draft: TeamDraft; proposal: Proposal}; output: TeamDraft};
  sync: {input: {sources: {season: string; gid: string; documentId?: string}[]; environmentId: string}; output: string};
  checkUpdates: {input: undefined; output: {revision: string; current: string; available: boolean}};
  prepareUpdate: {input: {source: 'official' | 'local'; localPath?: string; formatId?: string}; output: string};
  activateEnvironment: {input: {environmentId: string}; output: void};
  migrateDraft: {input: {draft: TeamDraft; environmentId: string}; output: {draft: TeamDraft; issues: ValidationIssue[]}};
  simulate: {input: SimulationRequest; output: string};
  replayJob: {input: {id: string}; output: string};
  cancelJob: {input: {id: string}; output: void};
  jobs: {input: undefined; output: JobProgress[]};
  environmentState: {input: {environmentId: string}; output: AppState};
}
export type Method = keyof ServiceMethods;
export interface DesktopApi {
  call<M extends Method>(method: M, input: ServiceMethods[M]['input']): Promise<ServiceMethods[M]['output']>;
  onProgress(listener: (event: JobProgress) => void): () => void;
  onBeforeClose(listener: () => Promise<void>): () => void;
  openExternal(url: string): Promise<void>;
  chooseDirectory(): Promise<string | null>;
  saveText(name: string, text: string): Promise<boolean>;
}
