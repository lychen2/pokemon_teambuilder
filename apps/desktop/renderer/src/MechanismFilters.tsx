import {useMemo, useState} from 'react';
import {MECHANISMS, MECHANISM_GROUPS, type MechanismGroup} from '../../../../packages/core/analysis/mechanisms';
import {useDex} from './ui';

export function MechanismFilters({selected, speciesByMechanism, onSelect}: {
  selected: string | null; speciesByMechanism: Map<string, Set<string>>; onSelect: (id: string | null) => void;
}) {
  const dex = useDex();
  const [group, setGroup] = useState<MechanismGroup>(MECHANISMS.find(rule => rule.id === selected)?.group ?? 'speed');
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const words = query.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
    return MECHANISMS.filter(rule => {
      if (!words.length) return rule.group === group;
      const content = [rule.label, rule.id, MECHANISM_GROUPS.find(g => g.id === rule.group)!.label,
        ...(rule.moves ?? []).map(id => `${id} ${dex.names('moves', id)}`),
        ...(rule.abilities ?? []).map(id => `${id} ${dex.names('abilities', id)}`),
        ...(rule.items ?? []).map(id => `${id} ${dex.names('items', id)}`),
      ].join(' ').normalize('NFKC').toLowerCase();
      return words.every(word => content.includes(word.replace(/\s/g, '')));
    });
  }, [group, query, dex]);
  const button = (rule: typeof MECHANISMS[number]) => {
    const count = speciesByMechanism.get(rule.id)!.size;
    return <button type="button" key={rule.id} aria-pressed={selected === rule.id} disabled={!count}
      title={count ? rule.mechanism : '当前资料没有匹配的完整合法配置'}
      onClick={() => onSelect(selected === rule.id ? null : rule.id)}>
      <span>{rule.label}</span><small>{count}</small>
    </button>;
  };
  return <div className="mechanism-filters" aria-label="按机制筛选">
    <div className="mechanism-filter-heading"><strong>按构筑用途查找</strong><button className="text-button" onClick={() => onSelect(null)} disabled={!selected}>清除筛选</button></div>
    <input aria-label="查找机制" placeholder="机制、招式或特性" value={query} onChange={event => setQuery(event.target.value)}/>
    {!query && <select aria-label="机制类别" value={group} onChange={event => setGroup(event.target.value as MechanismGroup)}>{MECHANISM_GROUPS.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select>}
    <div className="mechanism-options">{matches.filter(rule => rule.role).map(button)}</div>
    {matches.some(rule => !rule.role) && <details className="mechanism-conditions" open={query ? true : undefined}><summary>特性与道具条件</summary><div className="mechanism-options">{matches.filter(rule => !rule.role).map(button)}</div></details>}
    {!matches.length && <p className="field-help">没有匹配的机制。</p>}
    <p className="field-help">数字是可选物种数，包含历史合法配置。条件项不单独增加功能覆盖分。</p>
  </div>;
}
