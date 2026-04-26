import {FALLBACK_LEVEL} from "./constants.js";
import {t} from "./i18n.js";
import {getLearnsetMap} from "./learnsets.js";
import {getChoiceScarfSpeedData, getDoubleSpeedData, getPlusOneSpeedData} from "./speed.js";
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
  normalizeLookupText,
  normalizeName,
} from "./utils.js";

const STAT_MAP = {HP: "hp", Atk: "atk", Def: "def", SpA: "spa", SpD: "spd", Spe: "spe"};
const EV_STAT_ORDER = ["hp", "atk", "def", "spa", "spd", "spe"];
const EV_LABELS = {hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe"};
const EV_TRIM_PRIORITY = ["hp", "def", "spd"];
const SHOWDOWN_TOTAL_EV_CAP = 508;
const SHOWDOWN_STAT_EV_CAP = 252;
const IMPORT_IGNORED_PREFIXES = new Set(["ivs", "happiness", "shiny"]);
const IMPORT_FEEDBACK_ERROR = "error";
const IMPORT_FEEDBACK_WARNING = "warning";

function createImportFeedbackItem({
  level = IMPORT_FEEDBACK_WARNING,
  code = "",
  blockIndex = 0,
  lineNumber = null,
  speciesId = "",
  configName = "",
  message = "",
} = {}) {
  return {
    level,
    code,
    blockIndex: Number(blockIndex) || 0,
    lineNumber: Number.isInteger(lineNumber) ? lineNumber : null,
    speciesId: speciesId || "",
    configName: configName || "",
    message: String(message || ""),
  };
}

function normalizeValidation(validation) {
  const items = Array.isArray(validation?.items) ? validation.items.filter(Boolean) : [];
  return {
    hasWarnings: items.some((item) => item.level === IMPORT_FEEDBACK_WARNING),
    hasErrors: items.some((item) => item.level === IMPORT_FEEDBACK_ERROR),
    items,
  };
}

function attachValidation(config, items) {
  return {
    ...config,
    validation: normalizeValidation({items}),
  };
}

function getLookupKeys(value) {
  return [normalizeLookupText(value), normalizeName(value)].filter(Boolean);
}

function getLookupEntry(lookup, searchLookup, name) {
  return getLookupKeys(name).reduce((found, key) => {
    if (found) {
      return found;
    }
    return searchLookup?.get(key) || lookup?.get(key) || null;
  }, null);
}

function resolveSpeciesId(context, name) {
  return getLookupKeys(name).reduce((found, key) => found || context.speciesIndex.get(key) || "", "");
}

function normalizeImportText(text) {
  return String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .replace(/\t/g, "  ");
}

function normalizeImportLine(line) {
  return String(line || "").trim();
}

function getPrefixedValue(line, label) {
  const match = String(line || "").match(new RegExp(`^${label}:\\s*(.*)$`));
  return match ? match[1].trim() : null;
}

function parseStatLine(line, prefix) {
  const values = createEmptySpread();
  const raw = line.slice(prefix.length).split("/");
  let parsed = false;
  for (const part of raw) {
    const match = part.trim().match(/^\s*(\d+)\s*([A-Za-z]+)\s*$/);
    if (!match) {
      continue;
    }
    const stat = STAT_MAP[match[2]];
    if (stat) {
      values[stat] = Number(match[1]);
      parsed = true;
    }
  }
  return {values, parsed};
}

function extractSpeciesName(firstLine) {
  const [left] = firstLine.split(/\s*@\s*/);
  const noGender = left.replace(/\s+\((M|F)\)$/, "").trim();
  const nicknameMatch = noGender.match(/^(.+?)\s+\((.+)\)$/);
  return (nicknameMatch ? nicknameMatch[2] : noGender).trim();
}

function buildMoveSet(moveNames, moveLookup, moveSearchLookup) {
  return moveNames.map((name) => {
    const detail = getLookupEntry(moveLookup, moveSearchLookup, name);
    if (!detail) {
      return {
        id: normalizeName(name),
        name,
        type: "",
        category: "Status",
        accuracy: 0,
        basePower: 0,
        priority: 0,
        target: "",
        shortDesc: "",
        flags: {},
        boosts: null,
        self: null,
        selfBoost: null,
        secondary: null,
        recoil: null,
        mindBlownRecoil: false,
      };
    }
    return {
      id: normalizeName(detail.id || detail.name || name),
      name: detail.name,
      type: detail.type,
      category: detail.category || "Status",
      accuracy: detail.accuracy ?? 0,
      basePower: Number(detail.basePower || 0),
      priority: Number(detail.priority || 0),
      target: detail.target || "",
      shortDesc: detail.shortDesc || "",
      flags: detail.flags || {},
      boosts: detail.boosts || null,
      self: detail.self || null,
      selfBoost: detail.selfBoost || null,
      secondary: detail.secondary || null,
      recoil: detail.recoil || null,
      mindBlownRecoil: Boolean(detail.mindBlownRecoil),
    };
  });
}

function sanitizeOptionalText(value) {
  const text = String(value || "").trim();
  const lowered = text.toLowerCase();
  if (!text || lowered === "undefined" || lowered === "undifine" || lowered === "null") {
    return "";
  }
  return text;
}

function isMegaEntry(entry) {
  return String(entry?.forme || "").startsWith("Mega") || String(entry?.name || "").includes("-Mega");
}

function resolveSpecies(config, context) {
  const speciesId = config.speciesId
    || resolveSpeciesId(context, config.speciesName)
    || resolveSpeciesId(context, config.displayName);
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

function canonicalizeNamedValue(value, lookup, searchLookup) {
  const clean = sanitizeOptionalText(value);
  if (!clean) {
    return "";
  }
  return getLookupEntry(lookup, searchLookup, clean)?.name || clean;
}

function canonicalizeMoveNames(moveNames = [], context) {
  return moveNames.map((name) => {
    return getLookupEntry(context.moveLookup, context.moveSearchLookup, name)?.name || String(name || "").trim();
  }).filter(Boolean);
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
  const moveNames = canonicalizeMoveNames(buildPersistedMoveNames(config), context);
  const championPoints = resolveChampionPoints(config, resolveConvertedPoint, language);
  const note = sanitizeOptionalText(config.note);
  const ability = canonicalizeNamedValue(config.ability, context.abilityLookup, context.abilitySearchLookup);
  const item = canonicalizeNamedValue(config.item, context.itemLookup, context.itemSearchLookup);
  const evs = getChampionPointTotal(config.evs || {})
    ? {...createEmptySpread(), ...(config.evs || {})}
    : createEvsFromPoints(championPoints);
  const spriteIndex = context.formsIndex[speciesId] ?? entry.num ?? 0;
  const moves = buildMoveSet(moveNames, context.moveLookup, context.moveSearchLookup);
  const nature = config.nature || "Hardy";
  const teraType = isMegaEntry(entry) ? "" : config.teraType || "";
  const stats = applyNatureToChampionStats(
    calculateChampionStats(entry.baseStats, championPoints),
    nature,
  );
  const plusOneSpeed = getPlusOneSpeedData({
    ability,
    moves,
    stats,
  });
  const choiceScarfSpeed = getChoiceScarfSpeedData({
    item,
    stats,
  });
  const doubleSpeed = getDoubleSpeedData({
    ability,
    stats,
  });

  return {
    ...config,
    speciesId,
    speciesName: entry.name,
    displayName: config.displayName || entry.name,
    displayLabel: formatConfigName(config.displayName || entry.name, note),
    speciesLabel: formatConfigName(entry.name, note),
    note,
    types: entry.types || [],
    abilities: entry.abilities || {},
    ability,
    item,
    teraType,
    nature,
    level: Number(config.level) || fallbackLevel || FALLBACK_LEVEL,
    evs,
    championPoints,
    moveNames,
    baseStats: entry.baseStats,
    spritePosition: getSpritePosition(spriteIndex),
    moves,
    abilityInfo: getLookupEntry(context.abilityLookup, context.abilitySearchLookup, ability),
    itemInfo: getLookupEntry(context.itemLookup, context.itemSearchLookup, item),
    natureInfo: getNatureSummary(nature),
    offensiveTypes: [...new Set(moves.filter((move) => move.category !== "Status").map((move) => move.type))],
    stats,
    choiceScarfSpeed,
    plusOneSpeed,
    doubleSpeed,
    spreadLabel: formatChampionPoints(championPoints),
    originalSpreadLabel: formatSpread(nature, evs),
    validation: normalizeValidation(config.validation),
  };
}

function getValidationBlockIndex(config = {}) {
  const existingItems = Array.isArray(config.validation?.items) ? config.validation.items : [];
  const blockIndex = Number(existingItems[0]?.blockIndex || 0);
  return blockIndex > 0 ? blockIndex : 1;
}

function refreshConfigValidation(config, context, language = "zh") {
  const finalized = finalizeConfig(config, context, config.level, null, language);
  if (!finalized) {
    return null;
  }
  const validationItems = validateImportedConfig(
    finalized,
    context,
    getValidationBlockIndex(config),
    language,
    {},
  );
  return attachValidation(finalized, validationItems);
}

function validateImportedConfig(config, context, index, language, lineMeta = {}) {
  const feedback = [];
  const speciesEntry = context.pokedex?.[config.speciesId];
  const legalAbilities = new Set(Object.values(speciesEntry?.abilities || {}).filter(Boolean));
  if (config.item && !getLookupEntry(context.itemLookup, context.itemSearchLookup, config.item)) {
    feedback.push(createImportFeedbackItem({
      level: IMPORT_FEEDBACK_WARNING,
      code: "unknown-item",
      blockIndex: index,
      lineNumber: lineMeta.item ?? null,
      speciesId: config.speciesId,
      configName: config.displayName || config.speciesName,
      message: t(language, "import.warning.unknownItem", {
        index,
        name: config.displayName || config.speciesName,
        value: config.item,
      }),
    }));
  }
  if (config.ability && !legalAbilities.has(config.ability)) {
    feedback.push(createImportFeedbackItem({
      level: IMPORT_FEEDBACK_WARNING,
      code: "illegal-ability",
      blockIndex: index,
      lineNumber: lineMeta.ability ?? null,
      speciesId: config.speciesId,
      configName: config.displayName || config.speciesName,
      message: t(language, "import.warning.illegalAbility", {
        index,
        name: config.displayName || config.speciesName,
        value: config.ability,
      }),
    }));
  }
  const learnset = getLearnsetMap(config.speciesId, context, {itemName: config.item});
  (config.moveNames || []).forEach((moveName) => {
    const move = getLookupEntry(context.moveLookup, context.moveSearchLookup, moveName);
    const moveLine = lineMeta.moves?.get(normalizeName(moveName)) ?? null;
    if (!move) {
      feedback.push(createImportFeedbackItem({
        level: IMPORT_FEEDBACK_WARNING,
        code: "unknown-move",
        blockIndex: index,
        lineNumber: moveLine,
        speciesId: config.speciesId,
        configName: config.displayName || config.speciesName,
        message: t(language, "import.warning.unknownMove", {
          index,
          name: config.displayName || config.speciesName,
          value: moveName,
        }),
      }));
      return;
    }
    if (learnset && !learnset[normalizeName(move.name)]) {
      feedback.push(createImportFeedbackItem({
        level: IMPORT_FEEDBACK_WARNING,
        code: "illegal-move",
        blockIndex: index,
        lineNumber: moveLine,
        speciesId: config.speciesId,
        configName: config.displayName || config.speciesName,
        message: t(language, "import.warning.illegalMove", {
          index,
          name: config.displayName || config.speciesName,
          value: move.name,
        }),
      }));
    }
  });
  return feedback;
}

function createCustomConfig(block, index, context, fallbackLevel, resolveConvertedPoint, language) {
  const lines = normalizeImportText(block)
    .split("\n")
    .map((line, lineIndex) => ({value: normalizeImportLine(line), lineIndex: lineIndex + 1}))
    .filter((entry) => entry.value);
  if (!lines.length) {
    return {config: null, feedback: []};
  }

  const headerLine = lines[0].value;
  const speciesLabel = extractSpeciesName(headerLine);
  const speciesId = resolveSpeciesId(context, speciesLabel);
  if (!speciesId) {
    return {
      config: null,
      feedback: [createImportFeedbackItem({
        level: IMPORT_FEEDBACK_ERROR,
        code: "invalid-block-header",
        blockIndex: index + 1,
        lineNumber: 1,
        configName: speciesLabel || headerLine,
        message: t(language, "error.invalidBlockHeader", {
          index: index + 1,
          value: speciesLabel || headerLine,
        }),
      })],
    };
  }

  const entry = context.pokedex[speciesId];
  const [firstLine, item = ""] = headerLine.split(/\s*@\s*/);
  const lineMeta = {
    item: item.trim() ? 1 : null,
    ability: null,
    moves: new Map(),
  };
  const config = {
    id: `custom:${speciesId}:${index}`,
    source: "custom",
    speciesId,
    speciesName: entry.name,
    displayName: firstLine.trim(),
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
  const feedback = [];

  for (const line of lines.slice(1)) {
    const abilityValue = getPrefixedValue(line.value, "Ability");
    if (abilityValue != null) {
      config.ability = abilityValue;
      lineMeta.ability = line.lineIndex;
      continue;
    }
    const levelValue = getPrefixedValue(line.value, "Level");
    if (levelValue != null) {
      config.level = Number(levelValue) || config.level;
      continue;
    }
    const teraValue = getPrefixedValue(line.value, "Tera Type");
    if (teraValue != null) {
      config.teraType = teraValue;
      continue;
    }
    if (getPrefixedValue(line.value, "EVs") != null) {
      const parsed = parseStatLine(line.value, "EVs:");
      config.evs = parsed.values;
      if (!parsed.parsed) {
        feedback.push(createImportFeedbackItem({
          level: IMPORT_FEEDBACK_WARNING,
          code: "invalid-stat-line",
          blockIndex: index + 1,
          lineNumber: line.lineIndex,
          speciesId,
          configName: config.displayName || config.speciesName,
          message: t(language, "import.warning.invalidStatLine", {
            index: index + 1,
            line: line.lineIndex,
            value: line.value,
          }),
        }));
      }
      continue;
    }
    if (getPrefixedValue(line.value, "Points") != null) {
      const parsed = parseStatLine(line.value, "Points:");
      config.championPoints = parsed.values;
      if (!parsed.parsed) {
        feedback.push(createImportFeedbackItem({
          level: IMPORT_FEEDBACK_WARNING,
          code: "invalid-points-line",
          blockIndex: index + 1,
          lineNumber: line.lineIndex,
          speciesId,
          configName: config.displayName || config.speciesName,
          message: t(language, "import.warning.invalidStatLine", {
            index: index + 1,
            line: line.lineIndex,
            value: line.value,
          }),
        }));
      }
      continue;
    }
    const noteValue = getPrefixedValue(line.value, "Note");
    if (noteValue != null) {
      config.note = noteValue;
      continue;
    }
    const localizedNoteValue = getPrefixedValue(line.value, "备注");
    if (localizedNoteValue != null) {
      config.note = localizedNoteValue;
      continue;
    }
    if (line.value.endsWith(" Nature")) {
      config.nature = line.value.replace(" Nature", "").trim();
      continue;
    }
    if (line.value.startsWith("- ")) {
      const moveName = line.value.slice(2).trim();
      config.moveNames.push(moveName);
      lineMeta.moves.set(normalizeName(moveName), line.lineIndex);
      continue;
    }
    const prefix = line.value.includes(":") ? normalizeName(line.value.split(":")[0]) : "";
    if (IMPORT_IGNORED_PREFIXES.has(prefix)) {
      continue;
    }
    feedback.push(createImportFeedbackItem({
      level: IMPORT_FEEDBACK_WARNING,
      code: "unparsed-line",
      blockIndex: index + 1,
      lineNumber: line.lineIndex,
      speciesId,
      configName: config.displayName || config.speciesName,
      message: t(language, "import.warning.unparsedLine", {
        index: index + 1,
        line: line.lineIndex,
        value: line.value,
      }),
    }));
  }

  const finalized = finalizeConfig(config, context, fallbackLevel, resolveConvertedPoint, language);
  if (!finalized) {
    return {
      config: null,
      feedback: [createImportFeedbackItem({
        level: IMPORT_FEEDBACK_ERROR,
        code: "invalid-block",
        blockIndex: index + 1,
        speciesId,
        configName: config.displayName || config.speciesName,
        message: t(language, "error.invalidBlock", {index: index + 1}),
      })],
    };
  }
  const validationItems = [...feedback, ...validateImportedConfig(finalized, context, index + 1, language, lineMeta)];
  return {
    config: attachValidation(finalized, validationItems),
    feedback: validationItems,
  };
}

export function parseShowdownLibrary(text, context, options = {}) {
  const fallbackLevel = options.fallbackLevel || FALLBACK_LEVEL;
  const language = options.language || "zh";
  const blocks = normalizeImportText(text).split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  const configs = [];
  const feedback = [];

  blocks.forEach((block, index) => {
    const parsed = createCustomConfig(block, index, context, fallbackLevel, options.resolveConvertedPoint, language);
    if (!parsed.config) {
      feedback.push(...parsed.feedback);
      return;
    }
    configs.push(parsed.config);
    feedback.push(...parsed.feedback);
  });

  return {configs, feedback};
}

export function hydrateConfigs(configs = [], context, fallbackLevel) {
  return configs
    .map((config) => refreshConfigValidation({
      ...config,
      level: Number(config?.level) || fallbackLevel || FALLBACK_LEVEL,
    }, context))
    .filter(Boolean);
}

export function exportConfigToEditableText(config) {
  return exportConfigsToShowdown([config], "points");
}

function buildPointsLine(points = {}) {
  return `Points: ${points.hp || 0} HP / ${points.atk || 0} Atk / ${points.def || 0} Def / ${points.spa || 0} SpA / ${points.spd || 0} SpD / ${points.spe || 0} Spe`;
}

function buildChampionEvsLine(points = {}) {
  return EV_STAT_ORDER
    .filter((stat) => Number(points[stat] || 0) > 0)
    .map((stat) => `${Number(points[stat] || 0)} ${EV_LABELS[stat]}`)
    .join(" / ");
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
    if (mode === "evs") {
      const evLine = buildEvsLine(resolveExportEvs(config));
      if (evLine) {
        lines.push(`EVs: ${evLine}`);
      }
    } else if (mode === "champion-evs") {
      const evLine = buildChampionEvsLine(config.championPoints || {});
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
  return exportConfigsToShowdown(configs, "champion-evs");
}
