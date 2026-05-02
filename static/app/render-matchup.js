import {t} from "./i18n.js";
import {filterOpponentLibrary, getOpponentVariantCount} from "./matchup-selection.js";
import {setInnerHTMLIfChanged} from "./render-cache.js";
import {renderMatchupBoard} from "./render-matchup-board.js";
import {renderRecommendationListOnly} from "./render-recommendations.js";
import {renderHighlightedText} from "./search-utils.js";
import {spriteMarkup} from "./sprites.js";
import {getDisplayNote, getTypeLabel} from "./utils.js";

const CONFIG_PREVIEW_LIMIT = 3;
const MATCHUP_ROLE_FILTERS = [
  "attacker",
  "speedcontrol",
  "support",
  "tank",
  "tailwind",
  "trickroom",
  "fakeout",
  "redirection",
  "guard",
  "pivot",
  "disruption",
  "priority",
  "intimidate",
  "weather",
  "terrain",
  "techcheck",
];
const MATCHUP_SPEED_FILTERS = ["slow", "mid", "fast", "elite"];

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

function getLocalizedMoveName(state, moveName = "") {
  if (state.language !== "zh") {
    return moveName;
  }
  return state.localizedMoveNames?.get(String(moveName || "").toLowerCase().replace(/[^a-z0-9]+/g, "")) || moveName;
}

function getPlanTargetLabel(action, state, language) {
  if (action.targetLabelKey) {
    return t(language, action.targetLabelKey);
  }
  if (action.targetSpeciesId) {
    return getLocalizedSpeciesName(state, {
      speciesId: action.targetSpeciesId,
      speciesName: action.targetName,
    });
  }
  return action.targetName || t(language, "common.none");
}

function leadPlanMarkup(entry, language, state) {
  if (!entry.turnOnePlan?.length) {
    return "";
  }
  return `
    <div class="matchup-lead-plan">
      <div class="analysis-label">${t(language, "matchup.turnOnePlanTitle")}</div>
      <div class="matchup-lead-plan-list">
        ${entry.turnOnePlan.map((action) => `
          <div class="matchup-lead-plan-row">
            <strong>${escapeHtml(getLocalizedSpeciesName(state, entry.members.find((member) => member.id === action.actorId) || {}))}</strong>
            <span>${escapeHtml(getLocalizedMoveName(state, action.moveName))}</span>
            <span class="muted">→ ${escapeHtml(getPlanTargetLabel(action, state, language))}</span>
            <span class="mini-pill">${t(language, action.reasonKey)}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function quickPickSpriteMarkup(entry, state) {
  const language = state.language;
  const selected = state.opponentTeam.some((member) => member.speciesId === entry.speciesId);
  const searchMatch = entry.searchMatch || null;
  const speciesLabel = getLocalizedSpeciesName(state, entry);
  const speciesMarkup = searchMatch?.kind === "species"
    ? renderHighlightedText(speciesLabel, searchMatch.ranges)
    : escapeHtml(speciesLabel);
  const detailMarkup = searchMatch && searchMatch.kind !== "species"
    ? `<span class="species-browser-match-detail">${renderHighlightedText(searchMatch.label, searchMatch.ranges)}</span>`
    : "";
  const titleParts = [
    speciesLabel,
    buildSpeedSummary(entry, language),
  ];
  if (entry.labels?.length) {
    titleParts.push(buildConfigSummary(entry.labels));
  }
  return `
    <button
      type="button"
      class="species-browser-button ${selected ? "active" : ""} ${searchMatch ? "searching" : ""}"
      data-add-opponent-species="${entry.speciesId}"
      title="${escapeHtml(titleParts.filter(Boolean).join(" · "))}"
      aria-pressed="${selected ? "true" : "false"}"
      aria-label="${escapeHtml(speciesLabel)}"
    >
      ${spriteMarkup(entry, state)}
      ${searchMatch ? `<span class="species-browser-match-copy"><span class="species-browser-match-label">${speciesMarkup}</span>${detailMarkup}</span>` : ""}
    </button>
  `;
}

function configOptionMarkup(entry, config, language, isSelected) {
  const speciesLabel = language === "zh"
    ? config?.localizedSpeciesName || config?.speciesName || entry?.localizedSpeciesName || entry?.speciesName || ""
    : config?.speciesName || entry?.speciesName || "";
  const displayNote = getDisplayNote(config?.note);
  const label = displayNote ? `${speciesLabel}（${displayNote}）` : (speciesLabel || config?.displayLabel || config?.displayName || t(language, "common.unknown"));
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
      ${leadPlanMarkup(entry, language, state)}
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

function renderFilterButton({label, dataKey, value, active}) {
  return `
    <button
      type="button"
      class="ghost-button mini-action matchup-filter-chip ${active ? "active" : ""}"
      data-${dataKey}="${escapeHtml(value)}"
      aria-pressed="${active ? "true" : "false"}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function matchupFiltersMarkup(state) {
  const language = state.language;
  const filters = state.matchupFilters || {types: [], speedBucket: "", roles: []};
  const summary = [];
  if (filters.types.length) summary.push(t(language, "matchup.filterTypeCount", {count: filters.types.length}));
  if (filters.speedBucket) summary.push(t(language, `matchup.speedBucket.${filters.speedBucket}`));
  if (filters.roles.length) summary.push(t(language, "matchup.filterRoleCount", {count: filters.roles.length}));
  const typeButtons = [
    renderFilterButton({
      label: t(language, "matchup.filterAllTypes"),
      dataKey: "matchup-clear-filter-group",
      value: "types",
      active: !filters.types.length,
    }),
    ...["Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy"]
      .map((type) => renderFilterButton({
        label: getTypeLabel(type, language),
        dataKey: "matchup-type-filter",
        value: type,
        active: filters.types.includes(type),
      })),
  ].join("");
  const speedButtons = [
    renderFilterButton({
      label: t(language, "matchup.filterAllSpeed"),
      dataKey: "matchup-speed-filter",
      value: "",
      active: !filters.speedBucket,
    }),
    ...MATCHUP_SPEED_FILTERS.map((bucket) => renderFilterButton({
      label: t(language, `matchup.speedBucket.${bucket}`),
      dataKey: "matchup-speed-filter",
      value: bucket,
      active: filters.speedBucket === bucket,
    })),
  ].join("");
  const roleButtons = [
    renderFilterButton({
      label: t(language, "matchup.filterAllRoles"),
      dataKey: "matchup-clear-filter-group",
      value: "roles",
      active: !filters.roles.length,
    }),
    ...MATCHUP_ROLE_FILTERS.map((roleId) => renderFilterButton({
      label: t(language, `analysis.role.${roleId}`),
      dataKey: "matchup-role-filter",
      value: roleId,
      active: filters.roles.includes(roleId),
    })),
  ].join("");
  return `
    <div class="matchup-filter-panel">
      <div class="matchup-filter-summary-row">
        <span class="analysis-label">${t(language, "matchup.filterTitle")}</span>
        <div class="analysis-inline-pills">
          <span class="mini-pill">${t(language, "matchup.filterSummary", {summary: summary.join(" / ") || t(language, "common.none")})}</span>
          <button type="button" class="ghost-button mini-action" data-clear-matchup-filters="true">${t(language, "matchup.filterClearAll")}</button>
        </div>
      </div>
      <div class="matchup-filter-group">
        <div class="analysis-label">${t(language, "matchup.filterTypeLabel")}</div>
        <div class="analysis-inline-pills matchup-filter-row matchup-filter-row-types">${typeButtons}</div>
      </div>
      <div class="matchup-filter-group">
        <div class="analysis-label">${t(language, "matchup.filterSpeedLabel")}</div>
        <div class="analysis-inline-pills matchup-filter-row matchup-filter-row-speed">${speedButtons}</div>
      </div>
      <div class="matchup-filter-group">
        <div class="analysis-label">${t(language, "matchup.filterRoleLabel")}</div>
        <div class="analysis-inline-pills matchup-filter-row matchup-filter-row-roles">${roleButtons}</div>
      </div>
    </div>
  `;
}

function renderBuilder(state) {
  const language = state.language;
  const filtered = filterOpponentLibrary(state.matchupLibrary, state.matchupSearch, state.matchupFilters);
  const searching = Boolean(String(state.matchupSearch || "").trim());
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
      ? `${matchupFiltersMarkup(state)}<div class="species-browser-grid ${searching ? "searching" : ""}">${filtered.map((entry) => quickPickSpriteMarkup(entry, state)).join("")}</div>`
      : `${matchupFiltersMarkup(state)}<p class="empty-state">${t(language, "matchup.filterEmpty")}</p>`,
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
