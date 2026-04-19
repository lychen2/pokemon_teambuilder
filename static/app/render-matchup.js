import {t} from "./i18n.js";
import {filterOpponentLibrary, getOpponentVariantCount} from "./matchup-selection.js";
import {setInnerHTMLIfChanged} from "./render-cache.js";
import {renderMatchupBoard} from "./render-matchup-board.js";
import {renderRecommendationListOnly} from "./render-recommendations.js";
import {spriteMarkup} from "./sprites.js";
import {getTypeLabel} from "./utils.js";

const CONFIG_PREVIEW_LIMIT = 3;

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getTypeClassName(type) {
  return `type-${String(type || "").toLowerCase()}`;
}

function typePills(types = [], language) {
  return types.map((type) => `<span class="pill type-pill ${getTypeClassName(type)}">${getTypeLabel(type, language)}</span>`).join("");
}

function buildTextTooltipMarkup(detail, language) {
  return `<div class="tooltip-stack"><div class="tooltip-desc-box">${escapeHtml(detail || t(language, "tooltip.noDetail"))}</div></div>`;
}

function renderTooltipPill(label, detail, language, className = "mini-pill") {
  const pillClassName = ["info-pill", className].filter(Boolean).join(" ");
  return `<span class="${pillClassName}" tabindex="0"><span class="info-pill-label">${escapeHtml(label)}</span><span class="info-tooltip-content">${buildTextTooltipMarkup(detail, language)}</span></span>`;
}

function memberPillsMarkup(members = [], state) {
  return members.map((member) => {
    const localized = member.speciesId
      ? state?.localizedSpeciesNames?.get(member.speciesId)
      : null;
    const label = localized || member.label || member.speciesName || "";
    return `<span class="mini-pill analysis-member-pill">${escapeHtml(label)}</span>`;
  }).join("");
}

function rolePillsMarkup(roles = [], language) {
  return roles.slice(0, 5).map((roleId) => `<span class="mini-pill">${escapeHtml(t(language, `analysis.role.${roleId}`))}</span>`).join("");
}

function sideTagMarkup(entry, language) {
  const sideKey = entry.matchupSide === "opponent" ? "matchup.side.opponent" : "matchup.side.ally";
  const sideClass = entry.matchupSide === "opponent" ? "analysis-alert-pill" : "analysis-good-pill";
  return `<span class="mini-pill ${sideClass}">${escapeHtml(t(language, sideKey))}</span>`;
}

function buildConfigSummary(labels = []) {
  if (!labels.length) {
    return "";
  }
  const preview = labels.slice(0, CONFIG_PREVIEW_LIMIT).join(" / ");
  return labels.length > CONFIG_PREVIEW_LIMIT ? `${preview} / ...` : preview;
}

function buildSpeedSummary(entry, language) {
  const minSpeed = Number(entry.speedRange?.min || 0);
  const maxSpeed = Number(entry.speedRange?.max || 0);
  if (minSpeed === maxSpeed) {
    return `${t(language, "common.speed")} ${maxSpeed}`;
  }
  return `${t(language, "common.speed")} ${minSpeed}-${maxSpeed}`;
}

function getLocalizedSpeciesName(state, entry) {
  return entry.localizedSpeciesName || state.localizedSpeciesNames?.get(entry.speciesId) || entry.speciesName;
}

function quickPickSpriteMarkup(entry, state) {
  const language = state.language;
  const selected = state.opponentTeam.some((member) => member.speciesId === entry.speciesId);
  const titleParts = [
    getLocalizedSpeciesName(state, entry),
    buildSpeedSummary(entry, language),
  ];
  if (entry.labels?.length) {
    titleParts.push(buildConfigSummary(entry.labels));
  }
  return `
    <button
      type="button"
      class="species-browser-button ${selected ? "active" : ""}"
      data-add-opponent-species="${entry.speciesId}"
      title="${escapeHtml(titleParts.filter(Boolean).join(" · "))}"
      aria-pressed="${selected ? "true" : "false"}"
    >
      ${spriteMarkup(entry, state)}
    </button>
  `;
}

function configOptionMarkup(entry, config, language, isSelected) {
  const label = config?.displayLabel || config?.displayName || config?.speciesName || t(language, "common.unknown");
  return `
    <button
      type="button"
      class="matchup-config-option ${isSelected ? "active" : ""}"
      data-select-opponent-config="${entry.speciesId}"
      data-opponent-config-id="${escapeHtml(config?.id || "")}"
      aria-pressed="${isSelected ? "true" : "false"}"
    >${escapeHtml(label)}</button>
  `;
}

function configPickerMarkup(entry, state, variantCount, language) {
  if (variantCount <= 1) {
    return "";
  }
  const pickerOpen = state.activeOpponentConfigSpeciesId === entry.speciesId;
  const currentLabel = entry.selectedConfigLabel || t(language, "matchup.allConfigs");
  const summaryLabel = entry.selectedConfigId
    ? t(language, "matchup.currentConfigLocked", {name: currentLabel})
    : t(language, "matchup.currentConfigAll");
  const optionsMarkup = !pickerOpen
    ? ""
    : `
      <div class="matchup-config-picker" role="group" aria-label="${escapeHtml(t(language, "matchup.selectConfig"))}">
        <button
          type="button"
          class="matchup-config-option ${entry.selectedConfigId ? "" : "active"}"
          data-select-opponent-config="${entry.speciesId}"
          data-opponent-config-id=""
          aria-pressed="${entry.selectedConfigId ? "false" : "true"}"
        >${t(language, "matchup.allConfigs")}</button>
        ${entry.configs.map((config) => configOptionMarkup(entry, config, language, config.id === entry.selectedConfigId)).join("")}
      </div>
    `;
  return `
    <div class="matchup-config-box">
      <div class="matchup-config-head">
        <button
          type="button"
          class="ghost-button mini-action matchup-config-toggle ${pickerOpen ? "active" : ""}"
          data-toggle-opponent-config-picker="${entry.speciesId}"
          aria-expanded="${pickerOpen ? "true" : "false"}"
        >${t(language, "matchup.variantCount", {count: variantCount})}</button>
        <span class="muted matchup-config-summary">${escapeHtml(summaryLabel)}</span>
      </div>
      ${optionsMarkup}
    </div>
  `;
}

function opponentCardMarkup(entry, state) {
  const language = state.language;
  const variantCount = getOpponentVariantCount(entry);
  const pinLabel = entry.pinned ? t(language, "matchup.unpin") : t(language, "matchup.pin");
  return `
    <article class="team-card">
      <div class="entry-main">
        <div class="entry-title">${spriteMarkup(entry, state)}<strong>${escapeHtml(getLocalizedSpeciesName(state, entry))}</strong></div>
        <div class="entry-meta">${typePills(entry.types, language)}</div>
        <p class="muted">${buildConfigSummary(entry.labels)}</p>
        <p class="muted">${buildSpeedSummary(entry, language)}</p>
        ${entry.pinned ? `<div class="entry-tags"><span class="source-tag">${t(language, "matchup.pinned")}</span></div>` : ""}
        ${configPickerMarkup(entry, state, variantCount, language)}
      </div>
      <div class="team-card-actions">
        <button type="button" class="ghost-button mini-action" data-toggle-opponent-pin="${entry.speciesId}">${pinLabel}</button>
        <button type="button" class="ghost-button mini-action" data-open-damage-defender="${entry.speciesId}">${t(language, "team.damage")}</button>
        <button type="button" class="ghost-button danger-button mini-action" data-remove-opponent-species="${entry.speciesId}">${t(language, "team.remove")}</button>
      </div>
    </article>
  `;
}

function savedOpponentCardMarkup(entry, language) {
  const openMeta = entry.openCount ? `<span class="source-tag">${t(language, "matchup.savedOpened", {count: entry.openCount})}</span>` : "";
  return `
    <article class="entry-card compact saved-team-card">
      <div class="entry-main">
        <div class="entry-title"><strong>${escapeHtml(entry.name)}</strong><span class="source-tag">${entry.speciesIds.length} / 6</span>${openMeta}</div>
        <p class="muted">${escapeHtml(entry.labels.join(" / ") || t(language, "common.emptyTeam"))}</p>
      </div>
      <div class="card-actions">
        <button type="button" class="add-button" data-load-opponent-team="${entry.id}">${t(language, "saved.load")}</button>
        <button type="button" class="ghost-button danger-button mini-action" data-delete-opponent-team="${entry.id}">${t(language, "saved.delete")}</button>
      </div>
    </article>
  `;
}

function speedModePillMarkup(entry, language) {
  if (entry.speedTierMode === "plus1" && entry.plusOneSpeed) {
    return renderTooltipPill(t(language, "matchup.speedBoostPlusOne"), t(language, "matchup.speedTooltipPlusOne", {sources: entry.plusOneSpeed.sources.join(" / ")}), language);
  }
  if (entry.speedTierMode === "scarf" && entry.choiceScarfSpeed) {
    return renderTooltipPill(t(language, "matchup.speedBoostScarf"), t(language, "matchup.speedTooltipScarf", {sources: entry.choiceScarfSpeed.sources.join(" / ")}), language);
  }
  return "";
}

function leadCardMarkup(entry, language, state) {
  const targetsMarkup = entry.targets.length
    ? `<div class="analysis-member-pills">${memberPillsMarkup(entry.targets, state)}</div>`
    : `<span class="muted">${t(language, "common.none")}</span>`;
  const backlineMarkup = entry.backline.length
    ? `<div class="analysis-member-pills">${memberPillsMarkup(entry.backline, state)}</div>`
    : `<span class="muted">${t(language, "common.none")}</span>`;
  return `
    <article class="analysis-core-card good matchup-lead-card">
      <div class="analysis-list-head">
        <div class="analysis-core-members">${memberPillsMarkup(entry.members, state)}</div>
        <div class="analysis-inline-pills">
          <span class="source-tag score-tag">${t(language, "matchup.leadScore", {value: entry.score.toFixed(1)})}</span>
          <span class="source-tag score-tag">${t(language, "matchup.lineupScore", {value: entry.lineupScore.toFixed(1)})}</span>
        </div>
      </div>
      <div class="matchup-lead-body">
        <div class="matchup-lead-slot">
          <div class="analysis-label">${t(language, "matchup.targets")}</div>
          ${targetsMarkup}
        </div>
        <div class="matchup-lead-slot">
          <div class="analysis-label">${t(language, "matchup.backline")}</div>
          ${backlineMarkup}
        </div>
      </div>
      <div class="analysis-inline-pills matchup-breakdown-row">
        <span class="mini-pill">${t(language, "matchup.breakdown.pressure", {value: entry.breakdown.pressure.toFixed(1)})}</span>
        <span class="mini-pill analysis-alert-pill">${t(language, "matchup.breakdown.exposure", {value: entry.breakdown.exposure.toFixed(1)})}</span>
        ${entry.breakdown.redirection ? `<span class="mini-pill analysis-good-pill">${t(language, "matchup.breakdown.redirection", {value: entry.breakdown.redirection.toFixed(1)})}</span>` : ""}
        ${entry.breakdown.wideGuard ? `<span class="mini-pill analysis-good-pill">${t(language, "matchup.breakdown.wideGuard", {value: entry.breakdown.wideGuard.toFixed(1)})}</span>` : ""}
        ${entry.breakdown.helpingHand ? `<span class="mini-pill analysis-good-pill">${t(language, "matchup.breakdown.helpingHand", {value: entry.breakdown.helpingHand.toFixed(1)})}</span>` : ""}
        ${entry.breakdown.protect ? `<span class="mini-pill analysis-good-pill">${t(language, "matchup.breakdown.protect", {value: entry.breakdown.protect.toFixed(1)})}</span>` : ""}
      </div>
      ${entry.roles.length ? `<div class="analysis-inline-pills">${rolePillsMarkup(entry.roles, language)}</div>` : ""}
    </article>
  `;
}

function speedLineCardMarkup(tier, language, state) {
  return `
    <article class="entry-card compact">
      <div class="entry-main">
        <div class="entry-title"><strong>Spe ${tier.speed}</strong><span class="source-tag">${t(language, "common.countLine", {count: tier.totalCount})}</span></div>
        <div class="entry-line entry-tags">
          ${tier.entries.map((entry) => `
            <span class="speed-entry">
              ${spriteMarkup(entry, state)}
              <span>${escapeHtml(getLocalizedSpeciesName(state, entry))}</span>
            </span>
            ${speedModePillMarkup(entry, language)}
            ${sideTagMarkup(entry, language)}
          `).join("")}
        </div>
      </div>
    </article>
  `;
}

function renderBuilder(state) {
  const language = state.language;
  const filtered = filterOpponentLibrary(state.matchupLibrary, state.matchupSearch);
  setInnerHTMLIfChanged(
    document.getElementById("opponent-team-list"),
    state.opponentTeam.length
      ? state.opponentTeam.map((entry) => opponentCardMarkup(entry, state)).join("")
      : `<div class="team-card empty-slot">${t(language, "matchup.opponentPlaceholder")}</div>`,
  );
  setInnerHTMLIfChanged(
    document.getElementById("saved-opponent-list"),
    state.savedOpponentTeams.length
      ? state.savedOpponentTeams.map((entry) => savedOpponentCardMarkup(entry, language)).join("")
      : `<p class="empty-state">${t(language, "matchup.savedEmpty")}</p>`,
  );
  document.getElementById("matchup-library-summary").textContent = t(language, "matchup.librarySummary", {
    species: state.matchupLibrary.length,
    sets: state.library.length,
    filtered: filtered.length,
  });
  setInnerHTMLIfChanged(
    document.getElementById("matchup-library-list"),
    filtered.length
      ? `<div class="species-browser-grid">${filtered.map((entry) => quickPickSpriteMarkup(entry, state)).join("")}</div>`
      : `<p class="empty-state">${t(language, "library.empty")}</p>`,
  );
}

function renderAnalysis(state) {
  const language = state.language;
  const analysis = state.matchup;
  const container = document.getElementById("matchup-analysis");
  if (!state.team.length) {
    setInnerHTMLIfChanged(container, `<p class="empty-state">${t(language, "matchup.needAlly")}</p>`);
    return;
  }
  const recommendationSection = `
    <section class="subpanel matchup-recommend-panel">
      <div class="section-head">
        <div>
          <h3>${t(language, "views.recommendTitle")}</h3>
          <p class="muted">${t(language, "matchup.recommendCopy")}</p>
        </div>
      </div>
      <div class="matchup-recommend-list">${renderRecommendationListOnly(state)}</div>
    </section>
  `;
  if (!state.opponentTeam.length) {
    setInnerHTMLIfChanged(container, `${recommendationSection}<p class="empty-state">${t(language, "matchup.needOpponent")}</p>`);
    return;
  }
  if (!analysis) {
    setInnerHTMLIfChanged(container, `${recommendationSection}<p class="empty-state">${t(language, "analysis.empty")}</p>`);
    return;
  }
  setInnerHTMLIfChanged(container, `
    <div class="analysis-overview matchup-overview">
      <article class="metric-card"><span>${t(language, "matchup.overviewAlly")}</span><strong>${analysis.overview.allyCount}</strong></article>
      <article class="metric-card"><span>${t(language, "matchup.overviewOpponent")}</span><strong>${analysis.overview.opponentCount}</strong></article>
      <article class="metric-card"><span>${t(language, "matchup.overviewSpeed")}</span><strong>${analysis.overview.speedLineCount}</strong></article>
    </div>
    ${recommendationSection}
    <section class="subpanel">
      <h3>${t(language, "matchup.recommendedLeadTitle")}</h3>
      ${analysis.leadPairs.length
        ? `<div class="analysis-core-grid matchup-lead-grid">${analysis.leadPairs.map((entry) => leadCardMarkup(entry, language, state)).join("")}</div>`
        : `<p class="empty-state">${t(language, "matchup.noLeadOption")}</p>`}
    </section>
    <section class="subpanel">
      <h3>${t(language, "matchup.speedLinesTitle")}</h3>
      <div class="stack-list compact-list">${analysis.speedLines.map((tier) => speedLineCardMarkup(tier, language, state)).join("")}</div>
    </section>
    ${renderMatchupBoard(analysis.board, state)}
  `);
}

export function renderMatchupView(state) {
  renderBuilder(state);
  renderAnalysis(state);
}
