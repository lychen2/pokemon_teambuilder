import {t} from "./i18n.js";
import {setInnerHTMLIfChanged} from "./render-cache.js";
import {spriteMarkup} from "./sprites.js";
import {getTypeLabel, normalizeName} from "./utils.js";

const MATRIX_MAX_ALPHA = 0.36;
const MATRIX_MIN_ALPHA = 0.04;
const MATRIX_RESIST_ALPHA = 0.16;
const MATRIX_IMMUNE_ALPHA = 0.28;
const MATRIX_SCALE_STEP = 0.08;
const MATRIX_MAX_RING_PX = 4;

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildTextTooltipMarkup(detail, language) {
  return `
    <div class="tooltip-stack">
      <div class="tooltip-desc-box">${escapeHtml(detail || t(language, "tooltip.noDetail"))}</div>
    </div>
  `;
}

function renderTooltipPill(label, detail, language, className = "") {
  const pillClassName = ["info-pill", className].filter(Boolean).join(" ");
  return `
    <span class="${pillClassName}" tabindex="0">
      <span class="info-pill-label">${escapeHtml(label)}</span>
      <span class="info-tooltip-content">${buildTextTooltipMarkup(detail, language)}</span>
    </span>
  `;
}

function renderRolePill(roleId, language, className = "") {
  return renderTooltipPill(
    t(language, `analysis.role.${roleId}`),
    t(language, `analysis.roleDesc.${roleId}`),
    language,
    className,
  );
}

function getLocalizedMemberLabel(member = {}, state, language) {
  const fallback = member.label || member.speciesName || t(language, "common.unknown");
  if (language !== "zh") {
    return fallback;
  }
  return state.localizedSpeciesNames?.get(member.speciesId) || fallback;
}

function getLocalizedMoveName(moveName = "", state) {
  if (state.language !== "zh") {
    return moveName;
  }
  return state.localizedMoveNames?.get(String(moveName || "").toLowerCase().replace(/[^a-z0-9]+/g, "")) || moveName;
}

function memberPillMarkup(member, state) {
  return `
    <span class="mini-pill analysis-member-pill">
      ${spriteMarkup(member, state)}
      <span>${escapeHtml(getLocalizedMemberLabel(member, state, state.language))}</span>
    </span>
  `;
}

function memberPillsMarkup(members = [], state) {
  return members.map((member) => `
    ${memberPillMarkup(member, state)}
  `).join("");
}

function emptyTextMarkup(language, key) {
  return `<p class="muted">${t(language, key)}</p>`;
}

function getAllyTeraEntries(state, language) {
  const team = state.team || [];
  return team
    .map((config) => {
      const type = config.teraType || "";
      if (!type) return null;
      const localized = language === "zh" ? state.localizedSpeciesNames?.get(config.speciesId) : null;
      const name = localized || config.speciesName || config.displayName || "";
      return {type, name, label: getTypeLabel(type, language)};
    })
    .filter(Boolean);
}

function teraHintMarkup(state, language) {
  const entries = getAllyTeraEntries(state, language);
  if (!entries.length) return "";
  const pills = entries
    .map((entry) => `<span class="mini-pill tera-hint-pill type-${entry.type.toLowerCase()}">${escapeHtml(entry.name)} → ${escapeHtml(entry.label)}</span>`)
    .join("");
  return `
    <div class="analysis-tera-hint">
      <span class="analysis-label">${t(language, "analysis.teraHintLabel")}</span>
      <div class="analysis-inline-pills">${pills}</div>
    </div>
  `;
}

function archetypePillsMarkup(identity, language) {
  const pills = [identity.primaryArchetypeId, ...(identity.secondaryArchetypeIds || [])]
    .filter(Boolean)
    .map((archetypeId, index) => {
      const className = index === 0 ? "analysis-good-pill" : "";
      return `<span class="mini-pill ${className}">${escapeHtml(t(language, `analysis.archetype.${archetypeId}`))}</span>`;
    })
    .join("");
  return `
    <div class="analysis-identity-card">
      <div class="analysis-label">${t(language, "analysis.identityTitle")}</div>
      <div class="analysis-inline-pills">${pills}</div>
    </div>
  `;
}

function comboCardMarkup(entry, language) {
  const toneClass = entry.status === "complete" ? "good" : "";
  const missingText = entry.missingTypes.length
    ? t(language, "analysis.identityComboNear", {types: entry.missingTypes.join(" / ")})
    : t(language, "analysis.identityComboComplete");
  const focusButton = entry.focusType
    ? `<button type="button" class="ghost-button mini-action" data-analysis-focus-type="${escapeHtml(entry.focusType)}">${t(language, "analysis.identityFocusAction", {type: entry.missingTypes[0]})}</button>`
    : "";
  return `
    <article class="analysis-cover-card ${toneClass}">
      <div class="analysis-list-head">
        <strong>${escapeHtml(entry.label)}</strong>
        <span class="mini-pill ${entry.status === "complete" ? "analysis-good-pill" : ""}">
          ${t(language, `analysis.identityStatus.${entry.status}`)}
        </span>
      </div>
      <p class="muted">${escapeHtml(missingText)}</p>
      <div class="analysis-inline-pills">
        ${entry.coveredTypes.map((type) => `<span class="mini-pill">${escapeHtml(type)}</span>`).join("")}
      </div>
      ${focusButton}
    </article>
  `;
}

function identityOverviewMarkup(identity, language) {
  if (!identity) {
    return "";
  }
  const combos = (identity.defensiveCombos || []).filter((entry) => entry.status !== "missing");
  return `
    <div class="analysis-identity-stack">
      ${archetypePillsMarkup(identity, language)}
      <div class="analysis-identity-card">
        <div class="analysis-label">${t(language, "analysis.identityComboTitle")}</div>
        <div class="analysis-cover-grid">
          ${combos.length
            ? combos.map((entry) => comboCardMarkup(entry, language)).join("")
            : `<p class="muted">${t(language, "analysis.identityComboEmpty")}</p>`}
        </div>
      </div>
    </div>
  `;
}

function speedDetailPillMarkup(entry, state) {
  if (!entry) {
    return "";
  }
  return `
    <span class="speed-analysis-ref">
      <span class="mini-pill speed-analysis-name">
        ${spriteMarkup(entry, state)}
        <span>${escapeHtml(getLocalizedMemberLabel(entry, state, state.language))}</span>
      </span>
      ${entry.note ? `<span class="mini-pill speed-note-pill">${escapeHtml(entry.note)}</span>` : ""}
      <span class="mini-pill speed-analysis-speed">Spe ${escapeHtml(entry.speed)}</span>
      ${entry.effectiveness ? `<span class="mini-pill speed-analysis-threat">${escapeHtml(entry.effectiveness.toFixed(1))}x</span>` : ""}
    </span>
  `;
}

function speedAnalysisRowMarkup(label, contentMarkup) {
  return `
    <div class="entry-line entry-tags speed-analysis-row">
      <span class="speed-analysis-label">${escapeHtml(label)}</span>
      ${contentMarkup}
    </div>
  `;
}

function coverageCardMarkup(entry, language, state) {
  const tone = entry.bestEffectiveness >= 2 ? "good" : entry.bestEffectiveness < 1 ? "bad" : "";
  return `
    <article class="analysis-list-card ${tone}">
      <div class="analysis-list-head">
        <strong>${escapeHtml(entry.label)}</strong>
        <div class="analysis-inline-pills">
          <span class="mini-pill ${entry.bestEffectiveness >= 2 ? "analysis-good-pill" : ""}">
            ${t(language, "analysis.bestHit", {value: entry.bestEffectiveness.toFixed(1)})}
          </span>
          ${entry.pressuredMembers.length ? `<span class="mini-pill analysis-alert-pill">${t(language, "analysis.coveragePressure", {count: entry.pressuredMembers.length})}</span>` : ""}
        </div>
      </div>
      <div>
        <div class="analysis-label">${t(language, "analysis.coveredBy")}</div>
        ${entry.sources.length ? `<div class="analysis-member-pills">${memberPillsMarkup(entry.sources, state)}</div>` : emptyTextMarkup(language, "common.none")}
      </div>
      <div>
        <div class="analysis-label">${t(language, "analysis.pressuredBy")}</div>
        ${entry.pressuredMembers.length ? `<div class="analysis-member-pills">${memberPillsMarkup(entry.pressuredMembers, state)}</div>` : emptyTextMarkup(language, "analysis.noPressure")}
      </div>
    </article>
  `;
}

function moveSuggestionMarkup(move, state, language) {
  return `
    <span class="mini-pill ${move.effectiveness >= 2 ? "analysis-good-pill" : ""}">
      ${escapeHtml(getLocalizedMoveName(move.name, state))}
      · ${formatMultiplier(move.effectiveness)}x
      ${move.basePower ? ` · ${t(language, "output.basePower")} ${escapeHtml(move.basePower)}` : ""}
    </span>
  `;
}

function coverageGapCardMarkup(entry, language, state) {
  return `
    <article class="analysis-list-card analysis-gap-card ${entry.patchable ? "good" : "bad"}">
      <div class="analysis-list-head">
        <strong>${escapeHtml(entry.label)}</strong>
        <div class="analysis-inline-pills">
          <span class="mini-pill">${t(language, "analysis.coverGapCurrent", {value: formatMultiplier(entry.currentBestEffectiveness)})}</span>
          <span class="mini-pill ${entry.patchable ? "analysis-good-pill" : "analysis-alert-pill"}">${t(language, "analysis.coverGapPotential", {value: formatMultiplier(entry.potentialBestEffectiveness)})}</span>
        </div>
      </div>
      ${entry.patchable ? `
        <p class="muted">${t(language, "analysis.coverGapPatchable")}</p>
        <div class="analysis-gap-member-list">
          ${entry.suggestions.map((suggestion) => `
            <article class="analysis-gap-member-card">
              <div class="analysis-list-head">
                ${memberPillMarkup(suggestion.member, state)}
                <span class="source-tag">${t(language, "analysis.coverGapMemberBest", {value: formatMultiplier(suggestion.bestEffectiveness)})}</span>
              </div>
              <div class="analysis-inline-pills">
                ${suggestion.moves.map((move) => moveSuggestionMarkup(move, state, language)).join("")}
              </div>
            </article>
          `).join("")}
        </div>
      ` : `<p class="muted recommend-penalty-copy">${t(language, "analysis.coverGapNoPatch")}</p>`}
    </article>
  `;
}

function formatMultiplier(value) {
  return Number(value).toFixed(Number.isInteger(value) ? 0 : 2).replace(/\.00$/, "");
}

function getMultiplierTone(value, type = "defense") {
  if (type === "defense") {
    if (value === 0) return "good";
    if (value < 1) return "good";
    if (value > 1) return "bad";
    return "";
  }
  if (value >= 2) return "good";
  if (value < 1) return "bad";
  return "";
}

function clampMatrixAlpha(value) {
  return Math.max(MATRIX_MIN_ALPHA, Math.min(MATRIX_MAX_ALPHA, value));
}

function matrixCellStyle(value, type = "defense") {
  const numericValue = Number(value);
  const ringWidth = Math.min(MATRIX_MAX_RING_PX, Math.max(0, Math.ceil(Math.max(1, numericValue) - 1)));
  if (type === "defense") {
    const alpha = numericValue === 0
      ? MATRIX_IMMUNE_ALPHA
      : numericValue < 1
        ? MATRIX_RESIST_ALPHA
        : clampMatrixAlpha(numericValue * MATRIX_SCALE_STEP);
    return `--matrix-cell-alpha:${alpha};--matrix-cell-ring:${ringWidth}px;`;
  }
  const alpha = clampMatrixAlpha(numericValue * MATRIX_SCALE_STEP);
  return `--matrix-cell-alpha:${alpha};--matrix-cell-ring:${ringWidth}px;`;
}

function matrixMarker(value, type, language) {
  if (type === "defense") {
    if (value === 0) return t(language, "analysis.matrixImmune");
    if (value < 1) return t(language, "analysis.matrixResist");
    if (value > 1) return t(language, "analysis.matrixWeak");
    return t(language, "analysis.matrixNeutral");
  }
  if (value >= 2) return t(language, "analysis.matrixStrong");
  if (value < 1) return t(language, "analysis.matrixLow");
  return t(language, "analysis.matrixNeutral");
}

function matrixHeadersMarkup(members = [], state, language) {
  return members.map((entry) => `
    <div class="analysis-matrix-column-head" title="${escapeHtml(getLocalizedMemberLabel(entry.member, state, language))}">
      <span>${escapeHtml(getLocalizedMemberLabel(entry.member, state, language))}</span>
    </div>
  `).join("");
}

function matrixStyle(entries = []) {
  return `grid-template-columns: minmax(124px, 1.1fr) repeat(${entries.length}, minmax(58px, 1fr));`;
}

function suggestedCoverMarkup(entry, language, state) {
  const label = language === "zh"
    ? state.localizedSpeciesNames?.get(entry.speciesId) || entry.speciesName || entry.displayName
    : entry.displayName;
  return `
    <article class="analysis-cover-card">
      <div class="analysis-list-head">
        <strong>${escapeHtml(label)}</strong>
        <span class="mini-pill ${entry.resistance < 1 ? "analysis-good-pill" : ""}">
          ${t(language, "analysis.coverMatrixResist", {value: formatMultiplier(entry.resistance)})}
        </span>
      </div>
      <div class="analysis-inline-pills">
        ${entry.coveredWeaknesses.length
          ? entry.coveredWeaknesses.map((label) => `<span class="mini-pill analysis-good-pill">${escapeHtml(label)}</span>`).join("")
          : `<span class="mini-pill">${t(language, "common.none")}</span>`}
      </div>
      ${entry.roleIds.length
        ? `<div class="analysis-inline-pills">${entry.roleIds.map((roleId) => renderRolePill(roleId, language, "mini-pill")).join("")}</div>`
        : ""}
    </article>
  `;
}

function defensiveMatrixRowMarkup(entry, language, state) {
  return `
    <article class="analysis-matrix-row-card ${entry.average > 1.15 ? "bad" : ""}">
      <div class="analysis-matrix-row" style="${matrixStyle(entry.members)}">
        <div class="analysis-matrix-label">
          <strong>${escapeHtml(entry.label)}</strong>
          <span>${t(language, "analysis.weakResistImmune", {weak: entry.weakCount, resist: entry.resistCount, immune: entry.immuneCount})}</span>
        </div>
        ${entry.members.map((cell) => `
          <div class="analysis-matrix-cell ${getMultiplierTone(cell.multiplier, "defense")}" style="${matrixCellStyle(cell.multiplier, "defense")}">
            <span class="analysis-matrix-cell-name">${escapeHtml(getLocalizedMemberLabel(cell.member, state, language))}</span>
            <span class="analysis-matrix-marker">${escapeHtml(matrixMarker(cell.multiplier, "defense", language))}</span>
            <strong>${formatMultiplier(cell.multiplier)}x</strong>
          </div>
        `).join("")}
      </div>
      ${entry.suggestedCovers?.length ? `
        <div class="analysis-cover-suggestions">
          <div class="analysis-label">${t(language, "analysis.coverSuggestedTitle")}</div>
          <div class="analysis-cover-grid">
            ${entry.suggestedCovers.map((candidate) => suggestedCoverMarkup(candidate, language, state)).join("")}
          </div>
        </div>
      ` : ""}
    </article>
  `;
}

function offensiveMatrixRowMarkup(entry, language, state) {
  return `
    <article class="analysis-matrix-row-card">
      <div class="analysis-matrix-row" style="${matrixStyle(entry.members)}">
        <div class="analysis-matrix-label">
          <strong>${escapeHtml(entry.label)}</strong>
          <span>${t(language, "analysis.coverMatrixBest", {value: formatMultiplier(entry.bestEffectiveness)})}</span>
        </div>
        ${entry.members.map((cell) => `
          <div class="analysis-matrix-cell ${getMultiplierTone(cell.effectiveness, "offense")}" style="${matrixCellStyle(cell.effectiveness, "offense")}">
            <span class="analysis-matrix-cell-name">${escapeHtml(getLocalizedMemberLabel(cell.member, state, language))}</span>
            <span class="analysis-matrix-marker">${escapeHtml(matrixMarker(cell.effectiveness, "offense", language))}</span>
            <strong>${formatMultiplier(cell.effectiveness)}x</strong>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function roleCardMarkup(entry, language, state) {
  return `
    <article class="analysis-list-card analysis-role-card ${entry.count ? "good" : ""}">
      <div class="analysis-list-head">
        ${renderRolePill(entry.id, language)}
        <span class="source-tag">${t(language, "analysis.roleCount", {count: entry.count})}</span>
      </div>
      ${entry.members.length
        ? `<div class="analysis-role-members">${memberPillsMarkup(entry.members, state)}</div>`
        : emptyTextMarkup(language, "common.none")}
    </article>
  `;
}

function roleSetMarkup(roleIds = [], language, emptyKey = "common.none") {
  if (!roleIds.length) {
    return `<span class="mini-pill">${t(language, emptyKey)}</span>`;
  }
  return roleIds.map((roleId) => renderRolePill(roleId, language, "mini-pill")).join("");
}

function moveRoleLineMarkup(entry, language, state) {
  const moveName = getLocalizedMoveName(entry.moveName, state);
  return `
    <div class="single-role-move-row">
      <span>${escapeHtml(moveName || t(language, "common.unknown"))}</span>
      <div class="analysis-inline-pills">${roleSetMarkup(entry.roleIds, language)}</div>
    </div>
  `;
}

function roleReasonMarkup(entry, language) {
  const reasons = [
    ...entry.roleReasons.primary,
    ...Object.values(entry.roleReasons.secondary).flat(),
  ];
  if (!reasons.length) return "";
  return `
    <div class="single-role-block">
      <div class="analysis-label">${t(language, "analysis.roleReasonTitle")}</div>
      <p class="muted role-reason-copy">${escapeHtml(reasons.map((key) => t(language, key)).join(" / "))}</p>
    </div>
  `;
}

function itemRoleSummaryMarkup(entry, language, state) {
  if (!entry.itemRoleSummary.length) return "";
  return `
    <div class="single-role-block">
      <div class="analysis-label">${t(language, "analysis.itemRoleTitle")}</div>
      <div class="analysis-inline-pills">
        ${entry.itemRoleSummary.map((itemEntry) => {
          const itemName = state.localizedItemNames?.get(normalizeName(itemEntry.item)) || itemEntry.item;
          return `<span class="mini-pill">${escapeHtml(itemName)} → ${escapeHtml(itemEntry.roleIds.map((roleId) => t(language, `analysis.role.${roleId}`)).join(" / "))}</span>`;
        }).join("")}
      </div>
    </div>
  `;
}

function singleRoleCardMarkup(entry, language, state) {
  const tierKey = `analysis.compressionTier.${entry.compressionTier}`;
  return `
    <article class="analysis-list-card single-role-card">
      <div class="analysis-list-head">
        ${memberPillMarkup(entry.member, state)}
        <div class="analysis-inline-pills">
          <span class="source-tag score-tag">${t(language, "analysis.compressionScore", {value: entry.compressionScore.toFixed(1)})}</span>
          <span class="source-tag">${t(language, tierKey)}</span>
        </div>
      </div>
      <div class="single-role-block">
        <div class="analysis-label">${t(language, "analysis.singlePrimary")}</div>
        <div class="analysis-inline-pills">${renderRolePill(entry.primary, language, "mini-pill analysis-good-pill")}</div>
      </div>
      <div class="single-role-block">
        <div class="analysis-label">${t(language, "analysis.singleSecondary")}</div>
        <div class="analysis-inline-pills">${roleSetMarkup(entry.secondary.slice(0, 8), language)}</div>
      </div>
      ${metaPositionMarkup(entry.metaPosition, language)}
      ${roleReasonMarkup(entry, language)}
      <div class="single-role-block">
        <div class="analysis-label">${t(language, "analysis.moveSlotTitle")}</div>
        <p class="muted role-reason-copy">${escapeHtml(t(language, `analysis.moveSlotQuality.${entry.moveSlotQuality}`))}</p>
      </div>
      ${itemRoleSummaryMarkup(entry, language, state)}
      <div class="single-role-block">
        <div class="analysis-label">${t(language, "analysis.moveRoleTitle")}</div>
        <div class="single-role-move-list">
          ${entry.moveRoles.map((moveEntry) => moveRoleLineMarkup(moveEntry, language, state)).join("")}
        </div>
      </div>
    </article>
  `;
}

function metaPositionMarkup(metaPosition, language) {
  if (!metaPosition?.available) return "";
  const pills = [
    metaRankPill("speed", metaPosition.estimatedSpeedRank, language),
    metaRankPill("atk", metaPosition.estimatedAtkRank, language),
    metaRankPill("spa", metaPosition.estimatedSpaRank, language),
    metaRankPill("physBulk", metaPosition.estimatedPhysBulkRank, language),
    metaRankPill("spBulk", metaPosition.estimatedSpBulkRank, language),
  ].filter(Boolean).join("");
  if (!pills) return "";
  return `
    <div class="single-role-block">
      <div class="analysis-label">${t(language, "analysis.metaPositionTitle")}</div>
      <div class="analysis-inline-pills">${pills}</div>
    </div>
  `;
}

function metaRankPill(key, rank, language) {
  if (rank == null || !Number.isFinite(Number(rank))) return "";
  const percent = Math.round(Number(rank) * 100);
  const tone = percent >= 75 ? "analysis-good-pill" : (percent <= 25 ? "analysis-alert-pill" : "");
  return `<span class="mini-pill ${tone}" title="${escapeHtml(t(language, `analysis.metaPosition.${key}.desc`))}">${escapeHtml(t(language, `analysis.metaPosition.${key}`))} ${percent}%</span>`;
}

function speedCardMarkup(entry, language, state) {
  return `
    <article class="entry-card compact">
      <div class="entry-main">
        <div class="entry-title"><strong>${escapeHtml(getLocalizedMemberLabel(entry, state, language))}</strong>${entry.note ? `<span class="mini-pill speed-note-pill">${escapeHtml(entry.note)}</span>` : ""}<span class="source-tag">Spe ${entry.speed}</span>${entry.isTrickRoomSetter ? `<span class="source-tag">${t(language, "analysis.trickRoomSetter")}</span>` : ""}</div>
        ${speedAnalysisRowMarkup(
          t(language, "analysis.aheadOfLabel"),
          entry.aheadOf.length ? entry.aheadOf.map((item) => speedDetailPillMarkup(item, state)).join("") : `<span class="muted">${t(language, "analysis.noMajorTier")}</span>`,
        )}
        ${speedAnalysisRowMarkup(
          t(language, "analysis.nextThreatLabel"),
          entry.nextThreat ? speedDetailPillMarkup(entry.nextThreat, state) : `<span class="muted">${t(language, "analysis.fastest")}</span>`,
        )}
        ${entry.trickRoomAheadOf.length ? speedAnalysisRowMarkup(
          t(language, "analysis.trickRoomAheadLabel"),
          entry.trickRoomAheadOf.map((item) => speedDetailPillMarkup(item, state)).join(""),
        ) : ""}
        ${entry.pressureThreats.length ? speedAnalysisRowMarkup(
          t(language, "analysis.pressureThreats"),
          entry.pressureThreats.map((item) => speedDetailPillMarkup(item, state)).join(""),
        ) : ""}
      </div>
    </article>
  `;
}

function coreMetricPillsMarkup(entry, language) {
  return `
    <div class="analysis-inline-pills">
      <span class="mini-pill ${entry.teamWeaknessPatches ? "analysis-good-pill" : ""}">${t(language, "analysis.coreTeamPatch", {count: entry.teamWeaknessPatches})}</span>
      <span class="mini-pill">${t(language, "analysis.corePatch", {count: entry.patchedWeaknesses})}</span>
      <span class="mini-pill ${entry.sharedWeaknesses ? "analysis-alert-pill" : ""}">${t(language, "analysis.coreSharedWeakness", {count: entry.sharedWeaknesses})}</span>
      <span class="mini-pill">${t(language, "analysis.coreSingleCoverage", {count: entry.singleCoverageCount})}</span>
      <span class="mini-pill">${t(language, "analysis.coreDualCoverage", {count: entry.pairCoverageCount})}</span>
      ${entry.comboBonus ? `<span class="mini-pill analysis-good-pill">${t(language, "analysis.coreComboBonus", {value: entry.comboBonus.toFixed(1)})}</span>` : ""}
    </div>
  `;
}

function coreCardMarkup(entry, language, tone, state) {
  return `
    <article class="analysis-core-card ${tone}">
      <div class="analysis-list-head">
        <div class="analysis-core-members">
          ${entry.members.map((member) => `
            <span class="mini-pill analysis-core-member">
              ${spriteMarkup(member, state)}
              <span>${escapeHtml(getLocalizedMemberLabel(member, state, language))}</span>
            </span>
          `).join("")}
        </div>
        <span class="source-tag score-tag">${t(language, "analysis.coreScore", {value: entry.score.toFixed(1)})}</span>
      </div>
      ${coreMetricPillsMarkup(entry, language)}
      <p class="muted analysis-core-copy">${t(language, "analysis.coreUtility", {roles: entry.roles.length || 0, immunities: entry.immunityPatches})}</p>
      ${entry.roles.length ? `<div class="analysis-inline-pills">${entry.roles.map((role) => renderRolePill(role, language, "mini-pill")).join("")}</div>` : ""}
      ${entry.synergyReasons?.length ? `<div class="analysis-inline-pills">${entry.synergyReasons.map((reason) => `<span class="mini-pill analysis-good-pill">${escapeHtml(reason)}</span>`).join("")}</div>` : ""}
    </article>
  `;
}

function renderCoveragePanel(analysis, language, state) {
  const defensiveHeaders = analysis.coverage.defensiveMatrix[0]?.members || [];
  const offensiveHeaders = analysis.coverage.offensiveMatrix[0]?.members || [];
  const gapCards = analysis.coverage.offensiveGapCards || [];

  return `
    <div class="analysis-detail-grid">
      <section class="subpanel">
        <h3>${t(language, "analysis.coverageIncomingTitle")}</h3>
        <p class="muted">${t(language, "analysis.coverMatrixIncomingCopy")}</p>
        <div class="analysis-matrix-head" style="${matrixStyle(defensiveHeaders)}">
          <div class="analysis-matrix-corner">${t(language, "analysis.coverMatrixAxisIncoming")}</div>
          ${matrixHeadersMarkup(defensiveHeaders, state, language)}
        </div>
        <div class="analysis-list-stack">
          ${analysis.coverage.defensiveMatrix.map((entry) => defensiveMatrixRowMarkup(entry, language, state)).join("")}
        </div>
      </section>
      <section class="subpanel">
        <h3>${t(language, "analysis.coverageOutgoingTitle")}</h3>
        <p class="muted">${t(language, "analysis.coverMatrixOutgoingCopy")}</p>
        <div class="analysis-matrix-head" style="${matrixStyle(offensiveHeaders)}">
          <div class="analysis-matrix-corner">${t(language, "analysis.coverMatrixAxisOutgoing")}</div>
          ${matrixHeadersMarkup(offensiveHeaders, state, language)}
        </div>
        <div class="analysis-list-stack">
          ${analysis.coverage.offensiveMatrix.map((entry) => offensiveMatrixRowMarkup(entry, language, state)).join("")}
        </div>
      </section>
    </div>
    <section class="subpanel">
      <h3>${t(language, "analysis.coverageGapTitle")}</h3>
      ${gapCards.length
        ? `<div class="analysis-gap-grid">${gapCards.map((entry) => coverageGapCardMarkup(entry, language, state)).join("")}</div>`
        : `<p class="empty-state">${t(language, "analysis.fullSingleCoverage")}</p>`}
    </section>
  `;
}

function renderRolesPanel(analysis, language, state) {
  return `
    <section class="subpanel">
      <h3>${t(language, "analysis.singleRolesTitle")}</h3>
      <div class="single-role-grid">
        ${analysis.roles.single.map((entry) => singleRoleCardMarkup(entry, language, state)).join("")}
      </div>
    </section>
    <div class="analysis-detail-grid">
      <section class="subpanel">
        <h3>${t(language, "analysis.rolesTacticalTitle")}</h3>
        <div class="analysis-role-grid">
          ${analysis.roles.tactical.map((entry) => roleCardMarkup(entry, language, state)).join("")}
        </div>
      </section>
      <section class="subpanel">
        <h3>${t(language, "analysis.rolesSupportTitle")}</h3>
        <div class="analysis-role-grid">
          ${analysis.roles.support.map((entry) => roleCardMarkup(entry, language, state)).join("")}
        </div>
      </section>
    </div>
    <div class="analysis-detail-grid">
      <section class="subpanel">
        <h3>${t(language, "analysis.rolesStructureTitle")}</h3>
        <div class="analysis-role-grid">
          ${analysis.roles.structure.map((entry) => roleCardMarkup(entry, language, state)).join("")}
        </div>
      </section>
      <section class="subpanel">
        <h3>${t(language, "analysis.rolesBiasTitle")}</h3>
        <div class="analysis-role-grid">
          ${analysis.roles.attackBiases.map((entry) => roleCardMarkup(entry, language, state)).join("")}
        </div>
      </section>
    </div>
    <section class="subpanel">
      <h3>${t(language, "analysis.rolesGapTitle")}</h3>
      ${analysis.roles.missing.length
        ? `<div class="analysis-inline-pills analysis-gap-pills">${analysis.roles.missing.map((roleId) => renderRolePill(roleId, language, "mini-pill analysis-alert-pill")).join("")}</div>`
        : emptyTextMarkup(language, "analysis.noMissingRoles")}
    </section>
    <section class="subpanel">
      <h3>${t(language, "views.speedTitle")}</h3>
      <div class="stack-list compact-list">
        ${analysis.speed.map((entry) => speedCardMarkup(entry, language, state)).join("")}
      </div>
    </section>
  `;
}

function coreSuggestionMarkup(entry, language) {
  return `
    <article class="analysis-core-card good">
      <div class="analysis-list-head">
        <strong>${escapeHtml(entry.label)}</strong>
        <span class="source-tag score-tag">${t(language, "analysis.coreScore", {value: entry.score.toFixed(1)})}</span>
      </div>
      <div class="analysis-inline-pills">
        ${entry.types.map((type, index) => `<span class="pill type-pill type-${type.toLowerCase()}">${escapeHtml(entry.typeLabels[index])}</span>`).join("")}
      </div>
      <p class="muted analysis-core-copy">${t(language, "analysis.coreSuggestionCovered", {count: entry.covered.length, synergy: entry.synergy})}</p>
      <div class="analysis-inline-pills">
        ${entry.coveredLabels.map((label) => `<span class="mini-pill analysis-good-pill">${escapeHtml(label)}</span>`).join("")}
      </div>
    </article>
  `;
}

function coreCandidatePillsMarkup(labels = [], language, className = "") {
  if (!labels.length) {
    return `<span class="mini-pill">${t(language, "common.none")}</span>`;
  }
  return labels.map((label) => `<span class="mini-pill ${className}">${escapeHtml(label)}</span>`).join("");
}

function coreLibraryCandidateMarkup(entry, language, state) {
  const tone = entry.riskLabels.length > entry.focusCoveredLabels.length ? "bad" : "good";
  const localizedBase = language === "zh"
    ? state.localizedSpeciesNames?.get(entry.speciesId) || entry.speciesName || entry.label
    : entry.speciesName || entry.label;
  const noteIndex = String(entry.label || "").indexOf("（");
  const displayLabel = noteIndex >= 0 ? `${localizedBase}${entry.label.slice(noteIndex)}` : (entry.label || localizedBase);
  return `
    <article class="analysis-core-card ${tone}">
      <div class="analysis-list-head">
        <strong>${escapeHtml(displayLabel)}</strong>
        <span class="source-tag score-tag">${t(language, "analysis.coreScore", {value: entry.score.toFixed(1)})}</span>
      </div>
      <div>
        <div class="analysis-label">${t(language, "analysis.coreCandidateFocusCover")}</div>
        <div class="analysis-inline-pills">
          ${entry.focusCoveredLabels.length ? coreCandidatePillsMarkup(entry.focusCoveredLabels, language, "analysis-good-pill") : `<span class="mini-pill">${t(language, "common.none")}</span>`}
        </div>
      </div>
      <div>
        <div class="analysis-label">${t(language, "analysis.coreCandidateTeamCover")}</div>
        <div class="analysis-inline-pills">
          ${entry.teamCoveredLabels.length ? coreCandidatePillsMarkup(entry.teamCoveredLabels, language, "analysis-good-pill") : `<span class="mini-pill">${t(language, "common.none")}</span>`}
        </div>
      </div>
      <div>
        <div class="analysis-label">${t(language, "analysis.coreCandidateRisk")}</div>
        <div class="analysis-inline-pills">
          ${entry.riskLabels.length ? coreCandidatePillsMarkup(entry.riskLabels, language, "analysis-alert-pill") : `<span class="mini-pill">${t(language, "analysis.coreCandidateNoRisk")}</span>`}
        </div>
      </div>
      ${entry.roleIds.length ? `
        <div>
          <div class="analysis-label">${t(language, "analysis.coreCandidateRoles")}</div>
          <div class="analysis-inline-pills">${entry.roleIds.map((roleId) => renderRolePill(roleId, language, "mini-pill")).join("")}</div>
        </div>
      ` : ""}
      <div class="analysis-card-actions">
        <button type="button" class="ghost-button mini-action" data-add-config="${escapeHtml(entry.configId)}">${t(language, "analysis.coreCandidateAdd")}</button>
      </div>
    </article>
  `;
}

function renderCoresPanel(analysis, language, focusId, state) {
  const focusEntry = analysis.cores.suggestionsById[focusId];
  return `
    <div class="analysis-detail-grid">
      <section class="subpanel">
        <div class="section-head">
          <h3>${t(language, "analysis.coreSuggestTitle")}</h3>
          <select class="analysis-focus-select" data-core-focus>
            ${analysis.cores.memberOptions.map((member) => `
              <option value="${escapeHtml(member.id)}" ${member.id === focusId ? "selected" : ""}>${escapeHtml(getLocalizedMemberLabel(member, state, language))}</option>
            `).join("")}
          </select>
        </div>
        <div class="analysis-core-grid">
          ${focusEntry ? `
            <p class="muted">${t(language, "analysis.coreWeakTo", {types: focusEntry.weaknessLabels.join(" / ") || t(language, "common.none")})}</p>
            ${focusEntry.coveredByTeam.length
              ? `<div class="analysis-list-stack">${focusEntry.coveredByTeam.map((entry) => `
                <article class="analysis-list-card">
                  <div class="analysis-list-head">
                    <strong>${escapeHtml(entry.label)}</strong>
                    <span class="source-tag">${t(language, "analysis.coreAlreadyCovered")}</span>
                  </div>
                  <div class="analysis-member-pills">${memberPillsMarkup(entry.members, state)}</div>
                </article>
              `).join("")}</div>`
              : `<p class="muted">${t(language, "analysis.coreNoTeamCover")}</p>`}
            <div class="analysis-subsection-head">
              <h4>${t(language, "analysis.coreLibraryTitle")}</h4>
              <p class="muted">${t(language, "analysis.coreLibraryCopy")}</p>
            </div>
            <div class="analysis-core-grid">
              ${focusEntry.libraryCandidates?.length
                ? focusEntry.libraryCandidates.map((entry) => coreLibraryCandidateMarkup(entry, language, state)).join("")
                : `<p class="empty-state">${t(language, "analysis.coreNoSuggestion")}</p>`}
            </div>
            ${focusEntry.suggestions?.length ? `
              <div class="analysis-subsection-head">
                <h4>${t(language, "analysis.coreTypeIdeaTitle")}</h4>
                <p class="muted">${t(language, "analysis.coreTypeIdeaCopy")}</p>
              </div>
              <div class="analysis-core-grid">
                ${focusEntry.suggestions.map((entry) => coreSuggestionMarkup(entry, language)).join("")}
              </div>
            ` : ""}
          ` : `<p class="empty-state">${t(language, "analysis.coreNeedMoreMembers")}</p>`}
        </div>
      </section>
      <section class="subpanel">
        <h3>${t(language, "analysis.coreBestTitle")}</h3>
        <div class="analysis-core-grid">
          ${analysis.cores.bestPairs.length
            ? analysis.cores.bestPairs.map((entry) => coreCardMarkup(entry, language, "good", state)).join("")
            : `<p class="empty-state">${t(language, "analysis.coreNeedMoreMembers")}</p>`}
        </div>
        <h3>${t(language, "analysis.coreBestTrioTitle")}</h3>
        <div class="analysis-core-grid">
          ${analysis.cores.bestTrios.length
            ? analysis.cores.bestTrios.map((entry) => coreCardMarkup(entry, language, "good", state)).join("")
            : `<p class="empty-state">${t(language, "analysis.coreNeedMoreMembers")}</p>`}
        </div>
        <h3>${t(language, "analysis.coreRiskTitle")}</h3>
        <div class="analysis-core-grid">
          ${analysis.cores.riskyPairs.length
            ? analysis.cores.riskyPairs.map((entry) => coreCardMarkup(entry, language, "bad", state)).join("")
            : `<p class="empty-state">${t(language, "analysis.coreNoRisk")}</p>`}
        </div>
      </section>
    </div>
  `;
}

export function renderAnalysisView(state) {
  const {analysis, language} = state;
  const activeTab = state.activeAnalysisTab || "coverage";
  const tabTargets = ["coverage", "roles", "cores"];

  document.querySelectorAll("[data-analysis-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.analysisTab === activeTab);
  });
  document.querySelectorAll(".analysis-detail-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.analysisPanel === activeTab);
  });

  if (!analysis) {
    setInnerHTMLIfChanged(document.getElementById("analysis-overview"), `<p class="empty-state">${t(language, "analysis.empty")}</p>`);
    tabTargets.forEach((tabId) => {
      setInnerHTMLIfChanged(
        document.getElementById(`analysis-${tabId}-panel`),
        tabId === activeTab ? `<p class="empty-state">${t(language, "analysis.empty")}</p>` : "",
      );
    });
    return;
  }

  const teraHint = teraHintMarkup(state, language);
  const identityMarkup = identityOverviewMarkup(analysis.identity, language);
  setInnerHTMLIfChanged(document.getElementById("analysis-overview"), `
    ${teraHint}
    ${identityMarkup}
    <div class="metric-card"><strong>${analysis.weaknesses.length}</strong><span>${t(language, "analysis.weaknesses")}</span></div>
    <div class="metric-card"><strong>${analysis.blindSpots.length}</strong><span>${t(language, "analysis.blindSpots")}</span></div>
    <div class="metric-card"><strong>${analysis.coverage.strongCount}</strong><span>${t(language, "analysis.coverageStrong")}</span></div>
    <div class="metric-card"><strong>${t(language, `analysis.speedMode.${analysis.speedContext.mode}`)}</strong><span>${t(language, "analysis.speedPlan")}</span></div>
    <div class="metric-card"><strong>${analysis.roles.filledUtilityCount}</strong><span>${t(language, "analysis.rolesFilled")}</span></div>
    <div class="metric-card"><strong>${analysis.cores.bestPairs[0]?.score.toFixed(1) || "0.0"}</strong><span>${t(language, "analysis.bestCore")}</span></div>
    <div class="metric-card"><strong>${analysis.structure.duplicateTypes.join(" / ") || t(language, "common.none")}</strong><span>${t(language, "analysis.duplicateTypes")}</span></div>
  `);

  const coreFocusId = state.activeCoreConfigId || analysis.cores.memberOptions[0]?.id || "";
  setInnerHTMLIfChanged(document.getElementById("analysis-coverage-panel"), renderCoveragePanel(analysis, language, state));
  setInnerHTMLIfChanged(document.getElementById("analysis-roles-panel"), renderRolesPanel(analysis, language, state));
  setInnerHTMLIfChanged(document.getElementById("analysis-cores-panel"), renderCoresPanel(analysis, language, coreFocusId, state));
}
