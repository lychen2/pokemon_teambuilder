import type {BattleEngine} from './engine';
import type {BattleObservation, VisiblePokemon} from './observation';
import {healthFraction} from './observation';
import {combinations, hash, sample, toID} from '../domain';
import {informationKey} from './information-state';

export interface Action {command: string; prior: number; switches: number[]; mega: number; targets: number[]; moves: string[]}
export type OpponentPolicy = 'pressure' | 'control' | 'mixed' | 'damage' | 'support';
const foeSide = (side: string) => side === 'p1' ? 'p2' : 'p1';
const action = (command: string, prior: number, switches: number[] = [], mega = 0, targets: number[] = [], moves: string[] = []): Action => ({command, prior, switches, mega, targets, moves});

/** Helping Hand depends on our simultaneous partner action, which is not hidden information. */
export function helpingHandAdjustment(engine: BattleEngine, obs: BattleObservation, candidate: Action): number {
  if (!candidate.moves.includes('helpinghand')) return 0;
  const commands = candidate.command.split(', ');
  return commands.reduce((sum, command, slot) => {
    const selected = command.match(/^move (\d+)(?: (-?\d+))?/);
    if (!selected || obs.request.active[slot].moves[Number(selected[1]) - 1].id !== 'helpinghand') return sum;
    const partner = -Number(selected[2]) - 1;
    const selectedPartner = commands[partner]?.match(/^move (\d+)/);
    const moveId = selectedPartner && obs.request.active[partner]?.moves[Number(selectedPartner[1]) - 1]?.id;
    const attacks = moveId && moveId !== 'recharge' && engine.dex.moves.get(moveId).category !== 'Status';
    return sum + (attacks ? .5 : -6);
  }, 0);
}

function offense(engine: BattleEngine, speciesId: string, moveId: string, defenderId: string): number {
  const move = engine.dex.moves.get(moveId); const defender = engine.dex.species.get(defenderId); const own = engine.dex.species.get(speciesId);
  if (!move.exists || move.category === 'Status') return 0;
  if (!engine.dex.getImmunity(move.type, defender)) return 0;
  const effectiveness = Math.pow(2, engine.dex.getEffectiveness(move.type, defender));
  const stab = own.types.includes(move.type) ? 1.5 : 1;
  const power = move.basePower || (move.damage ? 70 : 60);
  const ratio = move.category === 'Physical' ? own.baseStats.atk / Math.max(1, defender.baseStats.def) : own.baseStats.spa / Math.max(1, defender.baseStats.spd);
  return power * effectiveness * stab * ratio / 100;
}

function movePrior(engine: BattleEngine, obs: BattleObservation, slot: number, moveId: string, target: number, policy: OpponentPolicy): number {
  const own = obs.request.side.pokemon[slot]; const species = toID(own.details.split(',')[0]);
  const otherSide = foeSide(obs.side);
  const foes = ['a', 'b'].map(s => obs.active[otherSide + s]).filter((p): p is VisiblePokemon => Boolean(p && healthFraction(p.condition) > 0));
  const ownActive = obs.active[obs.side + ['a', 'b'][slot]];
  const move = engine.dex.moves.get(moveId);
  if (target && healthFraction(target > 0 ? obs.active[otherSide + ['a', 'b'][target - 1]]?.condition || '0 fnt' : obs.request.side.pokemon[-target - 1]?.condition || '0 fnt') === 0) return -6;
  const pressure = foes.map(p => offense(engine, species, moveId, p.speciesId));
  if (move.category !== 'Status') {
    if (moveId === 'fakeout' && ownActive && obs.turn - ownActive.entered > 1) return -5;
    if (move.priority > 0 && obs.terrain === 'psychicterrain' && target > 0) {const foe = obs.active[otherSide + ['a', 'b'][target - 1]]; if (foe && !engine.dex.species.get(foe.speciesId).types.includes('Flying')) return -2;}
    if (target < 0) return moveId === 'beatup' && /justified/.test(obs.request.side.pokemon[-target - 1]?.ability) ? 1.8 : -8;
    let value = target > 0 ? offense(engine, species, moveId, obs.active[otherSide + ['a', 'b'][target - 1]]?.speciesId || foes[0]?.speciesId || species) : pressure.reduce((a, b) => a + b, 0) * 0.75;
    if (moveId === 'fakeout') value += 1.1;
    if (['icywind', 'electroweb', 'snarl'].includes(moveId)) value += 0.45;
    if (['suckerpunch', 'thunderclap'].includes(moveId)) value *= 0.7;
    return value * (policy === 'pressure' ? 1.25 : 1);
  }
  const control = policy === 'control' ? 1.35 : 1;
  if (moveId === 'tailwind') return obs.tailwind[obs.side] ? -3 : 2.2 * control;
  if (moveId === 'trickroom') {const slow = own.stats.spe < 95; return (slow !== obs.trickRoom ? 2 : -2) * control;}
  if (['protect', 'detect', 'spikyshield', 'banefulbunker', 'silktrap', 'burningbulwark'].includes(moveId)) return ownActive?.lastMove === moveId ? -1 : 0.35 + (1 - healthFraction(own.condition));
  if (['followme', 'ragepowder'].includes(moveId)) return 1.2 * control;
  if (moveId === 'helpinghand') return 1.05 * control;
  if (['spore', 'sleeppowder', 'willowisp', 'thunderwave', 'taunt', 'encore'].includes(moveId)) {
    const foe = obs.active[otherSide + ['a', 'b'][Math.max(0, target - 1)]];
    return /slp|brn|par/.test(foe?.condition ?? '') ? -1 : 1.4 * control;
  }
  if (['swordsdance', 'nastyplot', 'calmmind', 'dragondance', 'quiverdance', 'bulkup', 'irondefense'].includes(moveId)) return Object.values(ownActive?.boosts ?? {}).some(v => v >= 2) ? 0 : 1.05;
  if (['recover', 'roost', 'slackoff', 'softboiled', 'lifedew'].includes(moveId)) return (1 - healthFraction(own.condition)) * 3;
  if (['reflect', 'lightscreen', 'auroraveil', 'wideguard', 'partingshot'].includes(moveId)) return 1.1 * control;
  return 0.25;
}

function previewActions(engine: BattleEngine, obs: BattleObservation): Action[] {
  const pokemon = obs.request.side.pokemon;
  const actions: Action[] = [];
  for (const chosen of combinations(pokemon.map((_: any, i: number) => i) as number[], obs.request.maxChosenTeamSize)) {
    for (const first of chosen) for (const second of chosen.filter(i => i !== first)) {
      const order = [first, second, ...chosen.filter(i => i !== first && i !== second)];
      actions.push(action(`team ${order.map(i => i + 1).join(',')}`, 0));
    }
  }
  return actions;
}

export function legalActions(engine: BattleEngine, obs: BattleObservation, policy: OpponentPolicy = 'mixed'): Action[] {
  const req = obs.request;
  if (!req || req.wait) return [action('', 0)];
  if (req.teamPreview) return previewActions(engine, obs).sort((a, b) => b.prior - a.prior);
  const reserves = req.side.pokemon.map((p: any, i: number) => ({p, i})).filter(({p}: any) => !p.active && healthFraction(p.condition) > 0);
  const force = req.forceSwitch as boolean[] | undefined;
  const revivalCount = force?.filter((value, slot) => value && req.side.pokemon[slot]?.reviving).length ?? 0;
  const ordinarySwitches = (force?.filter(Boolean).length ?? 0) - revivalCount;
  const slots: Action[][] = (force || req.active).map((data: any, slot: number): Action[] => {
    if (force && !data || !force && healthFraction(req.side.pokemon[slot].condition) === 0) return [action('pass', 0)];
    const options: Action[] = [];
    if (force && req.side.pokemon[slot]?.reviving) {
      return req.side.pokemon.flatMap((pokemon: any, index: number) => healthFraction(pokemon.condition) === 0 ? [action(`switch ${index + 1}`, 1, [index])] : []);
    }
    if (force || !data.trapped) {
      for (const {p, i} of reserves) {
        const species = toID(p.details.split(',')[0]);
        const foes = Object.values(obs.active).filter(p => p.ident.startsWith(foeSide(obs.side)));
        const gain = foes.reduce((n, foe) => n + Math.max(0, ...p.moves.map((m: string) => offense(engine, species, m, foe.speciesId))), 0) / Math.max(1, foes.length);
        options.push(action(`switch ${i + 1}`, gain * 0.5 + (force ? 0 : -0.5), [i]));
      }
    }
    if (force) {
      if (reserves.length < ordinarySwitches) options.push(action('pass', -2));
      return options;
    }
    for (const [i, move] of data.moves.entries()) {
      if (move.disabled || move.pp === 0) continue;
      let targets = [0];
      // Target legality is positional, including an empty slot; the battle engine resolves failure/retargeting.
      const foes = [1, 2];
      const allies = [1, 2].filter(t => t !== slot + 1).map(t => -t);
      if (['normal', 'adjacentFoe', 'any'].includes(move.target)) targets = [...foes, ...(['normal', 'any'].includes(move.target) ? allies : [])];
      if (move.target === 'adjacentAlly') targets = allies;
      if (move.target === 'adjacentAllyOrSelf') targets = [...allies, -(slot + 1)];
      for (const target of targets) {
        const base = `move ${i + 1}${target ? ` ${target}` : ''}`;
        const prior = movePrior(engine, obs, slot, move.id, target, policy);
        options.push(action(base, prior, [], 0, [target], [move.id]));
        if (data.canMegaEvo) options.push(action(base + ' mega', prior + 0.22, [], 1, [target], [move.id]));
      }
    }
    return options;
  });
  let joint: Action[] = [action('', 0)];
  for (const choices of slots) joint = joint.flatMap(a => choices.filter(b => a.mega + b.mega <= 1 && !b.switches.some(s => a.switches.includes(s))).map(b => ({command: [a.command, b.command].filter(Boolean).join(', '), prior: a.prior + b.prior, switches: [...a.switches, ...b.switches], mega: a.mega + b.mega, targets: [...a.targets, ...b.targets], moves: [...a.moves, ...b.moves]})));
  if (force) joint = joint.filter(a => a.switches.length === revivalCount + Math.min(reserves.length, ordinarySwitches));
  for (const a of joint) {
    a.prior += helpingHandAdjustment(engine, obs, a);
    if (a.targets.length === 2 && a.targets[0] > 0 && a.targets[0] === a.targets[1]) a.prior += 0.22;
    if (a.moves.filter(m => ['tailwind', 'trickroom'].includes(m)).length > 1) a.prior -= 2;
    if (a.moves.some(m => ['followme', 'ragepowder', 'fakeout'].includes(m)) && a.moves.some(m => ['tailwind', 'trickroom', 'swordsdance', 'nastyplot'].includes(m))) a.prior += 0.7;
  }
  if (!joint.length) throw new Error(`无法为合法请求生成行动：${JSON.stringify(req)}`);
  return joint.sort((a, b) => b.prior - a.prior);
}

export function policyAction(actions: Action[], random: () => number, policy: OpponentPolicy): Action {
  const invalid = actions.filter(action => !Number.isFinite(action.prior));
  if (invalid.length) throw new Error(`行动分值不是有限数：${invalid.map(action => `${action.command}=${action.prior}`).join('；')}`);
  const temperature = policy === 'mixed' ? 0.65 : 0.4;
  const best = actions[0].prior;
  return sample(actions, actions.map(a => Math.exp((a.prior - best) / temperature)), random);
}

interface Edge {visits: number; value: number; available: number}
interface Node {visits: number; actions: Map<string, Edge>}
export class InformationTree {
  readonly nodes = new Map<string, Node>();
  decisions = 0;
  reusedDecisions = 0;
  evaluationDecisions = 0;
  evaluationReuse = 0;
  constructor(private readonly keyFor: (observation: BattleObservation) => string = informationKey) {}
  choose(observation: BattleObservation, actions: Action[], random: () => number, training: boolean): {action: Action; key: string} {
    const key = this.keyFor(observation);
    let node = this.nodes.get(key);
    if (training) {this.decisions++; if (node?.visits) this.reusedDecisions++;}
    else {this.evaluationDecisions++; if (node?.visits) this.evaluationReuse++;}
    if (!node && training) {node = {visits: 0, actions: new Map()}; this.nodes.set(key, node);}
    if (!node) return {action: policyAction(actions, random, 'mixed'), key};
    if (!training) {
      const learned = actions.filter(a => (node!.actions.get(a.command)?.visits ?? 0) > 0).sort((a, b) => {
        const x = node!.actions.get(a.command)!; const y = node!.actions.get(b.command)!;
        return y.value / Math.max(1, y.visits) - x.value / Math.max(1, x.visits) || y.visits - x.visits;
      });
      return {action: learned[0] ?? policyAction(actions, random, 'mixed'), key};
    }
    const width = Math.ceil(2 * Math.sqrt(node.visits + 1));
    for (const candidate of actions) {const edge = node.actions.get(candidate.command); if (edge) edge.available++;}
    const unseen = actions.filter(a => !node!.actions.has(a.command));
    if (unseen.length && node.actions.size < width) {const chosen = policyAction(unseen, random, 'mixed'); node.actions.set(chosen.command, {visits: 0, value: 0, available: 1}); return {action: chosen, key};}
    const available = actions.filter(a => node!.actions.has(a.command));
    const score = (a: Action) => {const edge = node!.actions.get(a.command)!; return edge.visits ? edge.value / edge.visits + Math.sqrt(2 * Math.log(edge.available + 1) / edge.visits) + 0.1 * a.prior / (edge.visits + 1) : Infinity;};
    return {action: available.sort((a, b) => score(b) - score(a))[0], key};
  }
  backpropagate(path: {key: string; command: string}[], reward: number): void {
    for (const {key, command} of path) {const node = this.nodes.get(key)!; const edge = node.actions.get(command)!; node.visits++; edge.visits++; edge.value += reward;}
  }
  diagnostics() {
    const nodes = [...this.nodes.values()];
    return {nodes: nodes.length, visited: nodes.filter(node => node.visits > 0).length, decisions: this.decisions, reusedDecisions: this.reusedDecisions, evaluationDecisions: this.evaluationDecisions, evaluationReuse: this.evaluationReuse,
      actions: nodes.reduce((sum, node) => sum + node.actions.size, 0), visitHistogram: [1, 2, 5, 10, 25, 100].map((upper, index, boundaries) => ({upper, nodes: nodes.filter(node => node.visits > (index ? boundaries[index - 1] : 0) && node.visits <= upper).length})), above100: nodes.filter(node => node.visits > 100).length};
  }
}
