import {t} from "./i18n.js";
import {renderAnalysisView} from "./render-analysis.js";
import {formatChampionPoints, formatSpread, formatStatLine, getItemSpritePosition, getMoveCategoryLabel, getNatureSummary, getTypeLabel} from "./utils.js";

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

function buildMoveTooltipMarkup(move, language) {
  const typeLabel = move.type ? getTypeLabel(move.type, language) : t(language, "common.unknown");
  const categoryLabel = getMoveCategoryLabel(move.category, language);
  const typeClass = move.type ? getTypeClassName(move.type) : "";
  return `
    <div class="tooltip-stack">
      <div class="tooltip-meta-row">
        <span class="tooltip-chip type-chip ${typeClass}">${escapeHtml(t(language, "tooltip.type"))}: ${escapeHtml(typeLabel)}</span>
        <span class="tooltip-chip">${escapeHtml(t(language, "tooltip.category"))}: ${escapeHtml(categoryLabel)}</span>
      </div>
      <div class="tooltip-desc-box">${escapeHtml(move.shortDesc || t(language, "tooltip.noMoveDesc"))}</div>
    </div>
  `;
}

function movesMarkup(config, language) {
  return (config.moves || []).map((move) => renderInfoPill({
    label: move.name,
    tooltipMarkup: buildMoveTooltipMarkup(move, language),
  })).join("");
}

function renderInfoPill({label, leadingMarkup = "", tooltipMarkup}) {
  const safeLabel = escapeHtml(label || "未知");
  return `
    <span class="info-pill" tabindex="0">
      ${leadingMarkup}
      <span class="info-pill-label">${safeLabel}</span>
      <span class="info-tooltip-content">${tooltipMarkup || ""}</span>
    </span>
  `;
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

export function renderLibrary(state) {
  const language = state.language;
  const activeLibrary = state.filteredLibrary;
  document.getElementById("library-summary").textContent = t(language, "library.summary", {
    total: state.library.length,
    filtered: activeLibrary.length,
  });
  document.getElementById("library-list").innerHTML = activeLibrary.length
    ? activeLibrary.map((config) => `
        <article class="entry-card">
          <div class="entry-main">
            <div class="entry-title">${spriteMarkup(config)}<strong>${config.displayName}</strong>${notePillMarkup(config, language)}<span class="source-tag">${t(language, "common.configLibrary")}</span></div>
            <div class="entry-meta">${typePills(config.types, language)}</div>
            <div class="entry-line entry-tags">${buildMetaMarkup(config, language)}</div>
            <p class="entry-line">${formatChampionPoints(config.championPoints, language)}</p>
            <p class="muted">${config.originalSpreadLabel ? `${t(language, "common.evsOriginal")}: ${formatSpread(config.nature, config.evs)}` : t(language, "common.pointsDirect")}</p>
            <div class="entry-line entry-tags">${movesMarkup(config, language)}</div>
            <p class="muted">${formatStatLine(config.stats)}</p>
          </div>
          <div class="card-actions">
            <button type="button" class="add-button" data-add-config="${config.id}">${t(language, "library.add")}</button>
            <button type="button" class="ghost-button mini-action" data-edit-config="${config.id}">${t(language, "library.edit")}</button>
            <button type="button" class="ghost-button mini-action" data-note-config="${config.id}">${t(language, "library.note")}</button>
            <button type="button" class="ghost-button danger-button mini-action" data-delete-config="${config.id}">${t(language, "library.delete")}</button>
          </div>
        </article>
      `).join("")
    : `<p class="empty-state">${t(language, "library.empty")}</p>`;
}

export function renderTeam(state) {
  const language = state.language;
  const emptySlots = Math.max(0, 6 - state.team.length);
  const teamMarkup = state.team.map((config) => `
    <article class="team-card">
      <div class="entry-main">
        <div class="entry-title">${spriteMarkup(config)}<strong>${config.displayName}</strong>${notePillMarkup(config, language)}</div>
        <div class="entry-meta">${typePills(config.types, language)}</div>
        <div class="entry-line entry-tags">${buildMetaMarkup(config, language)}</div>
        <p class="entry-line">${formatChampionPoints(config.championPoints, language)}</p>
        <p class="muted">${config.originalSpreadLabel ? `${t(language, "common.evsOriginal")}: ${formatSpread(config.nature, config.evs)}` : t(language, "common.pointsDirect")}</p>
        <div class="entry-line entry-tags">${movesMarkup(config, language)}</div>
        <p class="muted">${t(language, "common.speed")} ${config.stats?.spe || 0}${config.teraType ? ` · ${t(language, "common.tera")} ${getTypeLabel(config.teraType, language)}` : ""}</p>
      </div>
      <button type="button" class="ghost-button danger-button sidebar-action" data-remove-config="${config.id}">${t(language, "team.remove")}</button>
    </article>
  `).join("");
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
            <div class="entry-title"><strong>${team.name}</strong><span class="source-tag">${team.configIds.length} / 6</span></div>
            <p class="muted">${team.labels.join(" / ") || t(language, "common.emptyTeam")}</p>
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

export function renderRecommendations(state) {
  const language = state.language;
  document.getElementById("recommend-list").innerHTML = state.recommendations.length
    ? state.recommendations.map((config) => `
        <article class="entry-card compact">
          <div class="entry-main">
            <div class="entry-title">${spriteMarkup(config)}<strong>${config.displayName}</strong>${notePillMarkup(config, language)}<span class="source-tag score-tag">${t(language, "recommend.score", {value: config.recommendationScore.toFixed(1)})}</span></div>
            <div class="score-row">
              <span>${t(language, "recommend.resistance", {value: config.breakdown.resistance.toFixed(1)})}</span>
              <span>${t(language, "recommend.coverage", {value: config.breakdown.coverage.toFixed(1)})}</span>
              <span>${t(language, "recommend.speed", {value: config.breakdown.speed.toFixed(1)})}</span>
              <span>${t(language, "recommend.synergy", {value: config.breakdown.synergy.toFixed(1)})}</span>
              <span>${t(language, "recommend.quality", {value: config.breakdown.quality.toFixed(1)})}</span>
            </div>
            <p class="entry-line">${config.reasons.join(" / ")}</p>
            <p class="muted">${t(language, "recommend.help", {value: config.weaknessHelp.join(" / ")})}</p>
          </div>
          <button type="button" class="add-button" data-add-config="${config.id}">${t(language, "library.add")}</button>
        </article>
      `).join("")
    : `<p class="empty-state">${t(language, "recommend.empty")}</p>`;
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
              ${spriteMarkup(entry)}
              <span>${entry.speciesName || entry.displayName}</span>
            </span>
            ${entry.note ? `<span class="mini-pill speed-note-pill">${entry.note}</span>` : ""}
            ${entry.speedTierMode === "plus1" && entry.plusOneSpeed ? `
              <span class="mini-pill speed-boost-pill">${t(language, "speed.plusOne", {speed: entry.plusOneSpeed.speed})}</span>
              ${entry.plusOneSpeed.sources.map((source) => `<span class="mini-pill speed-boost-source">${source}</span>`).join("")}
            ` : ""}
            ${entry.speedTierMode === "scarf" && entry.choiceScarfSpeed ? `
              <span class="mini-pill speed-boost-pill">Scarf ${entry.choiceScarfSpeed.speed}</span>
              ${entry.choiceScarfSpeed.sources.map((source) => `<span class="mini-pill speed-boost-source">${source}</span>`).join("")}
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
