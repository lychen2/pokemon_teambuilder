import {useEffect, useMemo, useState} from 'react';
import type {RoleKnowledge as Knowledge} from '../../../../packages/core/analysis/role-knowledge';
import type {Workspace} from './useWorkspace';
import {useDex} from './ui';

export function RoleKnowledge({workspace: w}: {workspace: Workspace}) {
  const [data, setData] = useState<Knowledge | null>(null); const [query, setQuery] = useState('');
  const [error, setError] = useState(''); const dex = useDex();
  useEffect(() => {
    let active = true; setData(null); setError('');
    void window.poke.call('roleKnowledge', {environmentId: w.state!.environment.id})
      .then(result => {if (active) setData(result);})
      .catch(reason => {if (active) setError(reason instanceof Error ? reason.message : String(reason));});
    return () => {active = false;};
  }, [w.state!.environment.id]);
  const entries = useMemo(() => {
    const words = query.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
    return data?.entries.filter(row => {
      const content = [row.id, row.label, row.mechanism, row.limits, data.groups.find(group => group.id === row.group)!.label,
        ...(row.moves ?? []).map(id => `${id} ${dex.names('moves', id)}`),
        ...(row.abilities ?? []).map(id => `${id} ${dex.names('abilities', id)}`),
        ...(row.items ?? []).map(id => `${id} ${dex.names('items', id)}`),
      ].join(' ').normalize('NFKC').toLowerCase();
      return words.every(word => content.includes(word));
    }) ?? [];
  }, [data, query, dex]);
  return <details className="surface knowledge-panel">
    <summary>当前规则的机制图谱{data && <span className="knowledge-count">{data.groups.length} 类 · {data.entries.length} 项</span>}</summary>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">正在核对当前规则的机制…</p> : <>
      <p className="field-help">{data.note}</p>
      <input aria-label="筛选角色知识" value={query} onChange={e => setQuery(e.target.value)} placeholder="查找天气、场地、广防，或中英文招式与特性"/>
      <p className="field-help">构筑用途与特性、道具条件分层展示；下列可用名称表示规则允许，不代表所有物种都能使用。</p>
      {data.groups.map(group => {
        const rows = entries.filter(row => row.group === group.id);
        return rows.length > 0 && <details className="mechanism-knowledge-group" key={group.id} open={query ? true : undefined}>
          <summary>{group.label}<span>{rows.length} 项</span></summary>
          <div className="mechanism-knowledge-grid">{rows.map(row => <details className="mechanism-knowledge-card" key={row.id} open={query ? true : undefined}>
            <summary><strong>{row.label}</strong><span className={row.quick ? 'coverage-condition' : 'coverage-recognition'}>{row.quick ? '有条件精算' : '配置识别'}</span></summary>
            {!row.role && <p className="mechanism-kind">特性与道具条件</p>}
            <p>{row.mechanism}</p><p className="mechanism-limits">{row.limits}</p>
            <dl><dt>当前规则允许</dt><dd>{[...row.availableMoves.map(id => dex.names('moves', id)), ...row.availableAbilities.map(id => dex.names('abilities', id)), ...row.availableItems.map(id => dex.names('items', id))].join(' · ') || '当前规则未开放相关招式、特性或道具'}</dd>
              <dt>计算范围</dt><dd>{row.quick || '可识别配置和交给 Showdown 执行；尚未对该机制提供专门的快速收益精算。'}</dd></dl>
            <button className="text-button" onClick={() => void window.poke.openExternal(row.reference).catch(w.report)}>机制参考</button>
          </details>)}</div>
        </details>;
      })}
      {!entries.length && <p className="empty-inline">没有匹配的机制。</p>}
      <p className="field-help">知识版本 {data.version}</p>
    </>}
  </details>;
}
