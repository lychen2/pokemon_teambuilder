import type {BattleField, PokemonSet, TeamDraft} from '../types';

export type VerificationStatus = 'idea' | 'tested' | 'rejected';
export interface MatchupRoute {
  id: string;
  name: string;
  selection: string[];
  leads: string[];
  winCondition: string;
  concerns: string;
  status: VerificationStatus;
}
interface Entry {
  id: string;
  revision: number;
  updatedAt: string;
  environmentId: string;
}
export interface MatchupPlan extends Entry {
  kind: 'plan';
  draftId: string;
  snapshot: TeamDraft;
  title: string;
  opponentSpecies: string[];
  routes: MatchupRoute[];
}
export interface MatchRecord extends Entry {
  kind: 'match';
  draftId: string;
  snapshot: TeamDraft;
  playedAt: string;
  opponentSpecies: string[];
  selection: string[];
  leads: string[];
  result: 'win' | 'loss' | 'tie' | 'unknown';
  category: 'practice' | 'ranked' | 'tournament';
  reasons: string[];
  notes: string;
  replayUrl: string;
  planId?: string;
  planContext?: {title: string; revision: number; route: MatchupRoute};
}
export interface ConditionTemplate extends Entry {
  kind: 'condition';
  draftId: string;
  title: string;
  attacker: PokemonSet;
  defender: PokemonSet;
  field: BattleField;
  variants: {name: string; defender?: PokemonSet; field: BattleField}[];
}
export interface SourceIntent extends Entry {
  kind: 'source';
  sourceId: string;
  originalAuthor: string;
  sharedBy: string;
  parentSourceIds: string[];
  maturity: 'unknown' | 'early' | 'tested';
  changes: string;
  intention: string;
  evidence: {url: string; quote: string}[];
}
export interface ResearchDocument extends Entry {
  kind: 'document';
  url: string;
  title: string;
  author: string;
  publishedAt: string;
  sourceType: 'rmt' | 'forum' | 'social' | 'guide' | 'replay';
  raw: string;
  claims: {quote: string; interpretation: string; confirmed: boolean}[];
  sampleMethod: string;
  replay?: {format: string; players: string[]; winner: string | null; turns: number; teams: {side: string; species: string[]}[]};
}
export interface ResearchPreferences extends Entry {
  kind: 'preferences';
  draftId: string;
  weights: {pressure: number; resilience: number; speed: number; coverage: number; tailRisk: number};
  retainedConfigurationIds: string[];
  allowHistorical?: boolean;
  notes: string;
}
export type ResearchEntry = MatchupPlan | MatchRecord | ConditionTemplate | SourceIntent | ResearchDocument | ResearchPreferences;
export interface MatchSummary {
  total: number;
  labelled: number;
  wins: number;
  losses: number;
  ties: number;
  selectionKnown: number;
  members: {speciesId: string; available: number; selected: number; led: number}[];
  reasons: {label: string; count: number}[];
  environments: string[];
}
export interface ResearchState {entries: ResearchEntry[]; summary: MatchSummary}

export interface SourceRegistration {
  id: string;
  environmentId: string;
  documentId: string;
  gid: string;
  season: string;
  title: string;
  enabled: boolean;
  sampleMethod: string;
  permissionNotes: string;
}
