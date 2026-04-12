import {t} from "./i18n.js";
import {filterOpponentLibrary, getOpponentVariantCount} from "./matchup-selection.js";
import {renderRecommendationListOnly} from "./render-recommendations.js";
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

function spriteMarkup(config) {
  if (!config?.spritePosition) {
    return "";
  }
  const {x, y} = config.spritePosition;
  return `<span class="sprite" style="background-position: ${-x}px ${-y}px"></span>`;
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

function memberPillsMarkup(members = []) {
  return members.map((member) => `<span class="mini-pill analysis-member-pill">${escapeHtml(member.label)}</span>`).join("");
}

function rolePillsMarkup(roles = [], language) {
  return roles.slice(0, 5).map((roleId) => `<span class="mini-pill">${escapeHtml(t(language, `analysis.role.${roleId}`))}</span>`).join("");
}

function sideTagMarkup(entry, language) {
  const sideKey = entry.matchupSide === "opponent" ? "matchup.side.opponent" : "matchup.side.ally";
  const sideClass = entry.matchupSide === "opponent" ? "analysis-alert-pill" : "analysis-good-pill";
  return `<span class="mini-pill ${sideClass}">${escapeHtml(t(language, sideKey))}</span>`;
}

function getResistanceTooltip(entry, language) {
  const value = Number(entry.resistance || 0);
  const toneKey = value === 0
    ? "matchup.resistanceTooltipZero"
    : value < 1
      ? "matchup.resistanceTooltipLow"
      : value > 1
        ? "matchup.resistanceTooltipHigh"
        : "matchup.resistanceTooltipNeutral";
  return `${t(language, "matchup.resistanceTooltipCommon")} ${t(language, toneKey)}`;
}

function threatPillMarkup(entry, language) {
  return `
    <span class="speed-analysis-ref">
      <span class="mini-pill speed-analysis-name">${escapeHtml(entry.member.label)}</span>
      ${entry.member.variantCount > 1 ? `<span class="mini-pill">${t(language, "matchup.variantCount", {count: entry.member.variantCount})}</span>` : ""}
      <span class="mini-pill">${t(language, "matchup.effectiveness", {value: entry.effectiveness.toFixed(1)})}</span>
      <span class="mini-pill speed-analysis-speed">Spe ${escapeHtml(entry.speed)}</span>
      ${"resistance" in entry ? renderTooltipPill(
        t(language, "matchup.resistance", {value: entry.resistance.toFixed(1)}),
        getResistanceTooltip(entry, language),
        language,
      ) : ""}
    </span>
  `;
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
  const variantCount = getOpponentVariantCount(entry);
  const selected = state.opponentTeam.some((member) => member.speciesId === entry.speciesId);
  const titleParts = [
    getLocalizedSpeciesName(state, entry),
    buildSpeedSummary(entry, language),
  ];
  if (variantCount > 1) {
    titleParts.push(t(language, "matchup.variantCount", {count: variantCount}));
  }
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
      ${spriteMarkup(entry)}
      ${variantCount > 1 ? `<span class="species-browser-count">${variantCount}</span>` : ""}
    </button>
  `;
}

function opponentCardMarkup(entry, language) {
  const variantCount = getOpponentVariantCount(entry);
  return `
    <article class="team-card">
      <div class="entry-main">
        <div class="entry-title">${spriteMarkup(entry)}<strong>${escapeHtml(entry.speciesName)}</strong><span class="source-tag">${t(language, "matchup.variantCount", {count: variantCount})}</span></div>
        <div class="entry-meta">${typePills(entry.types, language)}</div>
        <p class="muted">${buildConfigSummary(entry.labels)}</p>
        <p class="muted">${buildSpeedSummary(entry, language)}</p>
      </div>
      <button type="button" class="ghost-button danger-button sidebar-action" data-remove-opponent-species="${entry.speciesId}">${t(language, "team.remove")}</button>
    </article>
  `;
}

function savedOpponentCardMarkup(entry, language) {
  return `
    <article class="entry-card compact saved-team-card">
      <div class="entry-main">
        <div class="entry-title"><strong>${escapeHtml(entry.name)}</strong><span class="source-tag">${entry.speciesIds.length} / 6</span></div>
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

function leadCardMarkup(entry, language) {
  const targetsMarkup = entry.targets.length
    ? `<div class="analysis-member-pills">${memberPillsMarkup(entry.targets)}</div>`
    : `<span class="muted">${t(language, "common.none")}</span>`;
  const backlineMarkup = entry.backline.length
    ? `<div class="analysis-member-pills">${memberPillsMarkup(entry.backline)}</div>`
    : `<span class="muted">${t(language, "common.none")}</span>`;
  return `
    <article class="analysis-core-card good">
      <div class="analysis-list-head">
        <div class="analysis-core-members">${memberPillsMarkup(entry.members)}</div>
        <div class="analysis-inline-pills">
          <span class="source-tag score-tag">${t(language, "matchup.leadScore", {value: entry.score.toFixed(1)})}</span>
          <span class="source-tag score-tag">${t(language, "matchup.lineupScore", {value: entry.lineupScore.toFixed(1)})}</span>
        </div>
      </div>
      <div>
        <div class="analysis-label">${t(language, "matchup.targets")}</div>
        ${targetsMarkup}
      </div>
      <div>
        <div class="analysis-label">${t(language, "matchup.backline")}</div>
        ${backlineMarkup}
      </div>
      ${entry.roles.length ? `<div class="analysis-inline-pills">${rolePillsMarkup(entry.roles, language)}</div>` : ""}
    </article>
  `;
}

function threatCardMarkup(title, entries, language) {
  return `
    <article class="analysis-list-card">
      <div class="analysis-list-head">
        <strong>${escapeHtml(title)}</strong>
        <span class="source-tag">${entries.length}</span>
      </div>
      <div class="entry-line entry-tags">
        ${entries.length ? entries.map((entry) => threatPillMarkup(entry, language)).join("") : `<span class="muted">${t(language, "common.none")}</span>`}
      </div>
    </article>
  `;
}

function speedLineCardMarkup(tier, language) {
  return `
    <article class="entry-card compact">
      <div class="entry-main">
        <div class="entry-title"><strong>Spe ${tier.speed}</strong><span class="source-tag">${t(language, "common.countLine", {count: tier.totalCount})}</span></div>
        <div class="entry-line entry-tags">
          ${tier.entries.map((entry) => `
            <span class="speed-entry">
              ${spriteMarkup(entry)}
              <span>${escapeHtml(entry.displayLabel || entry.displayName || entry.speciesName)}</span>
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
  document.getElementById("opponent-team-list").innerHTML = state.opponentTeam.length
    ? state.opponentTeam.map((entry) => opponentCardMarkup(entry, language)).join("")
    : `<div class="team-card empty-slot">${t(language, "matchup.opponentPlaceholder")}</div>`;
  document.getElementById("saved-opponent-list").innerHTML = state.savedOpponentTeams.length
    ? state.savedOpponentTeams.map((entry) => savedOpponentCardMarkup(entry, language)).join("")
    : `<p class="empty-state">${t(language, "matchup.savedEmpty")}</p>`;
  document.getElementById("matchup-library-summary").textContent = t(language, "matchup.librarySummary", {
    species: state.matchupLibrary.length,
    sets: state.library.length,
    filtered: filtered.length,
  });
  document.getElementById("matchup-library-list").innerHTML = filtered.length
    ? `<div class="species-browser-grid">${filtered.map((entry) => quickPickSpriteMarkup(entry, state)).join("")}</div>`
    : `<p class="empty-state">${t(language, "library.empty")}</p>`;
}

function renderAnalysis(state) {
  const language = state.language;
  const analysis = state.matchup;
  const container = document.getElementById("matchup-analysis");
  if (!state.team.length) {
    container.innerHTML = `<p class="empty-state">${t(language, "matchup.needAlly")}</p>`;
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
    container.innerHTML = `${recommendationSection}<p class="empty-state">${t(language, "matchup.needOpponent")}</p>`;
    return;
  }
  if (!analysis) {
    container.innerHTML = `${recommendationSection}<p class="empty-state">${t(language, "analysis.empty")}</p>`;
    return;
  }
  container.innerHTML = `
    <div class="analysis-overview matchup-overview">
      <article class="metric-card"><span>${t(language, "matchup.overviewAlly")}</span><strong>${analysis.overview.allyCount}</strong></article>
      <article class="metric-card"><span>${t(language, "matchup.overviewOpponent")}</span><strong>${analysis.overview.opponentCount}</strong></article>
      <article class="metric-card"><span>${t(language, "matchup.overviewSpeed")}</span><strong>${analysis.overview.speedLineCount}</strong></article>
    </div>
    ${recommendationSection}
    <section class="subpanel">
      <h3>${t(language, "matchup.recommendedLeadTitle")}</h3>
      ${analysis.leadPairs.length
        ? `<div class="analysis-core-grid">${analysis.leadPairs.map((entry) => leadCardMarkup(entry, language)).join("")}</div>`
        : `<p class="empty-state">${t(language, "matchup.noLeadOption")}</p>`}
    </section>
    <section class="subpanel">
      <h3>${t(language, "matchup.speedLinesTitle")}</h3>
      <div class="stack-list compact-list">${analysis.speedLines.map((tier) => speedLineCardMarkup(tier, language)).join("")}</div>
    </section>
    <div class="analysis-detail-grid">
      <section class="subpanel">
        <h3>${t(language, "matchup.fearsTitle")}</h3>
        <div class="analysis-list-stack">${analysis.allyThreats.map((entry) => threatCardMarkup(entry.member.label, entry.threats, language)).join("")}</div>
      </section>
      <section class="subpanel">
        <h3>${t(language, "matchup.answersTitle")}</h3>
        <div class="analysis-list-stack">${analysis.opponentAnswers.map((entry) => threatCardMarkup(entry.member.label, entry.answers, language)).join("")}</div>
      </section>
    </div>
  `;
}

export function renderMatchupView(state) {
  renderBuilder(state);
  renderAnalysis(state);
}
