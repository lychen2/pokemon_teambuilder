import type {BattleField} from '../types';

/** Same turn viewed from the other side, including side conditions. */
export function reverseField(field: BattleField): BattleField {
  const result: BattleField = {...field};
  for (const suffix of ['Mega', 'Tailwind', 'Boosts', 'Status', 'HPPercent', 'ItemConsumed', 'AbilityActive', 'FaintedAllies', 'AbilityId', 'ItemId'] as const) {
    Object.assign(result, {[`attacker${suffix}`]: field[`defender${suffix}`], [`defender${suffix}`]: field[`attacker${suffix}`]});
  }
  return {...result, intimidateAttacker: field.intimidateDefender, intimidateDefender: field.intimidateAttacker,
    helpingHand: field.defenderHelpingHand, defenderHelpingHand: field.helpingHand,
    reflect: field.attackerReflect, attackerReflect: field.reflect, lightScreen: field.attackerLightScreen, attackerLightScreen: field.lightScreen,
    friendGuard: field.attackerFriendGuard, attackerFriendGuard: field.friendGuard, defenderProtect: field.attackerProtect, attackerProtect: field.defenderProtect};
}
