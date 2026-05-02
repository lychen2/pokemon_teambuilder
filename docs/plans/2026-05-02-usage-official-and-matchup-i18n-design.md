# Usage Official 来源切换 / 对战盘技能翻译修复 设计

日期：2026-05-02
范围：`static/app/`（render-usage / usage-stats / render-matchup-board / 持久化）+ `poke_analysis-main/data_update/` + `sw.js` 缓存版本号

## 背景

`static/usage_official.json`（PokéChamp DB M-1）已经被抓取并写入仓库，`data.js` 也把它装进 `datasets.usageOfficial`，`usage-stats.js` 内部已支持 `options.source: "official"`。但前端 UI 上**没有切换控件**，所以官方那份数据现在没人能看到；并且抓取脚本只挂在 `build_default_preset.py` 里，`update_all_data.py` 不会触发它。

另一桩独立 bug：`render-matchup-board.js` 是项目里**唯一**没用 `getLocalizedMoveName` 的渲染模块——`row.name`（line 116）和 `card.supportMoves`（line 204）都直接 escape 后输出英文招式名，中文模式下「对战盘」分析里的招式列与"常见功能"全是英文。

## 数据形状差异（前提）

| 字段 | Smogon (`usage`) | 官方 (`usageOfficial`) |
| --- | --- | --- |
| `Spreads`（顶层） | 有，key 形如 `"Jolly:0/32/0/0/0/32"`，性格嵌入 | **空** |
| `Natures`（顶层） | **空** | 有（"Jolly": 59.0 …） |
| `usageOfficial.spreads`（嵌套） | 不存在 | 有，包含 `points`(66点) + `percent`，但**不含性格** |
| `Moves` / `Items` / `Abilities` / `Teammates` | 有 | 有 |
| `info` | `metagame / cutoff / month / battles` | `season / format / lastUpdated / source` |

衍生规则：
- Smogon 的 spread 自带性格 → Natures 面板冗余，**隐藏**。
- 官方的 spread 不带性格 → Natures 面板**保留**，让用户自己读「点数 + top 性格」。

## 五条改动

### 1. 对战盘技能翻译修复（独立 bug）

**文件**：`static/app/render-matchup-board.js`

- 顶部加 `getLocalizedMoveName(state, name)`，复用 `render-matchup.js:98-103` 的实现：中文时按 `state.localizedMoveNames.get(normalize(name))` 查表，否则原样返回。
- `renderBoardEntry` 已经接收 `state`，把它继续传到：
  - `renderMoveRow(row, language, side, state)` 内部把 `row.name` 替换为 `getLocalizedMoveName(state, row.name)`。
  - `supportMarkup` 里 `card.supportMoves.map((moveName) => ...)` 套上 `getLocalizedMoveName(state, moveName)`。
- `boardMoveMissing` 那条仍走 `t(language, "matchup.boardMoveMissing")`，不动。

无逻辑影响，只改显示层。

### 2. Usage 视图加 Source 切换

**state**：`state.usage.source: "smogon" | "official"`，默认 `"smogon"`。

**持久化**：`persistence.js` 的 usage 状态键追加 `source`。

**UI**（`render-usage.js` `usageToolbarMarkup`）：
- toolbar 头部 `<h3>` 同行加一组 segmented chip：
  ```html
  <div class="usage-source-toggle" role="tablist">
    <button data-usage-source="smogon" aria-pressed="...">Smogon</button>
    <button data-usage-source="official" aria-pressed="...">官方</button>
  </div>
  ```
- 翻译键：`usage.source` / `usage.source.smogon` / `usage.source.official`。

**事件**（`main.js` 现有 `usage-view` click 委托）：识别 `data-usage-source`，写入 `state.usage.source`，调 `persistUsageState()`，重渲染。

**透传**：
- `getUsageRows(datasets, state.usage)` 已存在，把 `source` 加进 `options` 传给 `getUsageData`。
- `getUsageDetail(datasets, speciesId, {source})` 已支持，调用方补 source。
- 顺手修 `render-usage.js:32` 那个把 `selected.usageName` 当作 options 传入 `getUsageDetail` 的笔误 → 改成 `{source: state.usage.source}`。

**可用性判定**（`isUsageAvailable`）：现状只看默认 usage，要按 source 判断对应那份数据：
```js
isUsageAvailable(getUsageData(datasets, state.usage.source))
```
`unavailableMarkup` 取对应 source 的 `info`。

### 3. 官方 spread 显示 + Natures 面板冗余处理

**`usage-stats.js`**：

- `getSpreadEntries(profile, sampleWeight)` 拓展：
  ```js
  if (profile?.usageOfficial?.spreads?.length) {
    return profile.usageOfficial.spreads.slice(0, USAGE_RECORD_LIMIT).map((entry) => ({
      label: STAT_KEYS.map((stat) => entry.points[stat]).join("/"),
      nature: "",
      points: entry.points,
      count: 0,
      share: Number(entry.percent || 0) / 100,
      validTotal: pointTotal(entry.points) === CHAMPION_TOTAL_POINTS,
      hasNature: false,
    }));
  }
  ```
  Smogon 路径在原 `parseSpreadEntry` 返回值里追加 `hasNature: true`。
- `defaultSpread()` / `buildUsageConfigText` 里 official 路径无性格时：取 `detail.natures[0]?.name || "Hardy"` 作为 fallback。

**`render-usage.js`**：

- `spreadPanelMarkup` 里 `entry.nature` 为空时只渲染点数：
  ```js
  const head = entry.nature
    ? `${escapeHtml(natureLabel(entry.nature, language))} <small>${formatUsagePoints(entry.points, language)}</small>`
    : `<small>${formatUsagePoints(entry.points, language)}</small>`;
  ```
- `usageDetailMarkup` 决定是否渲染 Natures 面板：
  ```js
  const allSpreadsHaveNature = detail.spreads.length > 0 && detail.spreads.every((entry) => entry.hasNature);
  ${allSpreadsHaveNature ? "" : recordPanelMarkup("usage.natures", detail.natures, state)}
  ```
  Smogon 路径自动隐藏（spread 都带 nature），官方路径自动保留。

### 4. 接入 update_all_data 管道

**新文件**：`poke_analysis-main/data_update/pokechamp_usage.py`

```python
import json
from default_preset.pokechamp import (
    PokeChampClient,
    build_usage_official,
    canonicalize_usage_official_payload,
)
from .paths import STATIC_DIR

def update_official_usage_data(datasets, season="M-1", battle_format="double"):
    client = PokeChampClient()
    payload = build_usage_official(client, datasets, season, battle_format)
    canonical = canonicalize_usage_official_payload(payload, datasets)
    target = STATIC_DIR / "usage_official.json"
    target.write_text(json.dumps(canonical, ensure_ascii=False, indent=2))
```

**`pipeline.py`**：`run_update` 在 `update_usage_data(champions_payload)` 之后增加：
```python
try:
    from .pokechamp_usage import update_official_usage_data
    update_official_usage_data(champions_payload)
except Exception as exc:
    print(f"Skipping official usage refresh: {exc}", file=sys.stderr)
```
失败时打 warning 不阻断（PokéChamp DB 偶尔抓不到也不该让整次更新挂掉）。

`build_default_preset.py` 仍可独立运行，因为 `load_or_build_usage_official` 已有「读现有文件优先 / 缺则抓」的回退逻辑。

### 5. SW 缓存版本 bump

`sw.js` 顶部 `CACHE_VERSION` 字符串递增（典型从 `poke-type-vX-YYYYMMDD` 换成 `poke-type-vY-20260502`）。CLAUDE.md 强制规则——改了 `static/app/*.js` / `static/usage_official.json` 都必须 bump。

## 验证

逐文件 `node --check`：`render-usage.js` / `usage-stats.js` / `render-matchup-board.js` / `main.js` / `persistence.js`。

人工校验：`python -m http.server 8000` 后

1. **对战盘**：进入对战分析视图、加同盟+对手、切到中文，对战盘的招式列与"常见功能"应显示中文招式名。
2. **Usage Smogon**：进 usage 页，默认 Smogon，spread 面板带性格，Natures 面板**不**渲染。
3. **Usage 官方**：点切换钮，进入官方源，spread 面板只显示点数 + percent，Natures 面板正常渲染。来源 info 行显示 PokéChamp DB 的 season + lastUpdated。
4. **创建配置**：在两种源下点「创建配置」，导出文本里 nature 字段都正确（官方源走 fallback 取 Natures top1）。
5. **数据更新**：跑 `python poke_analysis-main/update_all_data.py`，看到 `usage_official.json` 被刷新；网络挂掉时只打 warning 不报错。
6. **缓存**：DevTools → Application → Service Workers，`CACHE_VERSION` 字串与本提交不同。

## 风险

- 现有 `selectUsageRow` 仅按 `selectedSpeciesId` 找——切换 source 时若该物种在新源里不存在，`getUsageDetail` 已有"找不到时回退首行"的保护，应当无白屏。
- `buildUsageConfigText` 在官方路径下若 `Natures` 也是空（理论上不会，因为官方源的 Natures 总是 ≥1 项），fallback 到 `"Hardy"`。
- 新加的 segmented chip 在窄屏时若挤到第二行不影响功能；CSS 用 flex-wrap 兼容即可，不单独写动画。
