import {useEffect, useState} from 'react';
import {ArrowUpRight, CircleHelp, Wind} from 'lucide-react';
import type {BattleField, PokemonSet, SpeedAnalysis, Proposal, SpreadResult} from '../../../../packages/core/types';
import type {Workspace} from './useWorkspace';
import {PokemonIcon, Spinner, useDex} from './ui';
import {SpreadOutcome} from './SpreadOutcome';

export function SpeedPanel({workspace: w, onDamage, onProposal}: {workspace: Workspace; onProposal: (p: Proposal) => void; onDamage: (a: PokemonSet, d: PokemonSet, field?: BattleField) => void}) {
  const dex = useDex();
  const [memberId, setMemberId] = useState('');
  const [field, setField] = useState<BattleField>({attackerMega: false, defenderMega: true});
  const [result, setResult] = useState<SpeedAnalysis | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [optimizing, setOptimizing] = useState(false);
  const [spread, setSpread] = useState<SpreadResult | null>(null);
  const [query, setQuery] = useState(''); const [order, setOrder] = useState('all');
  const selected = w.draft?.members.find(m => m.id === memberId) || w.draft?.members[0];
  useEffect(() => {
    if (!w.draft || !selected) return;
    let active = true; setBusy(true); setError(''); setResult(null); setSpread(null);
    const timer = setTimeout(() => {
      void window.poke.call('speed', {draft: w.draft!, memberId: selected.id, field}).then(data => {if (active) setResult(data);})
        .catch(err => {if (active) setError(err.message);}).finally(() => {if (active) setBusy(false);});
    }, 120);
    return () => {active = false; clearTimeout(timer);};
  }, [w.draft?.id, w.draft?.analysisRevision, w.state?.model.version, selected?.id, field]);
  if (!w.draft || !selected) return <p className="muted">加入一位成员后，就能比较具体的速度线。</p>;
  const optimize = async (opponent: PokemonSet) => {
    setOptimizing(true);
    try {const result = await window.poke.call('optimizeSpread', {draft: w.draft!, memberId: selected.id, speedBenchmark: {opponent, field, order: 'before'}}); if (result.proposal) onProposal(result.proposal); else setSpread(result);}
    catch (error) {w.report(error);} finally {setOptimizing(false);}
  };
  const update = (patch: Partial<BattleField>) => setField(old => ({...old, ...patch}));
  const rows = result?.rows.filter(row => (order === 'all' || row.order === order) && `${dex.names('species', row.speciesId)} ${dex.speciesById.get(row.speciesId)?.name} ${row.label}`.toLowerCase().includes(query.trim().toLowerCase())) || [];
  const fresh = result?.revision === w.draft.analysisRevision && result.modelVersion === w.state?.model.version && result.memberId === selected.id;
  const hasMega = dex.speciesById.get(selected.set.speciesId)?.megaForms.some(f => f.itemId === selected.set.itemId);
  return <div className="speed-panel">
    <div className="speed-intro"><Wind size={19}/><div><h3>把速度落到具体对手上</h3><p>选择回合条件，查看先手、同速和需要防范的配置。默认从最接近的速度线开始。</p></div></div>
    <div className="speed-controls">
      <label className="form-field">比较的成员<select aria-label="比较的成员" value={selected.id} onChange={e => setMemberId(e.target.value)}>{w.draft.members.map(m => <option key={m.id} value={m.id}>{dex.names('species', m.set.speciesId)}</option>)}</select></label>
      <label className="form-field">天气<select aria-label="速度计算天气" value={field.weather || ''} onChange={e => update({weather: e.target.value || undefined})}>{[['', '无天气'], ['Sun', '晴天'], ['Rain', '雨天'], ['Sand', '沙暴'], ['Snow', '雪天']].map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
      <label className="form-field">场地<select aria-label="速度计算场地" value={field.terrain || ''} onChange={e => update({terrain: e.target.value || undefined})}>{[['', '无场地'], ['Grassy', '青草场地'], ['Psychic', '精神场地'], ['Electric', '电气场地'], ['Misty', '薄雾场地']].map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
    </div>
    <div className="speed-toggles">{([
      {key: 'attackerMega', label: '我方 Mega 后', disabled: !hasMega}, {key: 'defenderMega', label: '对手可用 Mega 后'},
      {key: 'attackerTailwind', label: '我方顺风'}, {key: 'defenderTailwind', label: '对手顺风'}, {key: 'trickRoom', label: '戏法空间'},
    ] as const).map(t => <label className="checkbox-label" key={t.key}><input type="checkbox" checked={!!field[t.key]} disabled={'disabled' in t && t.disabled} onChange={e => update({[t.key]: e.target.checked})}/>{t.label}</label>)}</div>
    <details className="speed-advanced"><summary>强化与异常状态</summary><div className="speed-controls">{(['attacker', 'defender'] as const).map(side => <div key={side} className="speed-boosts"><label className="form-field">{side === 'attacker' ? '我方' : '对手'}速度等级<select aria-label={`${side === 'attacker' ? '我方' : '对手'}速度等级`} value={field[`${side}Boosts`]?.spe || 0} onChange={e => update({[`${side}Boosts`]: {spe: Number(e.target.value)}})}>{Array.from({length: 13}, (_, i) => i - 6).map(n => <option key={n} value={n}>{n > 0 ? `+${n}` : n}</option>)}</select></label><label className="checkbox-label"><input type="checkbox" checked={field[`${side}Status`] === 'par'} onChange={e => update({[`${side}Status`]: e.target.checked ? 'par' : undefined})}/>{side === 'attacker' ? '我方' : '对手'}麻痹</label></div>)}</div></details>
    {busy && <Spinner label="计算当前条件下的速度关系"/>}{error && <div className="notice warning" role="alert">{error}</div>}
    {spread && <SpreadOutcome result={spread}/>}
    {result && <>
      <div className="speed-summary"><span>速度能力值 <b>{result.naturalSpeed}</b></span><span className="before">先手 <b>{result.rows.filter(r => r.order === 'before').length}</b></span><span>同速 <b>{result.rows.filter(r => r.order === 'tie').length}</b></span><span className="after">后手 <b>{result.rows.filter(r => r.order === 'after').length}</b></span></div>
      <p className="field-help">上方为未计入道具等修正的能力值；下表的对局速度已计入围巾、特性与所选条件。</p>
      <div className="speed-filter"><input aria-label="筛选速度对手" placeholder="查找对手或配置…" value={query} onChange={e => setQuery(e.target.value)}/><select aria-label="筛选速度关系" value={order} onChange={e => setOrder(e.target.value)}><option value="all">全部关系</option><option value="before">我方先手</option><option value="tie">双方同速</option><option value="after">我方后手</option></select></div>
      <div className="speed-table" aria-label="具体速度对照"><div className="speed-table-heading"><span>对手配置</span><span>我方 / 对手</span><span>行动顺序</span></div>{rows.map(row => <div className="speed-row-actions" key={row.configurationId}><button className="speed-benchmark" disabled={!fresh} onClick={() => onDamage(selected.set, row.set, field)}>
        <PokemonIcon id={row.speciesId} size={36}/><div className="speed-opponent"><strong>{dex.names('species', row.speciesId)}</strong><small>{dex.names('items', row.set.itemId)} · {dex.names('natures', row.set.natureId)} · {row.set.points!.spe} 速度点</small><small>{dex.names('abilities', row.set.abilityId)} · 样本 {row.currentCount.toFixed(0)} 次</small></div>
        <span className="speed-values"><b>{row.ownSpeed}</b><span> / {row.opponentSpeed}</span></span><span className={`speed-order ${row.order}`}>{row.order === 'before' ? '我方先手' : row.order === 'tie' ? '同速随机' : '我方后手'}</span><ArrowUpRight size={13}/>
      </button><button className="text-button" disabled={!fresh || optimizing || selected.lock.fields.includes('points')} aria-label={`为超过${dex.names('species', row.speciesId)}优化配点`} onClick={() => void optimize(row.set)}>按此目标配点</button></div>)}{!rows.length && <p className="muted">当前筛选下没有可比较的完整配置。</p>}</div>
      <div className="analysis-note"><CircleHelp size={15}/><div>{result.conditions.map(c => <p key={c}>{c}</p>)}</div></div>
    </>}
  </div>;
}
