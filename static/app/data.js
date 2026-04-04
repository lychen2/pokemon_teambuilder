import {DATA_PATHS} from "./constants.js";
import {fetchJson, normalizeName} from "./utils.js";

const datasetCache = {value: null};
const SPEED_LINE_ENTRY_LIMIT = 5;

function buildSpeciesIndex(pokedex) {
  const index = new Map();
  for (const [speciesId, entry] of Object.entries(pokedex)) {
    const aliases = [speciesId, entry.name, entry.name.replace(/-/g, ""), entry.name.replace(/\s+/g, "")];
    aliases.forEach((alias) => index.set(normalizeName(alias), speciesId));
  }
  return index;
}

function buildMoveLookup(moves) {
  return buildNamedLookup(moves);
}

function buildNamedLookup(entries) {
  const lookup = new Map();
  for (const [key, entry] of Object.entries(entries)) {
    lookup.set(normalizeName(key), entry);
    lookup.set(normalizeName(entry.name), entry);
  }
  return lookup;
}

export async function loadDatasets() {
  if (datasetCache.value) {
    return datasetCache.value;
  }

  const [pokedex, formsIndex, moves, abilities, items] = await Promise.all([
    fetchJson(DATA_PATHS.pokedex),
    fetchJson(DATA_PATHS.formsIndex),
    fetchJson(DATA_PATHS.moves),
    fetchJson(DATA_PATHS.abilities),
    fetchJson(DATA_PATHS.items),
  ]);

  datasetCache.value = {
    pokedex,
    formsIndex,
    moves,
    abilities,
    items,
    speciesIndex: buildSpeciesIndex(pokedex),
    moveLookup: buildMoveLookup(moves),
    abilityLookup: buildNamedLookup(abilities),
    itemLookup: buildNamedLookup(items),
  };
  return datasetCache.value;
}

function sortTierEntries(entries) {
  return entries.sort((left, right) => left._importIndex - right._importIndex).slice(0, SPEED_LINE_ENTRY_LIMIT);
}

function buildSpeedTierMap(entries = []) {
  const tiers = new Map();
  entries.forEach((entry) => {
    const speed = entry.speed;
    if (!tiers.has(speed)) {
      tiers.set(speed, []);
    }
    tiers.get(speed).push(entry);
  });

  return [...tiers.entries()]
    .sort((left, right) => Number(right[0]) - Number(left[0]))
    .map(([speed, entries]) => ({
      speed: Number(speed),
      totalCount: entries.length,
      entries: sortTierEntries(entries),
    }));
}

export function calculateSpeedTiers(library) {
  return buildSpeedTierMap(
    library.map((entry, index) => ({
      ...entry,
      speed: entry.stats?.spe || 0,
      _importIndex: index,
      speedTierMode: "base",
    })),
  );
}

export function calculateSpeedLineTiers(library) {
  const entries = [];
  library.forEach((entry, index) => {
    if (entry.choiceScarfSpeed) {
      entries.push({
        ...entry,
        speed: entry.choiceScarfSpeed.speed,
        _importIndex: index,
        speedTierMode: "scarf",
      });
      return;
    }
    entries.push({
      ...entry,
      speed: entry.stats?.spe || 0,
      _importIndex: index,
      speedTierMode: "base",
    });
    if (!entry.plusOneSpeed) {
      return;
    }
    entries.push({
      ...entry,
      speed: entry.plusOneSpeed.speed,
      _importIndex: index,
      speedTierMode: "plus1",
    });
  });
  return buildSpeedTierMap(entries);
}
