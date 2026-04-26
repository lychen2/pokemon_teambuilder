import {DATA_PATHS} from "./constants.js";
import {getSpeedVariants} from "./battle-semantics.js";
import {buildGlobalItemUsageCounts, buildGlobalMoveUsageCounts, buildUsageLookup} from "./usage.js";
import {compareSpeciesByDex, fetchJson, normalizeLookupText, normalizeName} from "./utils.js";

const datasetCache = {value: null};
const ALWAYS_ACTIVE_MOVE_OVERRIDES = Object.freeze({
  weatherball: {basePower: 100},
});
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
        dexNumber: Number(entry.num || 0),
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
    .sort(compareSpeciesByDex);
}

export async function loadDatasets() {
  if (datasetCache.value) {
    return datasetCache.value;
  }

  const [pokeIconMap, localizationData, pokedex, formsIndex, moves, learnsets, abilities, items, championsVgc, usage] = await Promise.all([
    fetchJson(DATA_PATHS.pokeIconMap),
    fetchJson(DATA_PATHS.localizationData),
    fetchJson(DATA_PATHS.pokedex),
    fetchJson(DATA_PATHS.formsIndex),
    fetchJson(DATA_PATHS.moves),
    fetchJson(DATA_PATHS.learnsets),
    fetchJson(DATA_PATHS.abilities),
    fetchJson(DATA_PATHS.items),
    fetchJson(DATA_PATHS.championsVgc),
    fetchJson(DATA_PATHS.usage),
  ]);

  const mergedPokedex = localizeDexEntries(
    mergeDexEntries(pokedex, championsVgc.overrideSpeciesData),
    localizationData,
  );
  const mergedMoves = localizeDexEntries(
    normalizeMoveEntries(mergeDexEntries(moves, championsVgc.overrideMoveData)),
    localizationData,
  );
  const mergedAbilities = localizeDexEntries(
    mergeDexEntries(abilities, championsVgc.overrideAbilityData),
    localizationData,
  );
  const mergedItems = localizeDexEntries(
    mergeDexEntries(items, championsVgc.overrideItemData),
    localizationData,
  );
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

  datasetCache.value = {
    localization: localizationData,
    pokedex: mergedPokedex,
    formsIndex,
    moves: mergedMoves,
    learnsets,
    abilities: mergedAbilities,
    items: mergedItems,
    championsVgc,
    usage,
    usageLookup: buildUsageLookup(usage),
    globalMoveUsageCounts: buildGlobalMoveUsageCounts(usage, moveLookup),
    globalItemUsageCounts: buildGlobalItemUsageCounts(usage, itemLookup),
    localizedSpeciesNames,
    localizedItemNames,
    localizedMoveNames,
    localizedAbilityNames,
    pokeIconMap,
    availableSpecies: buildAvailableSpecies(mergedPokedex, formsIndex, championsVgc.usableSpeciesIds || championsVgc.availableSpeciesIds || []),
    speciesIndex: buildSpeciesIndex(mergedPokedex),
    moveLookup,
    moveSearchLookup,
    abilityLookup,
    abilitySearchLookup,
    itemLookup,
    itemSearchLookup,
  };
  return datasetCache.value;
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
