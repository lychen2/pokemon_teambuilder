import {ICON_SCHEMES} from "./constants.js";
import {getTypeLabel} from "./utils.js";

function escapeAttribute(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function sheetSpriteMarkup(spritePosition, className = "") {
  if (!spritePosition) {
    return "";
  }
  const {x, y} = spritePosition;
  const classes = ["sprite", className].filter(Boolean).join(" ");
  return `<span class="${classes}" style="background-position: ${-x}px ${-y}px"></span>`;
}

function standaloneIconMarkup(url, label, spritePosition, className = "") {
  if (!url) {
    return "";
  }
  const fallbackPosition = spritePosition
    ? `${-spritePosition.x}px ${-spritePosition.y}px`
    : "0 0";
  return `
    <span class="sprite sprite-image ${escapeAttribute(className)}" style="--fallback-position: ${fallbackPosition};" title="${escapeAttribute(label)}">
      <img class="poke-icon-image" src="${escapeAttribute(url)}" alt="" aria-hidden="true" loading="lazy" decoding="async" onload="this.parentElement.classList.add('poke-icon-loaded')" onerror="this.parentElement.classList.add('poke-icon-error')">
    </span>
  `;
}

function getStandalonePokemonIconUrl(config, datasets, iconScheme) {
  const speciesId = config?.spriteSpeciesId || config?.speciesId || "";
  if (!speciesId) {
    return "";
  }
  if (iconScheme === ICON_SCHEMES.CHAMPIONS_OFFICIAL) {
    return datasets?.championsIconMaps?.pokemon?.[speciesId] || "";
  }
  return datasets?.pokeIconMap?.[speciesId] || "";
}

function getStandaloneItemIconEntry(itemId, datasets) {
  return datasets?.championsIconMaps?.items?.[itemId] || null;
}

function getSpriteLabel(config, state) {
  const speciesId = config?.speciesId || config?.spriteSpeciesId || "";
  if (state?.language === "zh" && speciesId) {
    const localized = state?.localizedSpeciesNames?.get(speciesId) || state?.datasets?.localizedSpeciesNames?.get(speciesId);
    if (localized) {
      return localized;
    }
  }
  return config?.displayName || config?.speciesName || config?.speciesId || "Pokemon";
}

function typeKey(type) {
  return String(type || "").trim().toLowerCase();
}

export function typeIconUrl(type) {
  const key = typeKey(type);
  if (!key) {
    return "";
  }
  return `./static/team-planner-assets/type/${key}.png`;
}

export function typeSymbolUrl(type) {
  const key = typeKey(type);
  if (!key) {
    return "";
  }
  return `./static/team-planner-assets/type/${key}_sym.png`;
}

/** Localized type chip: symbol icon + translated label (never English-only banners). */
export function typeBadgeMarkup(type, language = "zh", className = "") {
  if (!type) {
    return "";
  }
  const key = typeKey(type);
  const label = getTypeLabel(type, language);
  const symbol = typeSymbolUrl(type);
  const classes = ["type-badge", `type-${key}`, className].filter(Boolean).join(" ");
  return `
    <span class="${escapeAttribute(classes)}" title="${escapeAttribute(label)}">
      <img class="type-badge-symbol" src="${escapeAttribute(symbol)}" alt="" aria-hidden="true" loading="lazy" decoding="async" onerror="this.remove()">
      <span class="type-badge-label">${escapeAttribute(label)}</span>
    </span>
  `;
}

export function typeSymbolMarkup(type, language = "zh", className = "") {
  if (!type) {
    return "";
  }
  const key = typeKey(type);
  const label = getTypeLabel(type, language);
  const symbol = typeSymbolUrl(type);
  const classes = ["type-symbol", `type-${key}`, className].filter(Boolean).join(" ");
  return `
    <span class="${escapeAttribute(classes)}" title="${escapeAttribute(label)}">
      <img class="type-symbol-img" src="${escapeAttribute(symbol)}" alt="" aria-hidden="true" loading="lazy" decoding="async" onerror="this.style.display='none'">
      <span class="type-symbol-label">${escapeAttribute(label)}</span>
    </span>
  `;
}

export function itemIconMarkup(itemInfo, state, className = "") {
  const itemId = itemInfo?.id || itemInfo?.key || "";
  if (state?.iconScheme !== ICON_SCHEMES.CHAMPIONS_OFFICIAL || !itemId) {
    return "";
  }
  const iconEntry = getStandaloneItemIconEntry(itemId, state?.datasets);
  if (!iconEntry || !iconEntry.url) {
    return "";
  }
  const label = itemInfo.localizedName || itemInfo.name || itemId;
  const classes = ["item-icon", className].filter(Boolean).join(" ");
  return `
    <span class="${escapeAttribute(classes)}" title="${escapeAttribute(label)}">
      <img class="item-icon-image" src="${escapeAttribute(iconEntry.url)}" alt="" aria-hidden="true" loading="lazy" decoding="async">
    </span>
  `;
}

export function spriteMarkup(config, state) {
  const label = getSpriteLabel(config, state);
  if (state?.iconScheme === ICON_SCHEMES.POKE_ICONS || state?.iconScheme === ICON_SCHEMES.CHAMPIONS_OFFICIAL) {
    const url = getStandalonePokemonIconUrl(config, state.datasets, state.iconScheme);
    if (url) {
      return standaloneIconMarkup(url, label, config?.spritePosition);
    }
    return sheetSpriteMarkup(config?.spritePosition, "sprite-fallback");
  }
  return sheetSpriteMarkup(config?.spritePosition);
}
