# 环境更新与快速迭代

## 桌面操作

1. 在「环境」中填写目标 Showdown format ID。初始值是 `gen9championsvgc2026regmc`。
2. 选择官方最新提交，或选择包含 `sim/`、`lib/`、`data/`、`config/` 的本地 Showdown 检出目录。
3. 准备候选环境。程序编译规则文件，重解析原始队伍，检查新规则合法性，运行 Showdown/calc 一致性验证，再重建配置模型。
4. 查看候选的新增/移除物种、配置数据变化、招式/道具/特性变化和验证结果，点击启用。
5. 原队伍仍关联原快照。需要继续使用新规则时，选择「迁移当前队伍」查看冲突并建立新草稿，或在「我的队伍」新建。
6. 如有新赛季分表，在来源管理中加入赛季与 `gid`，为新环境同步构筑数据。

当前队伍使用旧快照时，来源面板明确提示其数据与同步仍属于该队伍的环境。切换全局默认环境不会悄悄重算或改写已有队伍。

候选构建、同步、模型升级和模拟均可取消。失败显示具体来源/计算错误；只有完整校验成功的候选可激活。取消不会安装半成品。

应用算法升级与规则更新分开处理。启动时若同环境、同语料已有新版随包模型，直接安装新模型；自定义语料则在维护线程重建，界面显示进度和取消入口。旧队伍、原文和旧模型保留。规则和来源内容都未变化的再次同步会复用模型。

重建会执行完整历史合法性检查、聚类与内部校准。同一批次复用规则快照和模型中间结果，避免每份来源重新枚举整个规则名单；没有通过减少样本或跳过校准来缩短更新。实际耗时与优化前后的模型一致性见验收记录。

## 哪些改动可以直接读取

| 变化 | 接入方式 | 必须验证 |
|---|---|---|
| 物种名单、禁限项、物种/道具条款、选出人数 | Dex + format + TeamValidator | 旧队伍迁移问题、搜索合法性 |
| 种族值、属性、学习表、招式威力等普通数据 | 重新编译 Showdown；同一 Dex 覆盖 calc 数据 | 能力值、伤害与候选差异 |
| 类型相性表 | 从该 mod 的 Dex 重建 calc 的相性表 | 修改相性后两个引擎逐档对照 |
| 后续赛季共享构筑 | 界面增加赛季与分表 gid | 表头、标题与赛季匹配；历史不混入当前频率 |
| 新招式机制、特性事件、Mega 时机变化 | 更新引擎/适配器及对应策略 | 新机制回归矩阵、完整回合与隐藏信息隔离 |
| Champions 配点机制或单项上限变化 | 更新能力点适配器 | 边界、能力值、配点搜索与文本往返 |

目前本地来源会复用已安装的同版本伤害库。仅修改名单、数值或规则数据可以离线迭代。若引入 calc 尚未支持的新战斗机制，程序会在解析或验证时报错，需要先更新 calc/适配器；不会把旧计算当成新机制已经支持。

## 可复现的版本组成

- Showdown：官方来源记录完整提交 SHA；本地来源记录 `sim/lib/data/config` 中 TypeScript 源文件的内容哈希。
- calc：记录固定提交与编译文件 SHA-256。
- 环境：记录引擎 ID、格式、规则哈希与合法物种。
- 语料：记录原文、观察、合法性和来源版本。
- 模型：记录语料、环境、算法、流派、真实配置索引依据与先验调参结果。
- 结果：绑定队伍修订和上述上下文，并记录模拟随机种子。
- 图片：记录独立素材版本、完整形态映射、上游提交和图片内容哈希。

旧引擎、语料与模型留存，不需要在同一目录覆盖规则文件。重新启用旧快照不会改变新快照中的队伍。较旧算法版本的模拟需要对应版本程序；新版本会明确拒绝不兼容重跑。

## 新赛季样本不足

历史配置先按目标规则重新解析与校验。配置浏览在某物种当前完整样本少于模型先验支持量时默认显示历史参考，仍展示原赛季、作者和配置；缺失配点不能用来精算。推荐偏好中的“允许推荐历史合法配置”控制候选池，包括锁定物种的配置替换。关闭不会删除已选成员，也不会停用模型的历史统计先验。

没有当前完整合法对手时，深入评估可使用最近有日期的历史赛季队伍；界面与结果都记录实际赛季，开关可关闭。出现当前完整合法对手后使用当前来源。历史对手与历史配置均不计入当前共享样本频率；只有一支新队伍也不意味着新环境已经研究充分。

自定义规则先通过 Showdown 格式校验再加载。封闭队表模拟保留已有自定义规则；选出人数变化会贯穿快速路线和实际回合。无效覆盖返回错误，不让上游的默认加载行为静默删除规则。

## 开发者命令

首次按固定提交生成规则引擎：

```bash
pnpm engine:sync
pnpm data:sync
pnpm sprites:sync
```

使用本地规则目录重建：

```bash
pnpm engine:sync --local /absolute/path/to/pokemon-showdown
POKE_FORMAT=gen9championsvgc2026regmc pnpm data:sync --cached-corpus
pnpm build
```

读取官方新版本：

```bash
pnpm engine:sync --latest
pnpm data:sync --cached-corpus
```

需要重新读取分表和 PokePaste 时使用 `pnpm data:sync --refresh`。`--cached-corpus` 会从保存的原文重新解析并校验，不是沿用旧合法性结果。

规则引入新物种或形态后运行 `pnpm sprites:sync` 校验素材覆盖；`pnpm sprites:sync --latest` 获取素材仓库的新提交。更新映射会产生新素材版本。未收录的图片不会自动替换为基础形态。

这些命令修改开发资源目录，不会自动激活已经运行的用户数据库中的环境。桌面「环境」页的候选/启用流程负责用户数据库更新。

## 打包后的本地编译

Electron 的 ASAR 不是外部编译器可直接读取的普通目录。安装包把 esbuild 可执行文件和预编译的 `ts-chacha20.cjs` 放在 `resources/assets/runtime/`，通过显式路径交给规则构建器。

本地源码在目标引擎目录内的 `.building-*` 暂存目录编译，完成后重命名为内容寻址目录。Showdown 与 calc 的许可证一并保存。无需在用户电脑上额外安装 Node.js、pnpm 或编译用 JavaScript 依赖；官方归档解压使用 Linux 的 `tar`。

## 每次规则更新的最小回归

1. 类型检查与核心测试。
2. 用至少一份完整合法配置对照能力值、配点边界、文本往返和固定威力招式的 16 档乱数。
3. 回归 Mega 前后特性、范围伤害、天气/场地、帮助/墙、威吓免疫、烧伤负等级与先制限制。
4. 重校验历史资料并检查失败条目；确认当前赛季频率独立。
5. 在实际 Linux 包内修改本地 Showdown 的名单、种族值与相性，验证候选、激活和迁移；不能只测试开发目录。
6. 涉及推荐/模拟逻辑时，用隔离来源的同数据基线重跑评测，记录改善与退步。
7. 检查初始形态、Mega、雌雄与地区形态的图片；使用零当前样本用例验证历史参考、来源标签和关闭选项。

现有机制矩阵不是对所有招式组合的穷举证明。新增机制必须带着其反例与回归进入版本，而不是仅增加一个格式名称。

## 维护模块地图

| 改动入口 | 集中维护位置 | 回归入口 |
|---|---|---|
| 新的 Showdown 提交或本地规则 | `packages/core/sources/engine-build.ts`、`tools/sync-engine.ts` | `tests/desktop/environment.spec.ts` |
| 共享表表头、来源和后续赛季 | `packages/core/sources/corpus.ts`、`revalidate.ts`；界面来源注册表 | `tests/core.test.ts`、环境隔离流程 |
| 配点、形态、伤害与速度机制 | `packages/core/battle/engine.ts`、`verify.ts`、`risk.ts` | `tests/core.test.ts`、`research-mechanics.test.ts` |
| 角色/配合条件 | `packages/core/analysis/role-knowledge.ts`、`roles.ts` | `tests/research-mechanics.test.ts` |
| 配置模型与搜索 | `packages/core/analysis/model.ts`、`clustering.ts`、`search.ts` | `pnpm benchmark`、`pnpm benchmark:research` |
| 新赛季配置与对手参考 | `packages/core/analysis/evidence.ts`、`configurations.ts` | `tests/history.test.ts`、`tests/desktop/history.spec.ts` |
| 选出、Mega 与预览一致性 | `packages/core/analysis/lineups.ts`、`selections.ts`、`battle/preview-policy.ts` | `tests/lineups.test.ts` |
| Champions 图片与形态 | `tools/sync-sprites.ts`、`assets/pokemon/manifest.json` | `tests/artwork.test.ts`、`tests/desktop/artwork.spec.ts` |
| 公开事件与行动策略 | `packages/core/battle/observation.ts`、`policy.ts`、`belief-policy.ts` | `tests/simulation.test.ts`、`pnpm benchmark:strategies` |

规则的数据变动与算法代码变动分别推进。修改分析或策略语义时同步提高 `packages/core/domain.ts` 的算法版本，重建模型并保存新评测，避免旧缓存或回放被当作新实现的结果。

当前成品的规则更新验收结果与复现命令见 [VALIDATION.md](VALIDATION.md)。
