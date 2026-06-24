# Poke Type Rust + Web UI

Poke Type 使用原来的网页队伍工作台作为主界面，保留宝可梦选择、常用配置、配置库、导入、对局分析、推荐、使用率、伤害工作台、速度线和输出强度页面。Rust 负责本地启动入口、CLI 与核心迁移模块；默认用户界面不再走 GPUI。

当前规则按项目内 Champions 设定执行：

- `HP = 种族值 + 75`
- 其他五维 = `种族值 + 20`
- 默认满 IV
- 总点数 `66`
- 单项上限 `32`

## 运行方式

需要 Rust 工具链。仓库使用 Cargo workspace。默认启动本地 Web UI：

```bash
cargo run -p poke-type-web
```

启动后会监听本机地址并尝试打开浏览器。也可以手动访问终端打印的 `http://127.0.0.1:<port>/`。

CLI 仍保留稳定 JSON 契约：

```bash
cargo run -p poke-type-cli -- --help
cargo run -p poke-type-cli -- parse --team team.txt
cargo run -p poke-type-cli -- export --team team.txt
cargo run -p poke-type-cli -- validate-team --team team.txt
cargo run -p poke-type-cli -- analyze --team team.txt
cargo run -p poke-type-cli -- recommend --team team.txt --limit 10
cargo run -p poke-type-cli -- matchup --team team.txt --opponent opponent.txt
cargo run -p poke-type-cli -- damage --attacker attacker.txt --defender defender.txt
cargo run -p poke-type-cli -- usage --species incineroar
cargo run -p poke-type-cli -- output --library config-default.txt
cargo run -p poke-type-cli -- vgcpastes --limit 20
cargo run -p poke-type-cli -- records --records records.json
```

命令成功时只向 stdout 输出 JSON 或 Showdown 文本；失败时向 stderr 输出错误并以非 0 退出。

## Web UI

`poke-type-web` 是轻量本地静态服务器，服务仓库根目录下的原网页资源：

- `index.html`
- `static/app/main.js`
- `static/css/*.css`
- `static/usage.json`
- `static/paste_teams_champions_mb.json`
- `static/paste_sets_champions_mb.json`
- `poke_analysis-main/stats/*.json`

这条路径恢复原网页的完整交互模型：配置库搜索、宝可梦选择、常用配置、表单编辑、Showdown 导入导出、VGCPastes 对手选择、伤害工作台、使用率、速度线和输出强度。浏览器负责成熟布局与输入控件，避免 GPUI 在 Wayland 下的错位和控件缺失。

性能策略：

- Rust 服务器只做本地文件服务，无后端状态和遥测。
- 浏览器继续复用原前端的缓存、增量渲染和 localStorage 状态。
- 大型 JSON 仍由页面按需读取；不在 Rust 启动阶段预解析全量数据。
- 后续如果要进一步提速，应把热点计算迁到 `poke-type-core` 并通过 WebAssembly 或本地 API 接入，而不是再重写 UI 壳。

## 功能概览

- `parse`: 解析 Showdown 队伍或配置库文本，返回 `{configs, feedback, errors, warnings}`。
- `export`: 将解析后的 config 按 Showdown 文本导出。
- `validate-team`: 校验 6 只上限、4 招上限、66 点总额、单项 32 点上限和 Mega 数量。
- `analyze`: 返回承伤、输出、覆盖、职能、速度线、弱点、盲点和队伍身份。
- `recommend`: 基于使用率、当前弱点、当前打点缺口返回补位推荐。
- `matchup`: 返回双方速度线、逐格对局 board 和 overview。
- `damage`: 返回双向四招伤害、KO 文本、速度和 16 档 roll 分布。
- `usage`: 查询 `static/usage.json` 的使用率行或单物种详情。
- `output`: 计算配置库输出强度分档。
- `vgcpastes`: 从 `static/paste_teams_champions_mb.json` 生成对手队库。
- `records`: 创建/校验战绩记录，或计算全局/队伍战绩统计。

## 目录结构

```text
.
├── Cargo.toml
├── crates/
│   ├── poke-type-core/
│   ├── poke-type-cli/
│   └── poke-type-web/
├── index.html
├── static/
│   ├── app/
│   ├── css/
│   ├── usage.json
│   ├── paste_teams_champions_mb.json
│   └── paste_sets_champions_mb.json
├── poke_analysis-main/stats/
└── docs/
```

## 关键文件

- `index.html`: 原网页 UI 入口。
- `static/app/main.js`: 原网页主交互，包含配置库、宝可梦选择、常用配置和各功能页 wiring。
- `static/css/*.css`: 原网页视觉系统。
- `crates/poke-type-web/src/main.rs`: Rust 本地静态服务器。
- `crates/poke-type-core/src/showdown/mod.rs`: Showdown 文本解析和导出。
- `crates/poke-type-core/src/team/mod.rs`: Champions 队伍校验。
- `crates/poke-type-core/src/analysis/mod.rs`: 队伍分析 JSON 契约。
- `crates/poke-type-core/src/recommend/mod.rs`: 补位推荐评分。
- `crates/poke-type-core/src/matchup/mod.rs`: 对手库和对局 board。
- `crates/poke-type-core/src/damage/mod.rs`: Rust 伤害计算。
- `crates/poke-type-core/src/usage/mod.rs`: 使用率查询。
- `crates/poke-type-cli/src/main.rs`: CLI 路由和 JSON 输入输出。
- `poke_analysis-main/update_all_data.py`: 刷新 Showdown/Champions/usage/localization/default preset 数据。

## 数据来源

项目依赖仓库内静态数据：

- `poke_analysis-main/stats/pokedex.json`
- `poke_analysis-main/stats/moves.json`
- `poke_analysis-main/stats/abilities.json`
- `poke_analysis-main/stats/items.json`
- `poke_analysis-main/stats/forms_index.json`
- `poke_analysis-main/stats/champions_vgc.json`
- `static/usage.json`
- `static/paste_teams_champions_mb.json`
- `static/paste_sets_champions_mb.json`

刷新数据：

```bash
python poke_analysis-main/update_all_data.py
```

## 桌面发布

桌面版使用 Tauri v2 打包现有静态 Web UI。打包前先把运行所需的 HTML、JS、CSS、数据 JSON、伤害核心和本地图标复制到 `dist/desktop/`：

```bash
npm install
npm run desktop:prepare
npm run desktop:build
```

GitHub Actions 发布流程在 `.github/workflows/release-desktop.yml`。推送 `v*` tag，或手动运行 `release-desktop` workflow，会构建 macOS Apple Silicon、macOS Intel、Linux x64 和 Windows x64 安装包，并创建 draft release。

自动更新签名已启用。发布 workflow 需要两个仓库 secret：

- `TAURI_SIGNING_PRIVATE_KEY`: Tauri updater 私钥内容。
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: 生成该私钥时使用的密码。

## 验证

```bash
cargo fmt --all
cargo test --workspace
cargo check -p poke-type-desktop
node --check static/app/main.js
python -m py_compile poke_analysis-main/update_all_data.py
```
