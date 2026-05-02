# Team Roles Completion 设计文档

- 日期：2026/05/02
- 范围：补全 `team-role-*` 职能判定，修复草系→`antisleep` 错判，把 future-todo `docs/future-todo-reference.md` §11 / §12 中 Layer 1 收尾 + Layer 3 damage-aware 接入到产品中
- 仍不涉及：Layer 4 meta-aware 反制位（依赖热门威胁清单维护），太晶职能（M-A 赛季禁太晶，等下个赛季）

## 1. 触发动机

1. 用户报告：草系同时贡献 `powderimmune` 与 `antisleep` 不合理。**草系/防尘/防尘镜只挡粉末招式（蘑菇孢子、催眠粉、麻痹粉、棉花孢子、愤怒粉），不挡催眠术、唱歌、哈欠、恶魔之吻、草笛**。盘蜷+催眠术的美纳斯仍能让草系睡过去。
2. `future-todo §12.4` 要求按 Layer 1/2/3/4 推进，目前 Layer 3 完全未接，damage-aware 职能（wallbreaker / revengekiller / utilitypokemon / endgamewincondition / threatcheck / backlinecleaner）未在 UI 暴露。
3. Layer 1 仍有少量遗漏（`SETUP_MOVES` 缺 shellsmash/geomancy 等、`OFFENSIVE_DEBUFF_MOVES` 缺 nobleroar/tickle、`CLERIC_MOVES` 缺 floralhealing）。

## 2. 用户决策（已确认）

| 决策 | 选择 |
|---|---|
| 改造范围 | A + Layer 3 damage-aware（不做 Layer 4 meta-aware） |
| META 来源 | 三段式：真实使用率（`champions_vgc.json` 的 `usage` 块）→ VGCPaste 团队频次（`pokepaste_cache.json`）→ 当前配置库 |
| 扫描时机 | 打开分析页时后台异步扫描 + LRU 缓存 |
| 总方案 | 「方案 1」：13 个文件改动（4 新增 + 9 修改）+ 5 原子 commit + SW bump |

## 3. 模块拆分（沿用 4 层架构）

```
team-role-rules.js              [改] 规则常量
team-role-metrics.js            [改] 纯统计指标
team-role-deterministic.js      [改] 单招/单道具映射
team-role-deterministic-i18n.js [改] i18n 收尾文案
team-role-extra.js              [改] anti-* 与 proxy 综合判定
team-role-config-only.js        [改] 纯配置规则
team-role-i18n.js               [改] ZH/EN 文案
team-role-explanations.js       [无] visibility 控制不变
team-role-analysis.js           [改] 主入口，加 Layer 3 接入点
team-roles.js                   [改] re-export 增加 meta/damage 模块
team-role-meta.js               [新] META pool 三段式构造
team-role-damage.js             [新] damage-aware 职能 + 扫描调度
team-role-damage-cache.js       [新] localStorage LRU 缓存
team-role-damage-i18n.js        [新] damage-aware 6 个新职能 i18n
```

每个文件 < 200 行（CLAUDE.md 硬约束）。

## 4. 草系→antisleep Bug 修复

### 4.1 引入新独立标签 `antipowder`

| 来源 | 旧标签（错） | 新标签（对） |
|---|---|---|
| 草系 | `powderimmune + antisleep` | `powderimmune + antipowder` |
| 太晶草 | `antisleep` | `antipowder` |
| Overcoat 防尘 | `powderimmune + antisleep` | `powderimmune + antipowder` |
| Safety Goggles 防尘镜 | `powderimmune + antisleep` | `powderimmune + antipowder` |
| Insomnia 不眠 | `antisleep` ✓ | `antisleep` ✓ |
| Vital Spirit 干劲 | `antisleep` ✓ | `antisleep` ✓ |
| Sweet Veil 甜幕 | `antisleep` ✓ | `antisleep` ✓ |
| Comatose 绝对睡眠 | （无） | `antisleep` ✓（新增） |
| Electric Terrain setter | （无） | `antisleep`（新增，只对接地目标，tooltip 注明） |
| Misty Terrain setter | （无） | `antisleep`（新增，只对接地目标，tooltip 注明） |

### 4.2 改点清单

- `team-role-rules.js:51` — `SLEEP_IMMUNE_ABILITIES` 删除 `overcoat`，加入 `comatose`
- `team-role-analysis.js:133-134` — 拆分：`hasPowderImmunity` → `antipowder`；`hasTrackedAbility(SLEEP_IMMUNE_ABILITIES) || isElectricTerrainSetter || isMistyTerrainSetter` → `antisleep`
- `team-role-extra.js:222` — 同步改造，去掉 `hasTeraType(GRASS_TYPE)` 走 `antisleep` 的路径，改为 `antipowder`；`SLEEP_IMMUNE_ABILITIES`/电气场地/薄雾场地三选一才出 `antisleep`
- `RECOMMENDATION_ROLE_IDS` — `antisleep` 保留进推荐评分；`antipowder` 不进推荐评分（避免重复打分）
- `team-role-i18n.js` — 新增双语 `analysis.role.antipowder` / `analysis.roleDesc.antipowder` / `analysis.roleReason.antipowder`

### 4.3 验证用例

| Pokemon 配置 | 期望 |
|---|---|
| 草系 + Spore | `sleep` + `powderimmune` + `antipowder`（无 `antisleep`） |
| 美纳斯 + Coil + Hypnosis | 草系受其攻击不应 `antisleep`，本身 `setup` + `sleep` |
| Tapu Koko（Electric Surge） | `antisleep` ✓ |
| Slaking + Truant 不变 + 单一 `antisleep`（仅 ability 时） | 否 — Truant 不防睡眠，不出 `antisleep` |
| Cresselia + Lunar Dance + Insomnia | `antisleep` ✓ |
| Sleep Talk 持有者 | 仍正常被睡，无 `antisleep` |
| Komala（Comatose） | `antisleep` ✓ |

## 5. Layer 1 收尾

| 集合 | 增补 | 原因 |
|---|---|---|
| `SETUP_MOVES` | shellsmash, geomancy, victorydance, noretreat, growth, focusenergy | future-todo §11.4 |
| `OFFENSIVE_DEBUFF_MOVES` | nobleroar, tickle | §12.3 |
| `CLERIC_MOVES` | floralhealing | §11.5 |
| `STAT_DROP_MOVES` | nobleroar, tickle, babydolleyes | 联动降攻 |
| 单招映射 + i18n | nobleroar, tickle, floralhealing | 显式标签 |
| `WEATHER_ABUSER_MOVES` | morningsun, synthesis | 阳光 2/3 回复 |

每条都补 zh/en + tooltip。

## 6. META 三段式构造（`team-role-meta.js`）

### 6.1 入口

```js
buildRoleMeta(library, datasets, options) → {
  source: "usage-stats" | "vgcpastes" | "current-library" | "empty",
  entries: MetaEntry[],
  weightTotal: number,
  warnings: string[],
}

MetaEntry = {
  speciesId,
  speciesName,
  config: { moves, item, ability, teraType, championPoints, nature },
  weight,
  source,
}
```

### 6.2 优先级

```
Step 1: datasets.championsVgc.usage.status === "available"
  取 usage.data top-24 by usage 字段
  每只用 buildEntryFromUsage(profile, datasets) 生成配置：
    moves: Moves top-4 (按命中频次排序)
    item: Items top-1
    ability: pokedex.abilities[0]（usage 不直接给 ability）
    spread/nature: Spreads top-1（用 showdown.js 的解析器拆 EVs:/Nature:）
    teraType: profile.Tera 中 top-1 或 ""
  weight = profile.usage（百分位 0~1）
  source = "usage-stats"

Step 2: pokepaste_cache 非空
  data.js 加载时把 paste.text 用 showdown.js parser 拆成单只配置
  按 speciesId 聚合次数 + 最常见 moves/item/ability
  挂到 datasets.pasteSpeciesCounts（一次性算好）
  取 top-24，weight = count / totalPasteCount
  source = "vgcpastes"

Step 3: library 兜底
  entries = library 直接拷贝，weight = 1 / library.length
  source = "current-library"
  warnings = ["fell back to library"]

Step 4: 空库 + 无 usage + 无 paste
  source = "empty", entries = []
```

### 6.3 不静默 fallback

每次降级把 warnings 写到 `roleProxyStatus`，UI 用「数据来源：使用率统计」/「VGCPaste 团队频次」/「当前配置库」/「无可用 META」明文标注。

## 7. Layer 3 damage-aware 职能（`team-role-damage.js`）

### 7.1 入口

```js
async function analyzePokemonDamageRoles(config, meta, scanner) {
  const ohkoRate = await computeOHKORate(config, meta, scanner);
  const ohkoLowHpRate = await computeOHKORateAtHp(config, meta, scanner, 0.5);
  const twoHkoRate = await compute2HKORate(config, meta, scanner);
  const twoHkoBulkyRate = await compute2HKORateAgainstBulky(config, meta, scanner);
  const survivePhysRate = await computeSurvivePhysRate(config, meta, scanner);
  const surviveSpRate = await computeSurviveSpRate(config, meta, scanner);
  ...
}
```

### 7.2 6 个 damage-aware 职能

| roleId | 触发规则 |
|---|---|
| `wallbreaker` | `2HKO_rate(meta_high_bulk) >= 0.50` |
| `revengekiller` | `(speed_rank≥0.80 ∨ has_priority ∨ has_scarf) ∧ OHKO_rate(meta_low_hp@50%)≥0.60` |
| `endgamewincondition` | `(survive_phys_rate≥0.50 ∨ survive_sp_rate≥0.50) ∧ (recovery ∨ setup ∨ speed_rank≥0.80)` |
| `utilitypokemon` | `support_move_count≥2 ∧ OHKO_rate<0.25` |
| `threatcheck` | `OHKO_rate(meta top-8)≥0.50` |
| `backlinecleaner` | `(speed_rank≥0.75 ∨ has_priority) ∧ OHKO_rate(meta_low_hp@50%)≥0.60` |

注：`backlinecleaner` 与 `revengekiller` 触发相似，区别只在阈值（这里 backlinecleaner 速度门槛更低、强调 cleanup 而非 revenge），允许同时出现。

### 7.3 复用 damage-workspace

直接用现有 `damage-workspace.js` 的 `scanAttackerAgainstTargets` / `scanAttackersIntoDefender`。每只 pokemon ≈ 24 META × 2 方向 = 48 次 worker 调用。`team-role-damage.js` 不直接 import damage-workspace；由 main.js 注入实例（解耦 + 测试友好）。

### 7.4 缓存（`team-role-damage-cache.js`）

```
key = sha1(configHash + metaHash + fieldDefaultsHash)
LRU 50 条 → localStorage["pokeTypeDamageRoleCache"]
入口：getCached(key) / setCached(key, result) / clear()
```

### 7.5 不静默吞错

scanner 不可用 / worker 失败 → `damageRoles = []` + `unavailableReason` 显式返回。绝不退回到只看种族值。

## 8. UI 落地

### 8.1 分析页 META 来源条（`render-analysis.js`）

```
┌─────────────────────────────────────────────────────────────┐
│ 📊 META 来源：使用率统计（24 只，2026-04 数据）  扫描中 ⏳    │
│ └ 已完成 8 / 24，已得出 wallbreaker / revengekiller…        │
└─────────────────────────────────────────────────────────────┘
```

四种状态文案：见 i18n 表（§9）。

### 8.2 单只卡 damage-aware 区块

主职能 / 副职能 / 技能格映射 / 道具影响 之后追加：

```
🎯 Damage-aware 职能（基于 24 只 META 扫描）
   wallbreaker · revengekiller · endgamewincondition
   ├ OHKO 0.32 · 2HKO 0.68 · 2HKO(bulky) 0.51
   └ 物理承伤 0.42 · 特殊承伤 0.55
```

默认折叠指标行，hover 展开。扫描中显示骨架占位。

### 8.3 推荐页（`render-recommendations.js` + `recommendations.js`）

`RECOMMENDATION_ROLE_IDS` 加入 `wallbreaker / revengekiller / endgamewincondition / utilitypokemon`。**仅当 META 可用 + 扫描完成**才注入推荐评分；否则推荐页底部显示「damage-aware 职能未参与本次推荐」。

### 8.4 配置库卡 / VGCPastes 团队卡

仅在缓存命中时 chip 形式显示 damage-aware 职能；未命中不主动 trigger（避免每开一张卡都跑扫描）。

## 9. i18n（共增 ≈ 30 条）

新增到 `team-role-damage-i18n.js` + `team-role-i18n.js`：

| roleId | ZH | EN |
|---|---|---|
| antipowder | 反粉末 | Anti-Powder |
| wallbreaker | 破盾手 | Wallbreaker |
| revengekiller | 反杀手 | Revenge Killer |
| endgamewincondition | 残局胜利点 | Endgame Win Condition |
| utilitypokemon | 工具人 | Utility Pokémon |
| threatcheck | 热门威胁检查 | Threat Check |
| backlinecleaner | 后排收割 | Backline Cleaner |

META 状态：

| key | ZH | EN |
|---|---|---|
| analysis.metaSource.usageStats | 使用率统计（{n} 只 META，{month}） | Usage stats ({n} META, {month}) |
| analysis.metaSource.vgcpastes | VGCPaste 团队频次（{n} 只 META） | VGCPastes team frequency ({n} META) |
| analysis.metaSource.currentLibrary | 当前配置库（{n} 只）— 缺使用率与 paste 数据 | Current library ({n}) — usage & paste data unavailable |
| analysis.metaSource.empty | 无可用 META — damage-aware 职能未参与 | No META available — damage-aware roles disabled |
| analysis.damageScan.scanning | 扫描中 ⏳（{done}/{total}） | Scanning ⏳ ({done}/{total}) |
| analysis.damageScan.ready | 已就绪 | Ready |
| analysis.damageScan.failed | 扫描失败 | Scan failed |

## 10. Service Worker bump

`sw.js` 顶部 `CACHE_VERSION` 由当前值递增到 `poke-type-v?-20260502-team-roles-completion`。涉及的 SW 关注路径全部命中 CLAUDE.md 列出的 `static/app/*.js`。

## 11. 风险与缓解

| 风险 | 缓解 |
|---|---|
| damage scan 性能（48×6=288 次/页） | LRU 50 cache + Promise.all 并发 8 + idle 调度 |
| localStorage 上限 | LRU 50 + 单条只存数值字段，估算 < 50KB |
| META 解析失败 | try/catch + 显式 warning |
| Pokepaste 解析成本 | 一次性挂到 `datasets.pasteSpeciesCounts` |
| 现有同步流程被破坏 | `analyzePokemonRoles` 入口签名不变 |
| antisleep 语义改变（推荐评分会变） | commit message 显式说明 |
| i18n 漏文案 | 默认 fallback 到英文 key 而非中文裸字符串 |
| Tera 草误识别 | 扫一遍 paste 队伍中所有草系/防尘镜/防尘 pokemon |

## 12. 验证步骤

```bash
# 1) node --check 全部动过的文件（17 个）

# 2) python -m http.server 8000；浏览器手测：
#    - 草系 + Spore：powderimmune + antipowder + sleep（无 antisleep）
#    - 美纳斯 vs 草系：草系仍可被催眠
#    - Tapu Koko：antisleep ✓
#    - Komala：antisleep ✓
#    - 关掉 usage 模拟 fallback→VGCPaste
#    - 删除 paste cache 模拟 fallback→library
#    - 重命名 worker 文件模拟 scanner-failed → damage-aware 不显示 + UI 提示

# 3) DevTools localStorage 检查 pokeTypeDamageRoleCache 存活并 < 50KB

# 4) 性能：分析页打开 → DevTools Performance 录制 → 确认主线程不阻塞 > 200ms
```

## 13. 落地里程碑（5 个原子 commit）

| Milestone | 文件范围 | Commit message 摘要 |
|---|---|---|
| M1 Bug 修复 + Layer 1 收尾 | rules / deterministic / extra / config-only / analysis / metrics / i18n | `fix(roles): split antipowder from antisleep + Layer 1 setup/cleric/debuff fills` |
| M2 META pool 模块 | team-role-meta.js (新) + data.js | `feat(roles): META pool builder with usage→paste→library tiering` |
| M3 Damage scan 模块 | team-role-damage.js / team-role-damage-cache.js / team-role-damage-i18n.js (新) | `feat(roles): Layer 3 damage-aware role detection (6 roles)` |
| M4 UI 接入 | render-analysis / render-recommendations / recommendations / recommendation-scoring / main | `feat(roles): expose META source + damage-aware roles in analysis & recs` |
| M5 SW bump + 文档 | sw.js + 本文档 + future-todo-reference 状态更新 | `chore(sw): bump cache for team-roles completion + update docs` |

每个 commit 独立可 revert。M1 / M2 / M3 之间没有强依赖（M3 import M2 但用 try/catch 优雅降级）。

## 14. 不在本次范围

- Layer 4 meta-aware（`corecheck`、`bait`、`tradepiece`、`wincondition` 完整版）
- 太晶职能（M-A 赛季禁太晶）
- 三人 core / 招式协同
- 速度工作台 / EV 编辑器
- 随机组队生成器
