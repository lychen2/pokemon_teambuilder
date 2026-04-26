# poke-type 优化建议全集

> 面向的对象：仓库 `poke-type`（纯静态 Pokémon VGC Champions 队伍组建与分析工具）。
>
> 审阅时间：2026/04/19。
>
> 实现进度更新：2026/04/26（三期核心回写：#24、#30 已落地；分析增强回写：#9、#10、#19 已落地；四期效率增强回写：#33、#41、#46 已落地，详见对应条目现状段）。2026/04/20 的二期核心回写：#37、#44、#57、#68 已落地。一期已落地 22 项：#1、#2、#3、#4、#5、#8、#11、#12、#16、#18、#20、#22、#23、#29、#31、#32、#34、#35、#36、#39、#40、#64；#14、#66、#75 仍为"部分完成"。另按用户反馈撤除了一批战况 UI toggle，详见 #1/#3/#4/#5 的"当前现状"段）。
>
> 本文档目的：对现有代码做一次"算法 + UI + 架构 + 数据 + 可访问性"的横向盘点，列出**可落地**、**可实测**的优化建议。每一条都给出"现状定位 → 为什么是问题 → 建议做法 → 预期收益"四段式描述，避免停留在观感层。

文档结构：

1. 算法准确性与语义完整性（14 条）
2. 算法深度与打分建模（7 条）
3. 伤害计算与伤害展示（7 条）
4. 对战盘 / 对局分析体验（6 条）
5. UI 交互与信息架构（10 条）
6. 数据可视化与洞察呈现（6 条）
7. 可访问性、国际化与响应式（6 条）
8. 性能、渲染与打包（7 条）
9. 数据层、持久化与错误处理（6 条）
10. 工作流与功能扩展（6 条）

总计 **75 个**可执行优化点（远超题目要求的 40 个），其中一期核心已完成 11 项，本文对应条目已标注状态并回写现状。读者可以先看"高价值 20 条"列表（文末附录 A）。

状态标签说明：

- `已完成（一期）` / `已完成（二期）`：已在当前代码中落地，可继续做更深一期的优化。
- `部分完成`：核心路径已接入，但仍有明确剩余缺口。
- `未开始`：仍保持原建议状态。
- `未开始（评估后暂缓）`：做过原型但用户评估后认为价值不足，已回滚；记录失败原因以便以后重做。

---

## 零、Champions 环境前提（阅读本文前先看这段）

本工具服务的是**宝可梦 Champions**规则——一个基于 VGC 双打骨架、但带有 Mega 进化 + 66 点制的独立赛事环境。**2026/04/20 赛季所处的是 Champions M-A（Mega Evolution）环境**，Champions 不同赛季之间会切机制。M-A 的关键约束：

- **允许 Mega 进化**（回合开始前声明一只 Mega，全程按 Mega 形态计算）。
- **禁用太晶（Tera）**：虽然本工具里 `battle-semantics.js` 的太晶语义仍在、配置里仍可填 `Tera Type:`（便于跨赛季复用同一份配置库），但在 M-A 赛季中"太晶"永远不会触发、不应参与评分结论。
- 无 Z 招、无极巨（Dynamax）。

所有打分、速度线、UI 判断都建立在下列规则上：

- **点数制而非 EV 制**：总计 **66 点**，单项上限 32 点；`HP = 种族值 + 75 + 点数`，其余五项 = `种族值 + 20 + 点数`。`Points:` 优先于 `EVs:`；仅给传统 EV 时前端自动压成 66 点。
- **默认满 IV**，不存在减 IV 配置。
- **性格**对非 HP 项 ×1.1 / ×0.9；攻击面 (Atk/SpA/Spe) 和防御面 (HP/Def/SpD) 的 66 点分配会明显影响"能不能先手 / 能不能 2HKO"。
- **规则集**：Champions 双打 6 选 4 + 同时 2 只出场；**M-A 季不允许太晶**；故 #13 的"应当移除 Mega"论点在 M-A 不适用（反之 Mega 系 M-A 的核心机制）。
- **高频机制**：Fake Out、Intimidate、Follow Me / Rage Powder（引导）、Wide Guard（范围保护）、Quick Guard（先制保护）、Protect（单体保护）、Tailwind（顺风，四回合）、Trick Room（戏法空间，五回合速度反转）、Helping Hand（帮助 ×1.5）、Grassy/Electric/Psychic/Misty Terrain（场地效果）、天气（Sun/Rain/Snow/Sand）、Mega 进化带来的新属性与能力。
- **群攻招式伤害折扣（spread move 0.75×）**：在双打里一次命中多个目标的招式（Earthquake、Rock Slide、Heat Wave、Surf、Blizzard、Dazzling Gleam 等）对每个目标打 **0.75 倍**伤害；只命中一个目标时（比如 Earthquake 友方 Levitate、另一半 Protect）恢复 1× 单体伤害。下文 #13 的 `spreadMoveMultiplier: 0.75` 就是对这个折扣的编码开关——在单打 ruleset 下会切回 1×，故需要 ruleset context 管理而不是硬编码。
- **速度分档（66 点制典型）**：Spe 32 点 + ×1.1 性格 = 最快档；Scarf 再 ×1.5；顺风 ×2；`Tailwind + Scarf` = ×3（相当于基速 ×3×1.5）。一只基速 100 满速可以到 170，穿 Scarf 可破 255，上顺风直逼 510。Mega 进化后速度种族会重算，工具里应把 Mega 形态作为独立候选而不是 post-hoc 修正。本工具的速度对比都以这几档比较。
- **多段技计算（2026/04/20 修复）**：伤害工作台现在对多段技按下列默认击打次数计算：Dragon Darts / Double Kick / Dual Wingbeat 等固定 2 段的招式默认 2 次；Rock Blast / Bullet Seed 等 2-5 段的招式默认 3 次（Skill Link → 5，Loaded Dice → 4）；Triple Axel / Triple Kick 默认 3 段（每段 BP 递增 ×1 / ×2 / ×3 由 vendor 计算处理）；Population Bomb 默认 10 段；Beat Up 暂默认 1 段（视队伍规模）。验证 case：Quaquaval（Moxie，32 Atk 点，Adamant）Triple Axel 对 Garchomp（4× Ice 弱点）现在稳 OHKO，不再像之前只算第一段那样 ~30% 伤害。
- **读懂术语**：
  - **先发（lead）** = 第一回合同时出场的两只 / 首回合你决定谁先动手。
  - **联防三角** = 互相覆盖彼此弱点的组合（火 / 水 / 草，鬼 / 恶 / 超，龙 / 钢 / 妖，等）；在双打里 "一个四倍弱点" 远不如 "缺了联防组合" 危险。
  - **spread move** = 群攻招式；双打里命中多个目标时每目标 ×0.75，命中单目标时恢复 ×1。
  - **re-direct** = 把对方单体技全拉到 Follow Me / Rage Powder 使用者身上，保护真正的主攻手。
  - **Mega 进化** = 回合开始前声明该只 Mega，全回合都按 Mega 形态的种族、属性、特性计算；一场比赛通常限 1 只（看 ruleset 微调）。

本工具的核心诉求：**在组队阶段就能看见这些机制带来的效果**，而不是等上分实战才察觉。下面所有建议都是按 Champions 双打的这些假设评估的；标 `已完成` 的项都配有"你在 UI 上怎么感知"段。

### 代码维护者必读：SW 缓存

**2026/04/20 起本仓库启用了 Service Worker（`sw.js`）做离线 precache。** 只要改了以下目录下的文件，请务必把 `sw.js` 顶部的 `CACHE_VERSION` 字符串递增（例如 `poke-type-v2-20260420` → `poke-type-v3-20260421`），否则用户刷新时仍会拿到旧的缓存文件——典型症状是"改了算法但页面表现没变"或"译名掉了又好了"的伪玄学：

- `static/app/*.js`、`static/app/recommendation-scoring/*.js`
- `static/workers/damage-core-worker.js`
- `vendor/champions-damage-core/*.js`
- `static/css/*.css`
- `poke_analysis-main/stats/*.json`（数据层也会被 precache）
- `index.html`

CI / 发布前建议用 `grep CACHE_VERSION sw.js` 自查；真正健壮的做法是把这个字符串改为基于内容 hash 的自动注入（见 #68 剩余建议），暂未落地。

### 修复历史（快速记账）

- **2026/04/20** 修复伤害工作台的多段技 bug——`static/workers/damage-core-worker.js` 的 `buildMove` 过去把所有 `hitRange` 都按"最小值或 1"处理，导致 Dragon Darts 被算成 1 段、Rock Blast 被算成 2 段、Triple Axel 被算成 1 段。现已改为 `resolveMoveHits(defaults, ability, item)`：标量 hitRange 直接采用；`[2, 5]` 根据特性/道具区分 3 / 4 / 5 段；`[1, 3]` 按 3 段（Triple Axel、Triple Kick）；`[1, 6]` 保守按 1 段（Beat Up 由用户手动调）；其余取 max（Population Bomb → 10）。同步 bump SW `CACHE_VERSION = poke-type-v2-20260420` 让旧缓存失效。

---

## 一、算法准确性与语义完整性

### 1. 属性相克计算完全忽略"太晶"机制 `已完成（一期）`

**当前现状**：已新增 `static/app/battle-semantics.js`，由 `getEffectiveTypes(config, options)` 统一提供当前有效属性。队伍分析、对局分析、推荐与速度线均已接入该语义层。**2026/04/19 用户反馈后撤除交互控件**：原先分析页的「原始属性 / 全队按太晶看」切换、以及队伍卡/对面卡上逐只的「太晶」toggle 已全部移除；取而代之，分析页会在队伍中有 `teraType` 时自动渲染 `.analysis-tera-hint` 被动提示，直接列出每只的太晶属性，让用户在脑内做"要不要太晶"的判断。底层 `fieldState.allyFlags[id].terastallized` 语义保留，将来如需恢复交互只需再挂 UI。

**剩余问题**：当前实现只支持"常规单属性太晶"。`Stellar`、Terapagos/Ogerpon 的专属太晶规则仍未建模，属于后续专项。

**后续建议**：

1. 追加 `Stellar` 太晶与 Terapagos/Ogerpon 的专属处理。
2. 若后续需要更强对比，可在分析页补"原始 / 太晶并列双视图"而不是只做二选一切换。
3. 若要继续扩展伤害面板，应让其直接复用 `getEffectiveTypes` 语义而不是另起一套太晶逻辑。

**当前收益**：分析、推荐、对局三条链路已经不再基于固定原始属性得出结论，结论可信度明显提升。

---

### 2. 对带特殊类型作用的招式未做例外处理 `部分完成`

**当前现状**：已在 `static/app/battle-semantics.js` 中引入统一的 `getMoveEffectiveness(move, attacker, defender, options)`，分析与对局评分已从"按招式属性"改为"按招式"求最佳打点。当前已覆盖 `Freeze-Dry`、`Flying Press`、`Thousand Arrows`、`Scrappy/Mind's Eye`、`Levitate`、`Mold Breaker/Turboblaze/Teravolt`、`Tinted Lens` 与 `Tera Blast`。

**剩余问题**：当前仍不是完整对战引擎。更多能力、场地、一次性效果和极特殊招式规则仍未展开，尤其是与天气/场地/专属机制交织的边缘 case。

**后续建议**：

1. 把当前内嵌在 `battle-semantics.js` 的特判规则抽成显式覆盖表，便于继续扩展与审计。
2. 继续补充高影响但尚未覆盖的特殊规则，优先级按"会显著改变推荐或对局结论"排序。
3. 若后续引入伤害批量矩阵，可直接复用这一层，而不是再在渲染层做一次属性例外修正。

**当前收益**：已经修正了一批最容易让分析结论跑偏的属性特判，能显著减少"工具说打不过，但实战明明有招式答案"的错位。

---

### 3. 威吓、顺风、麻痹、Trick Room 等状态对速度的影响未建模 `部分完成`

**当前现状**：已引入 `compute` 风格的统一速度语义：`battle-semantics.js` 中的 `getSpeedVariants / getEffectiveSpeed / compareInitiative` 已将顺风、麻痹、戏法空间、基础速度档、+1、围巾、双倍速能力统一到一个入口。**2026/04/19 用户反馈后撤除交互 toggle**：对局分析与常见速度线页面原先的「我方顺风 / 对方顺风 / 戏法空间」开关、队伍卡/对面卡上的「麻痹」toggle 全部移除。用户原话："实际分析的时候脑子自动做这个分析还是比较简单的，多一个选择反而降低了信息密度和分析效率"。`state.battleField` 结构仍在，`analyzeMatchup(..., {fieldState})` 接口原样保留，场况永远走 baseline，底层代码不用再为 toggle 改一遍。

**剩余问题**：`Unburden` 手动触发、`Slow Start` 回合数、Dragon Cheer 等更细场况仍未进模型和 UI；"威吓"本身不影响速度，原条目里这部分表述可视为审阅时的泛称，当前仍聚焦于真正会改速度排序的变量。

**后续建议**：

1. 把 `Unburden`、`Slow Start` 等需要回合/触发态的能力加入 `fieldState`。
2. 若后续做更强的速度教学视图，可把当前开关扩成"常见场况矩阵"而不只是单组 toggle。
3. 让伤害面板的速度判断也复用这套状态，而不是只给静态对比。

**当前收益**：速度线和对局推荐已经能基于真实场况一起变化，"我方顺风、对方 TR、某只被麻痹后还能否先手"不再需要用户自己心算。

---

### 4. 先制招式 / 优先级完全被忽略 `部分完成`

**当前现状**：`battle-semantics.js` 已支持招式优先级与 `Prankster`；`matchup-analysis.js` 的对位快照已加入 `priorityBonus`，并会考虑 `Dazzling/Queenly Majesty/Armor Tail` 等反先制能力。`team-roles.js` 中的 `priority` 标签也仍保留，用于角色层提示。

**剩余问题**：当前优先级主要影响对局分析与 pair 打分，还未把 "对面可被 Quick Guard 阻断" 这类明示信息展开成更细 UI 文案，也没有扩成完整的优先级层级教学表。

**后续建议**：

1. 把 `Quick Guard`、Psychic Terrain 等场上阻断因素也纳入统一可视化提示，而不只体现在分数里。
2. 若后续做先发剧本，可把"我方靠先制抢节奏"作为一类独立开局理由写出来。
3. 推荐系统若继续深化，可考虑给 `priority` 角色单独权重，而不只在对局打分中体现。

**当前收益**：对局分析已经不再把所有"慢但有先制"的角色误判为纯粹后手，首发推荐更接近真实 VGC 节奏。

---

### 5. 双打机制（Wide Guard / Follow Me / Helping Hand / 保护预测）在打分里几乎缺席 `部分完成`

**当前现状**：`matchup-analysis.js` 已在 pair 打分中加入 `redirection / wideGuard / helpingHand / protect` 四类 breakdown，并在推荐首发卡片中直接展开这些分项。对局分析不再只是一组单体压制分相加。

**剩余问题**：当前仍是启发式评分，不是逐回合动作模拟；保护、引导、广防的价值仍按静态局面估分，尚未结合完整 move target、场地和更细的换入价值。

**后续建议**：

1. 把当前启发式 breakdown 继续细化为"为什么这对首发高分"的短句解释，而不只显示数值。
2. 若后续引入更强对局剧本，可让这些分项直接参与"第一回合建议动作"生成。
3. 对 `Wide Guard` 的范围招识别仍可继续扩表，减少遗漏。

**当前收益**：工具已经开始体现 VGC 双打的联动品味，而不是纯粹把单体抗性和速度比较搬到 2v2 场景。

---

### 6. 特性评分表过于粗糙且存在事实错误

**现状定位**：`static/app/ability-scores.js` 是一张 0/20/40/60/80/100 五档的硬编码表，影响 `recommendation-scoring/quality.js:35-43` 的 quality.ability 分项。

**为什么是问题**：

- 第 50 行把 `Tailwind` 列为 100 分的"特性"，但 Tailwind 是招式不是特性。数据错误。
- 大量特性粒度过粗：`Regenerator`（顶级支援特性）被评 60，与 `Harvest`、`Trace`、`Own Tempo`一个档；`Intimidate` 给 100，但在有 `Clear Body/White Smoke/Defiant/Competitive/Own Tempo/Scrappy/Inner Focus` 组合的赛况里效果会打折。
- 没有"对战版本/阵容"上下文：`Protosynthesis` 在晴队是 100 级，在非晴队是 0。但现在只给了固定 60。
- 全表没有任何注释说明评分依据，无法审计。

**建议做法**：

1. 把 `RAW_ABILITY_SCORES` 改成带字段的对象：`{ base: 60, sunSynergy: 40, rainSynergy: 40, notes: "proto vs 晴，quark vs 电场" }`，打分时结合队伍当前天气/场地/队形把 synergy 分项加进去。
2. 修掉"Tailwind 是特性"这种结构性错误，顺手把重复出现的条目合并（如 `Chilling Neigh` 在数据中出现两次）。
3. 在数据来源里加一条 `source`，要么引自 Smogon VGC 使用率，要么引自手动标注。
4. 提供"我的定制评分表"：用户可以在 UI 里对特性手动打分，覆盖默认表。

**预期收益**：推荐结果的"quality"分项从粗粒度过滤器升级为细颗粒评估器，同阵容不同特性候选之间的差异会体现出来。

---

### 7. `team-roles.js` 的职能映射只给单一 Primary Role

**现状定位**：`team-roles.js:203-205` 的 `getStructureRoles(config)` 只返回 `[getPrimaryStructureRole(config)]`，即一个精灵只有一个结构角色（sweeper/frailsweeper/tank/support/bulkysupport）。而 `getPrimaryStructureRole` 里的阈值是硬编码（128/130/135/155/175/118/24）。

**为什么是问题**：

- 很多 VGC 核心精灵同时承担多重身份：Whimsicott 是 Tailwind setter + pivot + disruption + bulky support；Incineroar 是 Intimidate + bulky support + Fake Out + pivot；Amoonguss 是 redirection + sleep 扰乱 + tank。单一角色定义让这些精灵的价值被系统低估。
- 阈值是静态的，没区分双打 VGC 和单打 / Doubles OU 的差别。Garchomp 物攻 130 在单打是中等 sweeper，在 VGC 正规赛里更像 bulky offense。
- `FAST_ATTACKER_SPEED_THRESHOLD = 135` 会把速度 134 的 Dragapult 归为非 sweeper，显然不合理。

**建议做法**：把 `getStructureRoles` 改为返回打分后的多标签：`[{ id: "sweeper", confidence: 0.7 }, { id: "pivot", confidence: 0.4 }]`。阈值从全局常量改为在 `constants.js` 里按赛况分组（`VGC_REG_G`, `BSS`, `Smogon Doubles`）。"角色缺位"提示也改成"弱支持 / 强支持 / 过剩"三档。

**预期收益**：分析页的"角色雷达"能同时展现主副角色，推荐算法可以按"你缺 Fake Out 但有 pivot"给出更准确的补位建议。

---

### 8. 速度控制招式分类过度合并 `已完成（一期）`

**当前现状**：`team-roles.js` 已拆分为 `speedboostself`、`speeddebuff`、`paralysiscontrol` 三类，并保留 `tailwind` 作为显式标签。`analysis.js` 的速度模式判断和缺位提示也已改为基于新标签。

**剩余问题**：当前角色层已拆开，但如果后续继续做更细的对局剧本，还可以把"全队提速"与"局部点控速"再细分。

**后续建议**：

1. 若后续引入多标签结构角色，可把控速进一步做成强度/置信度而不只是存在性判断。
2. 可考虑在对局视图显式标出"这是顺风队 / 降速队 / 混合控速队"的摘要标签。

**当前收益**：分析页和推荐逻辑已经不再把 `Icy Wind/Electroweb/Thunder Wave` 误当作 Tailwind 队的等价物。

---

### 9. 进攻覆盖只基于"已配招式"，忽略潜在学习招式（有可能会有不适合的招式，还得基于使用率） `已完成（三期）`

**当前现状**：已新增 `static/app/coverage-potential.js`，分析页 `Coverage Gap` 不再只列"当前盲区"，还会同时生成 `offensiveGapCards`：对每个盲区扫描队内成员的合法 learnset，找出"当前没带、但可以改招补上"的候选。UI 上分成两类：

- **硬盲区**：当前队内没有成员能用合法可学伤害招式补上，保持红色告警。
- **可调招式修复**：当前配置缺招，但队内有人能学，显示为橙/绿建议卡，并展开"哪只可以补、推荐哪几招、最高能补到多少倍率"。

排序逻辑当前固定为：`克制倍率 > STAB > 基础威力 > 命中率`，每只成员只展示前 2 招，避免把分析页刷成招式表。

**剩余问题**：

1. 还没把使用率或招式常见度接进筛选，所以当前更偏"合法可学"而不是"实战常见"。
2. 目前只覆盖伤害招式补盲；像天气/场地/太晶才成立的补法还没做专题化建模。
3. 双属性盲区的建议已经能列，但还没扩成"建议替换哪一招"的 moveset 级 diff。

**当前收益**：分析已经从"指出你缺什么属性"升级成"直接告诉你队内谁能改招补上"，更接近真实组队迭代流程。

---

### 10. 核心对（Core）打分完全忽略招式联动 `已完成（三期）`

**当前现状**：已新增 `static/app/core-synergy.js`，把 core 协同拆成显式启发式规则，并接入 `analysis.js`：

- 双人 core 现在除了属性补位分，还会额外计算 `comboBonus`。
- core 卡片会显示 `synergyReasons`，例如 `Fake Out + Trick Room`、`引导保 TR`、`天气手 + 天气打手`、`控速位给主攻位让节奏`。
- `Cores` 页新增 **Best Trios**，用三人组合分数补足"双人能打但三人不成体系"的盲点。

当前 trio 评分由三部分组成：pair 分数聚合、三人壳层 bonus（如完整 TR 壳 / 完整天气壳 / 完整强化保护壳）和共享弱点惩罚。

**剩余问题**：

1. 目前仍是启发式规则，不是逐回合动作模拟。
2. 物种级的专属组合表还比较克制，暂时优先用了通用机制规则而不是硬塞 30~50 个手写 meta 组合。
3. `Wide Guard`、`Helping Hand`、更细场地/天气专属互补还可以继续补规则表。

**当前收益**：核心分析已经不再只是"谁能互补弱点"，而开始体现"这组人为什么能开局、为什么能展开、为什么值得一起上场"。

---

### 11. 对手 counter 生成的速度边际打分曲线不合理 `已完成（一期）`

**当前现状**：`opponent-team-generator.js` 已移除 `tanh(delta / 25)` 饱和曲线，改为按速度比的分段评分：`>2× / >1.2× / 近似同速 / <0.8× / <0.5×` 分档处理。这样顺风、围巾、双倍速这类真实对局里常见的巨大速度差不再被压平成差不多的分值。

**当前收益**：自动补对手时会更明确地区分"只是快一点"和"根本抢不到先手"这两类局面，counter 结果更贴近实战节奏。

**现状定位**：`opponent-team-generator.js:64-78` 的 `getSpeedEdgeScore` 用 `tanh(delta / SPEED_TANH_DIVISOR)`，其中 `SPEED_TANH_DIVISOR = 25`。

**为什么是问题**：`tanh(x)` 在 `x≈2.5` 就接近饱和 0.99。也就是说速度差超过 62 之后，再增加的速度差异在打分里几乎没贡献。但 VGC 里顺风 / Scarf / TR 的速度差动辄破百，线性差甚至三倍差的压制效果完全被压平。

**建议做法**：把缩放系数改成 `divisor = medianSpeedOfField * 0.4`（场上中位速度的 40%），动态按场况 rescale；或者放弃 tanh 换成分段线性：`{>2×speed: +6, >1.2×speed: +4, same: 0, <0.8×speed: -3}`。

**预期收益**：counter 生成更偏向真实"抢先手"差异，而不是无视速度差堆砌属性克制。

---

### 12. 组队推荐权重使用线性加法，不能表达"必须都满足" `部分完成`

**当前现状**：`recommendation-scoring/entry.js` 仍以线性加法为主体，但已加入硬门槛惩罚：当 `resistance < 1` 或 `coverage < 1` 时，总分乘以 `0.3`，并通过 `recommendationFloorPenalty` 参与排序。

**剩余问题**：当前只实现了默认硬门槛，还没有提供几何平均、更多 floor 项或高级评分模式切换。

**后续建议**：

1. 若后续需要更强可调性，再引入几何平均或高级评分模式开关。
2. 可把 `speed` 也纳入候选 hard floor，减少"整体太慢但总分仍靠前"的情况。
3. 如果继续增强可解释性，建议在推荐卡上明确标注"被 floor penalty 压分"。

**当前收益**：推荐列表已经能显著压低"本体很强但完全补不上当前队伍硬伤"的假阳性。

---

### 13. `recommendations.js` 的 Mega 限制（当前 M-A 环境下是正确行为，但 ruleset 抽象仍值得做）

**当前现状**：`recommendations.js:7` 有 `MAX_TEAM_MEGAS = 2`，对含 Mega 的候选做 cap。**2026/04/20 勘误**：Champions 当前处于 **M-A（Mega Evolution）环境**，允许 Mega 进化——所以这段约束在当下并非错配，而是**必要且合理的规则反映**。原条目里"第九世代 VGC 没有 Mega"的批评针对的是标准 VGC Reg G，不适用于 Champions M-A。

**现在还存在的问题**：

1. **硬编码魔数**：`MAX_TEAM_MEGAS = 2` 是否 2、1 还是其他，随 Champions 不同赛季的 ruleset 会变（某些 season 可能限制 1 只 Mega）。现在改数字要翻文件。
2. **无 ruleset 切换**：Champions 未来会引入多机制环境（Z / Dynamax / Stellar / 环境特化），工具需要知道当前处于哪一套规则。现状是"默认全开"。
3. **无 Gen 切换**：如果后续要支持同一份工具服务 Gen 6 VGC 或 Reg G 等非 Mega 环境，只能人工改常量。

**建议做法**：

1. 建立一个 `rulesetContext` 抽象：
   ```js
   {
     id: "champions-ma",
     allowMega: true,
     maxMegaPerTeam: 2,
     allowDynamax: false,
     allowZ: false,
     teraAllowed: true,
     spreadMoveMultiplier: 0.75,
     gen: 9,
   }
   ```
2. 把散在 `recommendations.js` / `champions-vgc.js` / `damage-core-worker.js` 的"魔数约束"统一路由到这个 context。
3. UI 里放个规则集下拉（M-A / Reg G / BSS / 自定义），默认 M-A；切换时 species pool、伤害计算参数、Mega 过滤都跟着变。

**预期收益**：

- 赛季换环境只需换一个 ruleset 常量，不再翻代码。
- 导入 Gen 6/7 形式的 Mega 配置时可以按 ruleset 判定"当前不允许 Mega → 警告"，避免静默接受。
- 未来本工具可复用到 VGC Reg H / 其他变体赛场。

---

### 14. `showdown.js` 的 Showdown 文本解析器不够健壮 `部分完成`

**当前现状**：解析器已补上 BOM / CRLF / tab 规范化，`EVs:` / `Points:` 允许无空格写法，首行 `@` 左右空格不再强依赖；并且导入阶段会对未识别行、坏掉的点数行、未知道具、非法特性、未知/非法招式给出逐段逐行提示。中文环境下还会把本地化后的种族、道具、招式、特性名注册进 lookup，支持直接粘贴中文队伍。**2026/04/19 追加**：`parseShowdownLibrary()` 已统一返回结构化 `feedback[]`，导入面板和队伍直导面板都能把 block / line 级问题渲染成表格；成功导入的配置对象会持续保留 `validation` 元数据，库卡和队伍卡会显示警示 pill。

**剩余问题**：当前仍是"显式前缀路由 + feedback"结构，还没有彻底抽成独立 token-stream/parser schema；反馈项里的 `message` 仍是导入时一次性生成的本地化文本，不是按 code+params 在渲染时二次翻译。

**现状定位**：`showdown.js:26-47` 的 `parseStatLine`、`extractSpeciesName`，以及 `createCustomConfig:241-289` 的逐行 `startsWith` 链。

**为什么是问题**：下列用户输入会被悄无声息地吞掉或解析错：

1. `EVs: 252HP/252Atk/4Spe`（无空格）——`parseStatLine` 的正则 `^(\d+)\s+([A-Za-z]+)$` 不匹配。
2. 首行出现昵称：`Goggles (Incineroar-Alola) (M) @ Safety Goggles`——`extractSpeciesName` 能抽到 `Incineroar-Alola` 但后续 `speciesIndex` 对 `incineroaralola` 这种带连字符 forme 的 lookup 依赖具体 pokedex 键。
3. CRLF / BOM / 制表符——`split(/\n/)` 后 `trim()` 只剥两端空白，中间的 `\r` 残留会破坏后续匹配。
4. 用户输错道具名如 `@ Choice Scaf`——当前直接保留原字符串，后续 `itemLookup` 查不到但不提示。
5. 中文名粘贴如 `炽焰咆哮虎 @ 防尘镜`——`speciesIndex` 里没收录中文别名（`data.js:7-14` 只注册了英文名和去符号版）。

**建议做法**：

1. 规范化：`text.replace(/\r/g, "").replace(/^\uFEFF/, "")`，`parseStatLine` 的正则允许空格缺失：`^\s*(\d+)\s*([A-Za-z]+)\s*$`。
2. 解析器改造成 token-stream：每行根据前缀路由到具体解析器，遇到未知前缀或无法解析的属性时推入 `warnings[]`，UI 专门展示。
3. 中日译名入口：`pschina-translation.js` + `i18n.js` 里已有译名映射；在 `buildSpeciesIndex` 阶段把中文名也注册进去。
4. 显式 schema：把 "Ability", "Level", "Tera Type", "EVs", "IVs", "Points", "Note", "备注", "Happiness", "Shiny" 等前缀集中在一张表里，方便增删。

**预期收益**：减少"我粘贴的队伍不全"这种支持成本；同时支持中文玩家复制粘贴中文队伍直接可用。

---

## 二、算法深度与打分建模

### 15. 使用率（Usage）数据只用单一档次

**现状定位**：`static/app/usage.js` 按单一 `usageLookup` 提供 teammate / move 使用率。`data.js:70-80` 也只加载一份 `usage.json`。

**为什么是问题**：Smogon / Pikalytics 等平台的 VGC 使用率按积分档分 1500/1630/1760 三档，顶级和普通局的 meta 分布差距极大。工具把低端数据当权威会推荐明显不符合高分段 meta 的搭档。

**建议做法**：把 `usage.json` 变成 `usage/{tier}.json` 多档，UI 提供档位选择；推荐打分用用户选择的档位；在推荐卡片底部标注"此推荐基于 1760 档使用率，采样 N 场"。如果只能有一份数据，也要把"数据版本 + 采样量 + 来源"落到页面上让用户知道权威度。

---

### 16. 使用率的队友相似度只看单向 `已完成（一期）`

**当前现状**：`opponent-team-generator.js` 的 `getSynergyScore` 已从单纯取 `max(shareAB, shareBA)` 改成按双向 share 的调和平均计算，对单向强、反向弱的伪联动做了自然惩罚。

**当前收益**：冷门配置不再因为"挂在热门主核旁边出现过几次"就被抬得过高，自动补对手的组合更稳定。

**现状定位**：`opponent-team-generator.js:172-183` 的 `getSynergyScore` 里 `Math.max(getUsageTeammateShare(a,b), getUsageTeammateShare(b,a))`。

**为什么是问题**：队友出现率本身是有方向的——"B 只有少数人用，用的人 50% 搭 A"和"A 是 meta 主力，5% 搭 B"意义不同。取 max 会拉高冷门精灵的联动分。

**建议做法**：把 max 改成"加权调和平均"：`score = 2 * shareAB * shareBA / (shareAB + shareBA + ε)`，对单向强相关但双向不一致的情况做惩罚。或者分别展示 "A→B 向"与 "B→A 向"两个数值，让用户决定。

---

### 17. 组队推荐的 `qualityBreakdown` 分项单位可疑

**现状定位**：`recommendation-scoring/quality.js:6-17` 的 `QUALITY_DAMAGE_PRODUCT_REFERENCE = 46000` 等常量，`QUALITY_OFFENSE_CAP = 1`。

**为什么是问题**：

1. `damageValue = offenseValue * speedValue`，其中 offense 和 speed 都是已"应用性格和 66 点"后的 stat 值。`46000` 是哪里来的参考值？用 Flutter Mane（spa≈175 × spe≈170 ≈ 29750）、Miraidon（spa≈185 × spe≈156 ≈ 28860）对比，都还不到 46000。参考基线偏高。
2. 各 cap（1 / 0.4 / 0.4 / 0.45 / 0.3 / 0.25 / 0.2）相加上限为 2.6，但 `SCORE_WEIGHTS.quality = 3`，永远用不到顶格。
3. 这些基线没有数据支撑，只是拍脑袋定的。

**建议做法**：用当前 `availableSpecies` 的实际分布做基线：对每项指标取 P90 值作为"满分线"，P50 做"中位线"。这样不同赛况数据自动调整 cap。配套加一个内部 dev 面板展示"当前 meta 候选的各项分布图"，方便调参。

---

### 18. 先发对推荐没有使用搜索剪枝，且从不缓存 `部分完成`

**当前现状**：`matchup-analysis.js` 已新增模块级 `MATCHUP_CACHE`，并对成员对成员快照、pair 对 pair 打分、整页对局结果做分层 memoization。场况变化也已进入 cache key，不会复用到错误结果。

**剩余问题**：当前已缓存，但还没有做 Top-K 剪枝；组合枚举规模本身仍在，极端情况下只是"重复计算少了"，不是"搜索空间缩小了"。

**后续建议**：

1. 若后续对局模块继续扩展，建议补 Top-K 剪枝，把缓存和搜索空间裁剪配套做完。
2. 若后续引入更多场况维度，cache key 需要继续显式纳入，避免命中脏结果。
3. 可以补一个轻量性能基准，记录 6v6 更新时的耗时回归。

**当前收益**：对局分析已从"每次都全量重复算"进化为"结果可复用"，是本轮改善交互手感的关键基础。

---

### 19. 推荐理由模板过于简短，缺少可解释性 `已完成（三期）`

**当前现状**：推荐系统已把理由从字符串数组升级为结构化的 `reasonItems[] / penaltyItems[]`。推荐卡片现在会显式分成两块：

- **主要加分**：按 score 倒序展示前几条正向理由，例如补当前承伤缺口、速度档契合、与当前队友同队率高、反制链价值高。
- **主要扣分**：展示重复属性、焦点弱点重叠、撞道具、对当前弱点帮助有限等负向项。

原有 breakdown 数字行仍保留，所以现在同时有"分项分数"和"人能读懂的话术"两层解释。

**剩余问题**：

1. 还没做"与次选对比"弹层，所以暂时只能看单卡解释，不能直接看 A 为什么压过 B。
2. `detail` 仍主要基于当前已有 breakdown 拼装，尚未扩成跨候选 delta 文案。
3. floor penalty 目前体现在分数和结果上，但尚未单独做成显式 badge。

**当前收益**：推荐页的信任感比之前高很多。用户现在能直接看到"为什么推它"以及"它差在哪里"，而不是只看到一个总分和几句短语。

---

### 20. 焦点属性（Focus Type）排序只做加分，不做强过滤 `已完成（一期）`

**当前现状**：推荐列表在焦点属性激活后，已先做 `focus > 0` 的硬筛，再按总分排序；当达标候选不足 5 个时，才把不达标条目标记为"焦点兜底"补在后面。

**当前收益**：选了焦点属性之后，推荐前排终于主要是"真的能补这个弱点"的候选，而不是总分高但焦点贡献很弱的假阳性。

**现状定位**：`recommendation-scoring/entry.js` 与 `recommendations.js:38-44` 的排序：先按 total score，再按 breakdown.focus。

**为什么是问题**：用户选了"补水系弱点"之后，期待看到的是"能抗/打水"的候选，而不是"总分最高但顺带扛水"的。当总分差大时 focus 根本影响不到前排顺序。

**建议做法**：Focus Type 激活时改为"硬筛 + 软排序"：

1. 先过滤：留下 `focus breakdown > 0` 的候选。
2. 再按照 total score 排序。
3. 如果过滤后候选 < 5，再把不达标的按 focus 分次高的放到后面兜底。
4. UI 上标注"因为你选了焦点类型，下方 3 个是回退候选"。

---

### 21. 伤害计算结果的速度对比只看单值，不做"race"

**现状定位**：`render-damage.js:285-307` 的 `speedVerdictMarkup` 仅比较 `attacker.speed` 与 `defender.speed`。

**为什么是问题**：VGC 伤害计算时要的往往是"在什么场况下我能先手"——比如"顺风下 Flutter Mane 能不能超过对方 Choice Scarf"。当前对比只呈现一组对照，没有快速切换场况的能力。

**建议做法**：把速度对比做成微型表格（4 种场况：无 / 我方顺风 / 对方顺风 / 双方顺风），每格显示"先手 / 同速 / 后手"；在 TR 场况下再单独一行反转显示。

---

## 三、伤害计算与伤害展示

### 22. 伤害结果只有一行文本，缺少可视化 `已完成（一期）`

**当前现状**：`static/app/render-damage.js` 的 `moveSummaryMarkup` 已在每张招式卡上插入 `damageBarMarkup` —— 一条水平条带显示 `minPercent` ~ `maxPercent` 区间，颜色按 maxPercent 分 `good / warn / bad / lethal` 四档（<25%/<50%/<100%/≥100%），右侧给出带 `tabular-nums` 的百分比区间，防守方 HP% 线以 `.damage-bar-hp` 呈现，随 `state.damage.healthPercent` 同步。底层 `summaryMove.minPercent / maxPercent` 已从 worker 传上来，只是之前一直没画出来。

**剩余问题**：

- OHKO / 2HKO / 3HKO 概率柱尚未分列（当前仍用原 `koText`）；
- 暴击翻倍区间未可视化；
- 16 颗伤害骰的分布没分档。

**后续建议**：

1. 给伤害条加一组"概率柱"（OHKO 红、2HKO 橙、3HKO 黄），用 `getKOChanceText` 背后的数据直接生成。
2. 暴击场景下再画一根副条并注明 `+crit`。

**当前收益**：调配阶段可以"一眼读完"，不再需要扫字识别百分比；Discord / 截图分享也更直观。

---

### 23. 招式滑动时无 debounce，伤害 worker 被高频触发 `已完成（一期）`

**当前现状**：三管齐下——

1. 主线程已有 `scheduleDamageSync`（`main.js:478-483`），slider `input` 事件走 180ms debounce，只在停手后发一次 postMessage。
2. `damage-workspace.js` 的 `syncPair` 在新的请求进来时，先把所有 pending 的旧 promise `resolve(null)` 清空，让主线程的等待 fast-fail。
3. `syncDamageWorkspace` 在 `requestId !== damageSyncRequestId` 或 `result === null` 时直接 `return`，既不改 state 也不触发 render，等于 worker 计算即便真的还没返回，结果也会被平滑丢弃而不是污染状态。

**剩余问题**：

- 依然没有 worker 内部的中断，冷计算本身仍会跑完；
- HP% number input 目前走 `change` 事件（失焦触发），频次低、没额外接入 debounce。

**后续建议**：

1. 如果后续要在 worker 内部支持"进入计算前检查最新 requestId"，可以把 `syncRuntimeSelectors` 之后、`CALCULATE_ALL_MOVES_SV` 之前加个短路。
2. 引入"同步中…"的 inline spinner 代替现在的 `.source-tag`，会让用户看得更准。

**当前收益**：拖 slider 从 0 到 32 不再跑 32 次 worker；过期结果既不刷屏也不抢占 UI。

---

### 24. 伤害计算不支持批量"对全队 / 对全对手"

**当前现状**：`damage-workspace.js` 已新增 `scanAttackerAgainstTargets()` 与 `scanAttackersIntoDefender()` 两条批量接口；`render-damage.js` 现已接入"我打对面全队 / 对面全队打当前我方"两个入口，结果以矩阵卡片呈现，点击任一单元格可直接跳回对应单对位继续细查。前者固定当前 attacker，逐招扫描当前 `opponentTeam`；后者固定当前 defender，找出对面每只最痛的招式与 KO 结论。

**剩余问题**：当前批量扫描仍基于 worker 的逐对串发，不是一次性矩阵计算；结果里也还没有"按招式排序 / 只看 OHKO / 导出表格"这类进一步筛选。

**后续建议**：

1. 若后续想继续提速，可把 batch scan 下沉成 worker 内部一次请求完成，而不是主线程 `Promise.all()` 聚合。
2. 可给矩阵加视图筛选，例如只看 `OHKO / 2HKO / 最大百分比`。
3. 若后续需要复盘，可增加"导出 CSV / 复制表格"。

**当前收益**：配队和调点时终于不用在伤害台里反复切 defender / attacker；同一只在当前对局里到底能压几只、怕几只，可以一屏扫完。

---

### 25. 太晶 / 动态 / Gigantamax / Terapagos Stellar 在计算参数里有字段，但 UI 没暴露

**现状定位**：`render-damage.js:39` 有 `META_FIELDS = ["dynamax", "terastal", "abilityActive"]`，`damage-core-worker.js` 也有相关处理。

**为什么是问题**：UI 侧在 `metaControlMarkup` 里把它们铺平为 checkbox，但：

1. 没有对"Stellar 太晶"、"Ogerpon 太晶型强化"、"Terapagos Stellar 每属性一次 2x"的专项处理提示。
2. 太晶开关和太晶类型选择是两个独立控件，用户容易忘记切换其中一个。

**建议做法**：

1. 做一个"太晶组件"：单一下拉同时切换"未太晶 / 太晶为 Fire / 太晶为 Water / Stellar"；下面显示太晶的抗性表变化预览。

---

### 26. `damage-core-worker.js` 的 jQuery shim 造成的隐式行为难以追踪

**现状定位**：`damage-core-worker.js:1-82` 伪造了 jQuery、document、localStorage、$.extend 等全套对象。伤害核心是从外部 vendor 的计算脚本 `static/vendor/champions-damage-core/*.js` 拷进来的，依赖这些 DOM API。

**为什么是问题**：

1. 任何 vendor 更新都可能触发 shim 的不兼容 - 未来升级伤害计算器会很脆弱。
2. `CHECKED_SELECTORS` 和 `CHECKED_IDS` 同步函数 `syncRuntimeSelectors` 必须在每次 `syncPair` 前调，任何遗漏会导致特性/场效错算。
3. "特性是否激活"这类关键布尔完全藏在 shim 的 prop 返回值里，不可审查。

**建议做法**：把 damage-core 的职责抽象成纯函数接口 `calcDamage(attacker, defender, field, move) => result`，在 vendor 脚本外包一层 adapter（而不是 shim jQuery）。长期目标是把 damage-core 替换为独立 ES Module 实现。

---

### 27. 场效（风格：独立场 / 己方场 / 对方场）字段没有分组视觉

**现状定位**：`render-damage.js:198-217` 的 `sideFieldMarkup` 每侧铺 20 个 checkbox 开关。

**为什么是问题**：20 个平铺 toggle 非常难找。用户想启用"对方 Tailwind + 对方 Light Screen"，要在一大排 checkbox 里扫两次。

**建议做法**：按语义分组折叠——"保护组"（Protect, Wide Guard, Quick Guard）、"壁组"（Reflect, Light Screen, Aurora Veil）、"辅助组"（Helping Hand, Friend Guard, Battery, Power Spot）、"钉组"（Stealth Rock, Spikes）、"G-Max场"（应在 VGC9 下隐藏）、"独立场"（Ruin/Aura）。每组默认折叠，展开后显示。

---

### 28. 暴击、能力降低层级的交互组件不直观

**现状定位**：`render-damage.js:370-381` 的 `boostGridMarkup` 把 atk/def/spa/spd/spe 五项各自用 `-6..+6` 的 `<select>`。

**为什么是问题**：

- `<select>` 在桌面上要点开再选，没法一眼看到当前数值；
- "+6 Atk" 在 VGC 里远比 "+1" 常见（剑舞、羽栖等），用户每次都得点 select→scroll→click 三步；
- 没有"所有项归零"的快捷复位按钮。

**建议做法**：把每项做成"chip 组"——一排按钮：`-6 -4 -2 0 +1 +2 +4 +6`，高亮当前值；一键复位所有 stage；再加"剑舞"（atk +2）、"冷静"（spa +2）、"迎风"（spe +2）等 preset 快捷键。

---

## 四、对战盘 / 对局分析体验

### 29. 对战盘 6×6 对位没有视觉上的优劣势编码 `已完成（一期）`

**当前现状**：对局分析里的打点面板上方已新增 6×6 热图。纵轴是对面、横轴是我方，格子直接显示净优势分，颜色按正负与强度编码，hover 可查看双方得分细节。

**当前收益**：用户不用再来回扫左右两列卡片，能一眼看出"哪只最适合压哪个对手"以及"哪几个格子明显是坑位"。

**现状定位**：`render-matchup-board.js:258-293` 渲染 allyCards / opponentCards 和 speedRows，但没有"我 vs 他"的矩阵色块展示。

**为什么是问题**：用户看对战盘的诉求是"我哪只被压制最惨？对方哪只是我最容易解的？"——最适合的可视化是"6×6 色块矩阵"：行是对手、列是我方、格子颜色代表我方打对面的 effectiveness 或 delta score。当前只有文字 pill 堆叠，信息量大但模式不容易识别。

**建议做法**：加一个"矩阵视图"切换——使用 Canvas 或 SVG 的 6×6 heatmap，格子背景色按 delta（我压制力 - 对方压制力）映射红绿渐变，点击格子弹出该对局的详细分析。

---

### 30. 先发推荐只给分数和"目标"两列，不给动作剧本

**当前现状**：`matchup-analysis.js` 已为每组 `leadPairs` 生成 `turnOnePlan`，`render-matchup.js` 也已在首发卡片里补上"首回合动作"区。当前启发式会优先识别 `Fake Out + Trick Room`、`Tailwind`、常见控速、`Helping Hand`、`Follow Me / Rage Powder` 等开局，并在无明显支援动作时回退到"最优进攻招式 + 最优目标"。

**剩余问题**：当前只覆盖首回合，不做第二回合或换入树；动作理由仍是短标签级别，不是完整自然语言解释，也还没有把 `Protect` 作为显式开局动作单独提出。

**后续建议**：

1. 把 `Protect / Parting Shot / pivot` 这类后续动作扩成可选的"回合 2 提纲"，但保持显式启发式而非伪模拟。
2. 在理由标签外再补一行短句，解释为什么锁这个目标。
3. 若后续引入更细致的场况状态，可让动作建议复用 `battle-semantics.js` 的更多上下文。

**当前收益**：首发推荐不再只是抽象分数卡，用户能直接看到"这对先发第一回合大概该怎么开"，工具从分析器进一步接近实战辅助。

---

### 31. 对战盘"速度行"对"双场况"切换不足 `已完成（一期）`

**当前现状**：速度栏已从 `base → top` 两档，改为显式展示 `基础 / +1 / 围巾 / ×2` 四类速度分档；多配置物种会按范围显示，避免把所有提速可能性混成一个"最高值"。

**当前收益**：现在可以直接读出"这只的 261 到底是围巾还是双倍速"；速度比较的信息密度高很多，也更接近真实组队思路。

**现状定位**：`render-matchup-board.js:237-256` 的 `renderSpeedRows` 把 `baseMin/baseMax` 和 `topMin/topMax` 同行展示。

**为什么是问题**：`topSpeed` 覆盖了 `plusOneSpeed`、`scarfSpeed`、`doubleSpeed` 三种，但不区分是否可能同时启用。用户看到一个精灵标"base 87 → top 261"不能立即知道这是 Scarf 还是 Chlorophyll。

**建议做法**：把 top 速度拆成多行，每行带标签 "(+1) 130"、"(Scarf) 130"、"(×2 晴) 174"，并点击高亮该场况下的速度比较。

---

### 32. 保存的对面队伍没有使用频率排序 `已完成（一期）`

**当前现状**：保存的对面队伍现已记录 `lastOpenedAt / openCount / createdAt`，列表默认按"最近打开 > 打开次数 > 新建时间 > 名称"排序；卡片也会显示打开次数标签。

**当前收益**：常查的对局会自然浮到前面，不再被一串历史存档埋掉。

**现状定位**：`render-matchup.js:172-185` 的 `savedOpponentCardMarkup` 按保存顺序列出。

**为什么是问题**：当用户保存了 30 个常见对局后，最常查的那几个应该浮到前面。现在按保存时间正序/倒序都不是最优体验。

**建议做法**：给保存条目加 `lastOpenedAt` 字段，排序优先"最近打开 > 最多打开 > 首字母"。UI 上提供"按热度 / 按时间 / 按名称"三种排序切换。

---

### 33. 对手快速选择缺少"按属性 / 速度档 / 战术角色"的筛选 `已完成（四期）`

**当前现状**：对局分析右侧的 `Quick Pick` 已新增三组筛选：

- **属性**：18 属性多选 chip；
- **速度档**：`慢速 / 中速 / 高速 / 极速` 四档单选；
- **战术角色**：`Tailwind / Trick Room / Fake Out / Redirection / Guard / Pivot / Disruption / Priority / Intimidate / Weather / Terrain` 多选。

筛选与现有搜索框叠加生效：**组内 OR、组间 AND**。顶部会显示当前已启用的筛选摘要，并提供"清空筛选"。底层 `matchup-selection.js` 现已在 opponent entry 上预计算 `roleIds` 与 `speedBucket`，过滤不再只是文本匹配。

**剩余问题**：

1. 当前筛选状态只保留在运行时，刷新页面后不会恢复。
2. 角色筛选还是固定白名单，尚未开放给用户自定义。
3. 速度档是静态阈值，不是按当前库分位数动态切段。

**当前收益**：大库下挑对手的成本明显下降。用户现在可以直接做"只看水系高速威胁"、"只看顺风位"、"只看会 Fake Out 的中速位"这种组合筛选，不必在几百个 sprite 里肉眼翻找。

---

### 34. 对手 counter 自动填充没有"锁定已选"语义 `已完成（一期）`

**当前现状**：对面队伍卡片已新增"锁定 / 解锁"按钮；自动填充现在会保留所有 pinned 对手，只补剩余空位，且锁定状态会跟随持久化与对面快照一起保存。

**当前收益**：用户终于可以先手动钉住 1-3 只关键对手，再让生成器补齐余下 counter 阵容，不会再一键把现有选择冲掉。

**现状定位**：`opponent-team-generator.js:253-282` 的 `buildCounterOpponentSelections` 从空开始构建 6 选。UI 按钮在 `index.html:192` 是"自动填充 6 只"。

**为什么是问题**：用户常见诉求是"我手动选了 2 只对手，剩下 4 只帮我补"。当前点"自动填充"会覆盖已选。

**建议做法**：`buildCounterOpponentSelections` 允许传入 `pinnedSpeciesIds`，作为不可替换的已选；算法从剩余 K=6-pin 个位置开始按分数补。UI 上对手每只加"锁定 / 解锁"小图钉。

---

## 五、UI 交互与信息架构

### 35. 队伍成员没有拖拽排序 `已完成（一期）`

**当前现状**：当前队伍侧栏已支持原生 HTML5 drag-and-drop 排序；每张 `.team-card` 会在拖拽时显示 `dragging / drop-target` 状态。考虑到移动端和键盘场景，卡片操作区也补了"上移 / 下移"按钮，不依赖拖拽手势也能完成排序。

**剩余问题**：本轮只覆盖"当前队伍"这一条主路径；配置库卡片和已保存队伍列表还没有同样的拖拽排序。

**当前收益**：用户终于可以直接把常用 lead / 后排顺序摆到自己习惯的位置，不需要靠删除再重加来调队伍顺序。

---

### 36. 全局缺少撤销 / 重做机制 `已完成（一期）`

**当前现状**：已新增轻量 history store，对 `library / team / opponentTeam / savedTeams / savedOpponentTeams` 五类核心结构状态做快照，最多保留 20 步。`Ctrl/Cmd+Z`、`Ctrl/Cmd+Shift+Z`、`Ctrl/Cmd+Y` 已接线到撤销 / 重做；恢复后会统一重新计算派生分析并重新持久化。

**剩余问题**：当前 history 还不覆盖搜索词、视图切换、伤害工作台滑条等"非结构状态"；移动端也还没有额外的"撤销气泡"提示。

**当前收益**：误点清空、覆盖导入、排序、删除或加载存档后不再只能硬吃结果，用户可以直接撤回到前一步。

---

### 37. 键盘快捷键体系 `已完成（二期）`

**当前现状**：新增 `static/app/keybindings.js`，由 `main.js` 的 `initialize()` 统一装载。

**你在 UI 上怎么感知**（打开本地服务后立即可用）：

| 操作 | 效果 | 典型 VGC 工作流 |
| --- | --- | --- |
| `1` / `2` / `3` / `4` / `5` / `6` | 分别切到 配置库 / 队伍分析 / 对局分析 / 组队推荐 / 伤害工作台 / 速度线 | 调 Choice Scarf Flutter Mane 点数时：`5` 先看伤害，`6` 对比速度线，`3` 再回到对局验证 |
| `/` | 聚焦当前视图的主搜索框 | 在对局视图快速搜索对面某只（比如筛 Urshifu），不用鼠标找搜索框 |
| `?` | 打开快捷键速查弹窗 | 第一次上手时按 `?` 学可用键位 |
| `Ctrl`/`⌘` + `K` | 打开命令面板（见 #44） | 想"切英文 / 导入备份 / 载入预设"又懒得找按钮时直接输入 |
| `Ctrl`/`⌘` + `S` | 保存当前队伍（先在侧栏填名） | 赛季上分时每次小调点数存一个 snapshot，后期可 diff |
| `Ctrl`/`⌘` + `Z` / `Ctrl`/`⌘` + `Shift`+`Z` / `Ctrl`/`⌘` + `Y` | 撤销 / 重做 | 误点"清空队伍"后立即 `Ctrl+Z` 全量还原 |
| `Esc` | 关闭快捷键速查弹窗（配置编辑器 / guided builder 各自已有 Esc handler） | —— |

快捷键遵循"文本框里不触发"的默认值——所以在队伍名输入框、Showdown 导入框里打字不会劫持 `1-6` 这种字面键。

**剩余建议**：

1. 后续可加 vim 风的两段跳转（如 `g a` → analysis），但 `1-6` 已覆盖 90% 切换场景。
2. 给队伍卡补 `Ctrl`/`⌘` + `1..6`：在配置库里直接把第 N 张候选加到队伍，需要先在 state 维护"配置库焦点索引"。

**Champions 环境下的收益**：VGC 队伍迭代的典型循环是「改点数 → 看速度线 → 验证伤害 → 回到对局」。过去每轮要四次鼠标点 tab；现在按 `1-6` 一键切，节奏接近 Showdown 自带热键。

---

### 38. 搜索输入没有防抖，且不高亮匹配

**现状定位**：`render-matchup.js:250` 的 `filterOpponentLibrary(state.matchupLibrary, state.matchupSearch)` 每输入一个字符就重建 haystack。

**为什么是问题**：库大时每帧过滤会导致打字卡顿；找到结果后也不知道是哪个字段命中的。

**建议做法**：加 150ms debounce；匹配结果里对命中子串包 `<mark>`；按匹配度排序（名字匹配 > 招式匹配 > type 匹配）。

---

### 39. 修改状态无即时反馈，操作后只有静默 re-render `已完成（一期）`

**当前现状**：新增 `static/app/toast.js` 暴露 `toast(message, {type, duration})`，在 `index.html` 尾部挂 `<div id="toast-stack">`，CSS 定义右下角堆栈与 in/out 过渡。已在以下路径接线：

- 保存队伍成功 → `toast.teamSaved` success；
- 保存队伍缺名字 → `toast.teamNameRequired` warning；
- 载入队伍 → `toast.teamLoaded` success；
- 伤害计算失败（`syncDamageWorkspace` catch）→ `toast.damageSyncFailed` error。

**剩余问题**：

- 还有一批 `setStatus` 调用点（导入 / 导出 / 删除 / 覆盖预设等）尚未配对 toast，暂时保持只更新 `#status-text`；
- 没做 toast 堆叠上限（极端情况下会刷屏），`.toast-stack` CSS 也还没加入最大高度滚动。

**后续建议**：

1. 将 `setStatus` 升级为 `announce(key, params, {toastType})`，在一处同时写状态行和 toast，避免散落；
2. Toast stack 加最多 3 条常驻，溢出进折叠计数；
3. 错误 toast 加"复制详情"按钮，减少排障成本。

**当前收益**：关键破坏性操作（保存/载入/伤害失败）不再靠扫状态栏，失败不再只是 console.error。

---

### 40. 导入队伍的"错误定位"反馈空洞 `已完成（一期）`

**当前现状**：导入反馈已从纯文本串升级为结构化表格。`parseShowdownLibrary()` 会返回 `feedback[]`，项内包含 `level / blockIndex / lineNumber / configName / message`；配置库导入与队伍直导两条路径都会在摘要行下方渲染反馈表，并对错误 / 警告做视觉分组。

**剩余问题**：当前 warning table 直接常驻在导入面板下方，还没有折叠/筛选；如果后续反馈项很多，仍可能需要再加折叠或 level filter。

**现状定位**：`showdown.js:298-306` 的 `parseShowdownLibrary` 只推送 `error.invalidBlock`（附 block index）。

**为什么是问题**：用户看到"第 3 块导入失败"根本不知道哪一行出错。如果是道具拼错、招式名错，给出具体哪行更有意义。

**建议做法**：`createCustomConfig` 返回 `{ config, warnings[], errors[] }`：warnings 包含"未识别的道具 'Choice Scaf'（行 2）、未识别的招式 'Close combat' 请检查大小写"等；UI 在导入面板下面展开一个可折叠的警告表。

---

### 41. 配置库卡片没有"对比两个配置差异"视图 `已完成（四期）`

**当前现状**：配置库当前物种页已支持**同物种双配置对比**。每张配置卡新增"加入对比 / 移出对比"按钮，最多保留 2 套；在当前物种标题下方会出现对比面板：

- 选中 0 套：显示空提示；
- 选中 1 套：提示再选 1 套；
- 选中 2 套：显示左右并排的差异视图。

对比字段现已覆盖：

- 道具、特性、太晶、性格、备注；
- 合法性校验状态；
- Champions 点数分配；
- 最终六维属性；
- 招式列表；
- 结构/功能角色标签。

有差异的格子会高亮，同一面板内仍保留"加入队伍 / 编辑 / 移出对比"操作。

**剩余问题**：

1. 当前只支持**同物种**对比，不支持跨物种或推荐候选对比。
2. 还没有 moveset 级的"哪一项差了几行"文本 diff，只是字段级高亮。
3. 对比状态不做持久化，刷新页面会清空。

**当前收益**：像 `Scarf Garchomp` 对 `Sword Dance Garchomp`、`Safety Goggles Incineroar` 对 `Assault Vest Incineroar` 这种高频比较，不再需要来回扫两张卡片，调 spread 和招式的效率高很多。

---

### 42. 导入/导出全都集中在一个 `<details>` 面板，路径被折叠

**现状定位**：`index.html:128-146` 的 `<details class="import-panel">`，所有的"载入默认预设 / 覆盖导入 / 追加导入 / 文件导入 / 导出配置库 / 清空"都在里面。

**为什么是问题**：首次访问的用户面对一个空仓库（"配置库初始为空"），找到"载入默认预设"的路径被折叠、难发现。按钮还都混在一起，新用户容易点错"清空"。

**建议做法**：

1. 首次访问且 library 为空时，顶部显示大号"快速开始"引导条：`[载入默认预设] [粘贴 Showdown 文本] [从文件导入]` 三个主动作。
2. "清空配置库"移出主路径，挪到"高级操作"抽屉里，点击前加二次确认。
3. 导入方式互相独立，每种有专门的输入区。

---

### 43. "队伍"概念与"单配置"概念混淆

**现状定位**：`team-sidebar-tab-team` 展示队伍 6 只成员；`team-sidebar-tab-saved` 展示保存的队伍；而"配置库"是单精灵配置列表。新用户经常把"保存队伍"和"保存配置"混为一谈。

**为什么是问题**：把"单精灵配置（我喜欢的 Flutter Mane 配置）"和"整支 6 人队伍（我喜欢的一套阵容）"概念错位会导致一连串误操作。

**建议做法**：

1. 术语严格化：UI 里只出现"配置"（一只的 moveset）和"队伍"（六只的组合）；"保存为…"按钮明确写"保存队伍"。
2. "导入"入口合并到一个 modal，里面分两个 tab：`[导入单配置] [导入整队]`，避免用户对着配置库入口粘整支队伍。

---

### 44. 命令面板 / 全局搜索 `已完成（二期）`

**当前现状**：新增 `static/app/command-palette.js`（命令 registry + 轻量 fuzzy 排序）与 `static/app/render-command-palette.js`（模态 + 键盘交互）。

**你在 UI 上怎么感知**：

- 按 `Ctrl/⌘ + K` 在页面中央弹出搜索框；输入任意关键字（中英皆可）即时筛选。
- `↑ / ↓` 移动高亮、`Enter` 执行、`Esc` 关闭；鼠标点击候选也直接执行。
- 匹配到的字符在候选项上用高亮 `<mark>` 标出，一眼看清命中了哪个关键字。

初版命令 20 条，按使用频次：

- **视图切换**：6 个主视图（别名支持"library/配置库/1"这种混写）
- **队伍动作**：保存当前队伍、清空当前队伍、清空对面、自动填充对面 6 只、载入默认预设
- **数据 I/O**：导出配置库、导出全部状态（`.poketype.json`）、导入全部状态
- **全局切换**：切中文 / 切 English、切换图标方案（Showdown 雪碧图 ⇄ Poke Icons）
- **编辑**：撤销 / 重做
- **帮助**：显示键盘快捷键

**剩余建议**：

1. 进阶命令（`add incineroar` → 把炽焰咆哮虎直接加到队伍 / `damage flutter mane vs urshifu` → 跳伤害工作台并预填）需要 species 索引 fuzzy 查找。
2. 命令执行目前是 `clickById` 模拟点击；等 `main.js` 拆出 actions 模块后改为真函数调用，能解锁"执行后不 close palette 以便连续操作"的体验。

**Champions 环境下的收益**：VGC 玩家常在"调点数 → 存快照 → 切英文发 Discord → 回中文继续"这种循环里折返。过去要找四个不同按钮；现在 `Ctrl+K`「保存」`Ctrl+K`「English」` 两步解决，面板关闭后焦点自动回到主区域。

---

## 六、数据可视化与洞察呈现

### 45. 队伍抗性矩阵用 CSS Grid + 数字文本，不够直观

**现状定位**：`render-analysis.js:159-184` 的 `defensiveMatrixRowMarkup` 每行渲染 `label + 18 个 cell`。

**为什么是问题**：18 列 × 6 行的矩阵在文字+数字形式下需要用户逐格扫描。色彩编码只有两档（good/bad），没有连续梯度。

**建议做法**：在矩阵里给每个 cell 加"色温 + 大小"双编码：`0x = 深绿`、`0.25x = 浅绿`、`0.5x = 白绿`、`1x = 白`、`2x = 浅红`、`4x = 深红`；在 cell 中央显示倍率，鼠标悬浮展现"哪个队友能帮忙拦"。

---

### 46. 队伍形状类可视化总览 `已完成（四期）`

**当前现状**：2026/04/20 被回滚的"18 属性轮"没有恢复；取而代之，分析页 `analysis-overview` 现已接入**新方向的总览层**：

1. **队伍架构 chips**：根据 `speedContext + team-roles` 归一化出主/副架构标签，当前可识别 `Trick Room / Hybrid Speed / Tailwind Offense / Pivot Balance / Hyper Offense / Balanced`。
2. **联防组合卡片**：当前会检查 `Fire / Water / Grass`、`Dragon / Steel / Fairy`、`Water / Ground / Flying`、`Electric / Ground / Flying` 四组组合，并区分：
   - `已成型`：三种类型都已覆盖；
   - `差一环`：只缺 1 个类型；
   - `未成型`：缺 2 个及以上（当前不展示）。
3. **直达推荐动作**：当联防组合只差 1 个类型时，卡片会出现"按 XX 补位推荐"按钮，直接跳到推荐页并设置对应 `focus type`。

**失败原因（写下来以免二期重犯）**：

1. **视角错了**。VGC 里真正决定队伍坚固度的不是"某个单属性的最差倍率"，而是"队伍整体的**联防组合**是否成立"——火 / 水 / 草互相罩对方弱点、鬼 / 恶 / 超形成相互免疫循环、龙 / 钢 / 妖锁定 endgame 组合等。只看单属性最差多少是标准单打的思路，在双打里噪音过大。
2. **信息重复**。单只 x 单属性矩阵在 Coverage 子页已经有更密的矩阵视图；轮盘只是把同一份数据挤到圆环上，可读性反而下降。
3. **"一个四倍弱点不等于不能用"**：Chi-Yu 4× Ground 弱点的事实在 VGC 场景下常被"我方另外 3 只全抵抗地 + 广防 + 队友能压制地属性"掩盖。轮盘把这种弱点标成刺眼的红色反而误导。

**剩余问题**：

1. 联防组合表当前只内置了 4 组高信号组合，还没有继续扩到更完整的 VGC 组合库。
2. 架构识别仍是启发式规则，不是 meta-aware 分类器。
3. 六边形雷达图仍未回归；如果以后做，必须保证与现有 chips/card 不重复。

**当前收益**：分析页现在已经能在 1-2 秒内回答两个问题——「这支队大概是什么架构？」「当前联防闭环缺哪一环？」——比单纯的 metric-card 数字块更接近真实组队思路。

---

### 47. 速度线视图是时间线结构，但没有比例感

**现状定位**：`render.js:557-576` 的 `renderSpeedTiers` 按 speed 从高到低平铺，每档一行。

**为什么是问题**：速度值 `200` 和 `199` 显示为相邻两行，看起来差距和 `180` 到 `100` 一样大——但 100 的差距可能意味着在 meta 里整体位置翻转。

**建议做法**：把速度线改成"等比坐标"：垂直时间轴按真速度数值等比分布；在每档挤多个精灵时横向堆叠。顺带在 150/170/190 等关键速度线（Meta 典型 benchmark）画参考横线。

---

### 48. 核心对建议没有"替代对"的可视化比较

**现状定位**：`analysis.js:592-594` 的 `summarizeCores` 只返回 Top 4 的 bestPairs、Top 3 的 riskyPairs。

**为什么是问题**：用户看到"Flutter Mane + Incineroar 评分 42"之后可能想知道"如果换 Flutter Mane + Amoonguss 是多少"——现在没有对比。

**建议做法**：在核心对卡片下加一个"对比"按钮，展开后显示与该成员组合的其他 5 个搭档对打分表；并点击任意行直接展开详细 breakdown。

---

### 49. 分析维度切换（Coverage / Roles / Cores）不保留上下文

**现状定位**：`render-analysis.js:450-465` 切换时整片 innerHTML 替换。

**为什么是问题**：用户在 Coverage 里看"弱点 → 推荐补位"时往往想再切到 Roles 看"我缺的角色是否在推荐候选里"；切回 Coverage 时之前展开的 "suggested cover" 消失。

**建议做法**：三个 panel 同时 render 到 DOM，用 CSS 切 display。scroll 位置、展开/折叠状态都留在当前节点。

---

### 50. 图标方案切换后一些隐式状态不联动

**现状定位**：`main.js` 有 `iconScheme` 字段，切换后调用 `renderAll`，但 `spriteMarkup` 里依赖 `state.iconScheme` 读取不同 sprite 源。

**为什么是问题**：如果切换瞬间某些 cached entry 还引用旧的 spritePosition，会出现新旧图标混排。第一次切 Poke Icons 时尤其明显。

**建议做法**：切换 iconScheme 时显式清除所有 sprite 的 cache 字段，或者切换完成后延迟 150ms 再 render 确保所有异步 icon map 加载完成。

---

## 七、可访问性、国际化与响应式

### 51. Modal 没有 focus trap，背景仍可 Tab

**现状定位**：`index.html:259-335` 的两个 modal（config-editor / guided-config）打开后靠 CSS `hidden` 属性控制，键盘焦点仍能 Tab 到背景面板。

**为什么是问题**：键盘和屏幕阅读器用户打开 modal 后依然能"离开" modal，导航混乱；点 Escape 也没绑定关闭。

**建议做法**：引入一个极小的 focus-trap 工具——打开 modal 时记 `previousFocus = document.activeElement`，把焦点移到 modal 内第一个可聚焦元素；`keydown Tab` 时循环遍历 modal 内可聚焦元素；Escape 触发 `data-close-*` 按钮；关闭时焦点还原。

---

### 52. 颜色语义缺少无障碍备选

**现状定位**：分析页、推荐卡片用 `.good` / `.bad` / `.analysis-alert-pill` 做红绿语义。

**为什么是问题**：色盲用户（尤其是红绿色盲）区分 good/bad 全靠颜色，无形信号缺失。

**建议做法**：在每个语义 pill 前加 icon（✓ / ⚠ / ✗）；或者用纹理（斜纹/点状）做第二维编码；提供"高对比度"主题开关。

---

### 53. `title` 工具提示在移动端不可用

**现状定位**：`render-matchup.js:92`、`render-matchup-board.js:63,139` 等多处用 `title="..."` 提示。

**为什么是问题**：触摸设备不触发 `title`，等同于信息丢失。

**建议做法**：

1. 把 `title` 替换为现有的 `.info-pill + .info-tooltip-content` 模式，所有 hover 信息移动端可点开。
2. 或者用触摸 `touchstart` + 弹层 popover 展示。

---

### 54. 切换语言后动态渲染的内容要完整重渲染才生效

**现状定位**：`i18n.js` 的 `applyStaticTranslations` 遍历 `[data-i18n]`，但大量内容（伤害结果、分析卡片、推荐理由）是 JS 动态生成，切语言时必须手动调所有 render 函数。

**为什么是问题**：维护成本高，而且中文混合英文字符串容易出现"部分切了部分没切"的尴尬。

**建议做法**：统一用语言-rerender 模型：`setLanguage(next)` 内部依次调所有 render；或者用 MutationObserver 监听 DOM 并自动翻译 textContent（代价较高，慎用）。

---

### 55. 没有复数形式与数字格式

**现状定位**：`i18n.js` 的 `t(key, params)` 用简单 `${value}` 替换。

**为什么是问题**：英文 `1 member / 3 members` 有单复数区别；中文没有，但数字展示（千分位、百分比）在两种语言都需要本地化。

**建议做法**：引入 `Intl.PluralRules` 与 `Intl.NumberFormat` 封装 `tn(key, {count: 3})`；`count=1` 走单数、其他走复数。数字走 `new Intl.NumberFormat(lang).format(value)`。

---

### 56. 移动端布局：六只队伍卡片在窄屏挤压

**现状定位**：`index.html:94-123` 的 `.team-sidebar-body` 用 `.team-grid` 渲染。

**为什么是问题**：窄屏下 team-sidebar 占一半宽度，卡片挤到竖排 + 文字折行，关键信息被截断；workspace 主区同样承受压缩。

**建议做法**：

1. 768px 以下把 sidebar 改成底部抽屉（像 iOS 控制中心），默认收起，通过一个浮动按钮唤起。
2. 或者主布局切到"单栏 + tabs 切换"：workspace 和 team 互斥显示。
3. 每张卡片在 <480px 时折叠到最小尺寸（仅显示头像 + 名字 + 类型 pill），tap 展开详情。

---

## 八、性能、渲染与打包

### 57. 每次状态变化全量 re-render 主要视图 `已完成（二期）`

**当前现状**：新增 `static/app/render-cache.js`（约 25 行），导出 `setInnerHTMLIfChanged(target, html)` / `invalidateRenderCache(target?)`。内部用 `WeakMap<Element, string>` 记录上一次的 HTML，相同则直接 return，不再触发 DOM 重建。

接入点（共 19 处 `innerHTML = ...` 改为 diff 版）：

- `static/app/render.js` × 7
- `static/app/render-analysis.js` × 6
- `static/app/render-matchup.js` × 7
- `static/app/render-damage.js` × 3

`main.js` 的 `setLanguage` / `setIconScheme` 会在 re-render 前调用 `invalidateRenderCache()` 清空缓存，避免翻译 / 图标切换命中旧缓存。

**你在 UI 上怎么感知**：

- 调伤害 slider 时，过去会看到"招式卡片轻微抖一下"（因为伤害结果相同但 innerHTML 被重写）——现在完全静止。
- 队伍侧栏的滚动位置、展开的 builder 表单、正在输入的搜索框，在"无内容变化的 render" 中都不再被重置。
- 切换主视图时的体感更顺滑：非可视视图的 DOM 不会重复 patch。
- 如果用 DevTools Performance 面板录制一次伤害拖 slider 的过程，Recalculate Style / Layout 的次数能看到明显下降。

**剩余建议**：

1. 中期仍可以引入 morphdom / nanomorph 做节点级 patch，最大收益是 **保留 `<input>` 的 focus 与 selection range**——目前 hash-skip 只能处理"无变更"；一旦 HTML 变了还是整块 replace，光标仍会被冲掉。
2. 高频场景（伤害 slider、搜索 input）可以进一步把 debounce 与 diff 组合，减少 unnecessary re-render 触发。

**Champions 环境下的收益**：VGC 调点数过程中，伤害工作台的 slider 拖动是最高频的操作。过去每拖一下 innerHTML 都会重绘，现在稳定如止水——长时间调配不再眼疲。

---

### 58. 启动时并行拉 9 个 JSON，无 preload 与分级加载

**现状定位**：`data.js:70-80` 一次性 `Promise.all` 拉 pokeIconMap / pokedex / formsIndex / moves / learnsets / abilities / items / championsVgc / usage。

**为什么是问题**：

- 首屏主视图只需要 `pokedex / formsIndex / championsVgc`；`learnsets`、`usage`、`pokeIconMap` 可推迟到相关视图启用时再加载。
- 无 `<link rel="preload">`，浏览器不预热。
- 无超时与重试。

**建议做法**：

1. 把数据划分为"核心（首屏必需）"与"扩展（按需）"两组；首屏只拉核心。
2. `index.html` 里加 `<link rel="preload" as="fetch" href="...pokedex.json" crossorigin>`。
3. `fetchJson` 加 8s 超时和一次重试；失败明确告警并给"点击重试"按钮。

---

### 59. `renderSpeedTiers` 对每条变体重新调 `spriteMarkup`

**现状定位**：`render.js:557-576`、`render.js:511-536` 的 `renderSpeedTierEntryPills` 每 entry 调 spriteMarkup 生成 DOM 字符串。

**为什么是问题**：同一 species 同一 sprite，可能在速度线里出现 base / plus1 / double / scarf 4 种变体 + 对手 Side 同理，500+ 条目 × 多次 sprite 生成 + tooltip markup 重复。

**建议做法**：

1. sprite markup 按 `speciesId:iconScheme` 缓存到 Map 里；
2. tooltip markup 按 `speciesId:lang` 缓存；
3. 只在 iconScheme/language 变化时清缓存。

---

### 60. `buildSpeciesTemplateConfigs` 对所有可用 species 生成 3-4 个模板

**现状定位**：`champions-vgc.js:145-148` 与 `matchup-selection.js:118-131` 在构建 opponent library 时对每个 `availableSpecies`（几百只）跑 fastest/slowest/output/abilityBoost 4 个模板。

**为什么是问题**：模板 hydrate 会调 `finalizeConfig` 做性格应用、招式查表、加持速度计算——四百多只乘四倍 = 上千次重活，且每次切对手/切语言都重来。

**建议做法**：

1. 模板生成结果按 `speciesId:language` 缓存到顶层 Map。
2. 仅在 language 切换或 champions_vgc 数据变化时清缓存。
3. 进一步，把 hydrate 后的模板持久化到 `localStorage`（只缓存 sprite 位置 + 基础属性 + moveNames），启动时命中。

---

### 61. 没有 bundler，import 图强依赖 HTTP 请求数

**现状定位**：`index.html:337` 直接 `<script type="module" src="./static/app/main.js">`，浏览器按模块图逐级拉。项目已有 33+ JS 文件。

**为什么是问题**：首屏至少要解析 main.js 的所有 import（包括 i18n 的 1272 行字典），HTTP/2 多路复用能缓解但无法消除模块解析成本。

**建议做法**：引入 esbuild（零配置、20KB CLI）做一次 dev+prod bundle：

- dev：`esbuild static/app/main.js --bundle --sourcemap --outfile=static/app/main.bundle.js`。
- prod：加 `--minify --splitting --format=esm` 做 code splitting（按视图懒加载）。
- 按视图拆：damage / matchup / analysis 三个大模块按需加载。

---

### 62. 大量 ESM 里的辅助函数在渲染层重复实现

**现状定位**：`escapeHtml` 在 `render.js:9`、`render-analysis.js:4`、`render-damage.js:51`、`render-matchup.js:10`、`render-matchup-board.js:5`、`render-recommendations.js:5`、`matchup-board-data.js` 七处重复定义。

**为什么是问题**：维护成本散乱，遇到转义不完全（比如漏 `&#96;`）时要改 7 处。

**建议做法**：集中到 `utils.js` 导出 `escapeHtml` / `renderInfoPill` / `buildTextTooltipMarkup` / `typePills` 这一组 UI 辅助函数，各 render 文件改为 import。

---

### 63. 伤害计算 worker 的 `importScripts` 阻塞加载

**现状定位**：`damage-core-worker.js:84-96` 一次性 `importScripts` 11 个 vendor 脚本。

**为什么是问题**：worker 启动时串行加载几百 KB vendor 代码，首次伤害计算的 cold start 体验差。

**建议做法**：

1. 首页启动时预热（`createDamageWorkspace().waitForReady()` 在 idle 时提前触发）。
2. 把 vendor 合并成一个 `damage-core.bundle.js`，减少 import 开销。
3. 显示 cold-start 提示（"正在初始化伤害引擎…"）。

---

## 九、数据层、持久化与错误处理

### 64. `localStorage` 无版本迁移与 quota 检测 `已完成（一期）`

**当前现状**：`persistence.js` 已升级为 `schemaVersion = 2` 的 envelope 结构，`loadPersistedState()` 会同时兼容旧版 `v1` key 并迁回当前 payload。写入前会估算序列化体积，超过 4MB 时显式给出状态栏 + toast 预警；`setItem` 失败也不再只打 `console.error`，而会向 UI 抛出明确错误提示。

**剩余问题**：当前只有单向兼容旧版 `v1 -> v2`；未来如果 schema 再改，还需要继续补显式 migrator 链和更细的 quota 恢复策略。

**当前收益**：字段升级不再默认丢状态；接近 localStorage 上限时，用户至少会先收到备份提醒，而不是等浏览器静默写失败。

---

### 65. 数据 JSON 没有版本标识

**现状定位**：`poke_analysis-main/stats/*.json` 是 `update_all_data.py` 刷新的快照，无 `dataVersion` / `fetchedAt` 元信息。

**为什么是问题**：前端不知道当前数据是哪一次刷新的；用户看到推荐和实际 meta 不符时难以判断数据是不是过期。

**建议做法**：

1. `update_all_data.py` 生成 `poke_analysis-main/stats/version.json`，包含 `generatedAt`、`source`、`sampleSize`、`metagame`。
2. 首屏 hero 区显示"数据版本：2026-04-12 · 采样 12.3 万场"。
3. 如果数据早于某阈值（如 60 天），提示用户运行更新脚本。

---

### 66. 无"队伍备份到 JSON 文件"能力 `部分完成`

**当前现状**：`persistence.js` 已新增 `exportFullState()` / `importFullState(json)`，UI 也补上了"导出全部状态 / 导入全部状态"按钮。现在可以把配置库、当前队伍、保存队伍、保存对面、推荐偏好、语言、图标方案、伤害工作台基础场况一起导出成 `.poketype.json`，并在另一台设备上整包恢复。

**剩余问题**：当前导入策略只有"覆盖当前状态"，还没有实现"覆盖 / 合并"二选一，也没有把历史记录一起导出。

**当前收益**：用户终于可以跨设备迁移完整工作区，不再只能依赖丢信息的 Showdown 文本导出。

---

### 67. 错误处理风格不一致

**现状定位**：

- `persistence.js` catch 后 `console.error`。
- `showdown.js` 抛 throw Error。
- `main.js` 大量异步入口无顶层 try/catch。
- `damage-workspace.js` 失败 `reject` Promise，但若 UI 层没 catch 就吞掉。

**为什么是问题**：同一个失败场景在不同路径下表现完全不同（有的 console 有的 alert 有的默默失败），难调试。

**建议做法**：

1. 引入 `static/app/errors.js`：自定义 `AppError`，带 `code`、`userMessage`、`cause`。
2. 顶层 `window.addEventListener("error")` + `unhandledrejection` 捕获所有未处理错误，toast + 记录到 in-memory ring buffer（开发环境 Cmd+E 打印）。
3. UI 用户动作产生的错误统一走 `toastError(err)`。

---

### 68. 离线缓存 / PWA `已完成（二期）`

**当前现状**：

- 新增根目录 `manifest.webmanifest`（name、icon、`display: standalone`、`theme_color: #1b2130`、`background_color: #0f131b`）；`index.html` 已挂 `<link rel="manifest">` 与 `<meta name="theme-color">`。
- 新增根目录 `sw.js`。**2026/04/20 重构为按资源类型分路由**：

  | 资源类型 | 匹配 | 策略 | 理由 |
  | --- | --- | --- | --- |
  | HTML / JS / CSS / worker / vendor | 默认路径 | **network-first + 3 秒超时 fallback 到缓存** | 代码改了一刷就拿到新版；断网仍能用 |
  | 图片（sprite sheet、icon） | `.png` / `.webp` / `.svg` / `.jpg` | cache-first + 后台 revalidate | 基本不变，命中即用 |
  | 数据 JSON / 默认预设 | `*.json` / `config-default.txt` | cache-first + 后台 revalidate | 大且更新慢，离线体验最优 |

- `install` 把以上三类资源全部 precache；`activate` 清理旧版本；`skipWaiting + clients.claim` 让新 SW 立刻接管。
- `main.js` 的 `load` 事件 `navigator.serviceWorker.register("./sw.js")`，失败静默。

**你在 UI 上怎么感知**：

- 联网时改代码刷新一次就能看到新版（network-first 的收益）；网络慢（> 3s）或断网时自动 fallback 到缓存。
- 首次打开过一次工具后，再次打开时无需网络也能加载（DevTools → Application → Service Workers 能看到 `poke-type-v3-20260420` 激活）。
- 手机上用"添加到主屏幕"会像独立应用一样以全屏 standalone 启动。
- 发布新版时**请务必**在 `sw.js` 头部把 `CACHE_VERSION` 递增——否则 data 和图片资源（cache-first）仍可能命中旧缓存一段时间。

**历史**：

- v1（2026/04/20 上午）：全量 cache-first + 后台 revalidate。症状是"代码改了但页面要刷两次才生效"；用户反馈后重构。
- v2（上午末）：bump 版本，不改策略，没有本质解决问题。
- v3（2026/04/20 下午）：改为按资源类型分路由的 network-first + cache-first 混合策略。

**剩余建议**：

1. cache 版本号目前硬编码；长期可以在 `update_all_data.py` 或 CI 里基于数据 JSON hash 自动注入。
2. 尚未做"有新版本 → 提示用户刷新"的交互，当前依靠 network-first 每次刷新自动拿最新；若未来做强制版本升级可以串 toast 提示。
3. `new Worker(url)` 只在页面加载时 spawn 一次；即便 SW 已缓存新 worker，当前运行中的 worker 不会热替换——但我们的 worker 只做伤害计算，没有长期状态，刷新即更新。

**Champions 环境下的收益**：赛场临时查队伍/点数时 PWA 让工具离线可用；开发迭代时 network-first 避免"改了 bug 没看到"的假性故障。

---

### 69. 数据合并逻辑与中日译名解耦不够

**现状定位**：`data.js:82-84` 用 `mergeDexEntries(pokedex, championsVgc.overrideSpeciesData)` 等。`pschina-translation.js` 另维护一份中文翻译表。

**为什么是问题**：中文查询名没进 `speciesIndex`，导致用户粘贴中文 Showdown 字符串无法识别。`pschina-translation.js` 的翻译表又与 `i18n.js`、`damage-i18n.js` 三份之间可能不同步。

**建议做法**：

1. `data.js` 启动时把 `pschina-translation.js` 的中文名合并进 `speciesIndex`。
2. 三份翻译表合并到一个工具脚本生成的 `static/app/localized-names.js`，`i18n.js` / `damage-i18n.js` 只读该文件。

---

## 十、工作流与功能扩展

### 70. 无"队伍模板"一键启动

**现状定位**：目前只有"载入默认预设"这一个动作。

**为什么是问题**：新手用户面对空白配置库不知道从哪下手。如果能一键拉一套"Rain Team"、"Trick Room Team"、"Sun Team"、"Fat Balance"等常见 archetype 的默认队伍，体验会好很多。

**建议做法**：`docs/templates/` 下维护若干 `.team` 文件 + 每个 archetype 的说明；UI 加"模板库"tab，点击卡片一键导入到配置库和队伍。

---

### 71. 无"组队引导"向导

**现状定位**：分析页和推荐页需要先有 team，但不给引导。

**为什么是问题**：新用户从零到能用上分析/推荐有"载入预设 → 加到队伍 → 找推荐"的三步，期间没有单向指示。

**建议做法**：首次加载时弹一个"新手向导"：

1. 选一个 archetype 模板。
2. 加到队伍。
3. 看一眼分析页的弱点。
4. 从推荐里补两只。
5. 进对战盘测对局。

每步 OK 后 dismiss 按钮，整个向导可永久跳过。

---

### 72. 无"通过 URL 分享队伍"

**现状定位**：team / opponentTeam 的选择只在 localStorage 里。

**为什么是问题**：用户没法把分析结果 link 给朋友。

**建议做法**：把当前 state 的关键字段（team / opponentTeam / activeView）压缩成 base64 写到 URL hash：`#/team=BASE64DATA`。页面加载时读 hash 覆盖 localStorage。提供"复制分享链接"按钮。

---

### 73. 无"对战结果记录"

**现状定位**：所有分析都是"静态"的，没法记录"这场最后什么结局"。

**为什么是问题**：高阶玩家想用工具迭代自己的队伍时，需要"使用 N 场 → 胜率 → 弱点总结"。

**建议做法**：对战盘加一个"记录结局"的抽屉——选 `我方胜 / 对方胜 / 平局`，选 `哪只幸存`，备注一行。保存到 localStorage 的 `matchHistory[]`。侧栏展示近 20 场的胜率和常见败因（自动聚类）。

---

### 74. 无"数据导出为图片"

**现状定位**：分析页内容都是 DOM，截图要靠浏览器。

**为什么是问题**：玩家常把队伍分析或伤害计算结果贴到 Discord / 微博。当前只能手动截图，分享率低。

**建议做法**：每个 panel 提供"导出为图片"按钮，使用 `html-to-image` 或 `dom-to-image-more`（~20KB）把 subtree 序列化为 PNG。针对打印和分享优化一下 CSS（白底、隐藏交互按钮）。

---

### 75. 无"配置合法性校验" `部分完成`

**当前现状**：导入路径已经会校验未知道具、非法特性、未知招式、非法招式，并把结果追加到导入反馈里；因此错误配置不再是"静默落库"。

**剩余问题**：当前还没有把 `invalid` 标记持续挂到配置对象并在配置卡/UI 上红底展示，合法性提示主要停留在导入当下。

**现状定位**：`showdown.js:finalizeConfig` 会做基础 hydrate，但不校验"这只精灵真的能学这招吗？真能带这个特性吗？"。

**为什么是问题**：用户从别处复制带错误的配置导入进来，工具默默保存；后续推荐/分析基于这些错配会给出"它学了 Volt Switch 所以是 pivot"等错误结论。

**建议做法**：

1. `buildMoveSet` 时对照 `learnsets[speciesId]`，非法招式标记 `invalid: true` 并在 UI 上打红底 ⚠️。
2. `abilities[speciesId]` 也做核对——若用户配置了该精灵没有的特性，提示"未知特性"。
3. 校验结果出现在导入面板底部的 warnings 列表里。

---

## 附录 A：高价值 TOP 20 列表（按 ROI 排序）

已完成进度（截至 2026/04/26）：

- 一期已落地 22 项：`#1`、`#2`、`#3`、`#4`、`#5`、`#8`、`#11`、`#12`、`#16`、`#18`、`#20`、`#22`、`#23`、`#29`、`#31`、`#32`、`#34`、`#35`、`#36`、`#39`、`#40`、`#64`
- 二期新增落地 4 项：`#37`（键盘快捷键）、`#44`（命令面板）、`#57`（DOM diff / hash-skip）、`#68`（PWA 离线）
- 三期新增落地 3 项：`#9`（Coverage Gap 可改招补盲）、`#10`（核心协同与 Best Trios）、`#19`（推荐理由可解释性）
- 四期新增落地 3 项：`#33`（对手多维筛选）、`#41`（同物种配置对比）、`#46`（队伍架构 + 联防组合总览）
- 其中仍建议继续深化的部分完成项：`#2`、`#3`、`#4`、`#5`、`#9`（引入 usage 过滤 learnset 候选）、`#10`（继续扩招式/机制协同规则）、`#12`、`#14`、`#18`、`#19`（加候选对比视图）、`#23`、`#39`、`#57`（中期 node-level diff）、`#66`、`#75`
- 2026/04/19 追加的 UI 精简：战况 toggle（麻痹 / 我方顺风 / 对方顺风 / 戏法空间 / 分析页太晶切换 / 队伍卡与对面卡逐只太晶）已全部撤除，底层 `fieldState` 与 `battle-semantics.js` 语义保留；太晶在分析处以被动 `.analysis-tera-hint` 提示呈现。

若资源有限，建议按以下顺序落地：

| 序号 | 对应条目 | 理由 |
| :--: | :------- | :--- |
|  1   | #1 太晶机制建模 | 当前工具最大事实缺口 |
|  2   | #22 伤害条图形化 | 最显性的体验升级 |
|  3   | #3 场况速度模型 | 解决"先手判定"的根本问题 |
|  4   | #23 伤害 worker debounce | 修掉滑条卡顿 |
|  5   | #35 拖拽排序 | 低成本、高频收益 |
|  6   | #36 全局撤销 | 用户安全感拼图最后一块 |
|  7   | #39 toast 反馈 | 弥补静默操作的空洞 |
|  8   | #5 双打机制打分 | 真正体现 VGC 品味 |
|  9   | #29 对战盘 6×6 热图 | 信息密度最高单点提升 |
|  10  | #18 分析结果 memoize | 修掉对战盘滑动的延迟 |
|  11  | #14 Showdown 解析健壮性 | 削减"为什么导入失败"支持量 |
|  12  | #30 先发剧本 | 把工具从分析器升级成教练 |
|  13  | #24 批量伤害矩阵 | 配队迭代效率翻倍 |
|  14  | #46 雷达/属性轮 | 单图看懂队伍形状 |
|  15  | #37 键盘快捷键 | 高阶用户粘性 |
|  16  | #44 命令面板 | 功能发现成本降到 0 |
|  17  | #57 DOM diff | 修 render 抖动 + focus 丢失 |
|  18  | #64 持久化迁移 | 保护用户数据的基石 |
|  19  | #66 整状态导入导出 | 多设备迁移 |
|  20  | #68 PWA 离线 | 赛场场景体验完善 |

---

## 附录 B：不在本次建议里的"红线"事项

以下事项工具最好**不做**或审慎评估：

- **不要**再给威吓、Fake Out、保护这种双打核心招式做"快捷键触发"的自动对战模拟——除非有官方 VGC 对战引擎能接入，半吊子模拟只会加剧用户误判。
- **不要**把推荐打分公式暴露为"拉十几个滑条"让用户自己调——普通用户既不理解又调不好。保留"简单模式 + 高级模式"的分层。
- **不要**追加"排行榜 / 云同步 / 账户"这种需要服务端的功能。项目的纯静态架构是它的优势，别轻易放弃。
- **不要**引入重型前端框架（React/Vue/Svelte）。原生 ES 模块 + 少量辅助工具即可，引入框架的 bundle 成本与生态耦合不划算。

---

## 附录 C：如何验收每条优化

每条落地时建议执行以下 checklist：

1. 新功能是否覆盖"空状态 / 常规 / 错误"三种场景？
2. 中英文双语是否都翻译到位？
3. 键盘可达性？（Tab 顺序、Enter 激活、Escape 关闭）
4. 小屏（<480px）是否可用？
5. 有无引入新的副作用到原本的纯函数层？
6. 对原有持久化 schema 是否向后兼容？
7. 是否对 `main.js` 又堆了体量——还是按"编排/领域/渲染/持久化 & i18n & 常量"四层规则拆进了合适模块？
8. 有无新增硬编码魔数？是否需要进入 `constants.js`？
9. 是否附带 node --check 语法检查？
10. 若触及伤害计算，是否手工对照 Pokémon Showdown 伤害计算器核对至少 3 个 case？

---

## 结语

本工具目前的基础——类型化的 VGC 规则、分层清晰的模块结构、纯函数优先的分析层、Worker 隔离的伤害计算——是一个优秀的起点。上述 75 条优化多数不是"推倒重来"，而是"在现有骨架上补肉"。按 TOP 20 走一遍迭代，这个项目完全可以成为中文 VGC 圈首选的组队分析工具。

落地过程中如果发现任何一条在现实中比估计更轻或更重，欢迎把评估反馈写在每条末尾——让这份文档随着迭代越来越准。
