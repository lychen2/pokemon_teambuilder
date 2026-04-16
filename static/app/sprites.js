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

function pokeIconMarkup(url, label) {
  if (!url) {
    return "";
  }
  return `
    <span class="sprite sprite-image">
      <img class="poke-icon-image" src="${escapeAttribute(url)}" alt="${escapeAttribute(label)}" loading="lazy">
    </span>
  `;
}

function getPokeIconUrl(config, datasets) {
  if (!config?.speciesId) {
    return "";
  }
  return datasets?.pokeIconMap?.[config.speciesId] || "";
}

export function spriteMarkup(config, state) {
  const label = config?.displayName || config?.speciesName || config?.speciesId || "Pokemon";
  if (state?.iconScheme === ICON_SCHEMES.POKE_ICONS) {
    const url = getPokeIconUrl(config, state.datasets);
    if (url) {
      return pokeIconMarkup(url, label);
    }
    return sheetSpriteMarkup(config?.spritePosition, "sprite-fallback");
  }
  return sheetSpriteMarkup(config?.spritePosition);
}
