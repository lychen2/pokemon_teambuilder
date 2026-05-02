import {normalizeLookupText} from "./utils.js";

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function mergeRanges(ranges = []) {
  if (!ranges.length) {
    return [];
  }
  const sorted = [...ranges].sort((left, right) => left[0] - right[0]);
  const merged = [sorted[0]];
  for (const [start, end] of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

function buildHighlightRanges(label = "", query = "") {
  const tokens = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!label || !tokens.length) {
    return [];
  }
  const lowered = String(label).toLowerCase();
  return mergeRanges(tokens.map((token) => {
    const index = lowered.indexOf(token);
    return index >= 0 ? [index, index + token.length] : null;
  }).filter(Boolean));
}

export function resolveSearchMatch(fields = [], query = "") {
  const rawQuery = String(query || "").trim();
  const searchToken = normalizeLookupText(rawQuery);
  if (!searchToken) {
    return null;
  }
  return fields.reduce((best, field) => {
    const texts = Array.isArray(field.texts) ? field.texts : [field.text];
    const matches = texts.filter(Boolean).map((label) => {
      const matchIndex = normalizeLookupText(label).indexOf(searchToken);
      return matchIndex < 0 ? null : {
        kind: field.kind || "",
        label,
        weight: Number(field.weight || 0),
        matchIndex,
        ranges: buildHighlightRanges(label, rawQuery),
      };
    }).filter(Boolean);
    const candidate = matches.sort(compareSearchMatches)[0] || null;
    return !best || (candidate && compareSearchMatches(candidate, best) < 0) ? candidate : best;
  }, null);
}

export function compareSearchMatches(left, right) {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  const leftWeight = Number.isFinite(Number(left.weight)) ? Number(left.weight) : Number.MAX_SAFE_INTEGER;
  const rightWeight = Number.isFinite(Number(right.weight)) ? Number(right.weight) : Number.MAX_SAFE_INTEGER;
  if (leftWeight !== rightWeight) {
    return leftWeight - rightWeight;
  }
  const leftIndex = Number.isFinite(Number(left.matchIndex)) ? Number(left.matchIndex) : Number.MAX_SAFE_INTEGER;
  const rightIndex = Number.isFinite(Number(right.matchIndex)) ? Number(right.matchIndex) : Number.MAX_SAFE_INTEGER;
  if (leftIndex !== rightIndex) {
    return leftIndex - rightIndex;
  }
  return String(left.label || "").localeCompare(String(right.label || ""), "zh-Hans-CN");
}

export function renderHighlightedText(label = "", ranges = []) {
  if (!ranges.length) {
    return escapeHtml(label);
  }
  let output = "";
  let cursor = 0;
  mergeRanges(ranges).forEach(([start, end]) => {
    output += escapeHtml(String(label).slice(cursor, start));
    output += `<mark>${escapeHtml(String(label).slice(start, end))}</mark>`;
    cursor = end;
  });
  output += escapeHtml(String(label).slice(cursor));
  return output;
}
