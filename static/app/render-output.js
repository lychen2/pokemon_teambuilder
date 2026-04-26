import {t} from "./i18n.js";
import {setInnerHTMLIfChanged} from "./render-cache.js";
import {spriteMarkup} from "./sprites.js";
import {normalizeName} from "./utils.js";

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getLocalizedSpeciesName(state, entry) {
  return state.localizedSpeciesNames?.get(entry.speciesId) || entry.displayLabel || entry.displayName || entry.speciesName || "";
}

function getLocalizedMoveName(state, moveName = "") {
  if (state.language !== "zh") return moveName;
  return state.localizedMoveNames?.get(normalizeName(moveName)) || moveName;
}

function formatScore(value) {
  return Math.round(Number(value || 0)).toLocaleString("en-US");
}

function formatMultiplier(value) {
  const normalized = Number(value || 0).toFixed(2).replace(/\.?0+$/, "");
  return `×${normalized}`;
}

function statLabel(language, statKey) {
  return t(language, `builder.stats.${statKey || "atk"}`);
}

function buildSpreadTag(isSpread, language) {
  return isSpread ? `<span class="source-tag output-spread-tag">${escapeHtml(t(language, "output.aoeTag"))}</span>` : "";
}

function buildReasonRows(entry, language) {
  if (!entry.peakRestrictedReasonIds?.length) return "";
  return `
    <div class="tooltip-subheading">${escapeHtml(t(language, "output.restricted"))}</div>
    <div class="output-tooltip-reasons">
      ${entry.peakRestrictedReasonIds.map((reasonId) => `
        <div class="tooltip-desc-box">${escapeHtml(t(language, `output.reason.${reasonId}`))}</div>
      `).join("")}
    </div>
  `;
}

const RESTRICTED_REASON_TAG_KEYS = Object.freeze({
  conditional: "output.reasonTag.conditional",
  charge: "output.reasonTag.charge",
  recharge: "output.reasonTag.recharge",
  repeatlock: "output.reasonTag.repeatlock",
  recoil: "output.reasonTag.recoil",
  selfdestruct: "output.reasonTag.selfdestruct",
  selfdrop: "output.reasonTag.selfdrop",
  ohko: "output.reasonTag.ohko",
});

function buildMetricGridRows(rows = []) {
  return rows.map(({label, value}) => `
    <span class="output-tooltip-key">${escapeHtml(label)}</span>
    <strong class="output-tooltip-value">${escapeHtml(value)}</strong>
  `).join("");
}

function buildSpeciesRow(entry, state) {
  return `
    <div class="output-tooltip-species">
      ${spriteMarkup(entry, state)}
      <strong>${escapeHtml(getLocalizedSpeciesName(state, entry))}</strong>
    </div>
  `;
}

function getMoveIdentity(move = {}) {
  return `${move?.name || ""}|${move?.isSpread ? "spread" : "single"}`;
}

function excludeDuplicateMoves(primaryMoves = [], secondaryMoves = []) {
  const primaryKeys = new Set(primaryMoves.map((move) => getMoveIdentity(move)));
  return secondaryMoves.filter((move) => !primaryKeys.has(getMoveIdentity(move)));
}

function buildStatusRows(breakdown, language) {
  if (Math.round(Number(breakdown.baseValue || 0)) === Math.round(Number(breakdown.maxValue || 0))) {
    return [];
  }
  const rows = [
    {label: t(language, "output.noTriggerValue"), value: formatScore(breakdown.baseValue)},
    {label: t(language, "output.maxValue"), value: formatScore(breakdown.maxValue)},
  ];
  if (breakdown.triggerKey) {
    rows.push({label: t(language, "output.triggerCondition"), value: t(language, breakdown.triggerKey)});
  }
  if (breakdown.triggerSource) {
    rows.push({label: t(language, "output.triggerSource"), value: breakdown.triggerSource});
  }
  return rows;
}

function buildSpecialCaseRows(breakdown, language) {
  if (!breakdown.specialCaseLabelKey) return [];
  return [{label: t(language, "output.specialCase"), value: `${t(language, breakdown.specialCaseLabelKey)} · ${formatMultiplier(breakdown.finalDamageMultiplier)}`}];
}

const ATTACK_ITEM_MULTIPLIERS = Object.freeze({
  "Choice Band": 1.5,
  "Choice Specs": 1.5,
  "Light Ball": 2,
  "Thick Club": 2,
  "Deep Sea Tooth": 2,
});

const ATTACK_ABILITY_MULTIPLIERS = Object.freeze({
  "Huge Power": 2,
  "Pure Power": 2,
  Hustle: 1.5,
  "Gorilla Tactics": 1.5,
  "Dragon's Maw": 1.5,
  Steelworker: 1.5,
  "Steely Spirit": 1.5,
  "Rocky Payload": 1.5,
  Transistor: 1.3,
  "Water Bubble": 2,
  Guts: 1.5,
  Plus: 1.5,
  Minus: 1.5,
  "Solar Power": 1.5,
  "Orichalcum Pulse": 1.33,
  "Hadron Engine": 1.33,
  Stakeout: 2,
  "Flower Gift": 1.5,
});

const BP_ABILITY_MULTIPLIERS = Object.freeze({
  Aerilate: 1.2,
  Pixilate: 1.2,
  Refrigerate: 1.2,
  Galvanize: 1.2,
  Dragonize: 1.2,
  Normalize: 1.2,
  Technician: 1.5,
  "Iron Fist": 1.2,
  "Strong Jaw": 1.5,
  Sharpness: 1.5,
  "Mega Launcher": 1.5,
  "Tough Claws": 1.3,
  Reckless: 1.2,
  "Sheer Force": 1.3,
  "Punk Rock": 1.3,
  "Fairy Aura": 1.33,
  "Dark Aura": 1.33,
  "Flare Boost": 1.5,
  "Toxic Boost": 1.5,
  "Sand Force": 1.3,
  Analytic: 1.3,
  Electromorphosis: 2,
  "Wind Power": 2,
  "Supreme Overlord": 1.5,
});

function createModifierSource(label, multiplier, kind = "text") {
  return {
    label: String(label || ""),
    kind,
    multiplier: Number(multiplier || 1),
  };
}

function getLocalizedSourceLabel(source, state, language) {
  if (source.kind === "labelKey") {
    return t(language, source.label);
  }
  if (source.kind === "item") {
    return state.localizedItemNames?.get(normalizeName(source.label || "")) || source.label;
  }
  if (source.kind === "ability") {
    return state.localizedAbilityNames?.get(normalizeName(source.label || "")) || source.label;
  }
  return source.label;
}

function dedupeModifierSources(sources = []) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = `${source.kind}:${source.label}:${source.multiplier}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function resolveMoveModifierSources(entry, move) {
  const breakdown = move.breakdown || {};
  const sources = [];
  if (Number(breakdown.spreadMultiplier || 1) !== 1) {
    sources.push(createModifierSource("output.aoeTag", breakdown.spreadMultiplier, "labelKey"));
  }
  if (entry.item) {
    if (Number(breakdown.itemMultiplier || 1) !== 1) {
      sources.push(createModifierSource(entry.item, breakdown.itemMultiplier, "item"));
    } else if (ATTACK_ITEM_MULTIPLIERS[entry.item] && Number(breakdown.attackMultiplier || 1) !== 1) {
      sources.push(createModifierSource(entry.item, ATTACK_ITEM_MULTIPLIERS[entry.item], "item"));
    }
  }
  if (entry.ability) {
    if (ATTACK_ABILITY_MULTIPLIERS[entry.ability] && Number(breakdown.attackMultiplier || 1) !== 1) {
      sources.push(createModifierSource(entry.ability, ATTACK_ABILITY_MULTIPLIERS[entry.ability], "ability"));
    }
    if (BP_ABILITY_MULTIPLIERS[entry.ability] && Number(breakdown.bpMultiplier || 1) !== 1) {
      sources.push(createModifierSource(entry.ability, BP_ABILITY_MULTIPLIERS[entry.ability], "ability"));
    }
  }
  if (breakdown.specialCaseLabelKey) {
    sources.push(createModifierSource(breakdown.specialCaseLabelKey, breakdown.finalDamageMultiplier, "labelKey"));
  }
  return dedupeModifierSources(sources);
}

function buildModifierSourceMarkup(sources, state, language, className = "") {
  if (!sources.length) {
    return "";
  }
  const totalMultiplier = sources.reduce((product, source) => product * Number(source.multiplier || 1), 1);
  return `
    <span class="output-source-list ${className}">
      ${sources.map((source) => `
        <span class="output-source-chip">
          <span class="output-source-label">${escapeHtml(getLocalizedSourceLabel(source, state, language))}</span>
        </span>
      `).join("")}
      <span class="output-source-total">${escapeHtml(formatMultiplier(totalMultiplier))}</span>
    </span>
  `;
}

function buildInlineModifierSourceMarkup(entry, move, state, language) {
  const modifierSources = resolveMoveModifierSources(entry, move).filter((source) => {
    return !(source.kind === "labelKey" && source.label === "output.aoeTag");
  });
  if (!modifierSources.length) {
    return "";
  }
  return buildModifierSourceMarkup(modifierSources, state, language, "output-source-list-inline");
}

function buildBreakdownRows(title, entry, moves, state, language) {
  if (!moves?.length) return "";
  return `
    <div class="tooltip-subheading">${escapeHtml(title)}</div>
    ${moves.map((move) => {
      const breakdown = move.breakdown || {};
      const modifierSources = resolveMoveModifierSources(entry, move);
      const rows = [
        {label: t(language, "output.move"), value: `${getLocalizedMoveName(state, move.name)}${move.isSpread ? ` · ${t(language, "output.aoeTag")}` : ""}`},
        {label: t(language, "output.value"), value: formatScore(move.score)},
        ...buildStatusRows(breakdown, language),
        {label: t(language, "output.offenseStat"), value: `${statLabel(language, breakdown.statKey || "atk")} ${Math.round(Number(breakdown.offenseStat || 0))}`},
        {label: t(language, "output.basePower"), value: `${breakdown.basePower} × ${breakdown.hitCount}`},
        ...buildSpecialCaseRows(breakdown, language),
      ];
      return `
        <div class="output-tooltip-grid">${buildMetricGridRows(rows)}</div>
        ${modifierSources.length ? `<div class="output-tooltip-source-row"><span class="output-tooltip-key">${escapeHtml(t(language, "output.modifierSources"))}</span>${buildModifierSourceMarkup(modifierSources, state, language)}</div>` : ""}
      `;
    }).join("")}
  `;
}

function buildOutputTooltip(entry, state, language) {
  const uniqueStableMoves = excludeDuplicateMoves(entry.peakMoves || [], entry.stableMoves || []);
  return `
    <span class="info-tooltip-content">
      <div class="tooltip-stack output-tooltip-stack">
        ${buildSpeciesRow(entry, state)}
        ${buildBreakdownRows(t(language, "output.peak"), entry, entry.peakMoves || [], state, language)}
        ${uniqueStableMoves.length ? buildBreakdownRows(t(language, "output.stable"), entry, uniqueStableMoves, state, language) : ""}
        ${buildReasonRows(entry, language)}
      </div>
    </span>
  `;
}

function formatAccuracyTag(accuracy) {
  const normalized = Math.round(Number(accuracy || 0));
  if (!normalized || normalized >= 100) return "";
  return `${normalized}%`;
}

function getRestrictedReasonTag(reasonId, language) {
  const key = RESTRICTED_REASON_TAG_KEYS[reasonId];
  return key ? t(language, key) : "";
}

function getUnstableMoveTag(move, language) {
  const accuracyTag = formatAccuracyTag(move.accuracy);
  if (accuracyTag) return accuracyTag;
  const [reasonId] = move.restrictedReasonIds || [];
  return getRestrictedReasonTag(reasonId, language);
}

function getUnstableMoveTitle(move, language) {
  const accuracyTag = formatAccuracyTag(move.accuracy);
  if (accuracyTag) return t(language, "output.reason.accuracy");
  const [reasonId] = move.restrictedReasonIds || [];
  return reasonId ? t(language, `output.reason.${reasonId}`) : "";
}

function buildUnstableMoveTag(move, language, showUnstableTag) {
  if (!showUnstableTag) return "";
  const label = getUnstableMoveTag(move, language);
  if (!label) return "";
  const title = getUnstableMoveTitle(move, language);
  return `<span class="output-unstable-tag" title="${escapeHtml(title)}">${escapeHtml(label)}</span>`;
}

function buildOutputMoveToken(move, entry, state, language, showUnstableTag) {
  return `
    <span class="output-move-token">
      <strong>${escapeHtml(getLocalizedMoveName(state, move.name))}</strong>
      ${buildUnstableMoveTag(move, language, showUnstableTag)}
      ${buildSpreadTag(move.isSpread, language)}
      <span class="mini-pill">${escapeHtml(formatScore(move.score))}</span>
      ${buildInlineModifierSourceMarkup(entry, move, state, language)}
    </span>
  `;
}

function buildOutputMoveLine(label, moves, context, options = {}) {
  const {entry, state, language} = context;
  const {className = "", showUnstableTag = false} = options;
  if (!moves?.length) {
    return `<span class="output-entry-line muted">${escapeHtml(t(language, "output.noStable"))}</span>`;
  }
  return `
    <span class="output-entry-line ${escapeHtml(className)}">
      <span class="analysis-label">${escapeHtml(label)}</span>
      ${moves.map((move) => buildOutputMoveToken(move, entry, state, language, showUnstableTag)).join("")}
    </span>
  `;
}

function getOutputCardClassNames(entry) {
  const classNames = ["info-pill", "output-entry-card"];
  if (entry.isReference) classNames.push("output-entry-card-reference");
  if (entry.peakRestrictedReasonIds?.length) classNames.push("output-entry-card-restricted");
  return classNames.join(" ");
}

function renderOutputCard(entry, state, language) {
  const uniqueStableMoves = excludeDuplicateMoves(entry.peakMoves || [], entry.stableMoves || []);
  return `
    <span class="${getOutputCardClassNames(entry)}" tabindex="0">
      <span class="output-entry-card-head">
        <span class="output-entry-card-title">
          ${spriteMarkup(entry, state)}
          <strong>${escapeHtml(getLocalizedSpeciesName(state, entry))}</strong>
        </span>
        ${entry.isReference ? `<span class="source-tag output-reference-tag">${escapeHtml(entry.referenceLabel || t(language, "output.referenceTag"))}</span>` : ""}
      </span>
      ${buildOutputMoveLine(t(language, "output.peak"), entry.peakMoves || [], {entry, state, language}, {showUnstableTag: true})}
      ${uniqueStableMoves.length ? buildOutputMoveLine(t(language, "output.stable"), uniqueStableMoves, {entry, state, language}, {className: "output-entry-line-stable"}) : ""}
      ${buildOutputTooltip(entry, state, language)}
    </span>
  `;
}

export function renderOutputStrength(state) {
  const language = state.language;
  const totalEntries = state.outputStrengthTiers.reduce((sum, tier) => sum + Number(tier.totalCount || 0), 0);
  document.getElementById("output-summary").textContent = t(language, "output.summary", {
    count: state.outputStrengthTiers.length,
    entries: totalEntries,
  });
  if (!state.outputStrengthTiers.length) {
    setInnerHTMLIfChanged(document.getElementById("output-tiers"), `<p class="empty-state">${t(language, "output.empty")}</p>`);
    return;
  }
  const rows = state.outputStrengthTiers.map((tier, tierIndex) => {
    const side = tierIndex % 2 === 0 ? "side-left" : "side-right";
    return `
      <div class="output-tier-row ${side}">
        <div class="output-tier-entries">
          ${tier.entries.map((entry) => renderOutputCard(entry, state, language)).join("")}
          <span class="output-tier-count">${escapeHtml(t(language, "common.countLine", {count: tier.totalCount}))}</span>
        </div>
        <span class="output-tier-value">${escapeHtml(formatScore(tier.score))}</span>
        <span class="output-tier-dot" aria-hidden="true"></span>
      </div>
    `;
  }).join("");
  setInnerHTMLIfChanged(document.getElementById("output-tiers"), `<div class="output-timeline">${rows}</div>`);
}
