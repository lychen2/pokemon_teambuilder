import type {BattleEngine} from './engine';
import type {MetaModel} from '../analysis/model';
import type {BattleObservation, VisiblePokemon} from './observation';
import type {Action, OpponentPolicy} from './policy';
import {helpingHandAdjustment} from './policy';
import type {BattleField, PokemonSet} from '../types';
import {healthFraction} from './observation';
import {sample, toID} from '../domain';
import {reverseField} from './fields';
import {conditionedConfigurations} from './configuration-beliefs';

interface Estimate {damage: number; ko: number; faster: number}
export interface PolicyEvidence {beliefs: number; generated: number; queries: number}

/** A decision model gets our roster and public observations, never the opponent's private battle state. */
export function beliefActions(options: {
  engine: BattleEngine; meta: MetaModel; observation: BattleObservation; own: PokemonSet[];
  actions: Action[]; policy: OpponentPolicy; random: () => number; samples: number;
}): {actions: Action[]; evidence: PolicyEvidence} {
  const {engine, meta, observation: obs, own, actions, policy, random, samples} = options;
  const evidence: PolicyEvidence = {beliefs: 0, generated: 0, queries: 0};
  if (policy !== 'damage' && policy !== 'support') return {actions, evidence};
  const other = obs.side === 'p1' ? 'p2' : 'p1';
  const roster = obs.request?.side?.pokemon ?? [];
  const identity = (ident: string) => ident.replace(/^(p[12])[a-z]:/, '$1:');
  const activeAt = (slot: number) => Object.values(obs.active).find(p => identity(p.ident) === identity(roster[slot]?.ident ?? ''));
  const baseId = (id: string) => engine.initialSpeciesId(id);
  const ownSet = (slot: number) => {
    const id = baseId(toID(roster[slot].details.split(',')[0]));
    const set = own.find(set => set.speciesId === id);
    if (!set) throw new Error(`策略找不到己方已知配置：${id}`);
    return set;
  };
  if (!obs.request || obs.request.wait) return {actions, evidence};
  if (obs.request.teamPreview) return {actions, evidence};
  const foes = ['a', 'b'].map(slot => obs.active[other + slot]).filter((p): p is VisiblePokemon => Boolean(p && healthFraction(p.condition) > 0));
  const beliefs = new Map<string, PokemonSet[]>();
  for (const foe of foes) {
    const species = baseId(foe.speciesId);
    const sheets = obs.openSheets?.find(sheet => sheet.speciesId === species);
    const knownMoves = [...new Set([...(sheets?.moves ?? []), ...foe.moves])].filter(id => id !== 'struggle');
    const known: Partial<PokemonSet> = {moves: knownMoves};
    // Open sheets describe the initial configuration. Current observed items and
    // abilities can have changed in battle and are used only in fieldFor below.
    if (sheets?.itemId != null) known.itemId = sheets.itemId;
    if (sheets?.abilityId != null) known.abilityId = sheets.abilityId;
    const candidates = conditionedConfigurations(meta, engine, species, obs.preview, known);
    const draws = Array.from({length: samples}, () => sample(candidates, candidates.map(c => c.probability), random));
    evidence.beliefs += draws.length; evidence.generated += draws.filter(row => row.generated).length;
    beliefs.set(foe.ident, draws.map(row => row.set));
  }
  const abilityAt = (slot: number, megaSlot: number): string => {
    if (slot !== megaSlot) return roster[slot].ability;
    const base = ownSet(slot); const species = engine.dex.species.get(base.speciesId);
    const form = engine.dex.species.get(engine.dex.items.get(base.itemId).megaStone[species.name]);
    return toID(form.abilities['0']);
  };
  const fieldFor = (slot: number, foe: VisiblePokemon, megaSlot: number): BattleField => {
    const mine = roster[slot]; const active = activeAt(slot);
    const ownSpecies = engine.dex.species.get(toID(mine.details.split(',')[0])); const foeSpecies = engine.dex.species.get(foe.speciesId);
    const field: BattleField = {weather: ({sunnyday: 'Sun', raindance: 'Rain', sandstorm: 'Sand', snowscape: 'Snow'} as Record<string, string>)[obs.weather], terrain: ({grassyterrain: 'Grassy', psychicterrain: 'Psychic', electricterrain: 'Electric', mistyterrain: 'Misty'} as Record<string, string>)[obs.terrain],
      attackerMega: ownSpecies.isMega, defenderMega: foeSpecies.isMega, attackerHPPercent: healthFraction(mine.condition) * 100, defenderHPPercent: healthFraction(foe.condition) * 100,
      attackerAbilityActive: ['mimikyubusted', 'eiscuenoice'].includes(ownSpecies.id) ? false : undefined, defenderAbilityActive: ['mimikyubusted', 'eiscuenoice'].includes(foeSpecies.id) ? false : undefined,
      attackerBoosts: active?.boosts, defenderBoosts: foe.boosts, attackerStatus: mine.condition.split(' ')[1], defenderStatus: foe.condition.split(' ')[1],
      attackerAbilityId: mine.ability, defenderAbilityId: foe.ability, attackerItemId: mine.item, defenderItemId: foe.item,
      attackerItemConsumed: !mine.item && Boolean(ownSet(slot).itemId), defenderItemConsumed: foe.item === '', attackerFaintedAllies: obs.fainted[obs.side], defenderFaintedAllies: obs.fainted[other],
      attackerTailwind: obs.tailwind[obs.side], defenderTailwind: obs.tailwind[other], trickRoom: obs.trickRoom,
      reflect: Boolean(obs.sideConditions[other].reflect), lightScreen: Boolean(obs.sideConditions[other].lightscreen), attackerReflect: Boolean(obs.sideConditions[obs.side].reflect), attackerLightScreen: Boolean(obs.sideConditions[obs.side].lightscreen)};
    // Both allies know their own joint command. Apply its Mega transition before
    // evaluating either move, without reading the opponent's simultaneous choice.
    if (megaSlot >= 0) {
      const ability = abilityAt(megaSlot, megaSlot);
      const weather = ({drought: 'Sun', drizzle: 'Rain', sandstream: 'Sand', snowwarning: 'Snow'} as Record<string, string>)[ability];
      const terrain = ({grassysurge: 'Grassy', psychicsurge: 'Psychic', electricsurge: 'Electric', mistysurge: 'Misty'} as Record<string, string>)[ability];
      if (weather) field.weather = weather;
      if (terrain) field.terrain = terrain;
      if (slot === megaSlot) {field.attackerMega = true; delete field.attackerAbilityId;}
    }
    return field;
  };
  const outgoing = new Map<string, Estimate>(); const incoming = new Map<string, number>();
  const estimate = (slot: number, moveId: string, foe: VisiblePokemon, megaSlot: number): Estimate => {
    const key = [slot, moveId, foe.ident, megaSlot].join(':'); const cached = outgoing.get(key); if (cached) return cached;
    const draws = beliefs.get(foe.ident)!; const base = ownSet(slot); const field = fieldFor(slot, foe, megaSlot);
    const values = draws.map(set => {
      const result = engine.damage({...base, moves: [moveId, ...base.moves.filter(id => id !== moveId)].slice(0, 4)}, set, field).find(row => row.moveId === moveId)!;
      const speed = engine.speeds(base, set, field); evidence.queries++;
      return {damage: Math.min(1, result.expectedDamage / result.currentHP), ko: result.ohko, faster: Number(field.trickRoom ? speed.attacker < speed.defender : speed.attacker > speed.defender)};
    });
    const value = {damage: values.reduce((sum, value) => sum + value.damage, 0) / values.length, ko: values.reduce((sum, value) => sum + value.ko, 0) / values.length, faster: values.reduce((sum, value) => sum + value.faster, 0) / values.length};
    outgoing.set(key, value); return value;
  };
  const danger = (slot: number, megaSlot: number): number => {
    if (!roster[slot] || healthFraction(roster[slot].condition) === 0) return 0;
    const key = `${slot}:${megaSlot}`; const cached = incoming.get(key); if (cached !== undefined) return cached;
    const value = foes.reduce((sum, foe) => {
      const values = beliefs.get(foe.ident)!.map(set => Math.max(0, ...engine.damage(set, ownSet(slot), reverseField(fieldFor(slot, foe, megaSlot))).map(result => Math.min(1, result.expectedDamage / result.currentHP))));
      evidence.queries += values.length;
      return sum + values.reduce((a, b) => a + b, 0) / values.length;
    }, 0); incoming.set(key, value); return value;
  };
  const scores = new Map<string, number>();
  const scoreSlot = (command: string, slot: number, megaSlot: number): number => {
    const key = `${slot}:${command}:${megaSlot}`; if (scores.has(key)) return scores.get(key)!;
    let value = 0;
    if (command === 'pass') return 0;
    const switched = command.match(/^switch (\d+)/);
    const active = activeAt(slot);
    if (switched) {
      const next = Number(switched[1]) - 1;
      if (roster[slot]?.reviving) value = .5 + Math.max(engine.stats(ownSet(next), true).atk, engine.stats(ownSet(next), true).spa) / 150;
      else {
        value = 1 - danger(next, megaSlot) - .35 + (active?.perishCount === 1 ? 4 : 0);
        if (policy === 'support' && roster[slot]?.ability === 'regenerator') value += (1 - healthFraction(roster[slot].condition));
        if (policy === 'support' && roster[next].ability === 'intimidate') value += .3;
      }
    } else {
      const parsed = command.match(/^move (\d+)(?: (-?\d+))?(?: (mega))?$/);
      if (!parsed) throw new Error(`未建模的合法行动：${command}`);
      const moveId = obs.request.active[slot].moves[Number(parsed[1]) - 1].id;
      // Recharge is a forced turn action in the request, not a damaging move in the Dex.
      if (moveId === 'recharge') return 0;
      const move = engine.dex.moves.get(moveId);
      const target = Number(parsed[2] ?? 0);
      const targetFoes = target > 0 ? foes.filter(foe => foe.ident.startsWith(other + ['a', 'b'][target - 1])) : target === 0 ? foes : [];
      if (move.category !== 'Status') {
        const estimates = targetFoes.map(foe => estimate(slot, moveId, foe, megaSlot));
        value = estimates.reduce((sum, e) => sum + 2.1 * e.damage + .65 * e.ko + (e.damage > 0 ? .25 * e.faster : 0), 0);
        if (target < 0) value = -6;
        if (moveId === 'fakeout') value += active && obs.turn - active.entered > 1 ? -6 : estimates.some(e => e.damage > 0) ? .8 : -3;
        if (moveId === 'suckerpunch') value *= .65;
        if (move.accuracy !== true) value *= Number(move.accuracy) / 100;
        if (move.recoil && abilityAt(slot, megaSlot) !== 'rockhead' && abilityAt(slot, megaSlot) !== 'magicguard') value -= .25 * danger(slot, megaSlot);
      } else {
        const protect = ['protect', 'detect', 'spikyshield', 'banefulbunker', 'silktrap', 'burningbulwark'].includes(moveId);
        if (protect) value = active?.lastMove === moveId ? -.8 : .25 + danger(slot, megaSlot) * .8;
        else if (moveId === 'tailwind') value = obs.tailwind[obs.side] ? -3 : 1.8;
        else if (moveId === 'trickroom') {
          const advantage = foes.reduce((sum, foe) => {const speed = engine.speeds(ownSet(slot), beliefs.get(foe.ident)![0], fieldFor(slot, foe, megaSlot)); return sum + Number(speed.attacker < speed.defender);}, 0) / Math.max(1, foes.length);
          value = (obs.trickRoom ? 1 - advantage : advantage) * 3 - .5;
        } else if (moveId === 'revivalblessing') value = roster.some((p: any) => healthFraction(p.condition) === 0) ? policy === 'support' ? 3.2 : 1 : -5;
        else if (moveId === 'perishsong') {
          const trapped = [0, 1].some(ally => {const pokemon = activeAt(ally); return pokemon && healthFraction(pokemon.condition) > 0 && abilityAt(ally, megaSlot) === 'shadowtag';}) && foes.every(foe => !engine.dex.species.get(foe.speciesId).types.includes('Ghost') && foe.ability !== 'shadowtag' && foe.item !== 'shedshell');
          value = foes.some(foe => foe.perishCount !== undefined) ? -4 : policy === 'support' ? (trapped ? 3.4 : 1.3) : .1;
        } else if (['followme', 'ragepowder'].includes(moveId)) value = policy === 'support' ? 1 + .55 * danger(1 - slot, megaSlot) : .5;
        else if (moveId === 'helpinghand') value = policy === 'support' ? 1.3 : .4;
        else if (move.heal || ['lifedew', 'healpulse'].includes(moveId)) value = 3 * (1 - healthFraction(roster[target < 0 ? -target - 1 : slot].condition));
        else if (['spore', 'sleeppowder', 'willowisp', 'thunderwave', 'nuzzle'].includes(moveId)) {
          const foe = targetFoes[0]; const immune = foe && (Boolean(foe.condition.split(' ')[1]) || ['spore', 'sleeppowder'].includes(moveId) && engine.dex.species.get(foe.speciesId).types.includes('Grass'));
          value = immune ? -3 : 1.4;
        } else if (moveId === 'wideguard') value = policy === 'support' && foes.some(foe => beliefs.get(foe.ident)!.some(set => set.moves.some(id => ['allAdjacent', 'allAdjacentFoes'].includes(engine.dex.moves.get(id).target)))) ? 1.8 : .4;
        else value = .4;
        if (policy === 'support' && protect && foes.some(foe => foe.perishCount === 1)) value += 2.4;
        if (active?.perishCount === 1) value -= 3;
      }
    }
    scores.set(key, value); return value;
  };
  const ranked = actions.map(action => {
    const commands = action.command.split(', ');
    const megaSlot = commands.findIndex(command => command.endsWith(' mega'));
    let prior = commands.reduce((sum, command, slot) => sum + scoreSlot(command, slot, megaSlot), 0);
    prior += helpingHandAdjustment(engine, obs, action);
    if (policy === 'support' && action.moves.some(id => ['followme', 'ragepowder', 'fakeout'].includes(id)) && action.moves.some(id => ['tailwind', 'trickroom', 'perishsong', 'revivalblessing', 'swordsdance', 'nastyplot'].includes(id))) prior += .7;
    if (action.moves.filter(id => ['tailwind', 'trickroom'].includes(id)).length > 1) prior -= 3;
    return {...action, prior};
  });
  return {actions: ranked.sort((a, b) => b.prior - a.prior), evidence};
}
