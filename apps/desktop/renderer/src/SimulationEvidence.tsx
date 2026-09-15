import {useState} from 'react';
import type {SimulationResult} from '../../../../packages/core/types';
import {Modal} from './ui';

export const policyNames: Record<string, string> = {pressure: '进攻启发式', control: '控场启发式', mixed: '混合启发式', damage: '配置伤害策略', support: '支援与轮转策略'};
export function SimulationEvidence({result, onError}: {result: SimulationResult; onError: (error: unknown) => void}) {
  const [open, setOpen] = useState(false); const [selected, setSelected] = useState(0); const [decisions, setDecisions] = useState(false);
  const replay = result.replays?.[selected]; const tree = result.treeDiagnostics;
  return <section className="simulation-evidence"><h4>每场对局都能回查</h4><p>己方：{policyNames[result.strategy ?? 'mixed']}；对手：{result.policies.map(id => policyNames[id]).join('、')}。</p>
    {result.opponentEvidence && <p className={result.opponentEvidence.historical ? 'notice neutral' : 'field-help'}>{result.opponentEvidence.mode === 'sources' ? `对手参考 ${result.opponentEvidence.seasons.join('、')} 的 ${result.opponentEvidence.sourceCount} 支完整合法队伍。${result.opponentEvidence.historical ? '使用的是通过本规则校验的历史样本，不代表新赛季的对手频率。' : ''}` : result.opponentEvidence.mode === 'species' ? '对手六只由用户指定，隐藏配置依据当前与历史合法观察推断。' : '复评使用指定的完整对手队伍。'}</p>}
    {tree && <><p>训练 {tree.decisions} 次决策，复用已有信息状态 {tree.reusedDecisions} 次；独立复评 {tree.evaluationDecisions} 次决策，命中训练状态 {tree.evaluationReuse} 次。共覆盖 {tree.actions} 条行动边。</p><p className="field-help">深层状态的复用有限时，结果会更多依赖策略先验。信息键保留已知招式、道具、HP、PP 与计时，避免错误合并。</p><div className="tree-histogram">{tree.visitHistogram.map((row, i, all) => <span className="badge neutral" key={row.upper}>访问 {i ? all[i - 1].upper + 1 : 1}–{row.upper} 次：{row.nodes} 状态</span>)}<span className="badge neutral">访问 &gt;100 次：{tree.above100}</span></div></>}
    {!!result.beliefEvidence?.beliefs && <p className="field-help">复评采样 {result.beliefEvidence.beliefs} 份配置假设，其中 {result.beliefEvidence.generated} 份用公开字段更新了经验配置；完成 {result.beliefEvidence.queries} 次伤害查询（复用已缓存的选出矩阵不重复计数）。</p>}
    <button className="text-button" disabled={!result.replays?.length} onClick={() => {setSelected(0); setOpen(true);}}>查看全部 {result.replays?.length ?? 0} 场复评记录</button>
    <Modal open={open} onClose={() => setOpen(false)} title="逐场模拟证据" description="记录来自实际 Showdown 回合；已完成复评才计胜负，可按随机种子定位失败原因。" wide>
      <label className="form-field">选择对局<select aria-label="选择复评对局" value={selected} onChange={e => setSelected(Number(e.target.value))}>{result.replays?.map((row, i) => <option key={i} value={i}>第 {row.index} 场 · {row.reward === 1 ? '胜' : row.reward === 0 ? '负' : '平'} · {row.turns} 回合 · {policyNames[row.policy]} · 种子 {row.seed}</option>)}</select></label>
      <label className="checkbox-label"><input type="checkbox" checked={decisions} onChange={e => setDecisions(e.target.checked)}/>显示决策及信息状态键</label>
      {replay && <><p className="field-help">对手来源：{replay.opponentId}</p>{decisions ? <div className="table-scroll"><table><thead><tr><th>回合</th><th>一方</th><th>实际提交行动</th><th>信息状态</th></tr></thead><tbody>{replay.decisions.map((row, index) => <tr key={index}><td>{row.turn}</td><td>{row.side === 'p1' ? '构筑方案' : '对照策略'}</td><td>{row.command}</td><td><code>{row.informationKey.slice(0, 16)}</code></td></tr>)}</tbody></table></div> : <pre className="paste-text">{replay.trace.join('\n')}</pre>}<button className="button secondary" onClick={() => void window.poke.saveText(`simulation-${replay.seed}.txt`, replay.trace.join('\n')).catch(onError)}>保存这场公开日志</button></>}
    </Modal>
  </section>;
}
