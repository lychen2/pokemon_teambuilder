import {useState} from 'react';
import {ArrowUpRight, Plus, Save, Swords} from 'lucide-react';
import type {BattleField, PokemonSet, TeamDraft} from '../../../../packages/core/types';
import type {MatchRecord, MatchupPlan, MatchupRoute} from '../../../../packages/core/research/types';
import {filterMatches, matchSummary} from '../../../../packages/core/research/workflow';
import {useResearch} from './useResearch';
import type {Workspace} from './useWorkspace';
import {Modal, PokemonIcon, PokemonLabel, SearchSelect, Spinner, useDex} from './ui';
import {TeamNotes} from './TeamNotes';

type Inspect = (own: PokemonSet, opponent: PokemonSet, field?: BattleField) => void;
const emptyRoute = (number: number): MatchupRoute => ({id: crypto.randomUUID(), name: `路线 ${number}`, selection: [], leads: [], winCondition: '', concerns: '', status: 'idea'});

export function LineupPicker({snapshot, selection, leads, pickedTeamSize, onChange}: {snapshot: TeamDraft; selection: string[]; leads: string[]; pickedTeamSize: number; onChange: (selection: string[], leads: string[]) => void}) {
  const dex = useDex();
  return <div className="lineup-picker">{snapshot.members.map(member => {
    const chosen = selection.includes(member.id); const leading = leads.includes(member.id);
    return <div key={member.id} className={chosen ? 'chosen' : ''}>
      <button type="button" disabled={!chosen && selection.length >= pickedTeamSize} aria-pressed={chosen} aria-label={`选出${dex.names('species', member.set.speciesId)}`} onClick={() => onChange(chosen ? selection.filter(id => id !== member.id) : [...selection, member.id], chosen ? leads.filter(id => id !== member.id) : leads)}><PokemonIcon id={member.set.speciesId} gender={member.set.gender} size={44}/><span>{dex.names('species', member.set.speciesId)}</span></button>
      <button type="button" disabled={!chosen || (!leading && leads.length >= 2)} aria-pressed={leading} aria-label={`${dex.names('species', member.set.speciesId)}作为首发`} className={leading ? 'selected' : ''} onClick={() => onChange(selection, leading ? leads.filter(id => id !== member.id) : [...leads, member.id])}>{leading ? '首发' : '后排'}</button>
    </div>;
  })}</div>;
}

export function OpponentPicker({species, onChange}: {species: string[]; onChange: (species: string[]) => void}) {
  const dex = useDex();
  return <div className="opponent-picker"><SearchSelect label="添加对手宝可梦" value={null} options={dex.species.filter(s => !species.includes(s.id))} onChange={id => onChange([...species, id])}/>
    <div className="chip-list">{species.map((id, i) => <button type="button" key={`${id}-${i}`} className="button small secondary" aria-label={`移除对手${dex.names('species', id)}`} onClick={() => onChange(species.filter((_, index) => index !== i))}><PokemonIcon id={id} size={32}/>{dex.names('species', id)} ×</button>)}</div>
  </div>;
}

function SnapshotLineup({snapshot, members, label}: {snapshot: TeamDraft; members: string[]; label: string}) {
  return <div className="pokemon-list" role="group" aria-label={label}><span className="muted">{label}：</span>{members.length ? members.map(id => {
    const member = snapshot.members.find(member => member.id === id);
    return member ? <PokemonLabel key={id} id={member.set.speciesId} gender={member.set.gender}/> : <span key={id}>成员未找到</span>;
  }) : <span className="muted">未记录</span>}</div>;
}

function PlanEditor({plan, w, onSave, onClose, onDamage}: {plan: MatchupPlan; w: Workspace; onSave: (entry: MatchupPlan) => Promise<unknown>; onClose: () => void; onDamage: Inspect}) {
  const [working, setWorking] = useState(plan); const [saving, setSaving] = useState(false); const dex = useDex();
  const updateRoute = (id: string, patch: Partial<MatchupRoute>) => setWorking(value => ({...value, routes: value.routes.map(route => route.id === id ? {...route, ...patch} : route)}));
  const save = async () => {setSaving(true); try {await onSave(working); onClose();} catch (error) {w.report(error);} finally {setSaving(false);}};
  return <Modal open onClose={onClose} title="对局计划" description={`记录可执行的 ${w.state!.environment.pickedTeamSize} 人路线与假设。计划保留制定时的队伍版本。`} wide>
    <label className="form-field">计划名称<input aria-label="计划名称" value={working.title} onChange={event => setWorking({...working, title: event.target.value})}/></label>
    <p className="field-help">{working.snapshot.name} · 队伍修订 {working.snapshot.revision} / 计算修订 {working.snapshot.analysisRevision}</p>
    <OpponentPicker species={working.opponentSpecies} onChange={opponentSpecies => setWorking({...working, opponentSpecies})}/>
    {working.routes.map(route => <section className="route-editor" key={route.id}>
      <div className="form-grid"><label className="form-field">路线名称<input aria-label="路线名称" value={route.name} onChange={e => updateRoute(route.id, {name: e.target.value})}/></label><label className="form-field">验证状态<select value={route.status} onChange={e => updateRoute(route.id, {status: e.target.value as MatchupRoute['status']})}><option value="idea">待验证</option><option value="tested">已实践</option><option value="rejected">已否定</option></select></label></div>
      <LineupPicker pickedTeamSize={w.state!.environment.pickedTeamSize} snapshot={working.snapshot} selection={route.selection} leads={route.leads} onChange={(selection, leads) => updateRoute(route.id, {selection, leads})}/>
      <label className="form-field">如何赢下对局<textarea aria-label="如何赢下对局" value={route.winCondition} onChange={e => updateRoute(route.id, {winCondition: e.target.value})}/></label>
      <label className="form-field">担忧与需要验证的条件<textarea aria-label="担忧与需要验证的条件" value={route.concerns} onChange={e => updateRoute(route.id, {concerns: e.target.value})}/></label>
      <button className="text-button" onClick={() => setWorking({...working, routes: working.routes.filter(r => r.id !== route.id)})}>移除这条路线</button>
    </section>)}
    <button className="button secondary" onClick={() => setWorking({...working, routes: [...working.routes, emptyRoute(working.routes.length + 1)]})}><Plus size={15}/>增加另一条路线</button>
    {working.opponentSpecies.length > 0 && <details className="research-evidence"><summary>在计划上下文查看伤害与速度</summary>{working.snapshot.members.map(member => <div className="evidence-pairs" key={member.id}><strong><PokemonLabel id={member.set.speciesId} gender={member.set.gender}/></strong>{working.opponentSpecies.flatMap(species => w.state!.model.archetypes.filter(a => a.speciesId === species).slice(0, 2)).map(a => <button key={a.id} className="text-button" onClick={() => onDamage(member.set, a.representative)}><PokemonLabel id={a.speciesId} gender={a.representative.gender}/> · {a.label}<ArrowUpRight size={12}/></button>)}</div>)}</details>}
    <div className="dialog-footer"><button className="button primary" disabled={saving} onClick={() => void save()}><Save size={15}/>保存对局计划</button></div>
  </Modal>;
}

function MatchEditor({record, sourcePlan, w, onSave, onClose}: {record: MatchRecord; sourcePlan?: MatchupPlan; w: Workspace; onSave: (entry: MatchRecord) => Promise<unknown>; onClose: () => void}) {
  const [working, setWorking] = useState(record); const [saving, setSaving] = useState(false);
  const context = working.planContext;
  const chooseRoute = (id: string) => {
    const route = sourcePlan?.routes.find(route => route.id === id);
    setWorking({...working, planContext: route && sourcePlan ? {title: sourcePlan.title, revision: sourcePlan.revision, route: structuredClone(route)} : undefined});
  };
  const save = async () => {setSaving(true); try {await onSave(working); onClose();} catch (error) {w.report(error);} finally {setSaving(false);}};
  return <Modal open onClose={onClose} title="记录一场实战" description="结果与队伍快照保存在本地；没有记录的选出或对手保持未知。" wide>
    <p className="field-help">{working.snapshot.name} · 队伍修订 {working.snapshot.revision}</p>
    <div className="form-grid"><label className="form-field">比赛日期<input type="date" value={working.playedAt.slice(0, 10)} onChange={e => setWorking({...working, playedAt: e.target.value})}/></label><label className="form-field">对局类型<select value={working.category} onChange={e => setWorking({...working, category: e.target.value as MatchRecord['category']})}><option value="practice">练习</option><option value="ranked">排位</option><option value="tournament">比赛</option></select></label><label className="form-field">结果<select aria-label="实战结果" value={working.result} onChange={e => setWorking({...working, result: e.target.value as MatchRecord['result']})}><option value="unknown">未记录</option><option value="win">胜利</option><option value="loss">失利</option><option value="tie">平局</option></select></label></div>
    {sourcePlan && <label className="form-field">参考的计划路线<select aria-label="参考的计划路线" value={context?.route.id ?? ''} onChange={e => chooseRoute(e.target.value)}><option value="">未指定路线</option>{sourcePlan.routes.map(route => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>}
    {context ? <section className="route-editor" aria-label="当时的计划路线"><h3>{context.title} · {context.route.name}</h3><p>计划修订 {context.revision} · {({idea: '待验证', tested: '已实践', rejected: '已否定'})[context.route.status]}</p><SnapshotLineup label="计划选出" snapshot={working.snapshot} members={context.route.selection}/><SnapshotLineup label="计划首发" snapshot={working.snapshot} members={context.route.leads}/><p>赢法：{context.route.winCondition || '未填写'}</p><p>待验证条件：{context.route.concerns || '未填写'}</p>{context.route.selection.length > 0 && <button className="button secondary" onClick={() => setWorking({...working, selection: [...context.route.selection], leads: [...context.route.leads]})}>按该路线填写实际选出</button>}</section> : working.planId && <p className="field-help">关联了对局计划，未记录具体路线。</p>}
    <h3>实际选出与首发</h3><p className="field-help">选出 {working.selection.length}/{w.state!.environment.pickedTeamSize} · 首发 {working.leads.length}/2。未知选出请留空；参考路线不会自动计入实际选出。</p>
    <LineupPicker pickedTeamSize={w.state!.environment.pickedTeamSize} snapshot={working.snapshot} selection={working.selection} leads={working.leads} onChange={(selection, leads) => setWorking({...working, selection, leads})}/>
    {working.selection.length > 0 && <button className="text-button" onClick={() => setWorking({...working, selection: [], leads: []})}>清空实际选出</button>}
    <OpponentPicker species={working.opponentSpecies} onChange={opponentSpecies => setWorking({...working, opponentSpecies})}/>
    <label className="form-field">关键原因（每行一项）<textarea aria-label="关键原因" value={working.reasons.join('\n')} onChange={e => setWorking({...working, reasons: e.target.value.split('\n')})}/></label>
    <label className="form-field">复盘笔记<textarea aria-label="实战复盘笔记" value={working.notes} onChange={e => setWorking({...working, notes: e.target.value})}/></label>
    <label className="form-field">回放链接（可留空）<input aria-label="实战回放链接" value={working.replayUrl} onChange={e => setWorking({...working, replayUrl: e.target.value})}/></label>
    <div className="dialog-footer"><button className="button primary" disabled={saving} onClick={() => void save()}><Save size={15}/>保存实战记录</button></div>
  </Modal>;
}

export function ResearchPanel({workspace: w, onDamage}: {workspace: Workspace; onDamage: Inspect}) {
  const research = useResearch(w); const dex = useDex(); const [tab, setTab] = useState('notes');
  const [plan, setPlan] = useState<MatchupPlan | null>(null); const [match, setMatch] = useState<MatchRecord | null>(null);
  const [sourcePlan, setSourcePlan] = useState<MatchupPlan>();
  const [version, setVersion] = useState('all');
  const [category, setCategory] = useState<MatchRecord['category'] | ''>('');
  const [opponent, setOpponent] = useState('');
  const draft = w.draft!;
  const base = () => ({id: crypto.randomUUID(), revision: 0, environmentId: draft.environmentId, draftId: draft.id, snapshot: structuredClone(draft), updatedAt: new Date().toISOString(), opponentSpecies: []});
  const plans = research.data?.entries.filter((e): e is MatchupPlan => e.kind === 'plan') ?? [];
  const matches = research.data?.entries.filter((e): e is MatchRecord => e.kind === 'match') ?? [];
  const visibleMatches = filterMatches(matches, {currentDraft: version === 'current' ? draft : undefined, category: category || undefined, opponentSpecies: opponent || undefined});
  const summary = research.data ? matchSummary(visibleMatches) : undefined;
  const opponents = [...new Set(matches.flatMap(record => record.opponentSpecies))];
  return <div className="research-panel"><div className="segmented-control" aria-label="构筑记录分类">{[['notes', '思考笔记'], ['plans', '对局计划'], ['matches', '实战复盘']].map(([id, label]) => <button key={id} aria-pressed={tab === id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab === 'notes' && <TeamNotes workspace={w}/>}
    {tab === 'plans' && <><div className="section-heading"><div><h3>每个对局，可以有不同路线</h3><p className="muted">保留首发、后排、赢法和未验证的条件。</p></div><button className="button primary small" onClick={() => setPlan({...base(), kind: 'plan', title: '新的对局计划', routes: [emptyRoute(1)]})}><Plus size={14}/>新建计划</button></div>{!research.data && <Spinner/>}{plans.map(entry => <article className="research-card" key={entry.id}><div><h3>{entry.title}</h3><div className="pokemon-list" role="group" aria-label="计划对手">{entry.opponentSpecies.length ? entry.opponentSpecies.map((id, index) => <PokemonLabel key={`${id}-${index}`} id={id}/>) : <span className="muted">对手尚未指定</span>}</div><small>队伍修订 {entry.snapshot.revision} · {entry.routes.length} 条路线{entry.snapshot.analysisRevision !== draft.analysisRevision ? ' · 队伍已调整，计划保留原版本' : ''}</small></div><button className="button secondary small" onClick={() => setPlan(entry)}>查看与编辑</button><button className="text-button" onClick={() => {setSourcePlan(structuredClone(entry)); setMatch({...base(), snapshot: structuredClone(entry.snapshot), kind: 'match', planId: entry.id, opponentSpecies: [...entry.opponentSpecies], selection: [], leads: [], result: 'unknown', category: 'practice', playedAt: new Date().toISOString(), reasons: [], notes: '', replayUrl: ''});}}>记录实践</button></article>)}</>}
    {tab === 'matches' && <><div className="section-heading"><div><h3>从实际选出发现问题</h3><p className="muted">记录是个人观察，不与独立评测混合。</p></div><button className="button primary small" onClick={() => {setSourcePlan(undefined); setMatch({...base(), kind: 'match', playedAt: new Date().toISOString(), selection: [], leads: [], result: 'unknown', category: 'practice', reasons: [], notes: '', replayUrl: ''});}}><Plus size={14}/>记一场实战</button></div>
      <div className="form-grid" aria-label="实战记录筛选">
        <label className="form-field">队伍配置<select value={version} onChange={e => setVersion(e.target.value)}><option value="all">全部历史配置</option><option value="current">与当前计算配置相同</option></select></label>
        <label className="form-field">比赛类别<select value={category} onChange={e => setCategory(e.target.value as typeof category)}><option value="">全部类别</option><option value="practice">练习</option><option value="ranked">排位</option><option value="tournament">比赛</option></select></label>
        <label className="form-field">对手包含<select value={opponent} onChange={e => setOpponent(e.target.value)}><option value="">全部对手（含未知）</option>{opponents.map(id => <option key={id} value={id}>{dex.names('species', id)}</option>)}</select></label>
      </div>
      {opponent && <div className="pokemon-list" role="group" aria-label="筛选的对手"><PokemonLabel id={opponent}/></div>}
      <p className="field-help">列表和统计使用同一筛选条件。当前计算配置包含成员、顺序与锁定字段，名称和笔记不影响筛选。</p>
      {!research.data && <Spinner/>}
      {summary && <div className="record-summary"><p><strong>{summary.total}</strong> 场记录 · {summary.labelled} 场有结果 · {summary.wins} 胜 / {summary.losses} 负 / {summary.ties} 平</p><p>{summary.selectionKnown} 场提供选出；下列分母只包含成员在队内且已记录选出的对局。</p><div className="selection-stats">{summary.members.map(row => <div key={row.speciesId}><PokemonIcon id={row.speciesId} size={35}/><span>{dex.names('species', row.speciesId)}</span><b>{row.selected}/{row.available} 选出</b><small>{row.led} 次首发</small></div>)}</div>{summary.reasons.map(row => <span className="badge neutral" key={row.label}>{row.label} · {row.count}</span>)}</div>}
      {research.data && !visibleMatches.length && <p className="muted">没有符合条件的实战记录。可调整筛选条件或记录一场实战。</p>}
      {visibleMatches.map(entry => <article className="research-card" key={entry.id}><div><h3>{({win: '胜利', loss: '失利', tie: '平局', unknown: '结果未记录'})[entry.result]} · {entry.playedAt.slice(0, 10)}</h3><p>{entry.notes || entry.reasons.join(' · ') || '未填写复盘'}</p><small>队伍修订 {entry.snapshot.revision} · {({practice: '练习', ranked: '排位', tournament: '比赛'})[entry.category]} · {entry.selection.length ? `${entry.selection.length} 位选出` : '选出未知'}{entry.planContext && ` · 路线：${entry.planContext.route.name}`}</small><SnapshotLineup label="实际选出" snapshot={entry.snapshot} members={entry.selection}/>{entry.opponentSpecies.length > 0 && <div className="pokemon-list" role="group" aria-label="实战对手"><span className="muted">对手：</span>{entry.opponentSpecies.map((id, index) => <PokemonLabel key={`${id}-${index}`} id={id}/>)}</div>}</div><button className="button secondary small" onClick={() => {setSourcePlan(undefined); setMatch(entry);}}>查看记录</button>{entry.replayUrl && <button className="text-button" onClick={() => void window.poke.openExternal(entry.replayUrl).catch(w.report)}>回放 <ArrowUpRight size={12}/></button>}</article>)}
    </>}
    {plan && <PlanEditor key={plan.id} plan={plan} w={w} onSave={research.save} onClose={() => setPlan(null)} onDamage={onDamage}/>}
    {match && <MatchEditor key={match.id} record={match} sourcePlan={sourcePlan} w={w} onSave={entry => research.save({...entry, reasons: entry.reasons.map(r => r.trim()).filter(Boolean)})} onClose={() => setMatch(null)}/>}
  </div>;
}
