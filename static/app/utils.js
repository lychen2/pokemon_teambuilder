import {
  CHAMPION_STAT_CAP,
  CHAMPION_TOTAL_POINTS,
  DEFAULT_CHAMPION_POINTS,
  NATURE_EFFECTS,
  TYPE_LABELS,
} from "./constants.js";
import {t} from "./i18n.js";

function json5ToJson(text) {
  return text.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3');
}

export async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load: ${path}`);
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    return JSON.parse(json5ToJson(text));
  }
}

export function normalizeName(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function sumValues(record = {}) {
  return Object.values(record).reduce((total, value) => total + (Number(value) || 0), 0);
}

export function topEntries(record = {}, limit = 1) {
  return Object.entries(record)
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, limit);
}

export function getNatureMultiplier(nature, stat) {
  const effect = NATURE_EFFECTS[nature];
  if (!effect) {
    return 1;
  }
  if (effect.plus === stat) {
    return 1.1;
  }
  if (effect.minus === stat) {
    return 0.9;
  }
  return 1;
}

export function getNatureSummary(nature, language = "zh") {
  const effect = NATURE_EFFECTS[nature];
  if (!effect) {
    return t(language, "nature.none");
  }
  const statLabels = {
    atk: t(language, "nature.atk"),
    def: t(language, "nature.def"),
    spa: t(language, "nature.spa"),
    spd: t(language, "nature.spd"),
    spe: t(language, "nature.spe"),
  };
  return t(language, "nature.summary", {
    plus: statLabels[effect.plus],
    minus: statLabels[effect.minus],
  });
}

export function createEmptySpread() {
  return {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
}

const CHAMPION_STATS = ["hp", "atk", "def", "spa", "spd", "spe"];

function sanitizeChampionPoints(points = {}) {
  return Object.fromEntries(
    CHAMPION_STATS.map((stat) => [stat, clamp(Math.floor(Number(points[stat] || 0)), 0, CHAMPION_STAT_CAP)]),
  );
}

function convertLargeValueSetToChampionPoints(values = {}) {
  return Object.fromEntries(
    CHAMPION_STATS.map((stat) => {
      const value = Math.max(Number(values[stat] || 0), 0);
      return [stat, clamp(Math.floor((value + 4) / 8), 0, CHAMPION_STAT_CAP)];
    }),
  );
}

export function defaultChampionPoints() {
  return {...DEFAULT_CHAMPION_POINTS};
}

export function convertEvsToChampionPoints(evs = {}) {
  return convertLargeValueSetToChampionPoints(evs);
}

export function normalizeChampionPoints(points = {}) {
  const raw = Object.fromEntries(
    CHAMPION_STATS.map((stat) => [stat, Math.max(Math.floor(Number(points[stat] || 0)), 0)]),
  );
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
  if (!total) {
    return defaultChampionPoints();
  }
  if (total === 508 || total === 510 || total > CHAMPION_TOTAL_POINTS) {
    return convertLargeValueSetToChampionPoints(raw);
  }
  return sanitizeChampionPoints(raw);
}

export function calculateChampionStats(baseStats, points = {}) {
  const hpPoints = Number(points.hp || 0);
  const stats = {
    hp: Number(baseStats.hp || 0) + 75 + hpPoints,
  };
  for (const stat of ["atk", "def", "spa", "spd", "spe"]) {
    stats[stat] = Number(baseStats[stat] || 0) + 20 + Number(points[stat] || 0);
  }
  return stats;
}

export function applyNatureToChampionStats(stats = {}, nature) {
  const result = {...stats};
  for (const stat of ["atk", "def", "spa", "spd", "spe"]) {
    result[stat] = Math.floor((Number(stats[stat] || 0)) * getNatureMultiplier(nature, stat));
  }
  return result;
}

export function getChampionPointTotal(points = {}) {
  return Object.values(points).reduce((sum, value) => sum + Number(value || 0), 0);
}

export function formatPercent(value, digits = 1) {
  if (!Number.isFinite(Number(value))) {
    return "0%";
  }
  return `${Number(value).toFixed(digits)}%`;
}

export function formatSpread(nature, evs) {
  const values = [evs.hp, evs.atk, evs.def, evs.spa, evs.spd, evs.spe];
  return `${nature || "Hardy"} ${values.join("/")}`;
}

export function formatChampionPoints(points = {}, language = "zh") {
  return t(language, "points.label", {
    value: [points.hp, points.atk, points.def, points.spa, points.spd, points.spe]
      .map((value) => Number(value || 0))
      .join("/"),
  });
}

export function formatConfigName(name, note = "") {
  const baseName = name || "未知";
  const cleanNote = String(note || "").trim();
  if (!cleanNote) {
    return baseName;
  }
  return `${baseName}（${cleanNote}）`;
}

export function getTypeLabel(type, language = "zh") {
  if (language === "en") {
    return type || t(language, "common.unknown");
  }
  return TYPE_LABELS[type] || type || t(language, "common.unknown");
}

export function getMoveCategoryLabel(category, language = "zh") {
  return t(language, `category.${category || "Status"}`);
}

export function englishTypeToChinese(type, language = "zh") {
  return getTypeLabel(type, language);
}

export function getSpritePosition(index) {
  const row = Math.floor(index / 12);
  const col = index % 12;
  return {x: col * 40, y: row * 30};
}

export function getItemSpritePosition(index) {
  const row = Math.floor(index / 16);
  const col = index % 16;
  return {x: col * 24, y: row * 24};
}

export function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

export function formatStatLine(stats = {}) {
  return `HP ${stats.hp || 0} / Atk ${stats.atk || 0} / Def ${stats.def || 0} / SpA ${stats.spa || 0} / SpD ${stats.spd || 0} / Spe ${stats.spe || 0}`;
}
