import type {Proposal, TeamDraft} from '../../../../packages/core/types';
import {fieldSummary} from './BattleConditions';
import {PokemonIcon, PokemonLabel, useDex} from './ui';

export function LineupComparison({proposal, draft}: {proposal: Proposal; draft: TeamDraft}) {
  const dex = useDex();
  if (!proposal.lineupComparisons?.length) return null;
  return <section className="lineup-comparison"><h3>面对同一对手，选出如何变化</h3>
    <p className="field-help">分别比较可选成员与唯一 Mega 使用者；场地以选中成员成功建立为条件，尚未推进完整回合。每个流派仅计算真实代表，未穷举全部配置变体。</p>
    {proposal.lineupComparisons.map((row, index) => <details key={row.opponentSpecies.join(',')} open={index === 0} className="selection-route">
      <summary><span className="pokemon-list">{row.opponentSpecies.map(id => <PokemonLabel key={id} id={id}/>)}</span></summary>
      <p className="field-help">来源 {row.seasons.join('、')} · {row.sourceIds.length} 支独立构筑 · 快速矩阵覆盖流派概率 {(row.coveredProbability * 100).toFixed(0)}%</p>
      <div className="comparison-teams">{[{label: '调整前', evidence: row.before, members: draft.members}, {label: '调整后', evidence: row.after, members: proposal.members}].map(column => <div key={column.label}>
        <h4>{column.label}</h4><div className="lineup-members">{column.evidence.members.map(id => {
          const member = column.members.find(member => member.id === id);
          return member ? <span key={id}><PokemonIcon id={member.set.speciesId} gender={member.set.gender} itemId={member.set.itemId} mega={id === column.evidence.megaId} size={46}/><small>{dex.names('species', member.set.speciesId)}{id === column.evidence.megaId && ' · Mega'}</small></span> : <span key={id}>成员已变更</span>;
        })}</div>
        <p className="field-help">{column.evidence.megaId ? `${dex.names('species', column.members.find(member => member.id === column.evidence.megaId)?.set.speciesId)}使用 Mega` : '保留 Mega 资源'} · {fieldSummary(column.evidence.field)}</p>
        <p className="field-help">最低乱数达到 50% 的打点覆盖 {(column.evidence.metrics.coverage * 100).toFixed(0)}%<br/>困难对局指标 {column.evidence.metrics.tailRisk.toFixed(2)}（越低越好）</p>
      </div>)}</div>
      {row.missingSpecies.length > 0 && <div className="pokemon-list"><span className="muted">尚未纳入快速矩阵：</span>{row.missingSpecies.map(id => <PokemonLabel key={id} id={id}/>)}<span className="muted">未覆盖配置需要另行检查。</span></div>}
    </details>)}
  </section>;
}
