import {useCallback, useEffect, useId, useRef, useState} from 'react';
import type {ResearchEntry, ResearchState} from '../../../../packages/core/research/types';
import type {Workspace} from './useWorkspace';

export function useResearch(w: Workspace) {
  const [data, setData] = useState<ResearchState | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const origin = useId();
  const draftId = w.draft!.id; const environmentId = w.draft!.environmentId;
  const reload = useCallback(async () => {
    const version = ++generation.current;
    const result = await window.poke.call('research', {draftId, environmentId});
    if (version === generation.current) setData(result);
  }, [draftId, environmentId]);
  useEffect(() => {setData(null); void reload().catch(w.report); return () => {generation.current++;};}, [reload, w.report]);
  useEffect(() => {
    const changed = (event: Event) => {const detail = (event as CustomEvent).detail; if (detail.origin !== origin && detail.environmentId === environmentId) void reload().catch(w.report);};
    window.addEventListener('poke:research-changed', changed); return () => window.removeEventListener('poke:research-changed', changed);
  }, [origin, environmentId, reload, w.report]);
  const save = async (entry: ResearchEntry) => {
    setBusy(true);
    try {
      const previous = data?.entries.find(row => row.id === entry.id);
      const result = await window.poke.call('saveResearch', {...entry, revision: previous ? entry.revision + 1 : 0, updatedAt: new Date().toISOString()});
      await reload(); window.dispatchEvent(new CustomEvent('poke:research-changed', {detail: {origin, environmentId}})); return result;
    } finally {setBusy(false);}
  };
  const remove = async (entry: ResearchEntry) => {
    await window.poke.call('deleteResearch', {id: entry.id, revision: entry.revision}); await reload(); window.dispatchEvent(new CustomEvent('poke:research-changed', {detail: {origin, environmentId}}));
  };
  return {data, busy, save, remove, reload};
}
export type ResearchWorkspace = ReturnType<typeof useResearch>;
