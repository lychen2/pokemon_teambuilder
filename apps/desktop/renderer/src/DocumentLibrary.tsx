import {useEffect, useState} from 'react';
import type {ResearchDocument} from '../../../../packages/core/research/types';
import type {Workspace} from './useWorkspace';
import {Modal, Spinner} from './ui';

const sourceTypes = {rmt: '作者队报', forum: '论坛讨论', social: '构筑发布', guide: '构筑教程', replay: '真实对局回放'};
const readings = [
  ['构筑与配置理解', 'https://www.vgcguide.com/how-to-use-someone-elses-team', 'guide'],
  ['2024 世界冠军队报', 'https://victoryroad.pro/2024/09/22/luca-ceribelli-worlds-report/', 'rmt'],
  ['M-C 环境讨论', 'https://www.smogon.com/forums/threads/vgc-reg-m-c-metagame-discussion-thread.3788116/', 'forum'],
  ['M-rada 灭歌构筑发布', 'https://x.com/M_rada13/status/2098353125098746176', 'social'],
] as const;
export function DocumentLibrary({workspace: w}: {workspace: Workspace}) {
  const [environmentId, setEnvironmentId] = useState(w.state!.environment.id); const [entries, setEntries] = useState<ResearchDocument[]>([]);
  const [url, setUrl] = useState(''); const [raw, setRaw] = useState(''); const [type, setType] = useState<ResearchDocument['sourceType']>('rmt');
  const [editing, setEditing] = useState<ResearchDocument | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [claimPage, setClaimPage] = useState(0);
  const reload = async () => setEntries(await window.poke.call('documents', {environmentId}));
  useEffect(() => {let current = true; void window.poke.call('documents', {environmentId}).then(data => {if (current) setEntries(data);}).catch(e => {if (current) setError(e.message);}); return () => {current = false;};}, [environmentId]);
  const prepare = async () => {setBusy(true); setError(''); try {setEditing(await window.poke.call('prepareDocument', {environmentId, sourceType: type, url, raw: raw || undefined})); setClaimPage(0);} catch (e) {setError((e as Error).message);} finally {setBusy(false);}};
  const save = async () => {if (!editing) return; setBusy(true); setError(''); try {await window.poke.call('saveResearch', {...editing, revision: entries.some(entry => entry.id === editing.id) ? editing.revision + 1 : 0, updatedAt: new Date().toISOString()}); await reload(); setEditing(null);} catch (e) {setError((e as Error).message);} finally {setBusy(false);}};
  const updateClaim = (index: number, patch: Partial<ResearchDocument['claims'][number]>) => setEditing(old => old && ({...old, claims: old.claims.map((claim, i) => i === index ? {...claim, ...patch} : claim)}));
  return <details className="surface knowledge-panel"><summary>独立资料与对局回放</summary><p className="muted">队报的作者解释、主动分享的队伍和实际对局属于不同证据。保存原文与采样口径，引用需逐项核对。</p>
    <label className="form-field">资料所属规则<select aria-label="资料所属规则" value={environmentId} onChange={e => setEnvironmentId(e.target.value)}>{w.state!.environments.map(env => <option key={env.id} value={env.id}>{env.name} · {env.id.slice(-8)}</option>)}</select></label>
    <div className="reading-links">{readings.map(([name, link, sourceType]) => <button className="text-button" key={link} onClick={() => {setUrl(link); setType(sourceType); setRaw('');}}>{name}</button>)}</div>
    <div className="form-grid"><label className="form-field">资料类型<select aria-label="资料类型" value={type} onChange={e => setType(e.target.value as ResearchDocument['sourceType'])}>{Object.entries(sourceTypes).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label className="form-field">原始来源链接<input aria-label="资料来源链接" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…"/></label></div>
    <details><summary>粘贴已经取得的原文／公开回放日志</summary><label className="form-field">原始正文<textarea aria-label="独立资料原文" value={raw} onChange={e => setRaw(e.target.value)} rows={6}/></label></details>
    <button className="button secondary" disabled={busy || !url.trim() && !raw.trim()} onClick={() => void prepare()}>{busy ? <Spinner/> : '读取并整理引文'}</button>{error && <p className="notice warning" role="alert">{error}</p>}
    {entries.map(entry => <article className="research-card" key={entry.id}><div><h3>{entry.title}</h3><p>{sourceTypes[entry.sourceType]} · {entry.author || '作者未知'} · {entry.publishedAt || '日期未知'}</p><small>{entry.claims.filter(c => c.confirmed).length} 条已核对引文 · {entry.sampleMethod}</small></div><button className="button small secondary" onClick={() => {setEditing(entry); setClaimPage(0);}}>阅读与核对</button></article>)}
    <Modal open={!!editing} onClose={() => setEditing(null)} title="核对独立资料" description="辅助整理只选择原文段落；作者意图、采样口径与结论由你核对后保存。" wide>{editing && <>
      <div className="form-grid"><label className="form-field">资料标题<input aria-label="资料标题" value={editing.title} onChange={e => setEditing({...editing, title: e.target.value})}/></label><label className="form-field">原作者<input aria-label="资料原作者" value={editing.author} onChange={e => setEditing({...editing, author: e.target.value})}/></label><label className="form-field">发表日期<input aria-label="资料发表日期" value={editing.publishedAt} onChange={e => setEditing({...editing, publishedAt: e.target.value})} placeholder="未知可留空"/></label></div>
      <label className="form-field">采样口径与适用规则<textarea aria-label="资料采样口径" value={editing.sampleMethod} onChange={e => setEditing({...editing, sampleMethod: e.target.value})}/></label>
      {editing.replay && <div className="notice neutral"><p>原回放规则：{editing.replay.format || '未知'}。{editing.replay.turns} 回合；{editing.replay.winner === null ? '未完成，不记胜负' : editing.replay.winner === 'tie' ? '平局' : `日志获胜者：${editing.replay.winner}`}。</p><p>归档到所选规则不代表原对局使用了该规则；回放不混入共享构筑频率。</p></div>}
      <details><summary>完整原文与来源</summary><button className="text-button" disabled={!editing.url} onClick={() => void window.poke.openExternal(editing.url).catch(w.report)}>{editing.url || '手工粘贴原文'}</button><pre className="paste-text">{editing.raw}</pre></details>
      <p className="field-help">共 {editing.claims.length} 条候选引文，已核对 {editing.claims.filter(c => c.confirmed).length} 条。未核对内容保持待确认。</p>
      {editing.claims.slice(claimPage * 8, (claimPage + 1) * 8).map((claim, offset) => {const index = claimPage * 8 + offset; return <article className="quote-review" key={index}><blockquote>{claim.quote}</blockquote><label className="form-field">自己的解读<textarea aria-label={`引文解读${index + 1}`} value={claim.interpretation} onChange={e => updateClaim(index, {interpretation: e.target.value})}/></label><div className="button-row"><label className="checkbox-label"><input type="checkbox" checked={claim.confirmed} onChange={e => updateClaim(index, {confirmed: e.target.checked})}/>已核对原文和适用条件</label><button className="text-button" onClick={() => setEditing({...editing, claims: editing.claims.filter((_, i) => i !== index)})}>移除此段</button></div></article>;})}
      {editing.claims.length > 8 && <div className="button-row"><button className="button small secondary" disabled={!claimPage} onClick={() => setClaimPage(claimPage - 1)}>上一组引文</button><span>第 {claimPage + 1} 组</span><button className="button small secondary" disabled={(claimPage + 1) * 8 >= editing.claims.length} onClick={() => setClaimPage(claimPage + 1)}>下一组引文</button></div>}
      {error && <p className="notice warning" role="alert">{error}</p>}<div className="dialog-footer"><button className="button primary" disabled={busy || !editing.title.trim()} onClick={() => void save()}>保存研究资料</button></div>
    </>}</Modal></details>;
}
