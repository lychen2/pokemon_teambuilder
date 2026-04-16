import {t} from "./i18n.js";
import {spriteMarkup} from "./sprites.js";
import {getTypeLabel} from "./utils.js";

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
  return types.map((type) => (
    `<span class="pill type-pill ${getTypeClassName(type)}">${getTypeLabel(type, language)}</span>`
  )).join("");
}

function getLocalizedEntryName(entry, state) {
  return entry.speciesId
    ? state.localizedSpeciesNames?.get(entry.speciesId) || entry.speciesName || entry.label
    : entry.label;
}

function getLocalizedCardName(card, state) {
  return card.speciesId
    ? state.localizedSpeciesNames?.get(card.speciesId) || card.speciesName || card.label
    : card.label;
}

function renderSummaryEntries(entries = [], language, includeResistance = false, state) {
  if (!entries.length) {
    return `<span class="muted">${t(language, "common.none")}</span>`;
  }
  return entries.map((entry) => {
    const parts = [t(language, "matchup.effectiveness", {value: entry.effectiveness.toFixed(1)})];
    if (includeResistance && entry.resistance != null) {
      parts.push(t(language, "matchup.resistance", {value: entry.resistance.toFixed(1)}));
    }
    parts.push(`Spe ${entry.speed}`);
    return `
      <span class="matchup-board-summary-item">
        <span class="mini-pill matchup-board-summary-name">${escapeHtml(getLocalizedEntryName(entry, state))}</span>
        <span class="mini-pill matchup-board-summary-pill">${escapeHtml(parts.join(" / "))}</span>
      </span>
    `;
  }).join("");
}

function renderMoveTargets(targets = [], state) {
  return targets.map((target) => `
    <span class="matchup-board-target" title="${escapeHtml(target.speciesName || target.label)}">
      ${spriteMarkup(target, state)}
    </span>
  `).join("");
}

function renderMoveRow(row, language) {
  const typeClass = row.type ? getTypeClassName(row.type) : "type-unknown";
  const typeLabel = row.type ? getTypeLabel(row.type, language) : "";
  return `
    <div class="matchup-board-move-row">
      <div class="matchup-board-move-name">
        ${row.type ? `<span class="matchup-board-move-type ${typeClass}">${escapeHtml(typeLabel)}</span>` : ""}
        <strong>${escapeHtml(row.name)}</strong>
      </div>
      <div class="matchup-board-move-hits">
        ${row.multipliers.map((target) => `<span class="matchup-board-hit">${escapeHtml(target.displayValue)}${target.displayValue === "--" ? "" : "x"}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderConfigOption(card, option, isSelected) {
  return `
    <button
      type="button"
      class="matchup-config-option ${isSelected ? "active" : ""}"
      data-select-opponent-config="${card.speciesId}"
      data-opponent-config-id="${escapeHtml(option.id || "")}"
      aria-pressed="${isSelected ? "true" : "false"}"
    >${escapeHtml(option.label)}</button>
  `;
}

function renderBoardConfigControl(card, state, language) {
  if ((card.totalVariantCount || 0) <= 1) {
    return "";
  }
  const pickerOpen = state.activeOpponentConfigSpeciesId === card.speciesId;
  const currentLabel = card.selectedConfigLabel || t(language, "matchup.allConfigs");
  const summaryLabel = card.selectedConfigId
    ? t(language, "matchup.currentConfigLocked", {name: currentLabel})
    : t(language, "matchup.currentConfigAll");
  const pickerMarkup = !pickerOpen
    ? ""
    : `
      <div class="matchup-config-picker" role="group" aria-label="${escapeHtml(t(language, "matchup.selectConfig"))}">
        <button
          type="button"
          class="matchup-config-option ${card.selectedConfigId ? "" : "active"}"
          data-select-opponent-config="${card.speciesId}"
          data-opponent-config-id=""
          aria-pressed="${card.selectedConfigId ? "false" : "true"}"
        >${t(language, "matchup.allConfigs")}</button>
        ${card.configOptions.map((option) => renderConfigOption(card, option, option.id === card.selectedConfigId)).join("")}
      </div>
    `;
  return `
    <div class="matchup-config-box matchup-board-config-box">
      <div class="matchup-config-head matchup-board-config-head">
        <button
          type="button"
          class="matchup-config-toggle source-tag ${pickerOpen ? "active" : ""}"
          data-toggle-opponent-config-picker="${card.speciesId}"
          aria-expanded="${pickerOpen ? "true" : "false"}"
        >${t(language, "matchup.variantCount", {count: card.totalVariantCount})}</button>
        <span class="muted matchup-config-summary">${escapeHtml(summaryLabel)}</span>
      </div>
      ${pickerMarkup}
    </div>
  `;
}

function renderSideRail(card, state, language) {
  const localizedName = getLocalizedCardName(card, state);
  return `
    <div class="matchup-board-side-rail" title="${escapeHtml(localizedName)}">
      <div class="matchup-board-side-sprite">${spriteMarkup(card, state)}</div>
      <strong class="matchup-board-side-name">${escapeHtml(localizedName)}</strong>
      <div class="matchup-board-side-types">${typePills(card.types, language)}</div>
    </div>
  `;
}

function renderBoardEntry(card, state, language, summaryKey, includeResistance = false, allowConfigPicker = false, side = "ally") {
  const metaLine = card.metaLine
    ? escapeHtml(card.metaLine)
    : card.totalVariantCount > 1
      ? escapeHtml(t(language, "matchup.variantCount", {count: card.totalVariantCount}))
      : "";
  const configControlMarkup = allowConfigPicker ? renderBoardConfigControl(card, state, language) : "";
  const headSideMarkup = configControlMarkup || (metaLine ? `<span class="source-tag">${metaLine}</span>` : `<span class="matchup-board-side-meta-spacer"></span>`);
  const bodyMarkup = `
    <div class="matchup-board-side-main">
      <div class="matchup-board-side-head">
        <div class="matchup-board-side-head-copy">${!configControlMarkup && metaLine ? `<span class="muted">${metaLine}</span>` : ""}</div>
        ${configControlMarkup ? headSideMarkup : ""}
      </div>
      <div class="matchup-board-table-wrap">
        <div class="matchup-board-move-head">
          <span class="matchup-board-move-corner">${t(language, "matchup.boardMoves")}</span>
          <div class="matchup-board-targets">${renderMoveTargets(card.targets, state)}</div>
        </div>
        <div class="matchup-board-move-list">
          ${card.moveRows.map((row) => renderMoveRow({...row, name: row.isMissing ? t(language, "matchup.boardMoveMissing") : row.name}, language)).join("")}
        </div>
      </div>
      <div class="matchup-board-summary">
        <span class="analysis-label">${t(language, summaryKey)}</span>
        <div class="entry-tags">
          ${renderSummaryEntries(card.summaryEntries, language, includeResistance, state)}
        </div>
      </div>
    </div>
  `;
  if (side === "opponent") {
    return `
      <article class="matchup-board-entry matchup-board-entry-opponent">
        ${bodyMarkup}
        ${renderSideRail(card, state, language)}
      </article>
    `;
  }
  return `
    <article class="matchup-board-entry matchup-board-entry-ally">
      ${renderSideRail(card, state, language)}
      ${bodyMarkup}
    </article>
  `;
}

function formatSpeedRange(min, max) {
  return min === max ? String(max) : `${min}-${max}`;
}

function hasBoostedSpeedRange(entry) {
  return entry.baseMin !== entry.topMin || entry.baseMax !== entry.topMax;
}

function renderSpeedStats(entry, language) {
  const baseRange = escapeHtml(formatSpeedRange(entry.baseMin, entry.baseMax));
  if (!hasBoostedSpeedRange(entry)) {
    return `<span class="matchup-board-speed-number">${baseRange}</span>`;
  }
  return `
    <span class="matchup-board-speed-number">${baseRange}</span>
    <span class="matchup-board-speed-number matchup-board-speed-number-top">${escapeHtml(formatSpeedRange(entry.topMin, entry.topMax))}</span>
  `;
}

function renderSpeedEntry(entry, state, language, side = "ally") {
  const sideClass = `matchup-board-speed-side matchup-board-speed-side-${side}`;
  return `
    <div class="${sideClass}" title="${escapeHtml(entry.label)}">
      <div class="matchup-board-speed-avatar">${spriteMarkup(entry, state)}</div>
      <div class="matchup-board-speed-stats matchup-board-speed-stats-${side}">
        ${renderSpeedStats(entry, language)}
      </div>
    </div>
  `;
}

function renderSpeedRows(rows = [], state, language) {
  return rows.map((row) => {
    const rowClass = ["matchup-board-speed-row", (!row.ally || !row.opponent) ? "single" : ""].filter(Boolean).join(" ");
    if (row.ally && row.opponent) {
      return `
        <div class="${rowClass}">
          ${renderSpeedEntry(row.ally, state, language, "ally")}
          ${renderSpeedEntry(row.opponent, state, language, "opponent")}
        </div>
      `;
    }
    const singleEntry = row.ally || row.opponent;
    const singleSide = row.ally ? "ally" : "opponent";
    return `
      <div class="${rowClass}">
        ${renderSpeedEntry(singleEntry, state, language, singleSide)}
      </div>
    `;
  }).join("");
}

export function renderMatchupBoard(board, state) {
  const language = state.language;
  if (!board) {
    return `<p class="empty-state">${t(language, "analysis.empty")}</p>`;
  }
  return `
    <section class="subpanel matchup-board-panel">
      <div class="section-head">
        <div>
          <h3>${t(language, "matchup.boardTitle")}</h3>
          <p class="muted">${t(language, "matchup.boardCopy")}</p>
        </div>
      </div>
      <div class="matchup-board-layout">
        <div class="matchup-board-column">
          <div class="matchup-board-column-head"><strong>${t(language, "matchup.boardAlly")}</strong></div>
          <div class="matchup-board-card-list">
            ${board.allyCards.map((card) => renderBoardEntry(card, state, language, "matchup.boardThreats", false, false, "ally")).join("")}
          </div>
        </div>
        <div class="matchup-board-speed-panel">
          <div class="matchup-board-column-head"><strong>${t(language, "matchup.boardSpeed")}</strong></div>
          <p class="muted matchup-board-speed-copy">${t(language, "matchup.boardSpeedCopy")}</p>
          <div class="matchup-board-speed-list">
            ${renderSpeedRows(board.speedRows, state, language)}
          </div>
        </div>
        <div class="matchup-board-column">
          <div class="matchup-board-column-head"><strong>${t(language, "matchup.boardOpponent")}</strong></div>
          <div class="matchup-board-card-list">
            ${board.opponentCards.map((card) => renderBoardEntry(card, state, language, "matchup.boardAnswers", true, true, "opponent")).join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}
