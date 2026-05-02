import {t} from "./i18n.js";
import {setInnerHTMLIfChanged} from "./render-cache.js";
import {getTypeLabel} from "./utils.js";

const VIEW_LABEL_KEYS = Object.freeze({
  "library-view": "tabs.library",
  "analysis-view": "tabs.analysis",
  "matchup-view": "tabs.matchup",
  "recommend-view": "tabs.recommend",
  "damage-view": "tabs.damage",
  "speed-view": "tabs.speed",
  "output-view": "tabs.output",
});

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

function getViewLabel(state) {
  const key = VIEW_LABEL_KEYS[state.activeView] || VIEW_LABEL_KEYS["library-view"];
  return t(state.language, key);
}

function getArchetypeLabel(state) {
  const id = state.analysis?.identity?.primaryArchetypeId || "";
  if (!id) return t(state.language, "common.none");
  return t(state.language, `analysis.archetype.${id}`);
}

function getFocusLabel(state) {
  if (!state.recommendFocusType) return t(state.language, "common.none");
  return getTypeLabel(state.recommendFocusType, state.language);
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
  const markup = `
    ${contextActionMarkup("", t(language, "context.view"), getViewLabel(state))}
    ${contextActionMarkup("team", t(language, "context.team"), teamCount, state.team.length === FULL_TEAM_SIZE ? "ready" : "")}
    ${contextActionMarkup("opponent", t(language, "context.opponent"), opponentCount)}
    ${contextActionMarkup("archetype", t(language, "context.archetype"), getArchetypeLabel(state))}
    ${contextActionMarkup("focus", t(language, "context.focus"), getFocusLabel(state), state.recommendFocusType ? "focus" : "")}
  `;
  setInnerHTMLIfChanged(container, markup);
}
