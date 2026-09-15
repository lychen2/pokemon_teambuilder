<div align="center">

<img src="assets/app-icon.svg" width="96" height="96" alt="结阵 Sixfold 标志：一枚精灵球截成六瓣"/>

# 结阵 Sixfold

**面向 Pokémon Champions 双打封闭队表的本地构筑与对局研究工作台**

[![验证](https://github.com/lychen2/pokemon_teambuilder/actions/workflows/ci.yml/badge.svg)](https://github.com/lychen2/pokemon_teambuilder/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/lychen2/pokemon_teambuilder?display_name=tag)](https://github.com/lychen2/pokemon_teambuilder/releases)
![平台](https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-Linux%20%7C%20Windows-6c52a5)
![本地优先](https://img.shields.io/badge/%E6%95%B0%E6%8D%AE-%E6%9C%AC%E5%9C%B0%E5%AD%98%E5%82%A8-5d816c)

**选择核心 → 锁定配置 → 比较搭档或完整方案 → 检查伤害与速度线 → 推演选出 → 导出队伍**

</div>

---

## 下载

发布包内置规则引擎、中文词条、共享构筑数据与本地编译工具，首次使用不需要联网同步。

| 平台 | 文件 | 说明 |
|---|---|---|
| Linux x86-64 | `sixfold-<版本>-linux-x86_64.AppImage` | 赋予执行权限后直接打开 |
| Linux x86-64 | `sixfold-<版本>-linux-x64.tar.gz` | 解压整个目录，运行其中的 `sixfold` |
| Windows x64 | `sixfold-<版本>-windows-x64-setup.exe` | NSIS 安装包，可选安装目录 |
| Windows x64 | `sixfold-<版本>-windows-x64.zip` | 免安装，解压后运行 `Sixfold.exe` |

文件校验值见同一 Release 中的 `SHA256SUMS`。Windows 安装包与可执行文件**未做代码签名**，首次运行会出现 SmartScreen 提示，这与本项目无关，属于未签名构建的正常表现。目前只发布与验证这两个平台。

## 能做什么

| 环节 | 具体能力 |
|---|---|
| 找配置 | 中英文搜索宝可梦、招式、特性与道具；在「流派概览 / 真实配置」之间切换，按机制筛选真实变体，加入前可核对配点与来源 |
| 定核心 | 只锁物种，或连道具、特性、性格、配点、招式一起锁；后续推荐不会覆盖锁定内容与手工修改 |
| 配搭档 | 推荐卡先回答"补上什么、依赖什么、仍怕什么"，展开后才是算法细节与计算条件 |
| 补全队 | 从当前核心补齐六只，给出几支有实际差异的方案，比较困难对局、速度控制与主要进攻路线 |
| 改队伍 | 替换成员、招式或配点前先给出改动预览与差异；确认后一次应用，可整体撤销 |
| 算数字 | 伤害分布、含落空概率的击杀率、速度线（天气、场地、双方顺风、空间、形态、速度等级、麻痹）与配点求解 |
| 看对手 | 输入对手六只，按当前规则比较选出、首发与唯一 Mega，展示支援依赖、空间内外模式与需要防范的变化 |
| 深推演 | 真实 Showdown 回合推进、隐藏信息隔离、同时行动、配对比较、困难对局与公开战斗日志，可取消、可重跑 |
| 留记录 | 构筑笔记、多条对局计划、实战复盘与旧队伍快照；记录始终指向当时的队伍 |
| 跟环境 | 上游官方更新或本地 Showdown 目录：编译候选 → 校验规则与伤害 → 重建配置模型 → 查看差异 → 启用 → 迁移或新建队伍 |

快捷键：`Ctrl+K` 或非输入状态下 `/` 打开搜索，`Ctrl+Z` / `Ctrl+Shift+Z` 撤销与重做。编辑不足六只的草稿不受阻；完整回合模拟要求合法的六人队伍。

## 从源码运行

需要 Node.js 24 及以上、pnpm 10；开发与验证使用 Node.js 26.8.2 / pnpm 10.32.1。

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start        # 直接运行本地构建
pnpm dev          # 开发模式：Vite 127.0.0.1:5184 热更新 + Electron
```

生成资产（`assets/bootstrap.json`、`assets/corpus.json`、`assets/engines/`、`assets/pokemon/`）随仓库提交，克隆后可直接构建与打包。需要更新时再联网同步：

```bash
pnpm engine:sync   # 固定提交的 Showdown 与 Champions 伤害库
pnpm data:sync     # 三张共享表与 PokePaste
pnpm sprites:sync  # 离线 Champions 原图
```

### 桌面入口（Linux）

`tools/launch/` 下两个脚本配合 `~/.local/share/applications/` 里的 `.desktop` 项，可以从应用菜单像普通软件一样启动：

- **结阵 Sixfold**：`tools/launch/sixfold.sh`，自动挑选 `release/` 下版本号最高的已打包应用；日志写入 `${XDG_STATE_HOME:-~/.local/state}/sixfold/app.log`。
- **结阵 Sixfold (开发者模式)**：`tools/launch/sixfold-dev.sh`，运行 `pnpm dev`；日志写入同目录 `dev.log`，并导出 `POKE_DEBUG_PORT`（默认 9222，仅监听本机）。

两个入口都用 `setsid` 脱离启动终端，并在窗口已打开时聚焦已有窗口而不是重复启动。普通入口跑的是打包产物，源码改动需要重新 `pnpm package:linux` 才生效；日常开发请用开发者模式入口。

## 打包与发布

```bash
pnpm package:linux   # AppImage + tar.gz + linux-unpacked
pnpm package:win     # NSIS 安装包 + zip
```

打 `v*` 标签会触发 GitHub Actions，在 Linux 与 Windows 两个 runner 上分别打包，汇总到一个 Release：

```bash
# 版本号以 package.json 为准，标签必须与之一致
git tag v0.1.0 && git push origin v0.1.0
```

工作流说明见 [发布流程](docs/RELEASING.md)。

## 数据与版本

当前随包资料：

| 项目 | 数量 |
|---|---:|
| 来源队伍 | 2,149（M-A 1,104 / M-B 861 / M-C 184） |
| 配置观察 | 12,894 |
| 字段完整配置 | 11,444（去重后 8,520） |
| 配置流派 | 933（其中 180 个有当前赛季支持，涉及 101 个物种） |
| 当前规则合法初始物种 | 293 |

- 环境：`gen9championsvgc2026regmc`（mod `champions`，Showdown 提交 `aa17ca0f`，伤害库 `e7fd7e59`）。
- 频率是**共享构筑样本频率**，来自公开共享的队报表，不是整个排位环境的使用率；赛事名次不会被换算成胜率。
- M-A / M-B 只作为历史先验参与配置识别，不混入 M-C 的出现频率；历史配置迁入前按当前规则重新校验合法性。
- 缺失配点的观察保留来源与共现，按已知字段贡献证据，未知值不补零、也不参与伤害精算。

## 验证

```bash
pnpm verify                # 类型检查 + 单元测试
pnpm test:ui               # Playwright 桌面流程（需要显示环境）
pnpm benchmark             # 与旧推荐函数同数据对照
pnpm benchmark:research    # 概率校准、缺字段与候选预算
pnpm benchmark:strategies  # 策略对照与逐场回放
pnpm benchmark:storage     # 存储与运行占用
pnpm smoke-release         # 打包产物真实启动流程（见 docs/VALIDATION.md）
pnpm test:ime              # 真实系统输入法（需要 fcitx5）
```

对照结果与逐项限制记录在 [验证记录](docs/VALIDATION.md) 与 [原始要求核对](docs/COMPLETION_AUDIT.md)，原始数据在 [`docs/reports/`](docs/reports)。

## 已知边界

- 快速推荐使用有限候选与配置级伤害矩阵，完整构筑搜索是近似解；**缓存就绪后三秒内补齐六只**这一目标尚未达成，实测完整方案需要数秒级，慢于旧版限时表现（见 [优化清单](docs/OPTIMIZATION_TODOS.md)）。
- 同一数据上的留出评测**尚未证明**新搜索稳定优于热门配置排序或旧启发式；报告的是可比结果，不是"更强"的结论。
- 模拟胜率只在所记录的引擎、对手策略与随机种子下成立。共享表没有排位胜负标签，**不能据此宣称真实排位胜率**。
- 配点搜索固定性格、道具、特性与招式，只保证你指定的速度线、击杀或生存目标。
- 尚无外部专家人工复盘、物理多显示器与读屏验收，也没有多小时稳定性证明。

## 文档

| 文档 | 内容 |
|---|---|
| [架构与算法](docs/ARCHITECTURE.md) | 运行边界、代码地图、数据与版本、搜索与模拟 |
| [验证记录](docs/VALIDATION.md) | 固定输入与机器、对照结果、可复现入口、尚未得到的证明 |
| [原始要求核对](docs/COMPLETION_AUDIT.md) | 逐项要求对应的实现与仍缺少的验收 |
| [优化清单](docs/OPTIMIZATION_TODOS.md) | 按优先级整理的实现与限制 |
| [机制与计算范围](docs/MECHANISMS.md) | 八类 62 项机制入口与三种证据的区别 |
| [环境更新说明](docs/ENVIRONMENT_UPDATES.md) | 规则迭代、候选编译与迁移步骤 |
| [研究与调研](docs/RESEARCH.md) | 工具、高手经验、论坛与队报调研 |
| [发布流程](docs/RELEASING.md) | 标签、CI 打包与产物命名 |
| [第三方来源](THIRD_PARTY_NOTICES.md) | 规则引擎、伤害库、词条与素材许可 |

## 版本沿革

仓库在整理公开前经历过 `0.1.0` – `0.3.1` 的内部迭代（旧名 Poke Teambuilder）。相关过程记录保留在 `docs/VALIDATION-0.1.0.md`、`docs/VALIDATION-0.2.0.md`，其中的安装包文件名与当时的旧名一致。本仓库自 `v0.1.0` 起以**结阵 Sixfold** 对外发布，历史与这些早期记录没有版本对应关系。

## 许可

本仓库代码以 [Apache License 2.0](LICENSE) 发布。规则引擎、伤害库、中文词条与图片素材来自各自上游项目，许可与来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 [`assets/licenses/`](assets/licenses)。

Pokémon 及相关名称为任天堂、Creatures Inc. 与 GAME FREAK Inc. 的商标。本项目是非官方粉丝工具，与上述公司无关联。
