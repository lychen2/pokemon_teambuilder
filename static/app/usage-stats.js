import {CHAMPION_TOTAL_POINTS} from "./constants.js";
import {formatChampionPoints, normalizeName} from "./utils.js";

const STAT_KEYS = Object.freeze(["hp", "atk", "def", "spa", "spd", "spe"]);
const STAT_LABELS = Object.freeze({hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe"});
const DEFAULT_USAGE_SORT = "usage";
const USAGE_RECORD_LIMIT = 16;

export function isUsageAvailable(usageData = {}) {
  return usageData?.info?.status !== "unavailable" && Object.keys(usageData?.data || {}).length > 0;
}

export function getUsageRows(datasets, options = {}) {
  const rawData = getUsageData(datasets, options.source)?.data || {};
  const search = normalizeName(options.search || "");
  const sort = options.sort || DEFAULT_USAGE_SORT;
  return Object.entries(rawData)
    .map(([usageName, profile]) => buildUsageRow(datasets, usageName, profile, options.source))
    .filter((row) => rowMatchesSearch(row, search))
    .sort((left, right) => compareUsageRows(left, right, sort));
}

export function getUsageDetail(datasets, speciesId, options = {}) {
  const row = findUsageRow(datasets, speciesId, options);
  if (!row) {
    return null;
  }
  const profile = row.profile;
  return {
    ...row,
    spreads: getSpreadEntries(profile, row.sampleWeight),
    moves: getRecordEntries(profile?.Moves, {sampleWeight: row.sampleWeight, resolver: resolveMoveEntry, datasets}),
    items: getRecordEntries(profile?.Items, {sampleWeight: row.sampleWeight, resolver: resolveItemEntry, datasets}),
    abilities: getRecordEntries(profile?.Abilities, {sampleWeight: row.sampleWeight, resolver: resolveAbilityEntry, datasets}),
    natures: getRecordEntries(profile?.Natures, {sampleWeight: row.sampleWeight, datasets}),
    teammates: getRecordEntries(profile?.Teammates, {sampleWeight: row.sampleWeight, resolver: resolveSpeciesEntry, datasets}),
    counters: getRecordEntries(profile?.["Checks and Counters"], {sampleWeight: row.sampleWeight, resolver: resolveSpeciesEntry, datasets}),
  };
}

export function buildUsageConfigText(datasets, options = {}) {
  const detail = getUsageDetail(datasets, options.speciesId, {source: options.source});
  if (!detail) {
    return "";
  }
  const spread = detail.spreads[0] || defaultSpread();
  if (!spread.nature) {
    spread.nature = detail.natures?.[0]?.name || defaultSpread().nature;
  }
  const item = detail.items.find((entry) => entry.resolvedName)?.resolvedName || "";
  const ability = detail.abilities.find((entry) => entry.resolvedName)?.resolvedName || "";
  const moves = detail.moves.filter((entry) => entry.resolvedName).slice(0, 4);
  const lines = [item ? `${detail.speciesName} @ ${item}` : detail.speciesName];
  if (ability) {
    lines.push(`Ability: ${ability}`);
  }
  lines.push("Level: 50");
  lines.push(pointsLine(spread.points));
  lines.push(`${spread.nature} Nature`);
  moves.forEach((entry) => lines.push(`- ${entry.resolvedName}`));
  if (moves.length < 4) {
    lines.push(`Note: ${options.language === "zh" ? "Usage 数据招式不足" : "Usage data has fewer than four moves"}`);
  }
  return lines.join("\n");
}

export function formatUsageShare(value, digits = 1) {
  if (!Number.isFinite(Number(value))) {
    return "0%";
  }
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

export function getUsageData(datasets, _source = "smogon") {
  // Official usage data is disabled until a reliable upstream is found.
  // Always return Smogon data regardless of the requested source.
  return datasets?.usage;
}

function buildUsageRow(datasets, usageName, profile = {}, source = "smogon") {
  const speciesId = resolveSpeciesId(datasets, usageName);
  const species = datasets?.pokedex?.[speciesId] || {};
  const localizedName = datasets?.localizedSpeciesNames?.get(speciesId) || species.localizedName || species.name || usageName;
  const usage = Number(profile?.usage ?? profile?.usageRankScore ?? profile?.rankScore ?? 0);
  return {
    usageName,
    speciesId,
    speciesName: species.name || usageName,
    localizedName,
    spritePosition: getSpritePosition(datasets, speciesId, species),
    usage,
    rank: Number(profile?.rank || 0),
    source: source || "smogon",
    profile,
    sampleWeight: estimateSampleWeight(profile),
    isAvailable: Boolean(speciesId && datasets?.championsVgc?.usableSpeciesIds?.includes(speciesId)),
  };
}

function getSpritePosition(datasets, speciesId, species = {}) {
  const spriteIndex = datasets?.formsIndex?.[speciesId] ?? species.num ?? 0;
  return {
    x: (spriteIndex % 12) * 40,
    y: Math.floor(spriteIndex / 12) * 30,
  };
}

function resolveSpeciesId(datasets, usageName) {
  const candidates = [
    normalizeName(usageName),
    normalizeName(String(usageName || "").replace(/\*/g, "")),
    normalizeName(String(usageName || "").replace(/-/g, "")),
  ];
  for (const candidate of candidates) {
    const speciesId = datasets?.speciesIndex?.get(candidate);
    if (speciesId) {
      return speciesId;
    }
  }
  return "";
}

function rowMatchesSearch(row, search) {
  if (!search) {
    return true;
  }
  return [row.usageName, row.speciesName, row.localizedName, row.speciesId]
    .some((value) => normalizeName(value).includes(search));
}

function compareUsageRows(left, right, sort) {
  if (sort === "name") {
    return left.localizedName.localeCompare(right.localizedName, "zh-Hans-CN");
  }
  if (sort === "available") {
    return Number(right.isAvailable) - Number(left.isAvailable) || right.usage - left.usage;
  }
  return right.usage - left.usage || left.localizedName.localeCompare(right.localizedName, "zh-Hans-CN");
}

function findUsageRow(datasets, speciesId, options = {}) {
  const rows = getUsageRows(datasets, {source: options.source});
  return rows.find((row) => row.speciesId === speciesId)
    || rows.find((row) => normalizeName(row.usageName) === normalizeName(options.usageName))
    || rows[0]
    || null;
}

function getSpreadEntries(profile = {}, sampleWeight = 0) {
  // Official spread data path retired with usage-official disablement.
  // If the profile still carries a `usageOfficial.spreads` payload from a
  // legacy snapshot, ignore it — Smogon Spreads are the only active source.
  return recordPairs(profile?.Spreads)
    .map(([key, count]) => parseSpreadEntry(key, count, sampleWeight))
    .filter(Boolean)
    .slice(0, USAGE_RECORD_LIMIT);
}

function buildOfficialSpreadEntry(entry) {
  const points = Object.fromEntries(STAT_KEYS.map((stat) => [stat, Number(entry?.points?.[stat] || 0)]));
  return {
    label: STAT_KEYS.map((stat) => points[stat]).join("/"),
    nature: "",
    points,
    count: 0,
    share: Number(entry?.percent || 0) / 100,
    validTotal: pointTotal(points) === CHAMPION_TOTAL_POINTS,
    hasNature: false,
  };
}

function parseSpreadEntry(key, count, sampleWeight) {
  const match = String(key || "").match(/^([A-Za-z]+):(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)$/);
  if (!match) {
    return null;
  }
  const points = Object.fromEntries(STAT_KEYS.map((stat, index) => [stat, Number(match[index + 2] || 0)]));
  return {
    label: `${match[1]} ${STAT_KEYS.map((stat) => points[stat]).join("/")}`,
    nature: match[1],
    points,
    count: Number(count || 0),
    share: recordShare(count, sampleWeight),
    validTotal: pointTotal(points) === CHAMPION_TOTAL_POINTS,
    hasNature: true,
  };
}

function getRecordEntries(record, options = {}) {
  return recordPairs(record).slice(0, USAGE_RECORD_LIMIT).map(([name, count]) => {
    const resolved = options.resolver ? options.resolver(name, options.datasets) : null;
    return {
      name,
      resolvedName: resolved?.name || name,
      localizedName: resolved?.localizedName || resolved?.name || name,
      spritePosition: resolved?.spritePosition || null,
      speciesId: resolved?.speciesId || "",
      count: Number(count || 0),
      share: recordShare(count, options.sampleWeight),
      resolved: Boolean(resolved),
    };
  });
}

function recordPairs(record = {}) {
  return Object.entries(record || {})
    .filter((entry) => Number(entry[1] || 0) > 0)
    .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0));
}

function resolveMoveEntry(name, datasets) {
  return datasets?.moveLookup?.get(normalizeName(name)) || null;
}

function resolveItemEntry(name, datasets) {
  return datasets?.itemLookup?.get(normalizeName(name)) || null;
}

function resolveAbilityEntry(name, datasets) {
  return datasets?.abilityLookup?.get(normalizeName(name)) || null;
}

function resolveSpeciesEntry(name, datasets) {
  const speciesId = resolveSpeciesId(datasets, name);
  const species = datasets?.pokedex?.[speciesId];
  if (!species) {
    return null;
  }
  return {
    speciesId,
    name: species.name,
    localizedName: datasets?.localizedSpeciesNames?.get(speciesId) || species.localizedName || species.name,
    spritePosition: getSpritePosition(datasets, speciesId, species),
  };
}

function estimateSampleWeight(profile = {}) {
  const spreadTotal = sumRecord(profile?.Spreads);
  if (spreadTotal > 0) {
    return spreadTotal;
  }
  return Math.max(sumRecord(profile?.Items), sumRecord(profile?.Abilities), sumRecord(profile?.Natures), 1);
}

function sumRecord(record = {}) {
  return Object.values(record || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

function recordShare(count, sampleWeight) {
  const total = Number(sampleWeight || 0);
  return total > 0 ? Number(count || 0) / total : 0;
}

function pointTotal(points = {}) {
  return STAT_KEYS.reduce((sum, stat) => sum + Number(points[stat] || 0), 0);
}

function defaultSpread() {
  return {
    nature: "Hardy",
    points: {hp: 0, atk: 32, def: 0, spa: 32, spd: 0, spe: 2},
  };
}

function pointsLine(points = {}) {
  const parts = STAT_KEYS.map((stat) => `${Number(points[stat] || 0)} ${STAT_LABELS[stat]}`);
  return `Points: ${parts.join(" / ")}`;
}

export function formatUsagePoints(points, language) {
  return formatChampionPoints(points, language).replace(/^点数[:：]\s*/, "");
}
