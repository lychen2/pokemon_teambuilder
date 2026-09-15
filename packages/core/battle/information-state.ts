import type {BattleObservation} from './observation';
import {hash} from '../domain';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

export function informationKey(observation: BattleObservation): string {
  const request = structuredClone(observation.request);
  if (request) {delete request.rqid; if (request.side) delete request.side.name;}
  const elapsed = (started: number) => observation.turn - started;
  const normalizePokemon = (pokemon: BattleObservation['active'][string]) => ({...pokemon, moves: [...pokemon.moves].sort(), entered: elapsed(pokemon.entered),
    volatiles: Object.fromEntries(Object.entries(pokemon.volatiles).map(([id, value]) => [id, {...value, started: elapsed(value.started)}]))});
  const activeIdentities = new Set(Object.values(observation.active).map(pokemon => pokemon.publicId));
  // Once a Pokémon is on the bench, switching has reset its boosts and volatile
  // clocks. Retain HP, all revealed moves/items/abilities and invoked move evidence.
  const bench = Object.entries(observation.seen).filter(([id]) => !activeIdentities.has(id)).map(([id, pokemon]) => {
    const {boosts, entered, lastMove, volatiles, perishCount, ...known} = pokemon;
    return [id, {...known, moves: [...known.moves].sort()}];
  });
  // Exact absolute turn is retained: Showdown has a real turn-limit/tie rule.
  // Expired field clocks and redundant active copies must not split equal states.
  return hash(canonical({...observation, request, preview: [...observation.preview].sort(),
    active: Object.fromEntries(Object.entries(observation.active).map(([id, pokemon]) => [id, normalizePokemon(pokemon)])),
    seen: Object.fromEntries(bench),
    weatherStarted: observation.weather ? elapsed(observation.weatherStarted) : 0,
    terrainStarted: observation.terrain ? elapsed(observation.terrainStarted) : 0,
    trickRoomStarted: observation.trickRoom ? elapsed(observation.trickRoomStarted) : 0,
    tailwind: {p1: Boolean(observation.tailwind.p1), p2: Boolean(observation.tailwind.p2)},
    sideConditions: Object.fromEntries(Object.entries(observation.sideConditions).map(([side, effects]) => [side, Object.fromEntries(Object.entries(effects).map(([id, effect]) => [id, {...effect, started: elapsed(effect.started)}]))])),
  }));
}
