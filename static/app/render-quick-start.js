import {t} from "./i18n.js";
import {setInnerHTMLIfChanged} from "./render-cache.js";
import {STARTER_TEMPLATES} from "./starter-templates.js";

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}


function quickStartVisible(state) {
  if (state.quickStartDismissed || state.activeView !== "library-view") {
    return false;
  }
  return !state.library.length || !state.team.length;
}

export function renderQuickStart(state) {
  const container = document.getElementById("quick-start-panel");
  if (!container) {
    return;
  }
  if (!quickStartVisible(state)) {
    container.hidden = true;
    setInnerHTMLIfChanged(container, "");
    return;
  }
  const language = state.language;
  container.hidden = false;
  setInnerHTMLIfChanged(container, `
    <section class="quick-start-card${!state.team.length ? " quick-start-empty-team" : ""}">
      <div class="quick-start-main">
        <div>
          <span class="quick-start-eyebrow">${escapeHtml(t(language, "quickStart.eyebrow"))}</span>
          <h2>${escapeHtml(!state.team.length ? t(language, "quickStart.emptyTeamTitle") : t(language, "quickStart.title"))}</h2>
          <p class="muted">${escapeHtml(!state.team.length ? t(language, "quickStart.emptyTeamCopy") : t(language, "quickStart.copy"))}</p>
        </div>
        <button
          type="button"
          class="ghost-button mini-action quick-start-dismiss"
          data-quick-start-action="dismiss"
          aria-label="${escapeHtml(t(language, "quickStart.dismissAria"))}"
        >${escapeHtml(t(language, "quickStart.dismiss"))}</button>
      </div>
      <div class="quick-start-actions">
        <button type="button" class="add-button" data-quick-start-action="load-default">${escapeHtml(t(language, "quickStart.loadDefault"))}</button>
        <button type="button" class="ghost-button" data-quick-start-action="paste-team">${escapeHtml(t(language, "quickStart.pasteTeam"))}</button>
        <button type="button" class="ghost-button" data-quick-start-action="paste-library">${escapeHtml(t(language, "quickStart.pasteLibrary"))}</button>
        <button type="button" class="ghost-button" data-quick-start-action="analysis">${escapeHtml(t(language, "quickStart.openAnalysis"))}</button>
      </div>
      <details class="quick-template-picker">
        <summary>${escapeHtml(t(language, "quickStart.templates"))}</summary>
        <div class="quick-template-actions">
          ${STARTER_TEMPLATES.map((template) => `
            <button type="button" class="ghost-button" data-starter-template="${escapeHtml(template.id)}">
              ${escapeHtml(t(language, template.labelKey))}
            </button>
          `).join("")}
        </div>
      </details>
    </section>
  `);
}
