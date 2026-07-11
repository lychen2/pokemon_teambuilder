import {
  CHAMPION_STAT_CAP,
  CHAMPION_TOTAL_POINTS,
  DEFAULT_CHAMPION_POINTS,
  NATURE_EFFECTS,
  NATURE_TRANSLATIONS,
  TYPE_LABELS,
} from "./constants.js";
import {t} from "./i18n.js";

export function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function json5ToJson(text) {
  return text.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3');
}

function parseJsonWithJson5Fallback(text, path) {
  try {
    return JSON.parse(text);
  } catch (error) {
    try {
      return JSON.parse(json5ToJson(text));
    } catch (fallbackError) {
      throw new Error(`Failed to parse: ${path}`);
    }
  }
}

const DESKTOP_DATA_CACHE_DATABASE = "poke-type-data-cache";
const DESKTOP_DATA_CACHE_STORE = "responses";
const DESKTOP_DATA_CACHE_VERSION_PATH = "./static/data-cache-version.json";
let desktopDataCachePromise = null;

function isDesktopRuntime() {
  return isBrowserRuntime() && window.__TAURI_INTERNALS__ !== undefined;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), {once: true});
    request.addEventListener("error", () => reject(request.error), {once: true});
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), {once: true});
    transaction.addEventListener("abort", () => reject(transaction.error), {once: true});
    transaction.addEventListener("error", () => reject(transaction.error), {once: true});
  });
}

async function openDesktopDataCache() {
  if (!("indexedDB" in window)) return null;
  const request = window.indexedDB.open(DESKTOP_DATA_CACHE_DATABASE, 1);
  request.addEventListener("upgradeneeded", () => {
    if (!request.result.objectStoreNames.contains(DESKTOP_DATA_CACHE_STORE)) {
      request.result.createObjectStore(DESKTOP_DATA_CACHE_STORE);
    }
  }, {once: true});
  return requestResult(request);
}

async function loadDesktopDataCache() {
  const [database, versionResponse] = await Promise.all([
    openDesktopDataCache(),
    fetch(DESKTOP_DATA_CACHE_VERSION_PATH),
  ]);
  if (!database || !versionResponse.ok) return null;
  const {version} = await versionResponse.json();
  if (!version) return null;
  const readTransaction = database.transaction(DESKTOP_DATA_CACHE_STORE, "readonly");
  const storedVersion = await requestResult(readTransaction.objectStore(DESKTOP_DATA_CACHE_STORE).get("__version__"));
  if (storedVersion !== version) {
    const writeTransaction = database.transaction(DESKTOP_DATA_CACHE_STORE, "readwrite");
    const store = writeTransaction.objectStore(DESKTOP_DATA_CACHE_STORE);
    store.clear();
    store.put(version, "__version__");
    await transactionComplete(writeTransaction);
  }
  return {database, version};
}

function getDesktopDataCache() {
  if (!isDesktopRuntime()) return Promise.resolve(null);
  if (!desktopDataCachePromise) {
    desktopDataCachePromise = loadDesktopDataCache().catch((error) => {
      console.warn("desktop data cache unavailable", error);
      return null;
    });
  }
  return desktopDataCachePromise;
}

async function readDesktopCachedJson(path) {
  try {
    const cache = await getDesktopDataCache();
    if (!cache) return null;
    const transaction = cache.database.transaction(DESKTOP_DATA_CACHE_STORE, "readonly");
    return await requestResult(transaction.objectStore(DESKTOP_DATA_CACHE_STORE).get(path));
  } catch (error) {
    console.warn("desktop data cache read failed", error);
    return null;
  }
}

async function writeDesktopCachedJson(path, value) {
  try {
    const cache = await getDesktopDataCache();
    if (!cache) return;
    const transaction = cache.database.transaction(DESKTOP_DATA_CACHE_STORE, "readwrite");
    transaction.objectStore(DESKTOP_DATA_CACHE_STORE).put(value, path);
    await transactionComplete(transaction);
  } catch (error) {
    console.warn("desktop data cache write failed", error);
  }
}

// Node has a global fetch (v18+), but it rejects relative URLs ("Invalid URL").
// Browser builds must use fetch for relative app assets; only Node/headless
// execution resolves relative paths through fs.
function isAbsoluteFetchUrl(path) {
  return /^[a-z][a-z0-9+.-]*:/i.test(String(path || ""));
}

function isBrowserRuntime() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

async function readJsonFromFile(path) {
  let fs, pathToFileURL, resolvePath;
  try {
    const fsModule = await import("node:fs/promises");
    const urlModule = await import("node:url");
    const pathModule = await import("node:path");
    fs = fsModule;
    pathToFileURL = urlModule.pathToFileURL;
    resolvePath = pathModule.resolve;
  } catch (error) {
    throw new Error(`Failed to load (no fs available): ${path}`);
  }
  const resolved = resolvePath(process.cwd(), path.replace(/^\.?\//, ""));
  const text = await fs.readFile(pathToFileURL(resolved), "utf8");
  return parseJsonWithJson5Fallback(text, path);
}

async function fetchJsonOverHttp(path) {
  const cached = await readDesktopCachedJson(path);
  if (cached !== null && cached !== undefined) {
    return cached;
  }
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load: ${path}`);
  }
  const text = await response.text();
  const parsed = parseJsonWithJson5Fallback(text, path);
  await writeDesktopCachedJson(path, parsed);
  return parsed;
}

export async function fetchJson(path) {
  if (isBrowserRuntime() || isAbsoluteFetchUrl(path)) {
    return fetchJsonOverHttp(path);
  }
  return readJsonFromFile(path);
}

export function normalizeName(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function normalizeLookupText(text) {
  return String(text || "").toLowerCase().replace(/[^\u4e00-\u9fffa-z0-9]+/g, "");
}
const UNSELECTABLE_BATTLE_SPECIES_NONSTANDARD = new Set(["CAP", "Custom", "LGPE", "Unobtainable"]);
const BATTLE_STAT_KEYS = Object.freeze(["hp", "atk", "def", "spa", "spd", "spe"]);


export function isMegaSpeciesEntry(entry = {}) {
  return String(entry?.forme || "").startsWith("Mega") || String(entry?.name || "").includes("-Mega");
}

export function isMegaConfig(config = {}) {
  const speciesId = normalizeName(config.speciesId);
  const speciesName = String(config.speciesName || "");
  return speciesId.includes("mega") || /(?:^|\b|-)\s*mega(?:\b|[-\s]|$)/i.test(speciesName);
}

export function countMegaConfigs(configs = []) {
  return configs.filter((config) => isMegaConfig(config)).length;
}

export function isAutoGeneratedNote(note) {
  return /^VGCPastes\s+PC[0-9A-Z]+/i.test(String(note || "").trim());
}

export function getDisplayNote(note) {
  return isAutoGeneratedNote(note) ? "" : (note || "");
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

export function getLocalizedNatureName(nature, language = "zh") {
  if (!nature || language !== "zh") {
    return nature || "";
  }
  return NATURE_TRANSLATIONS[nature] || nature;
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

export function compareSpeciesByDex(left = {}, right = {}) {
  const leftNum = Number(left.dexNumber ?? left.num ?? 0);
  const rightNum = Number(right.dexNumber ?? right.num ?? 0);
  if (leftNum !== rightNum) {
    return leftNum - rightNum;
  }
  return String(left.speciesName || left.name || "").localeCompare(
    String(right.speciesName || right.name || ""),
    "zh-Hans-CN",
  );
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

function getAbilitySet(entry = {}) {
  return Object.values(entry.abilities || {}).filter(Boolean).sort();
}

function hasSameStringArray(left = [], right = []) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasSameBaseStats(left = {}, right = {}) {
  return BATTLE_STAT_KEYS.every((stat) => Number(left[stat] || 0) === Number(right[stat] || 0));
}

function isBattleEquivalentForm(entry = {}, baseEntry = {}) {
  if (!entry.baseSpecies) return false;
  if (isMegaSpeciesEntry(entry)) return false;
  if (entry.requiredItem || entry.requiredMove || entry.battleOnly || entry.changesFrom) return false;
  return hasSameStringArray(entry.types || [], baseEntry.types || [])
    && hasSameBaseStats(entry.baseStats || {}, baseEntry.baseStats || {})
    && hasSameStringArray(getAbilitySet(entry), getAbilitySet(baseEntry));
}

export function isSelectableBattleSpecies(pokedex = {}, speciesId = "") {
  const normalizedSpeciesId = normalizeName(speciesId);
  const entry = pokedex?.[normalizedSpeciesId];
  if (!entry?.name || !entry?.baseStats) return false;
  if (UNSELECTABLE_BATTLE_SPECIES_NONSTANDARD.has(String(entry.isNonstandard || ""))) return false;
  if (entry.battleOnly && !isMegaSpeciesEntry(entry)) return false;

  const baseSpeciesId = normalizeName(entry.baseSpecies || "");
  const baseEntry = baseSpeciesId ? pokedex?.[baseSpeciesId] : null;
  return !baseEntry || !isBattleEquivalentForm(entry, baseEntry);
}

export function getBattleEquivalentSpeciesId(speciesId = "", datasets = null) {
  const normalizedSpeciesId = normalizeName(speciesId);
  if (!normalizedSpeciesId || !datasets?.pokedex?.[normalizedSpeciesId]) {
    return normalizedSpeciesId;
  }
  const entry = datasets.pokedex[normalizedSpeciesId];
  const baseSpeciesId = normalizeName(entry.baseSpecies || "");
  if (!baseSpeciesId || baseSpeciesId === normalizedSpeciesId) {
    return normalizedSpeciesId;
  }
  const baseEntry = datasets.pokedex?.[baseSpeciesId];
  if (!baseEntry || !isBattleEquivalentForm(entry, baseEntry)) {
    return normalizedSpeciesId;
  }
  return getBattleEquivalentSpeciesId(baseSpeciesId, datasets);
}

export function formatStatLine(stats = {}) {
  return `HP ${stats.hp || 0} / Atk ${stats.atk || 0} / Def ${stats.def || 0} / SpA ${stats.spa || 0} / SpD ${stats.spd || 0} / Spe ${stats.spe || 0}`;
}

export function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}
