import {useEffect, useState} from 'react';
import type {BattleField, PokemonSet} from '../../../../packages/core/types';
import type {MoveRisk, RiskComparison} from '../../../../packages/core/battle/risk';
import {Spinner, useDex} from './ui';

export function RiskPanel({environmentId, attacker, defender, field}: {environmentId: string; attacker: PokemonSet; defender: PokemonSet; field: BattleField}) {
  const dex = useDex(); const [result, setResult] = useState<RiskComparison | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => {let current = true; setBusy(true); setResult(null); setError('');
    void window.poke.call('risk', {environmentId, attacker, defender, field}).then(data => {if (current) setResult(data);}).catch(error => {if (current) setError(error.message);}).finally(() => {if (current) setBusy(false);});
    return () => {current = false;};
  }, [environmentId, attacker, defender, field]);
  const row = (risk: MoveRisk, key: string) => <tr key={key}><th scope="row">{dex.names('moves', risk.moveId)}</th><td>{(risk.accuracy * 100).toFixed(1)}%</td><td>{(risk.koIncludingMiss * 100).toFixed(1)}%</td><td>{risk.minPercent.toFixed(1)}–{risk.maxPercent.toFixed(1)}%</td><td>{risk.recoil.join('–')} HP</td></tr>;
  return <section className="risk-panel"><p>按当前天气、特性和道具计算命中判定，比较包含落空的击杀机会及自身反伤。</p>{busy && <Spinner label="比较风险与合法替代招式"/>}{error && <p className="notice warning" role="alert">{error}</p>}{result && <>
    <div className="table-scroll"><table><caption>当前招式在同一条件下的比较</caption><thead><tr><th>招式</th><th>首段命中</th><th>含落空击杀</th><th>命中伤害</th><th>命中反伤</th></tr></thead><tbody>{result.moves.map(r => row(r, r.moveId))}</tbody></table></div>
    {result.moves.some(r => r.hitDistribution.length > 2) && <p className="field-help">多次判定招式已按提前落空截断连击数。全部连中：{result.moves.filter(r => r.hitDistribution.length > 2).map(r => `${dex.names('moves', r.moveId)} ${(r.fullConnection * 100).toFixed(1)}%`).join('；')}</p>}
    {result.alternatives.length > 0 && <details><summary>更可靠或反伤更少的合法替代（{result.alternatives.length}）</summary><p className="field-help">只替换对应招式，性格、道具与配点保持一致。较稳定的命中可能需要牺牲威力或其他功能。</p>{[...new Set(result.alternatives.map(a => a.replaces))].map(move => <div className="table-scroll" key={move}><table><caption>替换 {dex.names('moves', move)}</caption><thead><tr><th>招式</th><th>首段命中</th><th>含落空击杀</th><th>命中伤害</th><th>命中反伤</th></tr></thead><tbody>{result.alternatives.filter(a => a.replaces === move).map(a => row(a.result, a.result.moveId))}</tbody></table></div>)}</details>}
    {result.dependencies.map(text => <p className="notice neutral" key={text}>{text}</p>)}<p className="field-help">{[...new Set(result.moves.flatMap(r => r.conditions))].join('。')}</p>
  </>}</section>;
}
