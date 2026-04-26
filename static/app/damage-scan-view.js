import {t} from "./i18n.js";

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

function renderAttackerRows(state, scan) {
  return scan.rows.map((row) => `
    <div class="damage-scan-row">
      <div class="damage-scan-label">${escapeHtml(getLocalizedSpeciesName(state, row))}</div>
      <div class="damage-scan-cells">
        ${row.cells.map((cell) => renderScanSummaryCell(state, cell, {openId: row.openId, focusSide: "attacker"})).join("")}
      </div>
    </div>
  `).join("");
}

function renderDefenderRows(state, scan) {
  return scan.rows.map((row) => `
    <div class="damage-scan-row">
      <div class="damage-scan-label">${escapeHtml(getLocalizedSpeciesName(state, row))}</div>
      <div class="damage-scan-cells damage-scan-cells-single">
        ${renderScanSummaryCell(state, row.bestCell, {openId: row.openId, focusSide: "defender"})}
      </div>
    </div>
  `).join("");
}

function renderScanActions(state) {
  return `
    <div class="damage-scan-actions">
      <button type="button" data-run-damage-scan="attacker">${t(state.language, "damage.scanRunAttacker")}</button>
      <button type="button" data-run-damage-scan="defender">${t(state.language, "damage.scanRunDefender")}</button>
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
      <div class="section-head section-head-tight">
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
