import {useMemo} from 'react';
import type {AppState, Configuration, LockField, NamedData, PokemonSet, TeamMember} from '../../../../packages/core/types';
import {SearchSelect, useDex, type SelectOption} from './ui';

const fields: LockField[] = ['itemId', 'abilityId', 'natureId', 'moves', 'points'];
const signature = (set: PokemonSet) => JSON.stringify([set.itemId, set.abilityId, set.natureId, [...set.moves].sort(), set.points]);

export function commonOptions(options: readonly NamedData[], configurations: readonly Configuration[], field: 'itemId' | 'abilityId' | 'natureId' | 'moves', current: string | null): SelectOption[] {
  const counts = new Map<string, {current: number; history: number}>();
  for (const configuration of configurations) {
    const values = field === 'moves' ? configuration.set.moves : [configuration.set[field]];
    for (const id of values) if (id !== null) {
      const row = counts.get(id) ?? {current: 0, history: 0};
      counts.set(id, {current: row.current + configuration.currentCount, history: row.history + configuration.historyCount});
    }
  }
  return options.map(option => {
    const count = counts.get(option.id);
    const group = option.id === current ? 0 : count?.current ? 1 : count?.history ? 2 : 3;
    return {option, count, group};
  }).sort((a, b) => a.group - b.group || (b.count?.current ?? 0) - (a.count?.current ?? 0) || (b.count?.history ?? 0) - (a.count?.history ?? 0) || a.option.zh.localeCompare(b.option.zh, 'zh-CN'))
    .map(({option, count, group}) => ({...option, group: ['当前选择', '该宝可梦 · 本赛季常用', '该宝可梦 · 历史合法参考', '其他可选'][group],
      detail: count ? `完整配置样本：当前 ${count.current} 队 · 历史 ${count.history} 队` : undefined}));
}

export function MemberPresets({member, state, onChange}: {member: TeamMember; state: AppState; onChange: (member: TeamMember) => void}) {
  const dex = useDex();
  const configurations = useMemo(() => state.configurations.filter(c => c.speciesId === member.set.speciesId).sort((a, b) => Number(b.currentCount > 0) - Number(a.currentCount > 0) || b.currentCount - a.currentCount || b.historyCount - a.historyCount), [state.configurations, member.set.speciesId]);
  const selected = configurations.find(c => signature(c.set) === signature(member.set));
  const options = configurations.map(c => ({id: c.id,
    name: `${dex.items.find(item => item.id === c.set.itemId)?.name ?? ''} ${c.set.moves.map(id => dex.moves.find(move => move.id === id)?.name).join(' / ')}`,
    zh: `${dex.names('items', c.set.itemId)} · ${dex.names('natures', c.set.natureId)}`,
    group: c.currentCount > 0 ? '本赛季常用配置' : '历史合法配置',
    detail: `${c.set.moves.map(id => dex.names('moves', id)).join(' / ')} · 当前 ${c.currentCount} 队，历史 ${c.historyCount} 队`,
  }));
  const choose = (id: string) => {
    const configuration = configurations.find(c => c.id === id)!;
    const set = structuredClone(configuration.set);
    for (const field of fields) if (member.lock.fields.includes(field)) Object.assign(set, {[field]: structuredClone(member.set[field])});
    if (signature(set) !== signature(configuration.set)) set.sourceKind = 'manual';
    onChange({...member, set});
  };
  return <section className="member-presets"><SearchSelect label="常用配置" value={selected?.id ?? null} options={options} onChange={choose} placeholder="从真实配置开始，再按需要微调"/>
    <p className="field-help">选择后立即预览，应用修改时保存。锁定字段会保留；历史配置均已通过当前规则校验。</p>
  </section>;
}
