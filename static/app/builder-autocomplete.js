import {normalizeLookupText} from "./utils.js";

function buildSearchText(value, label) {
  return normalizeLookupText(`${label || ""} ${value || ""}`);
}

function getMatchRank(entry, query) {
  if (!query) {
    return 0;
  }
  if (entry.labelQuery === query || entry.valueQuery === query) {
    return 3;
  }
  if (entry.labelQuery.startsWith(query) || entry.valueQuery.startsWith(query)) {
    return 2;
  }
  return entry.searchText.includes(query) ? 1 : -1;
}

export function buildAutocompleteEntries(values = [], labels = []) {
  return values.map((value, index) => {
    const label = labels[index] || value;
    return {
      value,
      label,
      valueQuery: normalizeLookupText(value),
      labelQuery: normalizeLookupText(label),
      searchText: buildSearchText(value, label),
    };
  });
}

export function getAutocompleteMatches(entries = [], query = "", limit = 0) {
  const normalizedQuery = normalizeLookupText(query);
  const matches = entries
    .map((entry, index) => ({
      ...entry,
      index,
      rank: getMatchRank(entry, normalizedQuery),
    }))
    .filter((entry) => entry.rank >= 0)
    .sort((left, right) => {
      if (right.rank !== left.rank) {
        return right.rank - left.rank;
      }
      return left.index - right.index;
    });
  return limit > 0 ? matches.slice(0, limit) : matches;
}
