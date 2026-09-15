import {toID} from '../domain';

export interface VisiblePokemon {
  publicId: string; ident: string; speciesId: string; condition: string; moves: string[]; ability?: string; item?: string;
  boosts: Record<string, number>; entered: number; lastMove?: string;
  invokedMoves: Record<string, string>;
  volatiles: Record<string, {started: number; value?: string}>;
  perishCount?: number;
}
export interface BattleObservation {
  side: 'p1' | 'p2'; turn: number; request: any; preview: string[];
  active: Record<string, VisiblePokemon>; seen: Record<string, VisiblePokemon>;
  weather: string; terrain: string; trickRoom: boolean; tailwind: Record<string, boolean>;
  weatherStarted: number; terrainStarted: number;
  trickRoomStarted: number;
  sideConditions: Record<string, Record<string, {started: number; layers: number}>>;
  fainted: Record<string, number>;
  openSheets?: {speciesId: string; moves: string[]; abilityId: string | null; itemId: string | null}[];
}

export function publicLog(log: readonly string[]): string[] {
  const lines: string[] = [];
  for (let i = 0; i < log.length; i++) {
    if (log[i].startsWith('|split|')) {lines.push(log[i + 2]); i += 2; continue;}
    // The server also emits private packed sheets and clocks. Neither enters a closed information set.
    if (!/^\|(showteam|t:|debug|request)\|/.test(log[i])) lines.push(log[i]);
  }
  return lines;
}

export function observe(side: 'p1' | 'p2', request: unknown, lines: readonly string[], preview: string[], openSheets?: BattleObservation['openSheets']): BattleObservation {
  const state: BattleObservation = {side, request: structuredClone(request), preview: [...preview], active: {}, seen: {}, turn: 0, weather: '', terrain: '', trickRoom: false, tailwind: {}, weatherStarted: 0, terrainStarted: 0, trickRoomStarted: 0, sideConditions: {p1: {}, p2: {}}, fainted: {p1: 0, p2: 0}, openSheets};
  const identity = (ident: string) => ident?.replace(/^(p[12])[a-z]:/, '$1:');
  const find = (ident: string) => {
    const active = state.active[ident?.slice(0, 3)];
    if (active?.ident === ident) return active;
    const matches = Object.values(state.seen).filter(p => identity(p.ident) === identity(ident));
    return matches.length === 1 ? matches[0] : undefined;
  };
  const previousAppearance = (ident: string, speciesId: string) => {
    const active = new Set(Object.values(state.active));
    const matches = Object.values(state.seen).filter(p => identity(p.ident) === identity(ident) && p.speciesId === speciesId && !active.has(p) && healthFraction(p.condition) > 0);
    return matches.length === 1 ? matches[0] : undefined;
  };
  for (const line of lines) {
    const [, event, actor, value, extra] = line.split('|');
    if (event === 'turn') state.turn = Number(actor);
    if (event === 'switch' || event === 'drag') {
      const speciesId = toID(value.split(',')[0]);
      const old = previousAppearance(actor, speciesId);
      // A disguise and its namesake can be on the field together. Nicknames are
      // public labels, not unique Pokémon identities.
      let publicId = old?.publicId ?? identity(actor);
      if (!old) for (let suffix = 1; state.seen[publicId]; suffix++) publicId = `${identity(actor)}#${suffix}`;
      const pokemon: VisiblePokemon = {...old, publicId, ident: actor, speciesId, condition: extra, moves: [...old?.moves ?? []], invokedMoves: {...old?.invokedMoves}, boosts: {}, entered: state.turn, lastMove: undefined, volatiles: {}, perishCount: undefined};
      state.active[actor.slice(0, 3)] = pokemon; state.seen[publicId] = pokemon;
    }
    if (event === 'replace') {
      const old = state.active[actor.slice(0, 3)];
      if (!old) throw new Error(`公开身份揭露没有对应的在场成员：${actor}`);
      const speciesId = toID(value.split(',')[0]);
      const previous = previousAppearance(actor, speciesId);
      // Illusion's replace event has no HP field and does not cause a switch.
      const pokemon: VisiblePokemon = {...previous, ...old, publicId: previous?.publicId ?? old.publicId, ident: actor, speciesId,
        moves: [...new Set([...previous?.moves ?? [], ...old.moves])], invokedMoves: {...previous?.invokedMoves, ...old.invokedMoves}};
      delete state.seen[old.publicId];
      state.active[actor.slice(0, 3)] = pokemon; state.seen[pokemon.publicId] = pokemon;
    }
    const pokemon = find(actor);
    if (['detailschange', '-formechange'].includes(event) && pokemon) pokemon.speciesId = toID(value.split(',')[0]);
    if (['-damage', '-heal', '-sethp'].includes(event) && pokemon) pokemon.condition = value;
    if (event === 'faint' && pokemon) {pokemon.condition = '0 fnt'; state.fainted[actor.slice(0, 2)]++;}
    if (event === 'move' && pokemon) {
      const move = toID(value);
      const source = line.split('|').find(part => part.startsWith('[from] '))?.slice(7);
      // Reflected/called moves reveal an execution, not a slot in the original set.
      // Sleep Talk and locked-move continuations do reveal a move the user knows.
      if (move !== 'struggle' && (!source || source === 'move: Sleep Talk' || source === 'lockedmove')) pokemon.moves = [...new Set([...pokemon.moves, move])];
      else pokemon.invokedMoves[move] = source ?? 'PP exhausted';
      pokemon.lastMove = move;
    }
    if (event === '-ability' && pokemon) pokemon.ability = toID(value);
    if (event === '-item' && pokemon) pokemon.item = toID(value);
    if (event === '-enditem' && pokemon) pokemon.item = '';
    if (event === '-boost' && pokemon) pokemon.boosts[value] = (pokemon.boosts[value] || 0) + Number(extra);
    if (event === '-unboost' && pokemon) pokemon.boosts[value] = (pokemon.boosts[value] || 0) - Number(extra);
    if (event === '-clearboost' && pokemon) pokemon.boosts = {};
    if (event === '-setboost' && pokemon) pokemon.boosts[value] = Number(extra);
    if (event === '-clearallboost') for (const pokemon of Object.values(state.active)) pokemon.boosts = {};
    if (event === '-invertboost' && pokemon) pokemon.boosts = Object.fromEntries(Object.entries(pokemon.boosts).map(([key, n]) => [key, -n]));
    if (event === '-status' && pokemon) pokemon.condition = `${pokemon.condition.split(' ')[0]} ${value}`;
    if (event === '-curestatus' && pokemon) pokemon.condition = pokemon.condition.split(' ')[0];
    if (event === '-start' && pokemon) {
      const effect = toID(value.replace(/^(move|ability): /, ''));
      pokemon.volatiles[effect] = {started: state.turn, value: extra};
      if (/^perish\d$/.test(effect)) {pokemon.perishCount = Number(effect.slice(-1)); for (const key of Object.keys(pokemon.volatiles)) if (/^perish\d$/.test(key) && key !== effect) delete pokemon.volatiles[key];}
    }
    if (event === '-end' && pokemon) {const effect = toID(value.replace(/^(move|ability): /, '')); delete pokemon.volatiles[effect]; if (effect === 'perishsong') pokemon.perishCount = undefined; if (effect === 'illusion') pokemon.ability = 'illusion';}
    const parts = line.split('|');
    for (const kind of ['ability', 'item'] as const) {
      const source = parts.find(part => part.startsWith(`[from] ${kind}: `));
      const holder = parts.find(part => part.startsWith('[of] '))?.slice(5) ?? actor;
      const owner = find(holder);
      // A seed's boost is logged after consumption; its effect does not restore it.
      if (source && owner && !(kind === 'item' && owner.item === '')) owner[kind] = toID(source.split(': ').slice(1).join(': '));
    }
    if (event === '-weather') {state.weather = actor === 'none' ? '' : toID(actor); if (value !== '[upkeep]') state.weatherStarted = state.turn;}
    if (event === '-fieldstart') {if (/Trick Room/.test(actor)) {state.trickRoom = true; state.trickRoomStarted = state.turn;} else if (/Terrain/.test(actor)) {state.terrain = toID(actor.replace('move: ', '')); state.terrainStarted = state.turn;}}
    if (event === '-fieldend') {if (/Trick Room/.test(actor)) state.trickRoom = false; else if (/Terrain/.test(actor)) state.terrain = '';}
    if (event === '-sidestart' && /Tailwind/.test(value)) state.tailwind[actor.slice(0, 2)] = true;
    if (event === '-sideend' && /Tailwind/.test(value)) state.tailwind[actor.slice(0, 2)] = false;
    if (event === '-sidestart') {const conditions = state.sideConditions[actor.slice(0, 2)]; const id = toID(value.replace('move: ', '')); conditions[id] = {started: state.turn, layers: (conditions[id]?.layers ?? 0) + 1};}
    if (event === '-sideend') delete state.sideConditions[actor.slice(0, 2)][toID(value.replace('move: ', ''))];
  }
  return state;
}

export const healthFraction = (condition: string): number => {if (condition.includes('fnt')) return 0; const [hp, max] = condition.split(' ')[0].split('/').map(value => Number.parseInt(value, 10)); return max ? hp / max : hp > 0 ? 1 : 0;};
