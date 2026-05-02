import {t} from "./i18n.js";
import {getRecommendationScoreMix, RECOMMENDATION_BIAS_ITEM, RECOMMENDATION_PREFERENCE_ITEMS} from "./recommendation-preferences.js";
import {compactRoleSummaryMarkup} from "./role-ui.js";
import {spriteMarkup} from "./sprites.js";
import {createRoleContext} from "./team-roles.js";
import {getDisplayNote, normalizeName} from "./utils.js";

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function noteMarkup(config) {
  const note = getDisplayNote(config.note);
  return note ? `<span class="mini-pill">${escapeHtml(note)}</span>` : "";
}

function getLocalizedSpeciesName(state, config = {}) {
  return state.localizedSpeciesNames?.get(config.speciesId) || config.speciesName || config.displayName || "";
}

function getLocalizedConfigName(state, config = {}) {
  return getLocalizedSpeciesName(state, config);
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

function buildTextTooltipMarkup(lines = []) {
  return `
    <div class="tooltip-stack">
      ${lines.map((line) => `<div class="tooltip-desc-box">${escapeHtml(line)}</div>`).join("")}
    </div>
  `;
}

function renderInfoPill(label, tooltipMarkup, className = "") {
  const classes = ["info-pill", "recommend-detail-pill", className].filter(Boolean).join(" ");
  return `
    <span class="${classes}" tabindex="0">
      <span class="info-pill-label">${escapeHtml(label)}</span>
      <span class="info-tooltip-content">${tooltipMarkup}</span>
    </span>
  `;
}

function renderQualityPills(config, language) {
  const quality = config.qualityBreakdown;
  if (!quality) {
    return "";
  }
  const totalLabel = quality.totals.base
    ? t(language, "recommend.qualityBase", {value: quality.totals.base})
    : t(language, "recommend.qualityBattle", {value: quality.totals.battle});
  return `
    <div class="recommend-quality-row">
      <span class="mini-pill">${escapeHtml(totalLabel)}</span>
      <span class="mini-pill">${escapeHtml(t(language, "recommend.qualityOutput", {value: quality.parts.output.toFixed(1)}))}</span>
      <span class="mini-pill">${escapeHtml(t(language, "recommend.qualityPhysicalBulk", {value: quality.parts.physicalBulk.toFixed(1)}))}</span>
      <span class="mini-pill">${escapeHtml(t(language, "recommend.qualitySpecialBulk", {value: quality.parts.specialBulk.toFixed(1)}))}</span>
      <span class="mini-pill">${escapeHtml(t(language, "recommend.qualitySpeedFlex", {value: quality.parts.speedFlex.toFixed(1)}))}</span>
      <span class="mini-pill">${escapeHtml(t(language, "recommend.qualityAbility", {value: quality.parts.ability.toFixed(1)}))}</span>
      <span class="mini-pill">${escapeHtml(t(language, "recommend.qualityUtility", {value: quality.parts.utility.toFixed(1)}))}</span>
      <span class="mini-pill">${escapeHtml(t(language, "recommend.qualityMoves", {value: quality.parts.moves.toFixed(1)}))}</span>
    </div>
  `;
}

function renderRecommendationDetailPills(config, state, language) {
  const detailLines = [
    `${t(language, "recommend.reasonLabel")}: ${(config.reasonItems || []).map((item) => item.label).join(" / ")}`,
    `${t(language, "recommend.helpLabel")}: ${config.weaknessHelp.join(" / ")}`,
  ];
  if (config.teammateMatches?.length) {
    detailLines.push(`${t(language, "recommend.teammateLabel")}: ${config.teammateMatches.map((entry) => getLocalizedConfigName(state, entry.member)).join(" / ")}`);
  }
  if (config.counterChain?.targets?.length) {
    detailLines.push(`${t(language, "recommend.counterChainLabel")}: ${config.counterChain.targets.map((entry) => counterTargetLabel(entry, language)).join(" / ")}`);
  }
  if (config.penaltyItems?.length) {
    detailLines.push(`${t(language, "recommend.penaltyLabel")}: ${config.penaltyItems.map((item) => item.label).join(" / ")}`);
  }
  return renderInfoPill(
    t(language, "recommend.details"),
    buildTextTooltipMarkup(detailLines),
  );
}

function counterTargetLabel(entry, language) {
  return language === "zh" ? entry.localizedLabel || entry.label : entry.label;
}

function renderInsightPills(items = [], toneClass = "") {
  return items.map((item) => renderInfoPill(
    item.label,
    buildTextTooltipMarkup([item.detail || item.label]),
    toneClass,
  )).join("");
}

function renderInsightBlock(title, items, emptyLabel, toneClass = "") {
  const blockClass = toneClass === "recommend-detail-pill-negative"
    ? "recommend-insight-block recommend-insight-block-negative"
    : "recommend-insight-block";
  return `
    <div class="${blockClass}">
      <div class="analysis-label">${escapeHtml(title)}</div>
      <div class="recommend-insight-list">
        ${items.length ? renderInsightPills(items, toneClass) : `<span class="mini-pill">${escapeHtml(emptyLabel)}</span>`}
      </div>
    </div>
  `;
}

function renderFocusChip(type, label, isActive) {
  return `
    <button
      type="button"
      class="ghost-button mini-action recommend-chip ${isActive ? "active" : ""}"
      data-recommend-focus-type="${escapeHtml(type)}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function renderConfigPreview(config, state, language) {
  const itemConflictMarkup = config.itemConflictMembers?.length
    ? `<span class="mini-pill recommend-config-alert">${escapeHtml(t(language, "recommend.itemConflict"))}</span>`
    : "";
  const metaEntries = [
    config.item ? `${t(language, "builder.item")} · ${getLocalizedItemName(state, config)}` : "",
    config.ability ? `${t(language, "builder.ability")} · ${getLocalizedAbilityName(state, config)}` : "",
    config.teraType ? `Tera · ${config.teraType}` : "",
  ].filter(Boolean).slice(0, 3);
  const moves = (config.moveNames || []).slice(0, 4);
  while (moves.length < 4) {
    moves.push("");
  }
  return `
    <div class="recommend-config-preview">
      <div class="recommend-config-meta">
        ${metaEntries.map((entry) => `<span class="mini-pill recommend-config-pill" title="${escapeHtml(entry)}">${escapeHtml(entry)}</span>`).join("")}
        ${itemConflictMarkup}
      </div>
      <div class="recommend-move-grid">
        ${moves.map((move) => `
          <span class="recommend-move-chip ${move ? "" : "is-empty"}" title="${escapeHtml(getLocalizedMoveName(state, move) || "")}">
            ${escapeHtml(getLocalizedMoveName(state, move) || "—")}
          </span>
        `).join("")}
      </div>
    </div>
  `;
}

export function renderRecommendationControls(state) {
  const language = state.language;
  if (!state.team.length || state.team.length >= 6) {
    return "";
  }
  const weakRows = state.analysis?.coverage?.weakRows || [];
  const chips = [
    renderFocusChip("", t(language, "recommend.focusAll"), !state.recommendFocusType),
    ...weakRows.map((entry) => renderFocusChip(entry.type, entry.label, state.recommendFocusType === entry.type)),
  ].join("");
  const megaChip = `
    <button
      type="button"
      class="ghost-button mini-action recommend-chip recommend-mega-chip ${state.recommendMegaOnly ? "active" : ""}"
      data-recommend-mega-only="${state.recommendMegaOnly ? "false" : "true"}"
      aria-pressed="${state.recommendMegaOnly ? "true" : "false"}"
    >
      ${escapeHtml(t(language, "recommend.megaOnly"))}
    </button>
  `;
  const toggles = RECOMMENDATION_PREFERENCE_ITEMS.map((item) => `
    <button
      type="button"
      class="ghost-button mini-action recommend-toggle ${state.recommendPreferences[item.id] ? "active" : ""}"
      data-recommend-preference="${item.id}"
      aria-pressed="${state.recommendPreferences[item.id] ? "true" : "false"}"
    >
      ${escapeHtml(t(language, item.labelKey))}
    </button>
  `).join("");
  const scoreMix = state.recommendScoreMix
    || getRecommendationScoreMix(state.team.length, state.recommendWeights);
  const sliderId = RECOMMENDATION_BIAS_ITEM.id;
  const resetMarkup = state.dismissedRecommendationKeys.length
    ? `
      <button
        type="button"
        class="ghost-button mini-action"
        data-reset-dismissed-recommendations="true"
      >
        ${t(language, "recommend.resetHidden", {count: state.dismissedRecommendationKeys.length})}
      </button>
    `
    : "";
  const autoBiasMarkup = `
    <button
      type="button"
      class="ghost-button mini-action"
      data-apply-recommend-auto-bias="true"
    >
      ${t(language, "recommend.applyAutoBias")}
    </button>
  `;
  return `
    <section class="subpanel recommend-controls-panel">
      <div class="section-head section-head-tight">
        <div>
          <h3>${t(language, "recommend.focusTitle")}</h3>
          <p class="muted">${t(language, "recommend.focusCopy")}</p>
        </div>
      </div>
      <div class="analysis-inline-pills recommend-chip-row">${chips}${megaChip}</div>
      ${state.recommendFocusSource === "analysis" && state.recommendFocusType
        ? `<p class="recommend-focus-source">${t(language, "recommend.focusSourceAnalysis")}</p>`
        : ""}
      <div class="section-head section-head-tight recommend-toggle-head">
        <div>
          <h3>${t(language, "recommend.prefTitle")}</h3>
          <p class="muted">${t(language, "recommend.prefCopy")}</p>
        </div>
      </div>
      <div class="analysis-inline-pills recommend-toggle-row">${toggles}</div>
      <div class="section-head section-head-tight recommend-toggle-head">
        <div>
          <h3>${t(language, "recommend.weightTitle")}</h3>
          <p class="muted">${t(language, "recommend.weightCopy")}</p>
        </div>
        <div class="action-row">
          ${autoBiasMarkup}
          ${resetMarkup}
        </div>
      </div>
      <div class="recommend-slider-grid">
        <label class="recommend-slider-field recommend-slider-field-wide">
          <div class="recommend-slider-copy">
            <span>${escapeHtml(t(language, RECOMMENDATION_BIAS_ITEM.labelKey))}</span>
            <strong data-recommend-weight-value="${sliderId}">${Number(state.recommendWeights[sliderId] || 0)}</strong>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value="${Number(state.recommendWeights[sliderId] || 0)}"
            data-recommend-weight="${sliderId}"
          >
          <div class="recommend-slider-scale">
            <span>${escapeHtml(t(language, RECOMMENDATION_BIAS_ITEM.minLabelKey))}</span>
            <span>${escapeHtml(t(language, RECOMMENDATION_BIAS_ITEM.maxLabelKey))}</span>
          </div>
          <p
            class="muted recommend-slider-summary"
            data-recommend-weight-summary="${sliderId}"
          >
            ${escapeHtml(t(language, "recommend.weightSummary", {
              preset: scoreMix.presetBias,
              pairing: scoreMix.pairingBias,
              team: scoreMix.teamShapeBias,
            }))}
          </p>
        </label>
      </div>
    </section>
  `;
}

function renderRecommendationCard(config, state) {
  const language = state.language;
  const roleContext = createRoleContext(state.library);
  const isTemplate = config.recommendationAction === "configure";
  const isCompared = state.recommendCompareIds?.includes(config.id);
  const focusScoreMarkup = state.recommendFocusType
    ? `<span>${t(language, "recommend.focus", {value: config.breakdown.focus.toFixed(1)})}</span>`
    : "";
  const focusFallbackMarkup = config.recommendationFocusFallback
    ? `<span class="source-tag">${t(language, "recommend.focusFallback")}</span>`
    : "";
  const actionMarkup = isTemplate
    ? `<button type="button" class="add-button" data-open-recommend-template="${config.id}">${t(language, "recommend.templateAction")}</button>`
    : `<button type="button" class="add-button" data-add-config="${config.id}">${t(language, "library.add")}</button>`;
  return `
    <article class="entry-card compact recommend-card">
      <div class="entry-main">
        <div class="entry-title">
          ${spriteMarkup(config, state)}
          <strong>${escapeHtml(getLocalizedConfigName(state, config))}</strong>
          ${noteMarkup(config)}
          ${isTemplate ? `<span class="source-tag">${t(language, "recommend.templateTag")}</span>` : ""}
          ${focusFallbackMarkup}
          <span class="source-tag score-tag">${t(language, "recommend.score", {value: config.recommendationScore.toFixed(1)})}</span>
        </div>
        <div class="entry-tags recommend-detail-row">
          ${compactRoleSummaryMarkup(config, language, {roleContext})}
        </div>
        ${renderConfigPreview(config, state, language)}
        <div class="score-row">
          <span>${t(language, "recommend.resistance", {value: config.breakdown.resistance.toFixed(1)})}</span>
          <span>${t(language, "recommend.coverage", {value: config.breakdown.coverage.toFixed(1)})}</span>
          ${focusScoreMarkup}
          <span>${t(language, "recommend.speed", {value: config.breakdown.speed.toFixed(1)})}</span>
          <span>${t(language, "recommend.synergy", {value: config.breakdown.synergy.toFixed(1)})}</span>
          <span>${t(language, "recommend.teammates", {value: config.breakdown.teammates.toFixed(1)})}</span>
          <span>${t(language, "recommend.counterChain", {value: config.breakdown.counterChain.toFixed(1)})}</span>
          <span>${t(language, "recommend.quality", {value: config.breakdown.quality.toFixed(1)})}</span>
        </div>
        <div class="recommend-insight-grid">
          ${renderInsightBlock(
            t(language, "recommend.reasonBlockTitle"),
            (config.reasonItems || []).slice(0, 4),
            t(language, "recommend.reason.balance"),
          )}
          ${renderInsightBlock(
            t(language, "recommend.penaltyBlockTitle"),
            (config.penaltyItems || []).slice(0, 2),
            t(language, "recommend.noPenalty"),
            "recommend-detail-pill-negative",
          )}
        </div>
        ${renderQualityPills(config, language)}
        <div class="entry-tags recommend-detail-row">
          ${renderRecommendationDetailPills(config, state, language)}
        </div>
      </div>
      <div class="card-actions recommend-card-actions">
        ${actionMarkup}
        <button
          type="button"
          class="ghost-button mini-action ${isCompared ? "active" : ""}"
          data-toggle-recommend-compare="${config.id}"
          aria-pressed="${isCompared ? "true" : "false"}"
        >
          ${t(language, isCompared ? "recommend.compareRemove" : "recommend.compareAdd")}
        </button>
        <button
          type="button"
          class="ghost-button mini-action recommend-dismiss-button"
          data-dismiss-recommendation="${config.recommendationKey}"
        >
          ${t(language, "recommend.dismiss")}
        </button>
      </div>
    </article>
  `;
}

function compareMetricRow(label, leftValue, rightValue = "") {
  return `
    <div class="recommend-compare-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(leftValue)}</strong>
      <strong>${escapeHtml(rightValue)}</strong>
    </div>
  `;
}

function renderCompareMember(config, state) {
  if (!config) return "";
  return `
    <div class="recommend-compare-head-card">
      ${spriteMarkup(config, state)}
      <strong>${escapeHtml(getLocalizedConfigName(state, config))}</strong>
      ${noteMarkup(config)}
      <span class="source-tag score-tag">${t(state.language, "recommend.score", {value: config.recommendationScore.toFixed(1)})}</span>
    </div>
  `;
}

function renderRecommendationComparePanel(state) {
  const compared = (state.recommendCompareIds || [])
    .map((id) => state.recommendations.find((entry) => entry.id === id))
    .filter(Boolean);
  if (!compared.length) return "";
  const [left, right] = compared;
  const language = state.language;
  const metricRows = [
    ["recommend.resistance", "resistance"],
    ["recommend.coverage", "coverage"],
    ["recommend.speed", "speed"],
    ["recommend.synergy", "synergy"],
    ["recommend.teammates", "teammates"],
    ["recommend.counterChain", "counterChain"],
    ["recommend.quality", "quality"],
  ].map(([key, part]) => compareMetricRow(
    t(language, key, {value: ""}).trim(),
    left?.breakdown?.[part]?.toFixed(1) || "-",
    right?.breakdown?.[part]?.toFixed(1) || "-",
  )).join("");
  return `
    <section class="subpanel recommend-compare-panel">
      <div class="section-head section-head-tight">
        <div>
          <h3>${t(language, "recommend.compareTitle")}</h3>
          <p class="muted">${t(language, "recommend.compareCopy")}</p>
        </div>
      </div>
      <div class="recommend-compare-head">${renderCompareMember(left, state)}${renderCompareMember(right, state)}</div>
      <div class="recommend-compare-grid">${metricRows}</div>
    </section>
  `;
}

export function renderRecommendationCards(state) {
  const language = state.language;
  if (!state.team.length || state.team.length >= 6) {
    return `<p class="empty-state">${t(language, state.team.length >= 6 ? "recommend.teamFull" : "recommend.empty")}</p>`;
  }
  return state.recommendations.length
    ? state.recommendations.map((config) => renderRecommendationCard(config, state)).join("")
    : `<p class="empty-state">${t(language, "recommend.empty")}</p>`;
}

export function renderRecommendationsView(state) {
  const cards = renderRecommendationCards(state);
  return `
    ${renderRecommendationControls(state)}
    ${renderRecommendationComparePanel(state)}
    <div class="stack-list compact-list recommend-list-stack">${cards}</div>
  `;
}

export function renderRecommendationListOnly(state) {
  return `<div class="stack-list compact-list recommend-list-stack">${renderRecommendationCards(state)}</div>`;
}
