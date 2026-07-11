import {normalizeName} from "./utils.js";

const learnsetCache = new WeakMap();

function getSpeciesCache(datasets, speciesId) {
  let speciesCache = learnsetCache.get(datasets);
  if (!speciesCache) {
    speciesCache = new Map();
    learnsetCache.set(datasets, speciesCache);
  }
  let itemCache = speciesCache.get(speciesId);
  if (!itemCache) {
    itemCache = new Map();
    speciesCache.set(speciesId, itemCache);
  }
  return itemCache;
}

function addUnique(target, value) {
  const normalized = normalizeName(value);
  if (normalized && !target.includes(normalized)) {
    target.push(normalized);
  }
}

function getLineageIds(speciesId, datasets, seen = new Set()) {
  const normalized = normalizeName(speciesId);
  if (!normalized || seen.has(normalized)) {
    return [];
  }
  seen.add(normalized);
  const species = datasets.pokedex?.[normalized] || {};
  const parentNames = [species.baseSpecies, species.changesFrom];
  const parents = parentNames.flatMap((name) => getLineageIds(name, datasets, seen));
  return [...parents, normalized];
}

function findItemEntry(itemName, datasets) {
  const itemId = normalizeName(itemName);
  if (!itemId) {
    return null;
  }
  if (datasets.items?.[itemId]) {
    return datasets.items[itemId];
  }
  return Object.values(datasets.items || {}).find((item) => normalizeName(item?.name) === itemId) || null;
}

function getMegaSourceIds(speciesId, itemName, datasets) {
  const item = findItemEntry(itemName, datasets);
  const megaStone = item?.megaStone || {};
  return Object.entries(megaStone)
    .filter(([, target]) => normalizeName(target) === speciesId)
    .map(([source]) => source);
}

function getBattleOnlySourceIds(speciesId, datasets) {
  const species = datasets.pokedex?.[speciesId] || {};
  const battleOnly = species.battleOnly;
  if (!battleOnly) {
    return [];
  }
  return (Array.isArray(battleOnly) ? battleOnly : [battleOnly])
    .map(normalizeName)
    .filter(Boolean);
}

function getCandidateSpeciesIds(speciesId, datasets, itemName = "") {
  const ids = [];
  getMegaSourceIds(speciesId, itemName, datasets).forEach((source) => {
    getLineageIds(source, datasets).forEach((id) => addUnique(ids, id));
  });
  getBattleOnlySourceIds(speciesId, datasets).forEach((source) => {
    getLineageIds(source, datasets).forEach((id) => addUnique(ids, id));
  });
  getLineageIds(speciesId, datasets).forEach((id) => addUnique(ids, id));
  return ids;
}

function mergeLearnsetMaps(ids, resolver) {
  const maps = ids.map(resolver).filter(Boolean);
  if (!maps.length) {
    return null;
  }
  return maps.reduce((merged, learnset) => ({...merged, ...learnset}), {});
}

export function getLearnsetMap(speciesId, datasets, options = {}) {
  const normalized = normalizeName(speciesId);
  const itemName = normalizeName(options.itemName || "");
  const itemCache = getSpeciesCache(datasets, normalized);
  if (itemCache.has(itemName)) return itemCache.get(itemName);
  const ids = getCandidateSpeciesIds(normalized, datasets, itemName);
  const champion = mergeLearnsetMaps(ids, (id) => datasets.championsVgc?.learnsets?.[id]);
  const result = champion || mergeLearnsetMaps(ids, (id) => datasets.learnsets?.[id]?.learnset);
  if (result !== null) itemCache.set(itemName, result);
  return result;
}
