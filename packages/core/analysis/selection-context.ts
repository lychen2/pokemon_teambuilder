import type {TeamDraft} from '../types';
import type {SelectionAnalysis} from './selections';

export const canonicalOpponents = (species: readonly string[]) => [...new Set(species)].sort();

/** A route can only be saved/applied to the exact team, rules, data and opponent request. */
export function selectionIsCurrent(result: SelectionAnalysis | null, draft: TeamDraft, versions: {
  corpusVersion: string; modelVersion: string; algorithmVersion: string;
}, opponents: readonly string[]): boolean {
  return Boolean(result && result.draftId === draft.id && result.revision === draft.analysisRevision
    && result.environmentId === draft.environmentId && result.corpusVersion === versions.corpusVersion
    && result.modelVersion === versions.modelVersion && result.algorithmVersion === versions.algorithmVersion
    && JSON.stringify(result.opponentSpecies) === JSON.stringify(canonicalOpponents(opponents)));
}
