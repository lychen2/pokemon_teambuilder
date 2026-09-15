import {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowRight, Calculator, Check, LockKeyhole, RotateCcw, SlidersHorizontal, Trash2, UnlockKeyhole, Wind} from 'lucide-react';
import {STAT_KEYS, type BattleField, type LockField, type PokemonSet, type SourceTeam, type TeamAnalysis, type TeamMember} from '../../../../packages/core/types';
import type {Workspace} from './useWorkspace';
import type {ConditionTemplate} from '../../../../packages/core/research/types';
import {useResearch} from './useResearch';
import {useMemberStats} from './useMemberStats';
import {commonOptions, MemberPresets} from './MemberPresets';
import {MemberSpreadControls} from './MemberSpreadControls';
import {BattleConditions, fieldSummary} from './BattleConditions';
import {Modal, PokemonIcon, SearchSelect, OriginBadge, TypeBadge, IconButton, useDex, Spinner, findSource} from './ui';

const labels = {hp: 'HP', atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度'};
const fieldLabels = {itemId: '道具', abilityId: '特性', natureId: '性格', points: '配点', moves: '招式'};
const lockFields: LockField[] = ['itemId', 'abilityId', 'natureId', 'points', 'moves'];

export function MemberEditor({member, workspace: w, onClose, onDamage, onSource, onReplace}: {
  member: TeamMember | null; workspace: Workspace; onClose: () => void;
  onDamage: (a: PokemonSet, d: PokemonSet, field: BattleField) => void;
  onSource: (source: SourceTeam) => void; onReplace: (memberId: string) => void;
}) {
  const dex = useDex();
  const [working, setWorking] = useState<TeamMember | null>(null);
  const [preview, setPreview] = useState<{key: string; data: TeamAnalysis} | null>(null);
  const [busy, setBusy] = useState(false); const [targets, setTargets] = useState(false);
  const [field, setField] = useState<BattleField>({attackerMega: false, defenderMega: true});
  const research = useResearch(w);
  const templates = (research.data?.entries ?? []).filter((entry): entry is ConditionTemplate => entry.kind === 'condition' && entry.attacker.speciesId === working?.set.speciesId);
  useEffect(() => {setWorking(member ? structuredClone(member) : null); setPreview(null); setTargets(false); setField({attackerMega: false, defenderMega: true});}, [member?.id]);
  const live = useMemberStats(w.draft?.environmentId, working?.set, field);
  const saved = useMemberStats(w.draft?.environmentId, member?.set, field);
  const configurations = useMemo(() => w.state?.configurations.filter(c => c.speciesId === working?.set.speciesId) ?? [], [w.state?.configurations, working?.set.speciesId]);
  const species = working ? dex.speciesById.get(working.set.speciesId) : null;
  const mega = species?.megaForms.find(form => form.itemId === working?.set.itemId);
  const nature = dex.natures.find(n => n.id === working?.set.natureId);
  const dirty = JSON.stringify(working) !== JSON.stringify(member);
  const editKey = JSON.stringify([working, w.draft?.analysisRevision, w.state?.model.version]);
  const currentKey = useRef(editKey); currentKey.current = editKey;
  const update = <K extends keyof PokemonSet>(name: K, value: PokemonSet[K]) => {
    if (working) setWorking({...working, set: {...working.set, [name]: value, sourceKind: 'manual'}});
    setPreview(null);
  };
  const lock = (name: LockField) => {if (working) setWorking({...working, lock: {...working.lock, fields: working.lock.fields.includes(name) ? working.lock.fields.filter(f => f !== name) : [...working.lock.fields, name]}});};
  const lockButton = (name: LockField) => <IconButton label={`${working?.lock.fields.includes(name) ? '解锁' : '锁定'}${fieldLabels[name]}`} active={working?.lock.fields.includes(name)} onClick={() => lock(name)}>{working?.lock.fields.includes(name) ? <LockKeyhole size={13}/> : <UnlockKeyhole size={13}/>}</IconButton>;
  const normalized = () => ({...working!, set: {...working!.set, moves: working!.set.moves.filter(Boolean)}});
  const inspect = async () => {
    if (!working || !w.draft) return; setBusy(true);
    try {const data = await window.poke.call('analyze', {...w.draft, members: w.draft.members.map(m => m.id === working.id ? normalized() : m)}); if (currentKey.current === editKey) setPreview({key: editKey, data});}
    catch (err) {w.report(err);} finally {setBusy(false);}
  };
  const save = () => {if (!working) return; const result = normalized(); w.edit(d => ({...d, members: d.members.map(m => m.id === result.id ? result : m)})); onClose();};
  const total = working?.set.points ? Object.values(working.set.points).reduce((a, b) => a + b, 0) : null;
  const budget = w.state?.environment.points;
  const actualSpeed = field.attackerMega && mega ? live.data?.megaBattleSpeed : live.data?.battleSpeed;
  const baseSpeed = field.attackerMega && mega ? live.data?.megaStats?.spe : live.data?.stats?.spe;
  return <Modal open={!!member} onClose={onClose} title="编辑成员" description="常用配置起步，实时查看能力值，再按对手微调。" drawer>{working && species && w.state && w.draft && <div className="member-editor">
    <div className="editor-identity"><div className="portrait"><PokemonIcon id={species.id} gender={working.set.gender} size={96}/></div><div><OriginBadge kind={working.set.sourceKind}/><h2>{species.zh}</h2><p>{species.name}</p><div className="types">{species.types.map(t => <TypeBadge type={t} key={t}/>)}</div></div><button className={`button small ${working.lock.fields.length === 5 ? 'lavender-button' : 'secondary'}`} onClick={() => setWorking({...working, lock: {species: true, fields: working.lock.fields.length === 5 ? [] : [...lockFields]}})}><LockKeyhole size={13}/>{working.lock.fields.length === 5 ? '解锁配置' : '锁定完整配置'}</button></div>
    <MemberPresets member={working} state={w.state} onChange={value => {setWorking(value); setPreview(null);}}/>
    <div className="editor-fields">
      <div className="lockable-field"><SearchSelect label="携带道具" value={working.set.itemId} options={commonOptions([{id: '', name: 'None', zh: '不携带道具'}, ...dex.items], configurations, 'itemId', working.set.itemId)} onChange={id => update('itemId', id)} disabled={working.lock.fields.includes('itemId')}/>{lockButton('itemId')}</div>
      <div className="lockable-field"><SearchSelect label="初始特性" value={working.set.abilityId} options={commonOptions(dex.abilities.filter(a => species.abilities.includes(a.id)), configurations, 'abilityId', working.set.abilityId)} onChange={id => update('abilityId', id)} disabled={working.lock.fields.includes('abilityId')}/>{lockButton('abilityId')}</div>
      <div className="lockable-field editor-nature"><SearchSelect label="性格" value={working.set.natureId} options={commonOptions(dex.natures.map(n => ({...n, zh: n.plus && n.minus ? `${n.zh.replace(/（.*?）|\(.*?\)/g, '').trim()}（+${labels[n.plus]} −${labels[n.minus]}）` : n.zh})), configurations, 'natureId', working.set.natureId)} onChange={id => update('natureId', id)} disabled={working.lock.fields.includes('natureId')}/>{lockButton('natureId')}</div>
    </div>
    {mega && <div className="mega-notice"><span className="mega-sparkle">✦</span><div><strong>Mega 进化后</strong><p>{mega.zh} · {dex.names('abilities', mega.abilityId)}</p><small>入场使用初始特性。下方能力值分别显示进化前后。</small></div></div>}
    <div className="editor-section-heading"><h3>四个招式</h3>{lockButton('moves')}</div>
    <div className="moves-editor">{Array.from({length: 4}, (_, i) => <SearchSelect key={i} label={`招式 ${i + 1}`} value={working.set.moves[i] || null} options={commonOptions(dex.moves.filter(m => species.moves.includes(m.id) && (!working.set.moves.includes(m.id) || working.set.moves[i] === m.id)), configurations, 'moves', working.set.moves[i] || null)} disabled={working.lock.fields.includes('moves')} onChange={id => {const moves = Array.from({length: 4}, (_, k) => working.set.moves[k] || ''); moves[i] = id; update('moves', moves);}}/>)}</div>
    <div className="editor-section-heading"><h3>能力点与实时能力值</h3>{lockButton('points')}</div>
    <div className={`point-budget ${total !== null && total > budget!.total ? 'over-budget' : ''}`}><strong>{total === null ? '配点未知' : `已用 ${total} / ${budget!.total} 点`}</strong><span>{total !== null && (total <= budget!.total ? `还可分配 ${budget!.total - total} 点` : `超出 ${total - budget!.total} 点`)}</span></div>
    {working.set.points ? <div className="live-stats" aria-label="实时能力值" aria-busy={live.pending}>
      <div className="stat-table-heading"><span>能力</span><span>分配能力点</span><span>点数</span><span>Lv.{live.data?.level ?? '…'}</span><span>{mega ? 'Mega 后' : '较原配置'}</span></div>
      {STAT_KEYS.map(stat => {
        const current = live.data?.stats?.[stat]; const previous = saved.data?.stats?.[stat];
        const delta = current !== undefined && previous !== undefined ? current - previous : undefined;
        return <div className="stat-row" key={stat}><label htmlFor={`member-point-${stat}`} className={nature?.plus === stat ? 'nature-plus' : nature?.minus === stat ? 'nature-minus' : ''}>{labels[stat]}{nature?.plus === stat ? ' ↑' : nature?.minus === stat ? ' ↓' : ''}</label>
          <input aria-label={`${labels[stat]}能力点滑块`} type="range" min="0" max={budget!.perStat} value={working.set.points![stat]} disabled={working.lock.fields.includes('points')} onChange={e => update('points', {...working.set.points!, [stat]: Number(e.target.value)})}/>
          <input id={`member-point-${stat}`} aria-label={`${labels[stat]}能力点`} type="number" min="0" max={budget!.perStat} value={working.set.points![stat]} disabled={working.lock.fields.includes('points')} onFocus={e => e.currentTarget.select()} onChange={e => update('points', {...working.set.points!, [stat]: Number(e.target.value)})}/>
          <output data-testid={`stat-${stat}`} aria-label={`${labels[stat]}能力值`}>{current ?? (live.pending ? '…' : '—')}</output>
          {mega ? <output aria-label={`Mega后${labels[stat]}能力值`}>{live.data?.megaStats?.[stat] ?? '—'}</output> : <span className={`stat-delta ${delta && delta > 0 ? 'positive' : ''}`}>{delta === undefined ? '—' : delta === 0 ? '不变' : `${delta > 0 ? '+' : ''}${delta}`}</span>}
        </div>;
      })}
    </div> : <div className="notice neutral"><p>来源没有提供配点。填写后即可查看能力值，未知数值不会按 0 计算。</p><button className="text-button" disabled={working.lock.fields.includes('points')} onClick={() => update('points', {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0})}>从 0 点开始填写 <ArrowRight size={14}/></button></div>}
    <p className="field-help">单项最多 {budget!.perStat} 点。修改点数或性格后即时更新；↑ / ↓ 表示性格加成与减成。</p>
    {live.error && <p className="notice warning" role="alert">{live.error}</p>}
    {!!live.data?.missing.length && <p className="field-help">仍需填写：{live.data.missing.join('、')}。</p>}
    {!!live.data?.issues.length && <div className="notice warning">{live.data.issues.map((issue, i) => <p key={i}>{issue}</p>)}</div>}
    <div className="editor-speed-card"><Wind size={19}/><div><span>{field.attackerMega && mega ? 'Mega 后的对局速度' : '对局速度'}</span><strong data-testid="battle-speed">{actualSpeed ?? (live.pending ? '…' : '—')}</strong></div><p>速度能力值 {baseSpeed ?? '—'}<br/>已计入{dex.names('items', working.set.itemId)}、特性与所选条件</p></div>
    <details className="editor-conditions"><summary>对局条件 · {fieldSummary(field)}</summary><BattleConditions field={field} onChange={setField}/><p className="field-help">上述对局速度和下面的配点目标使用同一条件。只有实际选中时才计入顺风、场地或 Mega。</p></details>
    <div className="button-row editor-tools"><button className="button secondary" disabled={busy} onClick={() => void inspect()}>{busy ? <Spinner/> : <><Calculator size={15}/>预览改动影响</>}</button><button className="button quiet" aria-expanded={targets} onClick={() => setTargets(!targets)}><SlidersHorizontal size={15}/>按目标优化配点</button></div>
    {preview?.key === editKey && <div className="editor-preview"><h4>改动预览</h4>{preview.data.validation.length ? preview.data.validation.map((v, i) => <p className={v.severity === 'error' ? 'warning-text' : 'muted'} key={i}>{v.message}</p>) : <p className="success-text">配置满足当前规则。</p>}{preview.data.concerns.slice(0, 3).map((v, i) => <p key={i}>{v}</p>)}</div>}
    {targets && <MemberSpreadControls key={working.id} member={working} draft={w.draft} state={w.state} field={field} templates={templates} onApply={set => {setWorking({...working, set}); setPreview(null);}} onDamage={onDamage}/>}
    {findSource(w.state, working.set) && <button className="text-button source-shortcut" onClick={() => onSource(findSource(w.state!, working.set)!)}>查看这份配置的原始来源 <ArrowRight size={14}/></button>}
    <div className="member-replace"><button className="button secondary full-width" disabled={dirty || busy || w.recommending} onClick={() => onReplace(working.id)}>为这个位置寻找替换建议 <ArrowRight size={15}/></button><p className="field-help">{dirty ? '应用当前编辑后，可继续比较成员替换。' : working.lock.species ? '保留锁定物种，比较其他合法配置。' : '其余成员保持原样；遵守已有字段锁。'}</p></div>
    <div className="editor-reset"><button className="text-button" disabled={!dirty} onClick={() => {setWorking(structuredClone(member)); setPreview(null);}}><RotateCcw size={13}/>恢复打开时的配置</button><button className="button danger quiet" onClick={() => {w.edit(d => ({...d, members: d.members.filter(m => m.id !== working.id)})); onClose();}}><Trash2 size={15}/>移出队伍</button></div>
    <div className="dialog-footer editor-footer"><span>{dirty ? '已修改 · 应用后自动保存' : '当前配置已保存'}</span><button className="button primary" onClick={save}><Check size={16}/>应用修改</button></div>
  </div>}</Modal>;
}
