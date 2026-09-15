import {useState} from 'react';
import type {SourceTeam} from '../../../../packages/core/types';
import type {SourceIntent} from '../../../../packages/core/research/types';
import type {Workspace} from './useWorkspace';
import {useResearch} from './useResearch';
import {SearchSelect} from './ui';

export function SourceIntentEditor({team, w}: {team: SourceTeam; w: Workspace}) {
  const research = useResearch(w); const [editing, setEditing] = useState<SourceIntent | null>(null);
  const stored = research.data?.entries.find((entry): entry is SourceIntent => entry.kind === 'source' && entry.sourceId === team.id);
  const value = editing ?? stored ?? {id: crypto.randomUUID(), revision: 0, kind: 'source' as const, environmentId: w.draft!.environmentId, updatedAt: new Date().toISOString(), sourceId: team.id, originalAuthor: '', sharedBy: team.author, parentSourceIds: [], maturity: 'unknown' as const, changes: '', intention: '', evidence: []};
  const update = (patch: Partial<SourceIntent>) => setEditing({...value, ...patch});
  return <details className="research-evidence source-intention"><summary>作者意图、配点成熟度与变体链</summary><p className="field-help">下方是你确认的来源说明，独立于共享表的统计字段。未知内容保持留空。</p>
    <div className="form-grid"><label className="form-field">原作者<input aria-label="原作者标注" value={value.originalAuthor} onChange={e => update({originalAuthor: e.target.value})}/></label><label className="form-field">分享者／变体作者<input value={value.sharedBy} onChange={e => update({sharedBy: e.target.value})}/></label></div>
    <label className="form-field">配点成熟度<select value={value.maturity} onChange={e => update({maturity: e.target.value as SourceIntent['maturity']})}><option value="unknown">作者未说明</option><option value="early">作者称为早期配点</option><option value="tested">作者称已测试</option></select></label>
    <SearchSelect label="关联上游队伍" value={null} options={w.state!.corpus.teams.filter(row => row.id !== team.id && !value.parentSourceIds.includes(row.id)).map(row => ({id: row.id, name: row.url, zh: `${row.author || '未知作者'} · ${row.description}`}))} onChange={id => update({parentSourceIds: [...value.parentSourceIds, id]})}/>
    {value.parentSourceIds.map(id => <div className="research-card" key={id}><span>{w.state!.corpus.teams.find(row => row.id === id)?.description || id}</span><button className="text-button" onClick={() => update({parentSourceIds: value.parentSourceIds.filter(parent => parent !== id)})}>解除关联</button></div>)}
    <label className="form-field">改变了哪些成员、招式或配点<textarea aria-label="来源变体改动" value={value.changes} onChange={e => update({changes: e.target.value})}/></label>
    <label className="form-field">构筑意图与适用条件<textarea aria-label="来源构筑意图" value={value.intention} onChange={e => update({intention: e.target.value})}/></label>
    <label className="form-field">原文引文<textarea aria-label="来源原文引文" value={value.evidence[0]?.quote ?? ''} onChange={e => update({evidence: e.target.value ? [{url: value.evidence[0]?.url ?? (team.originUrl || team.url), quote: e.target.value}] : []})}/></label>
    {value.evidence.length > 0 && <label className="form-field">引文出处<input value={value.evidence[0].url} onChange={e => update({evidence: [{...value.evidence[0], url: e.target.value}]})}/></label>}
    <button className="button secondary small" disabled={research.busy || !research.data} onClick={() => void research.save(value).then(() => setEditing(null)).catch(w.report)}>保存来源说明</button>
  </details>;
}
