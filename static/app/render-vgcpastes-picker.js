import {t} from "./i18n.js";
import {setInnerHTMLIfChanged} from "./render-cache.js";
import {spriteMarkup} from "./sprites.js";
import {getItemSpritePosition, normalizeName} from "./utils.js";
import {filterVgcpastesTeams} from "./vgcpastes-search.js";

const PICKER_CONTAINER_ID = "vgcpastes-picker";
const MEMBER_LIMIT_PER_TEAM = 6;
const TEAM_CARD_CACHE = new WeakMap();
function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isChinese(state) {
  return state.language === "zh";
}

function localizeSpecies(state, member) {
  const fallback = member.species || member.speciesId || "";
  if (!isChinese(state)) {
    return fallback;
  }
  const speciesId = member.speciesId || normalizeName(member.species || "");
  return state.localizedSpeciesNames?.get(speciesId) || fallback;
}

function localizeAbility(state, name) {
  if (!name) {
    return "";
  }
  if (!isChinese(state)) {
    return name;
  }
  return state.localizedAbilityNames?.get(normalizeName(name)) || name;
}

function localizeItem(state, name) {
  if (!name) {
    return "";
  }
  if (!isChinese(state)) {
    return name;
  }
  return state.localizedItemNames?.get(normalizeName(name)) || name;
}


function getMemberTypes(member, datasets) {
  return datasets?.pokedex?.[member.speciesId]?.types || [];
}

function spriteConfig(member, datasets) {
  const speciesId = member.speciesId || "";
  const entry = datasets?.pokedex?.[speciesId];
  const spriteIndex = (datasets?.formsIndex?.[speciesId]) ?? entry?.num ?? 0;
  return {
    speciesId,
    spriteSpeciesId: speciesId,
    displayName: member.species || speciesId,
    spritePosition: {
      x: (spriteIndex % 12) * 40,
      y: Math.floor(spriteIndex / 12) * 30,
    },
  };
}

function itemSpriteMarkup(itemName, datasets, label) {
  if (!itemName) {
    return "";
  }
  const item = datasets?.items?.[normalizeName(itemName)];
  const spriteNum = Number(item?.spritenum);
  if (!Number.isFinite(spriteNum) || spriteNum < 0) {
    return "";
  }
  const {x, y} = getItemSpritePosition(spriteNum);
  return `<span class="vgcpastes-member-item-icon item-sprite" style="background-position: ${-x}px ${-y}px" title="${escapeHtml(label || "")}"></span>`;
}

function memberMarkup(member, state) {
  const sprite = spriteMarkup(spriteConfig(member, state.datasets), state);
  const localizedItem = localizeItem(state, member.item);
  const itemIcon = itemSpriteMarkup(member.item, state.datasets, localizedItem);
  const name = localizeSpecies(state, member);
  const ability = localizeAbility(state, member.ability);
  const types = getMemberTypes(member, state.datasets);
  const typeMarkup = types.length
    ? `<div class="vgcpastes-member-types muted">${types.map(escapeHtml).join(" / ")}</div>`
    : "";
  return `
    <li class="vgcpastes-member">
      <div class="vgcpastes-member-sprite">
        ${sprite}
        ${itemIcon}
      </div>
      <div class="vgcpastes-member-body">
        <div class="vgcpastes-member-name">${escapeHtml(name)}</div>
        <div class="vgcpastes-member-ability muted">${escapeHtml(ability)}</div>
        ${typeMarkup}
      </div>
    </li>
  `;
}

function getCachedTeamCardMarkup(team, state) {
  const cacheKey = `${state.language}|${state.iconScheme || ""}`;
  const cached = TEAM_CARD_CACHE.get(team);
  if (cached && cached.key === cacheKey) {
    return cached.markup;
  }
  const markup = teamCardMarkup(team, state);
  TEAM_CARD_CACHE.set(team, {key: cacheKey, markup});
  return markup;
}

function teamCardMarkup(team, state) {
  const language = state.language;
  const description = team.description || t(language, "vgcpastes.untitledTeam");
  const ownerLine = [team.owner, team.dateShared].filter(Boolean).join(" · ");
  const members = (team.configs || []).slice(0, MEMBER_LIMIT_PER_TEAM);
  return `
    <li>
      <button type="button" class="vgcpastes-team-card" data-vgcpastes-team-id="${escapeHtml(team.teamId)}">
        <div class="vgcpastes-team-head">
          <span class="vgcpastes-team-id">${escapeHtml(team.teamId)}</span>
          <span class="vgcpastes-team-meta muted">${escapeHtml(ownerLine)}</span>
        </div>
        <div class="vgcpastes-team-name">${escapeHtml(description)}</div>
        <ul class="vgcpastes-member-list">
          ${members.map((member) => memberMarkup(member, state)).join("")}
        </ul>
      </button>
    </li>
  `;
}

function bodyMarkup(state, picker, teams) {
  const language = state.language;
  if (picker.loading) {
    return `<p class="muted">${escapeHtml(t(language, "vgcpastes.loading"))}</p>`;
  }
  if (picker.error) {
    return `<p class="muted">${escapeHtml(t(language, "vgcpastes.error"))}</p>`;
  }
  if (!teams || !teams.length) {
    return `<p class="muted">${escapeHtml(t(language, "vgcpastes.empty"))}</p>`;
  }
  return `<ol class="vgcpastes-team-list">${teams.map((team) => getCachedTeamCardMarkup(team, state)).join("")}</ol>`;
}

export function renderVgcpastesPicker(state) {
  const container = document.getElementById(PICKER_CONTAINER_ID);
  if (!container) {
    return;
  }
  const language = state.language;
  const picker = state.vgcpastesPicker || {};
  const teams = filterVgcpastesTeams(picker.teams || [], (picker.query || "").trim(), state);
  const total = (picker.teams || []).length;
  const summary = picker.open && total
    ? t(language, "vgcpastes.summaryWithCount", {count: teams.length, total})
    : t(language, "vgcpastes.title");
  setInnerHTMLIfChanged(container, `
    <details class="vgcpastes-picker"${picker.open ? " open" : ""}>
      <summary>${escapeHtml(summary)}</summary>
      <div class="vgcpastes-picker-body">
        <input type="search" id="vgcpastes-picker-search" class="vgcpastes-picker-search"
          placeholder="${escapeHtml(t(language, "vgcpastes.searchPlaceholder"))}"
          value="${escapeHtml(picker.query || "")}"/>
        ${bodyMarkup(state, picker, teams)}
      </div>
    </details>
  `);
}
