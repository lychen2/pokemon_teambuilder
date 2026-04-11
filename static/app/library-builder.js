import {FALLBACK_LEVEL, NATURE_EFFECTS, TYPE_ORDER} from "./constants.js";
import {hydrateConfigs} from "./showdown.js";
import {
  applyNatureToChampionStats,
  calculateChampionStats,
  createEmptySpread,
  getChampionPointTotal,
  normalizeLookupText,
  normalizeName,
} from "./utils.js";

const DEFAULT_MOVE_SLOTS = 4;
const DEFAULT_NATURE = "Hardy";
const MAX_POINTS = 66;
const MAX_STAT_POINTS = 32;

function createMoveSlots() {
  return Array.from({length: DEFAULT_MOVE_SLOTS}, () => "");
}

export function buildSpeciesBrowser(datasets, library) {
  const counts = library.reduce((map, config) => {
    map.set(config.speciesId, (map.get(config.speciesId) || 0) + 1);
    return map;
  }, new Map());
  return (datasets.availableSpecies || []).map((species) => ({
    ...species,
    configCount: counts.get(species.speciesId) || 0,
    searchText: normalizeName([
      species.speciesName,
      species.speciesId,
      ...(species.types || []),
    ].join(" ")),
  }));
}

export function buildNatureOptions() {
  return [DEFAULT_NATURE, ...Object.keys(NATURE_EFFECTS).sort((left, right) => left.localeCompare(right))];
}

export function createBuilderState(speciesId, datasets) {
  const species = datasets.pokedex[speciesId];
  return {
    speciesId,
    item: "",
    ability: Object.values(species?.abilities || {}).find(Boolean) || "",
    teraType: "",
    nature: DEFAULT_NATURE,
    note: "",
    points: createEmptySpread(),
    moves: createMoveSlots(),
  };
}

export function getAbilityOptions(speciesId, datasets) {
  const species = datasets.pokedex[speciesId];
  return [...new Set(Object.values(species?.abilities || {}).filter(Boolean))];
}

export function getItemOptions(datasets) {
  return Object.values(datasets.items || {})
    .map((entry) => entry.name)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

export function getMoveOptions(datasets) {
  return Object.values(datasets.moves || {})
    .map((entry) => entry.name)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function resolveMoveEntry(moveName, datasets) {
  const lookup = datasets.moveSearchLookup || datasets.moveLookup;
  return lookup.get(normalizeLookupText(moveName)) || null;
}

function resolveItemEntry(itemName, datasets) {
  const lookup = datasets.itemSearchLookup || datasets.itemLookup;
  return lookup.get(normalizeLookupText(itemName)) || null;
}

function getStandardLearnsetMap(speciesId, datasets) {
  const direct = datasets.learnsets?.[speciesId]?.learnset;
  if (direct) {
    return direct;
  }
  const species = datasets.pokedex[speciesId];
  const baseSpeciesId = normalizeName(species?.baseSpecies || "");
  return datasets.learnsets?.[baseSpeciesId]?.learnset || null;
}

function getLearnsetMap(speciesId, datasets) {
  const direct = datasets.championsVgc?.learnsets?.[speciesId];
  if (direct) {
    return direct;
  }
  const species = datasets.pokedex[speciesId];
  const baseSpeciesId = normalizeName(species?.baseSpecies || "");
  const championsLearnset = datasets.championsVgc?.learnsets?.[baseSpeciesId] || null;
  if (championsLearnset) {
    return championsLearnset;
  }
  return getStandardLearnsetMap(speciesId, datasets) || null;
}

export function getMoveLegality(moveName, speciesId, datasets) {
  if (!moveName.trim()) {
    return {status: "empty", move: null};
  }
  const move = resolveMoveEntry(moveName, datasets);
  if (!move) {
    return {status: "unknown", move: null};
  }
  const learnset = getLearnsetMap(speciesId, datasets);
  if (!learnset) {
    return {status: "unknown", move};
  }
  const moveId = normalizeName(move.name);
  return {
    status: learnset[moveId] ? "legal" : "illegal",
    move,
  };
}

export function getBuilderStats(speciesId, points, nature, datasets) {
  const baseStats = datasets.pokedex[speciesId]?.baseStats || createEmptySpread();
  return applyNatureToChampionStats(calculateChampionStats(baseStats, points), nature || DEFAULT_NATURE);
}

function sanitizePoints(points = {}) {
  return {
    hp: clampPoint(points.hp),
    atk: clampPoint(points.atk),
    def: clampPoint(points.def),
    spa: clampPoint(points.spa),
    spd: clampPoint(points.spd),
    spe: clampPoint(points.spe),
  };
}

function clampPoint(value) {
  return Math.min(MAX_STAT_POINTS, Math.max(0, Math.floor(Number(value || 0))));
}

export function validateBuilderState(builder, datasets) {
  const points = sanitizePoints(builder.points);
  const total = getChampionPointTotal(points);
  const legalAbilities = new Set(getAbilityOptions(builder.speciesId, datasets));
  const itemName = builder.item.trim();
  const moveChecks = builder.moves.map((move) => getMoveLegality(move, builder.speciesId, datasets));
  const trimmedMoves = builder.moves
    .map((move) => resolveMoveEntry(move, datasets)?.name || move.trim())
    .filter(Boolean);
  const blockingErrors = [];
  const warnings = [];

  if (total > MAX_POINTS) {
    blockingErrors.push("points-total");
  }
  if (itemName && !resolveItemEntry(itemName, datasets)) {
    warnings.push("item-unknown");
  }
  if (builder.ability && !legalAbilities.has(builder.ability)) {
    warnings.push("ability-illegal");
  }
  if (trimmedMoves.length !== DEFAULT_MOVE_SLOTS) {
    blockingErrors.push("moves-count");
  }
  if (new Set(trimmedMoves.map((move) => normalizeName(move))).size !== trimmedMoves.length) {
    blockingErrors.push("moves-duplicate");
  }
  if (moveChecks.some((entry) => entry.status === "illegal" || entry.status === "unknown")) {
    warnings.push("moves-illegal");
  }

  return {
    points,
    total,
    moveChecks,
    errors: blockingErrors,
    warnings,
    canSave: blockingErrors.length === 0,
  };
}

export function buildConfigFromBuilder(builder, datasets) {
  const config = {
    id: `custom:${builder.speciesId}:${Date.now()}`,
    source: "custom",
    speciesId: builder.speciesId,
    speciesName: datasets.pokedex[builder.speciesId]?.name || builder.speciesId,
    displayName: datasets.pokedex[builder.speciesId]?.name || builder.speciesId,
    ability: builder.ability || "",
    item: resolveItemEntry(builder.item, datasets)?.name || builder.item || "",
    teraType: builder.teraType || "",
    nature: builder.nature || DEFAULT_NATURE,
    note: builder.note || "",
    level: FALLBACK_LEVEL,
    championPoints: builder.points,
    moveNames: builder.moves
      .map((move) => resolveMoveEntry(move, datasets)?.name || move.trim())
      .filter(Boolean),
  };
  return hydrateConfigs([config], datasets, FALLBACK_LEVEL)[0] || null;
}

export function getTypeOptions() {
  return ["", ...TYPE_ORDER];
}
