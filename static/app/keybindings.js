import {isTypingTarget} from "./utils.js";

const VIEW_KEYS = {
  "1": "library-view",
  "2": "analysis-view",
  "3": "matchup-view",
  "4": "recommend-view",
  "5": "damage-view",
  "6": "speed-view",
};

const SEARCH_INPUT_BY_VIEW = {
  "matchup-view": "matchup-search",
};

function isElementVisible(el) {
  if (!el) return false;
  if (el.hasAttribute("hidden")) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function focusAndSelect(el) {
  el.focus();
  if (typeof el.select === "function") {
    try { el.select(); } catch (_) { /* no-op */ }
  }
}

export function focusSearchForView(viewId) {
  const preferredId = SEARCH_INPUT_BY_VIEW[viewId];
  if (preferredId) {
    const el = document.getElementById(preferredId);
    if (isElementVisible(el)) {
      focusAndSelect(el);
      return true;
    }
  }
  const candidates = Array.from(document.querySelectorAll('input[type="search"]'));
  const visible = candidates.find(isElementVisible);
  if (visible) {
    focusAndSelect(visible);
    return true;
  }
  return false;
}

function openShortcutsHelp() {
  const modal = document.getElementById("shortcuts-help-modal");
  if (!modal) return;
  modal.hidden = false;
  const closeButton = modal.querySelector("[data-close-shortcuts]");
  closeButton?.focus();
}

export function closeShortcutsHelp() {
  const modal = document.getElementById("shortcuts-help-modal");
  if (!modal) return;
  modal.hidden = true;
}

function isModalOpen() {
  return Boolean(
    document.querySelector(".modal-shell:not([hidden])"),
  );
}

function handleKeydown(event, actions) {
  if (event.defaultPrevented) {
    return;
  }
  const key = event.key;
  const lowerKey = String(key || "").toLowerCase();
  const ctrlOrMeta = event.ctrlKey || event.metaKey;

  if (key === "Escape") {
    const modal = document.getElementById("shortcuts-help-modal");
    if (modal && !modal.hidden) {
      event.preventDefault();
      closeShortcutsHelp();
      return;
    }
  }

  if (ctrlOrMeta && !event.altKey && !event.shiftKey && lowerKey === "k") {
    event.preventDefault();
    actions.openCommandPalette?.();
    return;
  }

  if (ctrlOrMeta && !event.altKey && !event.shiftKey && lowerKey === "s") {
    event.preventDefault();
    actions.saveCurrentTeam?.();
    return;
  }

  if (ctrlOrMeta && !event.altKey && lowerKey === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      actions.redoStateChange?.();
      return;
    }
    actions.undoStateChange?.();
    return;
  }

  if (ctrlOrMeta && !event.altKey && !event.shiftKey && lowerKey === "y") {
    event.preventDefault();
    actions.redoStateChange?.();
    return;
  }

  if (isTypingTarget(event.target) || isModalOpen()) {
    return;
  }

  if (VIEW_KEYS[key]) {
    event.preventDefault();
    actions.setActiveView?.(VIEW_KEYS[key]);
    return;
  }

  if (key === "/") {
    event.preventDefault();
    const viewId = actions.getActiveView?.() || "library-view";
    focusSearchForView(viewId);
    return;
  }

  if (key === "?" || (event.shiftKey && key === "/")) {
    event.preventDefault();
    openShortcutsHelp();
  }
}

export function installKeybindings(actions = {}) {
  document.addEventListener("keydown", (event) => handleKeydown(event, actions));
  const modal = document.getElementById("shortcuts-help-modal");
  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-shortcuts]") || event.target.classList.contains("modal-backdrop")) {
        closeShortcutsHelp();
      }
    });
  }
}

export {openShortcutsHelp};
