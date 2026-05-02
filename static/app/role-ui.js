import {t} from "./i18n.js";
import {analyzePokemonRoles, getRoleSummaryIds} from "./team-roles.js";

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function roleLabel(roleId, language) {
  return t(language, `analysis.role.${roleId}`);
}

export function roleDescription(roleId, language) {
  return t(language, `analysis.roleDesc.${roleId}`);
}

function rolePillMarkup(roleId, language, className = "mini-pill") {
  return `
    <span class="${escapeHtml(className)}" title="${escapeHtml(roleDescription(roleId, language))}">
      ${escapeHtml(roleLabel(roleId, language))}
    </span>
  `;
}

function itemLabel(itemId, language) {
  return t(language, `analysis.item.${itemId}`);
}

function roleLineMarkup(labelKey, roleIds, language) {
  if (!roleIds.length) return "";
  return `
    <div class="tooltip-desc-box">
      <strong>${escapeHtml(t(language, labelKey))}</strong>
      ${escapeHtml(roleIds.map((roleId) => roleLabel(roleId, language)).join(" / "))}
    </div>
  `;
}

function oneLineText(roleAnalysis, language) {
  const secondary = roleAnalysis.secondary.slice(0, 3).map((roleId) => roleLabel(roleId, language)).join(" / ");
  return t(language, "analysis.roleOneLine", {
    primary: roleLabel(roleAnalysis.primary, language),
    secondary: secondary || t(language, "common.none"),
    tier: t(language, `analysis.compressionTier.${roleAnalysis.compressionTier}`),
  });
}

function reasonLineMarkup(roleAnalysis, language) {
  const reasons = [
    ...roleAnalysis.roleReasons.primary,
    ...Object.values(roleAnalysis.roleReasons.secondary).flat(),
  ];
  return `
    <div class="tooltip-desc-box">
      <strong>${escapeHtml(t(language, "analysis.roleReasonTitle"))}</strong>
      ${escapeHtml(reasons.map((key) => t(language, key)).join(" / "))}
    </div>
  `;
}

function itemInfluenceMarkup(roleAnalysis, language) {
  if (!roleAnalysis.itemRoleSummary.length) return "";
  const entries = roleAnalysis.itemRoleSummary.map((entry) => (
    `${itemLabel(entry.item, language)}: ${entry.roleIds.map((roleId) => roleLabel(roleId, language)).join(" / ")}`
  ));
  return `
    <div class="tooltip-desc-box">
      <strong>${escapeHtml(t(language, "analysis.itemRoleTitle"))}</strong>
      ${escapeHtml(entries.join(" · "))}
    </div>
  `;
}

function proxyStatusMarkup(roleAnalysis, language) {
  const reasonKey = roleAnalysis.roleProxyStatus?.reasonKey || "";
  if (!reasonKey) return "";
  return `<div class="tooltip-desc-box">${escapeHtml(t(language, reasonKey))}</div>`;
}

function buildTooltipMarkup(roleAnalysis, language) {
  return `
    <div class="tooltip-stack">
      ${roleLineMarkup("analysis.singlePrimary", [roleAnalysis.primary], language)}
      ${roleLineMarkup("analysis.singleSecondary", roleAnalysis.secondary.slice(0, 6), language)}
      ${reasonLineMarkup(roleAnalysis, language)}
      <div class="tooltip-desc-box">
        ${escapeHtml(t(language, "analysis.compressionTooltip", {
          score: roleAnalysis.compressionScore.toFixed(1),
          tier: t(language, `analysis.compressionTier.${roleAnalysis.compressionTier}`),
        }))}
      </div>
      <div class="tooltip-desc-box">
        ${escapeHtml(t(language, `analysis.moveSlotQuality.${roleAnalysis.moveSlotQuality}`))}
      </div>
      ${itemInfluenceMarkup(roleAnalysis, language)}
      <div class="tooltip-desc-box">${escapeHtml(oneLineText(roleAnalysis, language))}</div>
      ${proxyStatusMarkup(roleAnalysis, language)}
    </div>
  `;
}

export function compactRoleSummaryMarkup(config, language, options = {}) {
  const limit = Number(options.limit || 5);
  const roleOptions = {roleContext: options.roleContext};
  const roleIds = getRoleSummaryIds(config, limit, roleOptions);
  if (!roleIds.length) return "";
  const roleAnalysis = analyzePokemonRoles(config, roleOptions);
  const className = ["role-summary-pills", options.className || ""].filter(Boolean).join(" ");
  return `
    <span class="info-pill role-summary-pill" tabindex="0">
      <span class="info-pill-label">${escapeHtml(roleLabel(roleAnalysis.primary, language))}</span>
      <span class="info-tooltip-content">${buildTooltipMarkup(roleAnalysis, language)}</span>
    </span>
    <span class="${escapeHtml(className)}">
      ${roleIds.slice(1).map((roleId) => rolePillMarkup(roleId, language)).join("")}
    </span>
  `;
}

export function rolePillsMarkup(roleIds = [], language, className = "mini-pill") {
  return roleIds.map((roleId) => rolePillMarkup(roleId, language, className)).join("");
}
