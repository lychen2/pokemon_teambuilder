# Usage Official 来源切换 / 对战盘技能翻译修复 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Usage 视图加 Smogon ↔ 官方来源切换钮、修复对战盘中文招式翻译丢失、把官方 usage 抓取接入 pipeline。

**Architecture:** 纯静态前端，ES Modules + 本地 JSON。改动分三块：(1) `render-matchup-board.js` 加上 `getLocalizedMoveName` 工具与 state 透传；(2) `state.usage.source` 字段 + UI segmented chip + `usage-stats.js` 的 source/official-spread 分支；(3) Python 端新增 `data_update/pokechamp_usage.py` 模块挂进 `pipeline.run_update`。最后 bump `sw.js::CACHE_VERSION`。

**Tech Stack:** JavaScript ES Modules、Python 3、Service Worker。**项目无单测框架**——验证以 `node --check` 语法检查 + 浏览器手动 smoke 测试为准（这是仓库 CLAUDE.md 明确写的工作流）。

---

## Task 1: 对战盘加 getLocalizedMoveName 工具

**Files:**
- Modify: `static/app/render-matchup-board.js`

**Step 1：加导入与工具函数**

在 `render-matchup-board.js` 顶部 imports 段加入 `normalizeName`：

```js
import {getTypeLabel, normalizeName} from "./utils.js";
```

`getTypeLabel` 已存在，只是把 `normalizeName` 一起导出。

紧跟现有 `getTypeClassName` 函数后，加入：

```js
function getLocalizedMoveName(state, moveName = "") {
  if (state?.language !== "zh") {
    return moveName;
  }
  return state.localizedMoveNames?.get(normalizeName(moveName)) || moveName;
}
```

**Step 2：renderMoveRow 接收 state 并使用**

`renderMoveRow` 签名从 `(row, language, side = "ally")` 改成 `(row, language, side = "ally", state)`。函数内部把 `<strong>${escapeHtml(row.name)}</strong>` 改成 `<strong>${escapeHtml(getLocalizedMoveName(state, row.name))}</strong>`。

`renderBoardEntry` 内调用 `renderMoveRow` 处把 state 传下去：
```js
${card.moveRows.map((row) => renderMoveRow(
  {...row, name: row.isMissing ? t(language, "matchup.boardMoveMissing") : row.name},
  language, side, state
)).join("")}
```

**Step 3：supportMarkup 套上本地化**

`renderBoardEntry` 中 `supportMarkup` 模板里：

```js
${card.supportMoves.map((moveName) => `<span class="mini-pill">${escapeHtml(getLocalizedMoveName(state, moveName))}</span>`).join("")}
```

**Step 4：语法检查**

```bash
node --check static/app/render-matchup-board.js
```

**Step 5：浏览器 smoke**

`python -m http.server 8000`，进对战分析视图，加同盟+对手，切到中文，确认对战盘的招式列与"常见功能"显示中文招式名（如「近身战」「假动作」）。

---

## Task 2: usage state shape + 持久化

**Files:**
- Modify: `static/app/main.js:185-189`（state.usage 初始化）
- Modify: `static/app/persistence.js`（usage 状态持久化键）

**Step 1：state.usage 加 source 字段**

`main.js` 第 185-189 行的 usage 对象改为：

```js
usage: {
  search: "",
  sort: "usage",
  source: "smogon",
  selectedSpeciesId: "",
},
```

**Step 2：持久化读写**

打开 `persistence.js`，定位现有 usage 状态读写处（应该有 `loadUsageState` / `persistUsageState` 之类），把 `source` 字段加进序列化白名单与 hydrate 默认值。如果没找到对应函数，先用 grep 确认现状再补。

```bash
grep -n "usage" static/app/persistence.js
```

确认改完后：

**Step 3：语法检查**

```bash
node --check static/app/main.js
node --check static/app/persistence.js
```

**Step 4：刷一次浏览器**

打开 usage 页，DevTools → Application → Local Storage 里相关 key 应包含 `"source":"smogon"`。

---

## Task 3: usage-stats.js 加 source 透传 + 官方 spread 分支

**Files:**
- Modify: `static/app/usage-stats.js`

**Step 1：getSpreadEntries 加 official 分支**

替换现有 `getSpreadEntries` 与 `parseSpreadEntry`：

```js
function getSpreadEntries(profile = {}, sampleWeight = 0) {
  const officialSpreads = profile?.usageOfficial?.spreads;
  if (Array.isArray(officialSpreads) && officialSpreads.length) {
    return officialSpreads.slice(0, USAGE_RECORD_LIMIT)
      .map((entry) => buildOfficialSpreadEntry(entry))
      .filter(Boolean);
  }
  return recordPairs(profile?.Spreads)
    .map(([key, count]) => parseSpreadEntry(key, count, sampleWeight))
    .filter(Boolean)
    .slice(0, USAGE_RECORD_LIMIT);
}

function buildOfficialSpreadEntry(entry) {
  const points = Object.fromEntries(STAT_KEYS.map((stat) => [stat, Number(entry?.points?.[stat] || 0)]));
  return {
    label: STAT_KEYS.map((stat) => points[stat]).join("/"),
    nature: "",
    points,
    count: 0,
    share: Number(entry?.percent || 0) / 100,
    validTotal: pointTotal(points) === CHAMPION_TOTAL_POINTS,
    hasNature: false,
  };
}
```

`parseSpreadEntry` 返回值末尾加 `hasNature: true`。

**Step 2：getUsageDetail 修笔误**

`render-usage.js:32` 现在 `getUsageDetail(state.datasets, selected.speciesId, selected.usageName)` 是 bug —— 第三个参数应该是 options 对象。改成 `{source: state.usage.source}`。同步检查 `usage-stats.js::getUsageDetail` 形参注释，确保 options 形态对得上。

`getUsageRows` 调用方在 `render-usage.js:19` 已经传 `state.usage`，state.usage 现在带 source 字段，这里不用改逻辑，但要确认 `getUsageRows` 内部 `getUsageData(datasets, options.source)` 已透传——查阅现有 `getUsageRows` 第二行确认。

**Step 3：buildUsageConfigText fallback nature**

`buildUsageConfigText` 里 `const spread = detail.spreads[0] || defaultSpread();` 后追加：

```js
if (!spread.nature) {
  spread.nature = detail.natures?.[0]?.name || defaultSpread().nature;
}
```

**Step 4：isUsageAvailable 接受 profile-style 入参**

现状 `isUsageAvailable(usageData = {})` 的判定还能用，但要保证调用方按 source 传对应那份 data。这步只检查不动文件。

**Step 5：语法检查**

```bash
node --check static/app/usage-stats.js
```

---

## Task 4: render-usage.js source toggle + Natures 隐藏逻辑

**Files:**
- Modify: `static/app/render-usage.js`

**Step 1：导入 getUsageData**

文件顶部 import 段加 `getUsageData`：

```js
import {getUsageDetail, getUsageData, getUsageRows, isUsageAvailable, formatUsagePoints, formatUsageShare} from "./usage-stats.js";
```

**Step 2：usageMarkup 与 unavailableMarkup 按 source 取数据**

`usageMarkup` 内 `if (!isUsageAvailable(state.datasets?.usage))` 改成：

```js
const sourceData = getUsageData(state.datasets, state.usage?.source);
if (!isUsageAvailable(sourceData)) {
  return unavailableMarkup(state, sourceData);
}
```

`unavailableMarkup(state, sourceData)` 形参增加 sourceData，info 取 `sourceData?.info || {}`。

**Step 3：usageDetailMarkup 调用修正**

`usageMarkup` 里：

```js
const detail = selected ? getUsageDetail(state.datasets, selected.speciesId, {source: state.usage?.source}) : null;
```

**Step 4：usageToolbarMarkup 加 segmented chip**

工具栏 `<h3>` 同行（或第一个 div 内紧跟 `<p class="muted">` 之后）插：

```js
const sourceToggleMarkup = `
  <div class="usage-source-toggle" role="group" aria-label="${escapeHtml(t(state.language, "usage.source"))}">
    ${["smogon", "official"].map((source) => `
      <button
        type="button"
        class="ghost-button mini-action ${state.usage?.source === source ? "active" : ""}"
        data-usage-source="${source}"
        aria-pressed="${state.usage?.source === source ? "true" : "false"}"
      >${escapeHtml(t(state.language, `usage.source.${source}`))}</button>
    `).join("")}
  </div>
`;
```

放到 toolbar 的 `<h3>` 与 `<p class="muted">` 同列，插在 `<div>` 子元素的末尾即可。

**Step 5：spreadPanelMarkup 处理无性格条目**

```js
function spreadPanelMarkup(spreads, language) {
  if (!spreads.length) {
    return emptyPanelMarkup("usage.spreads", "usage.noSpreads", language);
  }
  return `
    <section class="usage-stat-panel usage-stat-panel-wide">
      <h4>${escapeHtml(t(language, "usage.spreads"))}</h4>
      ${spreads.map((entry) => `
        <div class="usage-bar-row">
          <span>${entry.nature ? `${escapeHtml(natureLabel(entry.nature, language))} ` : ""}<small>${escapeHtml(formatUsagePoints(entry.points, language))}</small></span>
          <strong>${formatUsageShare(entry.share, 1)}</strong>
          <i style="--usage-width:${Math.min(100, entry.share * 100)}%"></i>
        </div>
      `).join("")}
    </section>
  `;
}
```

**Step 6：usageDetailMarkup 隐藏 Natures 面板**

`usageDetailMarkup` 内：

```js
const allSpreadsHaveNature = detail.spreads.length > 0 && detail.spreads.every((entry) => entry.hasNature);
```

把 `${recordPanelMarkup("usage.natures", detail.natures, state)}` 包在 `${allSpreadsHaveNature ? "" : recordPanelMarkup("usage.natures", detail.natures, state)}`。

**Step 7：语法检查**

```bash
node --check static/app/render-usage.js
```

---

## Task 5: main.js 接 source 切换事件

**Files:**
- Modify: `static/app/main.js:4362-4373`

**Step 1：usage-view click 委托加分支**

把现有的：

```js
document.getElementById("usage-view")?.addEventListener("click", (event) => {
  const row = event.target.closest("[data-usage-species]");
  if (row) { ... }
  const createButton = event.target.closest("[data-create-usage-config]");
  if (createButton) { ... }
});
```

第一句改成：

```js
const sourceToggle = event.target.closest("[data-usage-source]");
if (sourceToggle) {
  const next = sourceToggle.dataset.usageSource;
  if (next && state.usage.source !== next) {
    state.usage.source = next;
    state.usage.selectedSpeciesId = "";
    persistUsageState();
    renderUsageSection();
  }
  return;
}
const row = event.target.closest("[data-usage-species]");
...
```

如果 `persistUsageState` 不是这个名字，先 grep `static/app/main.js` 找现有 usage 持久化调用并对齐。

**Step 2：语法检查**

```bash
node --check static/app/main.js
```

**Step 3：浏览器 smoke**

进 usage 页，点切换钮，URL/Local Storage 对应字段更新；切到「官方」应看到 spread 面板只展示点数 + 百分比、Natures 面板出现；切回 Smogon 应看到 spread 面板带性格、Natures 面板消失。

---

## Task 6: i18n 新增三条 key

**Files:**
- Modify: `static/app/i18n.js`

**Step 1：中文段加键**

定位中文翻译表里 `"usage.spreads"` 那一段附近，加：

```js
"usage.source": "数据来源",
"usage.source.smogon": "Smogon",
"usage.source.official": "官方",
```

**Step 2：英文段加键**

英文翻译表对应位置加：

```js
"usage.source": "Source",
"usage.source.smogon": "Smogon",
"usage.source.official": "Official",
```

**Step 3：语法检查**

```bash
node --check static/app/i18n.js
```

---

## Task 7: pokechamp_usage.py + pipeline 接入

**Files:**
- Create: `poke_analysis-main/data_update/pokechamp_usage.py`
- Modify: `poke_analysis-main/data_update/pipeline.py`

**Step 1：先看现有 pokechamp 模块的接口与 datasets 期望**

```bash
grep -n "build_usage_official\|canonicalize_usage_official_payload\|PokeChampClient" poke_analysis-main/default_preset/pokechamp.py
sed -n '60,120p' poke_analysis-main/default_preset/pokechamp.py
sed -n '60,90p' poke_analysis-main/build_default_preset.py
```

记下 `build_usage_official(client, datasets, season, battle_format, limit=0)` 的参数和 `datasets` 的期望键（参考 `build_default_preset.py::load_or_build_usage_official` 的传入）。

**Step 2：写 pokechamp_usage.py**

```python
"""Refresh static/usage_official.json via PokéChamp DB."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from default_preset.pokechamp import (
    PokeChampClient,
    build_usage_official,
    canonicalize_usage_official_payload,
)

from .paths import STATIC_DIR

DEFAULT_SEASON = "M-1"
DEFAULT_FORMAT = "double"


def update_official_usage_data(datasets, season: str = DEFAULT_SEASON, battle_format: str = DEFAULT_FORMAT) -> Path:
    client = PokeChampClient()
    payload = build_usage_official(client, datasets, season, battle_format)
    canonical = canonicalize_usage_official_payload(payload.payload, datasets)
    target = STATIC_DIR / "usage_official.json"
    target.write_text(json.dumps(canonical, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Refreshed {target.relative_to(STATIC_DIR.parent)}", file=sys.stderr)
    return target
```

注意 `build_usage_official` 返回的对象有 `.payload` 属性（`build_default_preset.py:39-41` 这么用的），所以 `payload.payload` 取里面的 dict。`datasets` 形态以 `build_default_preset.py` 里的 `datasets = ...` 那段为准——如果它是 builder 阶段才有的整体 datasets 对象，可能要从 `champions_payload` 里现场构建一份替代品。**先 grep `load_datasets` / `datasets` 在 pokechamp.py 里的用法**确认实际依赖再写。

**Step 3：pipeline.run_update 接入**

`pipeline.py::run_update` 在 `update_usage_data(champions_payload)` 后加：

```python
try:
    from .pokechamp_usage import update_official_usage_data
    update_official_usage_data(champions_payload)
except Exception as exc:
    print(f"Skipping official usage refresh: {exc}", file=sys.stderr)
```

如果 `champions_payload` 不能直接当 `datasets` 喂进去，按 Step 2 调研结果改成正确的入参（可能需要从 `champions_payload` 派生或者在 pipeline 里先 `loadDatasets` 风格地构造）。

**Step 4：本地试跑**

```bash
python poke_analysis-main/update_all_data.py
```

观察 `static/usage_official.json` 的 `info.lastUpdated` / `generatedAt` 字段更新；网络挂掉时仅打 warning 不阻断 pipeline。

---

## Task 8: SW 缓存 bump + 整体回归

**Files:**
- Modify: `sw.js`

**Step 1：bump CACHE_VERSION**

`sw.js` 顶部 `CACHE_VERSION` 字符串递增（按现有命名约定 `poke-type-vN-YYYYMMDD`）：

```js
const CACHE_VERSION = "poke-type-v?-20260502";
```

`?` 替换为现有版本号 + 1。

**Step 2：语法检查**

```bash
node --check sw.js
```

**Step 3：手动回归 smoke**

`python -m http.server 8000`，依次过：

1. 对战分析视图 → 加同盟+对手 → 切中文 → 看招式列与"常见功能"是否中文。
2. Usage 视图（默认 Smogon） → spread 面板含性格 + Natures 面板**不**渲染。
3. Usage 视图切官方 → spread 面板只点数 + percent、Natures 面板渲染、info 行显示 PokéChamp DB season/lastUpdated。
4. 两种 source 下点「创建配置」 → 导出文本含正确 nature。
5. DevTools 看 SW Cache 名称带新 CACHE_VERSION。

**Step 4：所有改动一次提交（待用户确认）**

提交动作交给用户决定（CLAUDE.md 要求不主动 commit）。

---

## 风险清单

- 切换 source 时 `selectedSpeciesId` 可能在新源不存在 → 切换时清空它（Task 5 Step 1 已处理）。
- `buildUsageConfigText` 在官方源若 `Natures` 也空 → fallback "Hardy"（Task 3 Step 3 已处理）。
- Python 端 datasets 形态若 pokechamp 期望与 pipeline 提供的不一致 → Task 7 Step 2 先 grep 调研，对齐再写。
- 窄屏 segmented chip 排版 → 复用现有 `.ghost-button.mini-action` 样式，自动 flex-wrap。
