import {t} from "./i18n.js";
import {isTypingTarget} from "./utils.js";

export function scoreCommand(query, command, language) {
  if (!query) {
    return {score: 1, ranges: []};
  }
  const label = t(language, command.labelKey).toLowerCase();
  const keywords = (command.keywords || []).map((k) => k.toLowerCase());
  const haystack = [label, ...keywords].join(" ");
  const q = query.toLowerCase();
  const direct = haystack.indexOf(q);
  let score = 0;
  let ranges = [];
  if (direct >= 0) {
    score = 200 - direct;
    ranges = computeRanges(label, q);
    return {score, ranges};
  }
  let cursor = 0;
  let lastMatch = -1;
  let streak = 0;
  let streakBonus = 0;
  const labelMatches = [];
  for (let i = 0; i < q.length; i += 1) {
    const ch = q[i];
    if (ch === " ") continue;
    const next = label.indexOf(ch, cursor);
    if (next === -1) {
      streak = 0;
      continue;
    }
    labelMatches.push(next);
    if (lastMatch === next - 1) {
      streak += 1;
      streakBonus += streak * 3;
    } else {
      streak = 0;
    }
    lastMatch = next;
    cursor = next + 1;
  }
  if (labelMatches.length >= Math.max(1, q.length - 1)) {
    score = 80 - (labelMatches[0] || 0) + streakBonus + labelMatches.length * 2;
    ranges = mergeRanges(labelMatches);
    return {score, ranges};
  }
  let matched = 0;
  cursor = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    const next = haystack.indexOf(ch, cursor);
    if (next === -1) {
      return {score: 0, ranges: []};
    }
    matched += 1;
    cursor = next + 1;
  }
  return {score: 20 + matched, ranges: []};
}

function computeRanges(label, q) {
  const idx = label.indexOf(q);
  if (idx < 0) return [];
  return [[idx, idx + q.length]];
}

function mergeRanges(positions) {
  if (!positions.length) return [];
  const sorted = [...positions].sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0];
  let end = start + 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const p = sorted[i];
    if (p === end) {
      end = p + 1;
    } else {
      ranges.push([start, end]);
      start = p;
      end = p + 1;
    }
  }
  ranges.push([start, end]);
  return ranges;
}

export function rankCommands(query, commands, language) {
  const normalized = (query || "").trim();
  return commands
    .map((command) => {
      const eligible = typeof command.isAvailable === "function" ? command.isAvailable() : true;
      if (!eligible) return null;
      const scored = scoreCommand(normalized, command, language);
      if (normalized && scored.score <= 0) return null;
      return {command, score: scored.score, ranges: scored.ranges};
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

function clickById(id) {
  const el = document.getElementById(id);
  if (!el) return false;
  el.click();
  return true;
}

export function buildDefaultCommands({state, actions}) {
  const switchTo = (viewId) => () => actions.setActiveView?.(viewId);
  return [
    {id: "view.library", labelKey: "palette.cmd.switchLibrary", keywords: ["library", "配置库", "1"], run: switchTo("library-view")},
    {id: "view.analysis", labelKey: "palette.cmd.switchAnalysis", keywords: ["analysis", "分析", "2"], run: switchTo("analysis-view")},
    {id: "view.matchup", labelKey: "palette.cmd.switchMatchup", keywords: ["matchup", "对局", "3"], run: switchTo("matchup-view")},
    {id: "view.recommend", labelKey: "palette.cmd.switchRecommend", keywords: ["recommend", "推荐", "4"], run: switchTo("recommend-view")},
    {id: "view.damage", labelKey: "palette.cmd.switchDamage", keywords: ["damage", "伤害", "5"], run: switchTo("damage-view")},
    {id: "view.speed", labelKey: "palette.cmd.switchSpeed", keywords: ["speed", "速度", "6"], run: switchTo("speed-view")},
    {id: "team.save", labelKey: "palette.cmd.saveTeam", keywords: ["save", "保存"], run: () => actions.saveCurrentTeam?.()},
    {id: "team.clear", labelKey: "palette.cmd.clearTeam", keywords: ["clear", "清空"], run: () => clickById("clear-team-btn")},
    {id: "opponent.clear", labelKey: "palette.cmd.clearOpponent", keywords: ["opponent", "对面"], run: () => clickById("clear-opponent-team-btn")},
    {id: "opponent.autoFill", labelKey: "palette.cmd.autoFillOpponent", keywords: ["auto", "自动"], run: () => clickById("auto-generate-opponent-team-btn")},
    {id: "library.loadDefault", labelKey: "palette.cmd.loadDefault", keywords: ["default", "预设"], run: () => clickById("load-default-preset-btn")},
    {id: "library.export", labelKey: "palette.cmd.exportLibrary", keywords: ["export"], run: () => clickById("export-library-btn")},
    {id: "state.export", labelKey: "palette.cmd.exportFullState", keywords: ["backup", "全部"], run: () => clickById("export-full-state-btn")},
    {id: "state.import", labelKey: "palette.cmd.importFullState", keywords: ["restore", "导入"], run: () => clickById("import-full-state-btn")},
    {id: "lang.zh", labelKey: "palette.cmd.switchLangZh", keywords: ["chinese", "中文"], isAvailable: () => state.language !== "zh", run: () => actions.setLanguage?.("zh")},
    {id: "lang.en", labelKey: "palette.cmd.switchLangEn", keywords: ["english"], isAvailable: () => state.language !== "en", run: () => actions.setLanguage?.("en")},
    {id: "icon.toggle", labelKey: "palette.cmd.toggleIconScheme", keywords: ["icon", "图标"], run: () => actions.toggleIconScheme?.()},
    {id: "edit.undo", labelKey: "palette.cmd.undo", keywords: ["undo", "撤销"], run: () => actions.undoStateChange?.()},
    {id: "edit.redo", labelKey: "palette.cmd.redo", keywords: ["redo", "重做"], run: () => actions.redoStateChange?.()},
    {id: "help.shortcuts", labelKey: "palette.cmd.openShortcuts", keywords: ["help", "快捷键"], run: () => actions.openShortcutsHelp?.()},
  ];
}

export function createCommandPalette({state, actions, commands}) {
  const store = {
    open: false,
    query: "",
    selectedIndex: 0,
    commands: commands || buildDefaultCommands({state, actions}),
  };
  function openPalette() {
    store.open = true;
    store.query = "";
    store.selectedIndex = 0;
  }
  function closePalette() {
    store.open = false;
  }
  function setQuery(value) {
    store.query = value;
    store.selectedIndex = 0;
  }
  function move(delta) {
    const results = rankCommands(store.query, store.commands, state.language);
    if (!results.length) return;
    const next = (store.selectedIndex + delta + results.length) % results.length;
    store.selectedIndex = next;
  }
  function execute(index = store.selectedIndex) {
    const results = rankCommands(store.query, store.commands, state.language);
    const target = results[index];
    if (!target) return false;
    target.command.run?.();
    closePalette();
    return true;
  }
  return {store, openPalette, closePalette, setQuery, move, execute,
    getResults: () => rankCommands(store.query, store.commands, state.language),
    isTypingTarget};
}
