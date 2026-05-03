import {normalizeName} from "./utils.js";

const DEFAULT_TOP_N = 24;
const DEFAULT_CORE_TOP_N = 24;

const EMPTY_META = Object.freeze({
  source: "empty",
  entries: Object.freeze([]),
  cores: Object.freeze([]),
  weightTotal: 0,
  warnings: Object.freeze(["empty"]),
  month: "",
});

function sortByCount(record = {}) {
  return Object.entries(record || {})
    .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0));
}

function pickAbility(species) {
  const abilities = species?.abilities || {};
  if (Array.isArray(abilities) && abilities.length) return abilities[0];
  return abilities["0"] || abilities["1"] || abilities["H"] || "";
}

function buildBaseConfig(speciesId, species) {
  return {
    speciesId,
    speciesName: species?.name || speciesId,
    types: Array.isArray(species?.types) ? [...species.types] : [],
    baseStats: {...(species?.baseStats || {})},
    stats: {...(species?.baseStats || {})},
    moves: [],
    moveNames: [],
    item: "",
    ability: pickAbility(species),
    teraType: "",
    championPoints: {},
    nature: "Serious",
  };
}

function buildEntryFromUsage(speciesId, profile, datasets) {
  const species = datasets?.pokedex?.[speciesId];
  if (!species) return null;
  const moveNames = sortByCount(profile?.Moves).slice(0, 4).map(([name]) => name);
  const config = buildBaseConfig(speciesId, species);
  config.moveNames = moveNames;
  config.moves = moveNames.map((name) => ({name, category: "Physical", basePower: 0, type: ""}));
  config.item = sortByCount(profile?.Items)[0]?.[0] || "";
  config.teraType = sortByCount(profile?.["Tera Types"] || profile?.Tera || {})[0]?.[0] || "";
  return {
    speciesId,
    speciesName: species.name || speciesId,
    config,
    weight: Number(profile?.usage || 0),
    source: "usage-stats",
  };
}

function buildEntryFromPaste(speciesId, weight, profile, datasets) {
  const species = datasets?.pokedex?.[speciesId];
  if (!species) return null;
  const config = profile ? {...buildBaseConfig(speciesId, species), ...profile} : buildBaseConfig(speciesId, species);
  return {
    speciesId,
    speciesName: species.name || speciesId,
    config,
    weight,
    source: "vgcpastes",
  };
}

function fromUsageStats(datasets, topN) {
  const usable = datasets?.championsVgc?.usableSpeciesIds || datasets?.championsVgc?.availableSpeciesIds || [];
  const usage = datasets?.usage?.data || {};
  const allowed = new Set(usable.map((id) => normalizeName(id)));
  const ranked = Object.entries(usage)
    .map(([name, profile]) => ({speciesId: normalizeName(name), profile, weight: Number(profile?.usage || 0)}))
    .filter((entry) => entry.weight > 0 && (allowed.size ? allowed.has(entry.speciesId) : true))
    .sort((left, right) => right.weight - left.weight)
    .slice(0, topN);
  const entries = ranked.map((entry) => buildEntryFromUsage(entry.speciesId, entry.profile, datasets)).filter(Boolean);
  if (!entries.length) return null;
  return {
    source: "usage-stats",
    entries: Object.freeze(entries),
    weightTotal: sumWeights(entries),
    warnings: Object.freeze([]),
    month: datasets?.championsVgc?.usage?.month || "",
  };
}

function fromPasteCounts(datasets, topN) {
  const counts = datasets?.pasteSpeciesCounts || {};
  const ranked = Object.entries(counts)
    .map(([speciesId, info]) => ({speciesId, count: Number(info?.count || 0), profile: info?.profile || null}))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, topN);
  const total = ranked.reduce((sum, entry) => sum + entry.count, 0) || 1;
  const entries = ranked.map((entry) => buildEntryFromPaste(entry.speciesId, entry.count / total, entry.profile, datasets)).filter(Boolean);
  if (!entries.length) return null;
  return {
    source: "vgcpastes",
    entries: Object.freeze(entries),
    weightTotal: sumWeights(entries),
    warnings: Object.freeze([]),
    month: "",
  };
}

function fromLibrary(library, topN) {
  if (!library?.length) return null;
  const slice = library.slice(0, topN);
  const weight = 1 / slice.length;
  const entries = slice.map((config) => ({
    speciesId: normalizeName(config?.speciesId || config?.speciesName || ""),
    speciesName: config?.speciesName || config?.displayName || "",
    config,
    weight,
    source: "current-library",
  }));
  return {
    source: "current-library",
    entries: Object.freeze(entries),
    weightTotal: 1,
    warnings: Object.freeze(["fell-back-to-library"]),
    month: "",
  };
}

function sumWeights(entries) {
  return entries.reduce((sum, entry) => sum + Number(entry.weight || 0), 0);
}

function buildCores(datasets, topN = DEFAULT_CORE_TOP_N) {
  const pairs = Array.isArray(datasets?.pasteCorePairs) ? datasets.pasteCorePairs : [];
  if (!pairs.length) return [];
  const top = pairs.slice(0, topN);
  const total = top.reduce((sum, pair) => sum + Number(pair.count || 0), 0) || 1;
  return top
    .map((pair) => ({
      a: normalizeName(pair.a),
      b: normalizeName(pair.b),
      weight: Number(pair.count || 0) / total,
    }))
    .filter((pair) => pair.a && pair.b && pair.a !== pair.b);
}

export function buildRoleMeta(library = [], datasets = {}, options = {}) {
  const topN = Math.max(1, Number(options.topN || DEFAULT_TOP_N));
  const cores = Object.freeze(buildCores(datasets));
  if (datasets?.championsVgc?.usage?.status === "available") {
    const usageMeta = fromUsageStats(datasets, topN);
    if (usageMeta) return {...usageMeta, cores};
  }
  const pasteMeta = fromPasteCounts(datasets, topN);
  if (pasteMeta) return {...pasteMeta, cores};
  const libraryMeta = fromLibrary(library, topN);
  if (libraryMeta) return {...libraryMeta, cores};
  return EMPTY_META;
}

export function getMetaHash(meta = {}) {
  const ids = (meta.entries || []).map((entry) => entry.speciesId).join(",");
  const coreCount = (meta.cores || []).length;
  return `${meta.source || "empty"}|${ids}|${meta.entries?.length || 0}|cores=${coreCount}`;
}
