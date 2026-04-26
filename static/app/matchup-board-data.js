import {TYPE_CHART} from "./constants.js";
import {getSpeedVariants} from "./battle-semantics.js";
import {getLearnsetMap} from "./learnsets.js";
import {getAttackBias} from "./team-roles.js";
import {getUsageMoveEntries} from "./usage.js";
import {normalizeLookupText, normalizeName} from "./utils.js";

const MOVE_LIMIT = 4;
const OPPONENT_BOARD_MOVE_LIMIT = 6;
const PREVIEW_LIMIT = 3;
const RELIABLE_ACCURACY = 90;
const DRAWBACK_POWER_THRESHOLD = 120;
const DRAWBACK_ACCURACY_THRESHOLD = 95;
const COMMON_DRAWBACK_MOVE_IDS = new Set([
  "armorcannon",
  "bravebird",
  "closecombat",
  "dracometeor",
  "flareblitz",
  "headlongrush",
  "makeitrain",
  "overheat",
  "vcreate",
  "wavecrash",
  "woodhammer",
]);

function getVariantConfigs(entry) {
  if (entry?.selectedConfigId && Array.isArray(entry?.configs)) {
    const selectedConfig = entry.configs.find((config) => config.id === entry.selectedConfigId);
    if (selectedConfig) {
      return [selectedConfig];
    }
  }
  return Array.isArray(entry?.configs) && entry.configs.length ? entry.configs : [entry].filter(Boolean);
}
function isGroupedEntry(entry) {
  return Array.isArray(entry?.configs) && entry.configs.length > 1;
}
function hasRealConfigs(entry) {
  return getVariantConfigs(entry).some((config) => config.source !== "template");
}
function getMemberLabel(entry) {
  return entry?.displayLabel || entry?.displayName || entry?.speciesName || "Unknown";
}
function getStableSpeciesId(entry) {
  return String(entry?.speciesId || "");
}
function getAttackMultiplier(attackType, defendTypes = []) {
  return defendTypes.reduce((total, defendType) => total * (TYPE_CHART[attackType]?.[defendType] ?? 1), 1);
}
function formatVariantLabel(mode = "base") {
  return mode;
}
function getMinValue(values = []) {
  return values.length ? Math.min(...values) : 0;
}
function getMaxValue(values = []) {
  return values.length ? Math.max(...values) : 0;
}
function formatMultiplier(value) {
  return value == null ? "--" : String(value);
}
function normalizeAccuracy(accuracy) {
  return accuracy === true ? 101 : Number(accuracy || 0);
}
function resolveMoveEntry(moveName, datasets) {
  const lookup = datasets.moveSearchLookup || datasets.moveLookup;
  return lookup?.get(normalizeLookupText(moveName)) || lookup?.get(normalizeName(moveName)) || null;
}
function getSelfDropTotal(move) {
  return Math.abs(Object.values(move?.self?.boosts || {}).filter((value) => Number(value) < 0).reduce((sum, value) => sum + Number(value), 0));
}
function hasMajorDrawback(move) {
  return Boolean(
    move?.flags?.charge
    || getSelfDropTotal(move) > 0
    || move?.recoil
    || move?.mindBlownRecoil
  );
}
function isCommonDrawbackMove(move) {
  return COMMON_DRAWBACK_MOVE_IDS.has(normalizeName(move?.name));
}
function isAllowedDrawbackMove(move) {
  if (move?.flags?.charge) {
    return false;
  }
  if (isCommonDrawbackMove(move)) {
    return true;
  }
  return Boolean(
    getSelfDropTotal(move) > 0
    && Number(move.basePower || 0) >= DRAWBACK_POWER_THRESHOLD
    && normalizeAccuracy(move.accuracy) >= DRAWBACK_ACCURACY_THRESHOLD
  );
}
function isDisplayableMove(move) {
  if (!isReliableDamagingMove(move)) return false;
  if (!hasMajorDrawback(move)) return true;
  return isAllowedDrawbackMove(move);
}
function buildTargetRefs(team = []) {
  return team.map((entry) => ({
    id: getStableSpeciesId(entry) || entry.id,
    speciesId: getStableSpeciesId(entry),
    label: getMemberLabel(entry),
    speciesName: entry.speciesName || getMemberLabel(entry),
    spritePosition: entry.spritePosition,
    types: entry.types || [],
  }));
}
function buildEntryFromSpecies(speciesId, datasets, moveNames = []) {
  const species = datasets.pokedex?.[speciesId];
  if (!species) {
    return null;
  }
  const moves = dedupeMoves(moveNames.map((moveName) => resolveMoveEntry(moveName, datasets)).filter(Boolean));
  return {
    speciesId,
    speciesName: species.name,
    types: species.types || [],
    baseStats: species.baseStats || {},
    stats: species.baseStats || {},
    moves,
    configs: [{
      speciesId,
      speciesName: species.name,
      types: species.types || [],
      baseStats: species.baseStats || {},
      stats: species.baseStats || {},
      moves,
      source: "builder",
    }],
  };
}
function dedupeMoves(moves = []) {
  const uniqueMoves = new Map();
  moves.forEach((move) => {
    const moveId = normalizeName(move?.name);
    if (moveId && !uniqueMoves.has(moveId)) {
      uniqueMoves.set(moveId, move);
    }
  });
  return [...uniqueMoves.values()];
}
function getMoveMetrics(move, targets = []) {
  const multipliers = targets.map((target) => {
    const value = move?.type ? getAttackMultiplier(move.type, target.types || []) : null;
    return {...target, value, displayValue: formatMultiplier(value)};
  });
  return {
    multipliers,
    total: multipliers.reduce((sum, target) => sum + Number(target.value || 0), 0),
    hitCount: multipliers.filter((target) => Number(target.value || 0) > 1).length,
  };
}
function compareCoverage(left, right) {
  if ((right.preferenceScore || 0) !== (left.preferenceScore || 0)) {
    return (right.preferenceScore || 0) - (left.preferenceScore || 0);
  }
  if (right.total !== left.total) return right.total - left.total;
  if (right.hitCount !== left.hitCount) return right.hitCount - left.hitCount;
  if (right.accuracy !== left.accuracy) return right.accuracy - left.accuracy;
  if (right.basePower !== left.basePower) return right.basePower - left.basePower;
  return left.name.localeCompare(right.name, "zh-Hans-CN");
}
function isReliableDamagingMove(move) {
  return move
    && move.category !== "Status"
    && Number(move.basePower || 0) > 0
    && normalizeAccuracy(move.accuracy) >= RELIABLE_ACCURACY;
}
function isConfiguredDamagingMove(move) {
  return move
    && move.category !== "Status"
    && Number(move.basePower || 0) > 0;
}
function getLegalMoves(entry, datasets) {
  const learnset = getLearnsetMap(getStableSpeciesId(entry), datasets, {itemName: entry?.item});
  if (!learnset) return [];
  return dedupeMoves(Object.keys(learnset).map((moveId) => datasets.moves?.[moveId]).filter(isDisplayableMove));
}

function getUsageAttackMoves(entry, datasets) {
  const speciesId = getStableSpeciesId(entry);
  if (!speciesId) {
    return [];
  }
  return getUsageMoveEntries(speciesId, datasets, {kind: "attacking", limit: 8}).map((entry) => entry.move);
}

function getCommonSupportMoveNames(entry, datasets, selectedMoves = [], limit = 3) {
  const speciesId = getStableSpeciesId(entry);
  if (!speciesId) {
    return [];
  }
  return getUsageMoveEntries(speciesId, datasets, {
    kind: "support",
    limit: 6,
    excludeNames: selectedMoves.map((move) => move.name),
  })
    .map((entry) => entry.name)
    .slice(0, limit);
}
function scoreMove(move, targets = []) {
  const metrics = getMoveMetrics(move, targets);
  return {
    ...move,
    ...metrics,
    accuracy: normalizeAccuracy(move.accuracy),
    basePower: Number(move.basePower || 0),
  };
}
function getPreferredCategory(entry) {
  const scores = {Physical: 0, Special: 0};
  getVariantConfigs(entry).forEach((config) => {
    const bias = getAttackBias(config);
    if (bias === "physical") scores.Physical += 3;
    if (bias === "special") scores.Special += 3;
    if (bias === "mixed") {
      scores.Physical += 1;
      scores.Special += 1;
    }
    (config.moves || []).forEach((move) => {
      if (move.category === "Physical") scores.Physical += 1;
      if (move.category === "Special") scores.Special += 1;
    });
  });
  if (!scores.Physical && !scores.Special) {
    const sample = getVariantConfigs(entry)[0] || entry;
    const atk = Number(sample.stats?.atk || sample.baseStats?.atk || 0);
    const spa = Number(sample.stats?.spa || sample.baseStats?.spa || 0);
    if (atk > spa) scores.Physical += 1;
    if (spa > atk) scores.Special += 1;
  }
  if (scores.Physical >= scores.Special + 2) return "Physical";
  if (scores.Special >= scores.Physical + 2) return "Special";
  return "";
}
function getPreferenceScore(move, preferredCategory, memberTypes = []) {
  let score = 0;
  if (memberTypes.includes(move.type)) score += 1;
  if (preferredCategory && move.category === preferredCategory) score += 2;
  if (preferredCategory && move.category && move.category !== preferredCategory) score -= 2;
  return score;
}
function rankMoves(moves = [], targets = [], memberTypes = [], preferredCategory = "") {
  return dedupeMoves(moves)
    .map((move) => ({
      ...scoreMove(move, targets),
      isStab: memberTypes.includes(move.type),
      preferenceScore: getPreferenceScore(move, preferredCategory, memberTypes),
    }))
    .sort(compareCoverage);
}
function getConfiguredAttackMoves(entry) {
  const configuredMoveFilter = hasRealConfigs(entry) ? isConfiguredDamagingMove : isDisplayableMove;
  return dedupeMoves(
    getVariantConfigs(entry)
      .flatMap((config) => config.moves || [])
      .filter(configuredMoveFilter),
  );
}
function getSeedMoves(entry, targets = [], memberTypes = [], limit = MOVE_LIMIT) {
  const preferredCategory = getPreferredCategory(entry);
  const configuredMoves = getConfiguredAttackMoves(entry);
  if (!configuredMoves.length) return [];
  if (isGroupedEntry(entry)) {
    return rankMoves(configuredMoves, targets, memberTypes, preferredCategory).slice(0, limit);
  }
  return configuredMoves
    .slice(0, limit)
    .map((move) => ({
      ...scoreMove(move, targets),
      isStab: memberTypes.includes(move.type),
      preferenceScore: getPreferenceScore(move, preferredCategory, memberTypes),
    }));
}
function getSelectedMoveIds(moves = []) {
  return new Set(moves.map((move) => normalizeName(move.name)).filter(Boolean));
}
function getBestStabMove(pool = [], memberTypes = []) {
  return pool.filter((move) => memberTypes.includes(move.type)).sort(compareCoverage)[0] || null;
}
function countTypeMoves(targetList, type, isStab) {
  return targetList.filter((entry) => entry.type === type && entry.isStab === isStab).length;
}
function isReliableStabMove(move) {
  return move.isStab && !hasMajorDrawback(move) && normalizeAccuracy(move.accuracy) >= RELIABLE_ACCURACY;
}
function isHighPowerDrawbackStabMove(move) {
  return move.isStab && isAllowedDrawbackMove(move);
}
function canAddStabDuplicate(targetList, move) {
  const stabMoves = targetList.filter((entry) => entry.type === move.type && entry.isStab);
  if (!stabMoves.length) return true;
  if (stabMoves.length >= 2) return false;
  const hasReliable = stabMoves.some(isReliableStabMove);
  const hasDrawback = stabMoves.some(isHighPowerDrawbackStabMove);
  return (hasReliable && isHighPowerDrawbackStabMove(move)) || (hasDrawback && isReliableStabMove(move));
}
function hasSameTypeNonStabMove(targetList, move) {
  return !move.isStab && targetList.some((entry) => !entry.isStab && entry.type === move.type);
}
function addMoveIfPresent(targetList, move, selectedMoveIds) {
  if (!move || hasSameTypeNonStabMove(targetList, move)) return;
  if (move.isStab && !canAddStabDuplicate(targetList, move)) return;
  targetList.push(move);
  selectedMoveIds.add(normalizeName(move.name));
}
function addRequiredStabMoves(targetList, rankedLegalMoves, memberTypes, selectedMoveIds) {
  memberTypes.forEach((type) => {
    const stabPool = rankedLegalMoves.filter((move) => move.type === type && !selectedMoveIds.has(normalizeName(move.name)));
    const preferredReliable = stabPool.find((move) => isReliableStabMove(move));
    const fallback = stabPool[0];
    addMoveIfPresent(targetList, preferredReliable || fallback, selectedMoveIds);
  });
}
function supplementMoves(selected, entry, targets = [], memberTypes = [], datasets, limit = MOVE_LIMIT) {
  const preferredCategory = getPreferredCategory(entry);
  const rankedLegalMoves = rankMoves(getLegalMoves(entry, datasets), targets, memberTypes, preferredCategory);
  const rankedUsageMoves = rankMoves(getUsageAttackMoves(entry, datasets), targets, memberTypes, preferredCategory);
  const nextMoves = [];
  const selectedMoveIds = getSelectedMoveIds(nextMoves);
  selected.forEach((move) => addMoveIfPresent(nextMoves, move, selectedMoveIds));
  addRequiredStabMoves(nextMoves, [...rankedUsageMoves, ...rankedLegalMoves], memberTypes, selectedMoveIds);
  rankedUsageMoves.forEach((move) => {
    const moveId = normalizeName(move.name);
    if (nextMoves.length >= limit || selectedMoveIds.has(moveId)) return;
    if (!move.isStab && countTypeMoves(nextMoves, move.type, false) >= 1) return;
    addMoveIfPresent(nextMoves, move, selectedMoveIds);
  });
  if (!nextMoves.some((move) => memberTypes.includes(move.type))) {
    addMoveIfPresent(nextMoves, getBestStabMove(rankedLegalMoves.filter((move) => !selectedMoveIds.has(normalizeName(move.name))), memberTypes), selectedMoveIds);
  }
  rankedLegalMoves.forEach((move) => {
    const moveId = normalizeName(move.name);
    if (nextMoves.length >= limit || selectedMoveIds.has(moveId)) return;
    if (!move.isStab && countTypeMoves(nextMoves, move.type, false) >= 1) return;
    addMoveIfPresent(nextMoves, move, selectedMoveIds);
  });
  return nextMoves.slice(0, limit);
}
function padMoveRows(moves = [], targets = [], limit = MOVE_LIMIT) {
  const rows = moves.map((move) => ({
    key: normalizeName(move.name),
    name: move.name,
    type: move.type || "",
    isMissing: false,
    multipliers: move.multipliers,
  }));
  while (rows.length < limit) {
    rows.push({
      key: `missing:${rows.length}`,
      name: "",
      type: "",
      isMissing: true,
      multipliers: targets.map((target) => ({...target, value: null, displayValue: "--"})),
    });
  }
  return rows;
}
function getConfiguredDisplayMoves(entry, targets = [], limit = MOVE_LIMIT) {
  const config = getVariantConfigs(entry)[0];
  if (!config?.moves?.length) {
    return [];
  }
  return config.moves
    .filter((move) => move?.category !== "Status" && Number(move?.basePower || 0) > 0)
    .slice(0, limit)
    .map((move) => ({
    ...move,
    multipliers: move.category !== "Status" && move.type
      ? getMoveMetrics(move, targets).multipliers
      : targets.map((target) => ({...target, value: null, displayValue: "--"})),
  }));
}
function createSummaryEntries(entries = [], includeResistance = false) {
  return entries.slice(0, PREVIEW_LIMIT).map((entry) => ({
    label: entry.member.label,
    speciesId: entry.member.speciesId || "",
    speciesName: entry.member.speciesName || entry.member.label,
    effectiveness: Number(entry.effectiveness || 0),
    resistance: includeResistance ? Number(entry.resistance || 0) : null,
    speed: Number(entry.speed || 0),
  }));
}
function sanitizeMetaText(value) {
  const text = String(value || "").trim();
  const loweredText = text.toLowerCase();
  if (!text || loweredText === "undefined" || loweredText === "undifine" || loweredText === "null") {
    return "";
  }
  return text;
}
function getMetaLine(entry) {
  return isGroupedEntry(entry)
    ? ""
    : [sanitizeMetaText(entry.item), sanitizeMetaText(entry.ability)].filter(Boolean).join(" / ");
}
function getSpeedSnapshot(entry) {
  const configs = getVariantConfigs(entry);
  const baseSpeeds = configs.map((config) => Number(config.stats?.spe || 0));
  const variantMap = new Map();
  configs.forEach((config) => {
    getSpeedVariants(config).forEach((variant) => {
      const speeds = variantMap.get(variant.mode) || [];
      speeds.push(Number(variant.speed || 0));
      variantMap.set(variant.mode, speeds);
    });
  });
  const variants = ["base", "plus1", "scarf", "double"].flatMap((mode) => {
    const speeds = variantMap.get(mode) || [];
    if (!speeds.length) {
      return [];
    }
    return [{
      mode,
      label: formatVariantLabel(mode),
      min: getMinValue(speeds),
      max: getMaxValue(speeds),
    }];
  });
  const sortSpeed = Math.max(...variants.map((variant) => variant.max), 0);
  return {
    id: getStableSpeciesId(entry) || entry.id,
    label: getMemberLabel(entry),
    speciesId: getStableSpeciesId(entry),
    speciesName: entry.speciesName || getMemberLabel(entry),
    spritePosition: entry.spritePosition,
    baseMin: getMinValue(baseSpeeds),
    baseMax: getMaxValue(baseSpeeds),
    variants,
    sortSpeed,
  };
}
function buildSpeedRows(team = [], opponentTeam = []) {
  const allyEntries = team.map(getSpeedSnapshot).sort((left, right) => right.sortSpeed - left.sortSpeed);
  const opponentEntries = opponentTeam.map(getSpeedSnapshot).sort((left, right) => right.sortSpeed - left.sortSpeed);
  return Array.from({length: Math.max(allyEntries.length, opponentEntries.length)}, (_, index) => ({
    ally: allyEntries[index] || null,
    opponent: opponentEntries[index] || null,
  }));
}
function createCard(entry, targets = [], summaries = [], includeResistance = false, datasets, autoFillMoves = true, preserveConfiguredMoves = false, moveLimit = MOVE_LIMIT) {
  const memberTypes = entry.types || [];
  const shouldPreserveConfiguredMoves = preserveConfiguredMoves || Boolean(entry.selectedConfigId);
  const selectedMoves = shouldPreserveConfiguredMoves
    ? (() => {
      const configuredMoves = getConfiguredDisplayMoves(entry, targets, moveLimit);
      if (!autoFillMoves || configuredMoves.length >= moveLimit) {
        return configuredMoves;
      }
      return supplementMoves(configuredMoves, entry, targets, memberTypes, datasets, moveLimit);
    })()
    : (() => {
      const seedMoves = getSeedMoves(entry, targets, memberTypes, moveLimit);
      const shouldAutoFill = autoFillMoves && seedMoves.length < moveLimit;
      if (!autoFillMoves) {
        return seedMoves.slice(0, moveLimit);
      }
      return shouldAutoFill
        ? supplementMoves(seedMoves, entry, targets, memberTypes, datasets, moveLimit)
        : seedMoves.slice(0, moveLimit);
    })();
  const supportMoves = getCommonSupportMoveNames(entry, datasets, selectedMoves);
  return {
    id: getStableSpeciesId(entry) || entry.id,
    speciesId: getStableSpeciesId(entry),
    label: getMemberLabel(entry),
    speciesName: entry.speciesName || getMemberLabel(entry),
    spritePosition: entry.spritePosition,
    types: memberTypes,
    metaLine: getMetaLine(entry),
    variantCount: hasRealConfigs(entry) ? getVariantConfigs(entry).length : 0,
    totalVariantCount: Array.isArray(entry?.configs) ? entry.configs.length : 0,
    selectedConfigId: entry?.selectedConfigId || "",
    selectedConfigLabel: entry?.selectedConfigLabel || "",
    configOptions: Array.isArray(entry?.configs)
      ? entry.configs.map((config) => ({
        id: config.id || "",
        label: config.displayLabel || config.displayName || config.speciesName || "Unknown",
      }))
      : [],
    supportMoves,
    moveRows: padMoveRows(selectedMoves, targets, moveLimit),
    targets,
    summaryEntries: createSummaryEntries(summaries, includeResistance),
  };
}
function buildSummaryMap(entries = []) {
  return new Map(entries.map((entry) => [entry.member.id, entry]));
}

export function getSuggestedMoveNamesForSpecies(speciesId, datasets, selectedMoveNames = [], limit = 6) {
  const entry = buildEntryFromSpecies(speciesId, datasets, selectedMoveNames);
  if (!entry) {
    return [];
  }
  const memberTypes = entry.types || [];
  const preferredCategory = getPreferredCategory(entry);
  const rankedLegalMoves = rankMoves(getLegalMoves(entry, datasets), [], memberTypes, preferredCategory);
  const rankedUsageMoves = rankMoves(getUsageAttackMoves(entry, datasets), [], memberTypes, preferredCategory);
  const selectedMoves = getSeedMoves(entry, [], memberTypes);
  const selectedMoveIds = new Set(selectedMoveNames.map((moveName) => normalizeName(moveName)).filter(Boolean));
  const seeded = [];
  const seededIds = getSelectedMoveIds(seeded);
  const suggestionIds = new Set();
  selectedMoves.forEach((move) => addMoveIfPresent(seeded, move, seededIds));
  const suggestions = [];
  [...rankedUsageMoves, ...rankedLegalMoves].forEach((move) => {
    const moveId = normalizeName(move.name);
    if (suggestions.length >= limit || selectedMoveIds.has(moveId) || seededIds.has(moveId) || suggestionIds.has(moveId)) {
      return;
    }
    if (!move.isStab && countTypeMoves([...seeded, ...suggestions], move.type, false) >= 1) {
      return;
    }
    if (move.isStab && !canAddStabDuplicate([...seeded, ...suggestions], move)) {
      return;
    }
    suggestions.push(move);
    suggestionIds.add(moveId);
  });
  return suggestions.map((move) => move.name);
}

export function resolveDamageMoveNamesForConfig(config, allyTargets = [], datasets) {
  if (!config?.speciesId || !datasets) return [];
  const existingNames = Array.isArray(config.moveNames) && config.moveNames.length
    ? config.moveNames
    : (config.moves || []).map((move) => move?.name).filter(Boolean);
  const entry = buildEntryFromSpecies(config.speciesId, datasets, existingNames);
  if (!entry) return existingNames.slice(0, MOVE_LIMIT);
  const memberTypes = entry.types || [];
  const seedMoves = getSeedMoves(entry, allyTargets, memberTypes, MOVE_LIMIT);
  const filled = seedMoves.length >= MOVE_LIMIT
    ? seedMoves.slice(0, MOVE_LIMIT)
    : supplementMoves(seedMoves, entry, allyTargets, memberTypes, datasets, MOVE_LIMIT);
  const resolvedNames = filled.map((move) => move?.name).filter(Boolean);
  if (resolvedNames.length) return resolvedNames;
  return existingNames.slice(0, MOVE_LIMIT);
}

export function buildMatchupBoard({team = [], opponentTeam = [], allyThreats = [], opponentAnswers = [], datasets}) {
  if (!team.length || !opponentTeam.length || !datasets) return null;
  const allyThreatMap = buildSummaryMap(allyThreats);
  const opponentAnswerMap = buildSummaryMap(opponentAnswers);
  const allyTargets = buildTargetRefs(opponentTeam);
  const opponentTargets = buildTargetRefs(team);
  return {
    allyCards: team.map((entry) => createCard(entry, allyTargets, allyThreatMap.get(entry.id)?.threats || [], false, datasets, false, true, MOVE_LIMIT)),
    opponentCards: opponentTeam.map((entry) => {
      const key = getStableSpeciesId(entry) || entry.id;
      return createCard(entry, opponentTargets, opponentAnswerMap.get(key)?.answers || [], true, datasets, true, false, OPPONENT_BOARD_MOVE_LIMIT);
    }),
    speedRows: buildSpeedRows(team, opponentTeam),
  };
}
