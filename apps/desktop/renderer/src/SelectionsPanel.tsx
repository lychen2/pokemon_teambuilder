import {useEffect, useState} from 'react';
import {Save} from 'lucide-react';
import type {SelectionAnalysis, SelectionRoute} from '../../../../packages/core/analysis/selections';
import {selectionIsCurrent} from '../../../../packages/core/analysis/selection-context';
import type {MatchupPlan} from '../../../../packages/core/research/types';
import type {Workspace} from './useWorkspace';
import {OpponentPicker} from './ResearchPanel';
import {PokemonIcon, Spinner, useDex} from './ui';
import {fieldSummary} from './BattleConditions';

export function SelectionsPanel({workspace: w}: {workspace: Workspace}) {
  const dex = useDex(); const [opponentSpecies, setOpponents] = useState<string[]>([]);
  const [result, setResult] = useState<SelectionAnalysis | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const draft = w.draft!;
  useEffect(() => {
    if (draft.members.length < w.state!.environment.pickedTeamSize) {setBusy(false); return;}
    let active = true; setBusy(true); setError('');
    const timer = setTimeout(() => {void window.poke.call('selections', {draft, opponentSpecies}).then(data => {if (active) setResult(data);}).catch(error => {if (active) setError(error.message);}).finally(() => {if (active) setBusy(false);});}, 150);
    return () => {active = false; clearTimeout(timer);};
  }, [draft.id, draft.analysisRevision, draft.environmentId, w.state!.model.version, w.state!.corpus.version, opponentSpecies]);
  const fresh = !busy && selectionIsCurrent(result, draft, {modelVersion: w.state!.model.version, corpusVersion: w.state!.corpus.version, algorithmVersion: w.state!.algorithmVersion}, opponentSpecies);
  const nameOf = (id: string) => dex.names('species', result?.lineup.find(member => member.id === id)?.speciesId);
  const save = async (route: SelectionRoute) => {
    try {
      if (!fresh || !result?.routes.some(candidate => candidate.id === route.id)) throw new Error('队伍、规则、样本或对手已改变，请等待新的选出分析。');
      const entry: MatchupPlan = {id: crypto.randomUUID(), revision: 0, kind: 'plan', draftId: draft.id, environmentId: draft.environmentId, snapshot: structuredClone(draft), updatedAt: new Date().toISOString(), title: `${route.title} · 待验证`, opponentSpecies,
        routes: [{id: crypto.randomUUID(), name: route.title, selection: route.members, leads: route.leads, winCondition: route.winConditions.join('\n'), concerns: [...route.requirements, `场地条件：${fieldSummary(route.field)}`, '由机制分析生成，尚未实战确认'].join('\n'), status: 'idea'}]};
      await window.poke.call('saveResearch', entry); setMessage('已保存到构筑笔记中的对局计划，状态为待验证。');
    } catch (error) {w.report(error);}
  };
  return <section className="research-panel"><div><h3>让每种 {w.state!.environment.pickedTeamSize} 人选出都有执行路线</h3><p className="muted">比较支援依赖、困难对手与资源条件。排序是快速线索，不能代替回合验证。</p></div>
    <details><summary>针对指定对手分析</summary><OpponentPicker species={opponentSpecies} onChange={setOpponents}/></details>
    {draft.members.length < w.state!.environment.pickedTeamSize && <p className="muted">加入至少 {w.state!.environment.pickedTeamSize} 位成员后开始比较。</p>}{busy && <Spinner label="比较选出路线"/>}{error && <div className="notice warning">{error}</div>}{message && <p className="success-text" role="status">{message}</p>}
    {result && <><p className="field-help">已枚举 {result.routes.length} 条选出与 Mega 路线。{fresh ? '' : '当前显示旧结果，正在更新。'}</p>{result.routes.map((route, i) => <details className="selection-route" key={route.id} open={i === 0}><summary><span>{String(i + 1).padStart(2, '0')} · {route.title}</span><span className="route-lineup">{route.members.map(id => {const member = result.lineup.find(m => m.id === id); return member && <PokemonIcon key={id} id={member.speciesId} gender={member.gender} itemId={member.itemId} mega={id === route.megaId} size={35}/>;})}</span></summary>
      <p className="field-help">{route.megaId ? `${nameOf(route.megaId)}使用 Mega` : '保留 Mega 资源'} · {fieldSummary(route.field)}</p><p className="field-help">候选首发：{route.leads.map(id => nameOf(id)).join(' / ')}</p>
      <details className="lead-comparisons"><summary>比较 {route.leadOptions.length} 组首发</summary>{route.leadOptions.map(lead => <div key={lead.members.join(',')}><strong>{lead.members.map(nameOf).join(' / ')}</strong><p className="field-help">{lead.megaId ? `${nameOf(lead.megaId)}首发使用 Mega` : '首发不使用 Mega'} · {fieldSummary(lead.field)}</p><p className="field-help">进攻打点覆盖 {(lead.metrics.coverage * 100).toFixed(0)}% · 困难对局指标 {lead.metrics.tailRisk.toFixed(2)}</p>{lead.benefits.map(text => <p className="field-help" key={text}>{text}</p>)}{lead.concerns.map(text => <p className="field-help" key={text}>{text}</p>)}<button className="text-button" disabled={!fresh} onClick={() => void save({...route, leads: lead.members})}>用此首发保存计划</button></div>)}</details>{route.winConditions.map(text => <p key={text}>{text}</p>)}{route.dependencies.map((dependency, index) => <div className="route-dependency" key={index}><strong>{nameOf(dependency.supportId)} → {nameOf(dependency.beneficiaryId)}</strong><span>{dependency.reason}</span></div>)}
      {route.requirements.map(text => <p className="field-help" key={text}>{text}</p>)}<p className="field-help">仍需检查：{route.difficultOpponents.map(id => dex.names('species', id)).join('、')}</p><button className="button secondary small" disabled={!fresh} onClick={() => void save(route)}><Save size={13}/>保存为待验证计划</button>
    </details>)}<p className="analysis-note">{result.conditions.join('；')}。</p></>}
  </section>;
}
