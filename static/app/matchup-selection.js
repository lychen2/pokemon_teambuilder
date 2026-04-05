import {normalizeName} from "./utils.js";

const MAX_OPPONENT_TEAM_SIZE = 6;

function getSpeciesId(config = {}) {
  return String(config.speciesId || normalizeName(config.speciesName || config.displayName || config.id || ""));
}

function uniqueValues(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function buildOpponentEntry(configs = []) {
  const [firstConfig] = configs;
  if (!firstConfig) {
    return null;
  }

  const speeds = configs.map((config) => Number(config.stats?.spe || 0));
  const minSpeed = Math.min(...speeds);
  const maxSpeed = Math.max(...speeds);
  return {
    id: `opponent:${firstConfig.speciesId}`,
    speciesId: firstConfig.speciesId,
    speciesName: firstConfig.speciesName || firstConfig.displayName || "Unknown",
    displayName: firstConfig.speciesName || firstConfig.displayName || "Unknown",
    displayLabel: firstConfig.speciesName || firstConfig.displayName || "Unknown",
    spritePosition: firstConfig.spritePosition,
    types: firstConfig.types || [],
    configIds: configs.map((config) => config.id),
    labels: uniqueValues(configs.map((config) => config.displayLabel || config.displayName || config.speciesName)),
    moveNames: uniqueValues(configs.flatMap((config) => config.moveNames || [])),
    stats: {spe: maxSpeed},
    speedRange: {min: Number.isFinite(minSpeed) ? minSpeed : 0, max: Number.isFinite(maxSpeed) ? maxSpeed : 0},
    configs,
  };
}

function buildOpponentMap(library = []) {
  const groups = new Map();
  library.forEach((config) => {
    const speciesId = getSpeciesId(config);
    if (!speciesId) {
      return;
    }
    const configs = groups.get(speciesId) || [];
    configs.push(config);
    groups.set(speciesId, configs);
  });
  return new Map([...groups.entries()].map(([speciesId, configs]) => [speciesId, buildOpponentEntry(configs)]));
}

function collectSpeciesIds(entries = [], library = []) {
  const configToSpecies = new Map(library.map((config) => [config.id, config.speciesId]));
  return uniqueValues(entries.map((entry) => {
    if (entry?.speciesId) {
      return entry.speciesId;
    }
    if (entry?.id && configToSpecies.has(entry.id)) {
      return configToSpecies.get(entry.id);
    }
    return "";
  }));
}

function getSavedSpeciesIds(snapshot = {}, library = []) {
  if (Array.isArray(snapshot.speciesIds) && snapshot.speciesIds.length) {
    return uniqueValues(snapshot.speciesIds);
  }

  if (!Array.isArray(snapshot.configIds) || !snapshot.configIds.length) {
    return [];
  }

  const configToSpecies = new Map(library.map((config) => [config.id, config.speciesId]));
  return uniqueValues(snapshot.configIds.map((configId) => configToSpecies.get(configId) || ""));
}

export function buildOpponentLibrary(library = []) {
  return [...buildOpponentMap(library).values()];
}

export function filterOpponentLibrary(entries = [], searchText = "") {
  const searchToken = normalizeName(searchText);
  if (!searchToken) {
    return entries;
  }

  return entries.filter((entry) => {
    const haystack = normalizeName([
      entry.speciesName,
      entry.labels.join(" "),
      entry.moveNames.join(" "),
    ].join(" "));
    return haystack.includes(searchToken);
  });
}

export function findOpponentEntry(library = [], speciesId = "") {
  return buildOpponentMap(library).get(speciesId) || null;
}

export function syncOpponentTeam(opponentTeam = [], library = []) {
  const opponentMap = buildOpponentMap(library);
  return collectSpeciesIds(opponentTeam, library)
    .slice(0, MAX_OPPONENT_TEAM_SIZE)
    .map((speciesId) => opponentMap.get(speciesId))
    .filter(Boolean);
}

export function restoreOpponentTeam(opponentTeam = [], library = []) {
  return syncOpponentTeam(opponentTeam, library);
}

export function normalizeSavedOpponentTeams(savedTeams = [], library = []) {
  const opponentMap = buildOpponentMap(library);
  return savedTeams.map((team) => {
    const speciesIds = getSavedSpeciesIds(team, library)
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

export function loadSavedOpponentSelection(snapshot = {}, library = []) {
  const opponentMap = buildOpponentMap(library);
  return getSavedSpeciesIds(snapshot, library)
    .filter((speciesId) => opponentMap.has(speciesId))
    .slice(0, MAX_OPPONENT_TEAM_SIZE)
    .map((speciesId) => opponentMap.get(speciesId));
}

export function getOpponentVariantCount(entry = {}) {
  return Array.isArray(entry.configs) ? entry.configs.length : 0;
}
