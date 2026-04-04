import {FALLBACK_LEVEL} from "./constants.js";
import {t} from "./i18n.js";
import {getChoiceScarfSpeedData, getPlusOneSpeedData} from "./speed.js";
import {
  applyNatureToChampionStats,
  calculateChampionStats,
  createEmptySpread,
  defaultChampionPoints,
  formatChampionPoints,
  formatConfigName,
  formatSpread,
  getChampionPointTotal,
  getNatureSummary,
  normalizeChampionPoints,
  getSpritePosition,
  normalizeName,
} from "./utils.js";

const STAT_MAP = {HP: "hp", Atk: "atk", Def: "def", SpA: "spa", SpD: "spd", Spe: "spe"};
const EV_STAT_ORDER = ["hp", "atk", "def", "spa", "spd", "spe"];
const EV_LABELS = {hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe"};
const EV_TRIM_PRIORITY = ["hp", "def", "spd"];
const SHOWDOWN_TOTAL_EV_CAP = 508;
const SHOWDOWN_STAT_EV_CAP = 252;

function parseStatLine(line, prefix) {
  const values = createEmptySpread();
  const raw = line.slice(prefix.length).split("/");
  for (const part of raw) {
    const match = part.trim().match(/^(\d+)\s+([A-Za-z]+)$/);
    if (!match) {
      continue;
    }
    const stat = STAT_MAP[match[2]];
    if (stat) {
      values[stat] = Number(match[1]);
    }
  }
  return values;
}

function extractSpeciesName(firstLine) {
  const [left] = firstLine.split(" @ ");
  const noGender = left.replace(/\s+\((M|F)\)$/, "").trim();
  const nicknameMatch = noGender.match(/^(.+?)\s+\((.+)\)$/);
  return (nicknameMatch ? nicknameMatch[2] : noGender).trim();
}

function buildMoveSet(moveNames, moveLookup) {
  return moveNames.map((name) => {
    const detail = moveLookup.get(normalizeName(name));
    if (!detail) {
      return {
        name,
        type: "",
        category: "Status",
        shortDesc: "",
        boosts: null,
        self: null,
        selfBoost: null,
        secondary: null,
      };
    }
    return {
      name: detail.name,
      type: detail.type,
      category: detail.category || "Status",
      shortDesc: detail.shortDesc || "",
      boosts: detail.boosts || null,
      self: detail.self || null,
      selfBoost: detail.selfBoost || null,
      secondary: detail.secondary || null,
    };
  });
}

function getLookupEntry(lookup, name) {
  return lookup.get(normalizeName(name)) || null;
}

function isMegaEntry(entry) {
  return String(entry?.forme || "").startsWith("Mega") || String(entry?.name || "").includes("-Mega");
}

function resolveSpecies(config, context) {
  const speciesId = config.speciesId
    || context.speciesIndex.get(normalizeName(config.speciesName))
    || context.speciesIndex.get(normalizeName(config.displayName));
  if (!speciesId) {
    return null;
  }
  const entry = context.pokedex[speciesId];
  if (!entry) {
    return null;
  }
  return {speciesId, entry};
}

function buildPersistedMoveNames(config) {
  if (Array.isArray(config.moveNames) && config.moveNames.length) {
    return config.moveNames;
  }
  if (!Array.isArray(config.moves)) {
    return [];
  }
  return config.moves.map((move) => move.name).filter(Boolean);
}

function applySelectedPoint(points, stat, language) {
  if (!stat || Number(points[stat] || 0) >= 32) {
    throw new Error(t(language, "error.invalidPointTarget"));
  }
  return {
    ...points,
    [stat]: Number(points[stat] || 0) + 1,
  };
}

function resolveChampionPoints(config, resolveConvertedPoint, language) {
  const rawPoints = {...createEmptySpread(), ...(config.championPoints || {})};
  if (getChampionPointTotal(rawPoints)) {
    return normalizeChampionPoints(rawPoints);
  }

  const evs = {...createEmptySpread(), ...(config.evs || {})};
  const evTotal = getChampionPointTotal(evs);
  if (!evTotal) {
    return defaultChampionPoints();
  }

  const normalized = normalizeChampionPoints(evs);
  const needsPrompt = (evTotal === 508 || evTotal === 510 || evTotal > 66)
    && getChampionPointTotal(normalized) === 65;
  if (!needsPrompt) {
    return normalized;
  }

  if (!resolveConvertedPoint) {
    throw new Error(t(language, "error.missingResolvePoint", {
      name: config.displayName || config.speciesName || t(language, "common.unknown"),
    }));
  }

  const selectedStat = resolveConvertedPoint({
    displayName: config.displayName || config.speciesName || t(language, "common.unknown"),
    points: normalized,
  });
  return applySelectedPoint(normalized, selectedStat, language);
}

function finalizeConfig(config, context, fallbackLevel, resolveConvertedPoint, language = "zh") {
  const species = resolveSpecies(config, context);
  if (!species) {
    return null;
  }

  const {speciesId, entry} = species;
  const moveNames = buildPersistedMoveNames(config);
  const championPoints = resolveChampionPoints(config, resolveConvertedPoint, language);
  const evs = getChampionPointTotal(config.evs || {})
    ? {...createEmptySpread(), ...(config.evs || {})}
    : createEvsFromPoints(championPoints);
  const spriteIndex = context.formsIndex[speciesId] ?? entry.num ?? 0;
  const moves = buildMoveSet(moveNames, context.moveLookup);
  const nature = config.nature || "Hardy";
  const teraType = isMegaEntry(entry) ? "" : config.teraType || "";
  const stats = applyNatureToChampionStats(
    calculateChampionStats(entry.baseStats, championPoints),
    nature,
  );
  const plusOneSpeed = getPlusOneSpeedData({
    ability: config.ability || "",
    moves,
    stats,
  });
  const choiceScarfSpeed = getChoiceScarfSpeedData({
    item: config.item || "",
    stats,
  });

  return {
    ...config,
    speciesId,
    speciesName: entry.name,
    displayName: config.displayName || entry.name,
    displayLabel: formatConfigName(config.displayName || entry.name, config.note || ""),
    speciesLabel: formatConfigName(entry.name, config.note || ""),
    note: String(config.note || "").trim(),
    types: entry.types || [],
    ability: config.ability || "",
    item: config.item || "",
    teraType,
    nature,
    level: Number(config.level) || fallbackLevel || FALLBACK_LEVEL,
    evs,
    championPoints,
    moveNames,
    baseStats: entry.baseStats,
    spritePosition: getSpritePosition(spriteIndex),
    moves,
    abilityInfo: getLookupEntry(context.abilityLookup, config.ability),
    itemInfo: getLookupEntry(context.itemLookup, config.item),
    natureInfo: getNatureSummary(nature),
    offensiveTypes: [...new Set(moves.filter((move) => move.category !== "Status").map((move) => move.type))],
    stats,
    choiceScarfSpeed,
    plusOneSpeed,
    spreadLabel: formatChampionPoints(championPoints),
    originalSpreadLabel: formatSpread(nature, evs),
  };
}

function createCustomConfig(block, index, context, fallbackLevel, resolveConvertedPoint, language) {
  const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) {
    return null;
  }

  const speciesLabel = extractSpeciesName(lines[0]);
  const speciesId = context.speciesIndex.get(normalizeName(speciesLabel));
  if (!speciesId) {
    return null;
  }

  const entry = context.pokedex[speciesId];
  const [firstLine, item = ""] = lines[0].split(" @ ");
  const config = {
    id: `custom:${speciesId}:${index}`,
    source: "custom",
    speciesId,
    speciesName: entry.name,
    displayName: firstLine.split(" @ ")[0].trim(),
    types: entry.types || [],
    ability: "",
    item: item.trim(),
    teraType: "",
    nature: "Hardy",
    note: "",
    level: fallbackLevel || FALLBACK_LEVEL,
    evs: createEmptySpread(),
    championPoints: createEmptySpread(),
    moveNames: [],
    teammates: {},
    usage: 0,
    baseStats: entry.baseStats,
  };

  for (const line of lines.slice(1)) {
    if (line.startsWith("Ability: ")) config.ability = line.slice(9).trim();
    if (line.startsWith("Level: ")) config.level = Number(line.slice(7).trim()) || config.level;
    if (line.startsWith("Tera Type: ")) config.teraType = line.slice(11).trim();
    if (line.startsWith("EVs: ")) config.evs = parseStatLine(line, "EVs: ");
    if (line.startsWith("Points: ")) config.championPoints = parseStatLine(line, "Points: ");
    if (line.startsWith("Note: ")) config.note = line.slice(6).trim();
    if (line.startsWith("备注: ")) config.note = line.slice(3).trim();
    if (line.endsWith(" Nature")) config.nature = line.replace(" Nature", "").trim();
    if (line.startsWith("- ")) config.moveNames.push(line.slice(2).trim());
  }

  return finalizeConfig(config, context, fallbackLevel, resolveConvertedPoint, language);
}

export function parseShowdownLibrary(text, context, options = {}) {
  const fallbackLevel = options.fallbackLevel || FALLBACK_LEVEL;
  const language = options.language || "zh";
  const blocks = text.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  const configs = [];
  const errors = [];

  blocks.forEach((block, index) => {
    const parsed = createCustomConfig(block, index, context, fallbackLevel, options.resolveConvertedPoint, language);
    if (!parsed) {
      errors.push(t(language, "error.invalidBlock", {index: index + 1}));
      return;
    }
    configs.push(parsed);
  });

  return {configs, errors};
}

export function hydrateConfigs(configs = [], context, fallbackLevel) {
  return configs
    .map((config) => finalizeConfig(config, context, fallbackLevel))
    .filter(Boolean);
}

export function exportConfigToEditableText(config) {
  return exportConfigsToShowdown([config], "points");
}

function buildPointsLine(points = {}) {
  return `Points: ${points.hp || 0} HP / ${points.atk || 0} Atk / ${points.def || 0} Def / ${points.spa || 0} SpA / ${points.spd || 0} SpD / ${points.spe || 0} Spe`;
}

function trimPointsForEvCap(points = {}) {
  const trimmed = {...createEmptySpread(), ...points};
  let total = getChampionPointTotal(trimmed) * 8;
  while (total > 510) {
    const target = EV_TRIM_PRIORITY.find((stat) => Number(trimmed[stat] || 0) > 0);
    if (!target) {
      break;
    }
    trimmed[target] -= 1;
    total -= 8;
  }
  return trimmed;
}

function createEvsFromPoints(points = {}) {
  const trimmedPoints = trimPointsForEvCap(points);
  return Object.fromEntries(
    EV_STAT_ORDER.map((stat) => [stat, Number(trimmedPoints[stat] || 0) > 0 ? Number(trimmedPoints[stat] || 0) * 8 : 0]),
  );
}

function resolveExportEvs(config) {
  if (getChampionPointTotal(config.evs || {})) {
    return {...createEmptySpread(), ...(config.evs || {})};
  }
  return createEvsFromPoints(config.championPoints);
}

function buildEvsLine(evs = {}) {
  let total = Object.values(evs).reduce((sum, value) => sum + value, 0);
  while (total > 510) {
    const target = EV_TRIM_PRIORITY.find((stat) => evs[stat] >= 8)
      || EV_STAT_ORDER.find((stat) => evs[stat] >= 4);
    if (!target) {
      break;
    }
    const step = evs[target] >= 8 ? 8 : 4;
    evs[target] -= step;
    total -= step;
  }
  return EV_STAT_ORDER
    .filter((stat) => evs[stat] > 0)
    .map((stat) => `${evs[stat]} ${EV_LABELS[stat]}`)
    .join(" / ");
}

function exportConfigsToShowdown(configs = [], mode = "points") {
  return configs.map((config) => {
    const lines = [];
    const header = config.item ? `${config.displayName} @ ${config.item}` : config.displayName;
    lines.push(header);
    if (config.ability) lines.push(`Ability: ${config.ability}`);
    if (config.level) lines.push(`Level: ${config.level}`);
    if (config.teraType) lines.push(`Tera Type: ${config.teraType}`);
    if (config.note) lines.push(`Note: ${config.note}`);
    if (mode === "evs") {
      const evLine = buildEvsLine(resolveExportEvs(config));
      if (evLine) {
        lines.push(`EVs: ${evLine}`);
      }
    } else if (mode === "both") {
      const evLine = buildEvsLine(resolveExportEvs(config));
      if (evLine) {
        lines.push(`EVs: ${evLine}`);
      }
      lines.push(buildPointsLine(config.championPoints));
    } else {
      lines.push(buildPointsLine(config.championPoints));
    }
    if (config.nature) lines.push(`${config.nature} Nature`);
    for (const move of config.moveNames || []) {
      lines.push(`- ${move}`);
    }
    return lines.join("\n");
  }).join("\n\n");
}

export function exportLibraryToShowdown(configs = []) {
  return exportConfigsToShowdown(configs, "both");
}

export function exportTeamToShowdown(configs = []) {
  return exportConfigsToShowdown(configs, "evs");
}
