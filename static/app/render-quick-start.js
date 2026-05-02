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

function stepMarkup(done, label) {
  return `
    <span class="quick-start-step ${done ? "done" : ""}">
      <span class="quick-start-step-mark" aria-hidden="true">${done ? "OK" : ""}</span>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function templateCardMarkup(template, language) {
  const tags = template.tagKeys
    .map((key) => `<span class="mini-pill">${escapeHtml(t(language, key))}</span>`)
    .join("");
  return `
    <article class="quick-template-card">
      <div class="analysis-list-head">
        <strong>${escapeHtml(t(language, template.labelKey))}</strong>
        <button type="button" class="ghost-button mini-action" data-starter-template="${escapeHtml(template.id)}">
          ${escapeHtml(t(language, "starter.useTemplate"))}
        </button>
      </div>
      <p class="muted">${escapeHtml(t(language, template.descriptionKey))}</p>
      <div class="analysis-inline-pills">${tags}</div>
    </article>
  `;
}

function quickStartVisible(state) {
  if (state.quickStartDismissed) {
    return false;
  }
  return !state.library.length || state.team.length < 6;
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
    <section class="quick-start-card">
      <div class="section-head">
        <div>
          <p class="eyebrow">${escapeHtml(t(language, "quickStart.eyebrow"))}</p>
          <h2>${escapeHtml(t(language, "quickStart.title"))}</h2>
          <p class="muted">${escapeHtml(t(language, "quickStart.copy"))}</p>
        </div>
        <button
          type="button"
          class="ghost-button mini-action quick-start-dismiss"
          data-quick-start-action="dismiss"
          aria-label="${escapeHtml(t(language, "quickStart.dismissAria"))}"
        >${escapeHtml(t(language, "quickStart.dismiss"))}</button>
      </div>
      <div class="quick-start-steps">
        ${stepMarkup(Boolean(state.library.length), t(language, "quickStart.stepLibrary"))}
        ${stepMarkup(state.team.length === 6, t(language, "quickStart.stepTeam"))}
        ${stepMarkup(state.activeView === "analysis-view", t(language, "quickStart.stepAnalysis"))}
      </div>
      <div class="quick-start-actions">
        <button type="button" class="add-button" data-quick-start-action="load-default">${escapeHtml(t(language, "quickStart.loadDefault"))}</button>
        <button type="button" class="ghost-button" data-quick-start-action="paste-team">${escapeHtml(t(language, "quickStart.pasteTeam"))}</button>
        <button type="button" class="ghost-button" data-quick-start-action="paste-library">${escapeHtml(t(language, "quickStart.pasteLibrary"))}</button>
        <button type="button" class="ghost-button" data-quick-start-action="analysis">${escapeHtml(t(language, "quickStart.openAnalysis"))}</button>
      </div>
      <div class="quick-template-grid">
        ${STARTER_TEMPLATES.map((template) => templateCardMarkup(template, language)).join("")}
      </div>
    </section>
  `);
}
