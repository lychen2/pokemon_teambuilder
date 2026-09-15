import {useEffect, useState} from 'react';
import {Plus, RefreshCw} from 'lucide-react';
import type {SourceRegistration} from '../../../../packages/core/research/types';
import type {Workspace} from './useWorkspace';
import {Spinner} from './ui';

export function SourceRegistry({workspace: w}: {workspace: Workspace}) {
  const [environmentId, setEnvironmentId] = useState(w.draft!.environmentId);
  const [sources, setSources] = useState<SourceRegistration[] | null>(null);
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState('');
  const environment = w.state!.environments.find(e => e.id === environmentId)!;
  useEffect(() => {let active = true; setSources(null); setMessage(''); void window.poke.call('sources', {environmentId}).then(rows => {if (active) setSources(rows);}).catch(w.report); return () => {active = false;};}, [environmentId, w.report]);
  const update = (index: number, patch: Partial<SourceRegistration>) => setSources(rows => rows!.map((row, i) => index === i ? {...row, ...patch} : row));
  const persist = async () => {
    if (!sources) return [];
    setSaving(true); setMessage('');
    try {const saved: SourceRegistration[] = []; for (const row of sources) saved.push(await window.poke.call('saveSource', row)); setSources(saved); setMessage('来源注册表已保存'); return saved;} finally {setSaving(false);}
  };
  const sync = async () => {try {const rows = await persist(); const enabled = rows.filter(row => row.enabled); if (!enabled.length) throw new Error('请至少启用一个构筑来源。'); await window.poke.call('sync', {environmentId, sources: enabled.map(({documentId, gid, season}) => ({documentId, gid, season}))});} catch (error) {w.report(error);}};
  const syncJob = w.jobs.find(job => job.kind === 'sync' && job.environmentId === environmentId);
  return <div className="source-registry"><label className="form-field">管理与同步的数据环境<select aria-label="管理与同步的数据环境" value={environmentId} onChange={e => setEnvironmentId(e.target.value)}>{w.state!.environments.map(e => <option key={e.id} value={e.id}>{e.season} · {e.sourceRevision.slice(0, 12)}{e.id === w.state!.activeEnvironmentId ? '（默认）' : ''}{e.id === w.draft!.environmentId ? '（当前队伍）' : ''}</option>)}</select></label>
    <p className="field-help">同步目标：{environment.name}。不会改变当前队伍关联的环境。</p>
    <details className="source-settings"><summary>管理分表与后续赛季</summary>{!sources && <Spinner label="读取来源注册表"/>}{sources?.map((row, i) => <fieldset className="registry-entry" key={i}><legend><label className="checkbox-label"><input type="checkbox" checked={row.enabled} onChange={e => update(i, {enabled: e.target.checked})}/>启用来源 {i + 1}</label></legend>
      <div className="form-grid"><label className="form-field">赛季<input aria-label={`分表${i + 1}赛季`} value={row.season} onChange={e => update(i, {season: e.target.value})}/></label><label className="form-field">分表 gid<input aria-label={`分表${i + 1}gid`} value={row.gid} onChange={e => update(i, {gid: e.target.value})}/></label></div>
      <label className="form-field">共享表文档 ID<input aria-label={`分表${i + 1}文档ID`} value={row.documentId} onChange={e => update(i, {documentId: e.target.value})}/></label>
      <label className="form-field">采样口径<textarea value={row.sampleMethod} onChange={e => update(i, {sampleMethod: e.target.value})}/></label>
      <label className="form-field">获取方式与许可说明<textarea value={row.permissionNotes} onChange={e => update(i, {permissionNotes: e.target.value})}/></label>
    </fieldset>)}<div className="button-row"><button className="text-button" disabled={!sources} onClick={() => setSources([...sources!, {id: crypto.randomUUID(), environmentId, documentId: '', gid: '', season: environment.season, title: '', enabled: true, sampleMethod: '', permissionNotes: ''}])}><Plus size={14}/>添加规则分表</button><button className="button secondary small" disabled={saving || !sources} onClick={() => void persist().catch(w.report)}>保存来源设置</button></div></details>
    <button className="button secondary full-width" disabled={saving || !sources || syncJob?.status === 'running'} onClick={() => void sync()}>{saving || syncJob?.status === 'running' ? <Spinner label="同步与重建模型"/> : <><RefreshCw size={15}/>同步构筑数据</>}</button>
    {message && <p className="success-text" role="status">{message}</p>}{syncJob && <div className={`job-status ${syncJob.status}`}><p>{syncJob.message}</p>{syncJob.error && <p className="warning-text">{syncJob.error}</p>}{syncJob.status === 'running' && <button className="text-button" onClick={() => void window.poke.call('cancelJob', {id: syncJob.id}).catch(w.report)}>取消同步</button>}</div>}
  </div>;
}
