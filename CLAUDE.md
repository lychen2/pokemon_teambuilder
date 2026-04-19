# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

本仓库是一个纯静态的宝可梦队伍组建分析工具。没有构建步骤、没有后端服务、没有自动化测试框架。所有逻辑位于 `static/app/` 下的 ES 模块，运行时只从 `poke_analysis-main/stats/` 读取本地 JSON。

## 开发与验证命令

由于代码使用 ES Modules + `fetch(...)`，不能用 `file://` 直接打开 `index.html`，必须通过本地静态服务：

```bash
python -m http.server 8000    # 然后访问 http://localhost:8000
```

没有测试框架。修改 JS 后至少跑一次语法检查：

```bash
# 改到哪个文件就 check 哪个；常用入口：
node --check static/app/main.js
node --check static/app/render.js
node --check static/app/analysis.js
node --check static/app/matchup-analysis.js
node --check static/app/recommendations.js
node --check static/app/showdown.js
node --check static/app/damage-workspace.js
node --check static/app/render-damage.js
node --check static/app/i18n.js
```

刷新静态数据（需要 Python + `requests`）：

```bash
python poke_analysis-main/update_all_data.py
python poke_analysis-main/build_default_preset.py    # 生成 config-default.txt
```

## 架构（必须分层，别回流到 main.js）

代码按四层组织，新增代码时沿用这个结构：

1. **编排层 —— `static/app/main.js`**
   应用状态、事件绑定、视图切换、模块初始化。只做"把事件串起来"的工作，不写领域算法，也不直接塑形 DOM。

2. **领域逻辑层（无副作用纯函数）**
   - `analysis.js` ：队伍覆盖 / 职能 / 核心分析
   - `matchup-analysis.js` + `matchup-board-data.js` + `matchup-selection.js` ：对战盘分析、对手队伍联动
   - `recommendations.js` + `recommendation-scoring/` ：组队推荐打分；打分拆子模块：`candidate.js`、`entry.js`、`quality.js`、`teammates.js`、`score-breakdowns.js`、`helpers.js`
   - `opponent-team-generator.js` ：对手 counter 生成
   - `team-roles.js` ：职能识别（新增职能请加在这里）
   - `ability-scores.js` ：特性评分
   - `damage-workspace.js` ：伤害计算 workspace 状态机
   - `data.js` ：合并 pokedex / moves / items / abilities / forms，构建查找表与速度线
   - `champions-vgc.js` ：Champions VGC 预设（合成速度条目等）
   - `showdown.js` ：Showdown 文本 import / export、66 点制与传统 EV 的互转
   - `usage.js` ：使用率聚合
   - `team-config.js` ：单只精灵配置比较 / 队伍条目
   - `library-builder.js` + `builder-autocomplete.js` ：引导式配置编辑器
   - `speed.js` ：道具修正后的速度
   - `pschina-translation.js` ：PS 中文翻译桥接

3. **渲染层 —— `render*.js`（每个视图一个文件）**
   - `render.js` 主渲染入口 + 配置库/队伍/速度线
   - `render-analysis.js` 分析三个子页
   - `render-matchup.js` + `render-matchup-board.js` 对战盘
   - `render-damage.js` 伤害计算
   - `render-recommendations.js` 推荐

4. **持久化 / i18n / 常量**
   - `persistence.js` ：`localStorage` 读写（键见文件顶部）
   - `i18n.js` ：中英双语；HTML 里通过 `data-i18n*` 属性挂钩，JS 里用 `t(key, params)`
   - `damage-i18n.js` ：伤害计算专用翻译
   - `constants.js` ：`ICON_SCHEMES`、`NATURE_TRANSLATIONS`、`DATA_PATHS` 等
   - `utils.js` ：纯工具函数
   - `sprites.js` ：图标方案切换（Showdown 雪碧图 / Poke Icons）

当某个 `render-*.js` 变复杂时，拆出子视图；新增分析面板优先加到 `render-analysis.js`。

## Champions 66 点规则（所有计算的前提）

- 默认满 IV，不存在减 IV
- `HP = 种族值 + 75 + 点数`
- 其余五项 = `种族值 + 20 + 点数`
- 总点数 66，单项上限 32
- 性格对非 HP 项施加 1.1 / 0.9 修正
- 导入时同时给出 `EVs:` 和 `Points:` 的，`Points:` 优先
- 只给传统 `EVs:` 的，自动压缩成 66 点制

## 数据来源（只读本地 JSON）

- `poke_analysis-main/stats/pokedex.json`
- `poke_analysis-main/stats/forms_index.json`
- `poke_analysis-main/stats/moves.json`
- `poke_analysis-main/stats/abilities.json`
- `poke_analysis-main/stats/items.json`
- `poke_analysis-main/stats/learnsets.json`
- `poke_analysis-main/stats/formats.json`
- `poke_analysis-main/stats/champions_vgc.json`

不要手改这些 JSON，用 `update_all_data.py` 刷新；路径由 `constants.js` 的 `DATA_PATHS` 控制。

## 清理 / 边界原则

- 不保留旧 Flask 页面、C++ 服务与构建产物
- 不保留备份、日志、缓存
- 不依赖 metagame 使用率数据、`meta_names.json` 或静态 manifest
- 不引入静默 fallback：异常要暴露出来便于排查
- `poke_analysis-main/` 只保留更新数据用的脚本与 `stats/`

## Champions 环境当前赛季（2026/04 起）

**M-A（Mega Evolution）环境**。工具必须对这些规则保持自洽：

- **允许 Mega 进化**（`recommendations.js` 的 `MAX_TEAM_MEGAS` 约束是正确行为，不要删）。
- **禁用太晶**：`battle-semantics.js` 的 `getEffectiveTypes` 太晶语义仍保留（便于跨赛季复用同一份配置库），但推荐/对局/伤害结论里不应把"太晶后的属性"作为事实。M-A 赛季里 `Tera Type:` 只是冗余字段。
- 无 Z 招、无极巨。
- 双打 spread move 伤害 ×0.75（命中多目标时）；单目标击中时 ×1。

## 必须 bump Service Worker 缓存（`sw.js`）的情况

仓库在 2026/04/20 起启用了 `sw.js` 做离线 precache。**只要修改了以下任一路径下的文件，请同步把 `sw.js` 顶部的 `CACHE_VERSION` 字符串递增**（例如 `poke-type-v2-20260420` → `poke-type-v3-20260421`）：

- `static/app/*.js`、`static/app/recommendation-scoring/*.js`
- `static/workers/damage-core-worker.js`
- `vendor/champions-damage-core/*.js`
- `static/css/*.css`
- `index.html`
- `poke_analysis-main/stats/*.json`

**为什么重要**：SW 的缓存策略是 cache-first；不 bump 版本号的话，已安装 SW 的用户刷新页面会继续拿旧缓存，典型症状是"我改了但页面表现没变"。开发阶段如果忘了 bump，需要手工到 DevTools → Application → Service Workers → Unregister 才能拿到新版本——非常容易被误判为新 bug。

## 其他约定文档

- `README.md` ：面向用户的功能说明与目录结构
- `AGENTS.md` ：贡献规范（缩进、命名、commit / PR 约定）；改动提交前请对齐这里的风格
- `docs/future-todo-reference.md` ：尚未实现的方向
- `docs/optimization-suggestions.md` ：75 条算法 / UI / 架构 / 数据优化建议，含二期落地记录（#37 / #44 / #57 / #68）与 #46 暂缓回顾
