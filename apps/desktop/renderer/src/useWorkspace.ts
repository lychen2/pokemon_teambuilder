import {useState, useEffect, useRef, useCallback} from 'react';
import type {AppState, TeamDraft, Proposal, TeamAnalysis, JobProgress, PokemonSet} from '../../../../packages/core/types';
import {advanceDraft} from '../../../../packages/core/revisions';
import {newDraft, newMember} from './ui';

export function useWorkspace() {
  const [state, setState] = useState<AppState | null>(null);
  const [draft, setDraft] = useState<TeamDraft | null>(null); const current = useRef<TeamDraft | null>(null);
  const [error, setError] = useState(''); const [saved, setSaved] = useState<'saving' | 'saved' | 'error'>('saved');
  const [analysis, setAnalysis] = useState<TeamAnalysis | null>(null); const [analyzing, setAnalyzing] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]); const [recommending, setRecommending] = useState(false);
  const [jobs, setJobs] = useState<JobProgress[]>([]);
  const undoStack = useRef<TeamDraft[]>([]); const redoStack = useRef<TeamDraft[]>([]); const [, historyTick] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve()); const lastSaved = useRef(new Map<string, number>());
  const requestId = useRef(0); const appState = useRef(state); appState.current = state;
  const report = useCallback((err: unknown) => setError(err instanceof Error ? err.message : String(err)), []);
  const display = useCallback((value: TeamDraft) => {current.current = value; setDraft(value); setSaved(lastSaved.current.get(value.id) === value.revision ? 'saved' : 'saving');}, []);
  const persist = useCallback((value: TeamDraft) => {
    if (lastSaved.current.get(value.id) === value.revision) return saveQueue.current;
    setSaved('saving');
    const next = saveQueue.current.then(async () => {
      const result = await window.poke.call('saveDraft', value); lastSaved.current.set(value.id, result.revision);
      setState(old => old ? {...old, drafts: [result, ...old.drafts.filter(d => d.id !== result.id)]} : old);
      if (current.current?.id === result.id && current.current.revision === result.revision) setSaved('saved');
    });
    saveQueue.current = next.catch(err => {setSaved('error'); report(err);});
    return next;
  }, [report]);
  const flush = useCallback(async () => {clearTimeout(saveTimer.current); if (current.current) await persist(current.current); await saveQueue.current;}, [persist]);
  useEffect(() => window.poke.onBeforeClose(flush), [flush]);
  const refresh = useCallback(async () => {
    const data = current.current ? await window.poke.call('environmentState', {environmentId: current.current.environmentId}) : await window.poke.call('bootstrap', undefined);
    setState(data); return data;
  }, []);
  useEffect(() => {
    let alive = true;
    void window.poke.call('bootstrap', undefined).then(async data => {
      let selected = data.drafts.find(d => d.id === data.recoveredDraftId) || data.drafts[0] || newDraft(data.environment.id);
      if (selected.environmentId !== data.environment.id) data = await window.poke.call('environmentState', {environmentId: selected.environmentId});
      if (!alive) return;
      for (const d of data.drafts) lastSaved.current.set(d.id, d.revision);
      setState(data); display(selected);
      setJobs(await window.poke.call('jobs', undefined));
    }).catch(report);
    const off = window.poke.onProgress(job => {setJobs(previous => [job, ...previous.filter(j => j.id !== job.id)]); if (job.status === 'completed' && ['sync', 'engine', 'model'].includes(job.kind)) void refresh().catch(report);});
    return () => {alive = false; off();};
  }, [display, refresh, report]);
  useEffect(() => {if (!draft) return; setSaved(lastSaved.current.get(draft.id) === draft.revision ? 'saved' : 'saving'); saveTimer.current = setTimeout(() => void persist(draft).catch(() => {}), 250); return () => clearTimeout(saveTimer.current);}, [draft, persist]);
  useEffect(() => {
    if (!draft || !state) return;
    let currentRequest = true; setAnalyzing(true);
    const timer = setTimeout(() => {void window.poke.call('analyze', draft).then(result => {if (currentRequest) setAnalysis(result);}).catch(err => {if (currentRequest) report(err);}).finally(() => {if (currentRequest) setAnalyzing(false);});}, 220);
    return () => {currentRequest = false; clearTimeout(timer);};
  }, [draft?.id, draft?.analysisRevision, state?.model.version, report]);
  const edit = useCallback((updater: (draft: TeamDraft) => TeamDraft, recordHistory = true) => {
    const old = current.current; if (!old) return;
    if (recordHistory) {undoStack.current.push(old); redoStack.current = [];}
    const updated = updater(structuredClone(old)); display(advanceDraft(old, updated)); historyTick(n => n + 1);
  }, [display]);
  const undo = useCallback(() => {const previous = undoStack.current.pop(); if (previous && current.current) {redoStack.current.push(current.current); edit(() => previous, false);}}, [edit]);
  const redo = useCallback(() => {const next = redoStack.current.pop(); if (next && current.current) {undoStack.current.push(current.current); edit(() => next, false);}}, [edit]);
  const selectDraft = useCallback(async (value: TeamDraft) => {
    await flush();
    if (value.environmentId !== appState.current?.environment.id) setState(await window.poke.call('environmentState', {environmentId: value.environmentId}));
    undoStack.current = []; redoStack.current = []; setProposals([]); setAnalysis(null); display(value); historyTick(n => n + 1);
  }, [flush, display]);
  const create = useCallback(async (sets?: PokemonSet[], name?: string, environmentId?: string) => {
    const value = newDraft(environmentId || appState.current!.activeEnvironmentId, name || '新的构筑');
    if (sets) value.members = sets.map(newMember);
    await selectDraft(value);
  }, [selectDraft]);
  const recommend = useCallback(async (kind: 'add' | 'complete' | 'replace', memberId?: string) => {
    if (!current.current) return;
    const id = ++requestId.current; setRecommending(true);
    try {const results = await window.poke.call('recommend', {draft: current.current, kind, memberId}); if (id === requestId.current) setProposals(results);}
    catch (err) {if (id === requestId.current) report(err);}
    finally {if (id === requestId.current) setRecommending(false);}
  }, [report]);
  const apply = useCallback(async (proposal: Proposal) => {
    if (!current.current) return;
    const before = current.current;
    const changed = await window.poke.call('applyProposal', {draft: current.current, proposal});
    if (before.id !== current.current?.id || before.analysisRevision !== current.current.analysisRevision || proposal.modelVersion !== appState.current?.model.version) throw new Error('预览期间队伍或样本已改变，请重新计算建议。');
    edit(latest => ({...latest, members: changed.members}));
  }, [edit]);
  return {state, draft, error, setError, saved, analysis, analyzing, proposals, recommending, jobs, report, refresh, edit, undo, redo, canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0, selectDraft, create, recommend, apply, flush, setProposals};
}
export type Workspace = ReturnType<typeof useWorkspace>;
