import {STAT_KEYS, type SpreadResult} from '../../../../packages/core/types';
const labels = {hp: 'HP', atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度'};

export function SpreadOutcome({result, stale = false, onApply}: {result: SpreadResult; stale?: boolean; onApply?: () => void}) {
  return <section className={`spread-outcome ${result.status}`} aria-label="配点计算结果" role={result.status === 'unreachable' ? 'alert' : 'status'}>
    <h4>{stale ? '配置或目标已改变，请重新计算' : result.status === 'unreachable' ? '当前条件下无法达到目标' : '找到了满足目标的配点'}</h4>
    <div className="spread-goals">{result.goals.map((goal, i) => <div className="spread-goal" key={i}>
      <strong>{goal.achievable ? '可达到' : '无法达到'} · {goal.label}</strong>
      <p>当前配置：{goal.current}</p><p>目标范围内最有利的分配：{goal.best}</p>
      <small>{STAT_KEYS.filter(s => goal.bestPoints[s] > 0).map(s => `${labels[s]} ${goal.bestPoints[s]} 点`).join(' · ') || '相关能力点为 0'}{goal.minimumPoints !== null && `；单独满足该目标最少需 ${goal.minimumPoints} 点`}</small>
    </div>)}</div>
    {result.optimizedSet?.points && <><dl className="spread-points">{STAT_KEYS.map(s => <div key={s}><dt>{labels[s]}</dt><dd>{result.optimizedSet!.points![s]}</dd></div>)}</dl><p>剩余 {result.remainingPoints} / {result.pointBudget} 点可自行分配。这里只保证选定目标；未约束的能力点暂设为 0。</p></>}
    {result.status === 'unreachable' && <p>{result.explanation[0]}</p>}
    <p className="field-help">击杀概率以招式命中为条件，不包含命中率和回合末伤害。</p>
    {onApply && result.optimizedSet && <button className="button primary full-width" disabled={stale} onClick={onApply}>采用这份配点</button>}
  </section>;
}
