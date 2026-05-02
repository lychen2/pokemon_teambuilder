import {analyzeTeam} from "./analysis.js";
import {buildAutocompleteEntries, getAutocompleteMatches} from "./builder-autocomplete.js";
import {buildSyntheticSpeedEntries, clearSpeciesTemplateCache} from "./champions-vgc.js";
import {ICON_SCHEMES, NATURE_TRANSLATIONS} from "./constants.js";
import {calculateConfiguredSpeedTiers, calculateSpeedLineTiers, loadDatasets} from "./data.js";
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
import {buildCounterOpponentSelections} from "./opponent-team-generator.js";
import {
  estimatePersistSize,
  exportFullState,
  flushPersistState,
  importFullState,
  loadPersistedState,
  PERSIST_SIZE_WARNING_BYTES,
  schedulePersistState,
} from "./persistence.js";
import {
  DEFAULT_RECOMMENDATION_PREFERENCES,
  DEFAULT_RECOMMENDATION_WEIGHTS,
  getRecommendationScoreMix,
  normalizeRecommendationPreferences,
  normalizeRecommendationWeights,
} from "./recommendation-preferences.js";
import {recommendConfigs} from "./recommendations.js";
import {buildOutputReferenceConfigs, calculateOutputStrengthTiers} from "./output-strength.js";
import {renderAnalysis, renderDamage, renderImportFeedback, renderLibrary, renderMatchup, renderRecommendations, renderSavedTeams, renderSpeedTiers, renderStatus, renderTeam, renderTeamImportFeedback} from "./render.js";
import {renderRecommendationCards} from "./render-recommendations.js";
import {invalidateRenderCache, setInnerHTMLIfChanged} from "./render-cache.js";
import {closeShortcutsHelp, installKeybindings, openShortcutsHelp} from "./keybindings.js";
import {buildDefaultCommands, createCommandPalette} from "./command-palette.js";
import {focusCommandPaletteInput, installCommandPalette, renderCommandPalette} from "./render-command-palette.js";
import {renderWorkspaceContextBar} from "./render-context-bar.js";
import {renderOutputStrength} from "./render-output.js";
import {renderQuickStart} from "./render-quick-start.js";
import {renderUsageView} from "./render-usage.js";
import {renderVgcpastesPicker} from "./render-vgcpastes-picker.js";
import {renderVgcpastesSuggest} from "./render-vgcpastes-suggest.js";
import {compareSearchMatches, resolveSearchMatch} from "./search-utils.js";
import {createHistoryStore, initializeHistory, recordHistory, redoHistory, snapshotHistoryState, undoHistory} from "./history.js";
import {exportConfigToEditableText, exportLibraryToShowdown, exportTeamToShowdown, hydrateConfigs, parseShowdownLibrary} from "./showdown.js";
import {getHeldItemAdjustedSpeed} from "./speed.js";
import {findStarterTemplate} from "./starter-templates.js";
import {compareConfigs, createTeamEntry, findBestLibraryMatch} from "./team-config.js";
import {toast} from "./toast.js";
import {getUsageItemEntries, getUsageMoveEntries} from "./usage.js";
import {buildUsageConfigText} from "./usage-stats.js";
import {formatChampionPoints, formatConfigName, getItemSpritePosition, getMoveCategoryLabel, getNatureSummary, getTypeLabel, isTypingTarget, normalizeLookupText, normalizeName} from "./utils.js";

const MAX_TEAM_SIZE = 6;
const DEFAULT_CONFIG_LEVEL = 50;
const DEFAULT_PRESET_PATH = "./config-default.txt";
const DEFAULT_PRESET_NAME = "Default";
const VGCPASTES_SETS_PATH = "./static/paste_sets_champions_ma.json";
const IMPORT_FEEDBACK_ERROR = "error";
const LIBRARY_SEARCH_WEIGHTS = Object.freeze({
  species: 0,
  label: 1,
  item: 2,
  ability: 3,
  type: 4,
  move: 5,
});
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
const DEFAULT_BATTLE_FIELD = {
  allyTailwind: false,
  opponentTailwind: false,
  trickRoom: false,
  allyFlags: {},
  opponentFlags: {},
};
const DEFAULT_MATCHUP_FILTERS = {
  types: [],
  speedBucket: "",
  roles: [],
};
const DEFAULT_LIBRARY_COMPARE = {
  speciesId: "",
  selectedConfigIds: [],
};

const state = {
  datasets: null,
  language: DEFAULT_LANGUAGE,
  status: null,
  activeView: "library-view",
  usage: {
    search: "",
    sort: "usage",
    source: "smogon",
    selectedSpeciesId: "",
  },
  iconScheme: ICON_SCHEMES.SHOWDOWN,
  activeAnalysisTab: "coverage",
  activeCoreConfigId: null,
  damage: {
    attackerId: "",
    defenderId: "",
    focusSide: "attacker",
    scanMode: "attacker",
    scanFilter: "all",
    scanResult: null,
    scanLoading: false,
    scanError: "",
    result: null,
    loading: false,
    error: "",
    lastPairKey: "",
    overridePairKey: "",
    overrides: {
      attackerHp: 0,
      attackerAtk: 0,
      attackerDef: 0,
      attackerSpa: 0,
      attackerSpd: 0,
      defenderHp: 0,
      defenderAtk: 0,
      defenderDef: 0,
      defenderSpa: 0,
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
  recommendFocusSource: "",
  recommendMegaOnly: false,
  quickStartDismissed: false,
  recommendPreferences: {...DEFAULT_RECOMMENDATION_PREFERENCES},
  recommendWeights: {...DEFAULT_RECOMMENDATION_WEIGHTS},
  recommendBiasAuto: true,
  recommendScoreMix: getRecommendationScoreMix(0, DEFAULT_RECOMMENDATION_WEIGHTS),
  dismissedRecommendationKeys: [],
  recommendCompareIds: [],
  search: "",
  matchupSearch: "",
  matchupFilters: {...DEFAULT_MATCHUP_FILTERS, types: [], roles: []},
  battleField: {...DEFAULT_BATTLE_FIELD, allyFlags: {}, opponentFlags: {}},
  library: [],
  librarySearchIndex: new Map(),
  filteredLibrary: [],
  allSpeciesBrowser: [],
  speciesBrowser: [],
  selectedSpeciesId: null,
  selectedSpecies: null,
  selectedSpeciesHasConfigs: false,
  libraryCompare: {...DEFAULT_LIBRARY_COMPARE, selectedConfigIds: []},
  matchupLibrary: [],
  speedTiers: [],
  speedLineTiers: [],
  syntheticSpeedEntries: [],
  outputReferences: [],
  outputStrengthTiers: [],
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
  vgcpastesPicker: {
    open: false,
    query: "",
    teams: null,
    loading: false,
    error: "",
  },
};
const stateHistory = createHistoryStore();
let persistLimitWarningShown = false;
let draggedTeamConfigId = "";
let librarySearchDebounceTimer = 0;
let matchupSearchDebounceTimer = 0;
let vgcpastesSearchDebounceTimer = 0;
let savedTeamSearchDebounceTimer = 0;

function attachImeAwareSearchInput(element, runHandler) {
  if (!element) return;
  let composing = false;
  element.addEventListener("compositionstart", () => {
    composing = true;
  });
  element.addEventListener("compositionend", (event) => {
    composing = false;
    runHandler(event.target.value);
  });
  element.addEventListener("input", (event) => {
    if (composing || event.isComposing) {
      return;
    }
    runHandler(event.target.value);
  });
}
let activeCommandPalette = null;
let activeModalState = null;
let modalMutationObserver = null;
let vgcpastesSourceIndex = null;

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
let globalTooltip = null;
let activeEditorTarget = null;
let activeBuilderAutocomplete = null;
let damageWorkspace = null;
let damagePairRequestId = 0;
let damageScanRequestId = 0;
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

function buildDamageOverrides(attacker, defender) {
  return {
    attackerHp: Number(attacker?.championPoints?.hp || 0),
    attackerAtk: Number(attacker?.championPoints?.atk || 0),
    attackerDef: Number(attacker?.championPoints?.def || 0),
    attackerSpa: Number(attacker?.championPoints?.spa || 0),
    attackerSpd: Number(attacker?.championPoints?.spd || 0),
    defenderHp: Number(defender?.championPoints?.hp || 0),
    defenderAtk: Number(defender?.championPoints?.atk || 0),
    defenderDef: Number(defender?.championPoints?.def || 0),
    defenderSpa: Number(defender?.championPoints?.spa || 0),
    defenderSpd: Number(defender?.championPoints?.spd || 0),
  };
}

function getDamageConfigResetSignature(config) {
  if (!config) {
    return "";
  }
  return JSON.stringify({
    id: config.id || "",
    speciesId: config.speciesId || "",
    nature: config.nature || "",
    ability: config.ability || "",
    item: config.item || "",
    teraType: config.teraType || "",
    championPoints: config.championPoints || {},
    moveNames: config.moveNames || [],
  });
}

function buildDamagePairStateKey(attackerConfig, defenderConfig) {
  if (!attackerConfig || !defenderConfig) {
    return "";
  }
  return `${getDamageConfigResetSignature(attackerConfig)}::${getDamageConfigResetSignature(defenderConfig)}`;
}

function resetDamagePairState(attackerConfig, defenderConfig) {
  state.damage.overridePairKey = buildDamagePairStateKey(attackerConfig, defenderConfig);
  state.damage.overrides = buildDamageOverrides(attackerConfig, defenderConfig);
  state.damage.statuses = {...DEFAULT_DAMAGE_STATUSES};
  state.damage.healthPercent = {...DEFAULT_DAMAGE_HEALTH};
  state.damage.boosts = {
    ...DEFAULT_DAMAGE_BOOSTS,
    attacker: {...DEFAULT_DAMAGE_BOOST_SET},
    defender: {...DEFAULT_DAMAGE_BOOST_SET},
  };
  state.damage.meta = {
    ...DEFAULT_DAMAGE_META,
    attacker: {...DEFAULT_DAMAGE_META_SET},
    defender: {...DEFAULT_DAMAGE_META_SET},
  };
  state.damage.teraTypes = {
    attacker: attackerConfig?.teraType || attackerConfig?.types?.[0] || "",
    defender: defenderConfig?.teraType || defenderConfig?.types?.[0] || "",
  };
  invalidateDamageScan();
}

function invalidateDamageScan() {
  damageScanRequestId += 1;
  state.damage.scanResult = null;
  state.damage.scanError = "";
  state.damage.scanLoading = false;
}

function applyDamageOverrides(config, overrides, role, status, currentHpPercent) {
  if (!config) {
    return null;
  }
  const championPoints = {...(config.championPoints || {})};
  championPoints.hp = Number(overrides[`${role}Hp`] || 0);
  championPoints.atk = Number(overrides[`${role}Atk`] || 0);
  championPoints.def = Number(overrides[`${role}Def`] || 0);
  championPoints.spa = Number(overrides[`${role}Spa`] || 0);
  championPoints.spd = Number(overrides[`${role}Spd`] || 0);
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

function setDamageBoostValue(role, stat, value) {
  if (!["attacker", "defender"].includes(role) || !(stat in DEFAULT_DAMAGE_BOOST_SET)) {
    return false;
  }
  state.damage.boosts = setNestedValue(state.damage.boosts, [role, stat], clampDamageBoost(value));
  state.damage.lastPairKey = "";
  invalidateDamageScan();
  return true;
}

function resetDamageBoosts(role) {
  if (!["attacker", "defender"].includes(role)) {
    return false;
  }
  state.damage.boosts = setNestedValue(state.damage.boosts, [role], {...DEFAULT_DAMAGE_BOOST_SET});
  state.damage.lastPairKey = "";
  invalidateDamageScan();
  return true;
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

function syncDamagePairState() {
  const attackerEntry = state.damageAttackers.find((entry) => entry.id === state.damage.attackerId);
  const defenderEntry = state.damageDefenders.find((entry) => entry.id === state.damage.defenderId);
  if (!attackerEntry || !defenderEntry) {
    resetDamagePairState(null, null);
    return true;
  }
  const nextPairKey = buildDamagePairStateKey(attackerEntry.config, defenderEntry.config);
  if (state.damage.overridePairKey === nextPairKey) {
    return false;
  }
  resetDamagePairState(attackerEntry.config, defenderEntry.config);
  return true;
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
  invalidateDamageScan();
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

function renderLibraryImportFeedback(payload) {
  renderImportFeedback(payload, state.language);
}

function renderCurrentTeamImportFeedback(payload) {
  renderTeamImportFeedback(payload, state.language);
}

function buildImportFeedbackPayload(configs = [], feedback = []) {
  const errors = feedback.filter((item) => item.level === IMPORT_FEEDBACK_ERROR).length;
  const warnings = Math.max(0, feedback.length - errors);
  return {
    summary: t(state.language, "import.feedback.summary", {
      count: configs.length,
      warnings,
      errors,
    }),
    items: feedback,
  };
}

function handlePersistError(error) {
  const message = error?.message || t(state.language, "common.unknown");
  announceStatus("status.persistFailed", {message}, {toastType: "error"});
}

function getFullStateImportErrorMessage(error) {
  if (error?.code === "UNSUPPORTED_SCHEMA_VERSION") {
    return t(state.language, "error.unsupportedStateSchema", {
      version: error.schemaVersion ?? "?",
    });
  }
  if (error?.code === "INVALID_JSON" || error?.code === "INVALID_STATE") {
    return t(state.language, "error.invalidFullState");
  }
  return error?.message || t(state.language, "common.unknown");
}

function warnPersistSizeIfNeeded() {
  const size = estimatePersistSize(state);
  if (size > PERSIST_SIZE_WARNING_BYTES) {
    if (!persistLimitWarningShown) {
      persistLimitWarningShown = true;
      setStatus("status.persistNearLimit");
      toast(t(state.language, "status.persistNearLimit"), {type: "warning"});
    }
    return;
  }
  persistLimitWarningShown = false;
}

function scheduleStatePersist() {
  recordHistory(stateHistory, snapshotHistoryState(state));
  warnPersistSizeIfNeeded();
  schedulePersistState(state, {onError: handlePersistError});
}

function flushStatePersist() {
  recordHistory(stateHistory, snapshotHistoryState(state));
  warnPersistSizeIfNeeded();
  flushPersistState(state, {onError: handlePersistError});
}

function resetLibraryCompare(speciesId = "") {
  state.libraryCompare = {
    speciesId,
    selectedConfigIds: [],
  };
}

function sanitizeLibraryCompare() {
  const speciesId = state.selectedSpeciesId || "";
  const selectedIds = speciesId === state.libraryCompare?.speciesId
    ? state.libraryCompare.selectedConfigIds || []
    : [];
  const validIds = new Set(
    state.library
      .filter((config) => config.speciesId === speciesId)
      .map((config) => config.id),
  );
  state.libraryCompare = {
    speciesId,
    selectedConfigIds: selectedIds.filter((configId) => validIds.has(configId)).slice(0, 2),
  };
}

function getLocalizedConfigSearchTerms(config) {
  return {
    species: state.localizedSpeciesNames.get(config.speciesId) || "",
    item: state.localizedItemNames.get(normalizeName(config.item)) || "",
    ability: state.localizedAbilityNames.get(normalizeName(config.ability)) || "",
    nature: state.localizedNatureNames.get(normalizeName(config.nature)) || "",
    moves: (config.moveNames || []).map((moveName) => state.localizedMoveNames.get(normalizeName(moveName)) || ""),
    types: (config.types || []).map((type) => getTypeLabel(type, state.language)),
  };
}

function getConfigSearchFields(config) {
  const localized = getLocalizedConfigSearchTerms(config);
  return [
    {kind: "species", weight: LIBRARY_SEARCH_WEIGHTS.species, texts: [localized.species, config.displayName, config.speciesName]},
    {kind: "label", weight: LIBRARY_SEARCH_WEIGHTS.label, texts: [config.displayLabel, config.note]},
    {kind: "item", weight: LIBRARY_SEARCH_WEIGHTS.item, texts: [config.item, localized.item]},
    {kind: "ability", weight: LIBRARY_SEARCH_WEIGHTS.ability, texts: [config.ability, localized.ability, config.nature, localized.nature]},
    {kind: "type", weight: LIBRARY_SEARCH_WEIGHTS.type, texts: [...(config.types || []), ...localized.types]},
    {kind: "move", weight: LIBRARY_SEARCH_WEIGHTS.move, texts: [...(config.moveNames || []), ...localized.moves]},
  ];
}

function getSearchTextFromFields(fields = []) {
  return normalizeLookupText(fields.flatMap((field) => field.texts || field.text || []).join(" "));
}

function buildLibrarySearchIndex() {
  const configEntries = state.library.map((config) => {
    return [config.id, getSearchTextFromFields(getConfigSearchFields(config))];
  });
  const speciesEntries = state.library.reduce((map, config) => {
    const haystack = getSearchTextFromFields(getConfigSearchFields(config));
    const current = map.get(config.speciesId) || "";
    map.set(config.speciesId, `${current} ${haystack}`);
    return map;
  }, new Map());
  state.librarySearchIndex = {
    configs: new Map(configEntries),
    species: speciesEntries,
  };
}

function refreshFilteredLibrary() {
  const searchToken = normalizeLookupText(state.search);
  const configSearchIndex = state.librarySearchIndex?.configs || new Map();
  const speciesSearchIndex = state.librarySearchIndex?.species || new Map();
  const configsBySpecies = state.library.reduce((map, config) => {
    const current = map.get(config.speciesId) || [];
    map.set(config.speciesId, [...current, config]);
    return map;
  }, new Map());
  sanitizeLibraryCompare();
  state.selectedSpecies = state.allSpeciesBrowser.find((entry) => entry.speciesId === state.selectedSpeciesId) || null;
  state.selectedSpeciesHasConfigs = state.selectedSpecies
    ? state.library.some((config) => config.speciesId === state.selectedSpeciesId)
    : false;
  state.speciesBrowser = filterSpeciesBrowser(searchToken, speciesSearchIndex, configsBySpecies);
  state.filteredLibrary = filterLibraryConfigs(searchToken, configSearchIndex);
}

function filterSpeciesBrowser(searchToken, speciesSearchIndex, configsBySpecies) {
  return state.allSpeciesBrowser.map((species, index) => ({
    species,
    index,
    searchMatch: resolveSearchMatch([
      {kind: "species", texts: [species.localizedSpeciesName, species.speciesName], weight: LIBRARY_SEARCH_WEIGHTS.species},
      ...(configsBySpecies.get(species.speciesId) || []).flatMap(getConfigSearchFields),
    ], state.search),
  })).filter(({species, searchMatch}) => (
    !searchToken
      || Boolean(searchMatch)
      || species.searchText.includes(searchToken)
      || String(speciesSearchIndex.get(species.speciesId) || "").includes(searchToken)
  )).sort((left, right) => {
    if (!searchToken) return left.index - right.index;
    const searchOrder = compareSearchMatches(left.searchMatch, right.searchMatch);
    return searchOrder || left.index - right.index;
  }).map(({species, searchMatch}) => searchMatch ? {...species, searchMatch} : species);
}

function filterLibraryConfigs(searchToken, configSearchIndex) {
  if (searchToken) {
    return state.library.map((config, index) => ({
      config,
      index,
      searchMatch: resolveSearchMatch(getConfigSearchFields(config), state.search),
    })).filter(({config, searchMatch}) => (
      searchMatch || String(configSearchIndex.get(config.id) || "").includes(searchToken)
    )).sort((left, right) => {
      const searchOrder = compareSearchMatches(left.searchMatch, right.searchMatch);
      return searchOrder || left.index - right.index;
    }).map(({config, searchMatch}) => searchMatch ? {...config, searchMatch} : config);
  }
  if (!state.selectedSpeciesId) {
    return [];
  }
  return state.library.filter((config) => config.speciesId === state.selectedSpeciesId);
}

function refreshLibraryState() {
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
  state.opponentTeam = syncOpponentTeam(state.opponentTeam, state.datasets, state.library, state.language);
  if (state.activeOpponentConfigSpeciesId && !state.opponentTeam.some((entry) => entry.speciesId === state.activeOpponentConfigSpeciesId)) {
    state.activeOpponentConfigSpeciesId = null;
  }
  state.savedOpponentTeams = normalizeSavedOpponentTeams(state.savedOpponentTeams, state.datasets, state.library, state.language);
  buildLibrarySearchIndex();
  refreshFilteredLibrary();
}

function sanitizeBattleFlags() {
  const allyKeys = new Set(state.team.map((config) => String(config.id || "")));
  const opponentKeys = new Set(state.opponentTeam.map((entry) => String(entry.speciesId || "")));
  state.battleField.allyFlags = Object.fromEntries(
    Object.entries(state.battleField.allyFlags || {}).filter(([key]) => allyKeys.has(key)),
  );
  state.battleField.opponentFlags = Object.fromEntries(
    Object.entries(state.battleField.opponentFlags || {}).filter(([key]) => opponentKeys.has(key)),
  );
}

function refreshSpeedState() {
  state.speedTiers = calculateConfiguredSpeedTiers(state.library, {
    fieldState: state.battleField,
    defaultSide: "ally",
  });
  state.speedLineTiers = calculateSpeedLineTiers([...state.syntheticSpeedEntries, ...state.library], {
    fieldState: state.battleField,
    defaultSide: "ally",
  });
}

function refreshOutputState() {
  state.outputReferences = buildOutputReferenceConfigs(state.datasets, state.language);
  state.outputStrengthTiers = calculateOutputStrengthTiers([...state.outputReferences, ...state.library], state.datasets);
}

function isMegaSpeciesId(speciesId) {
  return /mega(?:[a-z])?$/.test(String(speciesId || ""));
}

function getRecommendationPool() {
  if (!state.datasets?.availableSpecies?.length) {
    return state.library;
  }
  const availableSpeciesIds = new Set(
    state.datasets.availableSpecies.map((species) => species.speciesId).filter(Boolean),
  );
  let pool = state.library.filter((config) => availableSpeciesIds.has(config.speciesId));
  if (state.recommendMegaOnly) {
    pool = pool.filter((config) => isMegaSpeciesId(config.speciesId));
  }
  return pool;
}

function refreshRecommendationsState() {
  const recommendationPool = getRecommendationPool();
  const weaknessTypes = new Set((state.analysis?.coverage?.weakRows || []).map((entry) => entry.type));
  if (state.recommendFocusType && !weaknessTypes.has(state.recommendFocusType)) {
    state.recommendFocusType = "";
  }
  const recommendationState = recommendConfigs(
    recommendationPool,
    state.team,
    state.speedTiers,
    state.language,
    {
      analysis: state.analysis,
      preferences: state.recommendPreferences,
      weights: state.recommendWeights,
      autoBias: state.recommendBiasAuto,
      focusType: state.recommendFocusType,
      datasets: state.datasets,
      dismissedKeys: state.dismissedRecommendationKeys,
      fieldState: state.battleField,
      megaOnly: state.recommendMegaOnly,
    },
  );
  if (state.recommendBiasAuto) {
    state.recommendWeights = {
      ...state.recommendWeights,
      pairingBias: recommendationState.scoreMix.pairingBias,
    };
  }
  state.recommendations = recommendationState.recommendations;
  state.recommendScoreMix = recommendationState.scoreMix;
  const availableIds = new Set(state.recommendations.map((entry) => entry.id));
  state.recommendCompareIds = state.recommendCompareIds.filter((id) => availableIds.has(id)).slice(0, 2);
}

function applyAutoRecommendBias() {
  state.recommendBiasAuto = true;
  refreshRecommendationsState();
  renderRecommendationsSection();
  scheduleStatePersist();
}

function refreshBattleState() {
  sanitizeBattleFlags();
  refreshSpeedState();
  refreshOutputState();
  const recommendationPool = getRecommendationPool();
  state.analysis = analyzeTeam(
    state.team,
    state.speedTiers,
    state.language,
    recommendationPool,
    state.recommendPreferences,
    {fieldState: state.battleField, datasets: state.datasets},
  );
  state.matchup = analyzeMatchup(state.team, state.opponentTeam, state.datasets, {
    fieldState: state.battleField,
  });
  if (!state.team.some((config) => config.id === state.activeCoreConfigId)) {
    state.activeCoreConfigId = state.team[0]?.id || null;
  }
  refreshRecommendationsState();
  syncDamageSelectionState();
}

function buildDamageOptionLabel(config) {
  const fallback = config?.displayName || config?.speciesName || t(state.language, "common.unknown");
  const base = getLocalizedSpeciesName(config?.speciesId || "", fallback);
  const note = (config?.note || "").trim();
  return note ? `${base} · ${note}` : base;
}

function buildDamageAttackerOptions() {
  return state.team.map((config) => ({
    id: config.id,
    label: buildDamageOptionLabel(config),
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
    label: buildDamageOptionLabel(config),
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
  if (
    state.damage.attackerId !== previousAttackerId
    || state.damage.defenderId !== previousDefenderId
  ) {
    invalidateDamageScan();
  }
  if (!state.damage.attackerId || !state.damage.defenderId) {
    state.damage.result = null;
    state.damage.error = "";
    state.damage.lastPairKey = "";
    resetDamagePairState(null, null);
    return;
  }
  const pairStateChanged = syncDamagePairState();
  if (pairStateChanged) {
    state.damage.result = null;
    state.damage.error = "";
    state.damage.lastPairKey = "";
  }
}

function getDamageWorkspaceSnapshot(config) {
  if (!config) {
    return null;
  }
  return {
    id: config.id || "",
    speciesId: config.speciesId || "",
    nature: config.nature || "",
    ability: config.ability || "",
    item: config.item || "",
    teraType: config.teraType || "",
    status: config.status || "",
    currentHpPercent: Number(config.currentHpPercent || 0),
    championPoints: config.championPoints || {},
    boosts: config.boosts || {},
    dynamax: Boolean(config.dynamax),
    terastal: Boolean(config.terastal),
    abilityActive: Boolean(config.abilityActive),
    moveNames: config.moveNames || [],
  };
}

function buildDamageWorkspaceKey(attacker, defender, field) {
  if (!attacker || !defender) {
    return "";
  }
  return JSON.stringify({
    attacker: getDamageWorkspaceSnapshot(attacker),
    defender: getDamageWorkspaceSnapshot(defender),
    field,
  });
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
  invalidateDamageScan();
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

function buildDamageScanRangeText(entry = {}) {
  const min = Number(entry.minPercent || 0);
  const max = Number(entry.maxPercent || 0);
  return min === max ? `${max}%` : `${min}% - ${max}%`;
}

function buildAttackerScanRow(defender, result) {
  const displayMoves = state.damage.displayMoveNames?.attacker || [];
  const cells = displayMoves.map((moveName) => {
    const match = (result.leftMoves || []).find((entry) => entry.moveName === moveName) || null;
    return {
      moveName: moveName || t(state.language, "common.none"),
      minPercent: match?.minPercent || 0,
      maxPercent: match?.maxPercent || 0,
      koText: match?.koText || "",
      rangeText: match ? buildDamageScanRangeText(match) : "--",
    };
  });
  return {
    openId: defender.id,
    speciesId: defender.speciesId || "",
    speciesName: defender.speciesName || defender.displayName || "",
    spritePosition: defender.spritePosition,
    spriteSpeciesId: defender.spriteSpeciesId || defender.speciesId || "",
    label: buildDamageOptionLabel(defender),
    cells,
  };
}

function buildDefenderScanRow(attacker, result) {
  const moves = result.leftMoves || [];
  const bestCell = moves.reduce((winner, current) => {
    return Number(current.maxPercent || 0) > Number(winner.maxPercent || 0) ? current : winner;
  }, moves[0] || {moveName: "", minPercent: 0, maxPercent: 0, koText: ""});
  return {
    openId: attacker.id,
    speciesId: attacker.speciesId || "",
    speciesName: attacker.speciesName || attacker.displayName || "",
    spritePosition: attacker.spritePosition,
    spriteSpeciesId: attacker.spriteSpeciesId || attacker.speciesId || "",
    label: buildDamageOptionLabel(attacker),
    bestCell: {
      moveName: bestCell.moveName || t(state.language, "common.none"),
      minPercent: bestCell.minPercent || 0,
      maxPercent: bestCell.maxPercent || 0,
      koText: bestCell.koText || "",
      rangeText: bestCell.moveName ? buildDamageScanRangeText(bestCell) : "--",
    },
  };
}

function getUniqueDamageScanEntries(entries = []) {
  const selectedDefenderId = state.damage.defenderId;
  const bySpecies = new Map();
  entries.forEach((entry) => {
    const speciesKey = entry.config?.speciesId || entry.id;
    if (!speciesKey) return;
    const current = bySpecies.get(speciesKey);
    if (!current || entry.id === selectedDefenderId) {
      bySpecies.set(speciesKey, entry);
    }
  });
  return [...bySpecies.values()];
}

function buildDamageScanDefenderEntries() {
  return getUniqueDamageScanEntries(state.damageDefenders);
}

function buildOpponentAttackConfigs() {
  return buildDamageScanDefenderEntries().map((entry) => {
    const moveNames = resolveDamageMoveNamesForConfig(entry.config, buildDamageAllyTargets(), state.datasets);
    return {
      ...entry.config,
      moveNames,
      status: DEFAULT_DAMAGE_STATUSES.defender,
      currentHpPercent: DEFAULT_DAMAGE_HEALTH.defender,
    };
  });
}

async function syncDamageScan(mode = state.damage.scanMode) {
  const ally = getSelectedDamageAttacker();
  if (!ally) {
    invalidateDamageScan();
    renderDamageSection();
    return;
  }
  if (!state.damageDefenders.length) {
    state.damage.scanResult = null;
    state.damage.scanError = t(state.language, "damage.scanNeedOpponents");
    state.damage.scanLoading = false;
    renderDamageSection();
    return;
  }
  if (!damageWorkspace) {
    damageWorkspace = createDamageWorkspace();
  }
  const defenderEntries = buildDamageScanDefenderEntries();
  const requestId = ++damageScanRequestId;
  state.damage.scanMode = mode;
  state.damage.scanLoading = true;
  state.damage.scanError = "";
  scheduleStatePersist();
  renderDamageSection();
  try {
    const rows = mode === "defender"
      ? await damageWorkspace.scanAttackersIntoDefender(buildOpponentAttackConfigs(), ally, state.damage.field)
      : await damageWorkspace.scanAttackerAgainstTargets(ally, defenderEntries.map((entry) => entry.config), state.damage.field);
    if (requestId !== damageScanRequestId) return;
    state.damage.scanResult = {
      mode,
      rows: mode === "defender"
        ? rows.map(({attacker, result}) => buildDefenderScanRow(attacker, result))
        : rows.map(({defender, result}) => buildAttackerScanRow(defender, result)),
    };
    state.damage.scanLoading = false;
    state.damage.scanError = "";
    renderDamageSection();
  } catch (error) {
    if (requestId !== damageScanRequestId) return;
    state.damage.scanLoading = false;
    state.damage.scanResult = null;
    state.damage.scanError = error instanceof Error ? error.message : String(error);
    renderDamageSection();
  }
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
  const nextPairKey = buildDamageWorkspaceKey(attacker, defender, state.damage.field);
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
  const requestId = ++damagePairRequestId;
  state.damage.loading = true;
  state.damage.error = "";
  renderDamageSection();
  try {
    const result = await damageWorkspace.syncPair(attacker, defender, state.damage.field);
    if (requestId !== damagePairRequestId) {
      return;
    }
    if (result === null) {
      return;
    }
    state.damage.result = result;
    state.damage.lastPairKey = nextPairKey;
    state.damage.loading = false;
    state.damage.error = "";
    renderDamageSection();
  } catch (error) {
    if (requestId !== damagePairRequestId) {
      return;
    }
    state.damage.loading = false;
    state.damage.result = null;
    state.damage.error = error instanceof Error ? error.message : String(error);
    renderDamageSection();
    toast(t(state.language, "toast.damageSyncFailed"), {type: "error"});
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
}

function scheduleLibrarySearchRender(nextValue) {
  state.search = nextValue;
  window.clearTimeout(librarySearchDebounceTimer);
  librarySearchDebounceTimer = window.setTimeout(() => {
    librarySearchDebounceTimer = 0;
    refreshFilteredLibrary();
    renderLibrarySection();
  }, 280);
}

function renderQuickStartSection() {
  renderQuickStart(state);
  renderVgcpastesPicker(state);
}

function focusVgcpastesSearchInput() {
  const input = document.getElementById("vgcpastes-picker-search");
  if (!input) {
    return;
  }
  input.focus();
  const length = input.value.length;
  try {
    input.setSelectionRange(length, length);
  } catch (_error) {
    // Some search inputs do not expose selection APIs.
  }
}

function scheduleVgcpastesSearchRender(nextValue) {
  state.vgcpastesPicker.query = nextValue;
  window.clearTimeout(vgcpastesSearchDebounceTimer);
  vgcpastesSearchDebounceTimer = window.setTimeout(() => {
    vgcpastesSearchDebounceTimer = 0;
    renderVgcpastesPicker(state);
    focusVgcpastesSearchInput();
  }, 180);
}

function renderTeamSection() {
  syncTeamSidebarState();
  renderTeam(state);
  renderSavedTeams(state);
  syncTeamSidebarUi();
  renderWorkspaceContextSection();
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
}

function renderMatchupSection() {
  renderMatchup(state);
  renderVgcpastesSuggest(state);
  renderWorkspaceContextSection();
  if (state.opponentTeam.length >= 1 && state.opponentTeam.length < 6) {
    void loadVgcpastesPickerData();
  }
}

function scheduleMatchupSearchRender(nextValue) {
  state.matchupSearch = nextValue;
  window.clearTimeout(matchupSearchDebounceTimer);
  matchupSearchDebounceTimer = window.setTimeout(() => {
    matchupSearchDebounceTimer = 0;
    renderMatchupSection();
  }, 150);
}

function renderRecommendationsSection() {
  renderRecommendations(state);
  renderWorkspaceContextSection();
}

function renderUsageSection() {
  renderUsageView(state);
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
}

function renderOutputSection() {
  renderOutputStrength(state);
}

function renderCurrentWorkspaceSection() {
  switch (state.activeView) {
    case "library-view":
      renderLibrarySection();
      break;
    case "analysis-view":
      renderAnalysisSection();
      break;
    case "matchup-view":
      renderMatchupSection();
      break;
    case "recommend-view":
      renderRecommendationsSection();
      break;
    case "usage-view":
      renderUsageSection();
      break;
    case "damage-view":
      renderDamageSection();
      break;
    case "speed-view":
      renderSpeedSection();
      break;
    case "output-view":
      renderOutputSection();
      break;
    default:
      renderLibrarySection();
      break;
  }
}

function renderWorkspaceContextSection() {
  renderWorkspaceContextBar(state);
}

function renderAll() {
  renderQuickStartSection();
  renderTeamSection();
  renderWorkspaceContextSection();
  renderCurrentWorkspaceSection();
  renderGuidedConfig();
}

function setStatus(key, params = {}) {
  state.status = {key, params};
  renderStatus(t(state.language, key, params));
}

function setStatusMessage(message) {
  state.status = null;
  renderStatus(message);
}

function announceStatus(key, params = {}, options = {}) {
  setStatus(key, params);
  if (options.toastType) {
    toast(t(state.language, key, params), {type: options.toastType});
  }
}

function announceStatusMessage(message, options = {}) {
  setStatusMessage(message);
  if (options.toastType) {
    toast(message, {type: options.toastType});
  }
}

function syncLocalizedData() {
  state.localizedSpeciesNames = new Map(state.datasets?.localizedSpeciesNames || []);
  state.localizedItemNames = new Map(state.datasets?.localizedItemNames || []);
  state.localizedMoveNames = new Map(state.datasets?.localizedMoveNames || []);
  state.localizedAbilityNames = new Map(state.datasets?.localizedAbilityNames || []);
  state.localizedNatureNames = new Map();
  buildNatureOptions().forEach((name) => {
    state.localizedNatureNames.set(normalizeName(name), NATURE_TRANSLATIONS[name] || name);
  });
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
  clearSpeciesTemplateCache(state.datasets);
  applyStaticTranslations(state.language);
  updateLanguageSwitch();
  updateIconSchemeControl();
  if (state.status) {
    renderStatus(t(state.language, state.status.key, state.status.params));
  }
  const importInput = document.getElementById("custom-library-input");
  if (importInput && !importInput.value.trim() && !state.library.length) {
    renderLibraryImportFeedback(t(state.language, "controls.importEmpty"));
  }
  const teamImportInput = document.getElementById("team-import-input");
  if (teamImportInput && !teamImportInput.value.trim()) {
    renderCurrentTeamImportFeedback(t(state.language, "team.importEmpty"));
  }
  if (!rerender) {
    return;
  }
  initializeBuilderOptions();
  refreshDerivedState();
  invalidateRenderCache();
  renderAll();
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
    invalidateRenderCache();
    renderAll();
    scheduleStatePersist();
  }
}

function applyActiveView(viewId) {
  state.activeView = viewId;
  document.querySelectorAll(".view-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewId);
  });
  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === viewId);
  });
  renderQuickStartSection();
  renderWorkspaceContextSection();
  renderCurrentWorkspaceSection();
  scheduleStatePersist();
}

function setActiveView(viewId) {
  if (typeof document.startViewTransition !== "function") {
    applyActiveView(viewId);
    return;
  }

  document.startViewTransition(() => applyActiveView(viewId));
}

function openLibraryImportPanel() {
  const panel = document.querySelector(".import-panel");
  if (panel) {
    panel.open = true;
  }
  document.getElementById("custom-library-input")?.focus();
}

function openTeamImportPanel() {
  setActiveTeamSidebarTab("import");
  document.getElementById("team-import-input")?.focus();
}

function dismissQuickStart() {
  if (state.quickStartDismissed) {
    return;
  }
  state.quickStartDismissed = true;
  scheduleStatePersist();
  renderQuickStart(state);
}

function handleQuickStartAction(action) {
  if (action === "dismiss") {
    dismissQuickStart();
    return;
  }
  if (action === "load-default") {
    void loadPresetLibrary(DEFAULT_PRESET_PATH, DEFAULT_PRESET_NAME, "replace");
    return;
  }
  if (action === "paste-library") {
    openLibraryImportPanel();
    return;
  }
  if (action === "paste-team") {
    openTeamImportPanel();
    return;
  }
  if (action === "analysis") {
    setActiveView("analysis-view");
  }
}

function setActiveAnalysisTab(tabId, rerender = true) {
  state.activeAnalysisTab = tabId || "coverage";
  if (rerender) {
    renderAnalysisSection();
  }
}

function renderBattleViews(options = {}) {
  if (options.renderTeam) {
    renderTeamSection();
  }
  renderAnalysisSection();
  renderMatchupSection();
  renderRecommendationsSection();
  renderUsageSection();
  renderSpeedSection();
  renderOutputSection();
  if (options.renderDamage) {
    renderDamageSection();
  }
}

function setRecommendFocusType(type = "", rerender = true) {
  state.recommendFocusType = type || "";
  state.recommendFocusSource = "";
  refreshRecommendationsState();
  if (rerender) {
    renderRecommendationsSection();
  }
}

function setRecommendMegaOnly(value, rerender = true) {
  const next = Boolean(value);
  if (state.recommendMegaOnly === next) {
    return;
  }
  state.recommendMegaOnly = next;
  refreshRecommendationsState();
  if (rerender) {
    renderRecommendationsSection();
  }
  scheduleStatePersist();
}

function applyAnalysisRecommendFocus(type = "") {
  setRecommendFocusType(type, false);
  state.recommendFocusSource = type ? "analysis" : "";
  setActiveView("recommend-view");
  renderRecommendationsSection();
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
  state.recommendBiasAuto = false;
  state.recommendWeights = {
    ...state.recommendWeights,
    [weightId]: Math.min(100, Math.max(0, Math.round(Number(value || 0)))),
  };
  refreshBattleState();
  renderAnalysisSection();
  renderRecommendationsSection();
  scheduleStatePersist();
}

function updateRecommendWeightSummary(weightId, scope = document) {
  const summary = scope.querySelector(`[data-recommend-weight-summary="${weightId}"]`);
  if (!summary) {
    return;
  }
  const scoreMix = state.recommendScoreMix
    || getRecommendationScoreMix(state.team.length, state.recommendWeights);
  summary.textContent = t(state.language, "recommend.weightSummary", {
    preset: scoreMix.presetBias,
    pairing: scoreMix.pairingBias,
    team: scoreMix.teamShapeBias,
  });
}

function renderRecommendationCardLists() {
  const cards = renderRecommendationCards(state);
  document.querySelectorAll(".recommend-list-stack").forEach((container) => {
    setInnerHTMLIfChanged(container, cards);
  });
}

function setRecommendWeightPreview(weightId, value, scope = document) {
  const preview = scope.querySelector(`[data-recommend-weight-value="${weightId}"]`);
  if (!preview) {
    return;
  }
  preview.textContent = String(Math.min(100, Math.max(0, Math.round(Number(value || 0)))));
  updateRecommendWeightSummary(weightId, scope);
}

function handleRecommendWeightPreview(event) {
  const input = event.target.closest("[data-recommend-weight]");
  if (!input) {
    return;
  }
  if (!(input.dataset.recommendWeight in state.recommendWeights)) {
    return;
  }
  state.recommendBiasAuto = false;
  state.recommendWeights = {
    ...state.recommendWeights,
    [input.dataset.recommendWeight]: Math.min(100, Math.max(0, Math.round(Number(input.value || 0)))),
  };
  refreshRecommendationsState();
  setRecommendWeightPreview(input.dataset.recommendWeight, input.value, event.currentTarget);
  renderRecommendationCardLists();
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

function toggleRecommendationCompare(configId) {
  if (!configId) return;
  const current = state.recommendCompareIds || [];
  state.recommendCompareIds = current.includes(configId)
    ? current.filter((id) => id !== configId)
    : [...current.slice(-1), configId];
  renderRecommendationsSection();
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

function hydrateSavedTeams(savedTeams = []) {
  return savedTeams.map((team) => {
    if (!Array.isArray(team.configs)) {
      return team;
    }
    return {
      ...team,
      configs: hydrateConfigs(team.configs, state.datasets, 50),
    };
  });
}

function applyPersistedPayload(persisted) {
  state.language = normalizeLanguage(persisted?.language || DEFAULT_LANGUAGE);
  state.iconScheme = normalizeIconScheme(persisted?.iconScheme);
  state.recommendPreferences = normalizeRecommendationPreferences(persisted?.recommendPreferences);
  state.recommendWeights = normalizeRecommendationWeights(persisted?.recommendWeights);
  state.recommendBiasAuto = typeof persisted?.recommendBiasAuto === "boolean"
    ? persisted.recommendBiasAuto
    : true;
  state.recommendMegaOnly = Boolean(persisted?.recommendMegaOnly);
  state.quickStartDismissed = Boolean(persisted?.quickStartDismissed);
  state.dismissedRecommendationKeys = Array.isArray(persisted?.dismissedRecommendationKeys)
    ? persisted.dismissedRecommendationKeys.filter(Boolean)
    : [];
  state.activeView = persisted?.activeView || "library-view";
  state.usage.source = "smogon"; // official source disabled — force smogon regardless of persisted state
  if (!persisted?.damage) {
    state.damage.attackerId = "";
    state.damage.defenderId = "";
    state.damage.focusSide = "attacker";
    state.damage.scanMode = "attacker";
    state.damage.scanFilter = "all";
    state.damage.field = normalizeDamageField();
  } else {
    state.damage.attackerId = persisted.damage.attackerId || "";
    state.damage.defenderId = persisted.damage.defenderId || "";
    state.damage.focusSide = persisted.damage.focusSide === "defender" ? "defender" : "attacker";
    state.damage.scanMode = persisted.damage.scanMode === "defender" ? "defender" : "attacker";
    state.damage.scanFilter = ["all", "ohko", "twoHko", "maxDamage"].includes(persisted.damage.scanFilter)
      ? persisted.damage.scanFilter
      : "all";
    state.damage.field = normalizeDamageField(persisted.damage.field);
  }
  state.recommendCompareIds = Array.isArray(persisted?.recommendCompareIds)
    ? persisted.recommendCompareIds.filter(Boolean).slice(0, 2)
    : [];
  if (!state.datasets) {
    return;
  }
  state.library = persisted?.library ? ensureUniqueConfigIds(hydrateConfigs(persisted.library, state.datasets, 50)) : [];
  state.team = persisted?.team ? hydrateConfigs(persisted.team, state.datasets, 50) : [];
  state.opponentTeam = persisted?.opponentTeam
    ? restoreOpponentTeam(persisted.opponentTeam, state.datasets, state.library, state.language)
    : [];
  state.savedTeams = persisted?.savedTeams ? hydrateSavedTeams(persisted.savedTeams) : [];
  state.savedOpponentTeams = persisted?.savedOpponentTeams
    ? normalizeSavedOpponentTeams(persisted.savedOpponentTeams, state.datasets, state.library, state.language)
    : [];
  state.activeOpponentConfigSpeciesId = null;
}

function restoreStateSnapshot(snapshot) {
  state.library = snapshot?.library || [];
  state.team = snapshot?.team || [];
  state.opponentTeam = snapshot?.opponentTeam || [];
  state.savedTeams = snapshot?.savedTeams || [];
  state.savedOpponentTeams = snapshot?.savedOpponentTeams || [];
  state.activeOpponentConfigSpeciesId = null;
  refreshDerivedState();
  renderAll();
}

function moveTeamMember(configId, offset) {
  const currentIndex = state.team.findIndex((config) => config.id === configId);
  const nextIndex = currentIndex + offset;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= state.team.length) {
    return;
  }
  const nextTeam = [...state.team];
  const [moved] = nextTeam.splice(currentIndex, 1);
  nextTeam.splice(nextIndex, 0, moved);
  state.team = nextTeam;
  refreshBattleState();
  renderTeamSection();
  renderAnalysisSection();
  renderMatchupSection();
  renderRecommendationsSection();
  renderDamageSection();
  scheduleStatePersist();
}

function reorderTeamMembers(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) {
    return;
  }
  const sourceIndex = state.team.findIndex((config) => config.id === sourceId);
  const targetIndex = state.team.findIndex((config) => config.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) {
    return;
  }
  const nextTeam = [...state.team];
  const [moved] = nextTeam.splice(sourceIndex, 1);
  nextTeam.splice(targetIndex, 0, moved);
  state.team = nextTeam;
  refreshBattleState();
  renderTeamSection();
  renderAnalysisSection();
  renderMatchupSection();
  renderRecommendationsSection();
  renderDamageSection();
  scheduleStatePersist();
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function undoStateChange() {
  const snapshot = undoHistory(stateHistory);
  if (!snapshot) {
    setStatus("status.nothingToUndo");
    return;
  }
  restoreStateSnapshot(snapshot);
  scheduleStatePersist();
  setStatus("status.undo");
}

function redoStateChange() {
  const snapshot = redoHistory(stateHistory);
  if (!snapshot) {
    setStatus("status.nothingToRedo");
    return;
  }
  restoreStateSnapshot(snapshot);
  scheduleStatePersist();
  setStatus("status.redo");
}

function setTeamDropTarget(targetId = "") {
  document.querySelectorAll("[data-team-config-id]").forEach((node) => {
    node.classList.toggle("team-card-drop-target", node.getAttribute("data-team-config-id") === targetId);
  });
}

function clearTeamDragState() {
  draggedTeamConfigId = "";
  setTeamDropTarget("");
}

function selectSpecies(speciesId) {
  if (speciesId === state.selectedSpeciesId) {
    return;
  }
  state.search = "";
  const searchInput = document.getElementById("library-search");
  if (searchInput) {
    searchInput.value = "";
  }
  state.selectedSpeciesId = speciesId;
  resetLibraryCompare(speciesId);
  refreshFilteredLibrary();
  renderLibrarySection();
}

function toggleLibraryCompare(configId) {
  const compare = state.libraryCompare || DEFAULT_LIBRARY_COMPARE;
  const selectedIds = compare.speciesId === state.selectedSpeciesId ? [...compare.selectedConfigIds] : [];
  const existingIndex = selectedIds.indexOf(configId);
  if (existingIndex >= 0) {
    selectedIds.splice(existingIndex, 1);
  } else if (selectedIds.length < 2) {
    selectedIds.push(configId);
  } else {
    selectedIds.splice(0, 1);
    selectedIds.push(configId);
  }
  state.libraryCompare = {
    speciesId: state.selectedSpeciesId || "",
    selectedConfigIds: selectedIds,
  };
  renderLibrarySection();
}

function toggleMatchupFilterValue(key, value) {
  const current = new Set(state.matchupFilters[key] || []);
  if (current.has(value)) {
    current.delete(value);
  } else {
    current.add(value);
  }
  state.matchupFilters = {
    ...state.matchupFilters,
    [key]: [...current],
  };
  renderMatchupSection();
}

function setMatchupSpeedFilter(speedBucket = "") {
  state.matchupFilters = {
    ...state.matchupFilters,
    speedBucket,
  };
  renderMatchupSection();
}

function clearMatchupFilterGroup(groupId = "") {
  if (groupId === "types" || groupId === "roles") {
    state.matchupFilters = {
      ...state.matchupFilters,
      [groupId]: [],
    };
    renderMatchupSection();
  }
}

function clearMatchupFilters() {
  state.matchupFilters = {
    ...DEFAULT_MATCHUP_FILTERS,
    types: [],
    roles: [],
  };
  renderMatchupSection();
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
  state.matchup = analyzeMatchup(state.team, state.opponentTeam, state.datasets, {fieldState: state.battleField});
  syncDamageSelectionState();
  renderMatchupSection();
  renderDamageSection();
  scheduleStatePersist();
}

function toggleOpponentPin(speciesId) {
  state.opponentTeam = state.opponentTeam.map((entry) => {
    return entry.speciesId === speciesId ? {...entry, pinned: !entry.pinned} : entry;
  });
  renderMatchupSection();
  scheduleStatePersist();
}

function autoGenerateOpponentTeam() {
  if (!state.team.length) {
    announceStatusMessage(t(state.language, "matchup.needAlly"), {toastType: "warning"});
    return;
  }
  const lockedSelections = state.opponentTeam
    .filter((entry) => entry.pinned)
    .map((entry) => ({
      speciesId: entry.speciesId,
      selectedConfigId: entry.selectedConfigId || "",
      pinned: true,
    }));
  const selections = buildCounterOpponentSelections(state.team, state.matchupLibrary, state.datasets, {lockedSelections});
  if (!selections.length) {
    announceStatus("status.generatedOpponentTeamEmpty", {}, {toastType: "warning"});
    return;
  }
  state.opponentTeam = syncOpponentTeam(selections, state.datasets, state.library, state.language);
  state.activeOpponentConfigSpeciesId = null;
  refreshDerivedState();
  renderAll();
  scheduleStatePersist();
  announceStatus("status.generatedOpponentTeam", {count: state.opponentTeam.length}, {toastType: "success"});
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
  state.matchup = analyzeMatchup(state.team, state.opponentTeam, state.datasets, {fieldState: state.battleField});
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
  state.matchup = analyzeMatchup(state.team, state.opponentTeam, state.datasets, {fieldState: state.battleField});
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

function openTextConfigEditor(target, text) {
  const {modal, input} = getEditorElements();
  activeEditorTarget = target;
  input.value = text;
  modal.hidden = false;
  input.focus();
  input.setSelectionRange(0, 0);
}

function closeConfigEditor() {
  const {modal, input} = getEditorElements();
  activeEditorTarget = null;
  modal.hidden = true;
  input.value = "";
}

function getGuidedEditTarget(builder = state.guidedBuilder) {
  return builder?.editTarget || null;
}

function isEditingGuidedBuilder(builder = state.guidedBuilder) {
  return Boolean(getGuidedEditTarget(builder));
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
    switchButton: document.getElementById("switch-config-editor-mode-btn"),
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
  activeEditorTarget = null;
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

function getVisibleModalShell() {
  return document.querySelector(".modal-shell:not([hidden])");
}

function getModalPanel(modal) {
  const panel = modal?.querySelector('[role="dialog"], .modal-panel');
  if (panel && panel.tabIndex < 0 && !panel.hasAttribute("tabindex")) {
    panel.tabIndex = -1;
  }
  return panel || modal;
}

function isVisibleFocusableElement(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  if (element.hidden || element.getAttribute("aria-hidden") === "true" || element.hasAttribute("disabled")) {
    return false;
  }
  return element.getClientRects().length > 0;
}

function getModalFocusableElements(modal) {
  if (!modal) {
    return [];
  }
  return Array.from(modal.querySelectorAll([
    "button:not([disabled])",
    "[href]",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
  ].join(","))).filter((element) => isVisibleFocusableElement(element) && !element.closest("[hidden]"));
}

function focusInitialModalElement(modal) {
  const focusable = getModalFocusableElements(modal);
  const preferred = focusable.find((element) => element.matches("textarea, input:not([type='hidden']), select, [data-modal-initial-focus]"));
  const target = preferred || focusable[0] || getModalPanel(modal);
  if (target instanceof HTMLElement) {
    target.focus();
  }
}

function restoreModalFocus(previousFocus) {
  if (previousFocus instanceof HTMLElement && previousFocus.isConnected && !previousFocus.closest("[hidden]")) {
    previousFocus.focus();
    return;
  }
  const fallback = Array.from(document.querySelectorAll(".view-tab.active, .ghost-button, .add-button, button, input, textarea, select"))
    .find((element) => isVisibleFocusableElement(element) && !element.closest(".modal-shell[hidden]"));
  if (fallback instanceof HTMLElement) {
    fallback.focus();
  }
}

function handleModalVisibilityChange(modal) {
  if (!modal) {
    return;
  }
  if (!modal.hidden) {
    const previousFocus = document.activeElement instanceof HTMLElement && !modal.contains(document.activeElement)
      ? document.activeElement
      : activeModalState?.previousFocus || null;
    activeModalState = {
      modalId: modal.id,
      previousFocus,
    };
    queueMicrotask(() => {
      if (!modal.hidden) {
        focusInitialModalElement(modal);
      }
    });
    return;
  }
  if (activeModalState?.modalId !== modal.id) {
    return;
  }
  const nextFocus = activeModalState.previousFocus;
  activeModalState = null;
  queueMicrotask(() => {
    if (!getVisibleModalShell()) {
      restoreModalFocus(nextFocus);
    }
  });
}

function closeVisibleModal(modal = getVisibleModalShell()) {
  if (!modal) {
    return false;
  }
  if (modal.id === "config-editor-modal") {
    closeConfigEditor();
    return true;
  }
  if (modal.id === "guided-config-modal") {
    closeGuidedConfig();
    return true;
  }
  if (modal.id === "command-palette-modal") {
    if (activeCommandPalette) {
      activeCommandPalette.closePalette();
      renderCommandPalette(activeCommandPalette, state.language);
    } else {
      modal.hidden = true;
    }
    return true;
  }
  if (modal.id === "shortcuts-help-modal") {
    closeShortcutsHelp();
    return true;
  }
  const fallbackCloseButton = modal.querySelector("[data-close-editor], [data-close-guided-config], [data-close-palette], [data-close-shortcuts]");
  if (fallbackCloseButton instanceof HTMLElement) {
    fallbackCloseButton.click();
    return true;
  }
  return false;
}

function trapModalTabKey(event, modal) {
  const focusable = getModalFocusableElements(modal);
  if (!focusable.length) {
    event.preventDefault();
    focusInitialModalElement(modal);
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !modal.contains(active)) {
    event.preventDefault();
    focusInitialModalElement(modal);
    return;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function setupModalFocusTrap() {
  if (modalMutationObserver) {
    modalMutationObserver.disconnect();
  }
  const modals = Array.from(document.querySelectorAll(".modal-shell"));
  modalMutationObserver = new MutationObserver((records) => {
    records.forEach((record) => {
      handleModalVisibilityChange(record.target);
    });
  });
  modals.forEach((modal) => {
    modalMutationObserver.observe(modal, {attributes: true, attributeFilter: ["hidden"]});
  });
  document.addEventListener("focusin", (event) => {
    const modal = getVisibleModalShell();
    if (!modal || modal.contains(event.target)) {
      return;
    }
    focusInitialModalElement(modal);
  });
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
  const item = getRequiredItemForSpecies(builder.speciesId, state.datasets) || builder.item;
  for (let extra = 1; currentPoints + extra <= MAX_SPEED_POINTS; extra += 1) {
    const nextStats = getBuilderStats(
      builder.speciesId,
      {...points, spe: currentPoints + extra},
      builder.nature,
      state.datasets,
    );
    if (getHeldItemAdjustedSpeed({item, stats: nextStats}) > targetSpeed) {
      return extra;
    }
  }
  return null;
}

function getBuilderSpeedBenchmarkSummary(builder, points, stats) {
  const item = getRequiredItemForSpecies(builder.speciesId, state.datasets) || builder.item;
  const currentSpeed = getHeldItemAdjustedSpeed({item, stats});
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
  const legalMoveIds = getLegalMoveIds(builder.speciesId, state.datasets, {itemName: builder.item});
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
    return state.language === "zh"
      ? entry.move?.localizedShortDesc || entry.move?.localizedDesc || entry.move?.shortDesc || entry.move?.desc || ""
      : entry.move?.shortDesc || entry.move?.desc || "";
  }
  if (context.kind === "item") {
    return state.language === "zh"
      ? entry.item?.localizedShortDesc || entry.item?.localizedDesc || entry.item?.shortDesc || entry.item?.desc || ""
      : entry.item?.shortDesc || entry.item?.desc || "";
  }
  return "";
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
  if (context.kind === "item") {
    return `
      <span class="builder-autocomplete-row">
        <span class="builder-autocomplete-leading">${itemSpriteMarkup(entry.item)}</span>
        <span class="builder-autocomplete-copy">
          <span>${escapeHtml(primaryLabel)}</span>
          ${detailText ? `<small class="builder-autocomplete-detail">${escapeHtml(detailText)}</small>` : ""}
        </span>
      </span>
    `;
  }
  if (context.kind !== "move" || !entry.move) {
    return `
      <span class="builder-autocomplete-copy">
        <span>${escapeHtml(primaryLabel)}</span>
        ${detailText ? `<small class="builder-autocomplete-detail">${escapeHtml(detailText)}</small>` : ""}
      </span>
    `;
  }
  return `
    <span class="builder-autocomplete-copy">
      <span class="builder-autocomplete-title-row">
        <span>${escapeHtml(primaryLabel)}</span>
      </span>
      ${renderMoveAutocompleteMeta(entry.move)}
      ${detailText ? `<small class="builder-autocomplete-detail">${escapeHtml(detailText)}</small>` : ""}
    </span>
  `;
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
    switchButton,
    saveButton,
  } = getGuidedConfigElements();
  const localizedName = getLocalizedSpeciesName(builder.speciesId, species?.name || builder.speciesId);
  const editing = isEditingGuidedBuilder(builder);
  title.textContent = editing
    ? t(state.language, "builder.editTitle", {name: localizedName})
    : t(state.language, "library.openTemplate", {name: localizedName});
  subtitle.textContent = t(state.language, editing ? "builder.editCopy" : "builder.copy");
  types.innerHTML = (species?.types || []).map(typePillMarkup).join("");
  itemInput.value = getLocalizedItemName(requiredItem || builder.item);
  itemInput.disabled = Boolean(requiredItem);
  itemInput.readOnly = Boolean(requiredItem);
  itemInput.title = requiredItem || "";
  noteInput.value = builder.note;
  switchButton.hidden = !editing;
  saveButton.textContent = t(state.language, editing ? "builder.saveEdit" : "builder.save");
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
  const readyKey = isEditingGuidedBuilder(builder) ? "builder.feedbackReadyEdit" : "builder.feedbackReady";
  feedback.textContent = errors.length
    ? [t(state.language, "builder.feedbackInvalid"), ...errors].join(" ")
    : warnings.length
      ? [t(state.language, "builder.feedbackWarning"), ...warnings].join(" ")
      : t(state.language, readyKey);
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
    editTarget: options.editTarget || null,
  };
  activeEditorTarget = null;
  const {modal} = getGuidedConfigElements();
  renderGuidedConfig();
  modal.hidden = false;
}

function openGuidedConfigEditor(configId, kind = "library") {
  const target = kind === "team"
    ? findTeamConfigById(configId)
    : findConfigById(configId);
  if (!target) {
    return;
  }
  openGuidedConfig(target.speciesId, {
    seedConfig: target,
    editTarget: {configId, kind},
  });
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
  openGuidedConfigEditor(configId, kind);
}

function resolveBuilderItemName(itemName = "") {
  const trimmed = String(itemName || "").trim();
  if (!trimmed) {
    return "";
  }
  return state.datasets?.itemSearchLookup?.get(normalizeLookupText(trimmed))?.name
    || state.datasets?.itemLookup?.get(normalizeName(trimmed))?.name
    || trimmed;
}

function resolveBuilderMoveName(moveName = "") {
  const trimmed = String(moveName || "").trim();
  if (!trimmed) {
    return "";
  }
  return state.datasets?.moveSearchLookup?.get(normalizeLookupText(trimmed))?.name
    || state.datasets?.moveLookup?.get(normalizeName(trimmed))?.name
    || trimmed;
}

function getEditTargetConfig(target) {
  if (!target) {
    return null;
  }
  return target.kind === "team"
    ? findTeamConfigById(target.configId)
    : findConfigById(target.configId);
}

function buildEditableConfigFromBuilder(builder) {
  const validation = validateBuilderState(builder, state.datasets);
  const currentConfig = getEditTargetConfig(getGuidedEditTarget(builder));
  const species = state.datasets?.pokedex?.[builder.speciesId];
  const requiredItem = getRequiredItemForSpecies(builder.speciesId, state.datasets);
  return {
    displayName: currentConfig?.displayName || species?.name || builder.speciesId,
    item: resolveBuilderItemName(requiredItem || builder.item),
    ability: builder.ability || "",
    teraType: builder.teraType || "",
    note: builder.note || "",
    level: Number(currentConfig?.level || DEFAULT_CONFIG_LEVEL),
    championPoints: validation.points,
    nature: builder.nature || "Hardy",
    moveNames: builder.moves.map(resolveBuilderMoveName).filter(Boolean),
  };
}

function switchGuidedConfigEditorMode() {
  const target = getGuidedEditTarget();
  if (!target || !state.guidedBuilder) {
    return;
  }
  const text = exportConfigToEditableText(buildEditableConfigFromBuilder(state.guidedBuilder));
  closeGuidedConfig();
  openTextConfigEditor(target, text);
}

function switchCodeEditorMode() {
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
    const {config} = parseSingleEditedConfig(text);
    closeConfigEditor();
    openGuidedConfig(config.speciesId, {
      seedConfig: config,
      editTarget: target,
    });
  } catch (error) {
    setStatusMessage(error.message);
  }
}

function parseSingleEditedConfig(text) {
  const {configs, feedback} = parseShowdownLibrary(text, state.datasets, {
    fallbackLevel: 50,
    language: state.language,
    resolveConvertedPoint: promptMissingPoint,
  });
  if (configs.length !== 1) {
    throw new Error(t(state.language, "error.editSingle"));
  }
  return {config: configs[0], feedback};
}

function appendImportedConfigs(configs) {
  const additions = ensureUniqueConfigIds(configs, new Set(state.library.map((config) => config.id)));
  state.library = [...state.library, ...additions];
  return additions;
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

function persistLibraryConfigEdit(configId, config, feedback = []) {
  const updated = replaceConfig(configId, config);
  if (!updated) {
    return null;
  }
  refreshDerivedState();
  renderAll();
  renderLibraryImportFeedback(buildImportFeedbackPayload([config], feedback));
  scheduleStatePersist();
  setStatus("status.editedConfig", {name: updated.displayName});
  return updated;
}

function saveLibraryConfigEdit(configId, text) {
  const {config, feedback} = parseSingleEditedConfig(text);
  const updated = persistLibraryConfigEdit(configId, config, feedback);
  if (updated) {
    closeConfigEditor();
  }
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
  const editTarget = getGuidedEditTarget(state.guidedBuilder);
  if (editTarget) {
    const updated = editTarget.kind === "team"
      ? persistTeamConfigEdit(editTarget.configId, nextConfig)
      : persistLibraryConfigEdit(editTarget.configId, nextConfig);
    if (updated) {
      closeGuidedConfig();
    }
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

function persistTeamConfigEdit(configId, config, feedback = []) {
  const current = findTeamConfigById(configId);
  if (!current) {
    return null;
  }
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
    return null;
  }
  refreshDerivedState();
  renderAll();
  renderCurrentTeamImportFeedback(buildImportFeedbackPayload([config], feedback));
  scheduleStatePersist();
  setStatus("status.editedTeamConfig", {name: updated.displayName});
  return updated;
}

function saveTeamConfigEdit(configId, text) {
  const {config, feedback} = parseSingleEditedConfig(text);
  const updated = persistTeamConfigEdit(configId, config, feedback);
  if (updated) {
    closeConfigEditor();
  }
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

function applyImportedLibrary(configs, feedback, mode) {
  const baseLibrary = mode === "append" ? state.library : [];
  const usedIds = new Set(baseLibrary.map((config) => config.id));
  const importedConfigs = ensureUniqueConfigIds(configs, usedIds);
  state.library = mode === "append" ? [...baseLibrary, ...importedConfigs] : importedConfigs;
  syncTeamWithLibrary();
  refreshDerivedState();
  renderAll();
  renderLibraryImportFeedback(buildImportFeedbackPayload(configs, feedback));
  scheduleStatePersist();
  announceStatus("status.libraryCount", {count: state.library.length}, {toastType: "success"});
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
    renderCurrentTeamImportFeedback(t(state.language, "team.importEmpty"));
    return;
  }

  try {
    const {configs, feedback} = parseShowdownLibrary(input, state.datasets, {
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
    renderCurrentTeamImportFeedback(buildImportFeedbackPayload(configs, feedback));
    scheduleStatePersist();
    announceStatus("status.importedTeam", {count: state.team.length}, {toastType: "success"});
  } catch (error) {
    renderCurrentTeamImportFeedback(error.message);
    announceStatusMessage(error.message, {toastType: "error"});
  }
}

function importCustomLibrary(mode = "replace") {
  const input = document.getElementById("custom-library-input").value.trim();
  if (!input) {
    renderLibraryImportFeedback(t(state.language, "controls.importEmptyInput"));
    announceStatus("status.libraryWaiting", {}, {toastType: "warning"});
    return;
  }

  try {
    const {configs, feedback} = parseShowdownLibrary(input, state.datasets, {
      fallbackLevel: 50,
      language: state.language,
      resolveConvertedPoint: promptMissingPoint,
    });
    applyImportedLibrary(configs, feedback, mode);
  } catch (error) {
    renderLibraryImportFeedback(error.message);
    announceStatus("status.importCancelled", {}, {toastType: "error"});
  }
}

function createUsageConfig(speciesId) {
  const text = buildUsageConfigText(state.datasets, speciesId, state.language);
  if (!text) {
    announceStatus("usage.createMissing", {}, {toastType: "warning"});
    return;
  }
  try {
    const {configs, feedback} = parseShowdownLibrary(text, state.datasets, {
      fallbackLevel: 50,
      language: state.language,
      resolveConvertedPoint: promptMissingPoint,
    });
    applyImportedLibrary(configs, feedback, "append");
    state.activeView = "library-view";
    setActiveView("library-view");
    announceStatus("usage.createdConfig", {name: configs[0]?.displayName || speciesId}, {toastType: "success"});
  } catch (error) {
    announceStatusMessage(error.message, {toastType: "error"});
  }
}

function clearCustomLibrary() {
  if (!window.confirm(t(state.language, "controls.clearConfirm"))) {
    return;
  }
  document.getElementById("custom-library-input").value = "";
  state.library = [];
  refreshDerivedState();
  renderAll();
  renderLibraryImportFeedback(t(state.language, "status.libraryCleared"));
  scheduleStatePersist();
  announceStatus("status.libraryCleared", {}, {toastType: "warning"});
}

function getVgcpastesSourceKey(config = {}) {
  const moves = (config.moveNames || config.moves || []).map((move) => normalizeName(move?.name || move)).join(",");
  const teamId = config.source?.teamId || String(config.note || "").match(/PC\d+/i)?.[0] || "";
  return [
    teamId.toUpperCase(),
    normalizeName(config.speciesId || config.species || config.speciesName),
    normalizeName(config.item),
    normalizeName(config.ability),
    normalizeName(config.nature),
    moves,
  ].join("|");
}

function buildVgcpastesSourceIndex(configs = []) {
  return new Map(configs.map((config) => [getVgcpastesSourceKey(config), config.source || null]));
}

async function loadVgcpastesSourceIndex() {
  if (vgcpastesSourceIndex) return vgcpastesSourceIndex;
  const response = await fetch(VGCPASTES_SETS_PATH);
  if (!response.ok) throw new Error(`Failed to load: ${VGCPASTES_SETS_PATH}`);
  const payload = await response.json();
  vgcpastesSourceIndex = buildVgcpastesSourceIndex(Array.isArray(payload?.configs) ? payload.configs : []);
  return vgcpastesSourceIndex;
}

async function attachPresetSources(configs, path) {
  if (path !== DEFAULT_PRESET_PATH) return configs;
  const sourceIndex = await loadVgcpastesSourceIndex();
  return configs.map((config) => {
    const source = sourceIndex.get(getVgcpastesSourceKey(config));
    return source ? {...config, source} : config;
  });
}

async function loadPresetLibrary(path, name, mode = "replace") {
  try {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load: ${path}`);
    }
    const text = await response.text();
    document.getElementById("custom-library-input").value = text;
    const {configs, feedback} = parseShowdownLibrary(text, state.datasets, {
      fallbackLevel: 50,
      language: state.language,
      resolveConvertedPoint: promptMissingPoint,
    });
    const configsWithSources = await attachPresetSources(configs, path);
    applyImportedLibrary(configsWithSources, feedback, mode);
    announceStatus("status.loadedPreset", {name}, {toastType: "success"});
    return configsWithSources;
  } catch (error) {
    renderLibraryImportFeedback(error.message);
    announceStatusMessage(error.message, {toastType: "error"});
    return null;
  }
}

function findStarterConfig(speciesId) {
  const normalized = normalizeName(speciesId);
  return state.library.find((config) => normalizeName(config.speciesId) === normalized) || null;
}

function resolveStarterTeam(template) {
  const entries = template.speciesIds.map((speciesId) => ({
    speciesId,
    config: findStarterConfig(speciesId),
  }));
  return {
    configs: entries.map((entry) => entry.config).filter(Boolean),
    missing: entries.filter((entry) => !entry.config).map((entry) => entry.speciesId),
  };
}

function applyStarterTeam(configs) {
  state.team = configs.map((config) => buildTeamEntry(config, "library", config.id));
  state.activeTeamSidebarTab = "team";
  refreshBattleState();
  renderAll();
  scheduleStatePersist();
}

async function applyStarterTemplate(templateId) {
  const template = findStarterTemplate(templateId);
  if (!template) {
    announceStatus("status.starterUnknown", {}, {toastType: "warning"});
    return;
  }
  if (state.team.length && !window.confirm(t(state.language, "starter.replaceConfirm"))) {
    return;
  }
  if (!state.library.length) {
    await loadPresetLibrary(DEFAULT_PRESET_PATH, DEFAULT_PRESET_NAME, "replace");
    if (!state.library.length) {
      return;
    }
  }
  const {configs, missing} = resolveStarterTeam(template);
  if (missing.length) {
    announceStatus("status.starterMissing", {names: missing.join(", ")}, {toastType: "error"});
    return;
  }
  applyStarterTeam(configs);
  announceStatus("status.starterApplied", {name: t(state.language, template.labelKey)}, {toastType: "success"});
}

const VGCPASTES_TEAMS_PATH = "./static/paste_teams_champions_ma.json";
const VGCPASTES_STAT_LABELS = {hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe"};
const VGCPASTES_STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];

function formatVgcpastesPointsLine(points) {
  const parts = VGCPASTES_STAT_KEYS.map((key) => `${Number((points || {})[key] || 0)} ${VGCPASTES_STAT_LABELS[key]}`);
  return `Points: ${parts.join(" / ")}`;
}

function formatVgcpastesConfigBlock(config) {
  const lines = [];
  lines.push(config.item ? `${config.species} @ ${config.item}` : config.species);
  if (config.ability) {
    lines.push(`Ability: ${config.ability}`);
  }
  lines.push("Level: 50");
  if (config.note) {
    lines.push(`Note: ${config.note}`);
  }
  lines.push(formatVgcpastesPointsLine(config.points));
  if (config.nature) {
    lines.push(`${config.nature} Nature`);
  }
  for (const move of (config.moves || []).slice(0, 4)) {
    lines.push(`- ${move}`);
  }
  return lines.join("\n");
}

function formatVgcpastesTeamShowdown(team) {
  return (team.configs || []).map(formatVgcpastesConfigBlock).join("\n\n");
}

async function loadVgcpastesPickerData() {
  if (state.vgcpastesPicker.teams || state.vgcpastesPicker.loading) {
    return;
  }
  state.vgcpastesPicker.loading = true;
  state.vgcpastesPicker.error = "";
  renderVgcpastesPicker(state);
  renderVgcpastesSuggest(state);
  try {
    const response = await fetch(VGCPASTES_TEAMS_PATH);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    state.vgcpastesPicker.teams = Array.isArray(payload?.teams) ? payload.teams : [];
  } catch (error) {
    state.vgcpastesPicker.error = String(error && error.message ? error.message : error);
  } finally {
    state.vgcpastesPicker.loading = false;
    renderVgcpastesPicker(state);
    renderVgcpastesSuggest(state);
  }
}

function findVgcpastesTeam(teamId) {
  const teams = state.vgcpastesPicker.teams || [];
  return teams.find((team) => team.teamId === teamId) || null;
}

function applyVgcpastesTeam(teamId) {
  const team = findVgcpastesTeam(teamId);
  if (!team) {
    return;
  }
  if (state.team.length && !window.confirm(t(state.language, "vgcpastes.replaceConfirm"))) {
    return;
  }
  const text = formatVgcpastesTeamShowdown(team);
  if (!text) {
    return;
  }
  const input = document.getElementById("team-import-input");
  if (input) {
    input.value = text;
  }
  setActiveTeamSidebarTab("import");
  importTeamByCode();
  announceStatus("status.vgcpastesLoaded", {teamId: team.teamId}, {toastType: "success"});
}

function applyVgcpastesAsOpponent(teamId) {
  const team = findVgcpastesTeam(teamId);
  if (!team) {
    return;
  }
  if (state.opponentTeam.length && !window.confirm(t(state.language, "vgcpastes.replaceOpponentConfirm"))) {
    return;
  }
  const speciesIds = (team.memberSpeciesIds || []).slice(0, MAX_TEAM_SIZE);
  const opponentEntries = speciesIds
    .map((speciesId) => findOpponentEntry(state.datasets, state.library, speciesId, state.language))
    .filter(Boolean);
  if (!opponentEntries.length) {
    return;
  }
  state.opponentTeam = opponentEntries;
  state.matchup = analyzeMatchup(state.team, state.opponentTeam, state.datasets, {fieldState: state.battleField});
  syncDamageSelectionState();
  renderMatchupSection();
  renderDamageSection();
  scheduleStatePersist();
  announceStatus("status.vgcpastesOpponentLoaded", {teamId: team.teamId}, {toastType: "success"});
}

async function importLibraryFromFile(file) {
  const text = await file.text();
  document.getElementById("custom-library-input").value = text;
  importCustomLibrary("append");
}

function exportLibrary() {
  if (!state.library.length) {
    announceStatus("status.emptyLibraryExport", {}, {toastType: "warning"});
    return;
  }
  const content = exportLibraryToShowdown(state.library);
  const blob = new Blob([content], {type: "text/plain;charset=utf-8"});
  downloadBlob(blob, "poke-library.txt");
  announceStatus("status.exportedLibrary", {count: state.library.length}, {toastType: "success"});
}

function exportTeam() {
  if (!state.team.length) {
    announceStatus("status.emptyTeamExport", {}, {toastType: "warning"});
    return;
  }
  const content = exportTeamToShowdown(state.team);
  const blob = new Blob([content], {type: "text/plain;charset=utf-8"});
  downloadBlob(blob, "pokemon-showdown-team.txt");
  announceStatus("status.exportedTeam", {count: state.team.length}, {toastType: "success"});
}

async function copyTeamToClipboard() {
  if (!state.team.length) {
    announceStatus("status.emptyTeamExport", {}, {toastType: "warning"});
    return;
  }
  try {
    await navigator.clipboard.writeText(exportTeamToShowdown(state.team));
    announceStatus("status.copiedTeam", {count: state.team.length}, {toastType: "success"});
  } catch (error) {
    announceStatusMessage(error?.message || t(state.language, "toast.copyTeamFailed"), {toastType: "error"});
  }
}

function exportFullStateBackup() {
  downloadBlob(exportFullState(state), "poke-type-backup.poketype.json");
  announceStatus("status.exportedFullState", {}, {toastType: "success"});
}

async function importFullStateFromFile(file) {
  const text = await file.text();
  const payload = importFullState(text);
  applyPersistedPayload(payload);
  setLanguage(state.language, false);
  updateIconSchemeControl();
  initializeBuilderOptions();
  refreshDerivedState();
  renderAll();
  initializeHistory(stateHistory, snapshotHistoryState(state));
  setActiveView(state.activeView);
  scheduleStatePersist();
  renderLibraryImportFeedback(t(state.language, "status.importedFullState"));
  announceStatus("status.importedFullState", {}, {toastType: "success"});
}

function saveCurrentTeam() {
  const input = document.getElementById("saved-team-name");
  const name = input.value.trim();
  if (!name) {
    announceStatus("status.teamNameRequired", {}, {toastType: "warning"});
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
  announceStatus("status.savedTeam", {name}, {toastType: "success"});
}

function saveCurrentOpponentTeam() {
  const input = document.getElementById("saved-opponent-name");
  const name = input.value.trim();
  if (!name) {
    announceStatus("status.teamNameRequired", {}, {toastType: "warning"});
    return;
  }
  const snapshot = createSavedOpponentSnapshot(state.opponentTeam, name);
  state.savedOpponentTeams = [snapshot, ...state.savedOpponentTeams];
  input.value = "";
  refreshDerivedState();
  renderAll();
  scheduleStatePersist();
  announceStatus("status.savedOpponentTeam", {name}, {toastType: "success"});
}

function markSavedOpponentTeamOpened(teamId) {
  state.savedOpponentTeams = state.savedOpponentTeams.map((team) => {
    if (team.id !== teamId) {
      return team;
    }
    return {
      ...team,
      lastOpenedAt: Date.now(),
      openCount: Number(team.openCount || 0) + 1,
    };
  });
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
  announceStatus("status.loadedTeam", {name: target.name}, {toastType: "success"});
}

function loadSavedOpponentTeam(teamId) {
  const target = state.savedOpponentTeams.find((team) => team.id === teamId);
  if (!target) {
    return;
  }
  state.opponentTeam = loadSavedOpponentSelection(target, state.datasets, state.library, state.language);
  markSavedOpponentTeamOpened(teamId);
  state.activeOpponentConfigSpeciesId = null;
  refreshDerivedState();
  renderAll();
  scheduleStatePersist();
  announceStatus("status.loadedOpponentTeam", {name: target.name}, {toastType: "success"});
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
  announceStatus("status.deletedSavedTeam", {count: state.savedTeams.length}, {toastType: "warning"});
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
  announceStatus("status.deletedSavedOpponentTeam", {count: state.savedOpponentTeams.length}, {toastType: "warning"});
}

function handleContextAction(action) {
  if (action === "team") {
    setActiveTeamSidebarTab("team");
    document.getElementById("team-list")?.scrollIntoView({block: "nearest"});
    return;
  }
  if (action === "opponent") {
    setActiveView("matchup-view");
    return;
  }
  if (action === "focus") {
    setActiveView("recommend-view");
    return;
  }
  if (action === "archetype") {
    setActiveView("analysis-view");
  }
}

function bindEvents() {
  document.querySelector(".view-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    setActiveView(button.dataset.view);
  });

  document.getElementById("usage-view")?.addEventListener("input", (event) => {
    if (event.target.id === "usage-search") {
      state.usage.search = event.target.value;
      renderUsageSection();
    }
    if (event.target.id === "usage-sort") {
      state.usage.sort = event.target.value;
      renderUsageSection();
    }
  });

  document.getElementById("usage-view")?.addEventListener("click", (event) => {
    const sourceToggle = event.target.closest("[data-usage-source]");
    if (sourceToggle) {
      const next = sourceToggle.dataset.usageSource;
      if (next && state.usage.source !== next) {
        state.usage.source = next;
        state.usage.selectedSpeciesId = "";
        scheduleStatePersist();
        renderUsageSection();
      }
      return;
    }
    const row = event.target.closest("[data-usage-species]");
    if (row) {
      state.usage.selectedSpeciesId = row.dataset.usageSpecies || "";
      renderUsageSection();
      return;
    }
    const createButton = event.target.closest("[data-create-usage-config]");
    if (createButton) {
      createUsageConfig(createButton.dataset.createUsageConfig || "");
    }
  });

  document.getElementById("workspace-context-bar")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-context-action]");
    if (!button) return;
    handleContextAction(button.dataset.contextAction);
  });

  document.getElementById("analysis-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-analysis-tab]");
    if (!button || button.dataset.analysisTab === state.activeAnalysisTab) {
      return;
    }
    setActiveAnalysisTab(button.dataset.analysisTab);
  });
  document.getElementById("analysis-view").addEventListener("click", (event) => {
    const focusButton = event.target.closest("[data-analysis-focus-type]");
    if (!focusButton) {
      return;
    }
    applyAnalysisRecommendFocus(focusButton.dataset.analysisFocusType || "");
  });

  document.getElementById("analysis-cores-panel").addEventListener("change", (event) => {
    const select = event.target.closest("[data-core-focus]");
    if (!select || select.value === state.activeCoreConfigId) {
      return;
    }
    state.activeCoreConfigId = select.value || null;
    renderAnalysisSection();
  });
  document.getElementById("analysis-cores-panel").addEventListener("click", (event) => {
    const button = event.target.closest("[data-add-config]");
    if (!button) {
      return;
    }
    addConfig(button.dataset.addConfig);
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
    const compareButton = event.target.closest("[data-compare-config]");
    if (compareButton) {
      toggleLibraryCompare(compareButton.dataset.compareConfig);
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
  attachImeAwareSearchInput(document.getElementById("library-search"), (value) => {
    scheduleLibrarySearchRender(value);
  });

  document.getElementById("recommend-list").addEventListener("click", (event) => {
    const autoBiasButton = event.target.closest("[data-apply-recommend-auto-bias]");
    if (autoBiasButton) {
      applyAutoRecommendBias();
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
    const compareButton = event.target.closest("[data-toggle-recommend-compare]");
    if (compareButton) {
      toggleRecommendationCompare(compareButton.dataset.toggleRecommendCompare);
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
    const megaButton = event.target.closest("[data-recommend-mega-only]");
    if (megaButton) {
      setRecommendMegaOnly(megaButton.dataset.recommendMegaOnly === "true");
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

  attachImeAwareSearchInput(document.getElementById("matchup-search"), (value) => {
    scheduleMatchupSearchRender(value);
  });

  document.getElementById("matchup-library-list").addEventListener("click", (event) => {
    const clearButton = event.target.closest("[data-clear-matchup-filters]");
    if (clearButton) {
      clearMatchupFilters();
      return;
    }
    const clearGroupButton = event.target.closest("[data-matchup-clear-filter-group]");
    if (clearGroupButton) {
      clearMatchupFilterGroup(clearGroupButton.dataset.matchupClearFilterGroup || "");
      return;
    }
    const typeButton = event.target.closest("[data-matchup-type-filter]");
    if (typeButton) {
      toggleMatchupFilterValue("types", typeButton.dataset.matchupTypeFilter);
      return;
    }
    const roleButton = event.target.closest("[data-matchup-role-filter]");
    if (roleButton) {
      toggleMatchupFilterValue("roles", roleButton.dataset.matchupRoleFilter);
      return;
    }
    const speedButton = event.target.closest("[data-matchup-speed-filter]");
    if (speedButton) {
      setMatchupSpeedFilter(speedButton.dataset.matchupSpeedFilter || "");
      return;
    }
    const button = event.target.closest("[data-add-opponent-species]");
    if (button) addOpponentSpecies(button.dataset.addOpponentSpecies);
  });

  document.getElementById("team-list").addEventListener("click", (event) => {
    const moveUpButton = event.target.closest("[data-move-team-up]");
    if (moveUpButton) {
      moveTeamMember(moveUpButton.dataset.moveTeamUp, -1);
      return;
    }
    const moveDownButton = event.target.closest("[data-move-team-down]");
    if (moveDownButton) {
      moveTeamMember(moveDownButton.dataset.moveTeamDown, 1);
      return;
    }
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
  document.getElementById("team-list").addEventListener("dragstart", (event) => {
    const card = event.target.closest("[data-team-config-id]");
    if (!card) {
      return;
    }
    draggedTeamConfigId = card.dataset.teamConfigId || "";
    card.classList.add("team-card-dragging");
    event.dataTransfer?.setData("text/plain", draggedTeamConfigId);
    event.dataTransfer.effectAllowed = "move";
  });
  document.getElementById("team-list").addEventListener("dragover", (event) => {
    const card = event.target.closest("[data-team-config-id]");
    if (!card || !draggedTeamConfigId) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setTeamDropTarget(card.dataset.teamConfigId || "");
  });
  document.getElementById("team-list").addEventListener("drop", (event) => {
    const card = event.target.closest("[data-team-config-id]");
    if (!card || !draggedTeamConfigId) {
      return;
    }
    event.preventDefault();
    reorderTeamMembers(draggedTeamConfigId, card.dataset.teamConfigId || "");
    clearTeamDragState();
  });
  document.getElementById("team-list").addEventListener("dragend", () => {
    document.querySelectorAll(".team-card-dragging").forEach((node) => node.classList.remove("team-card-dragging"));
    clearTeamDragState();
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
    const pinButton = event.target.closest("[data-toggle-opponent-pin]");
    if (pinButton) {
      toggleOpponentPin(pinButton.dataset.toggleOpponentPin);
      return;
    }
    const button = event.target.closest("[data-remove-opponent-species]");
    if (button) removeOpponentSpecies(button.dataset.removeOpponentSpecies);
  });

  document.getElementById("damage-controls").addEventListener("change", (event) => {
    const attackerSelect = event.target.closest("#damage-attacker-select");
    if (attackerSelect) {
      state.damage.attackerId = attackerSelect.value;
      syncDamageSelectionState();
      renderDamageSection();
      scheduleStatePersist();
      void syncDamageWorkspace(true);
      return;
    }
    const defenderSelect = event.target.closest("#damage-defender-select");
    if (defenderSelect) {
      state.damage.defenderId = defenderSelect.value;
      syncDamageSelectionState();
      renderDamageSection();
      scheduleStatePersist();
      void syncDamageWorkspace(true);
      return;
    }
    const fieldSelect = event.target.closest("[data-damage-field]");
    if (fieldSelect) {
      applyDamageFieldChange(fieldSelect.dataset.damageField, fieldSelect);
      state.damage.lastPairKey = "";
      invalidateDamageScan();
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
    invalidateDamageScan();
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
      return;
    }
    const scanButton = event.target.closest("[data-run-damage-scan]");
    if (scanButton) {
      void syncDamageScan(scanButton.dataset.runDamageScan);
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
    const scanRunButton = event.target.closest("[data-run-damage-scan]");
    if (scanRunButton) {
      void syncDamageScan(scanRunButton.dataset.runDamageScan);
      return;
    }
    const scanFilterButton = event.target.closest("[data-damage-scan-filter]");
    if (scanFilterButton) {
      state.damage.scanFilter = scanFilterButton.dataset.damageScanFilter || "all";
      renderDamageSection();
      scheduleStatePersist();
      return;
    }
    const boostButton = event.target.closest("[data-damage-boost]");
    if (boostButton) {
      const [role, stat] = String(boostButton.dataset.damageBoost || "").split(".");
      if (setDamageBoostValue(role, stat, boostButton.dataset.damageBoostValue)) {
        renderDamageSection();
        scheduleStatePersist();
        void syncDamageWorkspace(true);
      }
      return;
    }
    const boostResetButton = event.target.closest("[data-damage-boost-reset]");
    if (boostResetButton) {
      if (resetDamageBoosts(boostResetButton.dataset.damageBoostReset)) {
        renderDamageSection();
        scheduleStatePersist();
        void syncDamageWorkspace(true);
      }
      return;
    }
    const boostPresetButton = event.target.closest("[data-damage-boost-preset]");
    if (boostPresetButton) {
      const [role, stat, value] = String(boostPresetButton.dataset.damageBoostPreset || "").split(":");
      if (setDamageBoostValue(role, stat, value)) {
        renderDamageSection();
        scheduleStatePersist();
        void syncDamageWorkspace(true);
      }
      return;
    }
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
      return;
    }
    const scanButton = event.target.closest("[data-damage-scan-open]");
    if (scanButton) {
      event.preventDefault();
      state.damage.focusSide = scanButton.dataset.damageScanFocus === "defender" ? "defender" : "attacker";
      openDamagePair({defenderId: scanButton.dataset.damageScanOpen});
    }
  });

  document.getElementById("damage-scan").addEventListener("click", (event) => {
    const scanRunButton = event.target.closest("[data-run-damage-scan]");
    if (scanRunButton) {
      void syncDamageScan(scanRunButton.dataset.runDamageScan);
      return;
    }
    const scanFilterButton = event.target.closest("[data-damage-scan-filter]");
    if (scanFilterButton) {
      state.damage.scanFilter = scanFilterButton.dataset.damageScanFilter || "all";
      renderDamageSection();
      scheduleStatePersist();
      return;
    }
    const scanButton = event.target.closest("[data-damage-scan-open]");
    if (scanButton) {
      event.preventDefault();
      state.damage.focusSide = scanButton.dataset.damageScanFocus === "defender" ? "defender" : "attacker";
      openDamagePair({defenderId: scanButton.dataset.damageScanOpen});
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
    const boostSelect = event.target.closest("[data-damage-boost-select]");
    if (boostSelect) {
      const [role, stat] = String(boostSelect.dataset.damageBoostSelect || "").split(".");
      if (setDamageBoostValue(role, stat, boostSelect.value)) {
        renderDamageSection();
        scheduleStatePersist();
        void syncDamageWorkspace(true);
      }
      return;
    }
    const fieldControl = event.target.closest("[data-damage-field]");
    if (fieldControl) {
      applyDamageFieldChange(fieldControl.dataset.damageField, fieldControl);
      state.damage.lastPairKey = "";
      invalidateDamageScan();
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
    state.matchup = analyzeMatchup(state.team, state.opponentTeam, state.datasets, {fieldState: state.battleField});
    syncDamageSelectionState();
    renderMatchupSection();
    renderDamageSection();
    scheduleStatePersist();
  });
  document.getElementById("export-team-btn").addEventListener("click", exportTeam);
  document.getElementById("copy-team-btn").addEventListener("click", () => {
    void copyTeamToClipboard();
  });
  document.getElementById("sidebar-save-team-btn").addEventListener("click", () => {
    setActiveTeamSidebarTab("saved");
    document.getElementById("saved-team-name").focus();
  });
  document.getElementById("import-team-btn").addEventListener("click", importTeamByCode);
  document.getElementById("clear-team-import-btn").addEventListener("click", () => {
    document.getElementById("team-import-input").value = "";
    renderCurrentTeamImportFeedback(t(state.language, "team.importEmpty"));
  });
  attachImeAwareSearchInput(document.getElementById("saved-team-search"), (value) => {
    state.savedTeamSearch = value;
    window.clearTimeout(savedTeamSearchDebounceTimer);
    savedTeamSearchDebounceTimer = window.setTimeout(() => {
      savedTeamSearchDebounceTimer = 0;
      renderSavedTeams(state);
    }, 200);
  });
  document.getElementById("team-list").addEventListener("click", (event) => {
    const openImportButton = event.target.closest("[data-open-team-import]");
    if (!openImportButton) {
      return;
    }
    setActiveTeamSidebarTab("import");
    document.getElementById("team-import-input").focus();
  });
  document.getElementById("quick-start-panel").addEventListener("click", (event) => {
    const templateButton = event.target.closest("[data-starter-template]");
    if (templateButton) {
      void applyStarterTemplate(templateButton.dataset.starterTemplate);
      return;
    }
    const actionButton = event.target.closest("[data-quick-start-action]");
    if (actionButton) {
      handleQuickStartAction(actionButton.dataset.quickStartAction);
    }
  });
  const vgcpastesContainer = document.getElementById("vgcpastes-picker");
  if (vgcpastesContainer) {
    vgcpastesContainer.addEventListener("toggle", (event) => {
      const details = event.target.closest("details.vgcpastes-picker");
      if (!details) {
        return;
      }
      state.vgcpastesPicker.open = details.open;
      if (details.open) {
        void loadVgcpastesPickerData();
      }
    }, true);
    vgcpastesContainer.addEventListener("input", (event) => {
      const search = event.target.closest("#vgcpastes-picker-search");
      if (!search) {
        return;
      }
      if (event.isComposing) {
        return;
      }
      scheduleVgcpastesSearchRender(search.value);
    });
    vgcpastesContainer.addEventListener("compositionend", (event) => {
      const search = event.target.closest("#vgcpastes-picker-search");
      if (!search) {
        return;
      }
      scheduleVgcpastesSearchRender(search.value);
    });
    vgcpastesContainer.addEventListener("click", (event) => {
      const card = event.target.closest("[data-vgcpastes-team-id]");
      if (!card) {
        return;
      }
      event.preventDefault();
      applyVgcpastesTeam(card.dataset.vgcpastesTeamId);
    });
  }
  const vgcpastesSuggestContainer = document.getElementById("vgcpastes-suggest");
  if (vgcpastesSuggestContainer) {
    vgcpastesSuggestContainer.addEventListener("click", (event) => {
      const card = event.target.closest("[data-vgcpastes-suggest-team-id]");
      if (!card) {
        return;
      }
      event.preventDefault();
      applyVgcpastesAsOpponent(card.dataset.vgcpastesSuggestTeamId);
    });
  }

  document.getElementById("import-custom-btn").addEventListener("click", () => importCustomLibrary("replace"));
  document.getElementById("append-custom-btn").addEventListener("click", () => importCustomLibrary("append"));
  document.getElementById("load-default-preset-btn").addEventListener("click", () => {
    loadPresetLibrary(DEFAULT_PRESET_PATH, DEFAULT_PRESET_NAME, "replace");
  });
  document.getElementById("import-file-btn").addEventListener("click", () => {
    document.getElementById("library-file-input").click();
  });
  document.getElementById("export-full-state-btn").addEventListener("click", exportFullStateBackup);
  document.getElementById("import-full-state-btn").addEventListener("click", () => {
    document.getElementById("full-state-file-input").click();
  });
  document.getElementById("library-file-input").addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (file) {
      await importLibraryFromFile(file);
    }
    event.target.value = "";
  });
  document.getElementById("full-state-file-input").addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    try {
      if (file) {
        await importFullStateFromFile(file);
      }
    } catch (error) {
      const message = getFullStateImportErrorMessage(error);
      renderLibraryImportFeedback(message);
      setStatusMessage(message);
    }
    event.target.value = "";
  });
  document.getElementById("export-library-btn").addEventListener("click", exportLibrary);
  document.getElementById("save-team-btn").addEventListener("click", saveCurrentTeam);
  document.getElementById("save-opponent-team-btn").addEventListener("click", saveCurrentOpponentTeam);
  document.getElementById("auto-generate-opponent-team-btn").addEventListener("click", autoGenerateOpponentTeam);
  document.getElementById("save-config-edit-btn").addEventListener("click", saveConfigEdit);
  document.getElementById("save-guided-config-btn").addEventListener("click", saveGuidedConfig);
  document.getElementById("switch-guided-editor-mode-btn").addEventListener("click", switchCodeEditorMode);
  document.getElementById("switch-config-editor-mode-btn").addEventListener("click", switchGuidedConfigEditorMode);
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
    if (event.defaultPrevented) {
      return;
    }
    const activeModal = getVisibleModalShell();
    if (!activeModal) {
      return;
    }
    if (event.key === "Tab") {
      trapModalTabKey(event, activeModal);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeVisibleModal(activeModal);
    }
  });
  document.getElementById("clear-custom-btn").addEventListener("click", () => {
    clearCustomLibrary();
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
  tooltip.classList.toggle("interactive", !!tooltip.querySelector("[data-scroll-to]"));
  tooltip.hidden = false;
  positionTooltip(target);
}

function hideTooltip() {
  if (!globalTooltip) {
    return;
  }
  globalTooltip.hidden = true;
}

let tooltipHideTimer = 0;

function cancelTooltipHide() {
  if (tooltipHideTimer) {
    clearTimeout(tooltipHideTimer);
    tooltipHideTimer = 0;
  }
}

function scheduleTooltipHide() {
  cancelTooltipHide();
  tooltipHideTimer = setTimeout(() => {
    hideTooltip();
    tooltipHideTimer = 0;
  }, 160);
}

function scrollToSpeedPill(pillId) {
  const target = document.getElementById(pillId);
  if (!target) return;
  hideTooltip();
  target.scrollIntoView({behavior: "smooth", block: "center"});
  target.classList.add("speed-entry-flash");
  setTimeout(() => target.classList.remove("speed-entry-flash"), 1500);
}

function setupTooltipEvents() {
  const tooltip = getTooltipElement();
  tooltip.addEventListener("mouseenter", cancelTooltipHide);
  tooltip.addEventListener("mouseleave", scheduleTooltipHide);
  tooltip.addEventListener("click", (event) => {
    const jumper = event.target.closest("[data-scroll-to]");
    if (!jumper) return;
    event.preventDefault();
    scrollToSpeedPill(jumper.getAttribute("data-scroll-to"));
  });

  document.addEventListener("mouseover", (event) => {
    const pill = event.target.closest(".info-pill");
    if (!pill) {
      return;
    }
    cancelTooltipHide();
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
    if (event.relatedTarget && globalTooltip?.contains(event.relatedTarget)) {
      return;
    }
    scheduleTooltipHide();
  });

  document.addEventListener("focusin", (event) => {
    const pill = event.target.closest(".info-pill");
    if (pill) {
      cancelTooltipHide();
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
    if (event.relatedTarget && globalTooltip?.contains(event.relatedTarget)) {
      return;
    }
    scheduleTooltipHide();
  });

  window.addEventListener("scroll", () => {
    cancelTooltipHide();
    hideTooltip();
  }, true);
  window.addEventListener("resize", () => {
    cancelTooltipHide();
    hideTooltip();
  });
  window.addEventListener("pagehide", () => {
    flushStatePersist();
  });
}

async function initialize() {
  const persisted = loadPersistedState();
  applyPersistedPayload(persisted || {});
  setLanguage(state.language, false);
  setStatus("status.initializing");
  clearSpeciesTemplateCache();
  state.datasets = await loadDatasets();
  syncLocalizedData();
  applyPersistedPayload(persisted || {});
  initializeBuilderOptions();
  bindEvents();
  setupModalFocusTrap();
  setupTooltipEvents();
  const commandActions = {
    setActiveView,
    saveCurrentTeam,
    setLanguage,
    toggleIconScheme: () => {
      const next = state.iconScheme === "showdown" ? "poke-icons" : "showdown";
      const selector = document.getElementById("icon-scheme-select");
      if (selector) selector.value = next;
      setIconScheme(next);
    },
    undoStateChange,
    redoStateChange,
    openShortcutsHelp,
  };
  const commandPalette = createCommandPalette({
    state,
    actions: commandActions,
    commands: buildDefaultCommands({state, actions: commandActions}),
  });
  activeCommandPalette = commandPalette;
  function showCommandPalette() {
    commandPalette.openPalette();
    renderCommandPalette(commandPalette, state.language);
    focusCommandPaletteInput();
  }
  installCommandPalette({
    state,
    palette: commandPalette,
    render: renderCommandPalette,
    language: () => state.language,
  });
  installKeybindings({
    setActiveView,
    getActiveView: () => state.activeView,
    saveCurrentTeam,
    undoStateChange,
    redoStateChange,
    openCommandPalette: showCommandPalette,
  });
  refreshDerivedState();
  renderAll();
  if (!document.getElementById("custom-library-input").value.trim()) {
    renderLibraryImportFeedback(t(state.language, "controls.importEmpty"));
  }
  if (!document.getElementById("team-import-input").value.trim()) {
    renderCurrentTeamImportFeedback(t(state.language, "team.importEmpty"));
  }
  initializeHistory(stateHistory, snapshotHistoryState(state));
  setActiveView(state.activeView);
  if (state.library.length) {
    setStatus("status.restored", {count: state.library.length});
    return;
  }
  setStatus("status.loadedEmpty");
}

initialize().catch((error) => {
  console.error(error);
  setStatusMessage(t(state.language, "status.initFailed", {message: error.message}));
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
