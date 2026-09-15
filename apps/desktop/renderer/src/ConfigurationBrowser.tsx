import {useMemo, useState} from 'react';
import {ArrowUpRight, ChevronLeft, ChevronRight, Plus, Search, X} from 'lucide-react';
import type {AppState, Configuration, PokemonSet, SourceTeam} from '../../../../packages/core/types';
import {STAT_KEYS} from '../../../../packages/core/types';
import {configurationAvailability} from '../../../../packages/core/analysis/evidence';
import {configurationMechanisms, MECHANISMS} from '../../../../packages/core/analysis/mechanisms';
import {findSource, IconButton, OriginBadge, useDex} from './ui';

const PAGE_SIZE = 10;
const statNames = {hp: 'HP', atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度'};

export function ConfigurationCard({configuration: c, state, disabled, onAdd, onSource, children}: {
  configuration: Configuration; state: AppState; disabled: boolean;
  onAdd: (set: PokemonSet) => void; onSource: (source: SourceTeam) => void; children?: React.ReactNode;
}) {
  const dex = useDex(); const [sourcesOpen, setSourcesOpen] = useState(false);
  const source = findSource(state, c.set);
  const sources = useMemo(() => sourcesOpen ? state.corpus.teams.filter(team => team.observationIds.some(id => c.observationIds.includes(id))) : [], [sourcesOpen, c, state.corpus]);
  return <article className="archetype-card configuration-card" data-configuration-id={c.id}>
    <div className="archetype-header"><OriginBadge kind={c.set.sourceKind}/><span>{c.isRepresentative ? '流派代表' : '真实变体'}</span></div>
    <h3>{dex.names('items', c.set.itemId)}</h3>
    <p className="set-ability">{dex.names('abilities', c.set.abilityId)} · {dex.names('natures', c.set.natureId)}</p>
    <div className="move-tags">{c.set.moves.map(id => <span key={id}>{dex.names('moves', id)}</span>)}</div>
    <dl className="configuration-points" aria-label="能力点分配">{STAT_KEYS.map(stat => <div key={stat}><dt>{statNames[stat]}</dt><dd>{c.set.points![stat]}</dd></div>)}</dl>
    <p className="field-help">相同完整配置：当前 {c.currentCount} 队 · 历史 {c.historyCount} 队{c.currentCount > 0 && ` · ${(100 * c.currentShare).toFixed(1)}% 当前样本`}</p>
    {children}
    <div className="archetype-actions"><button className="text-button" disabled={!source} onClick={() => source && onSource(source)}>真实来源 <ArrowUpRight size={14}/></button><button className="button small primary" disabled={disabled} onClick={() => onAdd(c.set)}><Plus size={14}/>加入</button></div>
    <details className="configuration-sources" open={sourcesOpen} onToggle={event => setSourcesOpen(event.currentTarget.open)}><summary>{c.observationIds.length} 条来源记录</summary>{sources.map(team => <button key={team.id} className="text-button" onClick={() => onSource(team)}>{team.season} · {team.author || '作者未提供'} · {team.date || '日期未提供'} <ArrowUpRight size={12}/></button>)}</details>
  </article>;
}

export function ConfigurationBrowser({state, speciesId, mechanismId = null, disabled, onAdd, onSource}: {
  state: AppState; speciesId: string; mechanismId?: string | null; disabled: boolean; onAdd: (set: PokemonSet) => void; onSource: (source: SourceTeam) => void;
}) {
  const dex = useDex(); const [view, setView] = useState<'archetypes' | 'configurations'>('archetypes');
  const [historyChoice, setHistory] = useState<boolean | null>(null); const [query, setQuery] = useState(''); const [groupId, setGroupId] = useState<string | null>(null); const [page, setPage] = useState(0);
  const mechanisms = useMemo(() => new Map(state.configurations.filter(c => c.speciesId === speciesId).map(c => [c.id, configurationMechanisms(c.set, dex.speciesById.get(speciesId))])), [state.configurations, speciesId, dex.speciesById]);
  const selectedMechanism = MECHANISMS.find(rule => rule.id === mechanismId);
  const configurations = useMemo(() => state.configurations.filter(c => c.speciesId === speciesId && (!mechanismId || mechanisms.get(c.id)!.some(match => match.rule.id === mechanismId))), [state.configurations, speciesId, mechanismId, mechanisms]);
  const availability = configurationAvailability(configurations, state.model.priorStrength);
  const history = historyChoice ?? availability.borrowHistorical;
  const byId = useMemo(() => new Map(configurations.map(c => [c.id, c])), [configurations]);
  const groups = useMemo(() => state.model.archetypes.filter(a => a.speciesId === speciesId && configurations.some(c => c.archetypeId === a.id && (history || c.currentCount > 0))), [state.model, speciesId, configurations, history]);
  const searchable = useMemo(() => new Map(configurations.map(c => [c.id, [
    ...c.set.moves.map(id => `${id} ${dex.names('moves', id)} ${dex.moves.find(move => move.id === id)?.name ?? ''}`),
    ...(['items', 'abilities', 'natures'] as const).map((kind, i) => {const id = [c.set.itemId, c.set.abilityId, c.set.natureId][i]; return `${id} ${dex.names(kind, id)} ${dex[kind].find(row => row.id === id)?.name ?? ''}`;}),
    ...c.roles, ...mechanisms.get(c.id)!.map(match => match.rule.label),
  ].join(' ').normalize('NFKC').toLowerCase()])), [configurations, dex, mechanisms]);
  const filtered = useMemo(() => {
    const words = query.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
    return configurations.filter(c => (history || c.currentCount > 0) && (!groupId || c.archetypeId === groupId) && words.every(word => searchable.get(c.id)!.includes(word)));
  }, [configurations, history, query, groupId, searchable]);
  const pages = Math.ceil(filtered.length / PAGE_SIZE); const currentPage = Math.min(page, Math.max(0, pages - 1));
  const group = state.model.archetypes.find(a => a.id === groupId);
  const mechanismNote = (c: Configuration) => selectedMechanism && <p className="mechanism-match">{selectedMechanism.label}{mechanisms.get(c.id)!.find(match => match.rule.id === mechanismId)!.mega ? ' · 仅 Mega 后获得' : ' · 配置已匹配'}</p>;
  return <div className="configuration-browser">
    {selectedMechanism && <p className="notice neutral mechanism-selection">正在筛选：{selectedMechanism.label}。只显示实际携带对应招式、特性、道具或 Mega 石的完整配置。</p>}
    <div className="segmented-control configuration-tabs" aria-label="配置浏览方式">{(['archetypes', 'configurations'] as const).map(mode => <button key={mode} aria-pressed={view === mode} className={view === mode ? 'selected' : ''} onClick={() => setView(mode)}>{mode === 'archetypes' ? '流派概览' : '真实配置'}</button>)}</div>
    <label className="configuration-filter"><span><Search size={13}/>查找招式、道具或特性</span><input aria-label="筛选真实配置" value={query} placeholder="如：帮助 / Helping Hand" onChange={event => {setQuery(event.target.value); setView('configurations'); setPage(0);}}/></label>
    <label className="checkbox-label compact"><input type="checkbox" checked={history} onChange={e => {setHistory(e.target.checked); setPage(0);}}/>包括历史合法配置</label>
    {availability.borrowHistorical && <p className="notice neutral historical-reference">该物种{selectedMechanism ? '在机制筛选下' : ''}当前有 {availability.current} 份独立完整观察。{history ? '已补充通过本规则校验的历史配置，来源赛季与当前频率分别保留。' : '历史参考已关闭，可通过上方开关查看旧赛季配置。'}</p>}
    {view === 'archetypes' ? <><div className="catalog-subheading"><strong>选择配置流派</strong><span>{groups.length} 种</span></div>{groups.map(a => {
      const representative = byId.get(a.id);
      const displayed = representative && (history || representative.currentCount > 0) ? representative : configurations.find(c => c.archetypeId === a.id && (history || c.currentCount > 0))!;
      return <ConfigurationCard key={a.id} configuration={displayed} state={state} disabled={disabled} onAdd={onAdd} onSource={onSource}>
      {mechanismNote(displayed)}
      <div className="archetype-evidence"><span>{a.stability === null ? '少量观察' : `重采样一致性 ${(a.stability * 100).toFixed(0)}%`}</span><span>整个流派当前 {a.currentCount} 队</span></div>
      <button className="text-button variant-link" onClick={() => {setGroupId(a.id); setView('configurations'); setPage(0);}}>{configurations.filter(c => c.archetypeId === a.id && (history || c.currentCount > 0)).length} 份不同真实配置 <ChevronRight size={13}/></button>
    </ConfigurationCard>;})}{!groups.length && <p className="empty-inline">当前筛选下没有完整配置观察。</p>}</> : <>
      <div className="catalog-subheading"><strong>真实配置</strong><span>{filtered.length} 份</span></div>
      {group && <div className="configuration-group"><span>{group.label} 流派</span><IconButton label="取消流派筛选" onClick={() => {setGroupId(null); setPage(0);}}><X size={13}/></IconButton></div>}
      <p className="field-help">招式、道具与配点均保留原样；相同完整配置的转贴归组。</p>
      {filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(configuration => <ConfigurationCard key={configuration.id} configuration={configuration} state={state} disabled={disabled} onAdd={onAdd} onSource={onSource}>{mechanismNote(configuration)}</ConfigurationCard>)}
      {!filtered.length && <p className="empty-inline">没有匹配的完整真实配置。可调整筛选或包括历史配置。</p>}
      {pages > 1 && <div className="configuration-pagination"><IconButton label="上一页配置" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={15}/></IconButton><span>第 {currentPage + 1} / {pages} 页</span><IconButton label="下一页配置" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={15}/></IconButton></div>}
    </>}
  </div>;
}
