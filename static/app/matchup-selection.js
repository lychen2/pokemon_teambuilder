import {buildSpeciesTemplateConfigs} from "./champions-vgc.js";
import {normalizeLookupText, normalizeName} from "./utils.js";

const MAX_OPPONENT_TEAM_SIZE = 6;
const OPPONENT_SPECIES_ALIASES = new Map([
  ["floetteeternal", "floette"],
]);
const OPPONENT_SPRITE_SPECIES = new Map([
  ["floette", "floetteeternal"],
]);

function getConfigSpeciesId(config = {}) {
  return String(config.speciesId || normalizeName(config.speciesName || config.displayName || config.id || ""));
}

function uniqueValues(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function isMegaEntry(entry = {}) {
  return String(entry.forme || "").startsWith("Mega") || String(entry.name || "").includes("-Mega");
}

function buildCanonicalSpecies(datasets, speciesId, fallbackSpecies = null) {
  const species = datasets.pokedex?.[speciesId];
  if (!species) {
    return fallbackSpecies;
  }
  const spriteSpeciesId = OPPONENT_SPRITE_SPECIES.get(speciesId) || speciesId;
  const spriteSpecies = datasets.pokedex?.[spriteSpeciesId] || species;
  const spriteIndex = datasets.formsIndex?.[spriteSpeciesId] ?? spriteSpecies.num ?? species.num ?? 0;
  return {
    speciesId,
    spriteSpeciesId,
    speciesName: species.name,
    dexNumber: Number(species.num || 0),
    baseStats: species.baseStats || {},
    types: species.types || [],
    abilities: species.abilities || {},
    spritePosition: {
      x: (spriteIndex % 12) * 40,
      y: Math.floor(spriteIndex / 12) * 30,
    },
  };
}

function getOpponentSpeciesId(datasets, rawSpeciesId = "") {
  const speciesId = normalizeName(rawSpeciesId);
  const aliasSpeciesId = OPPONENT_SPECIES_ALIASES.get(speciesId);
  if (aliasSpeciesId) {
    return aliasSpeciesId;
  }
  const entry = datasets.pokedex?.[speciesId];
  if (!entry || !isMegaEntry(entry)) {
    return speciesId;
  }
  return normalizeName(entry.baseSpecies || speciesId);
}

function sanitizeSelectedConfigId(configs = [], selectedConfigId = "") {
  if (!selectedConfigId) {
    return "";
  }
  return configs.some((config) => config.id === selectedConfigId) ? selectedConfigId : "";
}

function getSelectedConfig(configs = [], selectedConfigId = "") {
  return configs.find((config) => config.id === selectedConfigId) || null;
}

function buildOpponentEntry(species, configs = [], selection = {}) {
  const [firstConfig] = configs;
  if (!firstConfig && !species) {
    return null;
  }
  const selectedConfigId = selection?.selectedConfigId || "";
  const validSelectedConfigId = sanitizeSelectedConfigId(configs, selectedConfigId);
  const selectedConfig = getSelectedConfig(configs, validSelectedConfigId);
  const activeConfigs = selectedConfig ? [selectedConfig] : configs;
  const speeds = activeConfigs.map((config) => Number(config.stats?.spe || 0));
  const minSpeed = Math.min(...speeds);
  const maxSpeed = Math.max(...speeds);
  const speciesId = species?.speciesId || firstConfig?.speciesId || "unknown";
  const speciesName = species?.speciesName || firstConfig?.speciesName || firstConfig?.displayName || "Unknown";
  return {
    id: `opponent:${speciesId}`,
    speciesId,
    spriteSpeciesId: species?.spriteSpeciesId || firstConfig?.spriteSpeciesId || speciesId,
    speciesName,
    displayName: speciesName,
    displayLabel: speciesName,
    spritePosition: species?.spritePosition || firstConfig?.spritePosition,
    types: species?.types || firstConfig?.types || [],
    configIds: configs.map((config) => config.id),
    labels: uniqueValues(configs.map((config) => config.displayLabel || config.displayName || config.speciesName)),
    moveNames: uniqueValues(configs.flatMap((config) => config.moveNames || [])),
    stats: {spe: Number.isFinite(maxSpeed) ? maxSpeed : 0},
    speedRange: {min: Number.isFinite(minSpeed) ? minSpeed : 0, max: Number.isFinite(maxSpeed) ? maxSpeed : 0},
    configs,
    selectedConfigId: validSelectedConfigId,
    selectedConfigLabel: selectedConfig?.displayLabel || selectedConfig?.displayName || "",
    pinned: Boolean(selection?.pinned),
  };
}

function buildOpponentMap(datasets, library = [], language = "zh", selectionMap = new Map()) {
  const groups = new Map();
  const availableSpeciesMap = new Map((datasets.availableSpecies || []).map((species) => [species.speciesId, species]));
  library.forEach((config) => {
    const speciesId = getOpponentSpeciesId(datasets, getConfigSpeciesId(config));
    if (!speciesId) {
      return;
    }
    const configs = groups.get(speciesId) || [];
    configs.push(config);
    groups.set(speciesId, configs);
  });

  const opponentMap = new Map();
  (datasets.availableSpecies || []).forEach((species) => {
    const speciesId = getOpponentSpeciesId(datasets, species.speciesId);
    if (opponentMap.has(speciesId)) {
      return;
    }
    const canonicalSpecies = availableSpeciesMap.get(speciesId)
      || buildCanonicalSpecies(datasets, speciesId, species);
    const configs = groups.get(speciesId) || buildSpeciesTemplateConfigs(canonicalSpecies, datasets, language);
    const entry = buildOpponentEntry(canonicalSpecies, configs, selectionMap.get(speciesId) || {});
    if (entry) {
      opponentMap.set(speciesId, entry);
    }
  });
  return opponentMap;
}

function collectSelections(entries = [], library = [], datasets) {
  const configToSpecies = new Map(library.map((config) => [config.id, config.speciesId]));
  return entries.map((entry) => {
    let speciesId = "";
    if (entry?.speciesId) {
      speciesId = getOpponentSpeciesId(datasets, entry.speciesId);
    } else if (entry?.id && configToSpecies.has(entry.id)) {
      speciesId = getOpponentSpeciesId(datasets, configToSpecies.get(entry.id));
    }
    return {
      speciesId,
      selectedConfigId: String(entry?.selectedConfigId || ""),
      pinned: Boolean(entry?.pinned),
    };
  }).filter((entry) => entry.speciesId)
    .filter((entry, index, array) => array.findIndex((candidate) => candidate.speciesId === entry.speciesId) === index);
}

function getSavedSpeciesIds(snapshot = {}, library = [], datasets) {
  if (Array.isArray(snapshot.speciesIds) && snapshot.speciesIds.length) {
    return uniqueValues(snapshot.speciesIds.map((speciesId) => getOpponentSpeciesId(datasets, speciesId)));
  }

  if (!Array.isArray(snapshot.configIds) || !snapshot.configIds.length) {
    return [];
  }

  const configToSpecies = new Map(library.map((config) => [config.id, config.speciesId]));
  return uniqueValues(snapshot.configIds.map((configId) => getOpponentSpeciesId(datasets, configToSpecies.get(configId) || "")));
}

function getSavedSelections(snapshot = {}, library = [], datasets) {
  if (Array.isArray(snapshot.selections) && snapshot.selections.length) {
    return snapshot.selections
      .map((entry) => ({
        speciesId: getOpponentSpeciesId(datasets, entry?.speciesId || ""),
        selectedConfigId: String(entry?.selectedConfigId || ""),
        pinned: Boolean(entry?.pinned),
      }))
      .filter((entry) => entry.speciesId);
  }
  return getSavedSpeciesIds(snapshot, library, datasets).map((speciesId) => ({
    speciesId,
    selectedConfigId: "",
    pinned: false,
  }));
}

function buildSelectionMap(entries = []) {
  return new Map(entries.map((entry) => [entry.speciesId, {
    selectedConfigId: entry.selectedConfigId || "",
    pinned: Boolean(entry.pinned),
  }]));
}

function sortSavedOpponentTeams(savedTeams = []) {
  return [...savedTeams].sort((left, right) => {
    const rightOpened = Number(right.lastOpenedAt || 0);
    const leftOpened = Number(left.lastOpenedAt || 0);
    if (rightOpened !== leftOpened) {
      return rightOpened - leftOpened;
    }
    const rightCount = Number(right.openCount || 0);
    const leftCount = Number(left.openCount || 0);
    if (rightCount !== leftCount) {
      return rightCount - leftCount;
    }
    const rightCreated = Number(right.createdAt || 0);
    const leftCreated = Number(left.createdAt || 0);
    if (rightCreated !== leftCreated) {
      return rightCreated - leftCreated;
    }
    return String(left.name || "").localeCompare(String(right.name || ""), "zh-Hans-CN");
  });
}

export function buildOpponentLibrary(datasets, library = [], language = "zh") {
  return [...buildOpponentMap(datasets, library, language).values()];
}

export function filterOpponentLibrary(entries = [], searchText = "") {
  const searchToken = normalizeLookupText(searchText);
  if (!searchToken) {
    return entries;
  }

  return entries.filter((entry) => {
    const haystack = normalizeLookupText([
      entry.speciesName,
      entry.localizedSpeciesName,
      entry.labels.join(" "),
      entry.moveNames.join(" "),
    ].join(" "));
    return haystack.includes(searchToken);
  });
}

export function findOpponentEntry(datasets, library = [], speciesId = "", language = "zh") {
  return buildOpponentMap(datasets, library, language).get(getOpponentSpeciesId(datasets, speciesId)) || null;
}

export function syncOpponentTeam(opponentTeam = [], datasets, library = [], language = "zh") {
  const selections = collectSelections(opponentTeam, library, datasets).slice(0, MAX_OPPONENT_TEAM_SIZE);
  const opponentMap = buildOpponentMap(datasets, library, language, buildSelectionMap(selections));
  return selections
    .map((entry) => opponentMap.get(entry.speciesId))
    .filter(Boolean);
}

export function restoreOpponentTeam(opponentTeam = [], datasets, library = [], language = "zh") {
  return syncOpponentTeam(opponentTeam, datasets, library, language);
}

export function normalizeSavedOpponentTeams(savedTeams = [], datasets, library = [], language = "zh") {
  const opponentMap = buildOpponentMap(datasets, library, language);
  return sortSavedOpponentTeams(savedTeams.map((team) => {
    const selections = getSavedSelections(team, library, datasets)
      .filter((entry) => opponentMap.has(entry.speciesId))
      .slice(0, MAX_OPPONENT_TEAM_SIZE);
    return {
      ...team,
      createdAt: Number(team.createdAt || 0),
      lastOpenedAt: Number(team.lastOpenedAt || 0),
      openCount: Number(team.openCount || 0),
      selections,
      speciesIds: selections.map((entry) => entry.speciesId),
      labels: selections.map((entry) => opponentMap.get(entry.speciesId)?.speciesName || entry.speciesId),
    };
  }));
}

export function createSavedOpponentSnapshot(opponentTeam = [], name = "") {
  const createdAt = Date.now();
  const selections = opponentTeam.map((entry) => ({
    speciesId: entry.speciesId,
    selectedConfigId: entry.selectedConfigId || "",
    pinned: Boolean(entry.pinned),
  })).filter((entry) => entry.speciesId);
  return {
    id: `opponent:${Date.now()}`,
    name,
    createdAt,
    lastOpenedAt: 0,
    openCount: 0,
    selections,
    speciesIds: selections.map((entry) => entry.speciesId),
    labels: opponentTeam.map((entry) => entry.speciesName || entry.displayName || "Unknown"),
  };
}

export function loadSavedOpponentSelection(snapshot = {}, datasets, library = [], language = "zh") {
  const selections = getSavedSelections(snapshot, library, datasets)
    .slice(0, MAX_OPPONENT_TEAM_SIZE);
  const opponentMap = buildOpponentMap(datasets, library, language, buildSelectionMap(selections));
  return selections
    .filter((entry) => opponentMap.has(entry.speciesId))
    .slice(0, MAX_OPPONENT_TEAM_SIZE)
    .map((entry) => opponentMap.get(entry.speciesId));
}

export function getOpponentVariantCount(entry = {}) {
  return Array.isArray(entry.configs) ? entry.configs.length : 0;
}
