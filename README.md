# Poke Type Static Builder

一个纯前端、静态部署的宝可梦队伍构建与分析工具。  
项目以导入的 Pokémon Showdown 配置为核心数据源，结合本地静态图鉴、招式、特性与道具数据，对队伍进行：

- 配置库浏览
- 队伍组建
- 覆盖 / 职能 / 核心分析
- 速度线整理
- 组队推荐

当前规则按项目内的 Champions 设定执行：

- `HP = 种族值 + 75`
- 其他五维 = `种族值 + 20`
- 默认满 IV
- 总点数 `66`
- 单项上限 `32`

## 功能概览

### 1. 配置库

- 支持直接粘贴 Showdown 队伍文本导入
- 支持中文种族 / 道具 / 招式 / 特性名导入
- 导入时会提示未识别行、非法特性、未知道具与非法招式
- 导入反馈会按段落 / 行号展开明细表，配置卡会保留合法性警示标记
- 支持覆盖导入与追加导入
- 支持导出当前配置库
- 支持导出 / 导入 `.poketype.json` 全量状态备份
- 支持编辑单条配置文本
- 支持给配置添加备注

### 2. 当前队伍

- 从配置库中选择最多 6 条配置组成队伍
- 支持拖拽或上下按钮调整队伍顺序
- 支持导出当前队伍为 Showdown 文本
- 支持保存 / 读取本地队伍快照
- 支持 `Ctrl/Cmd+Z`、`Ctrl/Cmd+Shift+Z`、`Ctrl/Cmd+Y` 撤销 / 重做核心状态改动

### 3. 分析

分析页拆成三个子页：

- `覆盖`
  队伍承伤覆盖、输出覆盖、打击盲区
- `职能`
  控速、转场、Fake Out、引导、Guard、干扰、TR、输出倾向等
- `核心`
  最佳双人 core、高重叠风险组合、指定成员的搭档属性建议

### 4. 推荐

- 仅从当前导入的配置库中推荐
- 优先参考当前队伍的承伤缺口
- 焦点属性会先做强过滤，不足时再显示“焦点兜底”候选
- 同时考虑输出覆盖、速度模式、缺失职能与配置质量

### 5. 速度线

- 统计当前配置库中的速度档
- 支持基础速度、`+1` 速度、`Choice Scarf` 速度线整理

### 6. 对局分析

- 支持对面队伍锁定后自动补全剩余 counter
- 保存的对面队伍会按最近打开和使用频率自动排序
- 对战盘新增 6×6 对位热图
- 速度对比改为 `基础 / +1 / 围巾 / ×2` 分档展示

## 运行方式

这是一个无构建步骤的静态项目，但由于使用了 ES Modules 和本地 `fetch`，不要直接双击 `index.html` 打开，建议用本地静态服务器。

示例：

```bash
python -m http.server 8000
```

然后访问：

```text
http://localhost:8000
```

## 数据来源

项目依赖仓库内的静态数据文件：

- `poke_analysis-main/stats/pokedex.json`
- `poke_analysis-main/stats/moves.json`
- `poke_analysis-main/stats/abilities.json`
- `poke_analysis-main/stats/items.json`
- `poke_analysis-main/stats/forms_index.json`

这些数据由前端直接读取，不依赖后端服务。

## 目录结构

```text
.
├── index.html
├── config-AG.txt
├── poke_analysis-main/
│   └── stats/
├── static/
│   ├── app/
│   ├── css/
│   ├── pokemonicons-sheet.png
│   └── itemicons-sheet.png
└── docs/
    └── future-todo-reference.md
```

### 关键文件

- `index.html`
  页面结构入口
- `static/app/main.js`
  应用状态、事件绑定、初始化
- `static/app/showdown.js`
  Showdown 文本解析与配置归一化
- `static/app/analysis.js`
  队伍分析逻辑
- `static/app/recommendations.js`
  推荐算法
- `static/app/render.js`
  主渲染入口
- `static/app/render-analysis.js`
  分析页子视图渲染
- `static/app/team-roles.js`
  职能识别共享逻辑
- `static/css/base.css`
  基础视觉样式
- `static/css/layout.css`
  通用布局
- `static/css/shell.css`
  应用壳层布局
- `static/css/analysis.css`
  分析页样式

## 本地持久化

应用会把以下内容保存到 `localStorage`：

- 配置库
- 当前队伍
- 当前主视图
- 已保存队伍
- 语言
- 伤害工作台基础场况

当前持久化具备：

- `schemaVersion` 迁移能力，可兼容旧版本地状态
- 4MB 级别的体积预警
- 导出 / 导入 `.poketype.json` 全量备份

存储键位于：

- `static/app/persistence.js`

## 配置导入说明

支持以下信息：

- `Ability`
- `Item`
- `Tera Type`
- `Nature`
- `EVs`
- `Points`
- `Moves`
- `Note` / `备注`

其中：

- 如果同时存在 `EVs:` 与 `Points:`，优先读取 `Points:`
- 如果只提供传统 Showdown `EVs:`，会自动压缩成 Champions 66 点规则
- `IVs:` 不参与当前规则计算，前端按满 IV 处理

## 当前实现边界

项目当前偏向“配置库驱动的静态分析器”，不是逐只精灵手工编辑器。

未实现或只实现了部分能力：

- 伤害计算器
- 完整 EV / IV 工作台
- 随机组队生成器
- 更完整的 hazard / field role checklist
- 从 core 建议直接映射到库内真实候选

这些后续方向已整理在：

- `docs/future-todo-reference.md`

## 维护建议

- 分析逻辑、推荐逻辑、渲染逻辑保持分层，不要重新耦合到 `main.js`
- 新增角色识别时，优先放到 `static/app/team-roles.js`
- 新增分析子面板时，优先放到 `static/app/render-analysis.js`
- 不要引入静默 fallback，异常应尽量暴露出来便于排查
