import {TYPE_ORDER} from "./constants.js";
import {translateDamageDescription, translateDamageKoText} from "./damage-i18n.js";
import {t} from "./i18n.js";
import {setInnerHTMLIfChanged} from "./render-cache.js";
import {renderDamageScanPanel} from "./damage-scan-view.js";
import {getTypeLabel, normalizeName} from "./utils.js";

const BOOST_FIELDS = ["atk", "def", "spa", "spd", "spe"];
const META_FIELDS = ["dynamax", "terastal", "abilityActive"];
const BOOST_CHIP_VALUES = [-6, -4, -2, 0, 1, 2, 4, 6];
const DAMAGE_SIDE_FIELD_GROUPS = Object.freeze([
  {id: "screens", keys: ["reflect", "lightScreen", "auroraVeil"]},
  {id: "support", keys: ["protect", "helpingHand", "friendGuard", "tailwind"]},
  {id: "auras", keys: ["battery", "powerSpot", "steelySpirit", "flowerGift"]},
  {id: "hazards", keys: ["stealthRock", "foresight", "gMaxField", "saltCure"]},
  {id: "field", keys: ["swamp", "seaFire", "redItem", "blueItem", "charge"]},
]);
const DAMAGE_INDEPENDENT_FIELD_GROUPS = Object.freeze([
  {id: "global", keys: ["neutralizingGas", "fairyAura", "darkAura", "auraBreak"]},
  {id: "ruin", keys: ["tabletsOfRuin", "vesselOfRuin", "swordOfRuin", "beadsOfRuin"]},
]);

const STATUS_IDS = [
  "Healthy",
  "Burned",
  "Poisoned",
  "Badly Poisoned",
  "Paralyzed",
  "Asleep",
  "Frozen",
];

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function optionMarkup(options = [], selectedId = "", placeholder = "") {
  const placeholderMarkup = `<option value="">${escapeHtml(placeholder)}</option>`;
  const entries = options.map((entry) => `
    <option value="${escapeHtml(entry.id)}" ${entry.id === selectedId ? 'selected="selected"' : ""}>${escapeHtml(entry.label)}</option>
  `).join("");
  return `${placeholderMarkup}${entries}`;
}

function selectMarkup(fieldKey, entries, selectedValue) {
  return `
    <select data-damage-field="${escapeHtml(fieldKey)}">
      ${entries.map((entry) => `
        <option value="${escapeHtml(entry.value)}" ${entry.value === selectedValue ? 'selected="selected"' : ""}>${escapeHtml(entry.label)}</option>
      `).join("")}
    </select>
  `;
}

function buildTextTooltipMarkup(lines = []) {
  return `
    <div class="tooltip-stack">
      ${lines.map((line) => `<div class="tooltip-desc-box">${escapeHtml(line)}</div>`).join("")}
    </div>
  `;
}

function helpLabelMarkup(label, helpText = "", className = "") {
  const classes = ["damage-help-label", className].filter(Boolean).join(" ");
  if (!helpText) {
    return `<span class="${escapeHtml(classes)}">${escapeHtml(label)}</span>`;
  }
  return `
    <span
      class="${escapeHtml(classes)}"
      tabindex="0"
      title="${escapeHtml(helpText)}"
      aria-label="${escapeHtml(`${label}: ${helpText}`)}"
    >${escapeHtml(label)}</span>
  `;
}

function toggleMarkup(key, label, checked, helpText = "") {
  const variantClass = key.endsWith(".dynamax") || key === "dynamax"
    ? "damage-toggle-pill--dynamax"
    : key.endsWith(".terastal") || key === "terastal"
      ? "damage-toggle-pill--terastal"
      : "";
  return `
    <label class="damage-toggle-pill ${variantClass}">
      <input type="checkbox" data-damage-field="${escapeHtml(key)}" ${checked ? 'checked="checked"' : ""}>
      ${helpLabelMarkup(label, helpText, "damage-toggle-label")}
    </label>
  `;
}

function sliderMarkup({key, label, value, min = 0, max = 32}) {
  return `
    <label class="damage-slider-row">
      <span class="damage-slider-label">${escapeHtml(label)}</span>
      <input type="range" min="${min}" max="${max}" step="1" value="${Number(value || 0)}" data-damage-slider="${escapeHtml(key)}">
      <strong class="damage-slider-value" data-damage-slider-value="${escapeHtml(key)}">${Number(value || 0)}</strong>
    </label>
  `;
}

function percentInputMarkup(fieldKey, value) {
  return `<input type="number" min="0" max="100" step="1" value="${Number(value || 0)}" data-damage-field="${escapeHtml(fieldKey)}">`;
}

function numberSelectMarkup(fieldKey, entries, value) {
  return `
    <select data-damage-field="${escapeHtml(fieldKey)}" data-damage-value-type="number">
      ${entries.map((entry) => `
        <option value="${escapeHtml(entry.value)}" ${Number(entry.value) === Number(value) ? 'selected="selected"' : ""}>${escapeHtml(entry.label)}</option>
      `).join("")}
    </select>
  `;
}

function statusOptions(language) {
  return STATUS_IDS.map((value) => ({
    value,
    label: t(language, `damage.status.${value}`),
  }));
}

function fieldOptions(language, key) {
  const map = {
    format: [
      {value: "Doubles", label: t(language, "damage.doubles")},
      {value: "Singles", label: t(language, "damage.singles")},
    ],
    weather: [
      {value: "", label: t(language, "damage.none")},
      {value: "Sun", label: t(language, "damage.sun")},
      {value: "Rain", label: t(language, "damage.rain")},
      {value: "Sand", label: t(language, "damage.sand")},
      {value: "Snow", label: t(language, "damage.snow")},
    ],
    terrain: [
      {value: "", label: t(language, "damage.none")},
      {value: "Electric", label: t(language, "damage.electricTerrain")},
      {value: "Grassy", label: t(language, "damage.grassyTerrain")},
      {value: "Misty", label: t(language, "damage.mistyTerrain")},
      {value: "Psychic", label: t(language, "damage.psychicTerrain")},
    ],
    spikes: [
      {value: 0, label: t(language, "damage.none")},
      {value: 1, label: "1"},
      {value: 2, label: "2"},
      {value: 3, label: "3"},
    ],
  };
  return map[key] || [];
}

function teraTypeOptions(language) {
  return TYPE_ORDER.map((type) => ({
    value: type,
    label: getTypeLabel(type, language),
  }));
}

function statLabel(language, stat) {
  return t(language, `builder.stats.${stat}`);
}

function fieldHelp(language, key) {
  return t(language, `damage.help.${key}`);
}

function sideFieldMarkup(side, prefix, language) {
  return `
    <div class="damage-field-side">
      <div class="damage-adjust-card-title">${helpLabelMarkup(t(language, `damage.${prefix}Side`), t(language, `damage.help.${prefix}Side`), "damage-section-help")}</div>
      <div class="damage-side-selects">
        <label class="damage-mini-field">
          ${helpLabelMarkup(t(language, "damage.spikes"), fieldHelp(language, "spikes"), "damage-mini-label")}
          ${numberSelectMarkup(`${prefix}.spikes`, fieldOptions(language, "spikes"), side.spikes)}
        </label>
      </div>
      ${fieldGroupMarkup(side, prefix, DAMAGE_SIDE_FIELD_GROUPS, language)}
    </div>
  `;
}

function independentFieldMarkup(field, language) {
  return `
    <div class="damage-field-side damage-field-side-wide">
      <div class="damage-adjust-card-title">${helpLabelMarkup(t(language, "damage.independentField"), t(language, "damage.help.independentField"), "damage-section-help")}</div>
      ${fieldGroupMarkup(field.independent || {}, "independent", DAMAGE_INDEPENDENT_FIELD_GROUPS, language, "damage-field-toggles-wide")}
    </div>
  `;
}

function fieldGroupMarkup(source, prefix, groups, language, className = "") {
  const pathPrefix = prefix === "independent" ? "independent" : prefix;
  return groups.map((group, index) => `
    <details class="damage-field-group" ${index === 0 ? "open" : ""}>
      <summary>${escapeHtml(t(language, `damage.fieldGroup.${group.id}`))}</summary>
      <div class="damage-field-toggles ${className}">
        ${group.keys.map((key) => toggleMarkup(
          `${pathPrefix}.${key}`,
          t(language, `damage.${key}`),
          source[key],
          fieldHelp(language, key),
        )).join("")}
      </div>
    </details>
  `).join("");
}

function getSummaryName(entry) {
  return entry?.config?.speciesName || entry?.config?.displayName || entry?.label || "";
}

function getLocalizedSpeciesName(state, entry) {
  const speciesId = entry?.config?.speciesId || "";
  const fallbackName = getSummaryName(entry);
  if (state.language !== "zh") {
    return fallbackName;
  }
  return state.localizedSpeciesNames?.get(speciesId) || fallbackName;
}

function getLocalizedMoveName(state, moveName = "") {
  if (state.language !== "zh") {
    return moveName;
  }
  return state.localizedMoveNames?.get(normalizeName(moveName)) || moveName;
}

function replaceDamageTextTokens(state, text, tokens = []) {
  let value = String(text || "");
  if (state.language !== "zh" || !value) {
    return value;
  }
  tokens
    .filter((entry) => entry?.source && entry?.target && entry.source !== entry.target)
    .sort((left, right) => right.source.length - left.source.length)
    .forEach(({source, target}) => {
      value = value.split(source).join(target);
    });
  return value;
}

function localizeDamageDescriptionText(state, text, attacker, defender, moveNames = []) {
  const tokens = [
    {source: attacker?.config?.speciesName || "", target: getLocalizedSpeciesName(state, attacker)},
    {source: defender?.config?.speciesName || "", target: getLocalizedSpeciesName(state, defender)},
    ...moveNames.map((moveName) => ({
      source: moveName,
      target: getLocalizedMoveName(state, moveName),
    })),
  ];
  return translateDamageDescription(
    state.language,
    replaceDamageTextTokens(state, text, tokens),
  );
}

function speedVerdictMarkup(state, summary, attacker, defender, language) {
  if (!summary || !attacker || !defender) {
    return "";
  }
  const leftName = getLocalizedSpeciesName(state, attacker);
  const rightName = getLocalizedSpeciesName(state, defender);
  const leftSpeed = Number(summary.attackerSpeed || 0);
  const rightSpeed = Number(summary.defenderSpeed || 0);
  let verdict = "";
  if (leftSpeed > rightSpeed) {
    verdict = t(language, "damage.speedVerdictAhead", {name: leftName, speed: leftSpeed, target: rightSpeed});
  } else if (leftSpeed < rightSpeed) {
    verdict = t(language, "damage.speedVerdictBehind", {name: rightName, speed: rightSpeed, target: leftSpeed});
  } else {
    verdict = t(language, "damage.speedVerdictTie", {speed: leftSpeed});
  }
  return `
    <div class="damage-speed-verdict">
      <strong>${escapeHtml(t(language, "common.speed"))}</strong>
      <span>${escapeHtml(verdict)}</span>
    </div>
  `;
}

function adjustCardMarkup(side, entry, state, language, mode = "offense") {
  if (!entry) {
    return "";
  }
  const title = getLocalizedSpeciesName(state, entry);
  if (mode === "offense") {
    return `
      <div class="damage-adjust-card">
        <div class="damage-adjust-card-title">${escapeHtml(title)}</div>
        ${metaControlMarkup(side, state.damage.meta?.[side], language)}
        ${teraTypeMarkup(side, state.damage.teraTypes?.[side] || entry.config?.teraType || entry.config?.types?.[0] || "", language)}
        ${boostGridMarkup(side, state.damage.boosts?.[side], language)}
        <div class="damage-slider-list">
          ${sliderMarkup({key: `${side}Atk`, label: t(language, "damage.pointAtk"), value: state.damage.overrides[`${side}Atk`]})}
          ${sliderMarkup({key: `${side}Spa`, label: t(language, "damage.pointSpa"), value: state.damage.overrides[`${side}Spa`]})}
        </div>
      </div>
    `;
  }
  return `
    <div class="damage-adjust-card">
      <div class="damage-adjust-card-title">${escapeHtml(title)}</div>
      ${metaControlMarkup(side, state.damage.meta?.[side], language)}
      ${teraTypeMarkup(side, state.damage.teraTypes?.[side] || entry.config?.teraType || entry.config?.types?.[0] || "", language)}
      ${boostGridMarkup(side, state.damage.boosts?.[side], language)}
      <div class="damage-slider-list">
        ${sliderMarkup({key: `${side}Hp`, label: t(language, "damage.pointHp"), value: state.damage.overrides[`${side}Hp`]})}
        ${sliderMarkup({key: `${side}Def`, label: t(language, "damage.pointDef"), value: state.damage.overrides[`${side}Def`]})}
        ${sliderMarkup({key: `${side}Spd`, label: t(language, "damage.pointSpd"), value: state.damage.overrides[`${side}Spd`]})}
      </div>
    </div>
  `;
}

function metaControlMarkup(role, meta, language) {
  return `
    <div class="damage-meta-row">
      ${META_FIELDS.map((field) => toggleMarkup(
        `meta.${role}.${field}`,
        t(language, `damage.${field}`),
        meta?.[field],
        fieldHelp(language, field),
      )).join("")}
    </div>
  `;
}

function teraTypeMarkup(role, teraType, language) {
  return `
    <label class="damage-mini-field">
      ${helpLabelMarkup(t(language, "damage.teraType"), fieldHelp(language, "teraType"), "damage-mini-label")}
      <select data-damage-field="teraTypes.${escapeHtml(role)}">
        ${teraTypeOptions(language).map((entry) => `
          <option value="${escapeHtml(entry.value)}" ${entry.value === teraType ? 'selected="selected"' : ""}>${escapeHtml(entry.label)}</option>
        `).join("")}
      </select>
    </label>
  `;
}

function boostGridMarkup(role, boosts, language) {
  return `
    <div class="damage-boost-grid">
      ${BOOST_FIELDS.map((stat) => `
        ${boostChipGroupMarkup(role, stat, boosts?.[stat] || 0, language)}
      `).join("")}
    </div>
    <div class="damage-boost-actions">
      <button type="button" class="ghost-button mini-action" data-damage-boost-reset="${escapeHtml(role)}">${t(language, "damage.boostReset")}</button>
      <button type="button" class="ghost-button mini-action" data-damage-boost-preset="${escapeHtml(role)}:atk:2">${t(language, "damage.boostPresetSwords")}</button>
      <button type="button" class="ghost-button mini-action" data-damage-boost-preset="${escapeHtml(role)}:spa:2">${t(language, "damage.boostPresetSpecial")}</button>
      <button type="button" class="ghost-button mini-action" data-damage-boost-preset="${escapeHtml(role)}:spe:2">${t(language, "damage.boostPresetSpeed")}</button>
    </div>
  `;
}

function findSummaryMoveByName(summaryMoves = [], moveName = "") {
  const target = String(moveName || "").trim().toLowerCase();
  if (!target) return null;
  return summaryMoves.find((entry) => String(entry?.moveName || "").trim().toLowerCase() === target)
    || summaryMoves.find((entry) => String(entry?.moveName || "").trim().toLowerCase().includes(target))
    || null;
}

function boostChipGroupMarkup(role, stat, value, language) {
  const label = statLabel(language, stat);
  return `
    <div class="damage-boost-chip-field">
      <div
        class="damage-mini-label damage-boost-label"
        title="${escapeHtml(label)}"
        aria-label="${escapeHtml(`${label}: ${fieldHelp(language, `boost.${stat}`)}`)}"
      >${escapeHtml(label)}</div>
      <select
        class="damage-boost-select"
        data-damage-boost-select="${escapeHtml(`${role}.${stat}`)}"
        aria-label="${escapeHtml(label)}"
      >
        ${BOOST_CHIP_VALUES.map((stage) => `
          <option value="${stage}" ${Number(value) === stage ? 'selected="selected"' : ""}>${stage > 0 ? `+${stage}` : stage}</option>
        `).join("")}
      </select>
    </div>
  `;
}

function pickerPanelMarkup(side, slotIndex, picker, language) {
  return `
    <div class="damage-move-picker">
      <input
        type="search"
        class="damage-move-picker-input"
        data-damage-move-picker-input
        data-damage-move-side="${escapeHtml(side)}"
        data-damage-move-index="${slotIndex}"
        value="${escapeHtml(picker.query || "")}"
        placeholder="${escapeHtml(t(language, "damage.movePickerPlaceholder"))}"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
      >
      <div
        class="builder-autocomplete-panel damage-move-picker-panel"
        data-damage-move-picker-panel
        data-damage-move-side="${escapeHtml(side)}"
        data-damage-move-index="${slotIndex}"
        hidden
      ></div>
    </div>
  `;
}

function damageBarMarkup(summaryMove, defenderHpPercent) {
  const maxPct = Number(summaryMove?.maxPercent || 0);
  if (!maxPct) return "";
  const minPct = Number(summaryMove?.minPercent || 0);
  const cappedMin = Math.max(0, Math.min(100, minPct));
  const cappedMax = Math.max(cappedMin, Math.min(100, maxPct));
  const tone = maxPct >= 100 ? "lethal" : maxPct >= 50 ? "bad" : maxPct >= 25 ? "warn" : "good";
  const hp = Math.max(0, Math.min(100, Number(defenderHpPercent || 0)));
  const width = Math.max(2, cappedMax - cappedMin);
  const label = minPct === maxPct ? `${minPct}%` : `${minPct}% – ${maxPct}%`;
  return `
    <div class="damage-bar" data-damage-tone="${tone}" title="${escapeHtml(label)}">
      <div class="damage-bar-track">
        <span class="damage-bar-fill" style="left:${cappedMin}%; width:${width}%;"></span>
        <span class="damage-bar-hp" style="left:${hp}%;"></span>
      </div>
      <strong class="damage-bar-value">${escapeHtml(label)}</strong>
    </div>
  `;
}

function moveSummaryMarkup(slotMoveNames = [], summaryMoves = [], language, tone = "", side = "", picker = null, defenderHpPercent = 100) {
  return `
    <div class="stack-list damage-move-list">
      ${[0, 1, 2, 3].map((slotIndex) => {
        const slotMoveName = slotMoveNames[slotIndex] || "";
        const summaryMove = slotMoveName ? findSummaryMoveByName(summaryMoves, slotMoveName) : null;
        const isOpen = Boolean(picker && picker.side === side && picker.index === slotIndex);
        const hasMove = Boolean(slotMoveName);
        const title = hasMove ? (summaryMove?.moveName || slotMoveName) : t(language, "damage.moveSlotEmpty");
        const bodyDamage = hasMove ? translateDamageDescription(language, summaryMove?.damageText || t(language, "damage.noDamageText")) : "";
        const bodyKo = hasMove ? translateDamageKoText(language, summaryMove?.koText || "") : "";
        const barMarkup = hasMove ? damageBarMarkup(summaryMove, defenderHpPercent) : "";
        const cardClasses = ["entry-card", "compact", "damage-move-card"];
        if (tone) cardClasses.push(tone);
        if (isOpen) cardClasses.push("damage-move-card-editing");
        if (!hasMove) cardClasses.push("damage-move-card-empty");
        return `
          <article class="${cardClasses.join(" ")}">
            <button
              type="button"
              class="damage-move-card-body"
              data-damage-move-edit
              data-damage-move-side="${escapeHtml(side)}"
              data-damage-move-index="${slotIndex}"
              title="${escapeHtml(t(language, "damage.moveEditHint"))}"
            >
              <div class="entry-main">
                <div class="entry-title"><strong>${escapeHtml(title)}</strong></div>
                ${bodyDamage ? `<p class="muted">${escapeHtml(bodyDamage)}</p>` : ""}
                ${barMarkup}
                ${bodyKo ? `<p class="muted">${escapeHtml(bodyKo)}</p>` : ""}
              </div>
            </button>
            ${isOpen ? pickerPanelMarkup(side, slotIndex, picker, language) : ""}
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function focusButtonMarkup(language, activeSide) {
  return `
    <div class="damage-direction-row">
      <button type="button" class="${activeSide === "attacker" ? "active" : ""}" data-damage-focus-side="attacker">${t(language, "damage.focusAttacker")}</button>
      <button type="button" class="${activeSide === "defender" ? "active" : ""}" data-damage-focus-side="defender">${t(language, "damage.focusDefender")}</button>
    </div>
  `;
}

function headlineMarkup(headline, language) {
  if (!headline) {
    return `<p class="empty-state">${t(language, "damage.summaryHint")}</p>`;
  }
  const match = /^(.*?):\s*(.+?)\s*(?:--|—|–)\s*(.+)$/.exec(headline);
  if (!match) {
    return `<p class="damage-summary-headline">${escapeHtml(translateDamageDescription(language, headline))}</p>`;
  }
  const [, desc, damage, ko] = match;
  return `<p class="damage-summary-headline">
    <span class="damage-part-desc">${escapeHtml(translateDamageDescription(language, desc))}</span>:
    <span class="damage-part-damage">${escapeHtml(damage.trim())}</span>
    — <span class="damage-part-ko">${escapeHtml(translateDamageKoText(language, ko.trim()))}</span>
  </p>`;
}

export function renderDamageView(state) {
  const language = state.language;
  const summary = state.damage.result;
  const activeSide = state.damage.focusSide;
  const showingAttacker = activeSide !== "defender";
  const selectedAttacker = state.damageAttackers.find((entry) => entry.id === state.damage.attackerId);
  const selectedDefender = state.damageDefenders.find((entry) => entry.id === state.damage.defenderId);
  const primaryMoves = showingAttacker ? summary?.leftMoves : summary?.rightMoves;
  const secondaryMoves = showingAttacker ? summary?.rightMoves : summary?.leftMoves;
  const headline = showingAttacker ? summary?.leftHeadline : summary?.rightHeadline;
  const primaryTitle = showingAttacker ? t(language, "damage.attackerMoves") : t(language, "damage.defenderMoves");
  const secondaryTitle = showingAttacker ? t(language, "damage.defenderMoves") : t(language, "damage.attackerMoves");
  const displayMoveNames = state.damage.displayMoveNames || {attacker: [], defender: []};
  const picker = state.damage.movePicker?.index >= 0 ? state.damage.movePicker : null;
  const primarySide = showingAttacker ? "attacker" : "defender";
  const secondarySide = showingAttacker ? "defender" : "attacker";
  const primarySlots = displayMoveNames[primarySide] || [];
  const secondarySlots = displayMoveNames[secondarySide] || [];
  const primaryEntry = primarySide === "attacker" ? selectedAttacker : selectedDefender;
  const secondaryEntry = secondarySide === "attacker" ? selectedAttacker : selectedDefender;
  const pairTitle = selectedAttacker && selectedDefender
    ? `${getLocalizedSpeciesName(state, selectedAttacker)} ↔ ${getLocalizedSpeciesName(state, selectedDefender)}`
    : t(language, "damage.summaryEmpty");
  setInnerHTMLIfChanged(document.getElementById("damage-controls"), `
    <div class="analysis-detail-grid damage-control-grid">
      <label><span>${t(language, "damage.attackerLabel")}</span><select id="damage-attacker-select">${optionMarkup(state.damageAttackers, state.damage.attackerId, t(language, "damage.attackerPlaceholder"))}</select></label>
      <label><span>${t(language, "damage.attackerStatusLabel")}</span>${selectMarkup("statuses.attacker", statusOptions(language), state.damage.statuses.attacker)}</label>
      <label><span>${t(language, "damage.attackerHpPercentLabel")}</span>${percentInputMarkup("healthPercent.attacker", state.damage.healthPercent.attacker)}</label>
      <label><span>${t(language, "damage.defenderLabel")}</span><select id="damage-defender-select">${optionMarkup(state.damageDefenders, state.damage.defenderId, t(language, "damage.defenderPlaceholder"))}</select></label>
      <label><span>${t(language, "damage.defenderStatusLabel")}</span>${selectMarkup("statuses.defender", statusOptions(language), state.damage.statuses.defender)}</label>
      <label><span>${t(language, "damage.defenderHpPercentLabel")}</span>${percentInputMarkup("healthPercent.defender", state.damage.healthPercent.defender)}</label>
      <label><span>${t(language, "damage.formatLabel")}</span>${selectMarkup("format", fieldOptions(language, "format"), state.damage.field.format)}</label>
      <label><span>${t(language, "damage.weatherLabel")}</span>${selectMarkup("weather", fieldOptions(language, "weather"), state.damage.field.weather)}</label>
      <label><span>${t(language, "damage.terrainLabel")}</span>${selectMarkup("terrain", fieldOptions(language, "terrain"), state.damage.field.terrain)}</label>
      <div class="damage-inline-toggle">${toggleMarkup("gravity", t(language, "damage.gravity"), state.damage.field.gravity)}</div>
    </div>
    <div class="action-row damage-actions">
      ${focusButtonMarkup(language, activeSide)}
      <button type="button" data-sync-damage-workspace ${state.damage.loading ? 'disabled="disabled"' : ""}>${t(language, "damage.syncButton")}</button>
    </div>
    <p class="muted">${t(language, "damage.controlsHelp")}</p>
  `);
  setInnerHTMLIfChanged(document.getElementById("damage-field"), `
    <div class="section-head section-head-tight"><div><h3>${t(language, "damage.fieldTitle")}</h3><p class="muted">${t(language, "damage.fieldHelp")}</p></div></div>
    <div class="damage-field-grid">
      ${sideFieldMarkup(state.damage.field.attacker, "attacker", language)}
      ${sideFieldMarkup(state.damage.field.defender, "defender", language)}
      ${independentFieldMarkup(state.damage.field, language)}
    </div>
  `);
  setInnerHTMLIfChanged(document.getElementById("damage-summary"), `
    <div class="section-head section-head-tight">
      <div><h3>${t(language, "damage.summaryTitle")}</h3><p class="muted">${escapeHtml(pairTitle)}</p></div>
      ${state.damage.loading ? `<span class="source-tag">${t(language, "damage.loading")}</span>` : ""}
    </div>
    ${state.damage.error ? `<p class="empty-state">${escapeHtml(state.damage.error)}</p>` : ""}
    ${speedVerdictMarkup(state, summary, selectedAttacker, selectedDefender, language)}
    ${selectedAttacker && selectedDefender ? `
      <section class="damage-adjust-panel">
        <div class="damage-adjust-grid">
          ${adjustCardMarkup(primarySide, primaryEntry, state, language, "offense")}
          ${adjustCardMarkup(secondarySide, secondaryEntry, state, language, "defense")}
        </div>
      </section>
    ` : ""}
    ${headlineMarkup(
      localizeDamageDescriptionText(
        state,
        headline,
        selectedAttacker,
        selectedDefender,
        [
          ...(displayMoveNames.attacker || []),
          ...(displayMoveNames.defender || []),
          ...((summary?.leftMoves || []).map((entry) => entry?.moveName).filter(Boolean)),
          ...((summary?.rightMoves || []).map((entry) => entry?.moveName).filter(Boolean)),
        ],
      ),
      language,
    )}
    ${selectedAttacker && selectedDefender ? `
      <div class="damage-summary-columns">
        <section><div class="analysis-label">${primaryTitle}</div>${moveSummaryMarkup(primarySlots, primaryMoves || [], language, "active", primarySide, picker, state.damage.healthPercent?.[primarySide === "attacker" ? "defender" : "attacker"])}</section>
        <section><div class="analysis-label">${secondaryTitle}</div>${moveSummaryMarkup(secondarySlots, secondaryMoves || [], language, "", secondarySide, picker, state.damage.healthPercent?.[secondarySide === "attacker" ? "defender" : "attacker"])}</section>
      </div>
    ` : ""}
  `);
  setInnerHTMLIfChanged(document.getElementById("damage-scan"), renderDamageScanPanel(state));
}
