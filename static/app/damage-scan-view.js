import {t} from "./i18n.js";
import {spriteMarkup} from "./sprites.js";

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getLocalizedSpeciesName(state, entry = {}) {
  if (state.language !== "zh") {
    return entry.label || entry.speciesName || "";
  }
  return state.localizedSpeciesNames?.get(entry.speciesId) || entry.label || entry.speciesName || "";
}

function getLocalizedMoveName(state, moveName = "") {
  if (state.language !== "zh") return moveName;
  return state.localizedMoveNames?.get(String(moveName || "").toLowerCase().replace(/[^a-z0-9]+/g, "")) || moveName;
}

function getToneClass(maxPercent) {
  if (maxPercent >= 100) return "lethal";
  if (maxPercent >= 50) return "bad";
  if (maxPercent >= 25) return "warn";
  return "good";
}

function passesScanFilter(cell, filter) {
  const maxPercent = Number(cell?.maxPercent || 0);
  if (filter === "ohko") return maxPercent >= 100;
  if (filter === "twoHko") return maxPercent >= 50 && maxPercent < 100;
  return true;
}

function getVisibleScanCells(cells = [], filter = "all") {
  if (filter === "maxDamage") {
    const best = cells.reduce((winner, cell) => (
      Number(cell.maxPercent || 0) > Number(winner?.maxPercent || 0) ? cell : winner
    ), null);
    return best ? [best] : [];
  }
  return cells.filter((cell) => passesScanFilter(cell, filter));
}

function renderScanSummaryCell(state, cell, action) {
  const tone = getToneClass(Number(cell.maxPercent || 0));
  return `
    <button
      type="button"
      class="damage-scan-cell ${tone}"
      data-damage-scan-open="${escapeHtml(action.openId || "")}"
      data-damage-scan-focus="${escapeHtml(action.focusSide || "attacker")}"
    >
      <strong>${escapeHtml(getLocalizedMoveName(state, cell.moveName || t(state.language, "common.none")))}</strong>
      <span>${escapeHtml(cell.rangeText || "--")}</span>
      <span class="muted">${escapeHtml(cell.koText || t(state.language, "damage.scanNoKoText"))}</span>
    </button>
  `;
}

function renderScanRowLabel(state, row) {
  return `
    <div class="damage-scan-label">
      ${spriteMarkup(row, state)}
      <strong>${escapeHtml(getLocalizedSpeciesName(state, row))}</strong>
    </div>
  `;
}

function renderAttackerRows(state, scan) {
  const filter = state.damage.scanFilter || "all";
  return scan.rows.map((row) => {
    const cells = getVisibleScanCells(row.cells, filter);
    return `
    <div class="damage-scan-row">
      ${renderScanRowLabel(state, row)}
      <div class="damage-scan-cells ${filter === "maxDamage" ? "damage-scan-cells-single" : ""}">
        ${cells.length
          ? cells.map((cell) => renderScanSummaryCell(state, cell, {openId: row.openId, focusSide: "attacker"})).join("")
          : `<p class="empty-state damage-scan-row-empty">${t(state.language, "damage.scanFilterEmpty")}</p>`}
      </div>
    </div>
  `;
  }).join("");
}

function renderDefenderRows(state, scan) {
  const filter = state.damage.scanFilter || "all";
  return scan.rows.map((row) => {
    const cells = getVisibleScanCells([row.bestCell], filter);
    return `
    <div class="damage-scan-row">
      ${renderScanRowLabel(state, row)}
      <div class="damage-scan-cells ${filter === "all" ? "damage-scan-cells-single" : ""}">
        ${cells.length
          ? cells.map((cell) => renderScanSummaryCell(state, cell, {openId: row.openId, focusSide: "defender"})).join("")
          : `<p class="empty-state damage-scan-row-empty">${t(state.language, "damage.scanFilterEmpty")}</p>`}
      </div>
    </div>
  `;
  }).join("");
}

function renderScanActions(state) {
  const filters = ["all", "ohko", "twoHko", "maxDamage"];
  const activeFilter = state.damage.scanFilter || "all";
  return `
    <div class="damage-scan-actions">
      <button type="button" data-run-damage-scan="attacker">${t(state.language, "damage.scanRunAttacker")}</button>
      <button type="button" data-run-damage-scan="defender">${t(state.language, "damage.scanRunDefender")}</button>
    </div>
    <div class="damage-scan-filter-row">
      ${filters.map((filter) => `
        <button
          type="button"
          class="ghost-button mini-action ${activeFilter === filter ? "active" : ""}"
          data-damage-scan-filter="${filter}"
        >${t(state.language, `damage.scanFilter.${filter}`)}</button>
      `).join("")}
    </div>
  `;
}

export function renderDamageScanPanel(state) {
  const scan = state.damage.scanResult;
  const loading = state.damage.scanLoading;
  const error = state.damage.scanError;
  const mode = scan?.mode || state.damage.scanMode || "attacker";
  return `
    <section class="damage-scan-panel">
      <div class="damage-scan-head">
        <div>
          <h3>${t(state.language, "damage.scanTitle")}</h3>
          <p class="muted">${t(state.language, mode === "defender" ? "damage.scanCopyDefender" : "damage.scanCopyAttacker")}</p>
        </div>
        ${loading ? `<span class="source-tag">${t(state.language, "damage.loading")}</span>` : ""}
      </div>
      ${renderScanActions(state)}
      ${error ? `<p class="empty-state">${escapeHtml(error)}</p>` : ""}
      ${!scan && !loading && !error ? `<p class="empty-state">${t(state.language, "damage.scanEmpty")}</p>` : ""}
      ${scan ? `
        <div class="damage-scan-table">
          ${scan.mode === "attacker" ? renderAttackerRows(state, scan) : renderDefenderRows(state, scan)}
        </div>
      ` : ""}
    </section>
  `;
}
