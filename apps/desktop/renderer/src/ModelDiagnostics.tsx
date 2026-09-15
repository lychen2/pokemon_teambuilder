import type {Model} from '../../../../packages/core/types';

export function ModelDiagnostics({model}: {model: Model}) {
  const calibration = model.calibration; const partial = model.partialEvidence;
  return <details className="surface knowledge-panel"><summary>配置概率与缺字段证据</summary><p className="muted">配置流派代表来自真实观察。缺配点资料只为兼容流派贡献已知字段，未知数值不会进入伤害计算。</p>{partial && <p>缺字段资料：检查 {partial.considered} 条，匹配 {partial.assigned} 条，未匹配 {partial.unmatched} 条，已知字段不合法 {partial.invalid} 条。</p>}
    {calibration && <><p>内部时间切分：{calibration.cutoff?.slice(0, 10) ?? '数据不足'}；{calibration.samples} 个字段预测。温度 {calibration.temperature}。</p><p className="notice neutral">这里是训练资料内部的概率校准，已隔离重复队伍、作者和原链接；它不是新的独立盲测，也不是排位胜率。</p>{calibration.diagnostics && <>
      <div className="table-scroll"><table><caption>概率质量（越低越好）</caption><thead><tr><th>阶段</th><th>对数损失</th><th>Brier 误差</th><th>标签复原</th><th>未见标签数</th></tr></thead><tbody>{(['before', 'after'] as const).map(key => {const row = calibration.diagnostics![key]; return <tr key={key}><th>{key === 'before' ? '校准前' : '校准后'}</th><td>{row.logLoss?.toFixed(3) ?? '—'}</td><td>{row.brier?.toFixed(3) ?? '—'}</td><td>{row.accuracy === null ? '—' : `${(row.accuracy * 100).toFixed(1)}%`}</td><td>{row.unseen}</td></tr>;})}</tbody></table></div>
      <div className="table-scroll"><table><caption>校准后的置信度分箱</caption><thead><tr><th>预测置信度</th><th>样本</th><th>平均预测</th><th>实际复原</th></tr></thead><tbody>{calibration.diagnostics.after.bins.map(bin => <tr key={bin.lower}><th>{Math.round(bin.lower * 100)}–{Math.round((bin.lower + .1) * 100)}%</th><td>{bin.count}</td><td>{bin.confidence === null ? '—' : `${(bin.confidence * 100).toFixed(1)}%`}</td><td>{bin.accuracy === null ? '—' : `${(bin.accuracy * 100).toFixed(1)}%`}</td></tr>)}</tbody></table></div>
    </>}</>}
  </details>;
}
