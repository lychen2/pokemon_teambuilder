import {analyzeTeam} from "./analysis.js";
import {buildAutocompleteEntries, getAutocompleteMatches} from "./builder-autocomplete.js";
import {buildSyntheticSpeedEntries} from "./champions-vgc.js";
import {ICON_SCHEMES} from "./constants.js";
import {calculateSpeedLineTiers, calculateSpeedTiers, loadDatasets} from "./data.js";
import {createDamageWorkspace} from "./damage-workspace.js";
import {applyStaticTranslations, DEFAULT_LANGUAGE, normalizeLanguage, t} from "./i18n.js";
import {
  buildConfigFromBuilder,
  buildNatureOptions,
  buildSpeciesBrowser,
  createBuilderState,
  getRequiredItemForSpecies,
  getAbilityOptions,
  getLegalMoveIds,
  getBuilderStats,
  getItemOptions,
  getMoveOptions,
  getTypeOptions,
  validateBuilderState,
} from "./library-builder.js";
import {analyzeMatchup} from "./matchup-analysis.js";
import {getSuggestedMoveNamesForSpecies, resolveDamageMoveNamesForConfig} from "./matchup-board-data.js";
import {
  buildOpponentLibrary,
  createSavedOpponentSnapshot,
  findOpponentEntry,
  loadSavedOpponentSelection,
  normalizeSavedOpponentTeams,
  restoreOpponentTeam,
  syncOpponentTeam,
} from "./matchup-selection.js";
import {flushPersistState, loadPersistedState, schedulePersistState} from "./persistence.js";
import {applyPsChinaTranslation, translatePsChinaText} from "./pschina-translation.js";
import {
  DEFAULT_RECOMMENDATION_PREFERENCES,
  DEFAULT_RECOMMENDATION_WEIGHTS,
  normalizeRecommendationPreferences,
  normalizeRecommendationWeights,
} from "./recommendation-preferences.js";
import {recommendConfigs} from "./recommendations.js";
import {renderAnalysis, renderDamage, renderImportFeedback, renderLibrary, renderMatchup, renderRecommendations, renderSavedTeams, renderSpeedTiers, renderStatus, renderTeam, renderTeamImportFeedback} from "./render.js";
import {exportConfigToEditableText, exportLibraryToShowdown, exportTeamToShowdown, hydrateConfigs, parseShowdownLibrary} from "./showdown.js";
import {compareConfigs, createTeamEntry, findBestLibraryMatch} from "./team-config.js";
import {getUsageItemEntries, getUsageMoveEntries} from "./usage.js";
import {formatChampionPoints, formatConfigName, getItemSpritePosition, getMoveCategoryLabel, getNatureSummary, getTypeLabel, normalizeLookupText, normalizeName} from "./utils.js";

const MAX_TEAM_SIZE = 6;
const DEFAULT_DAMAGE_SIDE = {
  reflect: false,
  lightScreen: false,
  protect: false,
  helpingHand: false,
  friendGuard: false,
  tailwind: false,
  auroraVeil: false,
  battery: false,
  powerSpot: false,
  steelySpirit: false,
  flowerGift: false,
  stealthRock: false,
  spikes: 0,
  foresight: false,
  gMaxField: false,
  saltCure: false,
  swamp: false,
  seaFire: false,
  redItem: false,
  blueItem: false,
  charge: false,
};
const DEFAULT_DAMAGE_INDEPENDENT = {
  neutralizingGas: false,
  fairyAura: false,
  darkAura: false,
  auraBreak: false,
  tabletsOfRuin: false,
  vesselOfRuin: false,
  swordOfRuin: false,
  beadsOfRuin: false,
};
const DEFAULT_DAMAGE_BOOST_SET = {
  atk: 0,
  def: 0,
  spa: 0,
  spd: 0,
  spe: 0,
};
const DEFAULT_DAMAGE_META_SET = {
  dynamax: false,
  terastal: false,
  abilityActive: false,
};
const DEFAULT_DAMAGE_FIELD = {
  format: "Doubles",
  weather: "",
  terrain: "",
  gravity: false,
  independent: {...DEFAULT_DAMAGE_INDEPENDENT},
  attacker: {...DEFAULT_DAMAGE_SIDE},
  defender: {...DEFAULT_DAMAGE_SIDE},
};
const DEFAULT_DAMAGE_STATUSES = {
  attacker: "Healthy",
  defender: "Healthy",
};
const DEFAULT_DAMAGE_HEALTH = {
  attacker: 100,
  defender: 100,
};
const DEFAULT_DAMAGE_BOOSTS = {
  attacker: {...DEFAULT_DAMAGE_BOOST_SET},
  defender: {...DEFAULT_DAMAGE_BOOST_SET},
};
const DEFAULT_DAMAGE_META = {
  attacker: {...DEFAULT_DAMAGE_META_SET},
  defender: {...DEFAULT_DAMAGE_META_SET},
};
const DEFAULT_DAMAGE_TERA_TYPES = {
  attacker: "",
  defender: "",
};

const state = {
  datasets: null,
  language: DEFAULT_LANGUAGE,
  status: null,
  activeView: "library-view",
  iconScheme: ICON_SCHEMES.SHOWDOWN,
  activeAnalysisTab: "coverage",
  activeCoreConfigId: null,
  damage: {
    attackerId: "",
    defenderId: "",
    focusSide: "attacker",
    result: null,
    loading: false,
    error: "",
    lastPairKey: "",
    overridePairKey: "",
    overrides: {
      attackerAtk: 0,
      attackerSpa: 0,
      defenderHp: 0,
      defenderDef: 0,
      defenderSpd: 0,
    },
    field: {
      ...DEFAULT_DAMAGE_FIELD,
      independent: {...DEFAULT_DAMAGE_INDEPENDENT},
      attacker: {...DEFAULT_DAMAGE_SIDE},
      defender: {...DEFAULT_DAMAGE_SIDE},
    },
    statuses: {...DEFAULT_DAMAGE_STATUSES},
    healthPercent: {...DEFAULT_DAMAGE_HEALTH},
    boosts: {...DEFAULT_DAMAGE_BOOSTS, attacker: {...DEFAULT_DAMAGE_BOOST_SET}, defender: {...DEFAULT_DAMAGE_BOOST_SET}},
    meta: {...DEFAULT_DAMAGE_META, attacker: {...DEFAULT_DAMAGE_META_SET}, defender: {...DEFAULT_DAMAGE_META_SET}},
    teraTypes: {...DEFAULT_DAMAGE_TERA_TYPES},
    moveSelections: {attacker: ["", "", "", ""], defender: ["", "", "", ""]},
    movePicker: {side: "", index: -1, query: ""},
  },
  recommendFocusType: "",
  recommendPreferences: {...DEFAULT_RECOMMENDATION_PREFERENCES},
  recommendWeights: {...DEFAULT_RECOMMENDATION_WEIGHTS},
  dismissedRecommendationKeys: [],
  search: "",
  matchupSearch: "",
  library: [],
  filteredLibrary: [],
  allSpeciesBrowser: [],
  speciesBrowser: [],
  selectedSpeciesId: null,
  selectedSpecies: null,
  selectedSpeciesHasConfigs: false,
  matchupLibrary: [],
  speedTiers: [],
  speedLineTiers: [],
  syntheticSpeedEntries: [],
  team: [],
  opponentTeam: [],
  activeOpponentConfigSpeciesId: null,
  savedTeams: [],
  savedTeamSearch: "",
  activeTeamSidebarTab: "team",
  savedOpponentTeams: [],
  damageAttackers: [],
  damageDefenders: [],
  analysis: null,
  matchup: null,
  recommendations: [],
  guidedBuilder: null,
  itemOptions: [],
  itemOptionLabels: [],
  itemAutocompleteEntries: [],
  moveOptions: [],
  moveOptionLabels: [],
  moveAutocompleteEntries: [],
  natureOptions: [],
  typeOptions: [],
  builderSpeedBenchmarks: {fastest: [], slowest: [], slowCutoff: 0},
  localizedSpeciesNames: new Map(),
  localizedItemNames: new Map(),
  localizedMoveNames: new Map(),
  localizedAbilityNames: new Map(),
  localizedNatureNames: new Map(),
  localizedDetailTexts: new Map(),
  localizedDetailPromises: new Map(),
};

const TOOLTIP_OFFSET = 12;
const BUILDER_STATS = ["hp", "atk", "def", "spa", "spd", "spe"];
const MAX_SPEED_POINTS = 32;
const SPEED_BENCHMARK_FASTEST = "fastest";
const SPEED_BENCHMARK_SLOWEST = "slowest";
const SPEED_BENCHMARK_FAST_NATURE = "Jolly";
const SPEED_BENCHMARK_SLOW_NATURE = "Brave";
const SPEED_BENCHMARK_SLOW_PERCENTILE = 0.0002;
const EMPTY_BUILDER_POINTS = Object.freeze({
  hp: 0,
  atk: 0,
  def: 0,
  spa: 0,
  spd: 0,
  spe: 0,
});
const FULL_SPEED_BUILDER_POINTS = Object.freeze({
  ...EMPTY_BUILDER_POINTS,
  spe: MAX_SPEED_POINTS,
});
const TYPE_CHIP_COLORS = Object.freeze({
  Normal: "#919aa2",
  Fire: "#e68a3f",
  Water: "#5b9be6",
  Electric: "#e6bd3f",
  Grass: "#5da85d",
  Ice: "#69bfd2",
  Fighting: "#c55f4c",
  Poison: "#9b69d2",
  Ground: "#b99253",
  Flying: "#7f9ee8",
  Psychic: "#e76f92",
  Bug: "#96b03f",
  Rock: "#aa9c5a",
  Ghost: "#6f78c4",
  Dragon: "#5f74da",
  Dark: "#5f5a5a",
  Steel: "#6f98a8",
  Fairy: "#de7fb5",
});
const NATURE_TRANSLATIONS = Object.freeze({
  Adamant: "固执",
  Bashful: "害羞",
  Bold: "大胆",
  Brave: "勇敢",
  Calm: "沉着",
  Careful: "慎重",
  Docile: "坦率",
  Gentle: "温和",
  Hardy: "勤奋",
  Hasty: "急躁",
  Impish: "淘气",
  Jolly: "爽朗",
  Lax: "乐天",
  Lonely: "怕寂寞",
  Mild: "慢吞吞",
  Modest: "内敛",
  Naive: "天真",
  Naughty: "顽皮",
  Quiet: "冷静",
  Quirky: "浮躁",
  Rash: "马虎",
  Relaxed: "悠闲",
  Sassy: "自大",
  Serious: "认真",
  Timid: "胆小",
});
let globalTooltip = null;
let activeEditorTarget = null;
let activeBuilderAutocomplete = null;
let localizedLabelsRequestId = 0;
let damageWorkspace = null;
let damageSyncRequestId = 0;
let damageSliderSyncTimer = 0;
const POINT_PROMPT_MAP = {
  hp: "hp",
  atk: "atk",
  def: "def",
  spa: "spa",
  spd: "spd",
  spe: "spe",
};

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeIconScheme(iconScheme) {
  return iconScheme === ICON_SCHEMES.POKE_ICONS ? ICON_SCHEMES.POKE_ICONS : ICON_SCHEMES.SHOWDOWN;
}

function normalizeDamageField(field = {}) {
  return {
    ...DEFAULT_DAMAGE_FIELD,
    ...field,
    gravity: Boolean(field.gravity),
    independent: {...DEFAULT_DAMAGE_INDEPENDENT, ...(field.independent || {})},
    attacker: {
      ...DEFAULT_DAMAGE_SIDE,
      ...(field.attacker || {}),
      spikes: Math.max(0, Math.min(3, Number(field.attacker?.spikes || 0))),
    },
    defender: {
      ...DEFAULT_DAMAGE_SIDE,
      ...(field.defender || {}),
      spikes: Math.max(0, Math.min(3, Number(field.defender?.spikes || 0))),
    },
  };
}

function normalizeDamageStatuses(statuses = {}) {
  return {
    ...DEFAULT_DAMAGE_STATUSES,
    ...statuses,
  };
}

function normalizeDamageHealth(healthPercent = {}) {
  return {
    attacker: Math.max(0, Math.min(100, Number(healthPercent.attacker ?? DEFAULT_DAMAGE_HEALTH.attacker))),
    defender: Math.max(0, Math.min(100, Number(healthPercent.defender ?? DEFAULT_DAMAGE_HEALTH.defender))),
  };
}

function normalizeDamageBoosts(boosts = {}) {
  return {
    attacker: {
      ...DEFAULT_DAMAGE_BOOST_SET,
      ...(boosts.attacker || {}),
    },
    defender: {
      ...DEFAULT_DAMAGE_BOOST_SET,
      ...(boosts.defender || {}),
    },
  };
}

function normalizeDamageMeta(meta = {}) {
  return {
    attacker: {
      ...DEFAULT_DAMAGE_META_SET,
      ...(meta.attacker || {}),
    },
    defender: {
      ...DEFAULT_DAMAGE_META_SET,
      ...(meta.defender || {}),
    },
  };
}

function normalizeDamageTeraTypes(teraTypes = {}) {
  return {
    attacker: String(teraTypes.attacker || ""),
    defender: String(teraTypes.defender || ""),
  };
}

function buildDamageOverrides(attacker, defender) {
  return {
    attackerAtk: Number(attacker?.championPoints?.atk || 0),
    attackerSpa: Number(attacker?.championPoints?.spa || 0),
    defenderHp: Number(defender?.championPoints?.hp || 0),
    defenderDef: Number(defender?.championPoints?.def || 0),
    defenderSpd: Number(defender?.championPoints?.spd || 0),
  };
}

function applyDamageOverrides(config, overrides, role, status, currentHpPercent) {
  if (!config) {
    return null;
  }
  const championPoints = {...(config.championPoints || {})};
  if (role === "attacker") {
    championPoints.atk = Number(overrides.attackerAtk || 0);
    championPoints.spa = Number(overrides.attackerSpa || 0);
  }
  if (role === "defender") {
    championPoints.hp = Number(overrides.defenderHp || 0);
    championPoints.def = Number(overrides.defenderDef || 0);
    championPoints.spd = Number(overrides.defenderSpd || 0);
  }
  return {
    ...config,
    championPoints,
    status,
    currentHpPercent,
    boosts: {...DEFAULT_DAMAGE_BOOST_SET, ...(state.damage.boosts?.[role] || {})},
    dynamax: Boolean(state.damage.meta?.[role]?.dynamax),
    terastal: Boolean(state.damage.meta?.[role]?.terastal),
    abilityActive: Boolean(state.damage.meta?.[role]?.abilityActive),
    teraType: state.damage.teraTypes?.[role] || config.teraType || config.types?.[0] || "",
  };
}

function clampDamageBoost(value) {
  return Math.max(-6, Math.min(6, Math.round(Number(value || 0))));
}

function setNestedValue(source, path, value) {
  const [head, ...rest] = path;
  if (!head) {
    return source;
  }
  if (!rest.length) {
    return {...source, [head]: value};
  }
  return {
    ...source,
    [head]: setNestedValue(source?.[head] || {}, rest, value),
  };
}

function coerceDamageFieldValue(control, path = []) {
  if (control.type === "checkbox") {
    return control.checked;
  }
  const key = path[path.length - 1] || "";
  if (control.dataset.damageValueType === "number" || key === "spikes") {
    return Number(control.value || 0);
  }
  return control.value;
}

function applyDamageFieldChange(pathText, control) {
  const path = String(pathText || "").split(".").filter(Boolean);
  if (!path.length) {
    return;
  }
  const [scope, ...rest] = path;
  if (!rest.length) {
    state.damage.field = setNestedValue(state.damage.field, path, coerceDamageFieldValue(control, path));
    return;
  }
  if (scope === "statuses") {
    state.damage.statuses = setNestedValue(state.damage.statuses, rest, control.value);
    return;
  }
  if (scope === "healthPercent") {
    const next = Number(control.value || 0);
    state.damage.healthPercent = setNestedValue(
      state.damage.healthPercent,
      rest,
      Math.max(0, Math.min(100, next)),
    );
    return;
  }
  if (scope === "boosts") {
    state.damage.boosts = setNestedValue(state.damage.boosts, rest, clampDamageBoost(control.value));
    return;
  }
  if (scope === "meta") {
    state.damage.meta = setNestedValue(state.damage.meta, rest, Boolean(control.checked));
    return;
  }
  if (scope === "teraTypes") {
    state.damage.teraTypes = setNestedValue(state.damage.teraTypes, rest, String(control.value || ""));
    return;
  }
  state.damage.field = setNestedValue(state.damage.field, path, coerceDamageFieldValue(control, path));
}

function syncDamageOverrideState() {
  const attackerEntry = state.damageAttackers.find((entry) => entry.id === state.damage.attackerId);
  const defenderEntry = state.damageDefenders.find((entry) => entry.id === state.damage.defenderId);
  if (!attackerEntry || !defenderEntry) {
    state.damage.overridePairKey = "";
    state.damage.overrides = buildDamageOverrides(null, null);
    state.damage.teraTypes = {...DEFAULT_DAMAGE_TERA_TYPES};
    return;
  }
  const nextPairKey = `${attackerEntry.id}:${defenderEntry.id}`;
  if (state.damage.overridePairKey === nextPairKey) {
    return;
  }
  state.damage.overridePairKey = nextPairKey;
  state.damage.overrides = buildDamageOverrides(attackerEntry.config, defenderEntry.config);
  state.damage.teraTypes = {
    attacker: attackerEntry.config?.teraType || attackerEntry.config?.types?.[0] || "",
    defender: defenderEntry.config?.teraType || defenderEntry.config?.types?.[0] || "",
  };
}

function scheduleDamageSync() {
  window.clearTimeout(damageSliderSyncTimer);
  damageSliderSyncTimer = window.setTimeout(() => {
    void syncDamageWorkspace(true);
  }, 180);
}

function setDamageOverride(overrideKey, value) {
  if (!(overrideKey in state.damage.overrides)) {
    return;
  }
  state.damage.overrides = {
    ...state.damage.overrides,
    [overrideKey]: Math.max(0, Math.min(32, Math.round(Number(value || 0)))),
  };
  state.damage.lastPairKey = "";
}

function createUniqueConfigId(baseId, usedIds) {
  let candidate = baseId;
  let index = 1;
  while (usedIds.has(candidate)) {
    candidate = `${baseId}:${index}`;
    index += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function ensureUniqueConfigIds(configs, existingIds = new Set()) {
  return configs.map((config) => ({
    ...config,
    id: createUniqueConfigId(config.id, existingIds),
  }));
}

function translateNodes(...nodes) {
  void applyPsChinaTranslation(state.language, nodes);
}

function scheduleStatePersist() {
  schedulePersistState(state);
}

function refreshFilteredLibrary() {
  const searchToken = normalizeName(state.search);
  const speciesSearch = state.library.reduce((map, config) => {
    const haystack = normalizeName([
      config.displayName,
      config.displayLabel,
      config.speciesName,
      config.note,
      config.item,
      config.ability,
      config.moveNames?.join(" "),
    ].join(" "));
    const current = map.get(config.speciesId) || "";
    map.set(config.speciesId, `${current} ${haystack}`);
    return map;
  }, new Map());
  state.selectedSpecies = state.allSpeciesBrowser.find((entry) => entry.speciesId === state.selectedSpeciesId) || null;
  state.selectedSpeciesHasConfigs = state.selectedSpecies
    ? state.library.some((config) => config.speciesId === state.selectedSpeciesId)
    : false;
  state.speciesBrowser = state.allSpeciesBrowser.filter((species) => (
    !searchToken
      || species.searchText.includes(searchToken)
      || String(speciesSearch.get(species.speciesId) || "").includes(searchToken)
  ));
  state.filteredLibrary = state.library.filter((config) => {
    if (state.selectedSpeciesId && config.speciesId !== state.selectedSpeciesId) {
      return false;
    }
    if (!state.selectedSpeciesId) {
      return false;
    }
    if (!searchToken) {
      return true;
    }
    const haystack = normalizeName([
      config.displayName,
      config.displayLabel,
      config.speciesName,
      config.note,
      config.item,
      config.ability,
      config.moveNames?.join(" "),
    ].join(" "));
    return haystack.includes(searchToken);
  });
}

function refreshLibraryState() {
  state.speedTiers = calculateSpeedTiers(state.library);
  state.allSpeciesBrowser = buildSpeciesBrowser(state.datasets, state.library).map((species) => {
    const localizedSpeciesName = state.localizedSpeciesNames.get(species.speciesId) || species.speciesName;
    return {
      ...species,
      localizedSpeciesName,
      searchText: normalizeName([
        species.searchText,
        localizedSpeciesName,
      ].join(" ")),
    };
  });
  state.matchupLibrary = buildOpponentLibrary(state.datasets, state.library, state.language).map((entry) => {
    const localizedSpeciesName = state.localizedSpeciesNames.get(entry.speciesId) || entry.speciesName;
    return {
      ...entry,
      localizedSpeciesName,
    };
  });
  if (!state.allSpeciesBrowser.some((entry) => entry.speciesId === state.selectedSpeciesId)) {
    state.selectedSpeciesId = null;
  }
  state.syntheticSpeedEntries = buildSyntheticSpeedEntries(state.datasets, state.library, state.language);
  state.speedLineTiers = calculateSpeedLineTiers([...state.syntheticSpeedEntries, ...state.library]);
  state.opponentTeam = syncOpponentTeam(state.opponentTeam, state.datasets, state.library, state.language);
  if (state.activeOpponentConfigSpeciesId && !state.opponentTeam.some((entry) => entry.speciesId === state.activeOpponentConfigSpeciesId)) {
    state.activeOpponentConfigSpeciesId = null;
  }
  state.savedOpponentTeams = normalizeSavedOpponentTeams(state.savedOpponentTeams, state.datasets, state.library, state.language);
  refreshFilteredLibrary();
}

function getRecommendationPool() {
  if (!state.datasets?.availableSpecies?.length) {
    return state.library;
  }
  const availableSpeciesIds = new Set(
    state.datasets.availableSpecies.map((species) => species.speciesId).filter(Boolean),
  );
  return state.library.filter((config) => availableSpeciesIds.has(config.speciesId));
}

function refreshBattleState() {
  const recommendationPool = getRecommendationPool();
  state.analysis = analyzeTeam(
    state.team,
    state.speedTiers,
    state.language,
    recommendationPool,
    state.recommendPreferences,
  );
  state.matchup = analyzeMatchup(state.team, state.opponentTeam, state.datasets);
  if (!state.team.some((config) => config.id === state.activeCoreConfigId)) {
    state.activeCoreConfigId = state.team[0]?.id || null;
  }
  const weaknessTypes = new Set((state.analysis?.coverage?.weakRows || []).map((entry) => entry.type));
  if (state.recommendFocusType && !weaknessTypes.has(state.recommendFocusType)) {
    state.recommendFocusType = "";
  }
  state.recommendations = recommendConfigs(
    recommendationPool,
    state.team,
    state.speedTiers,
    state.language,
    {
      preferences: state.recommendPreferences,
      weights: state.recommendWeights,
      focusType: state.recommendFocusType,
      datasets: state.datasets,
      dismissedKeys: state.dismissedRecommendationKeys,
    },
  );
  syncDamageSelectionState();
}

function buildDamageAttackerOptions() {
  return state.team.map((config) => ({
    id: config.id,
    label: config.displayLabel || config.displayName || config.speciesName || t(state.language, "common.unknown"),
    config,
  }));
}

function getOpponentVariantConfigs(entry) {
  if (entry?.selectedConfigId && Array.isArray(entry?.configs)) {
    const selectedConfig = entry.configs.find((config) => config.id === entry.selectedConfigId);
    return selectedConfig ? [selectedConfig] : [];
  }
  if (Array.isArray(entry?.configs) && entry.configs.length) {
    return entry.configs;
  }
  return entry ? [entry] : [];
}

function buildDamageDefenderOptions() {
  return state.opponentTeam.flatMap((entry) => getOpponentVariantConfigs(entry).map((config) => ({
    id: config.id,
    label: config.displayLabel || config.displayName || config.speciesName || t(state.language, "common.unknown"),
    config,
  })));
}

function buildDamageAllyTargets() {
  return state.team.map((config) => ({
    id: config.id,
    speciesId: String(config.speciesId || ""),
    label: config.displayLabel || config.displayName || config.speciesName || "",
    speciesName: config.speciesName || "",
    spritePosition: config.spritePosition,
    types: state.datasets?.pokedex?.[config.speciesId]?.types || [],
  }));
}

function applyDamageMoveSelections(moveNames = [], manualSelections = []) {
  const merged = [];
  for (let index = 0; index < 4; index += 1) {
    const manual = String(manualSelections[index] || "").trim();
    const auto = String(moveNames[index] || "").trim();
    const pick = manual || auto;
    if (pick) merged.push(pick);
  }
  return merged;
}

function resetDamageMoveSelections(side) {
  if (!state.damage.moveSelections?.[side]) return;
  state.damage.moveSelections[side] = ["", "", "", ""];
}

function syncDamageSelectionState() {
  state.damageAttackers = buildDamageAttackerOptions();
  state.damageDefenders = buildDamageDefenderOptions();
  const validAttackerIds = new Set(state.damageAttackers.map((entry) => entry.id));
  const validDefenderIds = new Set(state.damageDefenders.map((entry) => entry.id));
  const previousAttackerId = state.damage.attackerId;
  const previousDefenderId = state.damage.defenderId;
  if (!validAttackerIds.has(state.damage.attackerId)) {
    state.damage.attackerId = state.damageAttackers[0]?.id || "";
  }
  if (!validDefenderIds.has(state.damage.defenderId)) {
    state.damage.defenderId = state.damageDefenders[0]?.id || "";
  }
  if (state.damage.attackerId !== previousAttackerId) {
    resetDamageMoveSelections("attacker");
    if (state.damage.movePicker?.side === "attacker") {
      state.damage.movePicker = {side: "", index: -1, query: ""};
    }
  }
  if (state.damage.defenderId !== previousDefenderId) {
    resetDamageMoveSelections("defender");
    if (state.damage.movePicker?.side === "defender") {
      state.damage.movePicker = {side: "", index: -1, query: ""};
    }
  }
  if (!state.damage.attackerId || !state.damage.defenderId) {
    state.damage.result = null;
    state.damage.error = "";
    state.damage.lastPairKey = "";
    state.damage.overridePairKey = "";
    return;
  }
  syncDamageOverrideState();
  const currentPairKey = `${state.damage.attackerId}:${state.damage.defenderId}`;
  if (state.damage.lastPairKey && state.damage.lastPairKey !== currentPairKey) {
    state.damage.result = null;
    state.damage.error = "";
  }
}

function getResolvedDamageMoveNamesForSide(side) {
  if (side === "attacker") {
    const attacker = state.damageAttackers.find((entry) => entry.id === state.damage.attackerId)?.config;
    const baseNames = Array.isArray(attacker?.moveNames) ? attacker.moveNames : [];
    return applyDamageMoveSelections(baseNames, state.damage.moveSelections?.attacker || []);
  }
  const defender = state.damageDefenders.find((entry) => entry.id === state.damage.defenderId)?.config;
  if (!defender) return [];
  const resolvedMoveNames = resolveDamageMoveNamesForConfig(defender, buildDamageAllyTargets(), state.datasets);
  return applyDamageMoveSelections(resolvedMoveNames, state.damage.moveSelections?.defender || []);
}

function getDamagePickerSideConfig(side) {
  if (side === "attacker") {
    return state.damageAttackers.find((entry) => entry.id === state.damage.attackerId)?.config || null;
  }
  return state.damageDefenders.find((entry) => entry.id === state.damage.defenderId)?.config || null;
}

function getDamagePickerMoveOptionPairs(side, index) {
  const config = getDamagePickerSideConfig(side);
  if (!config?.speciesId) return [];
  const speciesId = config.speciesId;
  const lookup = new Map(state.moveAutocompleteEntries.map((entry) => [normalizeName(entry.value), entry]));
  const currentSlots = state.damage.displayMoveNames?.[side] || [];
  const selectedIds = new Set(currentSlots
    .map((name, slotIndex) => (slotIndex === index ? "" : normalizeName(name)))
    .filter(Boolean));
  const usageMoves = getUsageMoveEntries(speciesId, state.datasets, {kind: "all", limit: 12}).map((entry) => entry.name);
  const suggestedMoves = getSuggestedMoveNamesForSpecies(speciesId, state.datasets, currentSlots, 8);
  const prioritizedMoveNames = [...new Set([...usageMoves, ...suggestedMoves])];
  const builderLike = {speciesId};
  const legalPrioritizedMoves = partitionMoveNamesByLegality(prioritizedMoveNames, builderLike).legal;
  const globalMovePartitions = partitionMoveNamesByLegality(state.moveOptions, builderLike);
  const globalLegalMoves = sortNamesByGlobalUsage(globalMovePartitions.legal, state.datasets?.globalMoveUsageCounts);
  const orderedNames = [];
  const addMoveName = (moveName) => {
    const moveId = normalizeName(moveName);
    if (!moveId || selectedIds.has(moveId) || orderedNames.some((name) => normalizeName(name) === moveId)) {
      return;
    }
    orderedNames.push(moveName);
  };
  legalPrioritizedMoves.forEach(addMoveName);
  globalLegalMoves.forEach(addMoveName);
  globalMovePartitions.illegal.forEach(addMoveName);
  return orderedNames.map((moveName) => lookup.get(normalizeName(moveName)) || {
    value: moveName,
    label: getLocalizedMoveName(moveName),
    move: state.datasets?.moveLookup?.get(normalizeName(moveName)) || null,
  });
}

function getDamageMovePickerPanel(side, index) {
  return document.querySelector(`[data-damage-move-picker-panel][data-damage-move-side="${side}"][data-damage-move-index="${index}"]`);
}

function getDamageMovePickerInput(side, index) {
  return document.querySelector(`[data-damage-move-picker-input][data-damage-move-side="${side}"][data-damage-move-index="${index}"]`);
}

function renderDamageMovePickerPanel() {
  const picker = state.damage.movePicker;
  if (!picker || picker.index < 0 || !picker.side) return;
  const panel = getDamageMovePickerPanel(picker.side, picker.index);
  const input = getDamageMovePickerInput(picker.side, picker.index);
  if (!panel || !input) return;
  const entries = getDamagePickerMoveOptionPairs(picker.side, picker.index);
  const matches = getAutocompleteMatches(entries, input.value);
  if (!matches.length) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  panel.hidden = false;
  panel.innerHTML = matches.slice(0, 40).map((entry, matchIndex) => `
    <button
      type="button"
      class="builder-autocomplete-option"
      data-damage-autocomplete-entry-index="${matchIndex}"
      data-damage-autocomplete-side="${escapeHtml(picker.side)}"
      data-damage-autocomplete-index="${picker.index}"
      data-damage-autocomplete-value="${escapeHtml(entry.value)}"
    >
      ${renderAutocompleteOptionContent(entry, {kind: "move", index: picker.index})}
    </button>
  `).join("");
  hydrateAutocompletePanelDetails(panel, matches.slice(0, 40), {kind: "move", index: picker.index});
}

function openDamageMovePicker(side, index) {
  const current = state.damage.movePicker;
  if (current?.side === side && current?.index === index) {
    closeDamageMovePicker();
    return;
  }
  state.damage.movePicker = {side, index, query: ""};
  renderDamageSection();
  const input = getDamageMovePickerInput(side, index);
  if (input) {
    input.focus();
    input.select();
  }
  renderDamageMovePickerPanel();
}

function closeDamageMovePicker() {
  if (state.damage.movePicker?.index < 0) return;
  state.damage.movePicker = {side: "", index: -1, query: ""};
  renderDamageSection();
}

function selectDamageMoveValue(side, index, value) {
  if (!state.damage.moveSelections?.[side]) return;
  const canonical = state.datasets?.moveLookup?.get(normalizeName(value))?.name || value;
  state.damage.moveSelections[side][index] = canonical;
  state.damage.movePicker = {side: "", index: -1, query: ""};
  renderDamageSection();
  void syncDamageWorkspace(true);
  scheduleStatePersist();
}

function getSelectedDamageAttacker() {
  const config = state.damageAttackers.find((entry) => entry.id === state.damage.attackerId)?.config || null;
  if (!config) return null;
  const baseNames = Array.isArray(config.moveNames) ? config.moveNames : [];
  const merged = applyDamageMoveSelections(baseNames, state.damage.moveSelections?.attacker || []);
  const configWithMoves = merged.length ? {...config, moveNames: merged} : config;
  return applyDamageOverrides(
    configWithMoves,
    state.damage.overrides,
    "attacker",
    state.damage.statuses.attacker,
    state.damage.healthPercent.attacker,
  );
}

function getSelectedDamageDefender() {
  const config = state.damageDefenders.find((entry) => entry.id === state.damage.defenderId)?.config || null;
  if (!config) return null;
  const resolvedMoveNames = resolveDamageMoveNamesForConfig(config, buildDamageAllyTargets(), state.datasets);
  const merged = applyDamageMoveSelections(resolvedMoveNames, state.damage.moveSelections?.defender || []);
  const configWithMoves = merged.length ? {...config, moveNames: merged} : config;
  return applyDamageOverrides(
    configWithMoves,
    state.damage.overrides,
    "defender",
    state.damage.statuses.defender,
    state.damage.healthPercent.defender,
  );
}

async function syncDamageWorkspace(force = false) {
  const attacker = getSelectedDamageAttacker();
  const defender = getSelectedDamageDefender();
  if (!attacker || !defender) {
    state.damage.result = null;
    state.damage.error = "";
    state.damage.loading = false;
    renderDamageSection();
    return;
  }
  const nextPairKey = `${attacker.id}:${defender.id}`;
  if (!force && state.damage.result && state.damage.error === "" && state.damage.lastPairKey === nextPairKey) {
    return;
  }
  if (!damageWorkspace) {
    damageWorkspace = createDamageWorkspace();
  }
  if (!damageWorkspace) {
    state.damage.error = "伤害工作台未初始化。";
    renderDamageSection();
    return;
  }
  const requestId = ++damageSyncRequestId;
  state.damage.loading = true;
  state.damage.error = "";
  renderDamageSection();
  try {
    const result = await damageWorkspace.syncPair(attacker, defender, state.damage.field);
    if (requestId !== damageSyncRequestId) {
      return;
    }
    state.damage.result = result;
    state.damage.lastPairKey = nextPairKey;
    state.damage.loading = false;
    state.damage.error = "";
    renderDamageSection();
  } catch (error) {
    if (requestId !== damageSyncRequestId) {
      return;
    }
    state.damage.loading = false;
    state.damage.result = null;
    state.damage.error = error instanceof Error ? error.message : String(error);
    renderDamageSection();
  }
}

function openDamagePair({attackerId = "", defenderId = "", sync = true} = {}) {
  if (attackerId) {
    state.damage.attackerId = attackerId;
  }
  if (defenderId) {
    state.damage.defenderId = defenderId;
  }
  syncDamageSelectionState();
  setActiveView("damage-view");
  renderDamageSection();
  if (sync) {
    void syncDamageWorkspace();
  }
}

function refreshDerivedState() {
  refreshLibraryState();
  refreshBattleState();
}

function renderLibrarySection() {
  renderLibrary(state);
  translateNodes(document.getElementById("library-view"));
}

function renderTeamSection() {
  syncTeamSidebarState();
  renderTeam(state);
  renderSavedTeams(state);
  syncTeamSidebarUi();
  translateNodes(
    document.querySelector(".team-sidebar"),
    document.getElementById("team-list"),
    document.getElementById("saved-team-list"),
  );
}

function syncTeamSidebarState() {
  if (!state.team.length) {
    state.activeTeamSidebarTab = "import";
    return;
  }
  if (!["team", "saved", "import"].includes(state.activeTeamSidebarTab)) {
    state.activeTeamSidebarTab = "team";
  }
}

function syncTeamSidebarUi() {
  const tabs = Array.from(document.querySelectorAll("[data-team-sidebar-tab]"));
  const panels = Array.from(document.querySelectorAll(".team-sidebar-panel"));
  tabs.forEach((tab) => {
    const isActive = tab.dataset.teamSidebarTab === state.activeTeamSidebarTab;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
    tab.tabIndex = isActive ? 0 : -1;
  });
  panels.forEach((panel) => {
    const isActive = panel.id === `team-sidebar-panel-${state.activeTeamSidebarTab}`;
    panel.classList.toggle("active", isActive);
    panel.hidden = !isActive;
  });
}

function setActiveTeamSidebarTab(tabId) {
  if (!["team", "saved", "import"].includes(tabId)) {
    return;
  }
  state.activeTeamSidebarTab = tabId;
  syncTeamSidebarUi();
}

function renderAnalysisSection() {
  renderAnalysis(state);
  translateNodes(
    document.getElementById("analysis-overview"),
    document.getElementById("analysis-coverage-panel"),
    document.getElementById("analysis-roles-panel"),
    document.getElementById("analysis-cores-panel"),
  );
}

function renderMatchupSection() {
  renderMatchup(state);
  translateNodes(document.getElementById("matchup-view"));
}

function renderRecommendationsSection() {
  renderRecommendations(state);
  translateNodes(document.getElementById("recommend-view"));
}

function buildDamageDisplaySlots(side) {
  const manual = state.damage.moveSelections?.[side] || ["", "", "", ""];
  if (side === "attacker") {
    const attacker = state.damageAttackers.find((entry) => entry.id === state.damage.attackerId)?.config;
    const base = Array.isArray(attacker?.moveNames) ? attacker.moveNames : [];
    return [0, 1, 2, 3].map((index) => manual[index] || base[index] || "");
  }
  const defender = state.damageDefenders.find((entry) => entry.id === state.damage.defenderId)?.config;
  if (!defender) return ["", "", "", ""];
  const resolved = resolveDamageMoveNamesForConfig(defender, buildDamageAllyTargets(), state.datasets);
  return [0, 1, 2, 3].map((index) => manual[index] || resolved[index] || "");
}

function renderDamageSection() {
  state.damage.displayMoveNames = {
    attacker: buildDamageDisplaySlots("attacker"),
    defender: buildDamageDisplaySlots("defender"),
  };
  renderDamage(state);
  translateNodes(
    document.getElementById("damage-view"),
    document.getElementById("damage-controls"),
    document.getElementById("damage-field"),
    document.getElementById("damage-summary"),
  );
  if (
    state.activeView === "damage-view"
    && !state.damage.loading
    && !state.damage.result
    && !state.damage.error
    && state.damage.attackerId
    && state.damage.defenderId
  ) {
    void syncDamageWorkspace();
  }
}

function renderSpeedSection() {
  renderSpeedTiers(state);
  translateNodes(document.getElementById("speed-view"));
}

function renderAll() {
  renderLibrarySection();
  renderTeamSection();
  renderAnalysisSection();
  renderMatchupSection();
  renderRecommendationsSection();
  renderDamageSection();
  renderSpeedSection();
  renderGuidedConfig();
}

function setStatus(key, params = {}) {
  state.status = {key, params};
  renderStatus(t(state.language, key, params));
  translateNodes(document.getElementById("status-text"));
}

function setStatusMessage(message) {
  state.status = null;
  renderStatus(message);
  translateNodes(document.getElementById("status-text"));
}

function resetLocalizedLabels() {
  state.localizedSpeciesNames = new Map();
  state.localizedItemNames = new Map();
  state.localizedMoveNames = new Map();
  state.localizedAbilityNames = new Map();
  state.localizedNatureNames = new Map();
  if (state.datasets) {
    state.datasets.itemSearchLookup = state.datasets.itemLookup;
    state.datasets.moveSearchLookup = state.datasets.moveLookup;
  }
}

async function syncLocalizedLabelsInBackground() {
  if (state.language !== "zh" || !state.datasets) {
    return;
  }
  const requestId = ++localizedLabelsRequestId;
  try {
    await initializeLocalizedLabels();
    if (requestId !== localizedLabelsRequestId || state.language !== "zh") {
      return;
    }
    initializeBuilderOptions();
    refreshDerivedState();
    renderAll();
  } catch (error) {
    console.error("本地化标签初始化失败", error);
  }
}

function updateLanguageSwitch() {
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.classList.toggle("active", button.dataset.language === state.language);
  });
}

function updateIconSchemeControl() {
  const select = document.getElementById("icon-scheme-select");
  const note = document.getElementById("icon-scheme-note");
  if (!select || !note) {
    return;
  }
  const showdownOption = select.querySelector('option[value="showdown"]');
  const pokeIconsOption = select.querySelector('option[value="poke-icons"]');
  if (showdownOption) {
    showdownOption.textContent = t(state.language, "icons.showdown");
  }
  if (pokeIconsOption) {
    pokeIconsOption.textContent = t(state.language, "icons.pokeIcons");
  }
  select.value = state.iconScheme;
  note.textContent = t(state.language, "icons.note");
}

function setLanguage(language, rerender = true) {
  state.language = normalizeLanguage(language);
  localizedLabelsRequestId += 1;
  resetLocalizedLabels();
  applyStaticTranslations(state.language);
  updateLanguageSwitch();
  updateIconSchemeControl();
  if (state.status) {
    renderStatus(t(state.language, state.status.key, state.status.params));
  }
  const importInput = document.getElementById("custom-library-input");
  if (importInput && !importInput.value.trim() && !state.library.length) {
    renderImportFeedback(t(state.language, "controls.importEmpty"));
    translateNodes(document.getElementById("import-feedback"));
  }
  const teamImportInput = document.getElementById("team-import-input");
  if (teamImportInput && !teamImportInput.value.trim()) {
    renderTeamImportFeedback(t(state.language, "team.importEmpty"));
    translateNodes(document.getElementById("team-import-feedback"));
  }
  if (!rerender) {
    return;
  }
  initializeBuilderOptions();
  refreshDerivedState();
  renderAll();
  void syncLocalizedLabelsInBackground();
  scheduleStatePersist();
}

function setIconScheme(iconScheme, rerender = true) {
  const nextScheme = normalizeIconScheme(iconScheme);
  if (nextScheme === state.iconScheme) {
    return;
  }
  state.iconScheme = nextScheme;
  updateIconSchemeControl();
  if (rerender) {
    renderAll();
    scheduleStatePersist();
  }
}

function setActiveView(viewId) {
  state.activeView = viewId;
  document.querySelectorAll(".view-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewId);
  });
  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === viewId);
  });
  if (viewId === "damage-view") {
    void syncDamageWorkspace();
  }
  scheduleStatePersist();
}

function setActiveAnalysisTab(tabId, rerender = true) {
  state.activeAnalysisTab = tabId || "coverage";
  if (rerender) {
    renderAnalysisSection();
  }
}

function setRecommendFocusType(type = "", rerender = true) {
  const recommendationPool = getRecommendationPool();
  state.recommendFocusType = type || "";
  state.recommendations = recommendConfigs(
    recommendationPool,
    state.team,
    state.speedTiers,
    state.language,
    {
      preferences: state.recommendPreferences,
      weights: state.recommendWeights,
      focusType: state.recommendFocusType,
      datasets: state.datasets,
      dismissedKeys: state.dismissedRecommendationKeys,
    },
  );
  if (rerender) {
    renderRecommendationsSection();
  }
}

function toggleRecommendPreference(preferenceId) {
  if (!(preferenceId in state.recommendPreferences)) {
    return;
  }
  state.recommendPreferences = {
    ...state.recommendPreferences,
    [preferenceId]: !state.recommendPreferences[preferenceId],
  };
  refreshBattleState();
  renderAnalysisSection();
  renderRecommendationsSection();
  scheduleStatePersist();
}

function setRecommendWeight(weightId, value) {
  if (!(weightId in state.recommendWeights)) {
    return;
  }
  state.recommendWeights = {
    ...state.recommendWeights,
    [weightId]: Math.min(200, Math.max(0, Math.round(Number(value || 0)))),
  };
  refreshBattleState();
  renderAnalysisSection();
  renderRecommendationsSection();
  scheduleStatePersist();
}

function setRecommendWeightPreview(weightId, value, scope = document) {
  const preview = scope.querySelector(`[data-recommend-weight-value="${weightId}"]`);
  if (!preview) {
    return;
  }
  preview.textContent = `${Math.min(200, Math.max(0, Math.round(Number(value || 0))))}%`;
}

function handleRecommendWeightPreview(event) {
  const input = event.target.closest("[data-recommend-weight]");
  if (!input) {
    return;
  }
  setRecommendWeightPreview(input.dataset.recommendWeight, input.value, event.currentTarget);
}

function handleRecommendWeightCommit(event) {
  const input = event.target.closest("[data-recommend-weight]");
  if (!input) {
    return;
  }
  setRecommendWeight(input.dataset.recommendWeight, input.value);
}

function dismissRecommendation(recommendationKey) {
  if (!recommendationKey || state.dismissedRecommendationKeys.includes(recommendationKey)) {
    return;
  }
  state.dismissedRecommendationKeys = [...state.dismissedRecommendationKeys, recommendationKey];
  refreshBattleState();
  renderRecommendationsSection();
  renderMatchupSection();
  scheduleStatePersist();
}

function resetDismissedRecommendations() {
  if (!state.dismissedRecommendationKeys.length) {
    return;
  }
  state.dismissedRecommendationKeys = [];
  refreshBattleState();
  renderRecommendationsSection();
  renderMatchupSection();
  scheduleStatePersist();
}

function findConfigById(configId) {
  return state.library.find((config) => config.id === configId);
}

function findTeamConfigById(configId) {
  return state.team.find((config) => config.id === configId);
}

function buildTeamEntry(config, teamSource = "library", linkedConfigId = config.id) {
  return createTeamEntry(config, {
    linkedConfigId,
    teamSource,
  });
}

function selectSpecies(speciesId) {
  if (speciesId === state.selectedSpeciesId) {
    return;
  }
  state.selectedSpeciesId = speciesId;
  refreshFilteredLibrary();
  renderLibrarySection();
}

function replaceTeamConfig(configId, nextConfig, metadata = {}) {
  let updatedConfig = null;
  state.team = state.team.map((config) => {
    if (config.id !== configId) {
      return config;
    }
    updatedConfig = createTeamEntry(nextConfig, {
      id: configId,
      linkedConfigId: metadata.linkedConfigId ?? config.linkedConfigId,
      teamSource: metadata.teamSource ?? config.teamSource ?? "team-only",
    });
    return updatedConfig;
  });
  return updatedConfig;
}

function addConfig(configId) {
  const config = findConfigById(configId);
  if (!config || state.team.length >= MAX_TEAM_SIZE) return;
  state.team = [...state.team, buildTeamEntry(config)];
  refreshBattleState();
  renderTeamSection();
  renderAnalysisSection();
  renderMatchupSection();
  renderRecommendationsSection();
  renderDamageSection();
  scheduleStatePersist();
}

function addOpponentSpecies(speciesId) {
  const opponentEntry = findOpponentEntry(state.datasets, state.library, speciesId, state.language);
  if (!opponentEntry || state.opponentTeam.length >= MAX_TEAM_SIZE) return;
  if (state.opponentTeam.some((member) => member.speciesId === opponentEntry.speciesId)) return;
  state.opponentTeam = [...state.opponentTeam, opponentEntry];
  state.matchup = analyzeMatchup(state.team, state.opponentTeam, state.datasets);
  syncDamageSelectionState();
  renderMatchupSection();
  renderDamageSection();
  scheduleStatePersist();
}

function toggleOpponentConfigPicker(speciesId) {
  state.activeOpponentConfigSpeciesId = state.activeOpponentConfigSpeciesId === speciesId ? null : speciesId;
  renderMatchupSection();
}

function selectOpponentConfig(speciesId, selectedConfigId = "") {
  state.opponentTeam = syncOpponentTeam(
    state.opponentTeam.map((entry) => (
      entry.speciesId === speciesId ? {...entry, selectedConfigId} : entry
    )),
    state.datasets,
    state.library,
    state.language,
  );
  state.activeOpponentConfigSpeciesId = null;
  state.matchup = analyzeMatchup(state.team, state.opponentTeam, state.datasets);
  syncDamageSelectionState();
  renderMatchupSection();
  renderDamageSection();
  scheduleStatePersist();
}

function removeConfig(configId) {
  state.team = state.team.filter((config) => config.id !== configId);
  refreshBattleState();
  renderTeamSection();
  renderAnalysisSection();
  renderMatchupSection();
  renderRecommendationsSection();
  renderDamageSection();
  scheduleStatePersist();
}

function removeOpponentSpecies(speciesId) {
  state.opponentTeam = state.opponentTeam.filter((config) => config.speciesId !== speciesId);
  if (state.activeOpponentConfigSpeciesId === speciesId) {
    state.activeOpponentConfigSpeciesId = null;
  }
  state.matchup = analyzeMatchup(state.team, state.opponentTeam, state.datasets);
  syncDamageSelectionState();
  renderMatchupSection();
  renderDamageSection();
  scheduleStatePersist();
}

function deleteConfig(configId) {
  state.library = state.library.filter((config) => config.id !== configId);
  syncTeamWithLibrary();
  refreshDerivedState();
  renderAll();
  scheduleStatePersist();
  setStatus("status.deletedConfig", {count: state.library.length});
}

function applyConfigDisplay(config) {
  return {
    ...config,
    note: String(config.note || "").trim(),
    displayLabel: formatConfigName(config.displayName, config.note),
    speciesLabel: formatConfigName(config.speciesName, config.note),
  };
}

function replaceConfig(configId, nextConfig) {
  let updatedConfig = null;
  state.library = state.library.map((config) => {
    if (config.id !== configId) {
      return config;
    }
    updatedConfig = {...nextConfig, id: configId};
    return updatedConfig;
  });
  if (!updatedConfig) {
    return null;
  }
  state.team = state.team.map((config) => {
    if (config.linkedConfigId !== configId || config.teamSource !== "library") {
      return config;
    }
    return createTeamEntry(updatedConfig, {
      id: config.id,
      linkedConfigId: updatedConfig.id,
      teamSource: "library",
    });
  });
  return updatedConfig;
}

function updateConfigNote(configId) {
  const target = findConfigById(configId);
  if (!target) {
    return;
  }
  const nextNote = window.prompt(
    t(state.language, "prompt.note", {name: target.displayName}),
    target.note || "",
  );
  if (nextNote === null) {
    return;
  }

  replaceConfig(configId, applyConfigDisplay({...target, note: nextNote.trim()}));
  refreshDerivedState();
  renderAll();
  scheduleStatePersist();
  setStatus("status.updatedNote", {name: target.displayName});
}

function getEditorElements() {
  return {
    modal: document.getElementById("config-editor-modal"),
    input: document.getElementById("config-editor-input"),
  };
}

function closeConfigEditor() {
  const {modal, input} = getEditorElements();
  activeEditorTarget = null;
  modal.hidden = true;
  input.value = "";
}

function getGuidedConfigElements() {
  return {
    modal: document.getElementById("guided-config-modal"),
    title: document.getElementById("guided-config-title"),
    subtitle: document.getElementById("guided-config-subtitle"),
    types: document.getElementById("guided-config-types"),
    itemInput: document.getElementById("builder-item-input"),
    itemPicker: document.getElementById("builder-item-picker"),
    abilitySelect: document.getElementById("builder-ability-select"),
    teraSelect: document.getElementById("builder-tera-select"),
    natureSelect: document.getElementById("builder-nature-select"),
    noteInput: document.getElementById("builder-note-input"),
    pointsSummary: document.getElementById("builder-points-summary"),
    pointsGrid: document.getElementById("builder-points-grid"),
    statsGrid: document.getElementById("builder-stats-grid"),
    moveSummary: document.getElementById("builder-move-summary"),
    movesGrid: document.getElementById("builder-moves-grid"),
    feedback: document.getElementById("guided-config-feedback"),
    saveButton: document.getElementById("save-guided-config-btn"),
  };
}

function closeGuidedConfig() {
  const {
    modal,
    title,
    subtitle,
    types,
    itemInput,
    pointsGrid,
    statsGrid,
    movesGrid,
    feedback,
  } = getGuidedConfigElements();
  closeBuilderAutocomplete();
  state.guidedBuilder = null;
  modal.hidden = true;
  title.textContent = "";
  subtitle.textContent = "";
  types.innerHTML = "";
  itemInput.value = "";
  itemInput.disabled = false;
  itemInput.readOnly = false;
  itemInput.title = "";
  pointsGrid.innerHTML = "";
  statsGrid.innerHTML = "";
  movesGrid.innerHTML = "";
  feedback.textContent = "";
  feedback.classList.remove("is-error");
}

function typePillMarkup(type) {
  return `<span class="pill type-pill type-${String(type || "").toLowerCase()}">${getTypeLabel(type, state.language)}</span>`;
}

function syncSelectOptions(select, options, selectedValue, blankLabel = "") {
  select.innerHTML = options.map((option) => {
    if (!option) {
      return `<option value="">${blankLabel}</option>`;
    }
    if (typeof option === "object") {
      return `<option value="${option.value}">${option.label}</option>`;
    }
    return `<option value="${option}">${option}</option>`;
  }).join("");
  select.value = selectedValue || "";
}

function getLocalizedSpeciesName(speciesId, fallbackName = "") {
  if (state.language !== "zh") {
    return fallbackName || speciesId;
  }
  return state.localizedSpeciesNames.get(speciesId) || fallbackName || speciesId;
}

function getLocalizedItemName(itemName) {
  if (state.language !== "zh") {
    return itemName;
  }
  const entry = state.datasets.itemSearchLookup?.get(normalizeLookupText(itemName))
    || state.datasets.itemLookup.get(normalizeName(itemName));
  if (!entry) {
    return itemName;
  }
  return state.localizedItemNames.get(normalizeName(entry.name)) || entry.name;
}

function getLocalizedMoveName(moveName) {
  if (state.language !== "zh") {
    return moveName;
  }
  const entry = state.datasets.moveSearchLookup?.get(normalizeLookupText(moveName))
    || state.datasets.moveLookup.get(normalizeName(moveName));
  if (!entry) {
    return moveName;
  }
  return state.localizedMoveNames.get(normalizeName(entry.name)) || entry.name;
}

function getLocalizedAbilityName(abilityName) {
  if (state.language !== "zh") {
    return abilityName;
  }
  return state.localizedAbilityNames.get(normalizeName(abilityName)) || abilityName;
}

function getLocalizedNatureName(natureName) {
  if (state.language !== "zh") {
    return natureName;
  }
  return state.localizedNatureNames.get(normalizeName(natureName)) || natureName;
}

function getNatureOptionLabel(natureName) {
  return `${getLocalizedNatureName(natureName)} · ${getNatureSummary(natureName, state.language)}`;
}

function buildBuilderSpeedBenchmarks(datasets) {
  const entries = (datasets?.availableSpecies || [])
    .flatMap((species) => ([
      {
        speciesId: species.speciesId,
        speciesName: species.speciesName,
        mode: SPEED_BENCHMARK_FASTEST,
        speed: Number(getBuilderStats(species.speciesId, FULL_SPEED_BUILDER_POINTS, SPEED_BENCHMARK_FAST_NATURE, datasets).spe || 0),
      },
      {
        speciesId: species.speciesId,
        speciesName: species.speciesName,
        mode: SPEED_BENCHMARK_SLOWEST,
        speed: Number(getBuilderStats(species.speciesId, EMPTY_BUILDER_POINTS, SPEED_BENCHMARK_SLOW_NATURE, datasets).spe || 0),
      },
    ]));
  const fastest = entries
    .filter((entry) => entry.mode === SPEED_BENCHMARK_FASTEST)
    .sort((left, right) => left.speed - right.speed);
  const slowest = entries
    .filter((entry) => entry.mode === SPEED_BENCHMARK_SLOWEST)
    .sort((left, right) => left.speed - right.speed);
  const slowCutoffIndex = Math.max(0, Math.floor((fastest.length - 1) * SPEED_BENCHMARK_SLOW_PERCENTILE));
  return {
    fastest,
    slowest,
    // slowCutoff: Number(fastest[slowCutoffIndex]?.speed || 0),
    slowCutoff: 60,
  };
}

function getBuilderSpeedBenchmarkMode(speed) {
  return speed <= Number(state.builderSpeedBenchmarks.slowCutoff || 0)
    ? SPEED_BENCHMARK_SLOWEST
    : SPEED_BENCHMARK_FASTEST;
}

function getSpeedBenchmarkLabel(benchmark) {
  const name = getLocalizedSpeciesName(benchmark.speciesId, benchmark.speciesName);
  const key = benchmark.mode === SPEED_BENCHMARK_FASTEST ? "builder.speedBenchFast" : "builder.speedBenchSlow";
  return t(state.language, key, {name});
}

function findSpeedBenchmarks(speed, benchmarks) {
  let current = null;
  let next = null;
  let tied = false;
  for (const benchmark of benchmarks) {
    if (benchmark.speed < speed) {
      current = benchmark;
      tied = false;
      continue;
    }
    if (benchmark.speed === speed) {
      current = benchmark;
      tied = true;
      continue;
    }
    next = benchmark;
    break;
  }
  return {current, next, tied};
}

function getPointsNeededForSpeedBenchmark(builder, points, targetSpeed) {
  const currentPoints = Number(points.spe || 0);
  for (let extra = 1; currentPoints + extra <= MAX_SPEED_POINTS; extra += 1) {
    const nextStats = getBuilderStats(
      builder.speciesId,
      {...points, spe: currentPoints + extra},
      builder.nature,
      state.datasets,
    );
    if (Number(nextStats.spe || 0) > targetSpeed) {
      return extra;
    }
  }
  return null;
}

function getBuilderSpeedBenchmarkSummary(builder, points, stats) {
  const currentSpeed = Number(stats.spe || 0);
  const mode = getBuilderSpeedBenchmarkMode(currentSpeed);
  const benchmarkPool = mode === SPEED_BENCHMARK_SLOWEST
    ? state.builderSpeedBenchmarks.slowest
    : state.builderSpeedBenchmarks.fastest;
  const comparableBenchmarks = benchmarkPool.filter((entry) => entry.speciesId !== builder.speciesId);
  const {current, next, tied} = findSpeedBenchmarks(currentSpeed, comparableBenchmarks);
  return {
    mode,
    current,
    tied,
    currentDelta: current && !tied ? currentSpeed - current.speed : 0,
    next,
    nextPointDelta: next ? getPointsNeededForSpeedBenchmark(builder, points, next.speed) : null,
  };
}

function getBuilderSpeedBenchmarkSpritePosition(speciesId) {
  const species = (state.datasets?.availableSpecies || []).find((entry) => entry.speciesId === speciesId);
  return species?.spritePosition || null;
}

function renderBuilderSpeedBenchmarkIcon(benchmark) {
  const spritePosition = getBuilderSpeedBenchmarkSpritePosition(benchmark.speciesId);
  if (!spritePosition) {
    return "";
  }
  const {x, y} = spritePosition;
  return `
    <span class="builder-speed-chip-icon" aria-hidden="true">
      <span class="sprite builder-speed-chip-icon-sheet" style="background-position: ${-x}px ${-y}px"></span>
    </span>
  `;
}

function renderBuilderSpeedBenchmarkChip(className, label, value, title, benchmark) {
  return `
    <span class="builder-speed-chip ${className}" title="${escapeHtml(title)}">
      ${benchmark ? renderBuilderSpeedBenchmarkIcon(benchmark) : ""}
      <span class="builder-speed-chip-copy">
        <span class="builder-speed-chip-label">${escapeHtml(label)}</span>
        <span class="builder-speed-chip-value">${escapeHtml(value)}</span>
      </span>
    </span>
  `;
}

function renderBuilderSpeedBenchmarkMarkup(builder, points, stats) {
  const summary = getBuilderSpeedBenchmarkSummary(builder, points, stats);
  const chips = [];
  if (summary.current) {
    const currentLabel = getSpeedBenchmarkLabel(summary.current);
    chips.push(renderBuilderSpeedBenchmarkChip(
      summary.tied ? "builder-speed-chip-tie" : "builder-speed-chip-pass",
      t(state.language, summary.tied ? "builder.speedBenchTieLabel" : "builder.speedBenchPastLabel", {label: currentLabel}),
      t(state.language, summary.tied ? "builder.speedBenchTieValue" : "builder.speedBenchDeltaValue", {delta: summary.currentDelta}),
      `${currentLabel} · Spe ${summary.current.speed}`,
      summary.current,
    ));
  }
  if (summary.next && summary.nextPointDelta !== null) {
    const nextLabel = getSpeedBenchmarkLabel(summary.next);
    chips.push(renderBuilderSpeedBenchmarkChip(
      "builder-speed-chip-next",
      t(state.language, "builder.speedBenchNextLabel", {label: nextLabel}),
      t(state.language, "builder.speedBenchNextValue", {points: summary.nextPointDelta}),
      `${nextLabel} · Spe ${summary.next.speed}`,
      summary.next,
    ));
  }
  if (!chips.length) {
    return "";
  }
  return `<div class="builder-stat-benchmarks">${chips.join("")}</div>`;
}

function renderBuilderStatCard(stat, builder, points, stats) {
  const statLabel = t(state.language, `builder.stats.${stat}`);
  const statValue = Number(stats[stat] || 0);
  if (stat !== "spe") {
    return `
      <div class="builder-stat-card">
        <span>${statLabel}</span>
        <strong class="builder-stat-value">${statValue}</strong>
      </div>
    `;
  }
  return `
    <div class="builder-stat-card builder-stat-card-speed">
      <span>${statLabel}</span>
      <div class="builder-stat-speed-row">
        <strong class="builder-stat-value">${statValue}</strong>
        ${renderBuilderSpeedBenchmarkMarkup(builder, points, stats)}
      </div>
    </div>
  `;
}

function sortNamesByGlobalUsage(names = [], usageCounts = new Map()) {
  return [...names].sort((leftName, rightName) => {
    const usageDiff = (usageCounts.get(normalizeName(rightName)) || 0) - (usageCounts.get(normalizeName(leftName)) || 0);
    if (usageDiff !== 0) {
      return usageDiff;
    }
    return leftName.localeCompare(rightName);
  });
}

function partitionMoveNamesByLegality(moveNames = [], builder) {
  if (!builder?.speciesId) {
    return {legal: [...moveNames], illegal: []};
  }
  const legalMoveIds = getLegalMoveIds(builder.speciesId, state.datasets);
  const legalMoves = [];
  const illegalMoves = [];
  moveNames.forEach((moveName) => {
    const target = legalMoveIds.has(normalizeName(moveName)) ? legalMoves : illegalMoves;
    target.push(moveName);
  });
  return {legal: legalMoves, illegal: illegalMoves};
}

function getSpeciesMatchKeys(speciesId = "") {
  const species = state.datasets?.pokedex?.[speciesId] || {};
  return new Set([
    speciesId,
    species.name,
    species.baseSpecies,
  ].map(normalizeName).filter(Boolean));
}

function isSpeciesExclusiveItem(item) {
  return Boolean(item?.megaStone || (Array.isArray(item?.itemUser) && item.itemUser.length));
}

function isItemCompatibleWithBuilder(itemName, builder) {
  if (!builder?.speciesId) {
    return true;
  }
  const item = state.datasets?.itemLookup?.get(normalizeName(itemName));
  if (!item || !isSpeciesExclusiveItem(item)) {
    return true;
  }
  const speciesKeys = getSpeciesMatchKeys(builder.speciesId);
  const itemUsers = Array.isArray(item.itemUser) ? item.itemUser : [];
  const megaUsers = item.megaStone ? Object.keys(item.megaStone) : [];
  return [...itemUsers, ...megaUsers].some((name) => speciesKeys.has(normalizeName(name)));
}

function partitionItemNamesByCompatibility(itemNames = [], builder) {
  const compatible = [];
  const incompatible = [];
  itemNames.forEach((itemName) => {
    if (isItemCompatibleWithBuilder(itemName, builder)) {
      compatible.push(itemName);
      return;
    }
    incompatible.push(itemName);
  });
  return {compatible, incompatible};
}

function getMoveAutocompleteStats(move) {
  const power = move?.category === "Status" ? "--" : Number(move?.basePower || 0) || "--";
  const accuracy = move?.accuracy === true ? "--" : Number(move?.accuracy || 0) || "--";
  return {power, accuracy};
}

function getTypeClassName(type) {
  return `type-${String(type || "").toLowerCase()}`;
}

function itemSpriteMarkup(item) {
  const spriteNum = Number(item?.spritenum);
  if (!Number.isFinite(spriteNum) || spriteNum < 0) {
    return `<span class="builder-item-sprite builder-item-sprite-fallback"></span>`;
  }
  const {x, y} = getItemSpritePosition(spriteNum);
  return `<span class="item-sprite builder-item-sprite" style="background-position: ${-x}px ${-y}px"></span>`;
}

function buildAccuracyChipMarkup(accuracy) {
  if (accuracy === "--") {
    return `<span class="builder-autocomplete-chip builder-chip-accuracy-any">ACC --</span>`;
  }
  const numericAccuracy = Math.max(50, Math.min(100, Number(accuracy) || 0));
  const hue = Math.round(((numericAccuracy - 50) / 50) * 120);
  const background = `hsla(${hue}, 72%, 90%, 0.96)`;
  const color = `hsl(${hue}, 62%, 28%)`;
  return `<span class="builder-autocomplete-chip" style="background:${background};color:${color};">ACC ${accuracy}</span>`;
}

function buildPowerChipMarkup(power) {
  if (power === "--") {
    return `<span class="builder-autocomplete-chip builder-chip-status-power">BP --</span>`;
  }
  const numericPower = Math.max(20, Math.min(150, Number(power) || 0));
  const hue = Math.round(210 - (((numericPower - 20) / 130) * 190));
  const background = `hsla(${hue}, 78%, 90%, 0.98)`;
  const color = `hsl(${hue}, 70%, 26%)`;
  return `<span class="builder-autocomplete-chip" style="background:${background};color:${color};">BP ${power}</span>`;
}

function buildTypeChipMarkup(type) {
  const background = TYPE_CHIP_COLORS[type] || "#7f8b96";
  return `<span class="builder-autocomplete-chip type-chip" style="background:${background};color:#fff;">${escapeHtml(getTypeLabel(type, state.language))}</span>`;
}

function getAutocompleteDetailText(entry, context) {
  if (context.kind === "move") {
    return entry.move?.shortDesc || entry.move?.desc || "";
  }
  if (context.kind === "item") {
    return entry.item?.shortDesc || entry.item?.desc || "";
  }
  return "";
}

function getLocalizedDetailText(detailText = "") {
  if (state.language !== "zh" || !detailText) {
    return detailText;
  }
  return state.localizedDetailTexts.get(detailText) || detailText;
}

function getRenderedDetailText(detailText = "") {
  if (!detailText) {
    return "";
  }
  if (state.language !== "zh") {
    return detailText;
  }
  return state.localizedDetailTexts.get(detailText) || "";
}

function loadLocalizedDetailText(detailText = "") {
  if (state.language !== "zh" || !detailText) {
    return Promise.resolve(detailText);
  }
  if (state.localizedDetailTexts.has(detailText)) {
    return Promise.resolve(state.localizedDetailTexts.get(detailText));
  }
  if (state.localizedDetailPromises.has(detailText)) {
    return state.localizedDetailPromises.get(detailText);
  }
  const promise = translatePsChinaText("zh", detailText)
    .then((translatedText) => {
      const resolvedText = translatedText || detailText;
      state.localizedDetailTexts.set(detailText, resolvedText);
      state.localizedDetailPromises.delete(detailText);
      return resolvedText;
    })
    .catch(() => {
      state.localizedDetailPromises.delete(detailText);
      return detailText;
    });
  state.localizedDetailPromises.set(detailText, promise);
  return promise;
}

function renderMoveAutocompleteMeta(move) {
  if (!move) {
    return "";
  }
  const {power, accuracy} = getMoveAutocompleteStats(move);
  const categoryClass = `builder-chip-${String(move.category || "status").toLowerCase()}`;
  return `
    <span class="builder-autocomplete-meta">
      ${buildTypeChipMarkup(move.type)}
      <span class="builder-autocomplete-chip ${categoryClass}">${escapeHtml(getMoveCategoryLabel(move.category, state.language))}</span>
      ${buildPowerChipMarkup(power)}
      ${buildAccuracyChipMarkup(accuracy)}
    </span>
  `;
}

function renderAutocompleteOptionContent(entry, context) {
  const primaryLabel = state.language === "zh" ? entry.label : entry.value;
  const detailText = getAutocompleteDetailText(entry, context);
  const renderedDetailText = getRenderedDetailText(detailText);
  if (context.kind === "item") {
    return `
      <span class="builder-autocomplete-row">
        <span class="builder-autocomplete-leading">${itemSpriteMarkup(entry.item)}</span>
        <span class="builder-autocomplete-copy">
          <span>${escapeHtml(primaryLabel)}</span>
          ${detailText ? `<small class="builder-autocomplete-detail">${escapeHtml(renderedDetailText)}</small>` : ""}
        </span>
      </span>
    `;
  }
  if (context.kind !== "move" || !entry.move) {
    return `
      <span class="builder-autocomplete-copy">
        <span>${escapeHtml(primaryLabel)}</span>
        ${detailText ? `<small class="builder-autocomplete-detail">${escapeHtml(renderedDetailText)}</small>` : ""}
      </span>
    `;
  }
  return `
    <span class="builder-autocomplete-copy">
      <span class="builder-autocomplete-title-row">
        <span>${escapeHtml(primaryLabel)}</span>
      </span>
      ${renderMoveAutocompleteMeta(entry.move)}
      ${detailText ? `<small class="builder-autocomplete-detail">${escapeHtml(renderedDetailText)}</small>` : ""}
    </span>
  `;
}

function syncAutocompleteDetailNode(node, detailText = "") {
  if (!node || !detailText) {
    return;
  }
  const localizedDetailText = getLocalizedDetailText(detailText);
  node.textContent = localizedDetailText;
}

function hydrateAutocompletePanelDetails(panel, matches = [], context) {
  if (state.language !== "zh" || !panel?.isConnected || !matches.length) {
    return;
  }
  const optionNodes = panel.querySelectorAll("[data-builder-autocomplete-entry-index]");
  matches.forEach((entry, index) => {
    const optionNode = optionNodes[index];
    const detailNode = optionNode?.querySelector(".builder-autocomplete-detail");
    const detailText = getAutocompleteDetailText(entry, context);
    if (!detailNode || !detailText || state.localizedDetailTexts.has(detailText)) {
      syncAutocompleteDetailNode(detailNode, detailText);
      return;
    }
    void loadLocalizedDetailText(detailText).then((localizedDetailText) => {
      if (!panel.isConnected || optionNodes[index] !== optionNode || !localizedDetailText) {
        return;
      }
      detailNode.textContent = localizedDetailText;
    });
  });
}

async function localizeAbilitySelectOptions(select, abilityNames = []) {
  if (state.language !== "zh" || !select?.isConnected || !abilityNames.length) {
    return;
  }
  const translatedPairs = await Promise.all(abilityNames.map(async (abilityName) => ({
    abilityId: normalizeName(abilityName),
    abilityName,
    translatedName: await translatePsChinaText("zh", abilityName),
  })));
  if (!select.isConnected) {
    return;
  }
  translatedPairs.forEach(({abilityId, abilityName, translatedName}) => {
    state.localizedAbilityNames.set(abilityId, translatedName || abilityName);
  });
  Array.from(select.options).forEach((option) => {
    const localizedName = state.localizedAbilityNames.get(normalizeName(option.value));
    if (localizedName) {
      option.textContent = localizedName;
    }
  });
}

function getBuilderMoveOptionPairs(builder) {
  const lookup = new Map(state.moveAutocompleteEntries.map((entry) => [normalizeName(entry.value), entry]));
  const selectedIds = new Set((builder?.moves || []).map((moveName) => normalizeName(moveName)).filter(Boolean));
  const usageMoves = builder
    ? getUsageMoveEntries(builder.speciesId, state.datasets, {kind: "all", limit: 12, excludeNames: builder.moves || []}).map((entry) => entry.name)
    : [];
  const suggestedMoves = builder
    ? getSuggestedMoveNamesForSpecies(builder.speciesId, state.datasets, builder.moves || [], 8)
    : [];
  const prioritizedMoveNames = [...new Set([...usageMoves, ...suggestedMoves])];
  const legalPrioritizedMoves = partitionMoveNamesByLegality(prioritizedMoveNames, builder).legal;
  const globalMovePartitions = partitionMoveNamesByLegality(state.moveOptions, builder);
  const globalLegalMoves = sortNamesByGlobalUsage(globalMovePartitions.legal, state.datasets?.globalMoveUsageCounts);
  const orderedNames = [];
  const addMoveName = (moveName) => {
    const moveId = normalizeName(moveName);
    if (!moveId || selectedIds.has(moveId) || orderedNames.some((name) => normalizeName(name) === moveId)) {
      return;
    }
    orderedNames.push(moveName);
  };
  legalPrioritizedMoves.forEach(addMoveName);
  globalLegalMoves.forEach(addMoveName);
  globalMovePartitions.illegal.forEach(addMoveName);
  return orderedNames.map((moveName) => lookup.get(normalizeName(moveName)) || {
    value: moveName,
    label: getLocalizedMoveName(moveName),
    move: state.datasets?.moveLookup?.get(normalizeName(moveName)) || null,
  });
}

function getBuilderItemOptionPairs(builder) {
  const lookup = new Map(state.itemAutocompleteEntries.map((entry) => [normalizeName(entry.value), entry]));
  const orderedNames = [];
  const addItemName = (itemName) => {
    const itemId = normalizeName(itemName);
    if (!itemId || orderedNames.some((name) => normalizeName(name) === itemId)) {
      return;
    }
    orderedNames.push(itemName);
  };
  const itemPartitions = partitionItemNamesByCompatibility(state.itemOptions, builder);
  const globalItems = sortNamesByGlobalUsage(itemPartitions.compatible, state.datasets?.globalItemUsageCounts);
  if (builder?.speciesId) {
    getUsageItemEntries(builder.speciesId, state.datasets)
      .map((entry) => entry.name)
      .filter((itemName) => isItemCompatibleWithBuilder(itemName, builder))
      .forEach(addItemName);
  }
  globalItems.forEach(addItemName);
  itemPartitions.incompatible.forEach(addItemName);
  return orderedNames.map((itemName) => lookup.get(normalizeName(itemName)) || {
    value: itemName,
    label: getLocalizedItemName(itemName),
  });
}

function getBuilderOptionValues(entries = []) {
  return entries.map((entry) => (state.language === "zh" ? entry.label : entry.value));
}

function getBuilderMovePicker(index) {
  return document.querySelector(`[data-builder-move-picker="${index}"]`);
}

function getBuilderAutocompleteContext(input) {
  if (input?.id === "builder-item-input") {
    return {kind: "item", index: -1};
  }
  if (input?.dataset?.builderMove != null) {
    return {kind: "move", index: Number(input.dataset.builderMove)};
  }
  return null;
}

function getBuilderAutocompleteInput(context) {
  if (context.kind === "item") {
    return getGuidedConfigElements().itemInput;
  }
  return document.querySelector(`[data-builder-move="${context.index}"]`);
}

function getBuilderAutocompletePanel(context) {
  if (context.kind === "item") {
    return getGuidedConfigElements().itemPicker;
  }
  return getBuilderMovePicker(context.index);
}

function hideBuilderAutocompletePanel(panel) {
  if (!panel) {
    return;
  }
  panel.hidden = true;
  panel.innerHTML = "";
}

function closeBuilderAutocomplete() {
  const {itemPicker, movesGrid} = getGuidedConfigElements();
  hideBuilderAutocompletePanel(itemPicker);
  movesGrid.querySelectorAll(".builder-autocomplete-panel").forEach((panel) => {
    hideBuilderAutocompletePanel(panel);
  });
  activeBuilderAutocomplete = null;
}

function renderBuilderAutocompletePanel(context) {
  const input = getBuilderAutocompleteInput(context);
  const panel = getBuilderAutocompletePanel(context);
  if (!state.guidedBuilder || !input || !panel || input.disabled || input.readOnly) {
    return;
  }
  const entries = context.kind === "item"
    ? getBuilderItemOptionPairs(state.guidedBuilder)
    : getBuilderMoveOptionPairs(state.guidedBuilder);
  const matches = getAutocompleteMatches(entries, input.value);
  if (!matches.length) {
    hideBuilderAutocompletePanel(panel);
    activeBuilderAutocomplete = null;
    return;
  }
  panel.hidden = false;
  panel.innerHTML = matches.map((entry, matchIndex) => `
    <button
      type="button"
      class="builder-autocomplete-option"
      data-builder-autocomplete-entry-index="${matchIndex}"
      data-builder-autocomplete-kind="${context.kind}"
      data-builder-autocomplete-index="${context.index}"
      data-builder-autocomplete-value="${escapeHtml(entry.value)}"
    >
      ${renderAutocompleteOptionContent(entry, context)}
    </button>
  `).join("");
  hydrateAutocompletePanelDetails(panel, matches, context);
  activeBuilderAutocomplete = context;
}

function openBuilderAutocomplete(input) {
  const context = getBuilderAutocompleteContext(input);
  if (!context) {
    closeBuilderAutocomplete();
    return;
  }
  closeBuilderAutocomplete();
  renderBuilderAutocompletePanel(context);
}

function syncBuilderAutocomplete() {
  if (!activeBuilderAutocomplete) {
    return;
  }
  renderBuilderAutocompletePanel(activeBuilderAutocomplete);
}

function selectBuilderAutocompleteValue(kind, index, value) {
  closeBuilderAutocomplete();
  if (kind === "item") {
    const {itemInput} = getGuidedConfigElements();
    itemInput.value = getLocalizedItemName(value);
    updateGuidedBuilderField("item", value);
    return;
  }
  const input = document.querySelector(`[data-builder-move="${index}"]`);
  if (!input) {
    return;
  }
  input.value = getLocalizedMoveName(value);
  updateGuidedBuilderMove(index, value);
}

function renderGuidedConfigForm(builder) {
  const species = state.datasets.pokedex[builder.speciesId];
  const requiredItem = getRequiredItemForSpecies(builder.speciesId, state.datasets);
  const {
    title,
    subtitle,
    types,
    itemInput,
    abilitySelect,
    teraSelect,
    natureSelect,
    noteInput,
    pointsGrid,
    movesGrid,
  } = getGuidedConfigElements();
  title.textContent = t(state.language, "library.openTemplate", {
    name: getLocalizedSpeciesName(builder.speciesId, species?.name || builder.speciesId),
  });
  subtitle.textContent = t(state.language, "builder.copy");
  types.innerHTML = (species?.types || []).map(typePillMarkup).join("");
  itemInput.value = getLocalizedItemName(requiredItem || builder.item);
  itemInput.disabled = Boolean(requiredItem);
  itemInput.readOnly = Boolean(requiredItem);
  itemInput.title = requiredItem || "";
  noteInput.value = builder.note;
  const abilityOptions = getAbilityOptions(builder.speciesId, state.datasets);
  syncSelectOptions(
    abilitySelect,
    abilityOptions.map((abilityName) => ({
      value: abilityName,
      label: getLocalizedAbilityName(abilityName),
    })),
    builder.ability,
  );
  syncSelectOptions(
    teraSelect,
    state.typeOptions.map((type) => ({
      value: type,
      label: type ? getTypeLabel(type, state.language) : `${t(state.language, "common.none")} / ${t(state.language, "common.tera")}`,
    })),
    builder.teraType,
    `${t(state.language, "common.none")} / ${t(state.language, "common.tera")}`,
  );
  syncSelectOptions(
    natureSelect,
    state.natureOptions.map((natureName) => ({
      value: natureName,
      label: getNatureOptionLabel(natureName),
    })),
    builder.nature,
  );
  void localizeAbilitySelectOptions(abilitySelect, abilityOptions);
  pointsGrid.innerHTML = BUILDER_STATS.map((stat) => `
    <label class="builder-point-card">
      <span>${t(state.language, `builder.stats.${stat}`)}</span>
      <input type="number" min="0" max="32" step="1" data-builder-point="${stat}" value="${Number(builder.points[stat] || 0)}">
      <span class="muted">0 - 32</span>
    </label>
  `).join("");
  movesGrid.innerHTML = Array.from({length: 4}, (_, index) => `
    <label class="builder-move-field">
      <span>${t(state.language, "builder.moveSlot", {slot: index + 1})}</span>
      <input
        type="search"
        data-builder-move="${index}"
        value="${getLocalizedMoveName(builder.moves[index] || "")}"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
      >
      <div class="builder-autocomplete-panel" data-builder-move-picker="${index}" hidden></div>
      <span id="builder-move-legality-${index}" class="move-legality"></span>
    </label>
  `).join("");
  translateNodes(types, pointsGrid, movesGrid);
}

function getBuilderErrorMessages(errors) {
  return errors.map((error) => {
    if (error === "points-total") {
      return t(state.language, "builder.pointsInvalid");
    }
    if (error === "item-unknown") {
      return t(state.language, "builder.invalidItem");
    }
    if (error === "ability-illegal") {
      return t(state.language, "builder.invalidAbility");
    }
    if (error === "moves-count") {
      return t(state.language, "builder.movesRequired");
    }
    if (error === "moves-duplicate") {
      return t(state.language, "builder.duplicateMoves");
    }
    if (error === "moves-illegal") {
      return t(state.language, "builder.movesIllegal");
    }
    return error;
  });
}

function getBuilderWarningMessages(warnings) {
  return warnings.map((warning) => {
    if (warning === "item-unknown") {
      return t(state.language, "builder.invalidItem");
    }
    if (warning === "ability-illegal") {
      return t(state.language, "builder.invalidAbility");
    }
    if (warning === "moves-illegal") {
      return t(state.language, "builder.movesIllegal");
    }
    return warning;
  });
}

function getMoveLegalityCopy(check) {
  if (check.status === "legal") {
    return {className: "legal", text: t(state.language, "builder.movesLegal")};
  }
  if (check.status === "illegal") {
    return {className: "illegal", text: t(state.language, "builder.movesIllegal")};
  }
  if (check.status === "unknown") {
    return {className: "unknown", text: t(state.language, "builder.movesUnknown")};
  }
  return {className: "", text: ""};
}

function renderGuidedConfigDerived() {
  const builder = state.guidedBuilder;
  if (!builder) {
    return;
  }
  const {pointsSummary, statsGrid, moveSummary, feedback, saveButton} = getGuidedConfigElements();
  const validation = validateBuilderState(builder, state.datasets);
  const stats = getBuilderStats(builder.speciesId, validation.points, builder.nature, state.datasets);
  pointsSummary.textContent = `${formatChampionPoints(validation.points, state.language)} · ${t(state.language, "builder.pointsSummary", {used: validation.total})}`;
  statsGrid.innerHTML = BUILDER_STATS.map((stat) => renderBuilderStatCard(stat, builder, validation.points, stats)).join("");
  const legalCount = validation.moveChecks.filter((entry) => entry.status === "legal").length;
  const filledCount = builder.moves.filter((move) => move.trim()).length;
  moveSummary.textContent = t(state.language, "builder.moveSummary", {
    filled: filledCount,
    legal: legalCount,
  });
  validation.moveChecks.forEach((check, index) => {
    const node = document.getElementById(`builder-move-legality-${index}`);
    if (!node) {
      return;
    }
    const legality = getMoveLegalityCopy(check);
    node.className = `move-legality ${legality.className}`.trim();
    node.textContent = legality.text;
  });
  const errors = getBuilderErrorMessages(validation.errors);
  const warnings = getBuilderWarningMessages(validation.warnings || []);
  feedback.textContent = errors.length
    ? [t(state.language, "builder.feedbackInvalid"), ...errors].join(" ")
    : warnings.length
      ? [t(state.language, "builder.feedbackWarning"), ...warnings].join(" ")
      : t(state.language, "builder.feedbackReady");
  feedback.classList.toggle("is-error", errors.length > 0);
  saveButton.disabled = !validation.canSave;
  syncBuilderAutocomplete();
}

function renderGuidedConfig() {
  if (!state.guidedBuilder) {
    return;
  }
  renderGuidedConfigForm(state.guidedBuilder);
  renderGuidedConfigDerived();
}

function openGuidedConfig(speciesId, options = {}) {
  state.guidedBuilder = {
    ...createBuilderState(speciesId, state.datasets, options.seedConfig || null),
    addToTeamOnSave: Boolean(options.addToTeamOnSave),
  };
  const {modal} = getGuidedConfigElements();
  renderGuidedConfig();
  modal.hidden = false;
}

function openRecommendationTemplate(configId) {
  const templateConfig = state.recommendations.find((entry) => entry.id === configId && entry.recommendationAction === "configure");
  if (!templateConfig) {
    return;
  }
  openGuidedConfig(templateConfig.speciesId, {
    seedConfig: templateConfig,
    addToTeamOnSave: true,
  });
}

function updateGuidedBuilderField(key, value) {
  if (!state.guidedBuilder) {
    return;
  }
  if (key === "item") {
    const requiredItem = getRequiredItemForSpecies(state.guidedBuilder.speciesId, state.datasets);
    if (requiredItem) {
      const {itemInput} = getGuidedConfigElements();
      itemInput.value = getLocalizedItemName(requiredItem);
      itemInput.disabled = true;
      itemInput.readOnly = true;
      itemInput.title = requiredItem;
      return;
    }
  }
  state.guidedBuilder = {
    ...state.guidedBuilder,
    [key]: value,
  };
  renderGuidedConfigDerived();
}

function updateGuidedBuilderPoint(stat, value) {
  if (!state.guidedBuilder) {
    return;
  }
  const points = {
    ...state.guidedBuilder.points,
    [stat]: Math.min(32, Math.max(0, Math.floor(Number(value || 0)))),
  };
  state.guidedBuilder = {
    ...state.guidedBuilder,
    points,
  };
  renderGuidedConfigDerived();
}

function updateGuidedBuilderMove(index, value) {
  if (!state.guidedBuilder) {
    return;
  }
  const moves = state.guidedBuilder.moves.map((move, moveIndex) => (
    moveIndex === index ? value : move
  ));
  state.guidedBuilder = {
    ...state.guidedBuilder,
    moves,
  };
  renderGuidedConfigDerived();
}

function openConfigEditor(configId, kind = "library") {
  const target = kind === "team"
    ? findTeamConfigById(configId)
    : findConfigById(configId);
  if (!target) {
    return;
  }
  const {modal, input} = getEditorElements();
  activeEditorTarget = {configId, kind};
  input.value = exportConfigToEditableText(target);
  modal.hidden = false;
  input.focus();
  input.setSelectionRange(0, 0);
}

function parseSingleEditedConfig(text) {
  const {configs, errors} = parseShowdownLibrary(text, state.datasets, {
    fallbackLevel: 50,
    language: state.language,
    resolveConvertedPoint: promptMissingPoint,
  });
  if (configs.length !== 1) {
    throw new Error(t(state.language, "error.editSingle"));
  }
  return {config: configs[0], errors};
}

function appendImportedConfigs(configs) {
  const additions = ensureUniqueConfigIds(configs, new Set(state.library.map((config) => config.id)));
  state.library = [...state.library, ...additions];
  return additions;
}

async function initializeLocalizedLabels() {
  if (state.language !== "zh") {
    resetLocalizedLabels();
    return;
  }
  const availableSpecies = state.datasets.availableSpecies || [];
  const itemEntries = Object.values(state.datasets.items || {});
  const moveEntries = Object.values(state.datasets.moves || {});
  const natureEntries = buildNatureOptions();
  const localizedSpeciesPairs = await Promise.all(availableSpecies.map(async (species) => ([
    species.speciesId,
    await translatePsChinaText("zh", species.speciesName),
  ])));
  const localizedItemPairs = await Promise.all(itemEntries.map(async (item) => ([
    item.name,
    await translatePsChinaText("zh", item.name),
  ])));
  const localizedMovePairs = await Promise.all(moveEntries.map(async (move) => ([
    move.name,
    await translatePsChinaText("zh", move.name),
  ])));
  state.localizedSpeciesNames = new Map(localizedSpeciesPairs);
  state.localizedItemNames = new Map(
    localizedItemPairs.map(([name, translatedName]) => [normalizeName(name), translatedName || name]),
  );
  state.localizedMoveNames = new Map(
    localizedMovePairs.map(([name, translatedName]) => [normalizeName(name), translatedName || name]),
  );
  state.localizedAbilityNames = new Map();
  state.localizedNatureNames = new Map(
    natureEntries.map((name) => [normalizeName(name), NATURE_TRANSLATIONS[name] || name]),
  );
  const itemSearchLookup = new Map(state.datasets.itemLookup);
  localizedItemPairs.forEach(([name, translatedName]) => {
    if (!translatedName) {
      return;
    }
    const entry = state.datasets.itemLookup.get(normalizeName(name));
    if (!entry) {
      return;
    }
    itemSearchLookup.set(normalizeLookupText(translatedName), entry);
  });
  state.datasets.itemSearchLookup = itemSearchLookup;
  const searchLookup = new Map(state.datasets.moveLookup);
  localizedMovePairs.forEach(([name, translatedName]) => {
    if (!translatedName) {
      return;
    }
    const entry = state.datasets.moveLookup.get(normalizeName(name));
    if (!entry) {
      return;
    }
    searchLookup.set(normalizeLookupText(translatedName), entry);
  });
  state.datasets.moveSearchLookup = searchLookup;
}

function initializeBuilderOptions() {
  state.itemOptions = getItemOptions(state.datasets);
  state.moveOptions = getMoveOptions(state.datasets);
  state.natureOptions = buildNatureOptions();
  state.typeOptions = getTypeOptions();
  state.builderSpeedBenchmarks = buildBuilderSpeedBenchmarks(state.datasets);
  state.itemOptionLabels = state.itemOptions.map((itemName) => getLocalizedItemName(itemName));
  state.moveOptionLabels = state.moveOptions.map((moveName) => getLocalizedMoveName(moveName));
  state.itemAutocompleteEntries = buildAutocompleteEntries(state.itemOptions, state.itemOptionLabels).map((entry) => ({
    ...entry,
    item: state.datasets?.itemLookup?.get(normalizeName(entry.value)) || null,
  }));
  state.moveAutocompleteEntries = buildAutocompleteEntries(state.moveOptions, state.moveOptionLabels).map((entry) => ({
    ...entry,
    move: state.datasets?.moveLookup?.get(normalizeName(entry.value)) || null,
  }));
}

function confirmAddConfigToLibrary(config, baseConfig, reasonKey) {
  const name = config.displayName || config.speciesName;
  if (!baseConfig) {
    return window.confirm(t(state.language, reasonKey, {name}));
  }
  return window.confirm(t(state.language, reasonKey, {
    name,
    target: baseConfig.displayLabel || baseConfig.displayName,
  }));
}

function saveLibraryConfigEdit(configId, text) {
  const {config, errors} = parseSingleEditedConfig(text);
  const updated = replaceConfig(configId, config);
  if (!updated) {
    return;
  }
  refreshDerivedState();
  renderAll();
  renderImportFeedback(errors.join(" "));
  translateNodes(document.getElementById("import-feedback"));
  closeConfigEditor();
  scheduleStatePersist();
  setStatus("status.editedConfig", {name: updated.displayName});
}

function saveGuidedConfig() {
  if (!state.guidedBuilder) {
    return;
  }
  const validation = validateBuilderState(state.guidedBuilder, state.datasets);
  if (!validation.canSave) {
    renderGuidedConfigDerived();
    return;
  }
  const nextConfig = buildConfigFromBuilder({
    ...state.guidedBuilder,
    item: state.guidedBuilder.item.trim(),
    note: state.guidedBuilder.note.trim(),
    points: validation.points,
    moves: state.guidedBuilder.moves.map((move) => move.trim()),
  }, state.datasets);
  if (!nextConfig) {
    setStatusMessage(t(state.language, "error.invalidBlock", {index: 1}));
    return;
  }
  const addedConfig = appendImportedConfigs([nextConfig])[0];
  if (state.guidedBuilder.addToTeamOnSave && state.team.length < MAX_TEAM_SIZE) {
    state.team = [...state.team, buildTeamEntry(addedConfig)];
  }
  state.selectedSpeciesId = addedConfig.speciesId;
  closeGuidedConfig();
  refreshDerivedState();
  renderAll();
  scheduleStatePersist();
  setStatus(
    state.team.some((config) => config.linkedConfigId === addedConfig.id || config.id === addedConfig.id)
      ? "status.addedGuidedConfigToTeam"
      : "status.addedGuidedConfig",
    {name: addedConfig.displayName},
  );
}

function saveTeamConfigEdit(configId, text) {
  const current = findTeamConfigById(configId);
  if (!current) {
    return;
  }

  const {config, errors} = parseSingleEditedConfig(text);
  const baseConfig = findConfigById(current.linkedConfigId);
  const diff = baseConfig ? compareConfigs(baseConfig, config) : null;
  const shouldAdd = diff?.classification === "major"
    && confirmAddConfigToLibrary(config, baseConfig, "prompt.addLargeEdit");
  const libraryConfig = shouldAdd ? appendImportedConfigs([config])[0] : null;
  const updated = replaceTeamConfig(configId, libraryConfig || config, {
    linkedConfigId: libraryConfig?.id || baseConfig?.id || null,
    teamSource: libraryConfig ? "library" : (baseConfig ? "linked" : "team-only"),
  });
  if (!updated) {
    return;
  }
  refreshDerivedState();
  renderAll();
  renderTeamImportFeedback(errors.join(" "));
  translateNodes(document.getElementById("team-import-feedback"));
  closeConfigEditor();
  scheduleStatePersist();
  setStatus("status.editedTeamConfig", {name: updated.displayName});
}

function saveConfigEdit() {
  const target = activeEditorTarget;
  if (!target) {
    return;
  }
  const {input} = getEditorElements();
  const text = input.value.trim();
  if (!text) {
    setStatusMessage(t(state.language, "error.emptyEditor"));
    return;
  }

  try {
    if (target.kind === "team") {
      saveTeamConfigEdit(target.configId, text);
      return;
    }
    saveLibraryConfigEdit(target.configId, text);
  } catch (error) {
    setStatusMessage(error.message);
  }
}

function syncTeamWithLibrary() {
  state.savedTeams = state.savedTeams.map((team) => ({...team}));
}

function applyImportedLibrary(configs, errors, mode) {
  const baseLibrary = mode === "append" ? state.library : [];
  const usedIds = new Set(baseLibrary.map((config) => config.id));
  const importedConfigs = ensureUniqueConfigIds(configs, usedIds);
  state.library = mode === "append" ? [...baseLibrary, ...importedConfigs] : importedConfigs;
  syncTeamWithLibrary();
  refreshDerivedState();
  renderAll();
  renderImportFeedback([t(state.language, "status.importSuccess", {count: configs.length}), ...errors].join(" "));
  translateNodes(document.getElementById("import-feedback"));
  scheduleStatePersist();
  setStatus("status.libraryCount", {count: state.library.length});
}

function promptMissingPoint({displayName, points}) {
  const summary = [points.hp, points.atk, points.def, points.spa, points.spd, points.spe].join("/");
  while (true) {
    const answer = window.prompt(
      t(state.language, "prompt.extraPoint", {name: displayName, points: summary}),
      t(state.language, "prompt.extraPointDefault"),
    );
    if (answer === null) {
      throw new Error(t(state.language, "alert.importCancelled"));
    }
    const stat = POINT_PROMPT_MAP[normalizeName(answer)];
    if (!stat) {
      window.alert(t(state.language, "alert.invalidStat"));
      continue;
    }
    if (Number(points[stat] || 0) >= 32) {
      window.alert(t(state.language, "alert.pointCap"));
      continue;
    }
    return stat;
  }
}

function createImportedTeamEntry(importedConfig, matchedConfig, teamSource = "team-only") {
  if (teamSource === "library" && matchedConfig) {
    return buildTeamEntry(matchedConfig, "library", matchedConfig.id);
  }
  return createTeamEntry(importedConfig, {
    linkedConfigId: matchedConfig?.id || null,
    teamSource,
  });
}

function resolveImportedTeamMember(importedConfig) {
  const matched = findBestLibraryMatch(importedConfig, state.library);
  if (!matched) {
    const shouldAdd = confirmAddConfigToLibrary(importedConfig, null, "prompt.addMissingImport");
    const addedConfig = shouldAdd ? appendImportedConfigs([importedConfig])[0] : null;
    return createImportedTeamEntry(addedConfig || importedConfig, addedConfig, addedConfig ? "library" : "team-only");
  }

  if (matched.diff.classification === "exact") {
    return createImportedTeamEntry(matched.config, matched.config, "library");
  }

  if (matched.diff.classification === "minor") {
    return createImportedTeamEntry(importedConfig, matched.config, "linked");
  }

  const shouldAdd = confirmAddConfigToLibrary(importedConfig, matched.config, "prompt.addLargeImport");
  const addedConfig = shouldAdd ? appendImportedConfigs([importedConfig])[0] : null;
  return createImportedTeamEntry(addedConfig || importedConfig, addedConfig || matched.config, addedConfig ? "library" : "linked");
}

function importTeamByCode() {
  const input = document.getElementById("team-import-input").value.trim();
  if (!input) {
    renderTeamImportFeedback(t(state.language, "team.importEmpty"));
    translateNodes(document.getElementById("team-import-feedback"));
    return;
  }

  try {
    const {configs, errors} = parseShowdownLibrary(input, state.datasets, {
      fallbackLevel: 50,
      language: state.language,
      resolveConvertedPoint: promptMissingPoint,
    });
    if (configs.length > MAX_TEAM_SIZE) {
      throw new Error(t(state.language, "error.teamImportTooLarge", {count: configs.length}));
    }
    state.team = configs.map(resolveImportedTeamMember);
    refreshDerivedState();
    renderAll();
    renderTeamImportFeedback([t(state.language, "status.importedTeam", {count: state.team.length}), ...errors].join(" "));
    translateNodes(document.getElementById("team-import-feedback"));
    scheduleStatePersist();
    setStatus("status.importedTeam", {count: state.team.length});
  } catch (error) {
    renderTeamImportFeedback(error.message);
    translateNodes(document.getElementById("team-import-feedback"));
    setStatusMessage(error.message);
  }
}

function importCustomLibrary(mode = "replace") {
  const input = document.getElementById("custom-library-input").value.trim();
  if (!input) {
    state.library = [];
    renderImportFeedback(t(state.language, "status.libraryCleared"));
    translateNodes(document.getElementById("import-feedback"));
    refreshDerivedState();
    renderAll();
    scheduleStatePersist();
    setStatus("status.libraryWaiting");
    return;
  }

  try {
    const {configs, errors} = parseShowdownLibrary(input, state.datasets, {
      fallbackLevel: 50,
      language: state.language,
      resolveConvertedPoint: promptMissingPoint,
    });
    applyImportedLibrary(configs, errors, mode);
  } catch (error) {
    renderImportFeedback(error.message);
    translateNodes(document.getElementById("import-feedback"));
    setStatus("status.importCancelled");
  }
}

async function loadPresetLibrary(path, name, mode = "replace") {
  try {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load: ${path}`);
    }
    const text = await response.text();
    document.getElementById("custom-library-input").value = text;
    const {configs, errors} = parseShowdownLibrary(text, state.datasets, {
      fallbackLevel: 50,
      language: state.language,
      resolveConvertedPoint: promptMissingPoint,
    });
    applyImportedLibrary(configs, errors, mode);
    setStatus("status.loadedPreset", {name});
  } catch (error) {
    renderImportFeedback(error.message);
    translateNodes(document.getElementById("import-feedback"));
    setStatusMessage(error.message);
  }
}

async function importLibraryFromFile(file) {
  const text = await file.text();
  document.getElementById("custom-library-input").value = text;
  importCustomLibrary("append");
}

function exportLibrary() {
  if (!state.library.length) {
    setStatus("status.emptyLibraryExport");
    return;
  }
  const content = exportLibraryToShowdown(state.library);
  const blob = new Blob([content], {type: "text/plain;charset=utf-8"});
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "poke-library.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
  setStatus("status.exportedLibrary", {count: state.library.length});
}

function exportTeam() {
  if (!state.team.length) {
    setStatus("status.emptyTeamExport");
    return;
  }
  const content = exportTeamToShowdown(state.team);
  const blob = new Blob([content], {type: "text/plain;charset=utf-8"});
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pokemon-showdown-team.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
  setStatus("status.exportedTeam", {count: state.team.length});
}

function saveCurrentTeam() {
  const input = document.getElementById("saved-team-name");
  const name = input.value.trim();
  if (!name) {
    setStatus("status.teamNameRequired");
    return;
  }
  const snapshot = {
    id: `saved:${Date.now()}`,
    name,
    configs: state.team.map((config) => ({...config})),
    labels: state.team.map((config) => config.displayLabel || config.displayName),
  };
  state.savedTeams = [snapshot, ...state.savedTeams];
  input.value = "";
  refreshDerivedState();
  renderAll();
  scheduleStatePersist();
  setStatus("status.savedTeam", {name});
}

function saveCurrentOpponentTeam() {
  const input = document.getElementById("saved-opponent-name");
  const name = input.value.trim();
  if (!name) {
    setStatus("status.teamNameRequired");
    return;
  }
  const snapshot = createSavedOpponentSnapshot(state.opponentTeam, name);
  state.savedOpponentTeams = [snapshot, ...state.savedOpponentTeams];
  input.value = "";
  refreshDerivedState();
  renderAll();
  scheduleStatePersist();
  setStatus("status.savedOpponentTeam", {name});
}

function loadSavedTeam(teamId) {
  const target = state.savedTeams.find((team) => team.id === teamId);
  if (!target) {
    return;
  }
  if (Array.isArray(target.configs)) {
    state.team = hydrateConfigs(target.configs, state.datasets, 50);
  } else {
    const byId = new Map(state.library.map((config) => [config.id, config]));
    state.team = (target.configIds || []).map((id) => byId.get(id)).filter(Boolean).map((config) => buildTeamEntry(config));
  }
  refreshDerivedState();
  renderAll();
  scheduleStatePersist();
  setStatus("status.loadedTeam", {name: target.name});
}

function loadSavedOpponentTeam(teamId) {
  const target = state.savedOpponentTeams.find((team) => team.id === teamId);
  if (!target) {
    return;
  }
  state.opponentTeam = loadSavedOpponentSelection(target, state.datasets, state.library, state.language);
  state.activeOpponentConfigSpeciesId = null;
  refreshDerivedState();
  renderAll();
  scheduleStatePersist();
  setStatus("status.loadedOpponentTeam", {name: target.name});
}

function deleteSavedTeam(teamId) {
  const before = state.savedTeams.length;
  state.savedTeams = state.savedTeams.filter((team) => team.id !== teamId);
  if (state.savedTeams.length === before) {
    return;
  }
  refreshDerivedState();
  renderAll();
  scheduleStatePersist();
  setStatus("status.deletedSavedTeam", {count: state.savedTeams.length});
}

function deleteSavedOpponentTeam(teamId) {
  const before = state.savedOpponentTeams.length;
  state.savedOpponentTeams = state.savedOpponentTeams.filter((team) => team.id !== teamId);
  if (state.savedOpponentTeams.length === before) {
    return;
  }
  refreshDerivedState();
  renderAll();
  scheduleStatePersist();
  setStatus("status.deletedSavedOpponentTeam", {count: state.savedOpponentTeams.length});
}

function bindEvents() {
  document.querySelector(".view-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    setActiveView(button.dataset.view);
  });

  document.getElementById("analysis-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-analysis-tab]");
    if (!button || button.dataset.analysisTab === state.activeAnalysisTab) {
      return;
    }
    setActiveAnalysisTab(button.dataset.analysisTab);
  });

  document.getElementById("analysis-cores-panel").addEventListener("change", (event) => {
    const select = event.target.closest("[data-core-focus]");
    if (!select || select.value === state.activeCoreConfigId) {
      return;
    }
    state.activeCoreConfigId = select.value || null;
    renderAnalysisSection();
  });

  document.getElementById("language-switch").addEventListener("click", (event) => {
    const button = event.target.closest("[data-language]");
    if (!button || button.dataset.language === state.language) {
      return;
    }
    setLanguage(button.dataset.language);
  });

  document.getElementById("icon-scheme-select").addEventListener("change", (event) => {
    setIconScheme(event.target.value);
  });

  document.getElementById("library-list").addEventListener("click", (event) => {
    const speciesButton = event.target.closest("[data-pick-species]");
    if (speciesButton) {
      selectSpecies(speciesButton.dataset.pickSpecies);
      return;
    }
    const createButton = event.target.closest("[data-create-species-config]");
    if (createButton) {
      openGuidedConfig(createButton.dataset.createSpeciesConfig);
      return;
    }
    const button = event.target.closest("[data-add-config]");
    if (button) {
      addConfig(button.dataset.addConfig);
      return;
    }
    const editButton = event.target.closest("[data-edit-config]");
    if (editButton) {
      openConfigEditor(editButton.dataset.editConfig, "library");
      return;
    }
    const noteButton = event.target.closest("[data-note-config]");
    if (noteButton) {
      updateConfigNote(noteButton.dataset.noteConfig);
      return;
    }
    const deleteButton = event.target.closest("[data-delete-config]");
    if (deleteButton) {
      deleteConfig(deleteButton.dataset.deleteConfig);
    }
  });

  document.getElementById("recommend-list").addEventListener("click", (event) => {
    const dismissButton = event.target.closest("[data-dismiss-recommendation]");
    if (dismissButton) {
      dismissRecommendation(dismissButton.dataset.dismissRecommendation);
      return;
    }
    const resetButton = event.target.closest("[data-reset-dismissed-recommendations]");
    if (resetButton) {
      resetDismissedRecommendations();
      return;
    }
    const templateButton = event.target.closest("[data-open-recommend-template]");
    if (templateButton) {
      openRecommendationTemplate(templateButton.dataset.openRecommendTemplate);
      return;
    }
    const focusButton = event.target.closest("[data-recommend-focus-type]");
    if (focusButton) {
      setRecommendFocusType(focusButton.dataset.recommendFocusType);
      return;
    }
    const preferenceButton = event.target.closest("[data-recommend-preference]");
    if (preferenceButton) {
      toggleRecommendPreference(preferenceButton.dataset.recommendPreference);
      return;
    }
    const button = event.target.closest("[data-add-config]");
    if (button) addConfig(button.dataset.addConfig);
  });
  document.getElementById("recommend-list").addEventListener("input", handleRecommendWeightPreview);
  document.getElementById("recommend-list").addEventListener("change", handleRecommendWeightCommit);

  document.getElementById("matchup-analysis").addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-toggle-opponent-config-picker]");
    if (toggleButton) {
      toggleOpponentConfigPicker(toggleButton.dataset.toggleOpponentConfigPicker);
      return;
    }
    const selectButton = event.target.closest("[data-select-opponent-config]");
    if (selectButton) {
      selectOpponentConfig(
        selectButton.dataset.selectOpponentConfig,
        selectButton.dataset.opponentConfigId || "",
      );
      return;
    }
    const dismissButton = event.target.closest("[data-dismiss-recommendation]");
    if (dismissButton) {
      dismissRecommendation(dismissButton.dataset.dismissRecommendation);
      return;
    }
    const resetButton = event.target.closest("[data-reset-dismissed-recommendations]");
    if (resetButton) {
      resetDismissedRecommendations();
      return;
    }
    const templateButton = event.target.closest("[data-open-recommend-template]");
    if (templateButton) {
      openRecommendationTemplate(templateButton.dataset.openRecommendTemplate);
      return;
    }
    const focusButton = event.target.closest("[data-recommend-focus-type]");
    if (focusButton) {
      setRecommendFocusType(focusButton.dataset.recommendFocusType);
      return;
    }
    const preferenceButton = event.target.closest("[data-recommend-preference]");
    if (preferenceButton) {
      toggleRecommendPreference(preferenceButton.dataset.recommendPreference);
      return;
    }
    const button = event.target.closest("[data-add-config]");
    if (button) {
      addConfig(button.dataset.addConfig);
    }
  });
  document.getElementById("matchup-analysis").addEventListener("input", handleRecommendWeightPreview);
  document.getElementById("matchup-analysis").addEventListener("change", handleRecommendWeightCommit);

  document.getElementById("matchup-search").addEventListener("input", (event) => {
    state.matchupSearch = event.target.value;
    renderMatchupSection();
  });

  document.getElementById("matchup-library-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-add-opponent-species]");
    if (button) addOpponentSpecies(button.dataset.addOpponentSpecies);
  });

  document.getElementById("team-list").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-team]");
    if (editButton) {
      openConfigEditor(editButton.dataset.editTeam, "team");
      return;
    }
    const damageButton = event.target.closest("[data-open-damage-attacker]");
    if (damageButton) {
      openDamagePair({attackerId: damageButton.dataset.openDamageAttacker});
      return;
    }
    const button = event.target.closest("[data-remove-config]");
    if (button) removeConfig(button.dataset.removeConfig);
  });

  document.getElementById("opponent-team-list").addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-toggle-opponent-config-picker]");
    if (toggleButton) {
      toggleOpponentConfigPicker(toggleButton.dataset.toggleOpponentConfigPicker);
      return;
    }
    const selectButton = event.target.closest("[data-select-opponent-config]");
    if (selectButton) {
      selectOpponentConfig(
        selectButton.dataset.selectOpponentConfig,
        selectButton.dataset.opponentConfigId || "",
      );
      return;
    }
    const damageButton = event.target.closest("[data-open-damage-defender]");
    if (damageButton) {
      const defenderId = buildDamageDefenderOptions().find((entry) => {
        return state.opponentTeam.some((teamEntry) => (
          teamEntry.speciesId === damageButton.dataset.openDamageDefender
          && getOpponentVariantConfigs(teamEntry).some((config) => config.id === entry.id)
        ));
      })?.id || "";
      openDamagePair({defenderId});
      return;
    }
    const button = event.target.closest("[data-remove-opponent-species]");
    if (button) removeOpponentSpecies(button.dataset.removeOpponentSpecies);
  });

  document.getElementById("damage-controls").addEventListener("change", (event) => {
    const attackerSelect = event.target.closest("#damage-attacker-select");
    if (attackerSelect) {
      state.damage.attackerId = attackerSelect.value;
      state.damage.lastPairKey = "";
      scheduleStatePersist();
      void syncDamageWorkspace(true);
      return;
    }
    const defenderSelect = event.target.closest("#damage-defender-select");
    if (defenderSelect) {
      state.damage.defenderId = defenderSelect.value;
      state.damage.lastPairKey = "";
      scheduleStatePersist();
      void syncDamageWorkspace(true);
      return;
    }
    const fieldSelect = event.target.closest("[data-damage-field]");
    if (fieldSelect) {
      applyDamageFieldChange(fieldSelect.dataset.damageField, fieldSelect);
      state.damage.lastPairKey = "";
      scheduleStatePersist();
      void syncDamageWorkspace(true);
      return;
    }
  });

  document.getElementById("damage-field").addEventListener("change", (event) => {
    const fieldControl = event.target.closest("[data-damage-field]");
    if (!fieldControl) {
      return;
    }
    applyDamageFieldChange(fieldControl.dataset.damageField, fieldControl);
    state.damage.lastPairKey = "";
    scheduleStatePersist();
    void syncDamageWorkspace(true);
  });

  document.getElementById("damage-controls").addEventListener("click", (event) => {
    const focusButton = event.target.closest("[data-damage-focus-side]");
    if (focusButton) {
      state.damage.focusSide = focusButton.dataset.damageFocusSide;
      renderDamageSection();
      scheduleStatePersist();
      return;
    }
    const button = event.target.closest("[data-sync-damage-workspace]");
    if (button) {
      void syncDamageWorkspace(true);
    }
  });

  document.getElementById("damage-summary").addEventListener("input", (event) => {
    const pickerInput = event.target.closest("[data-damage-move-picker-input]");
    if (pickerInput) {
      if (state.damage.movePicker) {
        state.damage.movePicker.query = pickerInput.value;
      }
      renderDamageMovePickerPanel();
      return;
    }
    const slider = event.target.closest("[data-damage-slider]");
    if (!slider) {
      return;
    }
    setDamageOverride(slider.dataset.damageSlider, slider.value);
    const valueNode = document.querySelector(`[data-damage-slider-value="${slider.dataset.damageSlider}"]`);
    if (valueNode) {
      valueNode.textContent = String(state.damage.overrides[slider.dataset.damageSlider]);
    }
    scheduleStatePersist();
    scheduleDamageSync();
  });

  document.getElementById("damage-summary").addEventListener("click", (event) => {
    const optionButton = event.target.closest("[data-damage-autocomplete-value]");
    if (optionButton) {
      event.preventDefault();
      selectDamageMoveValue(
        optionButton.dataset.damageAutocompleteSide,
        Number(optionButton.dataset.damageAutocompleteIndex),
        optionButton.dataset.damageAutocompleteValue,
      );
      return;
    }
    const editButton = event.target.closest("[data-damage-move-edit]");
    if (editButton) {
      event.preventDefault();
      openDamageMovePicker(
        editButton.dataset.damageMoveSide,
        Number(editButton.dataset.damageMoveIndex),
      );
    }
  });

  document.getElementById("damage-summary").addEventListener("mousedown", (event) => {
    if (event.target.closest("[data-damage-autocomplete-value]")) {
      event.preventDefault();
    }
  });

  document.addEventListener("click", (event) => {
    if (!state.damage.movePicker || state.damage.movePicker.index < 0) return;
    if (event.target.closest(".damage-move-card-editing")) return;
    if (event.target.closest("[data-damage-move-edit]")) return;
    closeDamageMovePicker();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.damage.movePicker && state.damage.movePicker.index >= 0) {
      closeDamageMovePicker();
    }
  });

  document.getElementById("damage-summary").addEventListener("change", (event) => {
    const fieldControl = event.target.closest("[data-damage-field]");
    if (fieldControl) {
      applyDamageFieldChange(fieldControl.dataset.damageField, fieldControl);
      state.damage.lastPairKey = "";
      scheduleStatePersist();
      void syncDamageWorkspace(true);
      return;
    }
    const slider = event.target.closest("[data-damage-slider]");
    if (!slider) {
      return;
    }
    setDamageOverride(slider.dataset.damageSlider, slider.value);
    scheduleStatePersist();
    void syncDamageWorkspace(true);
  });

  document.getElementById("saved-team-list").addEventListener("click", (event) => {
    const loadButton = event.target.closest("[data-load-team]");
    if (loadButton) {
      loadSavedTeam(loadButton.dataset.loadTeam);
      return;
    }
    const deleteButton = event.target.closest("[data-delete-team]");
    if (deleteButton) {
      deleteSavedTeam(deleteButton.dataset.deleteTeam);
    }
  });

  document.querySelector(".team-sidebar-tabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-team-sidebar-tab]");
    if (!tab) {
      return;
    }
    setActiveTeamSidebarTab(tab.dataset.teamSidebarTab);
  });

  document.querySelector(".team-sidebar-tabs").addEventListener("keydown", (event) => {
    const current = event.target.closest("[data-team-sidebar-tab]");
    if (!current || !["ArrowLeft", "ArrowRight"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const tabs = Array.from(document.querySelectorAll("[data-team-sidebar-tab]"));
    const currentIndex = tabs.indexOf(current);
    const nextIndex = event.key === "ArrowRight"
      ? (currentIndex + 1) % tabs.length
      : (currentIndex - 1 + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    setActiveTeamSidebarTab(nextTab.dataset.teamSidebarTab);
    nextTab.focus();
  });

  document.getElementById("saved-opponent-list").addEventListener("click", (event) => {
    const loadButton = event.target.closest("[data-load-opponent-team]");
    if (loadButton) {
      loadSavedOpponentTeam(loadButton.dataset.loadOpponentTeam);
      return;
    }
    const deleteButton = event.target.closest("[data-delete-opponent-team]");
    if (deleteButton) {
      deleteSavedOpponentTeam(deleteButton.dataset.deleteOpponentTeam);
    }
  });

  document.getElementById("clear-team-btn").addEventListener("click", () => {
    if (!window.confirm(t(state.language, "team.clearConfirm"))) {
      return;
    }
    state.team = [];
    refreshBattleState();
    renderTeamSection();
    renderAnalysisSection();
    renderMatchupSection();
    renderRecommendationsSection();
    renderDamageSection();
    scheduleStatePersist();
  });
  document.getElementById("clear-opponent-team-btn").addEventListener("click", () => {
    state.opponentTeam = [];
    state.activeOpponentConfigSpeciesId = null;
    state.matchup = analyzeMatchup(state.team, state.opponentTeam, state.datasets);
    syncDamageSelectionState();
    renderMatchupSection();
    renderDamageSection();
    scheduleStatePersist();
  });
  document.getElementById("export-team-btn").addEventListener("click", exportTeam);
  document.getElementById("sidebar-save-team-btn").addEventListener("click", () => {
    setActiveTeamSidebarTab("saved");
    document.getElementById("saved-team-name").focus();
  });
  document.getElementById("import-team-btn").addEventListener("click", importTeamByCode);
  document.getElementById("clear-team-import-btn").addEventListener("click", () => {
    document.getElementById("team-import-input").value = "";
    renderTeamImportFeedback(t(state.language, "team.importEmpty"));
    translateNodes(document.getElementById("team-import-feedback"));
  });
  document.getElementById("saved-team-search").addEventListener("input", (event) => {
    state.savedTeamSearch = event.target.value;
    renderSavedTeams(state);
    translateNodes(document.getElementById("saved-team-list"));
  });
  document.getElementById("team-list").addEventListener("click", (event) => {
    const openImportButton = event.target.closest("[data-open-team-import]");
    if (!openImportButton) {
      return;
    }
    setActiveTeamSidebarTab("import");
    document.getElementById("team-import-input").focus();
  });

  document.getElementById("import-custom-btn").addEventListener("click", () => importCustomLibrary("replace"));
  document.getElementById("append-custom-btn").addEventListener("click", () => importCustomLibrary("append"));
  document.getElementById("load-ag-preset-btn").addEventListener("click", () => {
    loadPresetLibrary("./config-AG.txt", "AG", "replace");
  });
  document.getElementById("import-file-btn").addEventListener("click", () => {
    document.getElementById("library-file-input").click();
  });
  document.getElementById("library-file-input").addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (file) {
      await importLibraryFromFile(file);
    }
    event.target.value = "";
  });
  document.getElementById("export-library-btn").addEventListener("click", exportLibrary);
  document.getElementById("save-team-btn").addEventListener("click", saveCurrentTeam);
  document.getElementById("save-opponent-team-btn").addEventListener("click", saveCurrentOpponentTeam);
  document.getElementById("save-config-edit-btn").addEventListener("click", saveConfigEdit);
  document.getElementById("save-guided-config-btn").addEventListener("click", saveGuidedConfig);
  document.querySelectorAll("[data-close-editor]").forEach((node) => {
    node.addEventListener("click", closeConfigEditor);
  });
  document.querySelectorAll("[data-close-guided-config]").forEach((node) => {
    node.addEventListener("click", closeGuidedConfig);
  });
  document.getElementById("guided-config-modal").addEventListener("focusin", (event) => {
    if (event.target.closest(".builder-autocomplete-panel, [data-builder-autocomplete-value]")) {
      return;
    }
    const input = event.target.closest("#builder-item-input, [data-builder-move]");
    if (input) {
      openBuilderAutocomplete(input);
      return;
    }
    closeBuilderAutocomplete();
  });
  document.getElementById("guided-config-modal").addEventListener("pointerdown", (event) => {
    const button = event.target.closest("[data-builder-autocomplete-value]");
    if (!button) {
      return;
    }
    event.preventDefault();
    selectBuilderAutocompleteValue(
      button.dataset.builderAutocompleteKind,
      Number(button.dataset.builderAutocompleteIndex),
      button.dataset.builderAutocompleteValue,
    );
  });
  document.getElementById("guided-config-modal").addEventListener("click", (event) => {
    const button = event.target.closest("[data-builder-autocomplete-value]");
    if (button) {
      if (event.detail === 0) {
        selectBuilderAutocompleteValue(
          button.dataset.builderAutocompleteKind,
          Number(button.dataset.builderAutocompleteIndex),
          button.dataset.builderAutocompleteValue,
        );
      }
      return;
    }
    if (!event.target.closest("#builder-item-input, [data-builder-move], .builder-autocomplete-panel")) {
      closeBuilderAutocomplete();
    }
  });
  document.getElementById("builder-item-input").addEventListener("input", (event) => {
    updateGuidedBuilderField("item", event.target.value);
    openBuilderAutocomplete(event.target);
  });
  document.getElementById("builder-ability-select").addEventListener("change", (event) => {
    updateGuidedBuilderField("ability", event.target.value);
    closeBuilderAutocomplete();
  });
  document.getElementById("builder-tera-select").addEventListener("change", (event) => {
    updateGuidedBuilderField("teraType", event.target.value);
    closeBuilderAutocomplete();
  });
  document.getElementById("builder-nature-select").addEventListener("change", (event) => {
    updateGuidedBuilderField("nature", event.target.value);
    closeBuilderAutocomplete();
  });
  document.getElementById("builder-note-input").addEventListener("input", (event) => {
    updateGuidedBuilderField("note", event.target.value);
    closeBuilderAutocomplete();
  });
  document.getElementById("builder-points-grid").addEventListener("input", (event) => {
    const input = event.target.closest("[data-builder-point]");
    if (!input) {
      return;
    }
    updateGuidedBuilderPoint(input.dataset.builderPoint, input.value);
    input.value = state.guidedBuilder?.points?.[input.dataset.builderPoint] ?? "0";
    closeBuilderAutocomplete();
  });
  document.getElementById("builder-moves-grid").addEventListener("input", (event) => {
    const input = event.target.closest("[data-builder-move]");
    if (!input) {
      return;
    }
    updateGuidedBuilderMove(Number(input.dataset.builderMove), input.value);
    openBuilderAutocomplete(input);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.getElementById("config-editor-modal").hidden) {
      closeConfigEditor();
      return;
    }
    if (event.key === "Escape" && !document.getElementById("guided-config-modal").hidden) {
      closeGuidedConfig();
    }
  });
  document.getElementById("clear-custom-btn").addEventListener("click", () => {
    document.getElementById("custom-library-input").value = "";
    importCustomLibrary("replace");
  });
}

function getTooltipElement() {
  if (globalTooltip) {
    return globalTooltip;
  }
  const tooltip = document.createElement("div");
  tooltip.id = "global-tooltip";
  tooltip.className = "global-tooltip";
  tooltip.hidden = true;
  document.body.appendChild(tooltip);
  globalTooltip = tooltip;
  return tooltip;
}

function positionTooltip(target) {
  const tooltip = getTooltipElement();
  const targetRect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const maxLeft = window.innerWidth - tooltipRect.width - 8;
  let left = Math.min(targetRect.left, maxLeft);
  if (left < 8) {
    left = 8;
  }

  let top = targetRect.bottom + TOOLTIP_OFFSET;
  const bottomEdge = top + tooltipRect.height;
  if (bottomEdge > window.innerHeight - 8) {
    top = targetRect.top - tooltipRect.height - TOOLTIP_OFFSET;
  }
  if (top < 8) {
    top = 8;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function showTooltip(target) {
  const content = target.querySelector(".info-tooltip-content");
  if (!content?.innerHTML.trim()) {
    return;
  }
  const tooltip = getTooltipElement();
  tooltip.innerHTML = content.innerHTML;
  tooltip.hidden = false;
  positionTooltip(target);
}

function hideTooltip() {
  if (!globalTooltip) {
    return;
  }
  globalTooltip.hidden = true;
}

function setupTooltipEvents() {
  document.addEventListener("mouseover", (event) => {
    const pill = event.target.closest(".info-pill");
    if (!pill) {
      return;
    }
    showTooltip(pill);
  });

  document.addEventListener("mouseout", (event) => {
    const pill = event.target.closest(".info-pill");
    if (!pill) {
      return;
    }
    if (event.relatedTarget && pill.contains(event.relatedTarget)) {
      return;
    }
    hideTooltip();
  });

  document.addEventListener("focusin", (event) => {
    const pill = event.target.closest(".info-pill");
    if (pill) {
      showTooltip(pill);
    }
  });

  document.addEventListener("focusout", (event) => {
    const pill = event.target.closest(".info-pill");
    if (!pill) {
      return;
    }
    if (event.relatedTarget && pill.contains(event.relatedTarget)) {
      return;
    }
    hideTooltip();
  });

  window.addEventListener("scroll", hideTooltip, true);
  window.addEventListener("resize", hideTooltip);
  window.addEventListener("pagehide", () => {
    flushPersistState(state);
  });
}

async function initialize() {
  const persisted = loadPersistedState();
  state.language = normalizeLanguage(persisted?.language || DEFAULT_LANGUAGE);
  state.iconScheme = normalizeIconScheme(persisted?.iconScheme);
  state.recommendPreferences = normalizeRecommendationPreferences(persisted?.recommendPreferences);
  state.recommendWeights = normalizeRecommendationWeights(persisted?.recommendWeights);
  state.dismissedRecommendationKeys = Array.isArray(persisted?.dismissedRecommendationKeys)
    ? persisted.dismissedRecommendationKeys.filter(Boolean)
    : [];
  setLanguage(state.language, false);
  setStatus("status.initializing");
  state.datasets = await loadDatasets();
  resetLocalizedLabels();
  if (persisted?.library) {
    state.library = ensureUniqueConfigIds(hydrateConfigs(persisted.library, state.datasets, 50));
  }
  if (persisted?.team) {
    state.team = hydrateConfigs(persisted.team, state.datasets, 50);
  }
  if (persisted?.opponentTeam) {
    state.opponentTeam = restoreOpponentTeam(persisted.opponentTeam, state.datasets, state.library, state.language);
  }
  if (persisted?.savedTeams) {
    state.savedTeams = persisted.savedTeams.map((team) => {
      if (Array.isArray(team.configs)) {
        return {
          ...team,
          configs: hydrateConfigs(team.configs, state.datasets, 50),
        };
      }
      return team;
    });
  }
  if (persisted?.savedOpponentTeams) {
    state.savedOpponentTeams = normalizeSavedOpponentTeams(persisted.savedOpponentTeams, state.datasets, state.library, state.language);
  }
  if (persisted?.activeView) {
    state.activeView = persisted.activeView;
  }
  if (persisted?.damage) {
    state.damage.attackerId = persisted.damage.attackerId || "";
    state.damage.defenderId = persisted.damage.defenderId || "";
    state.damage.focusSide = persisted.damage.focusSide === "defender" ? "defender" : "attacker";
    state.damage.overridePairKey = persisted.damage.overridePairKey || "";
    state.damage.overrides = {
      ...state.damage.overrides,
      ...(persisted.damage.overrides || {}),
    };
    state.damage.field = normalizeDamageField(persisted.damage.field);
    state.damage.statuses = normalizeDamageStatuses(persisted.damage.statuses);
    state.damage.healthPercent = normalizeDamageHealth(persisted.damage.healthPercent);
    state.damage.boosts = normalizeDamageBoosts(persisted.damage.boosts);
    state.damage.meta = normalizeDamageMeta(persisted.damage.meta);
    state.damage.teraTypes = normalizeDamageTeraTypes(persisted.damage.teraTypes);
    const persistedSelections = persisted.damage.moveSelections;
    if (persistedSelections && typeof persistedSelections === "object") {
      state.damage.moveSelections = {
        attacker: Array.isArray(persistedSelections.attacker)
          ? [0, 1, 2, 3].map((index) => String(persistedSelections.attacker[index] || ""))
          : ["", "", "", ""],
        defender: Array.isArray(persistedSelections.defender)
          ? [0, 1, 2, 3].map((index) => String(persistedSelections.defender[index] || ""))
          : ["", "", "", ""],
      };
    }
  }
  initializeBuilderOptions();
  bindEvents();
  setupTooltipEvents();
  refreshDerivedState();
  renderAll();
  if (!document.getElementById("custom-library-input").value.trim()) {
    renderImportFeedback(t(state.language, "controls.importEmpty"));
    translateNodes(document.getElementById("import-feedback"));
  }
  if (!document.getElementById("team-import-input").value.trim()) {
    renderTeamImportFeedback(t(state.language, "team.importEmpty"));
    translateNodes(document.getElementById("team-import-feedback"));
  }
  setActiveView(state.activeView);
  if (state.library.length) {
    setStatus("status.restored", {count: state.library.length});
    void syncLocalizedLabelsInBackground();
    return;
  }
  setStatus("status.loadedEmpty");
  void syncLocalizedLabelsInBackground();
}

initialize().catch((error) => {
  console.error(error);
  setStatusMessage(t(state.language, "status.initFailed", {message: error.message}));
});
