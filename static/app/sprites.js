import {ICON_SCHEMES} from "./constants.js";

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

function pokeIconMarkup(url, label, spritePosition) {
  if (!url) {
    return "";
  }
  const fallbackPosition = spritePosition
    ? `${-spritePosition.x}px ${-spritePosition.y}px`
    : "0 0";
  return `
    <span class="sprite sprite-image" style="--fallback-position: ${fallbackPosition};" title="${escapeAttribute(label)}">
      <img class="poke-icon-image" src="${escapeAttribute(url)}" alt="" aria-hidden="true" loading="eager" decoding="async" onerror="this.parentElement.classList.add('poke-icon-error')">
    </span>
  `;
}

function getPokeIconUrl(config, datasets) {
  const speciesId = config?.spriteSpeciesId || config?.speciesId || "";
  if (!speciesId) {
    return "";
  }
  return datasets?.pokeIconMap?.[speciesId] || "";
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

export function spriteMarkup(config, state) {
  const label = getSpriteLabel(config, state);
  if (state?.iconScheme === ICON_SCHEMES.POKE_ICONS) {
    const url = getPokeIconUrl(config, state.datasets);
    if (url) {
      return pokeIconMarkup(url, label, config?.spritePosition);
    }
    return sheetSpriteMarkup(config?.spritePosition, "sprite-fallback");
  }
  return sheetSpriteMarkup(config?.spritePosition);
}
