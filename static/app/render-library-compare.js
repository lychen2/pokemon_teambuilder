import {t} from "./i18n.js";
import {compactRoleSummaryMarkup} from "./role-ui.js";
import {spriteMarkup} from "./sprites.js";
import {createRoleContext} from "./team-roles.js";
import {formatChampionPoints, getDisplayNote, getLocalizedNatureName, getTypeLabel, normalizeName} from "./utils.js";

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getLocalizedSpeciesName(state, config = {}) {
  return state.localizedSpeciesNames?.get(config.speciesId) || config.speciesName || config.displayName || "";
}

function getLocalizedMoveName(state, moveName = "") {
  return state.language === "zh"
    ? state.localizedMoveNames?.get(normalizeName(moveName)) || moveName
    : moveName;
}

function getLocalizedItemName(state, config = {}) {
  if (state.language !== "zh") {
    return config.item || "";
  }
  return config.itemInfo?.localizedName || state.localizedItemNames?.get(normalizeName(config.item)) || config.item || "";
}

function getLocalizedAbilityName(state, config = {}) {
  if (state.language !== "zh") {
    return config.ability || "";
  }
  return config.abilityInfo?.localizedName || state.localizedAbilityNames?.get(normalizeName(config.ability)) || config.ability || "";
}

function renderCompareValue(leftValue, rightValue, className = "") {
  const isDiff = leftValue !== rightValue;
  return {
    left: `<div class="library-compare-cell ${className} ${isDiff ? "is-diff" : ""}">${leftValue}</div>`,
    right: `<div class="library-compare-cell ${className} ${isDiff ? "is-diff" : ""}">${rightValue}</div>`,
  };
}

function renderRoleMarkup(config, state) {
  const language = state.language;
  const roleContext = createRoleContext(state.library);
  return compactRoleSummaryMarkup(config, language, {roleContext}) || escapeHtml(t(language, "common.none"));
}

function renderMoveMarkup(config, state) {
  const moves = (config.moveNames || []).map((move) => getLocalizedMoveName(state, move));
  if (!moves.length) {
    return `<span class="muted">${escapeHtml(t(state.language, "common.none"))}</span>`;
  }
  return moves.map((move) => `<span class="mini-pill">${escapeHtml(move)}</span>`).join("");
}

function renderStats(config = {}) {
  const stats = config.stats || {};
  return ["hp", "atk", "def", "spa", "spd", "spe"]
    .map((statId) => `${statId.toUpperCase()} ${Number(stats[statId] || 0)}`)
    .join(" / ");
}

function compareRowMarkup(label, leftValue, rightValue, className = "") {
  const cells = renderCompareValue(leftValue, rightValue, className);
  return `
    <div class="library-compare-row">
      <div class="library-compare-label">${escapeHtml(label)}</div>
      ${cells.left}
      ${cells.right}
    </div>
  `;
}

function compareHeaderCard(config, state, columnKey) {
  const language = state.language;
  const noteText = getDisplayNote(config.note);
  const note = noteText ? `<span class="mini-pill">${escapeHtml(noteText)}</span>` : "";
  return `
    <div class="library-compare-head-card">
      <div class="entry-title">
        ${spriteMarkup(config, state)}
        <strong>${escapeHtml(getLocalizedSpeciesName(state, config))}</strong>
        ${note}
      </div>
      <div class="analysis-inline-pills">
        <button type="button" class="add-button" data-add-config="${escapeHtml(config.id)}">${t(language, "library.add")}</button>
        <button type="button" class="ghost-button mini-action" data-edit-config="${escapeHtml(config.id)}">${t(language, "library.edit")}</button>
        <button type="button" class="ghost-button mini-action" data-compare-config="${escapeHtml(config.id)}">${t(language, "library.compareRemove")}</button>
      </div>
      <span class="source-tag">${escapeHtml(t(language, columnKey))}</span>
    </div>
  `;
}

function compareRowsMarkup(leftConfig, rightConfig, state) {
  const language = state.language;
  const leftValidation = leftConfig.validation?.items?.length
    ? t(language, "validation.badge", {count: leftConfig.validation.items.length})
    : t(language, "validation.noIssues");
  const rightValidation = rightConfig.validation?.items?.length
    ? t(language, "validation.badge", {count: rightConfig.validation.items.length})
    : t(language, "validation.noIssues");
  const rows = [
    [t(language, "builder.item"), escapeHtml(getLocalizedItemName(state, leftConfig) || t(language, "common.none")), escapeHtml(getLocalizedItemName(state, rightConfig) || t(language, "common.none"))],
    [t(language, "builder.ability"), escapeHtml(getLocalizedAbilityName(state, leftConfig) || t(language, "common.none")), escapeHtml(getLocalizedAbilityName(state, rightConfig) || t(language, "common.none"))],
    [t(language, "builder.tera"), escapeHtml(leftConfig.teraType ? getTypeLabel(leftConfig.teraType, language) : t(language, "common.none")), escapeHtml(rightConfig.teraType ? getTypeLabel(rightConfig.teraType, language) : t(language, "common.none"))],
    [t(language, "builder.nature"), escapeHtml(leftConfig.nature ? getLocalizedNatureName(leftConfig.nature, language) : t(language, "common.none")), escapeHtml(rightConfig.nature ? getLocalizedNatureName(rightConfig.nature, language) : t(language, "common.none"))],
    [t(language, "builder.note"), escapeHtml(leftConfig.note || t(language, "common.none")), escapeHtml(rightConfig.note || t(language, "common.none"))],
    [t(language, "library.compareValidation"), escapeHtml(leftValidation), escapeHtml(rightValidation)],
    [t(language, "builder.pointsTitle"), escapeHtml(formatChampionPoints(leftConfig.championPoints || {}, language)), escapeHtml(formatChampionPoints(rightConfig.championPoints || {}, language))],
    [t(language, "library.compareStats"), escapeHtml(renderStats(leftConfig)), escapeHtml(renderStats(rightConfig))],
  ];
  return rows.map(([label, leftValue, rightValue]) => compareRowMarkup(label, leftValue, rightValue)).join("")
    + compareRowMarkup(t(language, "library.compareRoles"), renderRoleMarkup(leftConfig, state), renderRoleMarkup(rightConfig, state), "library-compare-pill-cell")
    + compareRowMarkup(t(language, "builder.movesTitle"), renderMoveMarkup(leftConfig, state), renderMoveMarkup(rightConfig, state), "library-compare-pill-cell");
}

function emptyCompareMarkup(state, selectedCount) {
  const language = state.language;
  if (selectedCount === 1) {
    return `<p class="muted">${t(language, "library.compareNeedSecond")}</p>`;
  }
  return `<p class="muted">${t(language, "library.compareEmpty")}</p>`;
}

export function compareToggleMarkup(configId, selectedConfigIds = [], language = "zh") {
  const active = selectedConfigIds.includes(configId);
  return `
    <button
      type="button"
      class="ghost-button mini-action ${active ? "active" : ""}"
      data-compare-config="${escapeHtml(configId)}"
      aria-pressed="${active ? "true" : "false"}"
    >
      ${t(language, active ? "library.compareRemove" : "library.compareAdd")}
    </button>
  `;
}

export function renderLibraryComparePanel(state) {
  const language = state.language;
  const selectedIds = state.libraryCompare?.selectedConfigIds || [];
  const speciesConfigs = state.library.filter((config) => config.speciesId === state.selectedSpeciesId);
  const selectedConfigs = selectedIds
    .map((configId) => speciesConfigs.find((config) => config.id === configId))
    .filter(Boolean);
  if (!state.selectedSpeciesId) {
    return "";
  }
  return `
    <section class="library-compare-panel">
      <div class="section-head section-head-tight">
        <div>
          <h3>${t(language, "library.compareTitle")}</h3>
          <p class="muted">${t(language, "library.compareCopy")}</p>
        </div>
      </div>
      ${selectedConfigs.length < 2
        ? emptyCompareMarkup(state, selectedConfigs.length)
        : `
          <div class="library-compare-grid">
            <div class="library-compare-spacer"></div>
            ${compareHeaderCard(selectedConfigs[0], state, "library.compareLeft")}
            ${compareHeaderCard(selectedConfigs[1], state, "library.compareRight")}
            ${compareRowsMarkup(selectedConfigs[0], selectedConfigs[1], state)}
          </div>
        `}
    </section>
  `;
}
