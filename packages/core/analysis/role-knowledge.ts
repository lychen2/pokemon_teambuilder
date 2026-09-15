import type {BattleEngine} from '../battle/engine';
import {hash} from '../domain';
import {MECHANISMS, MECHANISM_GROUPS} from './mechanisms';

const compendium = 'https://www.smogon.com/forums/threads/regulation-m-b-role-compendium-updated-as-of-worlds-2026.3787475/';

export function roleKnowledge(engine: BattleEngine) {
  const allowed = (kind: 'moves' | 'abilities' | 'items', ids: readonly string[]) => ids.filter(id => {
    const entry = engine.dex[kind].get(id);
    if (!entry.exists || entry.isNonstandard) return false;
    const validate = {moves: 'checkMove', abilities: 'checkAbility', items: 'checkItem'}[kind];
    return !engine.validator[validate]({name: '机制知识'}, entry, {});
  });
  const entries = MECHANISMS.map(rule => ({...rule, reference: rule.reference ?? compendium,
    availableMoves: allowed('moves', rule.moves ?? []),
    availableAbilities: allowed('abilities', rule.abilities ?? []),
    availableItems: allowed('items', rule.items ?? []),
  }));
  const environmentId = engine.snapshot().id;
  return {environmentId, version: hash([environmentId, MECHANISM_GROUPS, entries]), groups: MECHANISM_GROUPS, entries,
    note: '按构筑用途查找机制；招式、特性和道具随当前 Showdown 规则检查。条件精算只覆盖列出的项目。深入模拟由 Showdown 推进回合，能执行机制不等于策略已能充分利用它。'};
}
export type RoleKnowledge = ReturnType<typeof roleKnowledge>;
