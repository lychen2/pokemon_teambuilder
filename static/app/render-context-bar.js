import {t} from "./i18n.js";
import {setInnerHTMLIfChanged} from "./render-cache.js";


const BAR_ID = "workspace-context-bar";
const FULL_TEAM_SIZE = 6;

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}


function contextActionMarkup(action, label, value, variant = "") {
  const className = variant ? ` workspace-context-chip-${variant}` : "";
  if (!action) {
    return `
      <span class="workspace-context-chip${className}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </span>
    `;
  }
  return `
    <button type="button" class="workspace-context-chip${className}" data-context-action="${action}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </button>
  `;
}

export function renderWorkspaceContextBar(state) {
  const container = document.getElementById(BAR_ID);
  if (!container) return;
  const language = state.language;
  const teamCount = `${state.team.length} / ${FULL_TEAM_SIZE}`;
  const opponentCount = `${state.opponentTeam.length} / ${FULL_TEAM_SIZE}`;
  const items = [
    contextActionMarkup("team", t(language, "context.team"), teamCount, state.team.length === FULL_TEAM_SIZE ? "ready" : ""),
  ];
  if (state.activeView === "matchup-view" || state.opponentTeam.length) {
    items.push(contextActionMarkup("opponent", t(language, "context.opponent"), opponentCount));
  }
  if (state.analysis?.identity?.primaryArchetypeId) {
    items.push(contextActionMarkup(
      "archetype",
      t(language, "context.archetype"),
      t(language, `analysis.archetype.${state.analysis.identity.primaryArchetypeId}`),
    ));
  }
  if (state.recommendFocusType) {
    items.push(contextActionMarkup("focus", t(language, "context.focus"), state.recommendFocusType, "focus"));
  }
  const markup = items.join("");
  setInnerHTMLIfChanged(container, markup);
}
