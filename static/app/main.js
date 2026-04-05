import {analyzeTeam} from "./analysis.js";
import {calculateSpeedLineTiers, calculateSpeedTiers, loadDatasets} from "./data.js";
import {applyStaticTranslations, DEFAULT_LANGUAGE, normalizeLanguage, t} from "./i18n.js";
import {clearPersistedState, loadPersistedState, persistState} from "./persistence.js";
import {recommendConfigs} from "./recommendations.js";
import {renderAnalysis, renderImportFeedback, renderLibrary, renderRecommendations, renderSavedTeams, renderSpeedTiers, renderStatus, renderTeam} from "./render.js";
import {exportConfigToEditableText, exportLibraryToShowdown, exportTeamToShowdown, hydrateConfigs, parseShowdownLibrary} from "./showdown.js";
import {formatConfigName, normalizeName} from "./utils.js";

const state = {
  datasets: null,
  language: DEFAULT_LANGUAGE,
  status: null,
  activeView: "library-view",
  search: "",
  library: [],
  filteredLibrary: [],
  speedTiers: [],
  speedLineTiers: [],
  team: [],
  savedTeams: [],
  analysis: null,
  recommendations: [],
};

const TOOLTIP_OFFSET = 12;
let globalTooltip = null;
let activeEditorConfigId = null;
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
  state.analysis = analyzeTeam(state.team, state.speedTiers, state.language, state.library);
  state.recommendations = recommendConfigs(state.library, state.team, state.speedTiers, state.language);
  persistState(state);
}

function renderAll() {
  renderLibrary(state);
  renderTeam(state);
  renderSavedTeams(state);
  renderAnalysis(state);
  renderRecommendations(state);
  renderSpeedTiers(state);
}

function setStatus(key, params = {}) {
  state.status = {key, params};
  renderStatus(t(state.language, key, params));
}

function setStatusMessage(message) {
  state.status = null;
  renderStatus(message);
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

function findConfigById(configId) {
  return state.library.find((config) => config.id === configId);
}

function addConfig(configId) {
  const config = findConfigById(configId);
  if (!config || state.team.length >= 6) return;
  if (state.team.some((member) => member.id === config.id)) return;
  state.team = [...state.team, config];
  refreshDerivedState();
  renderAll();
}

function removeConfig(configId) {
  state.team = state.team.filter((config) => config.id !== configId);
  refreshDerivedState();
  renderAll();
}

function deleteConfig(configId) {
  state.library = state.library.filter((config) => config.id !== configId);
  state.team = state.team.filter((config) => config.id !== configId);
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
  state.team = state.team.map((config) => (config.id === configId ? updatedConfig : config));
  state.savedTeams = state.savedTeams.map((team) => ({
    ...team,
    labels: team.configIds.map((id, index) => (
      id === configId ? (updatedConfig.displayLabel || updatedConfig.displayName) : team.labels[index]
    )),
  }));
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
  activeEditorConfigId = null;
  modal.hidden = true;
  input.value = "";
}

function openConfigEditor(configId) {
  const target = findConfigById(configId);
  if (!target) {
    return;
  }
  const {modal, input} = getEditorElements();
  activeEditorConfigId = configId;
  input.value = exportConfigToEditableText(target);
  modal.hidden = false;
  input.focus();
  input.setSelectionRange(0, 0);
}

function saveConfigEdit() {
  const configId = activeEditorConfigId;
  if (!configId) {
    return;
  }
  const {input} = getEditorElements();
  const text = input.value.trim();
  if (!text) {
    setStatusMessage(t(state.language, "error.emptyEditor"));
    return;
  }

  try {
    const {configs, errors} = parseShowdownLibrary(text, state.datasets, {
      fallbackLevel: 50,
      language: state.language,
      resolveConvertedPoint: promptMissingPoint,
    });
    if (configs.length !== 1) {
      throw new Error(t(state.language, "error.editSingle"));
    }
    const updated = replaceConfig(configId, configs[0]);
    if (!updated) {
      return;
    }
    refreshDerivedState();
    renderAll();
    renderImportFeedback(errors.join(" "));
    closeConfigEditor();
    setStatus("status.editedConfig", {name: updated.displayName});
  } catch (error) {
    setStatusMessage(error.message);
  }
}

function syncTeamWithLibrary() {
  const validIds = new Set(state.library.map((config) => config.id));
  state.team = state.team.filter((member) => validIds.has(member.id));
  state.savedTeams = state.savedTeams.map((team) => {
    const configIds = team.configIds.filter((id) => validIds.has(id));
    const labels = team.labels.filter((_, index) => validIds.has(team.configIds[index]));
    return {...team, configIds, labels};
  });
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

function importCustomLibrary(mode = "replace") {
  const input = document.getElementById("custom-library-input").value.trim();
  if (!input) {
    state.library = [];
    state.team = [];
    clearPersistedState();
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
    configIds: state.team.map((config) => config.id),
    labels: state.team.map((config) => config.displayLabel || config.displayName),
  };
  state.savedTeams = [snapshot, ...state.savedTeams];
  input.value = "";
  refreshDerivedState();
  renderAll();
  setStatus("status.savedTeam", {name});
}

function loadSavedTeam(teamId) {
  const target = state.savedTeams.find((team) => team.id === teamId);
  if (!target) {
    return;
  }
  const byId = new Map(state.library.map((config) => [config.id, config]));
  state.team = target.configIds.map((id) => byId.get(id)).filter(Boolean);
  refreshDerivedState();
  renderAll();
  setStatus("status.loadedTeam", {name: target.name});
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

function bindEvents() {
  document.querySelector(".view-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    setActiveView(button.dataset.view);
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
      openConfigEditor(editButton.dataset.editConfig);
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

  document.getElementById("team-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-config]");
    if (button) removeConfig(button.dataset.removeConfig);
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

  document.getElementById("clear-team-btn").addEventListener("click", () => {
    state.team = [];
    refreshDerivedState();
    renderAll();
  });
  document.getElementById("export-team-btn").addEventListener("click", exportTeam);

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
    const libraryIds = new Set(state.library.map((config) => config.id));
    state.team = hydrateConfigs(persisted.team, state.datasets, 50)
      .filter((config) => libraryIds.has(config.id));
  }
  if (persisted?.savedTeams) {
    state.savedTeams = persisted.savedTeams;
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
