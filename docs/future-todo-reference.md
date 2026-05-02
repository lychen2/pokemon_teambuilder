# Future TODO 参考详解

这份文档用于保留原 `refer/` 目录里值得继续参考、但当前项目还没有完整实现的思路。  
`refer/` 已删除，不再保留整套第三方页面资源；如果后续继续做功能扩展，请优先参考这里列出的交互目标，而不是再把整份参考站搬回仓库。

## 1. 桌面端操作台分区

当前项目已经有主工作区和分析子页签，但还没有做到参考站那种“编辑台”深度。

可以继续参考的方向：

- 左侧固定为当前选中队员的预览卡，而不是只固定整队列表。
- 右侧编辑区拆成更明确的工作流标签：
  `Moves / Speed / EVs / Damage / Analysis / Roles / Cores`
- 桌面端和移动端使用不同的信息密度：
  桌面端强调并排编辑，移动端保留分段式堆叠。
- 分页切换不只是内容显隐，还要让用户明确知道“当前正在编辑哪一只”。

当前未改原因：

- 现有仓库的数据模型以“导入 Showdown 配置后整体浏览/选队”为中心，不是单只精灵编辑器。
- 如果直接照搬，会把当前“配置库驱动”的产品方向改成“逐只手工组队器”，这会影响已有流程。

## 2. Coverage 的下一步

当前项目已经有：

- 队伍承伤覆盖
- 输出覆盖
- 打击盲区
- 推荐中对“当前承伤缺口”的优先补位
- Coverage 矩阵的连续强度编码与文字语义标记

后续仍可继续加深的点：

- 在 Coverage 面板内直接显示“Suggested Covers”：
  从当前配置库里给出 3 个候选，并支持轮换。
- 把“当前队伍已经能处理哪些弱点”与“仍未覆盖哪些弱点”分成两块。
- 推荐时增加“少重复属性优先”的显式开关，而不是只体现在分数里。

## 3. Roles Checklist 的下一步

当前项目已经有基础职能：

- 控速
- 转场
- Fake Out
- 引导
- Guard
- 干扰
- Trick Room
- 物理 / 特殊 / 双刀 / 纯辅助倾向

参考站里更完整、但当前还没接入的 checklist 可以继续补：

- 岩钉 / 撒菱 / 毒菱 / 黏网
- 清场：
  `Rapid Spin / Defog / Court Change / Mortal Spin / Tidy Up`
- 屏障：
  `Reflect / Light Screen / Aurora Veil`
- 先制招式
- 强化手
- Wallbreaker / Revenge Killer
- 天气手 / 场地手
- 陷阱 / 吹飞 / 吼叫
- 回复与 Cleric 类支持

建议实现方式：

- 不要把所有角色硬编码在推荐分里。
- 把“角色定义”集中到独立模块，供 `分析 / 推荐 / 未来随机组队` 共用。

## 4. Cores 的下一步

当前项目已经有：

- 队内最佳双人 core
- 高重叠风险组合
- 选定成员后的“理想搭档属性组合”建议
- 基于当前配置库的真实补位候选
- 当前队友已覆盖弱点 / 候选新增风险 / 一键加入队伍

后续可继续参考的部分：

- 增加“三人 core”模式，而不是只看双人。
- 将 core 评分拆分成多项：
  `补主要弱点 / 免疫补位 / 共享弱点 / 单属性覆盖 / 双属性覆盖 / 职能互补`
- 把“真实候选”继续深化到招式级协同，而不只停留在属性 / 职能 / 速度模式层。

## 5. Speed 工作台的下一步

当前项目已经能输出速度线和队内速度结构，但参考站还有这些可继续借鉴的点：

- 单只精灵的速度配置器：
  `EV / IV / Nature / Tailwind / Web`
- 当前选中精灵在 tier 中的实时定位
- “我的速度”和“常见满速线”同表显示
- 自动滚动到自己的位置

如果以后做这部分，建议不要直接把整套参考站速度编辑器移过来，而是：

- 保持 Champions 规则
- 只引入真正需要的输入项
- 让它和当前配置编辑器共用数据模型

## 6. EV / IV / Damage 工作台

这块当前项目已完成基础伤害工作台，并在 2026/04/26 补上批量扫描；更深的编辑器和更完整的专题工作台仍可继续做。

可以拆成两个独立里程碑：

### 6.1 EV / IV 实时编辑器

- 当前配置的六维点数可视化
- Champions 点数上限提示
- Nature 对最终面板的影响
- 最终能力值实时刷新

### 6.2 Damage 计算器

- 已有：
  - 选己方 / 对方 / 招式
  - 基于当前导入数据的伤害估算
  - 单对位快捷调点
  - “我打对面全队 / 对面全队打我”批量扫描
- 后续可继续做：
  - 更强的批量矩阵筛选与导出
  - 更完整的专题面板（速度 / 点数 / 伤害联动）
  - 更少 shim、更多纯函数化的伤害核心封装

注意：

- 这部分复杂度高，必须单独拆模块。
- 不要把伤害计算逻辑塞进 `render` 或 `main`。

## 7. 随机组队生成器

参考站这部分是完整独立子系统，当前项目还没有。

未来如果要做，建议最低目标：

- 从当前库随机抽 6 只不是很有意义。
- 应该做成“带约束的推荐构队”：
  - 优先补承伤缺口
  - 优先补缺失职能
  - 避免过度重复属性
  - 考虑速度模式

更进一步才考虑：

- 风格预设：
  `进攻 / 平衡 / 偏受`
- 锁定已有成员后重抽
- 指定起手核心

## 8. 导入导出与保存体系

当前项目已有：

- 导入 Showdown 文本
- 导出配置库
- 导出当前队伍
- 本地持久化
- 已保存队伍列表
- 空库/未满队伍时的快速开始入口
- 破坏性清空操作已移入高级操作并二次确认

未来可参考但暂未改的方向：

- 更明确的导入结果摘要：
  成功几条、跳过几条、失败几条。
- 保存快照的时间戳和版本号。
- 从保存队伍反向恢复筛选条件或视图状态。

## 9. 不建议直接照搬的内容

以下内容不建议直接复制进当前项目：

- 整套深色科幻视觉包装
- 视频背景
- 随机队生成器的完整 UI
- 与当前数据模型不兼容的逐只精灵编辑器
- 大量面向 Smogon / tier 游戏模式的规则判断

原因很简单：

- 当前项目的定位是“静态配置库驱动的 Champions 队伍分析器”。
- 直接照搬会让产品方向偏掉，也会把代码复杂度拉高很多。

## 10. 推荐的后续改造顺序

如果以后继续做，建议顺序如下：

1. 扩展 Roles checklist 定义。
2. 继续把 Coverage 面板的 Suggested Covers 做成可轮换候选。
3. 把 Cores 从"真实配置候选"继续深化到三人 core / 招式协同。
4. 单独立项做 Speed 工作台。
5. 再决定是否需要 EV / IV / Damage。
6. 最后才考虑随机组队生成器。

## 11. 单体职能分析框架（待落地）

> 2026/05/01 用户提供。这是当前 `team-roles.js` 的目标终态——一个真正"可判定"的多维框架，覆盖主职能 / 副职能 / 条件职能 / 道具与太晶影响 / 多职能压缩评分。
>
> 当前 `team-roles.js` 只输出 5 个结构标签（sweeper / frailsweeper / tank / support / bulkysupport）+ utility tags，已经接入了"投入分配"和"道具感知"两条最关键的输入；剩下的需要按本节框架逐步分阶段实现。
>
> 2026/05/01 落地更新：已完成解释性 v1。现在输出 7 类主职能、可见副职能、技能格映射、道具影响、多职能评分与多职能判断，并在分析页 / 推荐页 / 当前队伍卡 / 配置库卡 / VGCPastes 团队卡展示。`externalspeed / coverdependent / timingdependent` 等条件风险只作为内部评分输入，不在 UI、tooltip 或推荐摘要中展示。

### 11.1 总框架（伪代码）

```text
输入：宝可梦 P = 种族值 / 属性 / 特性 / 技能 / 道具 / 太晶 / 努力值 / 速度线

Step 1：判断主职能
if P 的主要行动是造成击杀或压血:
    主职能 = 输出手（Attacker）
elif P 的主要行动是改变出手顺序:
    主职能 = 控速手（Speed Control）
elif P 的主要行动是保护队友完成关键动作:
    主职能 = 支援手（Support）
elif P 的主要价值来自进场效果、换人、削弱:
    主职能 = 轮转手（Pivot）
elif P 的主要价值来自吃伤害并持续站场:
    主职能 = 坦克 / 受盾（Tank / Wall）
elif P 的主要价值是针对某类热门威胁:
    主职能 = 环境针对位（Tech / Meta Check）
else:
    主职能 = 压缩型功能位（Role Compression）

Step 2：判断副职能
对每个可能职能 R：
    if P 不以 R 为核心，但每局经常能完成 R:
        标为副职能（Secondary Role）
    elif P 只有在特定条件下才能完成 R:
        标为条件职能（Conditional Role）
    else:
        不计入主要分析
```

### 11.2 输出类细分

#### 速攻手（Fast Attacker / Sweeper）

```text
if P 的速度高于常见核心
and P 不需要强化就有击杀压力
and P 失去速度优势后价值明显下降:
    P = 速攻手（Fast Attacker）
```

进一步细分：

```text
if P 常用于首发压制:
    副职能 = 开局压制手（Lead Pressure）
if P 常用于后排收残:
    副职能 = 清场手（Cleaner）
if P 靠围巾 / 顺风 / 天气加速:
    职能依赖 = 外部速度条件（External Speed Condition）
```

判断重点：`速攻手成立 = 速度优势 + 伤害足够 + 对手不能无视`

#### 爆破手（Nuke / Wallbreaker）

```text
if P 单次攻击伤害极高
and 能逼迫对手守住 / 太晶 / 换人
and 主要价值来自一回合爆发:
    P = 爆破手（Nuke）
```

细分：

```text
if P 主要打单个目标:
    副职能 = 单点爆破手（Single-target Breaker）
if P 主要同时压两个目标:
    副职能 = 范围打手（Spread Attacker）
if P 主要处理高耐久目标:
    副职能 = 破盾手（Wallbreaker）
```

判断重点：`爆破手成立 = 一次命中能改变局面`

#### 清场手（Cleaner）

```text
if P 在对面血量被压低后胜率明显上升
and P 有高速 / 先制 / 范围技能 / 稳定命中
and P 前期不一定需要承担主输出:
    P = 清场手（Cleaner）
```

判断重点：`清场手成立 = 后期比前期更强`

#### 强化核心（Setup Sweeper）

```text
if P 需要使用强化技能
and 强化后能成为主要胜利点
and 未强化前威胁明显较低:
    P = 强化核心（Setup Sweeper）
```

继续判断：

```text
if P 没有队友保护很难强化:
    依赖 = 掩护 / 击掌 / 控速
if P 强化后仍然怕黑雾 / 吼叫 / 再来一次:
    风险 = 易被反强化
```

判断重点：`强化核心成立 = 强化回合能被安全换成胜势`

### 11.3 防御类细分

#### 坦克（Tank）

```text
if P 能吃关键攻击
and P 同时能造成伤害或干扰
and 对手不能无视 P:
    P = 坦克（Tank）

if P 主要吃物理攻击:
    副职能 = 物理受盾（Physical Wall）
if P 主要吃特殊攻击:
    副职能 = 特殊受盾（Special Wall）
if P 靠抗性换入而不是纯耐久:
    副职能 = 抗性换入位（Defensive Switch-in）
```

判断重点：`坦克 ≠ 只是肉；坦克成立 = 吃伤害 + 反向制造价值`

#### 受盾（Wall）

```text
if P 的主要价值是挡住某类攻击
and P 输出压力较低
and 通过回复 / 降能力 / 状态维持站场:
    P = 受盾（Wall）

if P 被挑衅后几乎没事做:
    风险 = 过度依赖变化招式
if P 只能吃伤害但不能反制:
    风险 = 被无视
```

### 11.4 控速类细分

#### 顺风手（Tailwind Setter）

```text
if P 会顺风
and P 能在多数对局中稳定开出顺风
and 顺风后队友能立刻受益:
    P = 顺风手（Tailwind Setter）

if P 开完顺风后还能挑衅 / 假哭 / 帮助 / 输出:
    质量 = 高
else:
    质量 = 一次性工具人
```

判断重点：`顺风手成立 = 能开 + 开完不废 + 队友能利用`

#### 空间手（Trick Room Setter）

```text
if P 会戏法空间
and P 有足够耐久或保护机制撑到出手
and 空间开启后己方能受益:
    P = 空间手（Trick Room Setter）

if P 开完空间后还能回复 / 输出 / 干扰:
    质量 = 高
if P 怕挑衅 / 击掌 / 封印且无应对:
    稳定性 = 低
```

判断重点：`空间手成立 = 能活到开空间 + 开完后仍有价值`

#### 软控速手（Soft Speed Control）

```text
if P 用冰冻之风 / 电网 / 重踏 / 电磁波等改变速度线
and 不依赖完整队伍模式:
    P = 软控速手（Soft Speed Control）

if 技能是双目标:
    控速范围 = 高
if 技能命中不稳定或有大量免疫:
    稳定性 = 低
```

判断重点：`软控速成立 = 低成本改变关键速度线`

#### 先制手（Priority User）

```text
if P 有实用先制技能
and 能用先制完成补刀 / 反杀 / 绕过控速:
    P = 先制手（Priority User）

if 环境中精神场地 / 反先制特性很多:
    先制价值下降
```

### 11.5 支援类细分

#### 击掌手（Fake Out User）

```text
if P 会击掌奇袭
and 击掌能帮助队友完成关键行动
and 击掌后 P 仍有后续价值:
    P = 击掌手（Fake Out User）

if P 有威吓 / 抛下狠话 / 急速折返:
    副职能 = 轮转击掌手（Pivot Fake Out）
if P 只有击掌，后续无价值:
    质量 = 低
```

判断重点：`击掌手成立 = 第一回合行动差 + 后续不废`

#### 重定向手（Redirection User）

```text
if P 会看我嘛 / 愤怒粉
and P 能吃下被吸走的攻击
and 队友能利用该回合完成关键动作:
    P = 重定向手（Redirection User）

if P 同时有回复 / 催眠 / 状态干扰:
    质量 = 高
if P 容易被范围技能无视:
    风险 = 怕范围压制
```

判断重点：`重定向成立 = 自己能吃 + 队友能赚`

#### 挑衅手（Taunt User）

```text
if P 会挑衅
and 速度或优先度足够先于目标
and 能阻止空间 / 顺风 / 强化 / 催眠 / 回复:
    P = 挑衅手（Taunt User）
```

判断重点：`挑衅手成立 = 能先手封住关键变化招式`

#### 催眠手（Sleep User）

```text
if P 有稳定睡眠手段
and 对手必须为防睡眠改变行动:
    P = 催眠手（Sleep User）

if P 是慢速且配合空间:
    模式 = 空间催眠
if P 怕草系 / 防尘镜 / 电气场地 / 薄雾场地:
    风险 = 常见免疫
```

判断重点：`催眠手成立 = 不一定每次睡中，但能逼迫对手防睡`

#### 降能力手（Debuffer）

```text
if P 能稳定降低对手攻击 / 特攻 / 防御 / 特防 / 速度:
    P = 降能力手（Debuffer）

if 降低对方输出:
    类型 = 防守降能力（Defensive Debuff）
if 降低对方防御:
    类型 = 进攻辅助降能力（Offensive Debuff）
if 同时影响两个目标:
    质量 = 高
```

判断重点：`降能力成立 = 降完后己方立刻获得生存或击杀收益`

#### 反强化手（Anti-Setup / Haze User）

```text
if P 能用黑雾 / 吼叫 / 再来一次 / 清除之烟等阻止强化收益:
    P = 反强化手（Anti-Setup）
```

判断重点：`反强化成立 = 对面强化后不能直接滚雪球`

### 11.6 轮转类细分

#### 威吓轮转手（Intimidate Pivot）

```text
if P 有威吓
and P 能多次进出场
and 进场后还能击掌 / 抛下狠话 / 输出 / 干扰:
    P = 威吓轮转手（Intimidate Pivot）

if 对面有不服输 / 好胜 / 清净坠饰:
    威吓收益下降甚至反亏
```

判断重点：`威吓轮转成立 = 多次进场都能产生价值`

#### 换位轮转手（Pivot）

```text
if P 有急速折返 / 伏特替换 / 抛下狠话
or P 靠抗性频繁换入换出:
    P = 轮转手（Pivot）

if 换出时还能造成伤害 / 降能力:
    质量 = 高
if 换入后不能承压:
    质量 = 低
```

判断重点：`轮转成立 = 换人不是逃跑，而是重新获得站位优势`

### 11.7 环境针对类细分

#### 环境针对位（Tech / Meta Check）

```text
if P 的主要价值是处理某类热门威胁
and 在其他对局中价值一般:
    P = 环境针对位（Tech / Meta Check）

if P 阻止戏法空间:
    类型 = 反空间（Anti-Trick Room）
if P 处理顺风高速压制:
    类型 = 反顺风（Anti-Tailwind）
if P 绕过看我嘛 / 愤怒粉:
    类型 = 反重定向（Anti-Redirection）
if P 不怕或惩罚威吓:
    类型 = 反威吓（Anti-Intimidate）
if P 专门处理天气队:
    类型 = 反天气（Anti-Weather）
```

判断重点：`环境针对成立 = 对热门威胁有明确答案，而不是"好像能打"`

### 11.8 多职能压缩判断（最重要的一节）

很多强宝可梦不是单一职能强，而是压缩多个职能。

```text
RoleScore(P) = 主职能稳定性 + 副职能数量 + 副职能质量 - 条件依赖 - 技能格冲突

if P 有 1 个稳定主职能
and 有 2 个以上常用副职能
and 这些职能不互相抢技能格
and 不严重依赖单一条件:
    P = 高质量职能压缩（High Role Compression）

if P 理论上能做很多事
but 每局只能做其中一件
or 技能格严重不够
or 需要太多外部条件:
    P = 伪多职能（Fake Role Compression）
```

### 11.9 技能格判断

```text
for 技能 in P 的四个技能:
    标记该技能提供的职能

if 4 个技能都对应清晰职能:
    技能结构 = 紧凑
elif 有技能很少点击:
    技能结构 = 可优化
elif 多个技能服务不同模式但互相冲突:
    技能结构 = 分裂
```

技能 → 职能映射示例：

```text
守住（Protect）         = 保命 / 拖控速 / 规避集火
击掌奇袭（Fake Out）    = 行动差 / 掩护队友
顺风（Tailwind）        = 控速
输出技能                 = 击杀压力
挑衅（Taunt）           = 反辅助
黑雾（Haze）            = 反强化
看我嘛（Follow Me）     = 重定向
愤怒粉（Rage Powder）   = 重定向
```

判断重点：`一个技能如果不能对应明确职能，就要怀疑它的必要性`

### 11.10 道具改变职能的判断

```text
if 道具 = 气势披带（Focus Sash）:
    倾向 = 稳定行动一次 / 首发工具位
if 道具 = 突击背心（Assault Vest）:
    倾向 = 特耐坦克 / 攻击型承伤
if 道具 = 讲究围巾（Choice Scarf）:
    倾向 = 高速反杀 / 锁招输出
if 道具 = 讲究眼镜 / 讲究头带（Choice Specs / Choice Band）:
    倾向 = 爆破手
if 道具 = 文柚果（Sitrus Berry）:
    倾向 = 耐久支援 / 坦克
if 道具 = 隐密斗篷（Covert Cloak）:
    倾向 = 反击掌追加效果 / 稳定辅助
if 道具 = 防尘镜（Safety Goggles）:
    倾向 = 反睡眠 / 反愤怒粉
if 道具 = 清净坠饰（Clear Amulet）:
    倾向 = 反威吓物攻手
```

> **注**：当前 `team-roles.js` 已部分实现该判断（Choice Scarf / Specs / Band / Life Orb / Expert Belt / Assault Vest / Focus Sash），剩余的（Sitrus / Covert Cloak / Safety Goggles / Clear Amulet）尚未接入。

### 11.11 太晶改变职能的判断

```text
if 太晶增强本系输出:
    太晶职能 = 爆破 / 清场
elif 太晶改变弱点:
    太晶职能 = 防守转型
elif 太晶草:
    额外职能 = 反蘑菇孢子 / 反愤怒粉
elif 太晶幽灵:
    额外职能 = 反击掌
elif 太晶钢 / 水 / 火 / 妖:
    额外职能 = 抗性修正
```

判断重点：`太晶不是单独职能，而是把原职能加强或转换`

> **注**：M-A 赛季禁太晶，本节优先级低；但底层 `getEffectiveTypes` 已支持太晶语义，未来切到允许太晶的赛季时这套规则可以无缝接入。

### 11.12 最终输出模板

以后分析单只宝可梦可以直接套这个：

```text
宝可梦：P

主职能：
- XXX（English Term）

副职能：
- XXX（English Term）
- XXX（English Term）

技能格映射：
- 技能 1 → 职能 A
- 技能 2 → 职能 B
- 技能 3 → 职能 C
- 技能 4 → 职能 D

道具影响：
- 道具把它从 XXX 推向 XXX

太晶影响：
- 太晶用于 增伤 / 防守 / 反制

一句话判断：
P 是一个【主职能】，同时兼顾【副职能 1 / 副职能 2】，当前属于【多职能判断】。
```

### 11.13 更短的判定公式

```text
单体职能 = 常点击的技能 + 进场立即产生的价值 + 逼迫对手做出的反应
```

如果一只宝可梦能做到：

```text
稳定主职能 ≥ 1
有效副职能 ≥ 2
技能格冲突低
外部依赖低
```

那它就是 VGC 里很优质的多职能宝可梦。

### 11.14 实施路线图（建议分期落地）

> 当前状态（2026/05/01）：解释性 v1 已落地。底层仍保留旧 `getStructureRoles(config)[0]` 兼容入口，但主展示已转向 `analyzePokemonRoles(config)` 的主职能 / 副职能 / 技能格 / 道具影响 / 多职能判断。

**Phase 1（基础升级，已完成）**

- 把主职能扩成 7 类：`Attacker / SpeedControl / Support / Pivot / Tank / TechCheck / Compression`
- 完善 utility roles 的 i18n（已有大部分），新增 `cleaner / lead / setupsweeper / nuke / specialwall / physicalwall / antisetup / antisleep / sleep / debuffer / techcheck` 等子类标签
- 输出结构改成 `{primary, secondary, conditional, compressionScore, compressionTier}`，向下兼容旧 `getStructureRoles[0]` 入口

**Phase 2（道具/技能格映射，已完成解释性 v1）**

- 把 11.10 道具表完整建模到 `ITEM_ROLE_HINTS`
- 实现 11.9 技能格 → 职能映射（每招标注它服务的 1-N 个职能）
- 输出 `moveSlotQuality / moveSlotConflicts / itemRoleSummary / roleReasons`，供分析页和卡片 tooltip 共用
- `compressionScore` 已纳入副职能数量、技能格覆盖、道具加成、内部依赖惩罚；UI 显示为"多职能评分"

**Phase 3（条件风险，已裁剪为内部评分输入）**

- `externalspeed / coverdependent / timingdependent` 只保留为内部多职能评分输入
- UI 不展示条件风险标签，避免把"成立条件"误读成职能

**Phase 4（meta check 和反制识别，按需）**

- 11.7 的"环境针对位"识别：需要先有当前 meta 主流威胁列表（可从 paste_teams 反推热门物种）
- 一句话生成器（11.12）已在紧凑职能 tooltip 中落地，后续可继续接 meta-aware 文案

**Phase 5（太晶职能，留给非 M-A 赛季）**

- 11.11 太晶规则等到 Champions 赛季允许太晶后再实现，优先级最低

### 11.15 现状对照（2026/05/01 实际代码）

| 框架要素 | 当前 `team-roles.js` 状态 | 完成度 |
| --- | --- | :---: |
| 主职能 7 类 | `analyzePokemonRoles` 已输出 `Attacker / SpeedControl / Support / Pivot / Tank / TechCheck / Compression`；旧结构标签保留兼容 | ✓ |
| 副职能 | 已输出可见副职能，并在分析页 / 推荐页 / 当前队伍卡 / 配置库卡 / VGCPastes 团队卡展示 | ✓ |
| 条件风险 | 仅内部参与多职能评分，不在 UI 展示 | ✓ |
| 投入分配（points） | 已接入：`hasOffensiveInvestment`（≥24 点） | ✓ |
| 道具感知 | 已接入 Choice Scarf/Specs/Band, Life Orb, Expert Belt, Assault Vest, Focus Sash, Sitrus, Covert Cloak, Safety Goggles, Clear Amulet，并输出 `itemRoleSummary` | ✓ |
| 强化核心识别 | 已接入：`hasSetup + hasOffensiveInvestment` | ✓ |
| 技能格映射 | 已输出每招对应职能，并计算 `moveSlotQuality` | ✓ |
| 多职能评分 | 已输出 `compressionScore` 与 `compressionTier`；UI 使用"多职能/职能较单一/职能分散"等直白文案 | ✓ |
| 太晶职能 | 未实现（M-A 赛季不需要） | ✗ |
| 环境针对识别 | 已有道具/招式级 techcheck 雏形；meta-aware 热门威胁识别未实现 | ⚠ 部分 |

下次迭代直接按 11.14 的 Phase 1 → 2 → 3 推进即可。

## 12. 用户提供的完整职能分类(2026/05/02 待并入 team-roles.js)

> 来源:用户在迭代会话中提供的全量职能清单(9 大类、约 110 条)。当前 `team-role-*` 模块只覆盖第 11 节实施路线图里的主/副职能,**这份清单里很多条目尚未识别**——典型例:反威吓位、降速手、突击背心坦克、各种"反制位"、各种墙的细分(反射壁/光墙/极光幕)等。
>
> 本节是目标规格,不是当前实现状态。后续实现必须显式接入真实数据源或明确的代理指标;不要用静默 fallback、假成功路径或吞错逻辑把缺数据的规则伪装成已支持。

### 12.1 基础函数与变量

```text
has_move(P, M)              = P 的技能中包含 M
has_any_move(P, Set)        = P 至少拥有 Set 中任意一个技能
has_ability(P, A)           = P 的特性为 A
has_item(P, I)              = P 的道具为 I
has_type(P, T)              = P 拥有属性 T
tera_type(P, T)             = P 的太晶属性为 T

speed_rank(P, META)         = P 实战速度在 META 中的百分位,范围 0~1
atk_rank(P, META)           = P 物理输出能力百分位,范围 0~1
spa_rank(P, META)           = P 特殊输出能力百分位,范围 0~1
bulk_phys_rank(P, META)     = P 物理耐久百分位,范围 0~1
bulk_sp_rank(P, META)       = P 特殊耐久百分位,范围 0~1

OHKO_rate(P, META)          = P 对 META 中目标造成一击击杀的比例
2HKO_rate(P, META)          = P 对 META 中目标造成二击击杀的比例
survive_phys_rate(P, META)  = P 能承受 META 中物理主攻一次攻击的比例
survive_sp_rate(P, META)    = P 能承受 META 中特殊主攻一次攻击的比例
survive_double_target_rate(P, META) = P 能承受 META 中常见双集火回合的比例
support_move_count(P)       = P 技能中变化/辅助技能数量
resisted_meta_attack_rate(P, META) = P 抵抗或免疫 META 常用攻击属性的比例
passive_damage_rate(P)      = P 通过异常、天气、寄生种子等持续伤害创造收益的比例
weather_boosted_damage_rate(P) = 天气下 P 输出显著提升的目标比例
terrain_boosted_damage_rate(P) = 场地下 P 输出显著提升的目标比例
terrain_prevents_status_or_priority(P) = P 建立的场地能否阻止关键异常或先制
target_matchup_winrate_gain(P, Target) = P 对指定目标集合带来的胜率提升
winrate_vs_core(P, Core)    = P 面对指定核心的胜率
survive_and_2HKO_rate(P, Threat_Set) = P 承伤后仍能 2HKO 热门威胁的比例
opponent_OHKO_threat_to_P(P, META) = 对手认为需要优先击杀 P 的威胁比例
survive_rate_after_attack(P, META) = P 完成主要攻击后仍存活的比例
accuracy_min(P_main_moves)  = P 主要输出/功能招式中的最低命中率
```

```text
spread_move_set       = {热风, 喷水, 地震, 岩崩, 魔法闪耀, 星碎, 金属音爆, 暴风雪, 放电, 巨声, ...}
priority_move_set     = {神速, 突袭, 水流喷射, 音速拳, 子弹拳, 冰砾, 影子偷袭, 青草滑梯, ...}
setup_move_set        = {剑舞, 诡计, 龙舞, 冥想, 腹鼓, 铁壁, 健美, 蝶舞, ...}
recovery_move_set     = {自我再生, 羽栖, 月光, 光合作用, 守住 + 剩饭恢复, ...}
pivot_move_set        = {急速折返, 伏特替换, 抛下狠话}
speed_drop_move_set   = {冰冻之风, 电网, 重踏, 岩石封锁, 电磁波, 蹭蹭脸颊}
status_move_set       = {鬼火, 电磁波, 蘑菇孢子, 催眠粉, 催眠术, 毒毒, 哈欠}
redirection_move_set  = {看我嘛, 愤怒粉}
screen_move_set       = {反射壁, 光墙, 极光幕}
anti_setup_move_set   = {黑雾, 清除之烟, 吼叫, 吹飞, 再来一次, 封印}
```

### 12.2 推进策略(承接 §11.14 之后)

不要一次性把 110 条都塞进识别器。建议分批:

- **Phase A — 高频热门补全(10–20 条)**:挑用户和赛季最痛点的几条,跑通"识别规则 + i18n + UI 展示 + 推荐评分"全链路。候选:反威吓位、降速手、突击背心坦克、广域防守手、反空间位、反顺风位、麻痹手、回复型站场位、围巾手、催眠手。
- **Phase B — 输出/防御细分**:把 §12.3 输出类、防御类里 §11 还没区分的子条目接入(主攻/副攻/单点爆破/范围打手/物理墙/特殊墙/混合墙等)。
- **Phase C — 控速 / 干扰 / 轮转细分**:细化到具体招式触发(降能力手细分到鬼火/麻痹/降速/降攻等)。
- **Phase D — 反制位与综合类**:反制位多数依赖"队伍配置 + 环境元数据",识别成本高,放最后。综合类(胜利条件、节奏控制位等)需要队伍上下文而不是单只识别。

每个 Phase 都以 §12.3 的判定条件为准。缺少 `OHKO_rate`、`2HKO_rate`、环境百分位或核心胜率等数据输入时,该条应标为"需要数据源",不能静默降级成只看招式名或种族值。

### 12.3 全量可判定规则

#### 输出类

- **输出手(Attacker)**: `OHKO_rate(P, META) >= 0.25 or 2HKO_rate(P, META) >= 0.60`
- **物理输出手(Physical Attacker)**: `atk_rank(P, META) >= 0.70 and spa_rank(P, META) < atk_rank(P, META)`
- **特殊输出手(Special Attacker)**: `spa_rank(P, META) >= 0.70 and atk_rank(P, META) < spa_rank(P, META)`
- **混合输出手(Mixed Attacker)**: `atk_rank(P, META) >= 0.60 and spa_rank(P, META) >= 0.60`
- **速攻手(Fast Attacker / Sweeper)**: `speed_rank(P, META) >= 0.75 and OHKO_rate(P, META) >= 0.20`
- **高速压制手(Speed Pressure)**: `speed_rank(P, META) >= 0.80 and 2HKO_rate(P, META) >= 0.50`
- **主攻手(Primary Attacker)**: `OHKO_rate(P, META) >= 0.30 or 2HKO_rate(P, META) >= 0.70`
- **副攻手(Secondary Attacker)**: `0.15 <= OHKO_rate(P, META) < 0.30 or 0.40 <= 2HKO_rate(P, META) < 0.70`
- **爆破手(Nuke)**: `OHKO_rate(P, META) >= 0.35`
- **单点爆破手(Single-target Breaker)**: `OHKO_rate(P, META) >= 0.30 and not has_any_move(P, spread_move_set)`
- **范围打手(Spread Attacker)**: `has_any_move(P, spread_move_set) and 2HKO_rate(P, META) >= 0.45`
- **破盾手(Wallbreaker)**: `2HKO_rate(P, META_high_bulk) >= 0.50`,其中 `META_high_bulk = META 中 bulk_phys_rank 或 bulk_sp_rank >= 0.75 的目标`
- **清场手(Cleaner)**: `((speed_rank(P, META) >= 0.70 and has_any_move(P, priority_move_set)) or speed_rank(P, META) >= 0.85) and 2HKO_rate(P, META) >= 0.45`
- **反杀手(Revenge Killer)**: `(speed_rank(P, META) >= 0.80 or has_any_move(P, priority_move_set) or has_item(P, 讲究围巾)) and OHKO_rate(P, META_low_hp) >= 0.60`,其中 `META_low_hp = META 中剩余 HP <= 50% 的目标`
- **强化核心(Setup Sweeper)**: `has_any_move(P, setup_move_set) and 2HKO_rate(P_after_setup, META) >= 0.70`
- **残局胜利点(Endgame Win Condition)**: `(survive_phys_rate(P, META) >= 0.50 or survive_sp_rate(P, META) >= 0.50) and (has_any_move(P, recovery_move_set) or has_any_move(P, setup_move_set) or speed_rank(P, META) >= 0.80)`
- **太晶爆破手(Tera Nuke)**: `OHKO_rate(P_after_tera, META) - OHKO_rate(P_before_tera, META) >= 0.20`;M-A 赛季无 Tera,延后实现
- **先制输出手(Priority Attacker)**: `has_any_move(P, priority_move_set) and atk_rank(P, META) >= 0.60`

#### 防御类

- **坦克(Tank)**: `(survive_phys_rate(P, META) >= 0.50 or survive_sp_rate(P, META) >= 0.50) and 2HKO_rate(P, META) >= 0.35`
- **受盾(Wall)**: `(survive_phys_rate(P, META) >= 0.70 or survive_sp_rate(P, META) >= 0.70) and (has_any_move(P, recovery_move_set) or has_any_move(P, status_move_set) or has_any_move(P, screen_move_set))`
- **物理受盾(Physical Wall)**: `survive_phys_rate(P, META) >= 0.75 and bulk_phys_rank(P, META) >= 0.75`
- **特殊受盾(Special Wall)**: `survive_sp_rate(P, META) >= 0.75 and bulk_sp_rank(P, META) >= 0.75`
- **混合受盾(Mixed Wall)**: `survive_phys_rate(P, META) >= 0.65 and survive_sp_rate(P, META) >= 0.65`
- **耐久输出手(Bulky Attacker)**: `(survive_phys_rate(P, META) >= 0.50 or survive_sp_rate(P, META) >= 0.50) and 2HKO_rate(P, META) >= 0.50`
- **耐久支援手(Bulky Support)**: `(survive_phys_rate(P, META) >= 0.50 or survive_sp_rate(P, META) >= 0.50) and support_move_count(P) >= 2`
- **抗性换入位(Defensive Switch-in)**: `resisted_meta_attack_rate(P, META) >= 0.30`
- **吸收伤害位(Damage Sponge)**: `survive_phys_rate(P, META) >= 0.70 or survive_sp_rate(P, META) >= 0.70`
- **消耗核心(Stall / Attrition Core)**: `has_any_move(P, recovery_move_set) and (has_any_move(P, status_move_set) or passive_damage_rate(P) > 0)`
- **回复型站场位(Recovery-based Wall)**: `has_any_move(P, recovery_move_set) and (survive_phys_rate(P, META) >= 0.60 or survive_sp_rate(P, META) >= 0.60)`
- **突击背心坦克(Assault Vest Tank)**: `has_item(P, 突击背心) and survive_sp_rate(P, META) >= 0.65 and 2HKO_rate(P, META) >= 0.35`

#### 控速类

- **控速手(Speed Control)**: `has_move(P, 顺风) or has_move(P, 戏法空间) or has_any_move(P, speed_drop_move_set)`
- **顺风手(Tailwind Setter)**: `has_move(P, 顺风)`
- **戏法空间手(Trick Room Setter)**: `has_move(P, 戏法空间) and survive_double_target_rate(P, META) >= 0.50`
- **空间打手(Trick Room Sweeper)**: `speed_rank(P, META) <= 0.25 and 2HKO_rate(P, META) >= 0.55`
- **软控速手(Soft Speed Control)**: `has_any_move(P, speed_drop_move_set)`
- **降速手(Speed Debuffer)**: `has_any_move(P, {冰冻之风, 电网, 重踏, 岩石封锁, 电磁波, 蹭蹭脸颊})`
- **先制手(Priority User)**: `has_any_move(P, priority_move_set)`
- **天气加速手(Weather Sweeper)**: `has_ability(P, 悠游自如) or has_ability(P, 叶绿素) or has_ability(P, 拨沙) or has_ability(P, 拨雪)`
- **围巾手(Choice Scarf User)**: `has_item(P, 讲究围巾)`
- **反控速手(Anti-Speed Control)**: `has_move(P, 戏法空间) or has_move(P, 封印) or has_move(P, 挑衅) or has_any_move(P, priority_move_set)`

#### 支援类

- **支援手(Support)**: `support_move_count(P) >= 2`
- **击掌手(Fake Out User)**: `has_move(P, 击掌奇袭)`
- **重定向手(Redirection User)**: `has_any_move(P, redirection_move_set)`
- **看我嘛手(Follow Me User)**: `has_move(P, 看我嘛)`
- **愤怒粉手(Rage Powder User)**: `has_move(P, 愤怒粉)`
- **挑衅手(Taunt User)**: `has_move(P, 挑衅)`
- **催眠手(Sleep User)**: `has_any_move(P, {蘑菇孢子, 催眠粉, 催眠术, 哈欠, 唱歌, 草笛})`
- **状态手(Status Spreader)**: `has_any_move(P, status_move_set)`
- **鬼火手(Will-O-Wisp User)**: `has_move(P, 鬼火)`
- **麻痹手(Paralysis Spreader)**: `has_any_move(P, {电磁波, 蹭蹭脸颊, 麻痹粉, 蛇瞪眼})`
- **帮助手(Helping Hand User)**: `has_move(P, 帮助)`
- **开墙手(Screens Setter)**: `has_any_move(P, screen_move_set)`
- **反射壁手(Reflect Setter)**: `has_move(P, 反射壁)`
- **光墙手(Light Screen Setter)**: `has_move(P, 光墙)`
- **极光幕手(Aurora Veil Setter)**: `has_move(P, 极光幕)`
- **回复支援手(Healing Support)**: `has_any_move(P, {治愈波动, 花粉团, 生命水滴, 祈愿, 芳香治疗, 治愈铃声})`
- **保护型支援(Protective Support)**: `has_any_move(P, {看我嘛, 愤怒粉, 广域防守, 快速防守, 交换场地, 帮助, 击掌奇袭})`

#### 干扰类

- **干扰手(Disruptor)**: `has_any_move(P, {击掌奇袭, 挑衅, 再来一次, 定身法, 鬼火, 电磁波, 蘑菇孢子, 封印})`
- **降能力手(Debuffer)**: `has_any_move(P, {大声咆哮, 怪异电波, 威吓相关进场, 假哭, 刺耳声, 广域破坏, 撒娇, 羽毛舞})`
- **威吓手(Intimidate User)**: `has_ability(P, 威吓)`
- **大声咆哮手(Snarl User)**: `has_move(P, 大声咆哮)`
- **怪异电波手(Eerie Impulse User)**: `has_move(P, 怪异电波)`
- **进攻辅助降能力手(Offensive Debuffer)**: `has_any_move(P, {假哭, 刺耳声, 金属音, 酸液炸弹})`
- **假哭手(Fake Tears User)**: `has_move(P, 假哭)`
- **刺耳声手(Screech User)**: `has_move(P, 刺耳声)`
- **反强化手(Anti-Setup)**: `has_any_move(P, anti_setup_move_set)`
- **黑雾手(Haze User)**: `has_move(P, 黑雾)`
- **清除之烟手(Clear Smog User)**: `has_move(P, 清除之烟)`
- **再来一次手(Encore User)**: `has_move(P, 再来一次)`
- **封印手(Imprison User)**: `has_move(P, 封印)`
- **定身法手(Disable User)**: `has_move(P, 定身法)`
- **广域防守手(Wide Guard User)**: `has_move(P, 广域防守)`
- **快速防守手(Quick Guard User)**: `has_move(P, 快速防守)`

#### 轮转类

- **轮转手(Pivot)**: `has_any_move(P, pivot_move_set)`
- **威吓轮转手(Intimidate Pivot)**: `has_ability(P, 威吓) and (has_any_move(P, pivot_move_set) or has_move(P, 击掌奇袭))`
- **击掌轮转手(Fake Out Pivot)**: `has_move(P, 击掌奇袭) and has_any_move(P, pivot_move_set)`
- **抛下狠话手(Parting Shot User)**: `has_move(P, 抛下狠话)`
- **急速折返手(U-turn User)**: `has_move(P, 急速折返)`
- **伏特替换手(Volt Switch User)**: `has_move(P, 伏特替换)`
- **再生力轮转手(Regenerator Pivot)**: `has_ability(P, 再生力) and resisted_meta_attack_rate(P, META) >= 0.20`
- **天气重置手(Weather Reset Pivot)**: `has_ability(P, 降雨) or has_ability(P, 日照) or has_ability(P, 扬沙) or has_ability(P, 降雪)`
- **场地重置手(Terrain Reset Pivot)**: `has_ability(P, 电气制造者) or has_ability(P, 精神制造者) or has_ability(P, 青草制造者) or has_ability(P, 薄雾制造者)`

#### 场地 / 天气 / 体系类

- **天气手(Weather Setter)**: `has_ability(P, 降雨) or has_ability(P, 日照) or has_ability(P, 扬沙) or has_ability(P, 降雪) or has_any_move(P, {求雨, 大晴天, 沙暴, 雪景})`
- **雨天手(Rain Setter)**: `has_ability(P, 降雨) or has_move(P, 求雨)`
- **晴天手(Sun Setter)**: `has_ability(P, 日照) or has_move(P, 大晴天)`
- **沙暴手(Sand Setter)**: `has_ability(P, 扬沙) or has_move(P, 沙暴)`
- **雪天手(Snow Setter)**: `has_ability(P, 降雪) or has_move(P, 雪景)`
- **场地手(Terrain Setter)**: `has_ability(P, 电气制造者) or has_ability(P, 精神制造者) or has_ability(P, 青草制造者) or has_ability(P, 薄雾制造者) or has_any_move(P, {电气场地, 精神场地, 青草场地, 薄雾场地})`
- **电气场地手(Electric Terrain Setter)**: `has_ability(P, 电气制造者) or has_move(P, 电气场地)`
- **精神场地手(Psychic Terrain Setter)**: `has_ability(P, 精神制造者) or has_move(P, 精神场地)`
- **青草场地手(Grassy Terrain Setter)**: `has_ability(P, 青草制造者) or has_move(P, 青草场地)`
- **薄雾场地手(Misty Terrain Setter)**: `has_ability(P, 薄雾制造者) or has_move(P, 薄雾场地)`
- **天气核心(Weather Core)**: `is_weather_setter(P) and (has_ability(P, 悠游自如) or has_ability(P, 叶绿素) or has_ability(P, 拨沙) or has_ability(P, 拨雪) or weather_boosted_damage_rate(P) >= 0.20)`
- **场地核心(Terrain Core)**: `is_terrain_setter(P) and (terrain_boosted_damage_rate(P) >= 0.20 or terrain_prevents_status_or_priority(P))`
- **模式启动器(Mode Enabler)**: `is_weather_setter(P) or is_terrain_setter(P) or has_move(P, 顺风) or has_move(P, 戏法空间)`

#### 反制类(队伍上下文/环境元数据,落地成本最高)

- **环境针对位(Tech / Meta Check)**: `target_matchup_winrate_gain(P, Target) >= 0.20`,其中 `Target = 指定热门核心或热门宝可梦集合`
- **反空间位(Anti-Trick Room)**: `has_move(P, 挑衅) or has_move(P, 封印) or has_move(P, 戏法空间) or has_any_move(P, {吼叫, 吹飞})`
- **反顺风位(Anti-Tailwind)**: `has_move(P, 戏法空间) or has_any_move(P, speed_drop_move_set) or has_any_move(P, priority_move_set)`
- **反重定向位(Anti-Redirection)**: `has_any_move(P, spread_move_set) or has_type(P, 草) or has_item(P, 防尘镜) or has_ability(P, 防尘)`
- **反威吓位(Anti-Intimidate)**: `has_ability(P, 不服输) or has_ability(P, 好胜) or has_item(P, 清净坠饰) or (spa_rank(P, META) >= 0.70 and atk_rank(P, META) < 0.40)`
- **反天气位(Anti-Weather)**: `is_weather_setter(P) or has_any_move(P, {求雨, 大晴天, 沙暴, 雪景})`
- **反场地位(Anti-Terrain)**: `is_terrain_setter(P) or has_any_move(P, {电气场地, 精神场地, 青草场地, 薄雾场地})`
- **反催眠位(Anti-Sleep)**: `has_type(P, 草) or has_item(P, 防尘镜) or has_ability(P, 防尘) or tera_type(P, 草) or has_ability(P, 甜幕) or has_ability(P, 不眠) or has_ability(P, 干劲)`
- **反先制位(Anti-Priority)**: `has_ability(P, 女王的威严) or has_ability(P, 鲜艳之躯) or is_psychic_terrain_setter(P)`
- **反击掌位(Anti-Fake Out)**: `has_type(P, 幽灵) or has_ability(P, 精神力) or has_item(P, 隐密斗篷) or tera_type(P, 幽灵)`
- **反强化位(Anti-Setup)**: `has_any_move(P, anti_setup_move_set)`
- **反范围招式位(Anti-Spread Move)**: `has_move(P, 广域防守)`
- **反特定核心位(Core Check)**: `winrate_vs_core(P, Core) >= 0.60`
- **热门威胁检查位(Threat Check)**: `OHKO_rate(P, Threat_Set) >= 0.50 or survive_and_2HKO_rate(P, Threat_Set) >= 0.50`

#### 综合类(依赖队伍上下文,非单只识别)

- **多职能压缩位(Role Compression)**: `count_true_roles(P) >= 3`;当前解释性 v1 已实现代理评分
- **工具人(Utility Pokémon)**: `support_move_count(P) >= 2 and OHKO_rate(P, META) < 0.25`
- **首发压制位(Lead Pressure)**: `has_move(P, 击掌奇袭) or has_move(P, 顺风) or has_move(P, 挑衅) or (speed_rank(P, META) >= 0.80 and OHKO_rate(P, META) >= 0.20)`
- **后排收割位(Backline Cleaner)**: `(speed_rank(P, META) >= 0.75 or has_any_move(P, priority_move_set)) and OHKO_rate(P, META_low_hp) >= 0.60`
- **中盘站场位(Midgame Stabilizer)**: `(survive_phys_rate(P, META) >= 0.50 or survive_sp_rate(P, META) >= 0.50) and (has_any_move(P, pivot_move_set) or has_any_move(P, recovery_move_set) or has_ability(P, 威吓))`
- **胜利条件(Win Condition)**: `2HKO_rate(P_after_condition, META) >= 0.75`,其中 `condition = 强化后 / 太晶后 / 顺风下 / 空间下 / 天气下 / 场地下`
- **诱导集火位(Bait / Pressure Sink)**: `opponent_OHKO_threat_to_P(P, META) >= 0.30 and (survive_double_target_rate(P, META) >= 0.50 or has_move(P, 守住))`
- **节奏控制位(Tempo Control)**: `has_move(P, 击掌奇袭) or has_move(P, 顺风) or has_move(P, 戏法空间) or has_any_move(P, {挑衅, 再来一次, 定身法, 抛下狠话, 大声咆哮, 怪异电波})`
- **资源交换位(Trade Piece)**: `OHKO_rate(P, META) >= 0.25 and survive_rate_after_attack(P, META) < 0.40`
- **稳定行动位(Consistency Piece)**: `has_item(P, 气势披带) or has_item(P, 隐密斗篷) or has_ability(P, 精神力) or (accuracy_min(P_main_moves) >= 0.90 and speed_or_bulk_condition(P))`,其中 `speed_or_bulk_condition(P) = speed_rank(P, META) >= 0.75 or survive_phys_rate(P, META) >= 0.60 or survive_sp_rate(P, META) >= 0.60`

自动标注的核心流程:

```text
roles = []

for each role R:
    if condition_R(P, META) == true:
        roles.append(R)

主职能 = roles 中对战中触发率最高的职能
副职能 = roles 中除主职能外仍满足条件的职能
条件职能 = 只在 after_tera / after_setup / weather / terrain / tailwind / trick_room 下满足的职能
```

### 12.4 可落实的分层实现方案

完整规则里的 `OHKO_rate / winrate_vs_core` 不适合一次性全做。实际实现应按数据依赖拆层,先落地稳定、可解释、低成本的规则,再逐步接入估算和伤害扫描。

> 2026/05/02 落地更新：Layer 1 直接可判定职能已接入 `team-role-*` 模块，覆盖撒场 / 清场、状态手、节奏控制、模式启动、击掌轮转、威吓轮转、天气/场地重置轮转、陷阱手、稳定行动、首发压制、消耗核心、天气核心、场地核心等标签。推荐评分只接入结构性职能，未把单招细分标签全部加入推荐权重，避免推荐结果被标签数量放大。
>
> 2026/05/02 二次落地：Layer 2 静态代理指标继续扩展，新增 `trickroomsweeper / damagesponge / midgamestabilizer`。这些标签只在 `roleContext` 样本可用时输出；样本缺失时沿用现有 proxy unavailable 提示，不静默退回到裸种族值或招式名猜测。
>
> 2026/05/02 三次落地：Phase A 直接可判定职能继续补齐，新增 `softspeedcontrol`，由降速招式或麻痹控速触发；`Fake Out` 现在也明确计入 `disruption`；`Intimidate` 现在同时计入 `statdrop / debuffer`；`Wish` 计入治疗支援类 `cleric`。这些都是配置本身可判定规则，不依赖伤害扫描或环境胜率数据。
>
> 2026/05/02 四次落地：继续补充 deterministic + estimated proxy 层。新增 `weathersweeper`，由 `Swift Swim / Chlorophyll / Sand Rush / Slush Rush` 直接判定；新增 `wall`，仅在 `roleContext` 样本可用时由 estimated bulk rank + 回复 / 异常 / 开墙 / 反强化等站场手段判定。`wall / mixedwall / recoverywall / bulkyattacker / weathersweeper` 已接入展示顺序，且只把结构性标签加入推荐职能列表，避免单招细分标签放大推荐分。
>
> 2026/05/02 五次落地：**所有只依赖配置本身的职能分析已完成**。新增 `static/app/team-role-config-only.js` 专门承载纯配置补充规则，避免继续膨胀 `team-role-extra.js`；补齐 `Metal Sound / Acid Spray` 单招职能、`Regenerator + pivot move` 的再生力轮转、`Hadron Engine / Seedsower / Orichalcum Pulse / Primordial Sea / Desolate Land / Mega Sol` 等特性触发的天气/场地细分、`Electric / Misty / Psychic Terrain` 的防异常/防先制价值，以及 `Focus Sash / Assault Vest / Leftovers / Covert Cloak / Safety Goggles / Clear Amulet` 的配置型道具标签。推荐评分仍只接入结构性职能，单招和纯道具细分不默认放大推荐权重。
>
> 2026/05/02 六次落地：**8 主 Role 系统 + Layer 3 damage-aware 模块上线**。
> 1. 重写 `team-role-primary.js`，主 Role 改为 8 类：`attacker / speedcontrol / support / disruptor / pivot / tank / modesetter / techcheck`（落 `compression` 作为兜底），按”输出价值 / 控速价值 / 承伤价值 / 辅助价值 / 干扰价值 / 轮转价值 / 启动价值 / 针对价值”独立打分 + 冲突规则裁决，废弃旧 attacksupport 单档；
> 2. 修复草系/防尘/防尘镜被错误标 `antisleep` 的语义 bug：拆出独立 `antipowder` 标签；`antisleep` 仅由 `Insomnia / Vital Spirit / Sweet Veil / Comatose` 真特性或电气场地 / 薄雾场地建立条件触发；
> 3. 新增 `team-role-meta.js` 三段式 META（usage stats → VGCPaste team frequency → current library），数据来源显式标注，不静默 fallback；
> 4. 新增 `team-role-damage.js` + `team-role-damage-cache.js` + `team-role-damage-i18n.js`，接入 6 个 damage-aware 职能（`wallbreaker / revengekiller / endgamewincondition / utilitypokemon / threatcheck / backlinecleaner`），通过 `damage-workspace.js` 的 worker 完成扫描，结果按 (configHash + metaHash) LRU 50 缓存到 localStorage；
> 5. Layer 1 收尾：`SETUP_MOVES` 补 `Shell Smash / Geomancy / Victory Dance / No Retreat / Growth / Focus Energy`、`OFFENSIVE_DEBUFF_MOVES` 补 `Noble Roar / Tickle`、`CLERIC_MOVES` 补 `Floral Healing`、`STAT_DROP_MOVES` 补 `Noble Roar / Tickle / Baby-Doll Eyes`、`WEATHER_ABUSER_MOVES` 补 `Morning Sun / Synthesis`；
> 6. 翻译修复：`Helping Hand / U-turn / Volt Switch / Parting Shot / Rage Powder / Spore` 等英文招式名在中文描述里替换为「帮助 / 急速折返 / 伏特替换 / 抛下狠话 / 愤怒粉 / 蘑菇孢子」，”estimated” 中文版替换为「估算」，推荐里”与当前队友常见同队”列表改用 `datasets.localizedSpeciesNames` 本地化；
> 7. 去重：`statdrop` 与 `debuffer` 同时输出的冗余被收掉，只保留 `debuffer`；
> 8. 最佳核心组合：`scoreCoreEntry` 增加无输出位时 `-3` 惩罚，避免推荐 `Incineroar + Sinistcha` 这种纯辅助核心。
>
> 仍未实现：Layer 4 meta-aware 反制位（`corecheck / threatcheck` 完整版需要热门威胁清单）；太晶职能（M-A 赛季禁太晶，等下个赛季）。

**Layer 1: 直接可判定**

只依赖配置本身,不需要环境统计或伤害计算:

- `has_move`:击掌手、顺风手、挑衅手、广域防守手、黑雾手、再来一次手、首发压制、消耗核心。
- `has_item`:围巾手、气势披带稳定行动、突击背心倾向、剩饭续航、隐密斗篷反击掌、防尘镜反催眠 / 反重定向、清净坠饰反威吓。
- `has_ability`:威吓手、再生力轮转、天气手、天气加速手、场地手、反先制位、天气核心、场地核心。
- `has_type`:草系 / 太晶草反催眠,幽灵 / 太晶幽灵反击掌。

这一层已完成,并继续沿用 `team-role-rules.js` 的集合式规则与 `team-role-config-only.js` 的纯配置补充规则。它不需要 fallback,缺数据时也不会误判。

**Layer 2: 静态代理指标**

不做真实伤害,只用种族值、投入、道具、速度线估算。命名必须显式带 `estimated` 或 `proxy`,不要把代理值伪装成真实 `OHKO_rate`。

- `estimatedSpeedRank`:用当前配置库/环境样本的实战速度排序。
- `estimatedAtkRank / estimatedSpaRank`:用攻击/特攻、投入、讲究道具、命玉等估算。
- `estimatedPhysBulkRank / estimatedSpBulkRank`:用 HP + 防御/特防 + 投入 + 突击背心等估算。

这一层支持物理/特殊/混合输出手、速攻手、空间打手、物理受盾、特殊受盾、混合受盾、受盾、吸收伤害位、耐久输出手、耐久支援手、中盘站场位等细分标签。

**Layer 3: 伤害扫描指标**

只有真实或批量 damage core 扫描结果可用时才启用:

- `OHKO_rate`
- `2HKO_rate`
- `survive_phys_rate`
- `survive_sp_rate`
- `wallbreaker / nuke / threat check`

扫描对象从当前 META 样本或配置库热门配置中选取。没有扫描结果时,这些职能应显示为不可用或不参与判断,不能静默退回成种族值猜测。

**Layer 4: 环境对位指标**

最后再做 `target_matchup_winrate_gain / winrate_vs_core / Threat_Set`。这些规则依赖热门核心定义、对位样本和队伍上下文,不是单只配置能可靠判断的内容。

推荐落地顺序:

1. 先给 §12.3 每条规则标注 `deterministic / estimated / damageAware / metaAware`。
2. 先实现 deterministic,补齐 i18n 和 UI 展示。
3. 再实现 estimated,补速度、输出、耐久细分。
4. 接 damageAware,只服务爆破手、破盾手、清场手、热门威胁检查位等确实需要伤害结果的职能。
5. 最后接 metaAware,并要求规则显式声明目标集合或核心来源。

### 12.5 落地前必须确认的事

- 纯配置可判定职能已经完成,后续不要再把 `has_move / has_item / has_ability / has_type / tera_type` 这类规则当作未落地大项。
- `RECOMMENDATION_ROLE_IDS` 不要全收 110 条,会让推荐分数失真。当前只收"对补位有结构性意义的"那批(控速、轮转、墙、天气/场地核心、空间打手、中盘站场、突击背心坦克、反空间、反威吓、反先制、广域防守等),单招细分标签不默认进入推荐权重。
- i18n 双语已跟随纯配置职能补齐。后续新增 proxy / damage-aware 职能时仍要同步补文案。
- 当前 `team-role-*` 模块仍缺 `OHKO_rate / 2HKO_rate / META percentile / winrate_vs_core` 等真实输入。后续实现如果采用代理指标,必须在代码和文档里显式命名代理指标,并让缺数据状态暴露出来。
