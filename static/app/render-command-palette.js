import {t} from "./i18n.js";
import {setInnerHTMLIfChanged} from "./render-cache.js";

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function applyRanges(label, ranges) {
  if (!ranges?.length) return escapeHtml(label);
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let out = "";
  let cursor = 0;
  for (const [start, end] of sorted) {
    if (start < cursor) continue;
    out += escapeHtml(label.slice(cursor, start));
    out += `<mark>${escapeHtml(label.slice(start, end))}</mark>`;
    cursor = end;
  }
  out += escapeHtml(label.slice(cursor));
  return out;
}

function renderList(results, language, selectedIndex) {
  if (!results.length) {
    return `<div class="command-palette-empty">${escapeHtml(t(language, "palette.empty"))}</div>`;
  }
  return results.map((entry, index) => {
    const label = t(language, entry.command.labelKey);
    const activeClass = index === selectedIndex ? "active" : "";
    return `
      <button type="button" class="command-palette-item ${activeClass}" data-command-index="${index}">
        <span class="cmd-label">${applyRanges(label, entry.ranges)}</span>
      </button>
    `;
  }).join("");
}

export function renderCommandPalette(palette, language) {
  const modal = document.getElementById("command-palette-modal");
  const list = document.getElementById("command-palette-list");
  const input = document.getElementById("command-palette-input");
  if (!modal || !list || !input) {
    return;
  }
  modal.hidden = !palette.store.open;
  if (!palette.store.open) {
    return;
  }
  if (input.value !== palette.store.query) {
    input.value = palette.store.query;
  }
  input.placeholder = t(language, "palette.placeholder");
  const results = palette.getResults();
  setInnerHTMLIfChanged(list, renderList(results, language, palette.store.selectedIndex));
  const activeItem = list.querySelector(".command-palette-item.active");
  if (activeItem) {
    activeItem.scrollIntoView({block: "nearest"});
  }
}

export function focusCommandPaletteInput() {
  const input = document.getElementById("command-palette-input");
  if (input) {
    input.focus();
    input.select();
  }
}

export function installCommandPalette({state, palette, render, language}) {
  const modal = document.getElementById("command-palette-modal");
  if (!modal) return;
  const input = document.getElementById("command-palette-input");
  const list = document.getElementById("command-palette-list");
  function rerender() {
    render(palette, language());
  }
  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-palette]") || event.target.classList.contains("modal-backdrop")) {
      palette.closePalette();
      rerender();
    }
  });
  input.addEventListener("input", () => {
    palette.setQuery(input.value);
    rerender();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      palette.move(1);
      rerender();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      palette.move(-1);
      rerender();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      palette.execute();
      rerender();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      palette.closePalette();
      rerender();
    }
  });
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-command-index]");
    if (!button) return;
    const index = Number(button.dataset.commandIndex);
    palette.execute(index);
    rerender();
  });
}
