import {useMemo, useState} from 'react';
import {STAT_KEYS} from '../../../../packages/core/types';
import type {ResearchPreferences} from '../../../../packages/core/research/types';
import type {Workspace} from './useWorkspace';
import {useResearch} from './useResearch';
import {SearchSelect, useDex} from './ui';

const defaultWeights = {pressure: 3, resilience: 1, speed: .6, coverage: 1, tailRisk: 1.5};
export function SearchPreferences({workspace: w}: {workspace: Workspace}) {
  const research = useResearch(w); const dex = useDex(); const [working, setWorking] = useState<ResearchPreferences | null>(null); const [saved, setSaved] = useState(false);
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const stored = research.data?.entries.find((entry): entry is ResearchPreferences => entry.kind === 'preferences');
  const value = working ?? stored ?? {id: crypto.randomUUID(), revision: 0, kind: 'preferences' as const, draftId: w.draft!.id, environmentId: w.draft!.environmentId, updatedAt: new Date().toISOString(), weights: defaultWeights, retainedConfigurationIds: [], allowHistorical: true, notes: ''};
  const byId = useMemo(() => new Map(w.state!.configurations.map(c => [c.id, c])), [w.state!.configurations]);
  const availableSpecies = useMemo(() => new Set(w.state!.configurations.map(c => c.speciesId)), [w.state!.configurations]);
  const options = useMemo(() => w.state!.configurations.filter(c => c.speciesId === speciesId && !value.retainedConfigurationIds.includes(c.id)).map(c => ({
    id: c.id, name: [c.set.itemId, c.set.abilityId, ...c.set.moves.map(id => dex.moves.find(move => move.id === id)?.name ?? id)].join(' '),
    zh: `${dex.names('items', c.set.itemId)} · ${dex.names('abilities', c.set.abilityId)} · ${c.set.moves.map(id => dex.names('moves', id)).join('/')} · ${dex.names('natures', c.set.natureId)} ${STAT_KEYS.map(stat => c.set.points![stat]).join('/')}`,
  })), [w.state!.configurations, speciesId, value.retainedConfigurationIds, dex]);
  const update = (patch: Partial<ResearchPreferences>) => {setWorking({...value, ...patch}); setSaved(false);};
  return <details className="search-preferences"><summary>推荐偏好与保留变体</summary><p className="field-help">只调整候选排序，合法性与核心锁始终保留。没有实战记录时不会替你推断偏好。</p>
    <label className="checkbox-label"><input type="checkbox" checked={value.allowHistorical !== false} onChange={e => update({allowHistorical: e.target.checked})}/>允许推荐历史合法配置</label>
    <p className="field-help">样本少时可参考旧赛季的真实配置。关闭后候选仅取本赛季完整观察；锁定字段与模型的历史先验保留。</p>
    <div className="preference-weights">{(Object.keys(defaultWeights) as (keyof typeof defaultWeights)[]).map(key => <label key={key}>{({pressure: '进攻压力', resilience: '承伤能力', speed: '速度关系', coverage: '打点覆盖', tailRisk: '困难对局代价'})[key]}<input aria-label={`偏好${key}`} type="number" min="0" step="0.1" value={value.weights[key]} onChange={e => update({weights: {...value.weights, [key]: Number(e.target.value)}})}/></label>)}</div>
    <SearchSelect label="选择要保留变体的宝可梦" value={speciesId} options={dex.species.filter(species => availableSpecies.has(species.id))} onChange={setSpeciesId}/>
    {speciesId && <SearchSelect label="保留在候选池的配置" value={null} options={options} onChange={id => update({retainedConfigurationIds: [...value.retainedConfigurationIds, id]})}/>}
    <div className="chip-list">{value.retainedConfigurationIds.map(id => {const c = byId.get(id); return <button className="button small secondary" key={id} title={c?.set.moves.map(id => dex.names('moves', id)).join(' / ')} onClick={() => update({retainedConfigurationIds: value.retainedConfigurationIds.filter(v => v !== id)})}>{c ? `${dex.names('species', c.speciesId)} · ${dex.names('items', c.set.itemId)} · ${c.isRepresentative ? '代表' : '变体'}` : '原配置已不在当前模型'} ×</button>;})}</div>
    <p className="field-help">保留候选不代表强制加入队伍；需要固定成员时使用核心锁。</p><button className="button secondary small" disabled={research.busy || !research.data} onClick={() => void research.save(value).then(() => {setWorking(null); setSaved(true);}).catch(w.report)}>保存推荐偏好</button>{saved && <span className="success-text" role="status">已保存</span>}
  </details>;
}
