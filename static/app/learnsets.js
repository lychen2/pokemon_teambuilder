import {normalizeName} from "./utils.js";

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
  const ids = getCandidateSpeciesIds(normalized, datasets, options.itemName || "");
  const champion = mergeLearnsetMaps(ids, (id) => datasets.championsVgc?.learnsets?.[id]);
  if (champion) {
    return champion;
  }
  return mergeLearnsetMaps(ids, (id) => datasets.learnsets?.[id]?.learnset);
}
