# CLAUDE.md

本仓库当前是一个纯静态的宝可梦队伍组建分析工具，不再依赖 Flask、C++ 服务或 API 接口。

## 当前入口

- `index.html`: 静态页面入口
- `static/app/main.js`: 页面初始化、事件绑定、状态管理
- `static/app/render.js`: 配置库、队伍、分析、推荐、速度线渲染
- `static/app/showdown.js`: Showdown 文本导入导出、66 点制解析
- `static/app/analysis.js`: 队伍分析
- `static/app/recommendations.js`: 组队推荐
- `static/app/persistence.js`: 本地持久化
- `static/css/base.css`
- `static/css/layout.css`

## 数据来源

页面只读取本地 JSON：

- `poke_analysis-main/stats/pokedex.json`
- `poke_analysis-main/stats/forms_index.json`
- `poke_analysis-main/stats/moves.json`
- `poke_analysis-main/stats/abilities.json`
- `poke_analysis-main/stats/items.json`

## 数据更新

如需刷新基础资料：

```bash
python poke_analysis-main/update_all_data.py
```

该脚本会更新 `poke_analysis-main/stats/`，并同步刷新：
- `pokedex.json`
- `forms_index.json`
- `moves.json`
- `abilities.json`
- `items.json`

## 当前规则

- 所有宝可梦默认满 IV
- HP = 种族值 + 75 + 点数
- 其余五项 = 种族值 + 20 + 点数
- 总点数 66，单项上限 32
- 性格会对非 HP 能力值应用 1.1 / 0.9 修正

## 验证方式

当前没有完整测试框架。修改前端逻辑后，至少执行：

```bash
node --check static/app/main.js
node --check static/app/render.js
node --check static/app/showdown.js
node --check static/app/analysis.js
node --check static/app/recommendations.js
node --check static/app/data.js
node --check static/app/utils.js
node --check static/app/constants.js
node --check static/app/persistence.js
```

## 清理原则

- 不再保留旧 Flask 页面、旧 C++ 服务和对应构建产物
- 不再保留备份文件、日志文件、缓存目录
- 不再依赖 metagame 使用率数据、`meta_names.json` 或静态 manifest
- 保留 `poke_analysis-main/` 中仍用于更新基础数据的脚本与 `stats/`
