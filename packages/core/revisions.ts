import type {TeamDraft} from './types';

/** Only battle-relevant content participates; provenance and prose retain their own history. */
export function calculationContent(draft: TeamDraft): string {
  return JSON.stringify([draft.environmentId, draft.members.map(({id, set, lock}) => [
    id, set.speciesId, set.itemId, set.abilityId, set.natureId,
    set.points && ['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map(stat => set.points![stat as keyof typeof set.points]),
    [...set.moves].sort(), set.gender, set.level, lock.species, [...lock.fields].sort(),
  ])]);
}

export function advanceDraft(previous: TeamDraft, next: TeamDraft): TeamDraft {
  return {
    ...next,
    revision: previous.revision + 1,
    analysisRevision: previous.analysisRevision + Number(calculationContent(previous) !== calculationContent(next)),
    updatedAt: new Date().toISOString(),
  };
}
