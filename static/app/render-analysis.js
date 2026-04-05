import {t} from "./i18n.js";

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

function memberPillsMarkup(members = []) {
  return members.map((member) => `
    <span class="mini-pill analysis-member-pill">${escapeHtml(member.label)}</span>
  `).join("");
}

function emptyTextMarkup(language, key) {
  return `<p class="muted">${t(language, key)}</p>`;
}

function speedDetailPillMarkup(entry) {
  if (!entry) {
    return "";
  }
  return `
    <span class="speed-analysis-ref">
      <span class="mini-pill speed-analysis-name">${escapeHtml(entry.label)}</span>
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

function coverageCardMarkup(entry, language) {
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
        ${entry.sources.length ? `<div class="analysis-member-pills">${memberPillsMarkup(entry.sources)}</div>` : emptyTextMarkup(language, "common.none")}
      </div>
      <div>
        <div class="analysis-label">${t(language, "analysis.pressuredBy")}</div>
        ${entry.pressuredMembers.length ? `<div class="analysis-member-pills">${memberPillsMarkup(entry.pressuredMembers)}</div>` : emptyTextMarkup(language, "analysis.noPressure")}
      </div>
    </article>
  `;
}

function roleCardMarkup(entry, language) {
  return `
    <article class="analysis-list-card analysis-role-card ${entry.count ? "good" : ""}">
      <div class="analysis-list-head">
        ${renderRolePill(entry.id, language)}
        <span class="source-tag">${t(language, "analysis.roleCount", {count: entry.count})}</span>
      </div>
      ${entry.members.length
        ? `<div class="analysis-role-members">${memberPillsMarkup(entry.members)}</div>`
        : emptyTextMarkup(language, "common.none")}
    </article>
  `;
}

function speedCardMarkup(entry, language) {
  return `
    <article class="entry-card compact">
      <div class="entry-main">
        <div class="entry-title"><strong>${escapeHtml(entry.label)}</strong>${entry.note ? `<span class="mini-pill speed-note-pill">${escapeHtml(entry.note)}</span>` : ""}<span class="source-tag">Spe ${entry.speed}</span>${entry.isTrickRoomSetter ? `<span class="source-tag">${t(language, "analysis.trickRoomSetter")}</span>` : ""}</div>
        ${speedAnalysisRowMarkup(
          t(language, "analysis.aheadOfLabel"),
          entry.aheadOf.length ? entry.aheadOf.map(speedDetailPillMarkup).join("") : `<span class="muted">${t(language, "analysis.noMajorTier")}</span>`,
        )}
        ${speedAnalysisRowMarkup(
          t(language, "analysis.nextThreatLabel"),
          entry.nextThreat ? speedDetailPillMarkup(entry.nextThreat) : `<span class="muted">${t(language, "analysis.fastest")}</span>`,
        )}
        ${entry.trickRoomAheadOf.length ? speedAnalysisRowMarkup(
          t(language, "analysis.trickRoomAheadLabel"),
          entry.trickRoomAheadOf.map(speedDetailPillMarkup).join(""),
        ) : ""}
        ${entry.pressureThreats.length ? speedAnalysisRowMarkup(
          t(language, "analysis.pressureThreats"),
          entry.pressureThreats.map(speedDetailPillMarkup).join(""),
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
    </div>
  `;
}

function coreCardMarkup(entry, language, tone) {
  return `
    <article class="analysis-core-card ${tone}">
      <div class="analysis-list-head">
        <div class="analysis-core-members">
          ${entry.members.map((member) => `<span class="mini-pill analysis-core-member">${escapeHtml(member.label)}</span>`).join("")}
        </div>
        <span class="source-tag score-tag">${t(language, "analysis.coreScore", {value: entry.score.toFixed(1)})}</span>
      </div>
      ${coreMetricPillsMarkup(entry, language)}
      <p class="muted analysis-core-copy">${t(language, "analysis.coreUtility", {roles: entry.roles.length || 0, immunities: entry.immunityPatches})}</p>
      ${entry.roles.length ? `<div class="analysis-inline-pills">${entry.roles.map((role) => renderRolePill(role, language, "mini-pill")).join("")}</div>` : ""}
    </article>
  `;
}

function renderCoveragePanel(analysis, language) {
  const blindSpotMarkup = analysis.offensivePairs.length
    ? analysis.offensivePairs.slice(0, 10).map((entry) => `
      <div class="chip-card bad">
        <strong>${entry.label}</strong>
        <span>${t(language, "analysis.highest", {value: entry.effectiveness.toFixed(2)})}</span>
      </div>
    `).join("")
    : analysis.offensiveSinglesNeutral.length
      ? analysis.offensiveSinglesNeutral.slice(0, 10).map((entry) => `
        <div class="chip-card">
          <strong>${entry.label}</strong>
          <span>${t(language, "analysis.highest", {value: entry.effectiveness.toFixed(2)})}</span>
        </div>
      `).join("")
      : `<p class="empty-state">${t(language, "analysis.fullSingleCoverage")}</p>`;

  return `
    <div class="analysis-detail-grid">
      <section class="subpanel">
        <h3>${t(language, "analysis.coverageIncomingTitle")}</h3>
        <div class="chip-list">
          ${analysis.defensive.slice(0, 10).map((entry) => `
            <div class="chip-card ${entry.average > 1.15 ? "bad" : entry.average < 0.9 ? "good" : ""}">
              <strong>${entry.label}</strong>
              <span>${t(language, "analysis.average", {value: entry.average.toFixed(2)})}</span>
              <span>${t(language, "analysis.weakResistImmune", {weak: entry.weakCount, resist: entry.resistCount, immune: entry.immuneCount})}</span>
            </div>
          `).join("")}
        </div>
      </section>
      <section class="subpanel">
        <h3>${t(language, "analysis.coverageOutgoingTitle")}</h3>
        <div class="analysis-list-stack">
          ${analysis.coverage.rows.map((entry) => coverageCardMarkup(entry, language)).join("")}
        </div>
      </section>
    </div>
    <section class="subpanel">
      <h3>${t(language, "analysis.coverageGapTitle")}</h3>
      <div class="chip-list">${blindSpotMarkup}</div>
    </section>
  `;
}

function renderRolesPanel(analysis, language) {
  return `
    <div class="analysis-detail-grid">
      <section class="subpanel">
        <h3>${t(language, "analysis.rolesTacticalTitle")}</h3>
        <div class="analysis-role-grid">
          ${analysis.roles.tactical.map((entry) => roleCardMarkup(entry, language)).join("")}
        </div>
      </section>
      <section class="subpanel">
        <h3>${t(language, "analysis.rolesSupportTitle")}</h3>
        <div class="analysis-role-grid">
          ${analysis.roles.support.map((entry) => roleCardMarkup(entry, language)).join("")}
        </div>
      </section>
    </div>
    <div class="analysis-detail-grid">
      <section class="subpanel">
        <h3>${t(language, "analysis.rolesStructureTitle")}</h3>
        <div class="analysis-role-grid">
          ${analysis.roles.structure.map((entry) => roleCardMarkup(entry, language)).join("")}
        </div>
      </section>
      <section class="subpanel">
        <h3>${t(language, "analysis.rolesBiasTitle")}</h3>
        <div class="analysis-role-grid">
          ${analysis.roles.attackBiases.map((entry) => roleCardMarkup(entry, language)).join("")}
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
        ${analysis.speed.map((entry) => speedCardMarkup(entry, language)).join("")}
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

function renderCoresPanel(analysis, language, focusId) {
  const focusEntry = analysis.cores.suggestionsById[focusId];
  return `
    <div class="analysis-detail-grid">
      <section class="subpanel">
        <div class="section-head">
          <h3>${t(language, "analysis.coreSuggestTitle")}</h3>
          <select class="analysis-focus-select" data-core-focus>
            ${analysis.cores.memberOptions.map((member) => `
              <option value="${escapeHtml(member.id)}" ${member.id === focusId ? "selected" : ""}>${escapeHtml(member.label)}</option>
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
                  <div class="analysis-member-pills">${memberPillsMarkup(entry.members)}</div>
                </article>
              `).join("")}</div>`
              : `<p class="muted">${t(language, "analysis.coreNoTeamCover")}</p>`}
            <div class="analysis-core-grid">
              ${focusEntry.suggestions.length
                ? focusEntry.suggestions.map((entry) => coreSuggestionMarkup(entry, language)).join("")
                : `<p class="empty-state">${t(language, "analysis.coreNoSuggestion")}</p>`}
            </div>
          ` : `<p class="empty-state">${t(language, "analysis.coreNeedMoreMembers")}</p>`}
        </div>
      </section>
      <section class="subpanel">
        <h3>${t(language, "analysis.coreBestTitle")}</h3>
        <div class="analysis-core-grid">
          ${analysis.cores.bestPairs.length
            ? analysis.cores.bestPairs.map((entry) => coreCardMarkup(entry, language, "good")).join("")
            : `<p class="empty-state">${t(language, "analysis.coreNeedMoreMembers")}</p>`}
        </div>
        <h3>${t(language, "analysis.coreRiskTitle")}</h3>
        <div class="analysis-core-grid">
          ${analysis.cores.riskyPairs.length
            ? analysis.cores.riskyPairs.map((entry) => coreCardMarkup(entry, language, "bad")).join("")
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
    document.getElementById("analysis-overview").innerHTML = `<p class="empty-state">${t(language, "analysis.empty")}</p>`;
    tabTargets.forEach((tabId) => {
      document.getElementById(`analysis-${tabId}-panel`).innerHTML = tabId === activeTab
        ? `<p class="empty-state">${t(language, "analysis.empty")}</p>`
        : "";
    });
    return;
  }

  document.getElementById("analysis-overview").innerHTML = `
    <div class="metric-card"><strong>${analysis.weaknesses.length}</strong><span>${t(language, "analysis.weaknesses")}</span></div>
    <div class="metric-card"><strong>${analysis.blindSpots.length}</strong><span>${t(language, "analysis.blindSpots")}</span></div>
    <div class="metric-card"><strong>${analysis.coverage.strongCount}</strong><span>${t(language, "analysis.coverageStrong")}</span></div>
    <div class="metric-card"><strong>${t(language, `analysis.speedMode.${analysis.speedContext.mode}`)}</strong><span>${t(language, "analysis.speedPlan")}</span></div>
    <div class="metric-card"><strong>${analysis.roles.filledUtilityCount}</strong><span>${t(language, "analysis.rolesFilled")}</span></div>
    <div class="metric-card"><strong>${analysis.cores.bestPairs[0]?.score.toFixed(1) || "0.0"}</strong><span>${t(language, "analysis.bestCore")}</span></div>
    <div class="metric-card"><strong>${analysis.structure.duplicateTypes.join(" / ") || t(language, "common.none")}</strong><span>${t(language, "analysis.duplicateTypes")}</span></div>
  `;

  const coreFocusId = state.activeCoreConfigId || analysis.cores.memberOptions[0]?.id || "";
  document.getElementById("analysis-coverage-panel").innerHTML = renderCoveragePanel(analysis, language);
  document.getElementById("analysis-roles-panel").innerHTML = renderRolesPanel(analysis, language);
  document.getElementById("analysis-cores-panel").innerHTML = renderCoresPanel(analysis, language, coreFocusId);
}
