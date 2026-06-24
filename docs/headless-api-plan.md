# Headless API 功能分类与重构计划

## 目标

把当前浏览器工作台拆出一套无 UI、无 DOM、无 `localStorage` 依赖的算法接口。无头层负责读取数据、解析 Showdown 文本、构建队伍、分析队伍、生成推荐、分析对局、计算伤害，并输出稳定 JSON。

现有网页可以继续存在，但不再作为算法入口。后续 Rust 重构也以这套 JSON 契约为边界，不先重写 UI。

## 边界

### 保留

- Champions VGC M-A 规则。
- 66 点能力分配。
- Showdown 文本导入导出。
- 当前推荐、分析、速度线、对局、伤害计算语义。
- 中英文名称解析与中文输出字段。

### 移除出无头层

- `render*.js` 里的 HTML 拼接。
- `main.js` 的事件绑定、视图状态和 DOM 查询。
- `persistence.js` 的 `localStorage` 读写。
- `toast.js`、`keybindings.js`、命令面板、View Transition。
- 所有只服务网页交互的 tooltip、modal、canvas、CSS 逻辑。

## 现有核心模块

| 功能 | 当前模块 |
| --- | --- |
| 数据加载 | `static/app/data.js`、`static/app/constants.js` |
| Showdown 解析 | `static/app/showdown.js` |
| 单只构筑器 | `static/app/library-builder.js` |
| 队伍配置对象 | `static/app/team-config.js` |
| 队伍分析 | `static/app/analysis.js` |
| 战斗语义 | `static/app/battle-semantics.js` |
| 职能识别 | `static/app/team-role-analysis.js`、`static/app/team-role-*.js` |
| 推荐 | `static/app/recommendations.js`、`static/app/recommendation-scoring/*` |
| 对局分析 | `static/app/matchup-analysis.js`、`static/app/matchup-board-data.js` |
| 伤害计算 | `static/app/damage-workspace.js`、`static/workers/damage-core-worker.js`、`vendor/champions-damage-core/*` |
| 输出强度 | `static/app/output-strength.js`、`static/app/output-strength-rules.js` |
| Usage | `static/app/usage-stats.js`、`static/app/usage.js` |
| 速度线 | `static/app/data.js`、`static/app/speed.js`、`static/app/battle-semantics.js` |

## Headless 模块布局

```text
static/app/headless/
  index.js                 # 统一出口，只导出无头 API
  datasets.js              # 数据加载、索引、搜索
  showdown-api.js           # Showdown 导入导出
  builder-api.js            # 单只宝可梦构筑器
  team-api.js               # 队伍编辑、校验、归一化
  roles-api.js              # 职能识别
  analysis-api.js           # 队伍整体分析
  recommendation-api.js     # 构筑推荐
  speed-api.js              # 速度线和速度变体
  matchup-api.js            # 对局分析
  damage-api.js             # 伤害计算无头入口
  damage-core-adapter.js    # 浏览器 Worker 和 Node 共用的伤害核心适配
  output-api.js             # 输出强度
  usage-api.js              # Usage 查询和样板配置
  schema.js                 # 输入输出对象归一化

tools/
  headless.mjs              # CLI

docs/
  headless-api-plan.md
  rust-refactor-plan.md
```

`static/app/headless/index.js` 不允许导入这些模块：

- `static/app/main.js`
- `static/app/render*.js`
- `static/app/persistence.js`
- `static/app/toast.js`
- `static/app/keybindings.js`
- `static/app/command-palette.js`

## 功能函数分类

### 1. 数据与索引

目标：加载图鉴、招式、特性、道具、赛季可用列表、learnsets、usage、VGCPastes 数据，并构建查询索引。

无头 API：

```js
loadHeadlessDatasets(options)
ensureHeadlessLearnsets(datasets)
ensureHeadlessUsageData(datasets)
getDatasetSummary(datasets)
getSpeciesCatalog(datasets, filters)
searchSpecies(query, datasets, options)
searchMoves(query, datasets, options)
searchItems(query, datasets, options)
searchAbilities(query, datasets, options)
```

关键输出：

- `pokedex`
- `moves`
- `abilities`
- `items`
- `learnsets`
- `usage`
- `availableSpecies`
- `speciesIndex`
- `moveLookup`
- `itemLookup`
- `abilityLookup`

实现要求：

- Node 和浏览器都能加载。
- 数据缺失直接抛错，不能返回假成功。
- `usage.json` 可以懒加载，但调用 `ensureHeadlessUsageData()` 后必须明确成功或失败。

### 2. Showdown 导入导出

目标：把 Showdown 文本转成配置对象，并能反向导出。

无头 API：

```js
parseShowdownText(text, datasets, options)
parseTeamText(text, datasets, options)
parseLibraryText(text, datasets, options)
hydrateConfigList(configs, datasets, options)
exportConfigText(config)
exportTeamText(team)
exportLibraryText(library)
```

核心输入：

```js
{
  text: string,
  fallbackLevel: 50,
  language: "zh" | "en"
}
```

核心输出：

```js
{
  configs: Config[],
  feedback: ValidationFeedback[],
  errors: ValidationFeedback[],
  warnings: ValidationFeedback[]
}
```

保留语义：

- 识别物种、昵称、道具、特性、等级、点数、EV、性格、技能、备注。
- EV 到 Champions 点数的转换继续走现有规则。
- 对无法确定的 65 点转换目标直接报错，不做静默猜测。

### 3. 单只宝可梦构筑器

目标：给无 UI 调用者提供完整的组建单只宝可梦流程。

无头 API：

```js
createBuilderState(speciesId, datasets, seedConfig)
getAbilityOptions(speciesId, datasets)
getItemOptions(datasets)
getMoveOptions(datasets)
getLegalMoveIds(speciesId, datasets, options)
getMoveLegality(moveName, speciesId, datasets, options)
getBuilderStats(speciesId, points, nature, datasets)
validateBuilderState(builder, datasets)
buildConfigFromBuilder(builder, datasets)
```

构筑器对象：

```js
{
  speciesId: string,
  ability: string,
  item: string,
  teraType: string,
  nature: string,
  note: string,
  points: {
    hp: number,
    atk: number,
    def: number,
    spa: number,
    spd: number,
    spe: number
  },
  moves: string[]
}
```

校验输出：

```js
{
  points: ChampionPoints,
  total: number,
  moveChecks: MoveLegality[],
  errors: string[],
  warnings: string[],
  canSave: boolean
}
```

实现要求：

- 点数总和上限 66。
- 单项点数上限 32。
- 技能必须为 4 个，重复技能作为阻断错误。
- 非法技能、未知道具、非法特性作为 warning，保持现有行为。

### 4. 队伍编辑与队伍校验

目标：维护当前 0 到 6 只队伍，支持添加、删除、替换、排序、导入匹配和整体校验。

无头 API：

```js
createTeamEntry(config, options)
addTeamMember(team, config, options)
removeTeamMember(team, configId)
replaceTeamMember(team, configId, nextConfig)
moveTeamMember(team, configId, nextIndex)
validateTeam(team, datasets, options)
compareConfigs(baseConfig, nextConfig)
findBestLibraryMatch(importedConfig, library)
```

队伍校验项：

- 队伍人数不超过 6。
- 配置对象必须能解析出物种。
- 每只配置有 4 个技能。
- Champions 点数总和不超过 66。
- M-A 环境 Mega 数量限制按当前项目语义保留。
- 重复道具是否作为 warning 需要由 ruleset 决定，不能写死在 API 里。

### 5. 职能识别

目标：给单只配置打标签，并总结其队伍职能。

无头 API：

```js
analyzePokemonRoles(config, options)
getUtilityRoles(config, options)
getStructureRoles(config, options)
getRoleSummaryIds(config, limit, options)
getAttackBias(config)
buildRoleContext(library)
buildRoleMeta(library, datasets, options)
analyzePokemonDamageRoles(config, meta, damageEngine, options)
```

输出字段：

```js
{
  primary: string,
  secondary: string[],
  conditional: string[],
  compressionScore: number,
  compressionTier: "low" | "medium" | "high" | "fake",
  moveRoles: Array<{ moveName: string, roleIds: string[] }>,
  itemInfluences: Array<{ item: string, roleIds: string[] }>,
  dependencies: string[]
}
```

实现要求：

- 纯职能识别不依赖伤害计算。
- 伤害职能作为可选增强，必须显式传入 `damageEngine`。

### 6. 队伍整体分析

目标：分析当前队伍的抗性、打点、速度模式、核心组合、盲点和身份。

无头 API：

```js
analyzeTeam(team, speedTiers, language, library, preferences, options)
analyzeTeamText(teamText, datasets, options)
getDefensiveProfile(team, options)
getOffensiveProfile(team, options)
getBlindSpots(team, options)
getCoreSynergy(team, options)
getTeamIdentity(team, options)
```

核心输出：

```js
{
  defensive: TypeDefenseRow[],
  offensive: TypeOffenseRow[],
  offensivePairs: TypePairGap[],
  coverage: CoverageSummary,
  roles: TeamRoleSummary,
  cores: CoreSummary,
  speed: SpeedSummary,
  speedContext: SpeedContext,
  structure: StructureSummary,
  identity: TeamIdentity,
  weaknesses: WeaknessRow[],
  blindSpots: BlindSpot[]
}
```

实现要求：

- 输入为空队伍时返回 `null`，和现有 `analyzeTeam()` 保持一致。
- 分析函数不主动加载 usage 或 learnsets；需要的数据由调用者显式准备。
- `fieldState` 作为参数传入，不从网页状态读取。

### 7. 队伍构建推荐

目标：根据当前队伍和配置库给出补位、替换、Mega 候选和模板候选。

无头 API：

```js
recommendTeamMembers(payload)
recommendConfigs(library, team, speedTiers, language, options)
buildTemplateCandidates(datasets, library, language)
scoreRecommendationCandidate(candidate, context)
normalizeRecommendationPreferences(value)
normalizeRecommendationWeights(value)
getRecommendationScoreMix(teamSize, weights, options)
```

推荐输入：

```js
{
  team: Config[],
  library: Config[],
  datasets: Datasets,
  speedTiers: SpeedTier[],
  language: "zh" | "en",
  preferences: RecommendationPreferences,
  weights: RecommendationWeights,
  fieldState: FieldState,
  focusType: string,
  dismissedKeys: string[],
  megaOnly: boolean
}
```

推荐输出：

```js
{
  recommendations: RecommendationEntry[],
  scoreMix: RecommendationScoreMix
}
```

每条推荐保留：

- `recommendationScore`
- `breakdown`
- `recommendationAxes`
- `coveredThreats`
- `itemConflictMembers`
- `recommendationSource`
- `recommendationAction`
- `recommendationIgnoresCurrentMega`

实现要求：

- 推荐不得修改输入队伍和输入配置库。
- 空队伍和满 6 人队伍返回空推荐。
- 模板候选和配置库候选要在输出里区分来源。

### 8. 速度线

目标：提供基础速度、场地速度、顺风、围巾、特性翻倍和戏法空间视角。

无头 API：

```js
calculateConfiguredSpeedTiers(library, options)
calculateSpeedLineTiers(entries, options)
getSpeedVariants(config, side, fieldState)
getEffectiveSpeed(config, side, fieldState)
compareInitiative(left, right, fieldState, leftSide, rightSide)
getHeldItemAdjustedSpeed(payload)
getChoiceScarfSpeedData(payload)
getPlusOneSpeedData(payload)
getDoubleSpeedData(payload)
```

速度线输出：

```js
{
  speed: number,
  totalCount: number,
  entries: Config[]
}
```

实现要求：

- `fieldState` 显式传入。
- 队伍成员和对手成员可以同时进入速度线，但要用 `matchupSide` 标记。

### 9. 对局分析

目标：分析己方队伍和对手队伍之间的首发、威胁、答案、速度线和矩阵。

无头 API：

```js
analyzeMatchup(team, opponentTeam, datasets, options)
analyzeMatchupText(payload)
buildMatchupBoard(payload)
buildLeadTurnOnePlan(pair, opponentTeam, fieldState)
getSuggestedMoveNamesForSpecies(speciesId, datasets, selectedMoveNames, limit)
resolveDamageMoveNamesForConfig(config, allyTargets, datasets)
```

文本入口：

```js
{
  teamText: string,
  opponentText: string,
  libraryText: string,
  datasets: Datasets,
  fieldState: FieldState,
  language: "zh" | "en"
}
```

核心输出：

```js
{
  overview: MatchupOverview,
  speedLines: SpeedTier[],
  leadPairs: LeadPairSummary[],
  allyThreats: ThreatSummary[],
  opponentAnswers: AnswerSummary[],
  board: MatchupBoard
}
```

实现要求：

- 任一队伍为空时返回 `null`。
- 对局缓存只在纯函数内部按输入 key 使用，不能依赖全局网页状态。
- 对局矩阵必须能在 CLI 中输出 JSON。

### 10. 伤害计算

目标：提供单对单伤害、攻方扫描、防方扫描、KO 概率和 roll 分布。

现状：

- `damage-workspace.js` 依赖浏览器 `Worker`。
- `damage-core-worker.js` 依赖 `importScripts` 和一组 jQuery shim。
- 真正计算在 `vendor/champions-damage-core/*`。

无头 API：

```js
createDamageEngine(options)
calculateDamagePair(payload)
scanAttackerAgainstTargets(payload)
scanAttackersIntoDefender(payload)
normalizeDamageField(field)
normalizeDamagePokemon(config, overrides)
```

单次伤害输入：

```js
{
  attacker: DamagePokemon,
  defender: DamagePokemon,
  field: DamageField
}
```

单次伤害输出：

```js
{
  leftHeadline: string,
  rightHeadline: string,
  leftMoves: DamageMoveResult[],
  rightMoves: DamageMoveResult[],
  attackerSpeed: number,
  defenderSpeed: number
}
```

`DamageMoveResult`：

```js
{
  moveName: string,
  damageText: string,
  koText: string,
  description: string,
  minPercent: number,
  maxPercent: number,
  damageRolls: number[]
}
```

伤害字段：

```js
{
  format: "Doubles" | "Singles",
  weather: string,
  terrain: string,
  gravity: boolean,
  independent: {
    neutralizingGas: boolean,
    fairyAura: boolean,
    darkAura: boolean,
    auraBreak: boolean,
    tabletsOfRuin: boolean,
    vesselOfRuin: boolean,
    swordOfRuin: boolean,
    beadsOfRuin: boolean
  },
  attacker: DamageSide,
  defender: DamageSide
}
```

实现要求：

- 第一阶段把 `damage-core-worker.js` 中的构建和计算逻辑抽成纯函数。
- 浏览器 Worker 只负责消息收发。
- Node CLI 直接调用同一套核心函数，不再使用 `new Worker()`。
- 超时逻辑不放在核心函数里；需要超时时由 CLI 或服务层显式控制。

### 11. 输出强度评估

目标：不用完整伤害计算，快速估算招式火力层级。

无头 API：

```js
calculateOutputStrengthTiers(configs, datasets)
buildOutputReferenceConfigs(datasets, language)
scoreMoveOutput(config, move, datasets)
```

输出：

```js
{
  score: number,
  totalCount: number,
  entries: OutputStrengthEntry[]
}
```

适用场景：

- 配置库火力排序。
- 推荐候选质量参考。
- 无需对特定防守方时的粗略输出比较。

### 12. Usage 与样板配置

目标：读取使用率数据，生成常见配置文本，输出常见招式、道具、特性、队友和 counter。

无头 API：

```js
getUsageRows(datasets, options)
getUsageDetail(datasets, speciesId, options)
buildUsageConfigText(datasets, options)
formatUsageShare(value, digits)
buildSpeciesTemplateConfigs(species, datasets, language)
buildAvailableSpeciesOptions(datasets, library, language)
```

实现要求：

- `usage.json` 未加载时调用 usage API 要明确报错或返回空结果，由调用参数决定。
- `buildUsageConfigText()` 输出 Showdown 文本。
- 样板配置要继续遵守 Champions 点数和技能数量约束。

### 13. VGCPastes 与对手库

目标：无头查询 VGCPastes 队伍、生成对手库、匹配对手配置。

无头 API：

```js
filterVgcpastesTeams(teams, query, state)
buildOpponentLibrary(datasets, library, language)
findOpponentEntry(datasets, library, speciesId, language)
syncOpponentTeam(opponentTeam, datasets, library, language)
restoreOpponentTeam(opponentTeam, datasets, library, language)
buildCounterOpponentSelections(team, matchupLibrary, datasets, options)
```

实现要求：

- 查询函数返回数据对象，不返回 HTML。
- 对手库配置必须能直接传给 `analyzeMatchup()` 和伤害 API。

### 14. 战绩记录与统计

目标：保留战绩对象的创建、校验和统计能力，但不绑定浏览器保存。

无头 API：

```js
createBattleRecord(input)
validateBattleRecord(record)
upsertBattleRecord(records, record)
removeBattleRecord(records, id)
findBattleRecord(records, id)
migrateBattleRecord(raw)
computeGlobalStats(records)
computeTeamStats(records, team)
computeInsights(records, options)
```

实现要求：

- 不读写 `localStorage`。
- 调用者自己决定记录存储位置。

## 统一输入输出对象

### Config

```js
{
  id: string,
  source: string,
  speciesId: string,
  speciesName: string,
  displayName: string,
  note: string,
  types: string[],
  ability: string,
  item: string,
  teraType: string,
  nature: string,
  level: number,
  championPoints: ChampionPoints,
  moveNames: string[],
  moves: MoveSummary[],
  stats: Stats,
  validation: ValidationSummary
}
```

### ChampionPoints

```js
{
  hp: number,
  atk: number,
  def: number,
  spa: number,
  spd: number,
  spe: number
}
```

### FieldState

```js
{
  allyTailwind: boolean,
  opponentTailwind: boolean,
  trickRoom: boolean,
  allyFlags: Record<string, BattleFlags>,
  opponentFlags: Record<string, BattleFlags>
}
```

### ValidationFeedback

```js
{
  level: "error" | "warning",
  code: string,
  blockIndex: number,
  lineNumber: number | null,
  speciesId: string,
  configName: string,
  message: string
}
```

## CLI 设计

```bash
node tools/headless.mjs parse --team team.txt --pretty
node tools/headless.mjs analyze --team team.txt --library config-default.txt --pretty
node tools/headless.mjs recommend --team team.txt --library config-default.txt --pretty
node tools/headless.mjs matchup --team team.txt --opponent opponent.txt --library config-default.txt --pretty
node tools/headless.mjs damage --attacker attacker.txt --defender defender.txt --field field.json --pretty
node tools/headless.mjs usage --species incineroar --pretty
```

CLI 输出：

- 成功：JSON 写到 stdout。
- 失败：错误写到 stderr，退出码非 0。
- 不输出 HTML。
- 不吞异常。
- 不返回 mock 结果。

## 实施计划

### 第 1 阶段：建立无头入口

新增：

- `static/app/headless/index.js`
- `static/app/headless/datasets.js`
- `static/app/headless/showdown-api.js`
- `static/app/headless/schema.js`
- `tools/headless.mjs`

覆盖能力：

- 数据加载。
- Showdown 导入导出。
- 从文本输出配置 JSON。

验证：

```bash
node --check static/app/headless/index.js
node --check tools/headless.mjs
node tools/headless.mjs parse --team config-default.txt --pretty
```

### 第 2 阶段：构筑器与队伍校验

新增：

- `static/app/headless/builder-api.js`
- `static/app/headless/team-api.js`

覆盖能力：

- 物种列表。
- 特性、道具、技能选项。
- 技能合法性。
- 66 点校验。
- 单只配置构建。
- 队伍增删替换。

验证：

- 固定物种创建 builder。
- 固定 4 技能构建 config。
- 非法技能产生 warning。
- 超过 66 点产生 error。

### 第 3 阶段：分析、推荐、速度线

新增：

- `static/app/headless/roles-api.js`
- `static/app/headless/analysis-api.js`
- `static/app/headless/recommendation-api.js`
- `static/app/headless/speed-api.js`

覆盖能力：

- 单只职能。
- 队伍整体分析。
- 速度线。
- 推荐候选。

验证：

```bash
node tools/headless.mjs analyze --team team.txt --library config-default.txt --pretty
node tools/headless.mjs recommend --team team.txt --library config-default.txt --pretty
```

### 第 4 阶段：对局与 usage

新增：

- `static/app/headless/matchup-api.js`
- `static/app/headless/usage-api.js`

覆盖能力：

- 对局 overview。
- 速度线。
- 首发组合。
- 威胁与答案。
- matchup board。
- usage 详情和配置文本生成。

验证：

```bash
node tools/headless.mjs matchup --team team.txt --opponent opponent.txt --library config-default.txt --pretty
node tools/headless.mjs usage --species incineroar --pretty
```

### 第 5 阶段：伤害计算核心解耦

新增：

- `static/app/headless/damage-api.js`
- `static/app/headless/damage-core-adapter.js`

改造：

- 从 `static/workers/damage-core-worker.js` 抽出纯计算逻辑。
- `damage-core-worker.js` 保留 Worker 包装。
- `damage-workspace.js` 继续服务网页，但内部调用同一套 adapter。

覆盖能力：

- 单对单伤害。
- 攻方扫多防守方。
- 多攻方扫单防守方。
- roll 分布和 KO 文本。

验证：

```bash
node tools/headless.mjs damage --attacker attacker.txt --defender defender.txt --field field.json --pretty
```

### 第 6 阶段：输出强度、VGCPastes、战绩统计

新增：

- `static/app/headless/output-api.js`
- `static/app/headless/vgcpastes-api.js`
- `static/app/headless/battle-records-api.js`

覆盖能力：

- 火力 tier。
- VGCPastes 查询。
- 对手库生成。
- 战绩创建、校验和统计。

## Rust 重构计划

Rust 不直接复制网页结构。先按无头 API 分 crate 或模块。

```text
crates/
  poke-type-core/
    src/
      dex/
      showdown/
      builder/
      team/
      roles/
      analysis/
      recommend/
      speed/
      matchup/
      damage/
      usage/
      schema/
  poke-type-cli/
    src/main.rs
```

### Rust 模块职责

| Rust 模块 | 对应无头 API |
| --- | --- |
| `dex` | 数据加载、索引、名称归一化 |
| `showdown` | Showdown 解析和导出 |
| `builder` | 单只配置构建和校验 |
| `team` | 队伍编辑和整体校验 |
| `roles` | 职能识别 |
| `analysis` | 队伍分析 |
| `recommend` | 推荐打分 |
| `speed` | 速度线和先手比较 |
| `matchup` | 对局分析 |
| `damage` | 伤害计算 |
| `usage` | 使用率查询 |
| `schema` | serde 输入输出类型 |

### Rust 迁移顺序

1. 先定义 `schema`，对齐 JS headless 的 JSON。
2. 移植 `normalizeName`、点数、能力值、Showdown 解析。
3. 移植 `builder` 和 `team` 校验。
4. 移植 `speed` 和 `battle-semantics`。
5. 移植 `analysis`。
6. 移植 `recommend`。
7. 移植 `matchup`。
8. 最后处理 `damage`，因为当前伤害核心来自第三方 JS calc，迁移风险最高。

### Golden tests

每个 Rust 模块用 JS headless 输出做基准：

```text
tests/golden/
  parse/
  builder/
  analysis/
  recommend/
  matchup/
  damage/
```

测试方式：

1. JS headless 对固定输入输出 JSON。
2. Rust 对同一输入输出 JSON。
3. 对稳定字段做完全比较。
4. 对浮点分数允许小范围误差。
5. 对描述文本只比较关键字段，不比较完整中文句子。

## 验收标准

- `tools/headless.mjs` 能覆盖 parse、analyze、recommend、matchup、damage。
- 无头 API 不导入 `main.js` 和任何 `render*.js`。
- 同一份 Showdown 文本在网页和 CLI 中解析出的配置一致。
- 队伍分析和推荐输出包含当前网页需要的全部字段。
- 伤害计算输出包含四招伤害、反向伤害、速度、KO 文本和 roll 分布。
- 错误直接暴露，不返回假数据。
- Rust 方案以 JSON 契约为准，不和网页 UI 绑定。
