import {t} from "./i18n.js";
import {renderAnalysisView} from "./render-analysis.js";
import {renderDamageView} from "./render-damage.js";
import {renderMatchupView} from "./render-matchup.js";
import {renderRecommendationsView} from "./render-recommendations.js";
import {spriteMarkup} from "./sprites.js";
import {formatChampionPoints, formatSpread, formatStatLine, getItemSpritePosition, getMoveCategoryLabel, getNatureSummary, getTypeLabel, normalizeName} from "./utils.js";

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getLocalizedSpeciesName(state, species) {
  return state.localizedSpeciesNames?.get(species.speciesId) || species.localizedSpeciesName || species.speciesName;
}

function itemSpriteMarkup(itemInfo) {
  const spriteNum = Number(itemInfo?.spritenum);
  if (!Number.isFinite(spriteNum) || spriteNum < 0) {
    return "";
  }
  const {x, y} = getItemSpritePosition(spriteNum);
  return `<span class="item-sprite" style="background-position: ${-x}px ${-y}px"></span>`;
}

function getTypeClassName(type) {
  return `type-${String(type || "").toLowerCase()}`;
}

function typePills(types = [], language) {
  return types.map((type) => `<span class="pill type-pill ${getTypeClassName(type)}">${getTypeLabel(type, language)}</span>`).join("");
}

function buildTextTooltipMarkup(detail, language) {
  return `
    <div class="tooltip-stack">
      <div class="tooltip-desc-box">${escapeHtml(detail || t(language, "tooltip.noDetail"))}</div>
    </div>
  `;
}

function resolveMoveShortDesc(move, moveLookup) {
  if (move?.shortDesc) return move.shortDesc;
  if (move?.desc) return move.desc;
  const entry = moveLookup?.get(normalizeName(move?.name || ""));
  return entry?.shortDesc || entry?.desc || "";
}

function buildMoveTooltipMarkup(move, language, moveLookup) {
  const typeLabel = move.type ? getTypeLabel(move.type, language) : t(language, "common.unknown");
  const categoryLabel = getMoveCategoryLabel(move.category, language);
  const typeClass = move.type ? getTypeClassName(move.type) : "";
  const description = resolveMoveShortDesc(move, moveLookup);
  return `
    <div class="tooltip-stack">
      <div class="tooltip-meta-row">
        <span class="tooltip-chip type-chip ${typeClass}">${escapeHtml(t(language, "tooltip.type"))}: ${escapeHtml(typeLabel)}</span>
        <span class="tooltip-chip">${escapeHtml(t(language, "tooltip.category"))}: ${escapeHtml(categoryLabel)}</span>
      </div>
      <div class="tooltip-desc-box">${escapeHtml(description || t(language, "tooltip.noMoveDesc"))}</div>
    </div>
  `;
}

function movesMarkup(config, language, moveLookup) {
  return (config.moves || []).map((move) => renderInfoPill({
    label: move.name,
    tooltipMarkup: buildMoveTooltipMarkup(move, language, moveLookup),
  })).join("");
}

function renderInfoPill({label, leadingMarkup = "", tooltipMarkup, className = ""}) {
  const safeLabel = escapeHtml(label || "未知");
  return `
    <span class="info-pill ${className}" tabindex="0">
      ${leadingMarkup}
      <span class="info-pill-label">${safeLabel}</span>
      <span class="info-tooltip-content">${tooltipMarkup || ""}</span>
    </span>
  `;
}

function getLookupEntry(lookup, name) {
  return lookup?.get(normalizeName(name)) || null;
}

function buildMetaMarkup(config, language) {
  const pills = [];
  if (config.item) {
    pills.push(renderInfoPill({
      label: config.item,
      leadingMarkup: itemSpriteMarkup(config.itemInfo),
      tooltipMarkup: buildTextTooltipMarkup(config.itemInfo?.shortDesc || config.itemInfo?.desc || t(language, "tooltip.noItemDesc"), language),
    }));
  }
  if (config.ability) {
    pills.push(renderInfoPill({
      label: config.ability,
      tooltipMarkup: buildTextTooltipMarkup(config.abilityInfo?.shortDesc || config.abilityInfo?.desc || t(language, "tooltip.noAbilityDesc"), language),
    }));
  }
  if (config.nature) {
    pills.push(renderInfoPill({
      label: config.nature,
      tooltipMarkup: buildTextTooltipMarkup(getNatureSummary(config.nature, language), language),
    }));
  }
  return pills.join("");
}

function notePillMarkup(config, language) {
  if (!config.note) {
    return "";
  }
  return renderInfoPill({
    label: config.note,
    tooltipMarkup: buildTextTooltipMarkup(t(language, "tooltip.note"), language),
  });
}

function getLinkedConfig(config, library = []) {
  return library.find((entry) => entry.id === config.linkedConfigId) || null;
}

function teamSourceTagMarkup(config, linkedConfig, language) {
  if (config.teamSource === "library") {
    return `<span class="source-tag">${t(language, "team.source.library")}</span>`;
  }
  if (config.teamSource === "linked") {
    return `<span class="source-tag">${t(language, "team.source.linked")}</span>`;
  }
  if (linkedConfig) {
    return `<span class="source-tag">${t(language, "team.source.linked")}</span>`;
  }
  return `<span class="source-tag">${t(language, "team.source.teamOnly")}</span>`;
}

function teamSourceCopyMarkup(config, linkedConfig, language) {
  if (!linkedConfig) {
    return config.teamSource === "team-only"
      ? `<p class="muted team-origin-copy">${t(language, "team.source.teamOnlyCopy")}</p>`
      : "";
  }
  if (config.teamSource === "library") {
    return "";
  }
  return `<p class="muted team-origin-copy">${t(language, "team.source.linkedCopy", {name: linkedConfig.displayLabel || linkedConfig.displayName})}</p>`;
}

function speedSummaryMarkup(config, language) {
  const parts = [`${t(language, "common.speed")} ${config.stats?.spe || 0}`];
  if (config.teraType) {
    parts.push(`${t(language, "common.tera")} ${getTypeLabel(config.teraType, language)}`);
  }
  return parts.join(" · ");
}

function teamHeaderMarkup(config, linkedConfig, language, state) {
  const noteMarkup = notePillMarkup(config, language);
  const sourceMarkup = teamSourceTagMarkup(config, linkedConfig, language);
  const badges = [noteMarkup, sourceMarkup].filter(Boolean).join("");
  return `
    <div class="team-card-header">
      <div class="entry-title team-title-row">${spriteMarkup(config, state)}<strong>${config.displayName}</strong></div>
      ${badges ? `<div class="entry-tags team-badge-row">${badges}</div>` : ""}
    </div>
  `;
}

function renderSpeedSourcePill(state, source, language) {
  const datasets = state.datasets || {};
  const move = getLookupEntry(datasets.moveLookup, source);
  if (move) {
    return renderInfoPill({
      label: move.name,
      tooltipMarkup: buildMoveTooltipMarkup(move, language),
      className: "mini-pill speed-boost-source",
    });
  }

  const itemInfo = getLookupEntry(datasets.itemLookup, source);
  if (itemInfo) {
    return renderInfoPill({
      label: itemInfo.name || source,
      leadingMarkup: itemSpriteMarkup(itemInfo),
      tooltipMarkup: buildTextTooltipMarkup(itemInfo.shortDesc || itemInfo.desc || t(language, "tooltip.noItemDesc"), language),
      className: "mini-pill speed-boost-source",
    });
  }

  const abilityInfo = getLookupEntry(datasets.abilityLookup, source);
  if (abilityInfo) {
    return renderInfoPill({
      label: abilityInfo.name || source,
      tooltipMarkup: buildTextTooltipMarkup(abilityInfo.shortDesc || abilityInfo.desc || t(language, "tooltip.noAbilityDesc"), language),
      className: "mini-pill speed-boost-source",
    });
  }

  return `<span class="mini-pill speed-boost-source">${escapeHtml(source)}</span>`;
}

function renderSpeedSourcePills(state, sources = [], language) {
  return sources.map((source) => renderSpeedSourcePill(state, source, language)).join("");
}

function speciesBrowserMarkup(state) {
  const language = state.language;
  return `
    <section class="library-subsection species-browser-section">
      <div class="section-head section-head-tight">
        <div>
          <h3>${t(language, "library.browserTitle")}</h3>
          <p class="muted">${t(language, "library.browserSummary", {count: state.speciesBrowser.length})}</p>
        </div>
      </div>
      <div class="species-browser-grid">
        ${state.speciesBrowser.map((species) => `
          <button
            type="button"
            class="species-browser-button ${species.speciesId === state.selectedSpeciesId ? "active" : ""}"
            data-pick-species="${species.speciesId}"
            title="${escapeHtml(getLocalizedSpeciesName(state, species))}"
          >
            ${spriteMarkup(species, state)}
            ${species.configCount ? `<span class="species-browser-count">${species.configCount}</span>` : ""}
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function selectedSpeciesHeader(state) {
  if (!state.selectedSpecies) {
    return `<p class="empty-state">${t(state.language, "library.selectSpecies")}</p>`;
  }
  const actionMarkup = `<button type="button" class="add-button" data-create-species-config="${state.selectedSpecies.speciesId}">${t(state.language, "library.createConfig")}</button>`;
  return `
    <div class="section-head section-head-tight">
      <div>
        <h3>${getLocalizedSpeciesName(state, state.selectedSpecies)}</h3>
        <p class="muted">${
          state.selectedSpeciesHasConfigs
            ? t(state.language, "library.selectedSummary", {count: state.filteredLibrary.length})
            : t(state.language, "library.selectedEmpty")
        }</p>
      </div>
      ${actionMarkup}
    </div>
  `;
}

function libraryEmptyMarkup(state, language) {
  if (!state.selectedSpecies) {
    return "";
  }
  if (!state.selectedSpeciesHasConfigs) {
    return `
      <article class="entry-card compact empty-library-card">
        <div class="entry-main">
          <p class="empty-state">${t(language, "library.selectedEmpty")}</p>
        </div>
        <div class="card-actions">
          <button type="button" class="add-button" data-create-species-config="${state.selectedSpecies.speciesId}">${t(language, "library.createConfig")}</button>
        </div>
      </article>
    `;
  }
  return `<p class="empty-state">${t(language, "library.filteredEmpty")}</p>`;
}

export function renderLibrary(state) {
  const language = state.language;
  const activeLibrary = state.filteredLibrary;
  document.getElementById("library-summary").textContent = t(language, "library.summary", {
    total: state.library.length,
    filtered: activeLibrary.length,
  });
  const libraryMarkup = activeLibrary.length
    ? `<div class="library-config-grid">${activeLibrary.map((config) => `
        <article class="entry-card library-config-card">
          <div class="entry-main">
            <div class="entry-title">${spriteMarkup(config, state)}<strong>${config.displayName}</strong>${notePillMarkup(config, language)}<span class="source-tag">${t(language, "common.configLibrary")}</span></div>
            <div class="entry-meta">${typePills(config.types, language)}</div>
            <div class="entry-line entry-tags">${buildMetaMarkup(config, language)}</div>
            <p class="entry-line team-points-line">${formatChampionPoints(config.championPoints, language)}</p>
            <div class="entry-line entry-tags team-move-row">${movesMarkup(config, language, state.datasets?.moveLookup)}</div>
            <p class="muted team-ev-line">${config.originalSpreadLabel ? `${t(language, "common.evsOriginal")}: ${formatSpread(config.nature, config.evs)}` : t(language, "common.pointsDirect")}</p>
            <p class="muted team-speed-line">${formatStatLine(config.stats)}</p>
          </div>
          <div class="card-actions library-card-actions">
            <button type="button" class="add-button" data-add-config="${config.id}">${t(language, "library.add")}</button>
            <button type="button" class="ghost-button mini-action" data-edit-config="${config.id}">${t(language, "library.edit")}</button>
            <button type="button" class="ghost-button mini-action" data-note-config="${config.id}">${t(language, "library.note")}</button>
            <button type="button" class="ghost-button danger-button mini-action" data-delete-config="${config.id}">${t(language, "library.delete")}</button>
          </div>
        </article>
      `).join("")}</div>`
    : libraryEmptyMarkup(state, language);
  document.getElementById("library-list").innerHTML = `
    ${speciesBrowserMarkup(state)}
    <section class="library-subsection">
      ${selectedSpeciesHeader(state)}
      ${libraryMarkup}
    </section>
  `;
}

export function renderTeam(state) {
  const language = state.language;
  const badge = document.getElementById("team-count-badge");
  if (badge) {
    badge.textContent = `${state.team.length} / 6`;
  }
  const emptySlots = Math.max(0, 6 - state.team.length);
  const teamMarkup = state.team.map((config) => {
    const linkedConfig = getLinkedConfig(config, state.library);
    return `
    <article class="team-card">
      <div class="entry-main">
        ${teamHeaderMarkup(config, linkedConfig, language, state)}
        <div class="entry-meta">${typePills(config.types, language)}</div>
        <div class="entry-line entry-tags">${buildMetaMarkup(config, language)}</div>
        <p class="entry-line team-points-line">${formatChampionPoints(config.championPoints, language)}</p>
        <div class="entry-line entry-tags team-move-row">${movesMarkup(config, language, state.datasets?.moveLookup)}</div>
        <p class="muted team-ev-line">${config.originalSpreadLabel ? `${t(language, "common.evsOriginal")}: ${formatSpread(config.nature, config.evs)}` : t(language, "common.pointsDirect")}</p>
        <p class="muted team-speed-line">${speedSummaryMarkup(config, language)}</p>
      </div>
      <div class="team-card-actions">
        <button type="button" class="ghost-button mini-action" data-edit-team="${config.id}">${t(language, "team.tune")}</button>
        <button type="button" class="ghost-button mini-action" data-open-damage-attacker="${config.id}">${t(language, "team.damage")}</button>
        <button type="button" class="ghost-button danger-button mini-action" data-remove-config="${config.id}">${t(language, "team.remove")}</button>
      </div>
    </article>
  `;
  }).join("");
  const placeholders = Array.from({length: emptySlots}, () => `<div class="team-card empty-slot">${t(language, "team.placeholder")}</div>`).join("");
  document.getElementById("team-list").innerHTML = teamMarkup + placeholders;
}

export function renderSavedTeams(state) {
  const language = state.language;
  const list = document.getElementById("saved-team-list");
  list.innerHTML = state.savedTeams.length
    ? state.savedTeams.map((team) => `
        <article class="entry-card compact saved-team-card">
          <div class="entry-main">
            <div class="entry-title"><strong>${team.name}</strong><span class="source-tag">${(team.configs || team.configIds || []).length} / 6</span></div>
            <p class="muted">${(team.labels || []).join(" / ") || t(language, "common.emptyTeam")}</p>
          </div>
          <div class="card-actions">
            <button type="button" class="add-button" data-load-team="${team.id}">${t(language, "saved.load")}</button>
            <button type="button" class="ghost-button danger-button mini-action" data-delete-team="${team.id}">${t(language, "saved.delete")}</button>
          </div>
        </article>
      `).join("")
    : `<p class="empty-state">${t(language, "saved.empty")}</p>`;
}

export function renderAnalysis(state) {
  renderAnalysisView(state);
}

export function renderMatchup(state) {
  renderMatchupView(state);
}

export function renderRecommendations(state) {
  document.getElementById("recommend-list").innerHTML = renderRecommendationsView(state);
}

export function renderDamage(state) {
  renderDamageView(state);
}

export function renderSpeedTiers(state) {
  const language = state.language;
  document.getElementById("speed-summary").textContent = t(language, "speed.summary", {
    count: state.speedLineTiers.length,
  });
  document.getElementById("speed-tiers").innerHTML = state.speedLineTiers.map((tier) => `
    <article class="entry-card compact">
      <div class="entry-main">
        <div class="entry-title"><strong>Spe ${tier.speed}</strong><span class="source-tag">${t(language, "common.countLine", {count: tier.totalCount})}</span></div>
        <div class="entry-line entry-tags">
          ${tier.entries.map((entry) => `
            <span class="speed-entry">
              ${spriteMarkup(entry, state)}
              <span>${entry.speciesName || entry.displayName}</span>
            </span>
            ${entry.note ? `<span class="mini-pill speed-note-pill">${entry.note}</span>` : ""}
            ${entry.speedTierMode === "plus1" && entry.plusOneSpeed ? `
              <span class="mini-pill speed-boost-pill">${t(language, "speed.plusOne", {speed: entry.plusOneSpeed.speed})}</span>
              ${renderSpeedSourcePills(state, entry.plusOneSpeed.sources, language)}
            ` : ""}
            ${entry.speedTierMode === "scarf" && entry.choiceScarfSpeed ? `
              <span class="mini-pill speed-boost-pill">Scarf ${entry.choiceScarfSpeed.speed}</span>
              ${renderSpeedSourcePills(state, entry.choiceScarfSpeed.sources, language)}
            ` : ""}
          `).join("")}
        </div>
      </div>
    </article>
  `).join("");
}

export function renderStatus(message) {
  document.getElementById("status-text").textContent = message;
}

export function renderImportFeedback(message) {
  document.getElementById("import-feedback").textContent = message;
}

export function renderTeamImportFeedback(message) {
  document.getElementById("team-import-feedback").textContent = message;
}
