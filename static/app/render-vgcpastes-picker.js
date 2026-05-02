import {t} from "./i18n.js";
import {setInnerHTMLIfChanged} from "./render-cache.js";
import {spriteMarkup} from "./sprites.js";
import {getItemSpritePosition, normalizeName} from "./utils.js";
import {getRoleSummaryIds, getStructureRoles, getUtilityRoles} from "./team-roles.js";
import {roleDescription, roleLabel} from "./role-ui.js";
import {filterVgcpastesTeams} from "./vgcpastes-search.js";
import {NATURE_EFFECTS} from "./constants.js";

const PICKER_CONTAINER_ID = "vgcpastes-picker";
const MEMBER_LIMIT_PER_TEAM = 6;
const ROLE_TAG_LIMIT = 4;
const TEAM_ARCHETYPE_LIMIT = 2;
const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAT_LABELS = {hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe"};
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

function localizeMove(state, name) {
  if (!name) {
    return "";
  }
  if (!isChinese(state)) {
    return name;
  }
  return state.localizedMoveNames?.get(normalizeName(name)) || name;
}

function hydrateMember(member, datasets) {
  const speciesEntry = datasets?.pokedex?.[member.speciesId] || {};
  const moves = (member.moves || []).map((moveName) => {
    const moveId = normalizeName(moveName);
    const moveData = datasets?.moves?.[moveId];
    return {
      name: moveName,
      category: moveData?.category || "Status",
    };
  });
  const baseStats = speciesEntry.baseStats || {};
  // Do NOT set `stats: baseStats` — getRoleStat would short-circuit on the raw
  // base values and skip the Champions offset / points / nature math, which
  // depresses offenseScore enough to fail hasOffensiveStatFloor and mislabel
  // hard-hitters (Tyranitar, etc.) as "纯辅助". Leaving `stats` unset lets
  // getRoleStat compute the real Champions stat from baseStats + points + nature.
  return {
    ...member,
    moves,
    moveNames: member.moves || [],
    types: speciesEntry.types || [],
    baseStats,
    ability: member.ability,
    item: member.item,
  };
}

function inferRoleTags(member, hydrated, language) {
  const speciesId = (member.speciesId || "").toLowerCase();
  const roleIds = getRoleSummaryIds(hydrated, ROLE_TAG_LIMIT);
  const roleEntries = roleIds.map((roleId) => ({
    label: roleLabel(roleId, language),
    description: roleDescription(roleId, language),
  }));
  if (speciesId.includes("mega")) {
    roleEntries.push({
      label: t(language, "vgcpastes.role.mega"),
      description: t(language, "vgcpastes.role.mega"),
    });
  }
  const seen = new Set();
  const tags = [];
  for (const entry of roleEntries) {
    if (seen.has(entry.label) || tags.length >= ROLE_TAG_LIMIT) {
      continue;
    }
    seen.add(entry.label);
    tags.push(entry);
  }
  return tags;
}

function roleTagsMarkup(tags) {
  if (!tags.length) {
    return "";
  }
  return `
    <div class="vgcpastes-member-tags">
      ${tags.map((tag) => `
        <span class="vgcpastes-role-pill" title="${escapeHtml(tag.description)}">
          ${escapeHtml(tag.label)}
        </span>
      `).join("")}
    </div>
  `;
}

function tooltipRoleMarkup(tags, language) {
  if (!tags.length) {
    return "";
  }
  return `
    <div class="vgcpastes-tooltip-roles">
      <strong>${escapeHtml(t(language, "analysis.singleSecondary"))}</strong>
      ${tags.map((tag) => `
        <span class="vgcpastes-tooltip-role" title="${escapeHtml(tag.description)}">
          ${escapeHtml(tag.label)}
        </span>
      `).join("")}
    </div>
    <div class="vgcpastes-tooltip-role-desc">
      ${tags.map((tag) => `${tag.label}: ${tag.description}`).map(escapeHtml).join(" / ")}
    </div>
  `;
}

function inferTeamArchetypes(team, language) {
  const utilityCounts = new Map();
  let sweepers = 0;
  let bulky = 0;
  for (const member of team) {
    for (const role of getUtilityRoles(member)) {
      utilityCounts.set(role, (utilityCounts.get(role) || 0) + 1);
    }
    const structure = getStructureRoles(member)[0];
    if (structure === "sweeper" || structure === "frailsweeper") sweepers += 1;
    if (structure === "tank" || structure === "bulkysupport") bulky += 1;
  }
  const archetypes = [];
  if (utilityCounts.get("trickroom") >= 1) archetypes.push("trickroom");
  if (utilityCounts.get("tailwind") >= 1 && sweepers >= 2) archetypes.push("tailwindoffense");
  if ((utilityCounts.get("pivot") || 0) >= 2 && (utilityCounts.get("fakeout") || utilityCounts.get("intimidate")) && bulky >= 2) {
    archetypes.push("pivotbalance");
  }
  if (sweepers >= 3 && [...utilityCounts.values()].filter((count) => count > 0).length <= 4) {
    archetypes.push("hyperoffense");
  }
  if (utilityCounts.get("weather") >= 1) archetypes.push("hybridspeed");
  if (!archetypes.length) archetypes.push("balanced");
  const seen = new Set();
  const labels = [];
  for (const id of archetypes) {
    if (seen.has(id) || labels.length >= TEAM_ARCHETYPE_LIMIT) {
      continue;
    }
    seen.add(id);
    labels.push(t(language, `analysis.archetype.${id}`));
  }
  return labels;
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

function natureStatClass(nature, statKey) {
  const effect = NATURE_EFFECTS[nature] || {};
  if (effect.plus === statKey) return "nature-plus";
  if (effect.minus === statKey) return "nature-minus";
  return "";
}

function tooltipMarkup(member, hydrated, tags, state) {
  const language = state.language;
  const speciesName = localizeSpecies(state, member);
  const itemLabel = localizeItem(state, member.item);
  const abilityLabel = localizeAbility(state, member.ability);
  const points = (member.points || {});
  const pointsRow = STAT_KEYS.map((key) => `
    <div class="vgcpastes-tooltip-stat">
      <span>${escapeHtml(STAT_LABELS[key])}</span>
      <strong class="${natureStatClass(member.nature, key)}">${Number(points[key] || 0)}</strong>
    </div>
  `).join("");
  const moves = (member.moves || []).map((move) => `
    <li>${escapeHtml(localizeMove(state, move))}</li>
  `).join("");
  const types = (hydrated.types || []).join(" / ");
  return `
    <div class="vgcpastes-member-tooltip">
      <div class="vgcpastes-tooltip-head">
        <strong>${escapeHtml(speciesName)}</strong>
        ${types ? `<span class="muted">${escapeHtml(types)}</span>` : ""}
      </div>
      <div class="vgcpastes-tooltip-meta">
        ${itemLabel ? `<span>${escapeHtml(t(language, "team.itemLabel") || "Item")}: ${escapeHtml(itemLabel)}</span>` : ""}
        ${abilityLabel ? `<span>${escapeHtml(t(language, "team.abilityLabel") || "Ability")}: ${escapeHtml(abilityLabel)}</span>` : ""}
      </div>
      ${tooltipRoleMarkup(tags, language)}
      <div class="vgcpastes-tooltip-stats">${pointsRow}</div>
      <ul class="vgcpastes-tooltip-moves">${moves}</ul>
    </div>
  `;
}

function memberMarkup(member, hydrated, state) {
  const language = state.language;
  const sprite = spriteMarkup(spriteConfig(member, state.datasets), state);
  const localizedItem = localizeItem(state, member.item);
  const itemIcon = itemSpriteMarkup(member.item, state.datasets, localizedItem);
  const name = localizeSpecies(state, member);
  const ability = localizeAbility(state, member.ability);
  const tags = inferRoleTags(member, hydrated, language);
  const tagsMarkup = roleTagsMarkup(tags);
  return `
    <li class="vgcpastes-member">
      <div class="vgcpastes-member-sprite">
        ${sprite}
        ${itemIcon}
      </div>
      <div class="vgcpastes-member-body">
        <div class="vgcpastes-member-name">${escapeHtml(name)}</div>
        <div class="vgcpastes-member-ability muted">${escapeHtml(ability)}</div>
        ${tagsMarkup}
      </div>
      ${tooltipMarkup(member, hydrated, tags, state)}
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
  const hydrated = members.map((member) => hydrateMember(member, state.datasets));
  const archetypes = inferTeamArchetypes(hydrated, language);
  const archetypesMarkup = archetypes.length
    ? `<div class="vgcpastes-team-archetypes">${archetypes.map((label) => `<span class="vgcpastes-archetype-pill">${escapeHtml(label)}</span>`).join("")}</div>`
    : "";
  return `
    <li>
      <button type="button" class="vgcpastes-team-card" data-vgcpastes-team-id="${escapeHtml(team.teamId)}">
        <div class="vgcpastes-team-head">
          <span class="vgcpastes-team-id">${escapeHtml(team.teamId)}</span>
          <span class="vgcpastes-team-meta muted">${escapeHtml(ownerLine)}</span>
        </div>
        <div class="vgcpastes-team-name">${escapeHtml(description)}</div>
        ${archetypesMarkup}
        <ul class="vgcpastes-member-list">
          ${members.map((member, idx) => memberMarkup(member, hydrated[idx], state)).join("")}
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
