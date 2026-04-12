import {t} from "./i18n.js";
import {RECOMMENDATION_PREFERENCE_ITEMS, RECOMMENDATION_WEIGHT_ITEMS} from "./recommendation-preferences.js";

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function spriteMarkup(config) {
  if (!config?.spritePosition) {
    return "";
  }
  const {x, y} = config.spritePosition;
  return `<span class="sprite" style="background-position: ${-x}px ${-y}px"></span>`;
}

function noteMarkup(config) {
  return config.note ? `<span class="mini-pill">${escapeHtml(config.note)}</span>` : "";
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
  const sliders = RECOMMENDATION_WEIGHT_ITEMS.map((item) => `
    <label class="recommend-slider-field">
      <span>${escapeHtml(t(language, item.labelKey))}</span>
      <input
        type="range"
        min="0"
        max="200"
        step="10"
        value="${Number(state.recommendWeights[item.id] || 0)}"
        data-recommend-weight="${item.id}"
      >
      <strong data-recommend-weight-value="${item.id}">${Number(state.recommendWeights[item.id] || 0)}%</strong>
    </label>
  `).join("");
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
  return `
    <section class="subpanel recommend-controls-panel">
      <div class="section-head section-head-tight">
        <div>
          <h3>${t(language, "recommend.focusTitle")}</h3>
          <p class="muted">${t(language, "recommend.focusCopy")}</p>
        </div>
      </div>
      <div class="analysis-inline-pills recommend-chip-row">${chips}</div>
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
        ${resetMarkup}
      </div>
      <div class="recommend-slider-grid">${sliders}</div>
    </section>
  `;
}

function renderRecommendationCard(config, language) {
  const isTemplate = config.recommendationAction === "configure";
  const actionMarkup = isTemplate
    ? `<button type="button" class="add-button" data-open-recommend-template="${config.id}">${t(language, "recommend.templateAction")}</button>`
    : `<button type="button" class="add-button" data-add-config="${config.id}">${t(language, "library.add")}</button>`;
  return `
    <article class="entry-card compact recommend-card">
      <div class="entry-main">
        <div class="entry-title">
          ${spriteMarkup(config)}
          <strong>${escapeHtml(config.displayName)}</strong>
          ${noteMarkup(config)}
          ${isTemplate ? `<span class="source-tag">${t(language, "recommend.templateTag")}</span>` : ""}
          <span class="source-tag score-tag">${t(language, "recommend.score", {value: config.recommendationScore.toFixed(1)})}</span>
        </div>
        <div class="score-row">
          <span>${t(language, "recommend.resistance", {value: config.breakdown.resistance.toFixed(1)})}</span>
          <span>${t(language, "recommend.coverage", {value: config.breakdown.coverage.toFixed(1)})}</span>
          <span>${t(language, "recommend.speed", {value: config.breakdown.speed.toFixed(1)})}</span>
          <span>${t(language, "recommend.synergy", {value: config.breakdown.synergy.toFixed(1)})}</span>
          <span>${t(language, "recommend.quality", {value: config.breakdown.quality.toFixed(1)})}</span>
        </div>
        ${renderQualityPills(config, language)}
        <p class="entry-line">${config.reasons.join(" / ")}</p>
        ${config.penalties?.length ? `<p class="muted recommend-penalty-copy">${t(language, "recommend.penaltyLabel")}: ${escapeHtml(config.penalties.join(" / "))}</p>` : ""}
        <p class="muted">${t(language, "recommend.help", {value: config.weaknessHelp.join(" / ")})}</p>
      </div>
      <div class="card-actions recommend-card-actions">
        ${actionMarkup}
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

export function renderRecommendationCards(state) {
  const language = state.language;
  if (!state.team.length || state.team.length >= 6) {
    return `<p class="empty-state">${t(language, state.team.length >= 6 ? "recommend.teamFull" : "recommend.empty")}</p>`;
  }
  return state.recommendations.length
    ? state.recommendations.map((config) => renderRecommendationCard(config, language)).join("")
    : `<p class="empty-state">${t(language, "recommend.empty")}</p>`;
}

export function renderRecommendationsView(state) {
  const cards = renderRecommendationCards(state);
  return `
    ${renderRecommendationControls(state)}
    <div class="stack-list compact-list recommend-list-stack">${cards}</div>
  `;
}

export function renderRecommendationListOnly(state) {
  return `<div class="stack-list compact-list recommend-list-stack">${renderRecommendationCards(state)}</div>`;
}
