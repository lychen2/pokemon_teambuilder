import {t} from "./i18n.js";
import {setInnerHTMLIfChanged} from "./render-cache.js";
import {spriteMarkup} from "./sprites.js";
import {getUsageData, getUsageDetail, getUsageRows, isUsageAvailable, formatUsagePoints, formatUsageShare} from "./usage-stats.js";
import {getLocalizedNatureName, getTypeLabel} from "./utils.js";

const SORT_KEYS = Object.freeze(["usage", "name", "available"]);
// Official usage source is disabled until a reliable upstream is identified.
// Smogon stays as the only active source; the source toggle UI is hidden.
const SOURCE_KEYS = Object.freeze(["smogon"]);

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderUsageView(state) {
  const rows = getUsageRows(state.datasets, state.usage);
  const selected = selectUsageRow(rows, state.usage?.selectedSpeciesId);
  if (selected && state.usage) {
    state.usage.selectedSpeciesId = selected.speciesId;
  }
  setInnerHTMLIfChanged(document.getElementById("usage-content"), usageMarkup(state, rows, selected));
}

function usageMarkup(state, rows, selected) {
  const language = state.language;
  const sourceData = getUsageData(state.datasets, state.usage?.source);
  if (!isUsageAvailable(sourceData)) {
    return unavailableMarkup(state, sourceData);
  }
  const detail = selected ? getUsageDetail(state.datasets, selected.speciesId, {source: state.usage?.source}) : null;
  return `
    <div class="usage-layout">
      <aside class="usage-list-panel">
        ${usageToolbarMarkup(state, sourceData)}
        <div class="usage-list" role="listbox">
          ${rows.map((row) => usageRowMarkup(row, selected, state)).join("") || `<p class="empty-state">${t(language, "usage.empty")}</p>`}
        </div>
      </aside>
      <section class="usage-detail-panel">
        ${detail ? usageDetailMarkup(detail, state) : `<p class="empty-state">${t(language, "usage.select")}</p>`}
      </section>
    </div>
  `;
}

function unavailableMarkup(state, sourceData) {
  const info = sourceData?.info || {};
  return `
    <section class="usage-unavailable">
      <h3>${escapeHtml(t(state.language, "usage.unavailableTitle"))}</h3>
      <p class="muted">${escapeHtml(info.reason || t(state.language, "usage.unavailableCopy"))}</p>
      <div class="usage-meta-grid">
        ${metaItemMarkup(t(state.language, "usage.expectedMetagame"), info.expectedMetagame)}
        ${metaItemMarkup(t(state.language, "usage.activeFormat"), info.activeFormat)}
      </div>
    </section>
  `;
}

function usageToolbarMarkup(state, sourceData) {
  const info = sourceData?.info || {};
  const language = state.language;
  const activeSource = state.usage?.source || "smogon";
  const showSourceToggle = SOURCE_KEYS.length > 1;
  return `
    <div class="usage-toolbar">
      <div>
        <h3>${escapeHtml(t(language, "usage.listTitle"))}</h3>
        <p class="muted">${escapeHtml(usageInfoLine(info, language, activeSource))}</p>
        ${showSourceToggle ? `
        <div class="usage-source-toggle" role="group" aria-label="${escapeHtml(t(language, "usage.source"))}">
          ${SOURCE_KEYS.map((source) => `
            <button
              type="button"
              class="ghost-button mini-action ${activeSource === source ? "active" : ""}"
              data-usage-source="${source}"
              aria-pressed="${activeSource === source ? "true" : "false"}"
            >${escapeHtml(t(language, `usage.source.${source}`))}</button>
          `).join("")}
        </div>
        ` : ""}
      </div>
      <label>
        <span>${escapeHtml(t(language, "usage.search"))}</span>
        <input id="usage-search" type="search" value="${escapeHtml(state.usage?.search || "")}" placeholder="${escapeHtml(t(language, "usage.searchPlaceholder"))}">
      </label>
      <label>
        <span>${escapeHtml(t(language, "usage.sort"))}</span>
        <select id="usage-sort">
          ${SORT_KEYS.map((key) => `<option value="${key}" ${state.usage?.sort === key ? "selected" : ""}>${escapeHtml(t(language, `usage.sort.${key}`))}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
}

function usageInfoLine(info, language, _source) {
  // Only smogon source remains active; the official-source branch is retired
  // until a reliable upstream is configured.
  const battles = Number(info["number of battles"] || 0).toLocaleString();
  const month = info.month || "-";
  const rating = info.rating || info.cutoff || "-";
  return t(language, "usage.infoLine", {month, rating, battles});
}

function usageRowMarkup(row, selected, state) {
  const language = state.language;
  const active = selected?.speciesId === row.speciesId;
  return `
    <button type="button" class="usage-row ${active ? "active" : ""}" data-usage-species="${escapeHtml(row.speciesId)}">
      ${spriteMarkup(row, state)}
      <span>
        <strong>${escapeHtml(language === "zh" ? row.localizedName : row.speciesName)}</strong>
        <small>${escapeHtml(row.usageName)}</small>
      </span>
      <span class="usage-row-score">${formatUsageShare(row.usage, 1)}</span>
    </button>
  `;
}

function usageDetailMarkup(detail, state) {
  const language = state.language;
  const species = state.datasets?.pokedex?.[detail.speciesId] || {};
  const allSpreadsHaveNature = detail.spreads.length > 0 && detail.spreads.every((entry) => entry.hasNature);
  return `
    <div class="usage-detail-head">
      <div>
        <h3>${spriteMarkup(detail, state)}${escapeHtml(language === "zh" ? detail.localizedName : detail.speciesName)}</h3>
        <div class="entry-meta">
          ${(species.types || []).map((type) => `<span class="pill type-pill type-${String(type).toLowerCase()}">${escapeHtml(getTypeLabel(type, language))}</span>`).join("")}
          <span class="source-tag">${formatUsageShare(detail.usage, 1)}</span>
        </div>
      </div>
      ${detail.speciesId ? `<button type="button" class="add-button" data-create-usage-config="${escapeHtml(detail.speciesId)}">${escapeHtml(t(language, "usage.createConfig"))}</button>` : ""}
    </div>
    <div class="usage-section-grid">
      ${spreadPanelMarkup(detail.spreads, language)}
      ${recordPanelMarkup("usage.moves", detail.moves, state)}
      ${recordPanelMarkup("usage.items", detail.items, state)}
      ${recordPanelMarkup("usage.abilities", detail.abilities, state)}
      ${allSpreadsHaveNature ? "" : recordPanelMarkup("usage.natures", detail.natures, state)}
      ${recordPanelMarkup("usage.teammates", detail.teammates, state)}
      ${recordPanelMarkup("usage.counters", detail.counters, state)}
    </div>
  `;
}

function spreadPanelMarkup(spreads, language) {
  if (!spreads.length) {
    return emptyPanelMarkup("usage.spreads", "usage.noSpreads", language);
  }
  return `
    <section class="usage-stat-panel usage-stat-panel-wide">
      <h4>${escapeHtml(t(language, "usage.spreads"))}</h4>
      ${spreads.map((entry) => `
        <div class="usage-bar-row">
          <span>${entry.nature ? `${escapeHtml(natureLabel(entry.nature, language))} ` : ""}<small>${escapeHtml(formatUsagePoints(entry.points, language))}</small></span>
          <strong>${formatUsageShare(entry.share, 1)}</strong>
          <i style="--usage-width:${Math.min(100, entry.share * 100)}%"></i>
        </div>
      `).join("")}
    </section>
  `;
}

function natureLabel(nature, language) {
  const localized = getLocalizedNatureName(nature, language);
  return localized && localized !== nature ? `${localized} (${nature})` : nature;
}

function recordPanelMarkup(titleKey, entries, state) {
  const language = state.language;
  if (!entries.length) {
    return emptyPanelMarkup(titleKey, "usage.noData", language);
  }
  return `
    <section class="usage-stat-panel">
      <h4>${escapeHtml(t(language, titleKey))}</h4>
      ${entries.map((entry) => `
        <div class="usage-bar-row ${entry.spritePosition ? "has-sprite" : ""} ${entry.resolved ? "" : "usage-unresolved"}">
          ${entry.spritePosition ? spriteMarkup(entry, state) : ""}
          <span>${escapeHtml(language === "zh" ? entry.localizedName : entry.resolvedName)}</span>
          <strong>${formatUsageShare(entry.share, 1)}</strong>
          <i style="--usage-width:${Math.min(100, entry.share * 100)}%"></i>
        </div>
      `).join("")}
    </section>
  `;
}

function emptyPanelMarkup(titleKey, messageKey, language) {
  return `
    <section class="usage-stat-panel">
      <h4>${escapeHtml(t(language, titleKey))}</h4>
      <p class="empty-state">${escapeHtml(t(language, messageKey))}</p>
    </section>
  `;
}

function metaItemMarkup(label, value) {
  return `<span><strong>${escapeHtml(label)}</strong>${escapeHtml(value || "-")}</span>`;
}

function selectUsageRow(rows, selectedSpeciesId) {
  return rows.find((row) => row.speciesId === selectedSpeciesId) || rows[0] || null;
}
