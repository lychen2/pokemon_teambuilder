import {t} from "./i18n.js";
import {setInnerHTMLIfChanged} from "./render-cache.js";
import {spriteMarkup} from "./sprites.js";
import {normalizeName} from "./utils.js";

const CONTAINER_ID = "vgcpastes-suggest";
const SUGGESTION_LIMIT = 3;
const MIN_OPPONENT_TO_SHOW = 1;

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getBaseSpeciesId(speciesId, datasets) {
  const id = normalizeName(speciesId);
  const entry = datasets?.pokedex?.[id];
  if (!entry) {
    return id;
  }
  return normalizeName(entry.baseSpecies || entry.name || id);
}

function spriteFromSpeciesId(speciesId, datasets, label) {
  const entry = datasets?.pokedex?.[speciesId];
  const spriteIndex = (datasets?.formsIndex?.[speciesId]) ?? entry?.num ?? 0;
  return spriteMarkup({
    speciesId,
    spriteSpeciesId: speciesId,
    displayName: label || entry?.name || speciesId,
    spritePosition: {
      x: (spriteIndex % 12) * 40,
      y: Math.floor(spriteIndex / 12) * 30,
    },
  }, {iconScheme: "showdown", datasets});
}

function rankSuggestions(teams, opponentSpeciesIds, datasets) {
  const targetBaseSet = new Set(opponentSpeciesIds.map((id) => getBaseSpeciesId(id, datasets)));
  const ranked = [];
  for (const team of teams) {
    const memberBaseIds = (team.memberSpeciesIds || []).map((id) => getBaseSpeciesId(id, datasets));
    const memberBaseSet = new Set(memberBaseIds);
    let overlap = 0;
    for (const id of targetBaseSet) {
      if (memberBaseSet.has(id)) overlap += 1;
    }
    if (overlap === 0) continue;
    ranked.push({team, overlap, memberBaseIds});
  }
  ranked.sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap;
    const dateA = String(a.team.dateShared || "");
    const dateB = String(b.team.dateShared || "");
    return dateB.localeCompare(dateA);
  });
  return ranked.slice(0, SUGGESTION_LIMIT);
}

function suggestionMarkup(entry, opponentSpeciesIds, state) {
  const {team, memberBaseIds} = entry;
  const language = state.language;
  const targetBaseSet = new Set(opponentSpeciesIds.map((id) => getBaseSpeciesId(id, state.datasets)));
  const memberSpriteCells = (team.memberSpeciesIds || []).map((id, idx) => {
    const baseId = memberBaseIds[idx];
    const inOpponent = targetBaseSet.has(baseId);
    const label = team.memberSpeciesNames?.[idx] || id;
    return `
      <span class="vgcpastes-suggest-sprite${inOpponent ? " matched" : ""}" title="${escapeHtml(label)}">
        ${spriteFromSpeciesId(id, state.datasets, label)}
      </span>
    `;
  }).join("");
  const description = team.description || team.teamId;
  const meta = [team.owner, team.dateShared].filter(Boolean).join(" · ");
  return `
    <li>
      <button type="button" class="vgcpastes-suggest-card" data-vgcpastes-suggest-team-id="${escapeHtml(team.teamId)}">
        <div class="vgcpastes-suggest-head">
          <strong>${escapeHtml(team.teamId)}</strong>
          <span class="vgcpastes-suggest-overlap">${escapeHtml(t(language, "vgcpastes.suggestOverlap", {count: entry.overlap, total: 6}))}</span>
        </div>
        <div class="vgcpastes-suggest-name">${escapeHtml(description)}</div>
        ${meta ? `<div class="vgcpastes-suggest-meta muted">${escapeHtml(meta)}</div>` : ""}
        <div class="vgcpastes-suggest-sprites">${memberSpriteCells}</div>
      </button>
    </li>
  `;
}

export function renderVgcpastesSuggest(state) {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) {
    return;
  }
  const opponentSpeciesIds = (state.opponentTeam || []).map((entry) => entry.speciesId).filter(Boolean);
  if (opponentSpeciesIds.length < MIN_OPPONENT_TO_SHOW || opponentSpeciesIds.length >= 6) {
    setInnerHTMLIfChanged(container, "");
    return;
  }
  const language = state.language;
  const picker = state.vgcpastesPicker || {};
  if (!picker.teams) {
    if (picker.loading) {
      setInnerHTMLIfChanged(container, `<p class="muted vgcpastes-suggest-status">${escapeHtml(t(language, "vgcpastes.loading"))}</p>`);
    } else {
      setInnerHTMLIfChanged(container, "");
    }
    return;
  }
  const ranked = rankSuggestions(picker.teams, opponentSpeciesIds, state.datasets);
  if (!ranked.length) {
    setInnerHTMLIfChanged(container, "");
    return;
  }
  setInnerHTMLIfChanged(container, `
    <div class="vgcpastes-suggest-head-row">
      <strong>${escapeHtml(t(language, "vgcpastes.suggestTitle"))}</strong>
      <span class="muted">${escapeHtml(t(language, "vgcpastes.suggestCopy"))}</span>
    </div>
    <ol class="vgcpastes-suggest-list">
      ${ranked.map((entry) => suggestionMarkup(entry, opponentSpeciesIds, state)).join("")}
    </ol>
  `);
}
