import {analyzeTeam} from "./analysis.js";
import {calculateSpeedLineTiers, calculateSpeedTiers, loadDatasets} from "./data.js";
import {applyStaticTranslations, DEFAULT_LANGUAGE, normalizeLanguage, t} from "./i18n.js";
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
import {loadPersistedState, persistState} from "./persistence.js";
import {applyPsChinaTranslation} from "./pschina-translation.js";
import {recommendConfigs} from "./recommendations.js";
import {renderAnalysis, renderImportFeedback, renderLibrary, renderMatchup, renderRecommendations, renderSavedTeams, renderSpeedTiers, renderStatus, renderTeam, renderTeamImportFeedback} from "./render.js";
import {exportConfigToEditableText, exportLibraryToShowdown, exportTeamToShowdown, hydrateConfigs, parseShowdownLibrary} from "./showdown.js";
import {compareConfigs, createTeamEntry, findBestLibraryMatch} from "./team-config.js";
import {formatConfigName, normalizeName} from "./utils.js";

const MAX_TEAM_SIZE = 6;
const state = {
  datasets: null,
  language: DEFAULT_LANGUAGE,
  status: null,
  activeView: "library-view",
  activeAnalysisTab: "coverage",
  activeCoreConfigId: null,
  search: "",
  matchupSearch: "",
  library: [],
  filteredLibrary: [],
  matchupLibrary: [],
  speedTiers: [],
  speedLineTiers: [],
  team: [],
  opponentTeam: [],
  savedTeams: [],
  savedOpponentTeams: [],
  analysis: null,
  matchup: null,
  recommendations: [],
};

const TOOLTIP_OFFSET = 12;
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

function refreshDerivedState() {
  const searchToken = normalizeName(state.search);
  state.filteredLibrary = state.library.filter((config) => {
    if (!searchToken) return true;
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
  state.speedTiers = calculateSpeedTiers(state.library);
  state.speedLineTiers = calculateSpeedLineTiers(state.library);
  state.matchupLibrary = buildOpponentLibrary(state.library);
  state.opponentTeam = syncOpponentTeam(state.opponentTeam, state.library);
  state.savedOpponentTeams = normalizeSavedOpponentTeams(state.savedOpponentTeams, state.library);
  state.analysis = analyzeTeam(state.team, state.speedTiers, state.language, state.library);
  state.matchup = analyzeMatchup(state.team, state.opponentTeam);
  if (!state.team.some((config) => config.id === state.activeCoreConfigId)) {
    state.activeCoreConfigId = state.team[0]?.id || null;
  }
  state.recommendations = recommendConfigs(state.library, state.team, state.speedTiers, state.language);
  persistState(state);
}

function renderAll() {
  renderLibrary(state);
  renderTeam(state);
  renderSavedTeams(state);
  renderAnalysis(state);
  renderMatchup(state);
  renderRecommendations(state);
  renderSpeedTiers(state);
  void applyPsChinaTranslation(state.language);
}

function setStatus(key, params = {}) {
  state.status = {key, params};
  renderStatus(t(state.language, key, params));
  void applyPsChinaTranslation(state.language);
}

function setStatusMessage(message) {
  state.status = null;
  renderStatus(message);
  void applyPsChinaTranslation(state.language);
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
  }
  const teamImportInput = document.getElementById("team-import-input");
  if (teamImportInput && !teamImportInput.value.trim()) {
    renderTeamImportFeedback(t(state.language, "team.importEmpty"));
  }
  if (!rerender) {
    return;
  }
  refreshDerivedState();
  renderAll();
}

function setActiveView(viewId) {
  state.activeView = viewId;
  document.querySelectorAll(".view-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewId);
  });
  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === viewId);
  });
}

function setActiveAnalysisTab(tabId, rerender = true) {
  state.activeAnalysisTab = tabId || "coverage";
  if (rerender) {
    renderAnalysis(state);
  }
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
  refreshDerivedState();
  renderAll();
}

function addOpponentSpecies(speciesId) {
  const opponentEntry = findOpponentEntry(state.library, speciesId);
  if (!opponentEntry || state.opponentTeam.length >= MAX_TEAM_SIZE) return;
  if (state.opponentTeam.some((member) => member.speciesId === opponentEntry.speciesId)) return;
  state.opponentTeam = [...state.opponentTeam, opponentEntry];
  refreshDerivedState();
  renderAll();
}

function removeConfig(configId) {
  state.team = state.team.filter((config) => config.id !== configId);
  refreshDerivedState();
  renderAll();
}

function removeOpponentSpecies(speciesId) {
  state.opponentTeam = state.opponentTeam.filter((config) => config.speciesId !== speciesId);
  refreshDerivedState();
  renderAll();
}

function deleteConfig(configId) {
  state.library = state.library.filter((config) => config.id !== configId);
  syncTeamWithLibrary();
  refreshDerivedState();
  renderAll();
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

function openConfigEditor(configId, kind = "library") {
  const target = kind === "team" ? findTeamConfigById(configId) : findConfigById(configId);
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
  closeConfigEditor();
  setStatus("status.editedConfig", {name: updated.displayName});
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
  closeConfigEditor();
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
    setStatus("status.importedTeam", {count: state.team.length});
  } catch (error) {
    renderTeamImportFeedback(error.message);
    setStatusMessage(error.message);
  }
}

function importCustomLibrary(mode = "replace") {
  const input = document.getElementById("custom-library-input").value.trim();
  if (!input) {
    state.library = [];
    renderImportFeedback(t(state.language, "status.libraryCleared"));
    refreshDerivedState();
    renderAll();
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
  setStatus("status.loadedTeam", {name: target.name});
}

function loadSavedOpponentTeam(teamId) {
  const target = state.savedOpponentTeams.find((team) => team.id === teamId);
  if (!target) {
    return;
  }
  state.opponentTeam = loadSavedOpponentSelection(target, state.library);
  refreshDerivedState();
  renderAll();
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
    renderAnalysis(state);
  });

  document.getElementById("language-switch").addEventListener("click", (event) => {
    const button = event.target.closest("[data-language]");
    if (!button || button.dataset.language === state.language) {
      return;
    }
    setLanguage(button.dataset.language);
  });

  document.getElementById("library-search").addEventListener("input", (event) => {
    state.search = event.target.value;
    refreshDerivedState();
    renderAll();
  });

  document.getElementById("library-list").addEventListener("click", (event) => {
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
    const button = event.target.closest("[data-add-config]");
    if (button) addConfig(button.dataset.addConfig);
  });

  document.getElementById("matchup-search").addEventListener("input", (event) => {
    state.matchupSearch = event.target.value;
    renderMatchup(state);
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
    refreshDerivedState();
    renderAll();
  });
  document.getElementById("clear-opponent-team-btn").addEventListener("click", () => {
    state.opponentTeam = [];
    refreshDerivedState();
    renderAll();
  });
  document.getElementById("export-team-btn").addEventListener("click", exportTeam);
  document.getElementById("import-team-btn").addEventListener("click", importTeamByCode);
  document.getElementById("clear-team-import-btn").addEventListener("click", () => {
    document.getElementById("team-import-input").value = "";
    renderTeamImportFeedback(t(state.language, "team.importEmpty"));
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
  document.querySelectorAll("[data-close-editor]").forEach((node) => {
    node.addEventListener("click", closeConfigEditor);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.getElementById("config-editor-modal").hidden) {
      closeConfigEditor();
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
}

async function initialize() {
  const persisted = loadPersistedState();
  state.language = normalizeLanguage(persisted?.language || DEFAULT_LANGUAGE);
  setLanguage(state.language, false);
  setStatus("status.initializing");
  state.datasets = await loadDatasets();
  if (persisted?.library) {
    state.library = ensureUniqueConfigIds(hydrateConfigs(persisted.library, state.datasets, 50));
  }
  if (persisted?.team) {
    state.team = hydrateConfigs(persisted.team, state.datasets, 50);
  }
  if (persisted?.opponentTeam) {
    state.opponentTeam = restoreOpponentTeam(persisted.opponentTeam, state.library);
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
    state.savedOpponentTeams = normalizeSavedOpponentTeams(persisted.savedOpponentTeams, state.library);
  }
  if (persisted?.activeView) {
    state.activeView = persisted.activeView;
  }
  bindEvents();
  setupTooltipEvents();
  refreshDerivedState();
  renderAll();
  if (!document.getElementById("custom-library-input").value.trim()) {
    renderImportFeedback(t(state.language, "controls.importEmpty"));
  }
  if (!document.getElementById("team-import-input").value.trim()) {
    renderTeamImportFeedback(t(state.language, "team.importEmpty"));
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
