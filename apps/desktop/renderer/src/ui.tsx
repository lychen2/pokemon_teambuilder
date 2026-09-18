import {Fragment, createContext, useContext, useMemo, useState, useId, useRef, useEffect, type ReactNode, type CSSProperties} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {Check, ChevronDown, Search, X, ExternalLink, LoaderCircle} from 'lucide-react';
import type {AppState, DexData, NamedData, PokemonSet, SourceTeam, TeamDraft, TeamMember} from '../../../../packages/core/types';
import artwork from '../../../../assets/pokemon/manifest.json';

const images = import.meta.glob<string>('../../../../assets/pokemon/images/*.png', {eager: true, query: '?url', import: 'default'});
const artworks = artwork.entries as Record<string, {file: string; source: string; name: string}>;

const DexContext = createContext<DexData | null>(null);
export function DexProvider({dex, children}: {dex: DexData; children: ReactNode}) {return <DexContext.Provider value={dex}>{children}</DexContext.Provider>;}
export function useDex() {const dex = useContext(DexContext); if (!dex) throw new Error('宝可梦数据尚未加载'); return useMemo(() => ({...dex, names: (kind: keyof DexData, id: string | null | undefined) => dex[kind].find(row => row.id === id)?.zh || (kind === 'species' ? dex.species.flatMap(row => row.megaForms).find(row => row.speciesId === id)?.zh : undefined) || (id === '' ? '无' : id || '尚未填写'), speciesById: new Map(dex.species.map(s => [s.id, s]))}), [dex]);}
export const typeZh: Record<string, string> = {Normal: '一般', Fire: '火', Water: '水', Electric: '电', Grass: '草', Ice: '冰', Fighting: '格斗', Poison: '毒', Ground: '地面', Flying: '飞行', Psychic: '超能力', Bug: '虫', Rock: '岩石', Ghost: '幽灵', Dragon: '龙', Dark: '恶', Steel: '钢', Fairy: '妖精'};
export const typeColor: Record<string, string> = {Normal: '#9c9da4', Fire: '#de7956', Water: '#5c93d6', Electric: '#c9a632', Grass: '#72a96a', Ice: '#69b4bd', Fighting: '#b96865', Poison: '#a776b5', Ground: '#b79160', Flying: '#849cce', Psychic: '#ce739a', Bug: '#97a851', Rock: '#a69a70', Ghost: '#8277af', Dragon: '#727ed0', Dark: '#80776f', Steel: '#8199a9', Fairy: '#c98dbb'};
export function PokemonIcon({id, size = 48, gender, itemId, mega = false}: {id: string; size?: number; gender?: PokemonSet['gender']; itemId?: string | null; mega?: boolean}) {
  const dex = useDex(); const species = dex.speciesById.get(id);
  const form = mega ? species?.megaForms.find(form => form.itemId === itemId)?.speciesId : undefined;
  const artworkId = form || (id === 'pyroar' && gender === 'F' ? 'pyroarfemale' : id);
  const record = artworks[artworkId]; const source = record && images[`../../../../assets/pokemon/images/${record.file}`];
  const label = artworkId === 'pyroarfemale' ? `${dex.names('species', id)}（雌性）` : dex.names('species', artworkId);
  if (!source) return <span className="pokemon-icon artwork-missing" role="img" aria-label={`${label}：待补图`} title={`${label}的当前形态素材尚未收录`} style={{width: size, height: size}}>待补图</span>;
  return <img className="pokemon-icon" src={source} width={size} height={size} alt={label} data-species-id={artworkId} data-artwork-source={record.source} decoding="async" draggable={false}/>;
}
export function PokemonLabel({id, size = 32, gender, itemId, mega = false}: Parameters<typeof PokemonIcon>[0]) {
  const dex = useDex();
  const form = mega ? dex.speciesById.get(id)?.megaForms.find(form => form.itemId === itemId)?.speciesId : undefined;
  const name = dex.names('species', form || id) + (id === 'pyroar' && gender === 'F' ? '（雌性）' : '');
  return <span className="pokemon-label"><PokemonIcon id={id} gender={gender} itemId={itemId} mega={mega} size={size}/><span aria-hidden="true">{name}</span></span>;
}
export function TypeBadge({type}: {type: string}) {return <span className="type-badge" style={{'--type-color': typeColor[type]} as CSSProperties}>{typeZh[type] || type}</span>;}
export function OriginBadge({kind}: {kind: PokemonSet['sourceKind']}) {return <span className={`origin-badge ${kind}`}>{({observed: '当前样本', historical: '历史迁移', generated: '算法生成', manual: '手动配置'})[kind]}</span>;}
export function Spinner({label = '正在计算'}: {label?: string}) {return <span className="loading-inline" role="status"><LoaderCircle className="spin" size={15}/>{label}</span>;}
export function IconButton({label, children, onClick, disabled, active, className = ''}: {label: string; children: ReactNode; onClick?: () => void; disabled?: boolean; active?: boolean; className?: string}) {return <button type="button" className={`icon-button ${active ? 'active' : ''} ${className}`} onClick={onClick} disabled={disabled} aria-label={label} title={label} aria-pressed={active === undefined ? undefined : active}>{children}</button>;}

export function Modal({open, onClose, title, description, children, drawer = false, wide = false}: {open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; drawer?: boolean; wide?: boolean}) {
  return <Dialog.Root open={open} onOpenChange={value => !value && onClose()}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className={`${drawer ? 'drawer' : 'modal'} ${wide ? 'wide' : ''}`} onInteractOutside={event => {if ((event.detail.originalEvent.target as Element).closest('.app-error')) event.preventDefault();}}><div className="dialog-heading"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description className={description ? 'dialog-description' : 'sr-only'}>{description || title}</Dialog.Description></div><Dialog.Close asChild><IconButton label="关闭"><X size={20}/></IconButton></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export interface SelectOption extends NamedData {group?: string; detail?: string}
export function SearchSelect({label, value, options, onChange, disabled = false, placeholder = '选择或搜索'}: {label: string; value: string | null; options: SelectOption[]; onChange: (id: string) => void; disabled?: boolean; placeholder?: string}) {
  const id = useId(); const selected = options.find(o => o.id === value);
  const [query, setQuery] = useState(''); const [open, setOpen] = useState(false); const [active, setActive] = useState(0);
  const filtered = useMemo(() => {
    const words = query.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
    return options.filter(o => words.every(word => `${o.zh} ${o.name} ${o.id} ${o.detail ?? ''}`.normalize('NFKC').toLowerCase().includes(word)));
  }, [options, query]);
  const choose = (row: SelectOption) => {onChange(row.id); setOpen(false); setQuery('');};
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {listRef.current?.querySelector<HTMLElement>('.focused')?.scrollIntoView({block: 'nearest'});}, [active, open]);
  return <div className="search-select"><label htmlFor={id}>{label}</label><div className={`select-input ${disabled ? 'disabled' : ''}`}><input id={id} aria-label={label} role="combobox" aria-autocomplete="list" aria-controls={open ? `${id}-list` : undefined} aria-expanded={open} aria-activedescendant={open && filtered[active] ? `${id}-${active}` : undefined} autoComplete="off" value={open ? query : selected?.zh || ''} placeholder={selected?.zh || placeholder} disabled={disabled} onFocus={() => {setOpen(true); setQuery(''); setActive(0);}} onClick={() => {if (!open) {setOpen(true); setQuery(''); setActive(0);}}} onChange={e => {setQuery(e.target.value); setOpen(true); setActive(0);}} onBlur={() => setOpen(false)} onKeyDown={e => {if (e.nativeEvent.isComposing || e.keyCode === 229) return; if (e.key === 'ArrowDown') {e.preventDefault(); if (!open) {setOpen(true); setActive(0);} else setActive(i => Math.min(i + 1, Math.max(0, filtered.length - 1)));} else if (e.key === 'ArrowUp') {e.preventDefault(); setActive(i => Math.max(i - 1, 0));} else if (e.key === 'Enter' && open && filtered[active]) {e.preventDefault(); choose(filtered[active]);} else if (e.key === 'Escape') {e.stopPropagation(); setOpen(false);}}}/><ChevronDown size={14}/></div>{open && <div ref={listRef} id={`${id}-list`} className="select-options" role="listbox" aria-label={label}>{filtered.map((row, i) => <Fragment key={row.id}>{row.group && row.group !== filtered[i - 1]?.group && <div className="select-group" role="presentation">{row.group}</div>}<button id={`${id}-${i}`} type="button" role="option" tabIndex={-1} aria-selected={value === row.id} className={i === active ? 'focused' : ''} onMouseDown={e => e.preventDefault()} onClick={() => choose(row)}><span>{row.zh}<small>{row.name !== row.zh ? row.name : ''}</small>{row.detail && <small className="option-detail">{row.detail}</small>}</span>{value === row.id && <Check size={14}/>}</button></Fragment>)}{!filtered.length && <p className="muted">没有匹配项</p>}</div>}</div>;
}

export function SourceDetail({team, onClose, onImport, children}: {children?: ReactNode; team: SourceTeam | null; onClose: () => void; onImport?: (team: SourceTeam) => void}) {return <Modal open={!!team} onClose={onClose} title={team?.description || '构筑来源'} description="保留原作者配置、来源链接和字段完整性。" drawer>{team && <><div className="source-meta"><span>{team.season}</span><strong>{team.author || '作者未提供'}</strong><span>{team.date}</span></div><dl className="details-list"><dt>赛事／活动</dt><dd>{team.event || '未提供'}</dd><dt>成绩</dt><dd>{team.rank || '未提供'}</dd><dt>数据状态</dt><dd>{({valid: '完整且在当前环境合法', partial: '存在未提供的字段', invalid: '需要修正规则冲突', 'fetch-error': '读取失败'})[team.status]}</dd></dl>{team.errors.length > 0 && <div className="notice warning">{team.errors.map((e, i) => <p key={i}>{e}</p>)}</div>}<div className="button-row"><button className="button secondary" onClick={() => void window.poke.openExternal(team.url)}><ExternalLink size={15}/>PokePaste 原文</button>{team.originUrl && <button className="button quiet" onClick={() => void window.poke.openExternal(team.originUrl)}>作者发布页 <ExternalLink size={14}/></button>}</div>{children}<pre className="paste-text">{team.raw || team.errors.join('\n')}</pre>{onImport && team.raw && <div className="dialog-footer"><button className="button primary" onClick={() => onImport(team)}>从这份队伍开始</button></div>}</>}</Modal>;}

export function newDraft(environmentId: string, name = '我的第一支队伍'): TeamDraft {return {id: crypto.randomUUID(), name, environmentId, revision: 0, analysisRevision: 0, members: [], notes: '', updatedAt: new Date().toISOString()};}
export function newMember(set: PokemonSet): TeamMember {return {id: crypto.randomUUID(), set: structuredClone(set), lock: {species: false, fields: []}};}
export function findSource(state: AppState, set: PokemonSet): SourceTeam | undefined {
  for (const id of set.sourceIds) {const source = state.corpus.teams.find(team => team.observationIds.includes(id)); if (source) return source;}
  return undefined;
}
