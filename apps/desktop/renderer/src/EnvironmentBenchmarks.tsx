import {useEffect, useMemo, useState} from 'react';
import {ArrowDown, ArrowRight, ChevronDown, Search, ShieldCheck, SlidersHorizontal, Swords, Wind} from 'lucide-react';
import type {BattleField, Configuration, PokemonSet, SourceTeam} from '../../../../packages/core/types';
import {STAT_KEYS} from '../../../../packages/core/types';
import type {EnvironmentBenchmarks as Overview, DurabilityAnalysis, DurabilityRow} from '../../../../packages/core/analysis/environment-benchmarks';
import type {Workspace} from './useWorkspace';
import {BattleConditions, fieldSummary} from './BattleConditions';
import {DamageDrawer} from './DamageDrawer';
import {Modal, PokemonIcon, PokemonLabel, Spinner, useDex} from './ui';
import './environment.css';

const statNames = {hp: 'HP', atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度'};
const statusNames: Record<DurabilityRow['status'], string> = {survives: '最高乱数仍存活', conditional: '依赖保护或回复', roll: '乱数击倒', ohko: '所有乱数击倒', immune: '无直接伤害'};

export function EnvironmentBenchmarks({workspace: w, onSource}: {workspace: Workspace; onSource: (source: SourceTeam) => void}) {
  return <BenchmarkTables key={`${w.state!.environment.id}:${w.state!.corpus.version}:${w.state!.model.version}`} workspace={w} onSource={onSource}/>;
}

function BenchmarkTables({workspace: w, onSource}: {workspace: Workspace; onSource: (source: SourceTeam) => void}) {
  const state = w.state!; const dex = useDex();
  const [field, setField] = useState<BattleField>({attackerMega: true, defenderMega: true});
  const [tab, setTab] = useState<'speed' | 'damage'>('speed'); const [conditionsOpen, setConditionsOpen] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [attack, setAttack] = useState<{attackerId: string; moveId: string} | null>(null);
  const [durability, setDurability] = useState<DurabilityAnalysis | null>(null); const [calculating, setCalculating] = useState(false); const [damageError, setDamageError] = useState('');
  const [query, setQuery] = useState(''); const [defenderQuery, setDefenderQuery] = useState(''); const [status, setStatus] = useState('threshold');
  const [limit, setLimit] = useState(24); const [defenderLimit, setDefenderLimit] = useState(12);
  const [details, setDetails] = useState<Configuration | null>(null);
  const [pair, setPair] = useState<{attacker: PokemonSet; defender: PokemonSet; field: BattleField} | null>(null);
  const byId = useMemo(() => new Map(state.configurations.map(row => [row.id, row])), [state.configurations]);
  useEffect(() => {
    let active = true; setBusy(true); setError(''); setOverview(null);
    const timer = setTimeout(() => {void window.poke.call('environmentBenchmarks', {environmentId: state.environment.id, field}).then(data => {if (active) setOverview(data);}).catch(err => {if (active) setError(err.message);}).finally(() => {if (active) setBusy(false);});}, 150);
    return () => {active = false; clearTimeout(timer);};
  }, [state.environment.id, field]);
  useEffect(() => {
    let active = true; setDurability(null); setDamageError('');
    if (!attack) {setCalculating(false); return;}
    setCalculating(true);
    const timer = setTimeout(() => {void window.poke.call('durabilityBenchmarks', {environmentId: state.environment.id, field, ...attack}).then(data => {if (active) setDurability(data);}).catch(err => {if (active) setDamageError(err.message);}).finally(() => {if (active) setCalculating(false);});}, 150);
    return () => {active = false; clearTimeout(timer);};
  }, [state.environment.id, field, attack]);
  const matches = (c: Configuration, search: string, moveId = '') => [dex.names('species', c.speciesId), dex.speciesById.get(c.speciesId)?.name, c.speciesId, dex.names('items', c.set.itemId), dex.names('abilities', c.set.abilityId), moveId, moveId && dex.names('moves', moveId)].join(' ').toLowerCase().includes(search.trim().toLowerCase());
  const speeds = overview?.speeds.filter(row => matches(byId.get(row.configurationId)!, query)) ?? [];
  const attacks = overview?.attacks.filter(row => matches(byId.get(row.configurationId)!, query, row.moveId)) ?? [];
  const rows = durability?.rows.filter(row => matches(byId.get(row.configurationId)!, defenderQuery) && (status === 'all' || (status === 'threshold' ? row.thresholds.length > 0 : row.status === status))) ?? [];
  const attacker = attack && byId.get(attack.attackerId);
  const configButton = (c: Configuration, mega: boolean) => <button className="benchmark-config" onClick={() => setDetails(c)}><PokemonIcon id={c.speciesId} gender={c.set.gender} itemId={c.set.itemId} mega={mega} size={44}/><span><strong>{dex.names('species', c.speciesId)}</strong><small>{dex.names('items', c.set.itemId)} · {dex.names('natures', c.set.natureId)}</small></span></button>;
  const count = (c: Configuration) => <span>{c.currentCount} 支 · 同物种 {(c.currentShare * 100).toFixed(1)}%</span>;
  const maxSpeed = overview?.speeds[0]?.effective || 1;
  const amount = tab === 'speed' ? speeds.length : attacks.length;
  const extraConditions = Object.entries(field).filter(([key, value]) => !['attackerMega', 'defenderMega', 'weather', 'terrain', 'attackerTailwind', 'defenderTailwind', 'trickRoom'].includes(key) && value !== undefined && value !== '' && value !== false).length;
  return <section className="environment-benchmarks" aria-label="环境对局基准">
    <header className="benchmark-heading"><div><span className="eyebrow">MATCHUP RESEARCH</span><h2>速度与对局基准</h2><p>从真实配置出发，找到先手目标与生存边界。</p></div><div className="benchmark-population"><strong>{state.configurations.filter(c => c.currentCount > 0).length.toLocaleString()}</strong><span>当前赛季配置</span></div></header>
    <div className="benchmark-toolbar"><div className="benchmark-tabs" aria-label="环境分析分类"><button aria-pressed={tab === 'speed'} onClick={() => {setTab('speed'); setLimit(24);}}><Wind size={17}/>速度线</button><button aria-pressed={tab === 'damage'} onClick={() => {setTab('damage'); setLimit(24);}}><Swords size={17}/>输出与耐久</button></div><label className="benchmark-search"><Search size={16} aria-hidden="true"/><input aria-label="筛选环境配置" placeholder="搜索宝可梦、道具、特性或招式" value={query} onChange={e => {setQuery(e.target.value); setLimit(24);}}/></label></div>
    <div className="benchmark-context"><span>{fieldSummary(field)}<span className="context-divider">·</span>{field.attackerMega ? '我方 Mega 后' : '我方初始形态'}<span className="context-divider">·</span>{field.defenderMega ? '对手 Mega 后' : '对手初始形态'}{extraConditions > 0 && <span> · 另有 {extraConditions} 项设置</span>}</span><button onClick={() => setConditionsOpen(true)}><SlidersHorizontal size={15}/>计算条件</button></div>
    {busy && <div className="benchmark-loading"><Spinner label="计算环境速度与输出目录"/></div>}{error && <p className="notice warning" role="alert">{error}</p>}
    <div className={`benchmark-workspace ${tab === 'damage' ? 'with-durability' : ''}`}>
      <section className="benchmark-catalog" aria-label={tab === 'speed' ? '速度目录' : '输出目录'}>
        <div className="benchmark-list-heading"><span>{tab === 'speed' ? '实战速度从高到低' : '选择一条输出，检查对应耐久'} <ArrowDown size={13}/></span><small>{amount} 条结果</small></div>
        {overview && <><div className="benchmark-table table-scroll" tabIndex={0} aria-label="配置列表，可滚动"><table><caption className="sr-only">{tab === 'speed' ? '环境速度线（按实战速度从高到低）' : '常见输出（按配置的共享样本次数排列）'}</caption><thead><tr><th scope="col">宝可梦与真实配置</th>{tab === 'speed' ? <><th scope="col">样本支持</th><th scope="col">速度配点</th><th scope="col">能力值 / 实战速度</th></> : <th scope="col">输出招式</th>}</tr></thead><tbody>
          {tab === 'speed' ? speeds.slice(0, limit).map(row => {const c = byId.get(row.configurationId)!; return <tr key={c.id}><td>{configButton(c, field.attackerMega ?? true)}</td><td className="sample-count">{count(c)}</td><td>{c.set.points!.spe}<small>点</small></td><td><div className="speed-reading"><span>{row.natural} <span aria-hidden="true">/</span> <strong>{row.effective}</strong></span><span className="speed-meter" aria-hidden="true"><i style={{width: `${row.effective / maxSpeed * 100}%`}}/></span></div></td></tr>;}) : attacks.slice(0, limit).map(row => {const c = byId.get(row.configurationId)!; const selected = attack?.attackerId === c.id && attack.moveId === row.moveId; return <tr className={selected ? 'selected-attack' : ''} key={`${c.id}:${row.moveId}`} data-configuration-id={c.id} data-move-id={row.moveId}><td>{configButton(c, field.attackerMega ?? true)}<small className="attack-samples">{count(c)}</small></td><td><button className="attack-choice" aria-label={`查看耐久线：${dex.names('moves', row.moveId)}`} aria-pressed={selected} onClick={() => {setAttack({attackerId: c.id, moveId: row.moveId}); setDefenderLimit(12);}}><strong>{dex.names('moves', row.moveId)}</strong><small>{row.category === 'Physical' ? '物理' : '特殊'} · 威力 {row.power || '变化'}</small><ArrowRight size={15}/></button></td></tr>;})}
        </tbody></table></div>{!amount && <p className="benchmark-empty">没有符合条件的当前配置，请调整搜索。</p>}{amount > limit && <button className="benchmark-more" onClick={() => setLimit(limit + 24)}>显示更多配置 <ChevronDown size={15}/></button>}</>}
      </section>
      {tab === 'damage' && <section className="durability-results" aria-label="对应耐久配置">
        {!attacker ? <div className="durability-placeholder"><div className="preview-pokemon" aria-hidden="true">{[...new Set(state.configurations.filter(c => c.currentCount > 0).map(c => c.speciesId))].slice(0, 3).map(id => <PokemonIcon key={id} id={id} size={64}/>)}</div><ShieldCheck size={25}/><h3>谁能承受这一击？</h3><p>选择左侧的输出招式，对照全部真实耐久配置。</p><span>伤害范围 · 击倒概率 · 减少 1 点后的变化</span></div> : <>
          <header className="durability-heading"><div><span className="eyebrow">SELECTED ATTACK</span><h3><PokemonLabel id={attacker.speciesId} gender={attacker.set.gender} itemId={attacker.set.itemId} mega={field.attackerMega ?? true} size={40}/><span>使用 {dex.names('moves', attack!.moveId)}</span></h3><p>{dex.names('items', attacker.set.itemId)} · {dex.names('natures', attacker.set.natureId)} · 攻击 {attacker.set.points!.atk} / 特攻 {attacker.set.points!.spa} 点</p></div><button className="text-button" onClick={() => setDetails(attacker)}>完整配置</button></header>
          <div className="durability-filters"><label className="form-field">耐久结果<select value={status} onChange={e => {setStatus(e.target.value); setDefenderLimit(12);}}><option value="threshold">减少 1 点后可能被击倒</option><option value="survives">最高乱数仍存活</option><option value="conditional">依赖保护或回复</option><option value="roll">乱数击倒</option><option value="ohko">所有乱数击倒</option><option value="immune">无直接伤害</option><option value="all">全部结果</option></select></label><label className="form-field">筛选耐久配置<input value={defenderQuery} onChange={e => {setDefenderQuery(e.target.value); setDefenderLimit(12);}} placeholder="宝可梦、道具或特性"/></label></div>
          {calculating && <div className="benchmark-loading"><Spinner label="逐一计算真实耐久与减少一点后的结果"/></div>}{damageError && <p className="notice warning" role="alert">{damageError}</p>}
          {durability && <><p className="durability-count" role="status">已检查 {durability.rows.length} 份配置，<strong>{rows.length} 份</strong>符合筛选。</p>{!rows.length && <p className="benchmark-empty">当前条件下没有匹配配置。切换耐久结果可查看其他情况。</p>}
            <div className="durability-grid">{rows.slice(0, defenderLimit).map(row => {const c = byId.get(row.configurationId)!; return <article className="durability-card" key={c.id} data-configuration-id={c.id}><div className="durability-card-heading">{configButton(c, field.defenderMega ?? true)}<span className={`durability-status ${row.status}`}>{statusNames[row.status]}</span></div><div className="durability-damage"><strong>{row.damage.minPercent.toFixed(1)}–{row.damage.maxPercent.toFixed(1)}<small>%</small></strong><span>{row.damage.min}–{row.damage.max} 伤害 / 当前 {row.damage.currentHP} HP</span></div><div className="survival-meter" aria-hidden="true"><i style={{width: `${Math.min(100, row.damage.max / row.damage.currentHP * 100)}%`}}/></div><div className="durability-metrics"><span>命中时击倒概率 <b>{(row.damage.ohko * 100).toFixed(1)}%</b></span>{row.status === 'survives' && <span>最高伤害后剩余 <b>{row.margin} HP</b></span>}</div><dl className="bulk-stats">{(['hp', 'def', 'spd'] as const).map(stat => <div key={stat}><dt>{statNames[stat]}</dt><dd><strong>{c.set.points![stat]}</strong> 点 <span>能力值 {row.stats[stat]}</span></dd></div>)}</dl>{row.thresholds.map(threshold => <div className="threshold-evidence" key={threshold.stat}><strong>{statNames[threshold.stat]} {threshold.from} → {threshold.to} 点</strong><span>最高 {threshold.max} 伤害 / 当前 {threshold.hp} HP<br/>击倒概率升至 {(threshold.ohko * 100).toFixed(1)}%</span></div>)}<footer><small>{count(c)}</small><button onClick={() => setPair({attacker: attacker.set, defender: c.set, field})}>查看伤害详情与修改条件 <ArrowRight size={13}/></button></footer></article>;})}</div>
            {rows.length > defenderLimit && <button className="benchmark-more" onClick={() => setDefenderLimit(defenderLimit + 12)}>显示更多耐久配置 <ChevronDown size={15}/></button>}
          </>}
        </>}
      </section>}
    </div>
    <footer className="benchmark-footnote"><p>样本按共享队伍去重，频次不代表排位使用率。仅列当前赛季完整合法配置。</p><details><summary>计算口径与生存边界</summary><p>速度包含道具与所选特性状态；同优先度才比较速度，戏法空间下低速先行动。伤害为一次招式命中时的范围，连击按引擎分布，不含回合末伤害与两只宝可梦集火。</p><p>减少 1 点的检验逐项检查 HP、防御、特防，每次只改变一项。它是当前条件下的局部生存边界，不保证全局最少耐久，也不代表作者专门为此调整配点。气腰、结实、画皮与回复等保护效果单列。列表分批显示，计算保留全部配置。</p></details></footer>
    <Modal open={conditionsOpen} onClose={() => setConditionsOpen(false)} title="环境分析的计算条件" description="我方指速度表成员或选中的攻击方，对手指耐久配置。" wide><p className="field-help">默认双方满血、可用 Mega 后、双打范围伤害、无天气和场地、非要害。天气与场地需要手动设置。</p><BattleConditions field={field} onChange={setField}/><div className="dialog-footer"><button className="button secondary" onClick={() => setField({attackerMega: true, defenderMega: true})}>恢复默认条件</button><button className="button primary" onClick={() => setConditionsOpen(false)}>查看结果</button></div></Modal>
    <Modal open={!!details} onClose={() => setDetails(null)} title="真实配置与来源" description="保留原始性格、配点、招式及共享来源，不推断作者未说明的调整意图。">{details && <div className="benchmark-config-detail"><PokemonLabel id={details.speciesId} gender={details.set.gender} size={64}/><p>{dex.names('items', details.set.itemId)} · {dex.names('abilities', details.set.abilityId)} · {dex.names('natures', details.set.natureId)}</p><div className="config-stat-grid">{STAT_KEYS.map(stat => <div key={stat}><span>{statNames[stat]} {details.set.points![stat]}</span></div>)}</div><p>{details.set.moves.map(id => dex.names('moves', id)).join(' / ')}</p><p>{count(details)}</p><div className="reading-links">{state.corpus.teams.filter(team => team.observationIds.some(id => details.observationIds.includes(id))).map(team => <button className="text-button" key={team.id} onClick={() => onSource(team)}>{team.season} · {team.author || team.id}</button>)}</div></div>}</Modal>
    <DamageDrawer pair={pair} workspace={w} onClose={() => setPair(null)}/>
  </section>;
}
