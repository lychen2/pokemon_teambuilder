import {buildSpeciesTemplateConfigs} from "./champions-vgc.js";
import {normalizeLookupText, normalizeName} from "./utils.js";

const MAX_OPPONENT_TEAM_SIZE = 6;

function getConfigSpeciesId(config = {}) {
  return String(config.speciesId || normalizeName(config.speciesName || config.displayName || config.id || ""));
}

function uniqueValues(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function isMegaEntry(entry = {}) {
  return String(entry.forme || "").startsWith("Mega") || String(entry.name || "").includes("-Mega");
}

function getOpponentSpeciesId(datasets, rawSpeciesId = "") {
  const speciesId = normalizeName(rawSpeciesId);
  const entry = datasets.pokedex?.[speciesId];
  if (!entry || !isMegaEntry(entry)) {
    return speciesId;
  }
  return normalizeName(entry.baseSpecies || speciesId);
}

function buildOpponentEntry(species, configs = []) {
  const [firstConfig] = configs;
  if (!firstConfig && !species) {
    return null;
  }

  const speeds = configs.map((config) => Number(config.stats?.spe || 0));
  const minSpeed = Math.min(...speeds);
  const maxSpeed = Math.max(...speeds);
  const speciesId = species?.speciesId || firstConfig?.speciesId || "unknown";
  const speciesName = species?.speciesName || firstConfig?.speciesName || firstConfig?.displayName || "Unknown";
  return {
    id: `opponent:${speciesId}`,
    speciesId,
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
  };
}

function buildOpponentMap(datasets, library = [], language = "zh") {
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
    const canonicalSpecies = availableSpeciesMap.get(speciesId) || species;
    const configs = groups.get(speciesId) || buildSpeciesTemplateConfigs(canonicalSpecies, datasets, language);
    const entry = buildOpponentEntry(canonicalSpecies, configs);
    if (entry) {
      opponentMap.set(speciesId, entry);
    }
  });
  return opponentMap;
}

function collectSpeciesIds(entries = [], library = [], datasets) {
  const configToSpecies = new Map(library.map((config) => [config.id, config.speciesId]));
  return uniqueValues(entries.map((entry) => {
    if (entry?.speciesId) {
      return getOpponentSpeciesId(datasets, entry.speciesId);
    }
    if (entry?.id && configToSpecies.has(entry.id)) {
      return getOpponentSpeciesId(datasets, configToSpecies.get(entry.id));
    }
    return "";
  }));
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
  const opponentMap = buildOpponentMap(datasets, library, language);
  return collectSpeciesIds(opponentTeam, library, datasets)
    .slice(0, MAX_OPPONENT_TEAM_SIZE)
    .map((speciesId) => opponentMap.get(speciesId))
    .filter(Boolean);
}

export function restoreOpponentTeam(opponentTeam = [], datasets, library = [], language = "zh") {
  return syncOpponentTeam(opponentTeam, datasets, library, language);
}

export function normalizeSavedOpponentTeams(savedTeams = [], datasets, library = [], language = "zh") {
  const opponentMap = buildOpponentMap(datasets, library, language);
  return savedTeams.map((team) => {
    const speciesIds = getSavedSpeciesIds(team, library, datasets)
      .filter((speciesId) => opponentMap.has(speciesId))
      .slice(0, MAX_OPPONENT_TEAM_SIZE);
    return {
      ...team,
      speciesIds,
      labels: speciesIds.map((speciesId) => opponentMap.get(speciesId)?.speciesName || speciesId),
    };
  });
}

export function createSavedOpponentSnapshot(opponentTeam = [], name = "") {
  const speciesIds = opponentTeam.map((entry) => entry.speciesId).filter(Boolean);
  return {
    id: `opponent:${Date.now()}`,
    name,
    speciesIds,
    labels: opponentTeam.map((entry) => entry.speciesName || entry.displayName || "Unknown"),
  };
}

export function loadSavedOpponentSelection(snapshot = {}, datasets, library = [], language = "zh") {
  const opponentMap = buildOpponentMap(datasets, library, language);
  return getSavedSpeciesIds(snapshot, library, datasets)
    .filter((speciesId) => opponentMap.has(speciesId))
    .slice(0, MAX_OPPONENT_TEAM_SIZE)
    .map((speciesId) => opponentMap.get(speciesId));
}

export function getOpponentVariantCount(entry = {}) {
  return Array.isArray(entry.configs) ? entry.configs.length : 0;
}
