import {TYPE_ORDER} from "./constants.js";
import {translateDamageDescription, translateDamageKoText} from "./damage-i18n.js";
import {t} from "./i18n.js";
import {getTypeLabel} from "./utils.js";

const SIDE_TOGGLE_FIELDS = [
  "reflect",
  "lightScreen",
  "auroraVeil",
  "protect",
  "helpingHand",
  "friendGuard",
  "tailwind",
  "battery",
  "powerSpot",
  "steelySpirit",
  "flowerGift",
  "stealthRock",
  "foresight",
  "gMaxField",
  "saltCure",
  "swamp",
  "seaFire",
  "redItem",
  "blueItem",
  "charge",
];
const INDEPENDENT_FIELD_KEYS = [
  "neutralizingGas",
  "fairyAura",
  "darkAura",
  "auraBreak",
  "tabletsOfRuin",
  "vesselOfRuin",
  "swordOfRuin",
  "beadsOfRuin",
];
const BOOST_FIELDS = ["atk", "def", "spa", "spd", "spe"];
const META_FIELDS = ["dynamax", "terastal", "abilityActive"];

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

function stageOptions() {
  return [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((value) => ({
    value,
    label: value > 0 ? `+${value}` : String(value),
  }));
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
      <div class="damage-field-toggles">
        ${SIDE_TOGGLE_FIELDS.map((key) => toggleMarkup(
          `${prefix}.${key}`,
          t(language, `damage.${key}`),
          side[key],
          fieldHelp(language, key),
        )).join("")}
      </div>
    </div>
  `;
}

function independentFieldMarkup(field, language) {
  return `
    <div class="damage-field-side damage-field-side-wide">
      <div class="damage-adjust-card-title">${helpLabelMarkup(t(language, "damage.independentField"), t(language, "damage.help.independentField"), "damage-section-help")}</div>
      <div class="damage-field-toggles damage-field-toggles-wide">
        ${INDEPENDENT_FIELD_KEYS.map((key) => toggleMarkup(
          `independent.${key}`,
          t(language, `damage.${key}`),
          field.independent?.[key],
          fieldHelp(language, key),
        )).join("")}
      </div>
    </div>
  `;
}

function getSummaryName(entry) {
  return entry?.config?.speciesName || entry?.config?.displayName || entry?.label || "";
}

function speedVerdictMarkup(summary, attacker, defender, language) {
  if (!summary || !attacker || !defender) {
    return "";
  }
  const leftName = getSummaryName(attacker);
  const rightName = getSummaryName(defender);
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
    <div class="damage-speed-row">
      <span class="mini-pill">${escapeHtml(`${leftName} Spe ${leftSpeed}`)}</span>
      <span class="mini-pill">${escapeHtml(`${rightName} Spe ${rightSpeed}`)}</span>
      <strong>${escapeHtml(verdict)}</strong>
    </div>
  `;
}

function adjustCardMarkup(side, entry, state, language) {
  if (!entry) {
    return "";
  }
  if (side === "attacker") {
    return `
      <div class="damage-adjust-card">
        <div class="damage-adjust-card-title">${escapeHtml(getSummaryName(entry))}</div>
        ${metaControlMarkup("attacker", state.damage.meta.attacker, language)}
        ${teraTypeMarkup("attacker", state.damage.teraTypes?.attacker || entry.config?.teraType || entry.config?.types?.[0] || "", language)}
        ${boostGridMarkup("attacker", state.damage.boosts.attacker, language)}
        <div class="damage-slider-list">
          ${sliderMarkup({key: "attackerAtk", label: t(language, "damage.attackerAtk"), value: state.damage.overrides.attackerAtk})}
          ${sliderMarkup({key: "attackerSpa", label: t(language, "damage.attackerSpa"), value: state.damage.overrides.attackerSpa})}
        </div>
      </div>
    `;
  }
  return `
    <div class="damage-adjust-card">
      <div class="damage-adjust-card-title">${escapeHtml(getSummaryName(entry))}</div>
      ${metaControlMarkup("defender", state.damage.meta.defender, language)}
      ${teraTypeMarkup("defender", state.damage.teraTypes?.defender || entry.config?.teraType || entry.config?.types?.[0] || "", language)}
      ${boostGridMarkup("defender", state.damage.boosts.defender, language)}
      <div class="damage-slider-list">
        ${sliderMarkup({key: "defenderHp", label: t(language, "damage.defenderHp"), value: state.damage.overrides.defenderHp})}
        ${sliderMarkup({key: "defenderDef", label: t(language, "damage.defenderDef"), value: state.damage.overrides.defenderDef})}
        ${sliderMarkup({key: "defenderSpd", label: t(language, "damage.defenderSpd"), value: state.damage.overrides.defenderSpd})}
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
        <label class="damage-mini-field">
          ${helpLabelMarkup(statLabel(language, stat), fieldHelp(language, `boost.${stat}`), "damage-mini-label")}
          ${numberSelectMarkup(`boosts.${role}.${stat}`, stageOptions(), boosts?.[stat] || 0)}
        </label>
      `).join("")}
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

function moveSummaryMarkup(slotMoveNames = [], summaryMoves = [], language, tone = "", side = "", picker = null) {
  return `
    <div class="stack-list damage-move-list">
      ${[0, 1, 2, 3].map((slotIndex) => {
        const slotMoveName = slotMoveNames[slotIndex] || "";
        const summaryMove = slotMoveName ? findSummaryMoveByName(summaryMoves, slotMoveName) : null;
        const isOpen = Boolean(picker && picker.side === side && picker.index === slotIndex);
        const hasMove = Boolean(slotMoveName);
        const title = hasMove ? (summaryMove?.moveName || slotMoveName) : t(language, "damage.moveSlotEmpty");
        const bodyDamage = hasMove ? (summaryMove?.damageText || t(language, "damage.noDamageText")) : "";
        const bodyKo = hasMove ? translateDamageKoText(language, summaryMove?.koText || "") : "";
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
    ? `${getSummaryName(selectedAttacker)} ↔ ${getSummaryName(selectedDefender)}`
    : t(language, "damage.summaryEmpty");
  document.getElementById("damage-controls").innerHTML = `
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
  `;
  document.getElementById("damage-field").innerHTML = `
    <div class="section-head section-head-tight"><div><h3>${t(language, "damage.fieldTitle")}</h3><p class="muted">${t(language, "damage.fieldHelp")}</p></div></div>
    <div class="damage-field-grid">
      ${sideFieldMarkup(state.damage.field.attacker, "attacker", language)}
      ${sideFieldMarkup(state.damage.field.defender, "defender", language)}
      ${independentFieldMarkup(state.damage.field, language)}
    </div>
  `;
  document.getElementById("damage-summary").innerHTML = `
    <div class="section-head section-head-tight">
      <div><h3>${t(language, "damage.summaryTitle")}</h3><p class="muted">${escapeHtml(pairTitle)}</p></div>
      ${state.damage.loading ? `<span class="source-tag">${t(language, "damage.loading")}</span>` : ""}
    </div>
    ${state.damage.error ? `<p class="empty-state">${escapeHtml(state.damage.error)}</p>` : ""}
    ${speedVerdictMarkup(summary, selectedAttacker, selectedDefender, language)}
    ${selectedAttacker && selectedDefender ? `
      <section class="damage-adjust-panel">
        <div class="damage-adjust-grid">
          ${adjustCardMarkup(primarySide, primaryEntry, state, language)}
          ${adjustCardMarkup(secondarySide, secondaryEntry, state, language)}
        </div>
      </section>
    ` : ""}
    ${headlineMarkup(headline, language)}
    ${selectedAttacker && selectedDefender ? `
      <div class="damage-summary-columns">
        <section><div class="analysis-label">${primaryTitle}</div>${moveSummaryMarkup(primarySlots, primaryMoves || [], language, "active", primarySide, picker)}</section>
        <section><div class="analysis-label">${secondaryTitle}</div>${moveSummaryMarkup(secondarySlots, secondaryMoves || [], language, "", secondarySide, picker)}</section>
      </div>
    ` : ""}
  `;
}
