import {DATA_PATHS} from "./constants.js";
import {fetchJson, normalizeName} from "./utils.js";

const datasetCache = {value: null};

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

function mergeDexEntries(baseEntries, overrides = {}) {
  const merged = {...baseEntries};
  Object.entries(overrides).forEach(([key, value]) => {
    merged[key] = {
      ...(baseEntries[key] || {}),
      ...value,
    };
  });
  return merged;
}

function buildNamedLookup(entries) {
  const lookup = new Map();
  for (const [key, entry] of Object.entries(entries)) {
    lookup.set(normalizeName(key), entry);
    lookup.set(normalizeName(entry.name || key), entry);
  }
  return lookup;
}

function buildAvailableSpecies(pokedex, formsIndex, speciesIds = []) {
  return speciesIds
    .map((speciesId) => {
      const entry = pokedex[speciesId];
      if (!entry) {
        return null;
      }
      const spriteIndex = formsIndex[speciesId] ?? entry.num ?? 0;
      return {
        speciesId,
        speciesName: entry.name,
        baseStats: entry.baseStats || {},
        types: entry.types || [],
        abilities: entry.abilities || {},
        spritePosition: {
          x: (spriteIndex % 12) * 40,
          y: Math.floor(spriteIndex / 12) * 30,
        },
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.speciesName.localeCompare(right.speciesName, "zh-Hans-CN"));
}

export async function loadDatasets() {
  if (datasetCache.value) {
    return datasetCache.value;
  }

  const [pokedex, formsIndex, moves, learnsets, abilities, items, championsVgc] = await Promise.all([
    fetchJson(DATA_PATHS.pokedex),
    fetchJson(DATA_PATHS.formsIndex),
    fetchJson(DATA_PATHS.moves),
    fetchJson(DATA_PATHS.learnsets),
    fetchJson(DATA_PATHS.abilities),
    fetchJson(DATA_PATHS.items),
    fetchJson(DATA_PATHS.championsVgc),
  ]);

  const mergedPokedex = mergeDexEntries(pokedex, championsVgc.overrideSpeciesData);
  const mergedMoves = mergeDexEntries(moves, championsVgc.overrideMoveData);
  const mergedAbilities = mergeDexEntries(abilities, championsVgc.overrideAbilityData);
  const mergedItems = mergeDexEntries(items, championsVgc.overrideItemData);

  datasetCache.value = {
    pokedex: mergedPokedex,
    formsIndex,
    moves: mergedMoves,
    learnsets,
    abilities: mergedAbilities,
    items: mergedItems,
    championsVgc,
    availableSpecies: buildAvailableSpecies(mergedPokedex, formsIndex, championsVgc.usableSpeciesIds || championsVgc.availableSpeciesIds || []),
    speciesIndex: buildSpeciesIndex(mergedPokedex),
    moveLookup: buildMoveLookup(mergedMoves),
    moveSearchLookup: buildMoveLookup(mergedMoves),
    abilityLookup: buildNamedLookup(mergedAbilities),
    itemLookup: buildNamedLookup(mergedItems),
  };
  return datasetCache.value;
}

function sortTierEntries(entries) {
  return entries.sort((left, right) => left._importIndex - right._importIndex);
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
    if (!entry.excludeBaseSpeedTier) {
      entries.push({
        ...entry,
        speed: entry.stats?.spe || 0,
        _importIndex: index,
        speedTierMode: "base",
      });
    }
    if (entry.plusOneSpeed) {
      entries.push({
        ...entry,
        speed: entry.plusOneSpeed.speed,
        _importIndex: index,
        speedTierMode: "plus1",
      });
    }
    if (entry.choiceScarfSpeed) {
      entries.push({
        ...entry,
        speed: entry.choiceScarfSpeed.speed,
        _importIndex: index,
        speedTierMode: "scarf",
      });
    }
  });
  return buildSpeedTierMap(entries);
}
