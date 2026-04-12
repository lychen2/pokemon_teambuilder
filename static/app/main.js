import {analyzeTeam} from "./analysis.js";
import {buildSyntheticSpeedEntries} from "./champions-vgc.js";
import {calculateSpeedLineTiers, calculateSpeedTiers, loadDatasets} from "./data.js";
import {applyStaticTranslations, DEFAULT_LANGUAGE, normalizeLanguage, t} from "./i18n.js";
import {
  buildConfigFromBuilder,
  buildNatureOptions,
  buildSpeciesBrowser,
  createBuilderState,
  getRequiredItemForSpecies,
  getAbilityOptions,
  getBuilderStats,
  getItemOptions,
  getMoveOptions,
  getTypeOptions,
  validateBuilderState,
} from "./library-builder.js";
import {analyzeMatchup} from "./matchup-analysis.js";
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
import {renderAnalysis, renderImportFeedback, renderLibrary, renderMatchup, renderRecommendations, renderSavedTeams, renderSpeedTiers, renderStatus, renderTeam, renderTeamImportFeedback} from "./render.js";
import {exportConfigToEditableText, exportLibraryToShowdown, exportTeamToShowdown, hydrateConfigs, parseShowdownLibrary} from "./showdown.js";
import {compareConfigs, createTeamEntry, findBestLibraryMatch} from "./team-config.js";
import {formatChampionPoints, formatConfigName, getTypeLabel, normalizeLookupText, normalizeName} from "./utils.js";

const MAX_TEAM_SIZE = 6;
const state = {
  datasets: null,
  language: DEFAULT_LANGUAGE,
  status: null,
  activeView: "library-view",
  activeAnalysisTab: "coverage",
  activeCoreConfigId: null,
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
  savedTeams: [],
  savedOpponentTeams: [],
  analysis: null,
  matchup: null,
  recommendations: [],
  guidedBuilder: null,
  itemOptions: [],
  itemOptionLabels: [],
  moveOptions: [],
  moveOptionLabels: [],
  natureOptions: [],
  typeOptions: [],
  localizedSpeciesNames: new Map(),
  localizedItemNames: new Map(),
  localizedMoveNames: new Map(),
};

const TOOLTIP_OFFSET = 12;
const BUILDER_STATS = ["hp", "atk", "def", "spa", "spd", "spe"];
let globalTooltip = null;
let activeEditorTarget = null;
const POINT_PROMPT_MAP = {
  hp: "hp",
  atk: "atk",
  def: "def",
  spa: "spa",
  spd: "spd",
  spe: "spe",
};

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
  state.matchup = analyzeMatchup(state.team, state.opponentTeam);
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
  renderTeam(state);
  renderSavedTeams(state);
  translateNodes(
    document.getElementById("team-list"),
    document.getElementById("saved-team-list"),
  );
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

function updateLanguageSwitch() {
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.classList.toggle("active", button.dataset.language === state.language);
  });
}

function setLanguage(language, rerender = true) {
  state.language = normalizeLanguage(language);
  applyStaticTranslations(state.language);
  updateLanguageSwitch();
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
  scheduleStatePersist();
}

function setActiveView(viewId) {
  state.activeView = viewId;
  document.querySelectorAll(".view-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewId);
  });
  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === viewId);
  });
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
  scheduleStatePersist();
}

function addOpponentSpecies(speciesId) {
  const opponentEntry = findOpponentEntry(state.datasets, state.library, speciesId, state.language);
  if (!opponentEntry || state.opponentTeam.length >= MAX_TEAM_SIZE) return;
  if (state.opponentTeam.some((member) => member.speciesId === opponentEntry.speciesId)) return;
  state.opponentTeam = [...state.opponentTeam, opponentEntry];
  state.matchup = analyzeMatchup(state.team, state.opponentTeam);
  renderMatchupSection();
  scheduleStatePersist();
}

function removeConfig(configId) {
  state.team = state.team.filter((config) => config.id !== configId);
  refreshBattleState();
  renderTeamSection();
  renderAnalysisSection();
  renderMatchupSection();
  renderRecommendationsSection();
  scheduleStatePersist();
}

function removeOpponentSpecies(speciesId) {
  state.opponentTeam = state.opponentTeam.filter((config) => config.speciesId !== speciesId);
  state.matchup = analyzeMatchup(state.team, state.opponentTeam);
  renderMatchupSection();
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
    itemOptions: document.getElementById("builder-item-options"),
    moveOptions: document.getElementById("builder-move-options"),
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

function populateDatalist(node, options) {
  node.innerHTML = options.map((value) => `<option value="${value}"></option>`).join("");
}

function syncSelectOptions(select, options, selectedValue, blankLabel = "") {
  select.innerHTML = options.map((option) => {
    if (!option) {
      return `<option value="">${blankLabel}</option>`;
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
  syncSelectOptions(abilitySelect, getAbilityOptions(builder.speciesId, state.datasets), builder.ability);
  syncSelectOptions(
    teraSelect,
    state.typeOptions,
    builder.teraType,
    `${t(state.language, "common.none")} / ${t(state.language, "common.tera")}`,
  );
  syncSelectOptions(natureSelect, state.natureOptions, builder.nature);
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
      <input type="search" list="builder-move-options" data-builder-move="${index}" value="${getLocalizedMoveName(builder.moves[index] || "")}">
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
  statsGrid.innerHTML = BUILDER_STATS.map((stat) => `
    <div class="builder-stat-card">
      <span>${t(state.language, `builder.stats.${stat}`)}</span>
      <strong class="builder-stat-value">${stats[stat] || 0}</strong>
    </div>
  `).join("");
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
  const availableSpecies = state.datasets.availableSpecies || [];
  const itemEntries = Object.values(state.datasets.items || {});
  const moveEntries = Object.values(state.datasets.moves || {});
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
  const {itemOptions, moveOptions} = getGuidedConfigElements();
  state.itemOptionLabels = state.itemOptions.map((itemName) => getLocalizedItemName(itemName));
  state.moveOptionLabels = state.moveOptions.map((moveName) => getLocalizedMoveName(moveName));
  populateDatalist(itemOptions, state.language === "zh" ? state.itemOptionLabels : state.itemOptions);
  populateDatalist(moveOptions, state.language === "zh" ? state.moveOptionLabels : state.moveOptions);
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
    const button = event.target.closest("[data-remove-config]");
    if (button) removeConfig(button.dataset.removeConfig);
  });

  document.getElementById("opponent-team-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-opponent-species]");
    if (button) removeOpponentSpecies(button.dataset.removeOpponentSpecies);
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
    state.team = [];
    refreshBattleState();
    renderTeamSection();
    renderAnalysisSection();
    renderMatchupSection();
    renderRecommendationsSection();
    scheduleStatePersist();
  });
  document.getElementById("clear-opponent-team-btn").addEventListener("click", () => {
    state.opponentTeam = [];
    state.matchup = analyzeMatchup(state.team, state.opponentTeam);
    renderMatchupSection();
    scheduleStatePersist();
  });
  document.getElementById("export-team-btn").addEventListener("click", exportTeam);
  document.getElementById("import-team-btn").addEventListener("click", importTeamByCode);
  document.getElementById("clear-team-import-btn").addEventListener("click", () => {
    document.getElementById("team-import-input").value = "";
    renderTeamImportFeedback(t(state.language, "team.importEmpty"));
    translateNodes(document.getElementById("team-import-feedback"));
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
  document.getElementById("builder-item-input").addEventListener("input", (event) => {
    updateGuidedBuilderField("item", event.target.value);
  });
  document.getElementById("builder-ability-select").addEventListener("change", (event) => {
    updateGuidedBuilderField("ability", event.target.value);
  });
  document.getElementById("builder-tera-select").addEventListener("change", (event) => {
    updateGuidedBuilderField("teraType", event.target.value);
  });
  document.getElementById("builder-nature-select").addEventListener("change", (event) => {
    updateGuidedBuilderField("nature", event.target.value);
  });
  document.getElementById("builder-note-input").addEventListener("input", (event) => {
    updateGuidedBuilderField("note", event.target.value);
  });
  document.getElementById("builder-points-grid").addEventListener("input", (event) => {
    const input = event.target.closest("[data-builder-point]");
    if (!input) {
      return;
    }
    updateGuidedBuilderPoint(input.dataset.builderPoint, input.value);
    input.value = state.guidedBuilder?.points?.[input.dataset.builderPoint] ?? "0";
  });
  document.getElementById("builder-moves-grid").addEventListener("input", (event) => {
    const input = event.target.closest("[data-builder-move]");
    if (!input) {
      return;
    }
    updateGuidedBuilderMove(Number(input.dataset.builderMove), input.value);
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
  state.recommendPreferences = normalizeRecommendationPreferences(persisted?.recommendPreferences);
  state.recommendWeights = normalizeRecommendationWeights(persisted?.recommendWeights);
  state.dismissedRecommendationKeys = Array.isArray(persisted?.dismissedRecommendationKeys)
    ? persisted.dismissedRecommendationKeys.filter(Boolean)
    : [];
  setLanguage(state.language, false);
  setStatus("status.initializing");
  state.datasets = await loadDatasets();
  await initializeLocalizedLabels();
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
    return;
  }
  setStatus("status.loadedEmpty");
}

initialize().catch((error) => {
  console.error(error);
  setStatusMessage(t(state.language, "status.initFailed", {message: error.message}));
});
