import {normalizeName} from "./utils.js";

function normalizeUsageKey(value) {
  return normalizeName(String(value || "").replace(/\*/g, ""));
}

function addUsageKey(keys, value) {
  const key = normalizeUsageKey(value);
  if (key) {
    keys.push(key);
  }
}

function getUsageFallbackKeys(datasets, speciesId = "", speciesName = "") {
  const keys = [];
  addUsageKey(keys, speciesId);
  addUsageKey(keys, speciesName);
  const species = datasets?.pokedex?.[speciesId];
  if (species) {
    addUsageKey(keys, species.name);
    addUsageKey(keys, species.baseSpecies);
    addUsageKey(keys, species.changesFrom);
  }
  return [...new Set(keys)];
}

function buildTeammateMap(teammates = {}) {
  const map = new Map();
  Object.entries(teammates).forEach(([name, count]) => {
    const key = normalizeUsageKey(name);
    if (!key) {
      return;
    }
    map.set(key, Math.max(Number(count || 0), map.get(key) || 0));
  });
  return map;
}

function shouldReplaceUsageEntry(current, candidate) {
  if (!current) {
    return true;
  }
  if (current.isWildcard !== candidate.isWildcard) {
    return current.isWildcard && !candidate.isWildcard;
  }
  return Number(candidate.profile.usage || 0) > Number(current.profile.usage || 0);
}

function buildPreparedUsageEntry(name, profile = {}) {
  const teammateMap = buildTeammateMap(profile.Teammates);
  const teammateTotal = [...teammateMap.values()].reduce((sum, value) => sum + Number(value || 0), 0);
  return {
    name,
    isWildcard: String(name || "").includes("*"),
    profile: {
      ...profile,
      usageKey: name,
      teammateMap,
      teammateTotal,
    },
  };
}

function sortUsageRecord(record = {}) {
  return Object.entries(record)
    .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0) || String(left[0]).localeCompare(String(right[0])));
}

function resolveMoveEntry(moveName, datasets) {
  return datasets?.moveLookup?.get(normalizeName(moveName)) || null;
}

function resolveItemEntry(itemName, datasets) {
  return datasets?.itemLookup?.get(normalizeName(itemName)) || null;
}

export function buildUsageLookup(usageData = {}) {
  const rawData = usageData?.data || usageData || {};
  const lookup = new Map();
  Object.entries(rawData).forEach(([name, profile]) => {
    const key = normalizeUsageKey(name);
    if (!key || !profile) {
      return;
    }
    const candidate = buildPreparedUsageEntry(name, profile);
    const current = lookup.get(key);
    if (shouldReplaceUsageEntry(current, candidate)) {
      lookup.set(key, candidate);
    }
  });
  return lookup;
}

function buildGlobalUsageCounts(usageData = {}, recordKey, lookup) {
  const rawData = usageData?.data || usageData || {};
  const counts = new Map();
  Object.values(rawData).forEach((profile) => {
    Object.entries(profile?.[recordKey] || {}).forEach(([name, count]) => {
      const entry = lookup?.get(normalizeUsageKey(name)) || lookup?.get(normalizeName(name));
      const normalizedCount = Number(count || 0);
      if (!entry || normalizedCount <= 0) {
        return;
      }
      const entryId = normalizeName(entry.name);
      counts.set(entryId, (counts.get(entryId) || 0) + normalizedCount);
    });
  });
  return counts;
}

export function buildGlobalMoveUsageCounts(usageData = {}, moveLookup) {
  return buildGlobalUsageCounts(usageData, "Moves", moveLookup);
}

export function buildGlobalItemUsageCounts(usageData = {}, itemLookup) {
  return buildGlobalUsageCounts(usageData, "Items", itemLookup);
}

export function getUsageProfile(datasets, speciesId = "", speciesName = "") {
  const keys = getUsageFallbackKeys(datasets, speciesId, speciesName);
  for (const key of keys) {
    const entry = datasets?.usageLookup?.get(key);
    if (entry?.profile) {
      return entry.profile;
    }
  }
  return null;
}

export function getUsageMoveEntries(speciesId, datasets, options = {}) {
  const speciesName = datasets?.pokedex?.[speciesId]?.name || speciesId;
  const profile = getUsageProfile(datasets, speciesId, speciesName);
  if (!profile?.Moves) {
    return [];
  }
  const kind = options.kind || "all";
  const limit = Number(options.limit || 0);
  const excludedIds = new Set((options.excludeNames || []).map((name) => normalizeName(name)).filter(Boolean));
  const moveEntries = [];
  sortUsageRecord(profile.Moves).forEach(([moveName, count]) => {
    const move = resolveMoveEntry(moveName, datasets);
    const moveId = normalizeName(move?.name || moveName);
    if (!move || excludedIds.has(moveId)) {
      return;
    }
    const isDamaging = move.category !== "Status" && Number(move.basePower || 0) > 0;
    if (kind === "attacking" && !isDamaging) {
      return;
    }
    if (kind === "support" && isDamaging) {
      return;
    }
    if (moveEntries.some((entry) => normalizeName(entry.move.name) === moveId)) {
      return;
    }
    moveEntries.push({
      move,
      name: move.name,
      count: Number(count || 0),
    });
  });
  return limit > 0 ? moveEntries.slice(0, limit) : moveEntries;
}

function estimateMoveSampleCount(moveEntries = []) {
  if (!moveEntries.length) {
    return 0;
  }
  const totalCount = moveEntries.reduce((sum, entry) => sum + Number(entry.count || 0), 0);
  const peakCount = Math.max(...moveEntries.map((entry) => Number(entry.count || 0)), 0);
  return Math.max(peakCount, totalCount / 4, 1);
}

export function getUsageReferenceMoveEntries(speciesId, datasets, options = {}) {
  const minShare = Math.max(0, Number(options.minShare ?? 0.1));
  const topLimit = Math.max(0, Number(options.topLimit ?? 6));
  const finalLimit = Math.max(0, Number(options.finalLimit ?? (topLimit || 6)));
  const moveEntries = getUsageMoveEntries(speciesId, datasets, {
    kind: options.kind || "all",
    excludeNames: options.excludeNames || [],
  });
  if (!moveEntries.length) {
    return [];
  }
  const estimatedSampleCount = estimateMoveSampleCount(moveEntries);
  const thresholdEntries = moveEntries.filter((entry) => (Number(entry.count || 0) / estimatedSampleCount) >= minShare);
  const fallbackEntries = moveEntries.slice(0, topLimit);
  const orderedEntries = [];
  const seen = new Set();
  const addEntry = (entry) => {
    const moveId = normalizeName(entry?.name);
    if (!moveId || seen.has(moveId)) {
      return;
    }
    seen.add(moveId);
    orderedEntries.push(entry);
  };
  thresholdEntries.forEach(addEntry);
  fallbackEntries.forEach(addEntry);
  return finalLimit > 0 ? orderedEntries.slice(0, finalLimit) : orderedEntries;
}

export function getUsageItemEntries(speciesId, datasets, options = {}) {
  const speciesName = datasets?.pokedex?.[speciesId]?.name || speciesId;
  const profile = getUsageProfile(datasets, speciesId, speciesName);
  if (!profile?.Items) {
    return [];
  }
  const limit = Number(options.limit || 0);
  const itemEntries = [];
  sortUsageRecord(profile.Items).forEach(([itemName, count]) => {
    const item = resolveItemEntry(itemName, datasets);
    if (!item || itemEntries.some((entry) => normalizeName(entry.name) === normalizeName(item.name))) {
      return;
    }
    itemEntries.push({
      item,
      name: item.name,
      count: Number(count || 0),
    });
  });
  return limit > 0 ? itemEntries.slice(0, limit) : itemEntries;
}

export function getUsageForSpecies(datasets, speciesId = "", speciesName = "") {
  const profile = getUsageProfile(datasets, speciesId, speciesName);
  return Number(profile?.usage ?? profile?.usageRankScore ?? profile?.rankScore ?? 0);
}

export function getUsageTeammateShare(datasets, sourceSpeciesId, teammateSpeciesId) {
  const sourceProfile = getUsageProfile(
    datasets,
    sourceSpeciesId,
    datasets?.pokedex?.[sourceSpeciesId]?.name || sourceSpeciesId,
  );
  if (!sourceProfile?.teammateMap?.size || !sourceProfile.teammateTotal) {
    return 0;
  }
  const teammateKeys = getUsageFallbackKeys(
    datasets,
    teammateSpeciesId,
    datasets?.pokedex?.[teammateSpeciesId]?.name || teammateSpeciesId,
  );
  for (const key of teammateKeys) {
    const count = Number(sourceProfile.teammateMap.get(key) || 0);
    if (count > 0) {
      return count / sourceProfile.teammateTotal;
    }
  }
  return 0;
}
