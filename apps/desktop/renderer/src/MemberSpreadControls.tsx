import {useMemo, useRef, useState} from 'react';
import type {AppState, BattleField, PokemonSet, SpreadRequest, SpreadResult, TeamDraft, TeamMember} from '../../../../packages/core/types';
import type {ConditionTemplate} from '../../../../packages/core/research/types';
import {SearchSelect, Spinner, useDex} from './ui';
import {SpreadOutcome} from './SpreadOutcome';

export function MemberSpreadControls({member, draft, state, field, templates, onApply, onDamage}: {
  member: TeamMember; draft: TeamDraft; state: AppState; field: BattleField; templates: ConditionTemplate[];
  onApply: (set: PokemonSet) => void; onDamage: (a: PokemonSet, d: PokemonSet, field: BattleField) => void;
}) {
  const dex = useDex();
  const [speedMode, setSpeedMode] = useState<'opponent' | 'number'>('opponent');
  const [speed, setSpeed] = useState(''); const [speedId, setSpeedId] = useState<string | null>(null);
  const [attackId, setAttackId] = useState<string | null>(null); const [attackMove, setAttackMove] = useState<string | null>(null);
  const [defendId, setDefendId] = useState<string | null>(null); const [defendMove, setDefendMove] = useState<string | null>(null);
  const [chance, setChance] = useState(1); const [conditionIds, setConditionIds] = useState<string[]>([]);
  const [history, setHistory] = useState(!state.configurations.some(c => c.currentCount > 0));
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [result, setResult] = useState<{key: string; data: SpreadResult} | null>(null);
  const configurations = useMemo(() => state.configurations.filter(c => history || c.currentCount > 0).sort((a, b) => Number(b.currentCount > 0) - Number(a.currentCount > 0) || b.currentCount - a.currentCount || b.historyCount - a.historyCount), [state.configurations, history]);
  const targetOptions = useMemo(() => [{id: '', name: 'No target', zh: '不指定目标'}, ...configurations.map(c => ({id: c.id,
    name: `${dex.speciesById.get(c.speciesId)?.name} ${dex.items.find(item => item.id === c.set.itemId)?.name ?? ''}`,
    zh: `${dex.names('species', c.speciesId)} · ${dex.names('items', c.set.itemId)} · ${dex.names('natures', c.set.natureId)}`,
    group: c.currentCount > 0 ? '本赛季真实配置' : '历史合法配置',
    detail: `${c.set.moves.map(move => dex.names('moves', move)).join(' / ')} · 速度 ${c.set.points!.spe} 点 · 当前 ${c.currentCount} 队，历史 ${c.historyCount} 队`,
  }))], [configurations, dex]);
  const selected = (id: string | null) => configurations.find(c => c.id === id)?.set;
  const speedTarget = selected(speedId); const attack = selected(attackId); const defense = selected(defendId);
  const damageMoves = dex.moves.filter(move => move.category !== 'Status');
  const attacks = damageMoves.filter(move => member.set.moves.includes(move.id));
  const defenses = damageMoves.filter(move => defense?.moves.includes(move.id));
  const key = JSON.stringify([member, draft.analysisRevision, draft.environmentId, state.model.version, field, speedMode, speed, speedId, attackId, attackMove, chance, defendId, defendMove, conditionIds, history]);
  const currentKey = useRef(key); currentKey.current = key;
  const hasTarget = (speedMode === 'number' ? speed !== '' : !!speedTarget) || !!attack || !!defense;
  const missingMove = (!!attack && !attackMove) || (!!defense && !defendMove);
  const optimize = async () => {
    setBusy(true); setError('');
    const conditions = templates.filter(template => conditionIds.includes(template.id)).flatMap(template => [
      {name: template.title, field: template.field, defender: template.defender},
      ...template.variants.map(variant => ({name: `${template.title} · ${variant.name}`, field: {...template.field, ...variant.field}, defender: variant.defender ?? template.defender})),
    ]).map(condition => ({name: condition.name, field: condition.field, attackTarget: attack ? condition.defender : undefined, defendTarget: defense ? condition.defender : undefined}));
    const request: SpreadRequest = {
      draft: {...draft, members: draft.members.map(row => row.id === member.id ? {...member, set: {...member.set, moves: member.set.moves.filter(Boolean)}} : row)},
      memberId: member.id, field, previewOnly: true,
      speedTarget: speedMode === 'number' && speed !== '' ? Number(speed) : undefined,
      speedBenchmark: speedMode === 'opponent' && speedTarget ? {opponent: speedTarget, field, order: 'before'} : undefined,
      attackTarget: attack, attackMove: attackMove || undefined, attackChance: chance,
      defendTarget: defense, defendMove: defendMove || undefined,
      conditions: [{name: '当前对局条件', field}, ...conditions],
    };
    try {const data = await window.poke.call('optimizeSpread', request); setResult({key, data});}
    catch (err) {if (currentKey.current === key) setError(err instanceof Error ? err.message : String(err));}
    finally {setBusy(false);}
  };
  return <section className="spread-targets"><h3>按具体对手分配能力点</h3><p>使用正在编辑的配置与上方对局条件，寻找同时满足目标的最低点数分配。没有选择的目标不会参与计算。</p>
    <label className="checkbox-label"><input type="checkbox" checked={history} onChange={e => {setHistory(e.target.checked); setSpeedId(null); setAttackId(null); setDefendId(null);}}/>对照中包括历史合法配置</label>
    <fieldset className="spread-target-group"><legend>速度目标</legend>
      <div className="segmented-control"><button aria-pressed={speedMode === 'opponent'} onClick={() => setSpeedMode('opponent')}>选择对手配置</button><button aria-pressed={speedMode === 'number'} onClick={() => setSpeedMode('number')}>输入速度值</button></div>
      {speedMode === 'opponent' ? <SearchSelect label="想要先手的对手" value={speedId} options={targetOptions} onChange={setSpeedId}/> : <label className="form-field">对手的对局速度<input aria-label="对手的对局速度" type="number" min="0" placeholder="例如 167；留空表示不约束" value={speed} onChange={e => setSpeed(e.target.value)}/></label>}
      <p className="field-help">我方{dex.names('items', member.set.itemId)}、特性与已选条件会自动计入。{field.trickRoom ? '戏法空间中寻找更低速度。' : '寻找比目标更高的速度。'}只比较相同优先度，同速不算稳定先手。</p>
    </fieldset>
    <fieldset className="spread-target-group"><legend>进攻目标</legend>
      <SearchSelect label="想要击杀的对手" value={attackId} options={targetOptions} onChange={id => {setAttackId(id); if (attacks.length === 1) setAttackMove(attacks[0].id);}}/>
      {attack && <><SearchSelect label="使用的进攻招式" value={attackMove} options={attacks} onChange={setAttackMove}/><label className="form-field">命中后的击杀要求<select aria-label="命中后的击杀要求" value={chance} onChange={e => setChance(Number(e.target.value))}><option value={1}>全部伤害乱数都能击杀（100%）</option><option value={0.75}>至少 75% 的概率击杀</option><option value={0.5}>至少 50% 的概率击杀</option></select></label><button className="text-button" onClick={() => onDamage(member.set, attack, field)}>查看当前伤害与条件</button></>}
    </fieldset>
    <fieldset className="spread-target-group"><legend>生存目标</legend>
      <SearchSelect label="需要承受攻击的对手" value={defendId} options={targetOptions} onChange={id => {setDefendId(id); setDefendMove(null);}}/>
      {defense && <><SearchSelect label="抵抗的招式" value={defendMove} options={defenses} onChange={setDefendMove}/><p className="field-help">在指定血量和条件下，承受最高伤害后仍保留 HP。</p></>}
    </fieldset>
    {templates.length > 0 && <fieldset className="spread-target-group"><legend>同时检验保存的条件</legend><p className="field-help">除当前条件外，再用所选模板的对手和全部变化条件检验进攻／生存招式。</p>{templates.map(template => <label className="checkbox-label" key={template.id}><input type="checkbox" checked={conditionIds.includes(template.id)} onChange={e => setConditionIds(e.target.checked ? [...conditionIds, template.id] : conditionIds.filter(id => id !== template.id))}/>{template.title}（{template.variants.length + 1} 个场景）</label>)}</fieldset>}
    {member.lock.fields.includes('points') && <p className="field-help">配点已锁定。解锁后可按目标调整。</p>}
    {error && <p className="notice warning" role="alert">{error}</p>}
    <button className="button primary full-width" disabled={busy || !hasTarget || missingMove || member.lock.fields.includes('points')} onClick={() => void optimize()}>{busy ? <Spinner label="正在核对目标与最少点数"/> : '搜索阈值配点'}</button>
    {result && <SpreadOutcome result={result.data} stale={result.key !== key} onApply={result.data.optimizedSet ? () => {if (result.key === currentKey.current) {onApply(result.data.optimizedSet!); setResult(null);}} : undefined}/>}
  </section>;
}
