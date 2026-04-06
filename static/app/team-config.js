import {normalizeName} from "./utils.js";

const MINOR_MOVE_CHANGE_LIMIT = 2;
const MINOR_POINT_CHANGE_LIMIT = 2;

function normalizeField(value) {
  return normalizeName(String(value || ""));
}

function getMoveSet(config) {
  return new Set((config.moveNames || []).map(normalizeField).filter(Boolean));
}

function getChangedMoveCount(left, right) {
  const leftMoves = getMoveSet(left);
  const rightMoves = getMoveSet(right);
  let sharedCount = 0;
  leftMoves.forEach((move) => {
    if (rightMoves.has(move)) {
      sharedCount += 1;
    }
  });
  return Math.max(leftMoves.size, rightMoves.size) - sharedCount;
}

function getPointDelta(left, right, stats) {
  return stats.reduce((total, stat) => {
    const leftValue = Number(left?.championPoints?.[stat] || 0);
    const rightValue = Number(right?.championPoints?.[stat] || 0);
    return total + Math.abs(leftValue - rightValue);
  }, 0);
}

function getComparisonMetrics(baseConfig, nextConfig) {
  return {
    itemChanged: normalizeField(baseConfig.item) !== normalizeField(nextConfig.item),
    abilityChanged: normalizeField(baseConfig.ability) !== normalizeField(nextConfig.ability),
    natureChanged: normalizeField(baseConfig.nature) !== normalizeField(nextConfig.nature),
    teraChanged: normalizeField(baseConfig.teraType) !== normalizeField(nextConfig.teraType),
    moveChanges: getChangedMoveCount(baseConfig, nextConfig),
    nonSpeedPointDelta: getPointDelta(baseConfig, nextConfig, ["hp", "atk", "def", "spa", "spd"]),
    speedPointDelta: getPointDelta(baseConfig, nextConfig, ["spe"]),
    speedValueDelta: Math.abs(Number(baseConfig.stats?.spe || 0) - Number(nextConfig.stats?.spe || 0)),
  };
}

function classifyMetrics(metrics) {
  const isExact = !metrics.itemChanged
    && !metrics.abilityChanged
    && !metrics.natureChanged
    && !metrics.teraChanged
    && metrics.moveChanges === 0
    && metrics.nonSpeedPointDelta === 0
    && metrics.speedPointDelta === 0
    && metrics.speedValueDelta === 0;
  if (isExact) {
    return "exact";
  }

  const isMinor = !metrics.itemChanged
    && !metrics.abilityChanged
    && !metrics.natureChanged
    && metrics.speedPointDelta === 0
    && metrics.speedValueDelta === 0
    && metrics.moveChanges <= MINOR_MOVE_CHANGE_LIMIT
    && metrics.nonSpeedPointDelta <= MINOR_POINT_CHANGE_LIMIT;
  return isMinor ? "minor" : "major";
}

function scoreMetrics(metrics) {
  let score = 0;
  if (!metrics.itemChanged) score += 30;
  if (!metrics.abilityChanged) score += 24;
  if (!metrics.natureChanged) score += 20;
  if (metrics.speedPointDelta === 0 && metrics.speedValueDelta === 0) score += 20;
  if (!metrics.teraChanged) score += 6;
  score += Math.max(0, 16 - metrics.moveChanges * 6);
  score += Math.max(0, 14 - metrics.nonSpeedPointDelta * 4);
  return score;
}

export function compareConfigs(baseConfig, nextConfig) {
  const metrics = getComparisonMetrics(baseConfig, nextConfig);
  return {
    ...metrics,
    classification: classifyMetrics(metrics),
    score: scoreMetrics(metrics),
  };
}

export function findBestLibraryMatch(importedConfig, library = []) {
  const candidates = library.filter((config) => config.speciesId === importedConfig.speciesId);
  if (!candidates.length) {
    return null;
  }

  return candidates
    .map((config) => ({
      config,
      diff: compareConfigs(config, importedConfig),
    }))
    .sort((left, right) => right.diff.score - left.diff.score)[0];
}

export function createTeamEntry(config, options = {}) {
  return {
    ...config,
    id: options.id || `team:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    linkedConfigId: options.linkedConfigId || null,
    teamSource: options.teamSource || "team-only",
  };
}
