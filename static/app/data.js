import {DATA_PATHS} from "./constants.js";
import {getSpeedVariants} from "./battle-semantics.js";
import {buildUsageLookup} from "./usage.js";

function buildPasteSpeciesCounts(pasteTeams) {
  if (!pasteTeams) return {};
  const teams = Array.isArray(pasteTeams) ? pasteTeams : pasteTeams?.teams || [];
  const counts = {};
  teams.forEach((team) => {
    const memberIds = team?.memberSpeciesIds || [];
    const configsByIndex = Array.isArray(team?.configs) ? team.configs : [];
    memberIds.forEach((rawId, index) => {
      const speciesId = String(rawId || "").toLowerCase();
      if (!speciesId) return;
      if (!counts[speciesId]) counts[speciesId] = {count: 0, profile: null};
      counts[speciesId].count += 1;
      const config = configsByIndex[index];
      if (config && !counts[speciesId].profile) {
        counts[speciesId].profile = config;
      }
    });
  });
  return counts;
}

function buildPasteCorePairs(pasteTeams, topN = 24) {
  if (!pasteTeams) return [];
  const teams = Array.isArray(pasteTeams) ? pasteTeams : pasteTeams?.teams || [];
  const counts = new Map();
  teams.forEach((team) => {
    const ids = (team?.memberSpeciesIds || [])
      .map((rawId) => String(rawId || "").toLowerCase())
      .filter(Boolean);
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) {
        const [a, b] = unique[i] < unique[j] ? [unique[i], unique[j]] : [unique[j], unique[i]];
        const key = `${a}|${b}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  });
  return [...counts.entries()]
    .map(([key, count]) => {
      const [a, b] = key.split("|");
      return {a, b, count};
    })
    .sort((left, right) => right.count - left.count)
    .slice(0, topN);
}

function attachEntryIds(entries = {}) {
  return Object.fromEntries(
    Object.entries(entries).map(([entryId, entry]) => [entryId, {...entry, id: entryId}]),
  );
}

function buildPokeIconMap(teamPlannerAssets = {}, standalonePokeIconMap = {}) {
  const teamPlannerIconMap = Object.fromEntries(
    Object.entries(teamPlannerAssets.pokemon || {})
      .filter(([, entry]) => entry?.file)
      .map(([speciesId, entry]) => [speciesId, `./static/${entry.file}`]),
  );
  return {...standalonePokeIconMap, ...teamPlannerIconMap};
}

function buildChampionsIconMaps(championsIconAssets = {}) {
  const pokemon = Object.fromEntries(
    Object.entries(championsIconAssets.pokemon || {})
      .filter(([, entry]) => entry?.file)
      .map(([speciesId, entry]) => [speciesId, `./static/${entry.file}`]),
  );
  const items = Object.fromEntries(
    Object.entries(championsIconAssets.items || {})
      .filter(([, entry]) => entry?.file)
      .map(([itemId, entry]) => [itemId, {...entry, url: `./static/${entry.file}`}]),
  );
  return {pokemon, items};
}

async function fetchOptionalJson(path, fallbackValue) {
  try {
    return await fetchJson(path);
  } catch (error) {
    console.warn(error);
    return fallbackValue;
  }
}

import {compareSpeciesByDex, fetchJson, isSelectableBattleSpecies, normalizeLookupText, normalizeName} from "./utils.js";

const datasetCache = {value: null};
let pasteTeamsFetchStarted = false;

const ALWAYS_ACTIVE_MOVE_OVERRIDES = Object.freeze({
  weatherball: {basePower: 100},
});
// Manual overrides for known UI-vs-move name conflicts in PSChina translations.
// E.g., "Disable" defaults to "不开启" (UI sense); the move should be "定身法".
// Applied to mergedMoves entries (so render.js / lookups all see corrected name)
// AND to the localizedMoveNames Map.
const MOVE_LOCALIZED_NAME_OVERRIDES = Object.freeze({
  disable: "定身法",
});

function applyMoveLocalizedNameOverrides(mergedMoves = {}) {
  for (const [overrideKey, overrideName] of Object.entries(MOVE_LOCALIZED_NAME_OVERRIDES)) {
    for (const [entryKey, entry] of Object.entries(mergedMoves)) {
      if (!entry) continue;
      const entryId = normalizeName(entry.id || entry.name || entryKey);
      if (entryId !== overrideKey) continue;
      mergedMoves[entryKey] = {...entry, localizedName: overrideName};
    }
  }
  return mergedMoves;
}
const CUSTOM_MEGA_STONE_DESC_PATTERN = /^If held by (.+), this item allows it to Mega Evolve in battle\.$/;

function translateNameList(localization, value) {
  return String(value || "")
    .split(/(\s*,\s*|\s+or\s+)/)
    .map((part) => {
      if (!part.trim()) {
        return part;
      }
      if (/^\s*,\s*$/.test(part)) {
        return "、";
      }
      if (/^\s+or\s+$/.test(part)) {
        return "或";
      }
      return getLocalizedText(localization, part.replaceAll("é", "e"));
    })
    .join("");
}

function getLocalizedText(localization, value = "") {
  const normalizedValue = String(value || "");
  if (!normalizedValue) {
    return "";
  }
  const megaStoneMatch = normalizedValue.match(CUSTOM_MEGA_STONE_DESC_PATTERN);
  if (megaStoneMatch) {
    return `${translateNameList(localization, megaStoneMatch[1])}携带时可在战斗中进行超级进化。`;
  }
  return localization?.translations?.[normalizedValue.replaceAll("é", "e")] || normalizedValue;
}

function localizeDexEntry(entry = {}, localization) {
  if (!entry || typeof entry !== "object") {
    return entry;
  }
  const localizedName = getLocalizedText(localization, entry.name || "");
  const localizedShortDesc = getLocalizedText(localization, entry.shortDesc || "");
  const localizedDesc = getLocalizedText(localization, entry.desc || "");
  return {
    ...entry,
    localizedName: localizedName || entry.name || "",
    localizedShortDesc: localizedShortDesc || localizedDesc || entry.shortDesc || "",
    localizedDesc: localizedDesc || localizedShortDesc || entry.desc || "",
  };
}

function registerSpeciesAlias(index, alias, speciesId) {
  const normalizedName = normalizeName(alias);
  const normalizedLookup = normalizeLookupText(alias);
  if (normalizedName) {
    index.set(normalizedName, speciesId);
  }
  if (normalizedLookup) {
    index.set(normalizedLookup, speciesId);
  }
}

function buildSpeciesIndex(pokedex) {
  const index = new Map();
  for (const [speciesId, entry] of Object.entries(pokedex)) {
    const aliases = [speciesId, entry.name, entry.name.replace(/-/g, ""), entry.name.replace(/\s+/g, "")];
    if (entry.localizedName) {
      aliases.push(entry.localizedName, entry.localizedName.replace(/-/g, ""), entry.localizedName.replace(/\s+/g, ""));
    }
    aliases.forEach((alias) => registerSpeciesAlias(index, alias, speciesId));
  }
  return index;
}

function buildMoveLookup(moves) {
  return buildNamedLookup(moves);
}

function normalizeMoveEntries(moves = {}) {
  return Object.fromEntries(
    Object.entries(moves).map(([key, entry]) => {
      const moveId = normalizeName(entry?.id || entry?.name || key);
      const override = ALWAYS_ACTIVE_MOVE_OVERRIDES[moveId];
      if (!override) {
        return [key, entry];
      }
      return [key, {...entry, ...override}];
    }),
  );
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

function localizeDexEntries(entries, localization) {
  return Object.fromEntries(
    Object.entries(entries || {}).map(([key, entry]) => [key, localizeDexEntry(entry, localization)]),
  );
}

function buildNamedLookup(entries) {
  const lookup = new Map();
  for (const [key, entry] of Object.entries(entries)) {
    lookup.set(normalizeName(key), entry);
    lookup.set(normalizeName(entry.name || key), entry);
  }
  return lookup;
}

function buildLocalizedSearchLookup(entries, baseLookup) {
  const lookup = new Map(baseLookup);
  Object.values(entries || {}).forEach((entry) => {
    const localizedName = entry.localizedName || "";
    const normalizedLookup = normalizeLookupText(localizedName);
    if (normalizedLookup) {
      lookup.set(normalizedLookup, entry);
    }
  });
  return lookup;
}

function buildSelectableSpeciesIds(pokedex, forcedSpeciesIds = []) {
  const seen = new Set();
  const ids = [];
  const candidateIds = Object.keys(pokedex || {}).filter(
    (speciesId) => isSelectableBattleSpecies(pokedex, speciesId),
  );
  candidateIds.forEach((speciesId) => {
    seen.add(speciesId);
    ids.push(speciesId);
  });
  forcedSpeciesIds.forEach((speciesId) => {
    if (!pokedex?.[speciesId] || seen.has(speciesId)) {
      return;
    }
    if (!isSelectableBattleSpecies(pokedex, speciesId)) {
      return;
    }
    seen.add(speciesId);
    ids.push(speciesId);
  });
  return ids;
}


function buildAvailableSpecies(pokedex, formsIndex, speciesIds = [], legacySeasonSpeciesIds = new Set()) {
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
        dexNumber: Number(entry.num || 0),
        baseStats: entry.baseStats || {},
        types: entry.types || [],
        abilities: entry.abilities || {},
        tags: entry.tags || [],
        isNonstandard: entry.isNonstandard || null,
        legacySeasonAvailable: legacySeasonSpeciesIds.has(speciesId),
        spritePosition: {
          x: (spriteIndex % 12) * 40,
          y: Math.floor(spriteIndex / 12) * 30,
        },
      };
    })
    .filter(Boolean)
    .sort(compareSpeciesByDex);
}

export async function loadDatasets() {
  if (datasetCache.value) {
    return datasetCache.value;
  }

  // Heavy-payload fetches that the default library view does NOT need at
  // first paint. Learnsets start in parallel because move legality depends on
  // them soon after import; usage and paste-team meta are started by explicit
  // ensure* functions so VGCPastes and Roles do not steal first-paint time.
  const learnsetsPromise = fetchJson(DATA_PATHS.learnsets);

  const [localizationData, teamPlannerAssets, standalonePokeIconMap, championsIconAssets, usageDerived, pokedex, formsIndex, moves, abilities, items, championsVgc] = await Promise.all([
    fetchJson(DATA_PATHS.localizationData),
    fetchJson(DATA_PATHS.teamPlannerAssets),
    fetchJson(DATA_PATHS.pokeIconsMap),
    fetchOptionalJson(DATA_PATHS.championsIconAssets, {pokemon: {}, items: {}}),
    fetchJson(DATA_PATHS.usageDerived),
    fetchJson(DATA_PATHS.pokedex),
    fetchJson(DATA_PATHS.formsIndex),
    fetchJson(DATA_PATHS.moves),
    fetchJson(DATA_PATHS.abilities),
    fetchJson(DATA_PATHS.items),
    fetchJson(DATA_PATHS.championsVgc),
  ]);
  // Official usage source is disabled until a reliable upstream is identified.
  // Keeping the variable null preserves the rest of the data layer's null-guards.
  const usageOfficial = null;

  const mergedPokedex = localizeDexEntries(
    mergeDexEntries(pokedex, championsVgc.overrideSpeciesData),
    localizationData,
  );
  const mergedMoves = applyMoveLocalizedNameOverrides(localizeDexEntries(
    normalizeMoveEntries(mergeDexEntries(moves, championsVgc.overrideMoveData)),
    localizationData,
  ));
  const mergedAbilities = attachEntryIds(localizeDexEntries(
    mergeDexEntries(abilities, championsVgc.overrideAbilityData),
    localizationData,
  ));
  const mergedItems = attachEntryIds(localizeDexEntries(
    mergeDexEntries(items, championsVgc.overrideItemData),
    localizationData,
  ));
  const moveLookup = buildMoveLookup(mergedMoves);
  const abilityLookup = buildNamedLookup(mergedAbilities);
  const itemLookup = buildNamedLookup(mergedItems);
  const moveSearchLookup = buildLocalizedSearchLookup(mergedMoves, moveLookup);
  const abilitySearchLookup = buildLocalizedSearchLookup(mergedAbilities, abilityLookup);
  const itemSearchLookup = buildLocalizedSearchLookup(mergedItems, itemLookup);
  const localizedSpeciesNames = new Map(
    Object.entries(mergedPokedex).map(([speciesId, entry]) => [speciesId, entry.localizedName || entry.name || speciesId]),
  );
  const localizedItemNames = new Map(
    Object.values(mergedItems).map((entry) => [normalizeName(entry.name), entry.localizedName || entry.name]),
  );
  const localizedMoveNames = new Map(
    Object.values(mergedMoves).map((entry) => [normalizeName(entry.name), entry.localizedName || entry.name]),
  );
  const localizedAbilityNames = new Map(
    Object.values(mergedAbilities).map((entry) => [normalizeName(entry.name), entry.localizedName || entry.name]),
  );

  const rawSeasonSpeciesIds = championsVgc.usableSpeciesIds || championsVgc.availableSpeciesIds || [];
  const seasonSpeciesIds = rawSeasonSpeciesIds.filter((speciesId) => isSelectableBattleSpecies(mergedPokedex, speciesId));
  const seasonSpeciesIdSet = new Set(seasonSpeciesIds);
  const pokeIconMap = buildPokeIconMap(teamPlannerAssets, standalonePokeIconMap);
  const championsIconMaps = buildChampionsIconMaps(championsIconAssets);

  const selectableSpeciesIds = buildSelectableSpeciesIds(mergedPokedex, seasonSpeciesIds);
  const seasonAvailableSpecies = buildAvailableSpecies(mergedPokedex, formsIndex, seasonSpeciesIds, seasonSpeciesIdSet);
  const allAvailableSpecies = buildAvailableSpecies(mergedPokedex, formsIndex, selectableSpeciesIds, seasonSpeciesIdSet);

  datasetCache.value = {
    localization: localizationData,
    pokedex: mergedPokedex,
    formsIndex,
    moves: mergedMoves,
    // learnsets starts null and is populated when learnsetsReady resolves.
    // getLearnsetMap is null-safe via optional chaining (learnsets.js:79).
    learnsets: null,
    abilities: mergedAbilities,
    items: mergedItems,
    championsVgc,
    usage: null,
    usageOfficial,
    usageLookup: new Map(),
    globalMoveUsageCounts: new Map(Object.entries(usageDerived?.globalMoveUsageCounts || {})),
    globalItemUsageCounts: new Map(Object.entries(usageDerived?.globalItemUsageCounts || {})),
    localizedSpeciesNames,
    localizedItemNames,
    localizedMoveNames,
    localizedAbilityNames,
    teamPlannerAssets,
    pokeIconMap,
    championsIconAssets,
    championsIconMaps,

    seasonSpeciesIds,
    availableSpecies: seasonAvailableSpecies,
    seasonAvailableSpecies,
    allAvailableSpecies,
    speciesIndex: buildSpeciesIndex(mergedPokedex),
    moveLookup,
    moveSearchLookup,
    abilityLookup,
    abilitySearchLookup,
    itemLookup,
    itemSearchLookup,
    // Stored for ensureUsageData() to build derivative tables lazily.
    _moveLookupForUsage: moveLookup,
    _itemLookupForUsage: itemLookup,
    // paste counts/cores start empty; populated when pasteTeamsReady resolves.
    // team-role-meta.js consumers are null-safe via `|| {}` and `Array.isArray(…) ? … : []`.
    pasteSpeciesCounts: {},
    pasteCorePairs: [],
  };
  // Wire learnsets in once the deferred fetch resolves. Mutating the cached
  // object means existing references to `datasets.learnsets` start seeing
  // real data without re-issuing loadDatasets.
  datasetCache.value.learnsetsReady = learnsetsPromise
    .then((learnsets) => {
      datasetCache.value.learnsets = learnsets;
      return learnsets;
    })
    .catch((error) => {
      console.error("learnsets.json failed to load", error);
      // Keep learnsets as null; null-safe call sites continue to work.
      // Surface the failure for the user-visible status line per the
      // \"不引入静默 fallback\" rule — re-throw so awaiters can react.
      throw error;
    });
  // Full per-species usage remains deferred; aggregate usage counts are
  // generated by tools/build-derived-data.mjs during data refresh.
  datasetCache.value.usageReady = null;
  datasetCache.value.pasteTeamsReady = null;
  return datasetCache.value;
}

let usageFetchStarted = false;

/**
 * Start the usage.json (~30 MB) fetch if not already in progress.
 * Idempotent — safe to call multiple times. Returns the usageReady promise.
 * Called from main.js on idle callback and on first team member add.
 */
export function ensureUsageData() {
  const datasets = datasetCache.value;
  if (!datasets) return null;
  if (datasets.usageReady) return datasets.usageReady;
  if (usageFetchStarted) return null;
  usageFetchStarted = true;

  const usagePromise = fetchJson(DATA_PATHS.usage);
  datasets.usageReady = usagePromise
    .then((usage) => {
      datasets.usage = usage;
      datasets.usageLookup = buildUsageLookup(usage);
      datasets.globalMoveUsageCounts = datasets.globalMoveUsageCounts || new Map();
      datasets.globalItemUsageCounts = datasets.globalItemUsageCounts || new Map();
      return usage;
    })
    .catch((error) => {
      console.error("usage.json failed to load", error);
      throw error;
    });
  return datasets.usageReady;
}

export function ensurePasteTeamMetaData() {
  const datasets = datasetCache.value;
  if (!datasets) return null;
  if (datasets.pasteTeamsReady) return datasets.pasteTeamsReady;
  if (pasteTeamsFetchStarted) return null;
  pasteTeamsFetchStarted = true;

  datasets.pasteTeamsReady = fetchJson(DATA_PATHS.pasteTeams)
    .then((pasteTeams) => {
      datasets.pasteSpeciesCounts = buildPasteSpeciesCounts(pasteTeams);
      datasets.pasteCorePairs = buildPasteCorePairs(pasteTeams);
      return pasteTeams;
    })
    .catch((error) => {
      console.error("paste_teams_champions_mb.json failed to load", error);
      throw error;
    });
  return datasets.pasteTeamsReady;
}

function sortTierEntries(entries) {
  return entries.sort((left, right) => left._importIndex - right._importIndex);
}

function dedupeTierEntries(entries) {
  const seen = new Set();
  const unique = [];
  entries.forEach((entry) => {
    const key = `${entry.matchupSide || "ally"}|${entry.speciesId || entry.speciesName || entry.displayName || ""}|${entry.speedTierMode || "base"}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    unique.push(entry);
  });
  return unique;
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
    .map(([speed, entries]) => {
      const sorted = sortTierEntries(entries);
      const deduped = dedupeTierEntries(sorted);
      return {
        speed: Number(speed),
        totalCount: deduped.length,
        entries: deduped,
      };
    });
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

function getEntrySide(entry = {}, defaultSide = "ally") {
  return entry.matchupSide === "opponent" ? "opponent" : defaultSide;
}

function buildResolvedSpeedEntries(library = [], options = {}) {
  const fieldState = options.fieldState || null;
  const includeVariants = options.includeVariants !== false;
  const defaultSide = options.defaultSide || "ally";
  const entries = [];
  library.forEach((entry, index) => {
    const side = getEntrySide(entry, defaultSide);
    const variants = fieldState
      ? getSpeedVariants(entry, side, fieldState)
      : [{mode: "base", speed: Number(entry.stats?.spe || 0), sources: []}];
    const selected = includeVariants ? variants : variants.filter((variant) => variant.mode === "base");
    selected.forEach((variant) => {
      if (!variant.speed) return;
      entries.push({
        ...entry,
        speed: Number(variant.speed || 0),
        _importIndex: index,
        speedTierMode: variant.mode,
      });
    });
  });
  return entries;
}

export function calculateSpeedLineTiers(library, options = {}) {
  const entries = [];
  buildResolvedSpeedEntries(library, {...options, includeVariants: true}).forEach((entry) => {
    if (entry.excludeBaseSpeedTier && entry.speedTierMode === "base") {
      return;
    }
    entries.push(entry);
  });
  return buildSpeedTierMap(entries);
}

export function calculateConfiguredSpeedTiers(library, options = {}) {
  return buildSpeedTierMap(buildResolvedSpeedEntries(library, {...options, includeVariants: false}));
}
