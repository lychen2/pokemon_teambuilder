import type {BattleField} from '../../../../packages/core/types';

export function fieldSummary(field: BattleField): string {
  const weather: Record<string, string> = {Sun: '晴天', Rain: '雨天', Sand: '沙暴', Snow: '雪天'};
  const terrain: Record<string, string> = {Grassy: '青草场地', Psychic: '精神场地', Electric: '电气场地', Misty: '薄雾场地'};
  return [field.weather && (weather[field.weather] ?? field.weather), field.terrain && (terrain[field.terrain] ?? field.terrain), field.attackerTailwind && '我方顺风', field.defenderTailwind && '对手顺风', field.trickRoom && '戏法空间'].filter(Boolean).join('、') || '无额外天气、场地或控速';
}

export function BattleConditions({field, onChange}: {field: BattleField; onChange: (field: BattleField) => void}) {
  const update = (patch: Partial<BattleField>) => onChange({...field, ...patch});
  return <div className="condition-editor"><div className="field-controls">
    <label>天气<select aria-label="天气" value={field.weather || ''} onChange={e => update({weather: e.target.value})}>{[['', '无天气'], ['Sun', '晴天'], ['Rain', '雨天'], ['Sand', '沙暴'], ['Snow', '雪天']].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    <label>场地<select aria-label="场地" value={field.terrain || ''} onChange={e => update({terrain: e.target.value})}>{[['', '无场地'], ['Grassy', '青草场地'], ['Psychic', '精神场地'], ['Electric', '电气场地'], ['Misty', '薄雾场地']].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
  </div><div className="battle-toggles">{([
    ['attackerMega', '我方 Mega 后'], ['defenderMega', '对手 Mega 后'], ['helpingHand', '我方获得帮助'], ['intimidateAttacker', '我方受到威吓'], ['reflect', '对手反射壁'], ['lightScreen', '对手光墙'], ['friendGuard', '对手友情防守'], ['defenderProtect', '对手使用守住'], ['singleTarget', '单目标伤害'], ['attackerTailwind', '我方顺风'], ['defenderTailwind', '对手顺风'], ['trickRoom', '戏法空间'], ['critical', '本次要害'],
  ] as const).map(([key, label]) => <label className="checkbox-label" key={key}><input type="checkbox" checked={Boolean(field[key])} onChange={e => update({[key]: e.target.checked})}/>{label}</label>)}</div>
    <details className="research-evidence"><summary>当前 HP、消耗与强化状态</summary><div className="form-grid">{(['attacker', 'defender'] as const).map(side => <fieldset key={side}><legend>{side === 'attacker' ? '我方' : '对手'}</legend>
      <label className="form-field">剩余 HP %<input aria-label={`${side === 'attacker' ? '我方' : '对手'}剩余HP`} type="number" min="1" max="100" value={field[`${side}HPPercent`] ?? 100} onChange={e => update({[`${side}HPPercent`]: Number(e.target.value)})}/></label>
      <label className="checkbox-label"><input type="checkbox" checked={Boolean(field[`${side}ItemConsumed`])} onChange={e => update({[`${side}ItemConsumed`]: e.target.checked})}/>道具已经消耗</label>
      <label className="form-field">特性触发状态<select aria-label={`${side === 'attacker' ? '我方' : '对手'}特性状态`} value={field[`${side}AbilityActive`] === undefined ? 'auto' : String(field[`${side}AbilityActive`])} onChange={e => update({[`${side}AbilityActive`]: e.target.value === 'auto' ? undefined : e.target.value === 'true'})}><option value="auto">按当前场地触发</option><option value="true">已触发／仍生效</option><option value="false">尚未触发／已失效</option></select></label>
      <label className="form-field">异常状态<select value={field[`${side}Status`] ?? ''} onChange={e => update({[`${side}Status`]: e.target.value})}>{[['', '无'], ['brn', '烧伤'], ['par', '麻痹'], ['psn', '中毒'], ['tox', '剧毒'], ['slp', '睡眠']].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="form-field">队友倒下次数<input aria-label={`${side === 'attacker' ? '我方' : '对手'}队友倒下次数`} type="number" min="0" value={field[`${side}FaintedAllies`] ?? 0} onChange={e => update({[`${side}FaintedAllies`]: Number(e.target.value)})}/></label>
      {(['atk', 'def', 'spa', 'spd', 'spe'] as const).map(stat => <label className="form-field" key={stat}>{({atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度'})[stat]}等级<input type="number" min="-6" max="6" value={field[`${side}Boosts`]?.[stat] ?? 0} onChange={e => update({[`${side}Boosts`]: {...field[`${side}Boosts`], [stat]: Number(e.target.value)}})}/></label>)}
    </fieldset>)}</div><p className="field-help">低血量与道具消耗是独立条件。失去场地后已经触发的轻装可通过“已触发”保留；切换出场后应重置该状态。画皮与结冻头的“已失效”使用失去外壳后的形态与能力值。</p></details>
  </div>;
}
