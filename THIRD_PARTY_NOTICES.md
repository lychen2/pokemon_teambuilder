# 第三方代码、数据与素材

这些说明用于随本地应用保留第三方来源与许可，不改变各组件原有许可。应用安装目录中的 `resources/assets/licenses/` 包含生产依赖清单、完整许可文本和中文翻译脚本的原始声明。规则引擎目录另附 `SHOWDOWN-LICENSE` 与 `CALC-LICENSE`。

## 规则与伤害

- [Pokémon Showdown](https://github.com/smogon/pokemon-showdown)，MIT；Copyright (c) 2011–2026 Guangcong Luo and other contributors。初始固定提交为 `aa17ca0fac8bc5605df673bd8774c2d0e91efa43`。
- [Smogon Damage Calculator](https://github.com/smogon/damage-calc)，MIT；Copyright (c) 2013–2025 Honko and other contributors。初始固定提交为 `e7fd7e59f3eef7ea42fba3c8b83261cb4a14109d`。
- 运行时读取这些组件的规则与机制；本项目的 Champions 数据适配、观察解析和分析代码独立维护。后续环境的来源提交与内容哈希保存在各自 `manifest.json`。

## 桌面与界面依赖

Electron 使用 MIT 许可；Chromium、Node.js 与其第三方组件的说明由 Electron 分发包提供，包括安装目录中的 `LICENSE.electron.txt`、`LICENSES.chromium.html`。

React、React DOM、Radix UI、Floating UI、Zod、csv-parse、esbuild、ts-chacha20 等依赖的已安装许可为 MIT。linkedom、lucide-react、boolbase、uhyphen 声明 ISC；部分 HTML 解析依赖声明 BSD-2-Clause；tslib 为 0BSD。确切版本和逐包声明以 `assets/licenses/components.json` 与 `NODE-DEPENDENCIES.txt` 为准。开发验证使用的 TypeScript、Vite、Vitest、Playwright 与 Axe 不作为应用功能代码整体打包。

`boolbase@1.0.0` 与 `react-remove-scroll-bar@2.3.8` 的 npm 发布物声明许可但未附许可文件。补充文本取自各自上游仓库，按 Git blob 哈希固定并记录来源；不将未能解析的 npm `gitHead` 声称为已核验的许可证提交。esbuild 平台二进制附同版本 esbuild 的许可。

## 中文词条与图片

- 中文词条取自参考工程中的 `PSChina Server Translation SV-1.7.2.user.js`，原作者标注 **AL、WyAK**，脚本声明 **MIT**。原始 userscript 声明保存在 `assets/licenses/PSCHINA-TRANSLATION.txt`。运行时仅使用提取出的词条，不执行 userscript。
- 宝可梦图片使用 [PokeAPI/sprites 的 Champions 素材](https://github.com/PokeAPI/sprites/tree/2ecb4eeacd5a1718621fc30f12772e3f60d830b9/sprites/pokemon/versions/generation-ix/champions)，部分花纹来自 [KevinToodlepoot/pokemon-champions-sprites](https://github.com/KevinToodlepoot/pokemon-champions-sprites/tree/65f3c0d7434ef9206ddda61856d8938b82cfc710)。物种与形态编号来自 PokeAPI。完整来源、固定提交、尺寸与逐图 SHA-256 见 `assets/pokemon/ATTRIBUTION.md` 和 `manifest.json`，安装包中位于 `resources/assets/pokemon/`。宝可梦名称、图像与相关商标归各自权利人所有；本项目不将这些素材声明为原创，也不额外授予其许可。
- 应用中的布局、装饰图形和应用标识由项目界面代码与本地资源构成；lucide 图标按其组件许可使用。

## 公开构筑与研究资料

初始构筑来源为用户指定的[公开共享表](https://docs.google.com/spreadsheets/d/1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw/edit)，分表 gid 为 `2001945654`、`1458357160`、`791705272`。相关 [PokePaste](https://pokepast.es/) 原文及作者链接按来源保留，用于本地研究与复查，不将赛事名次转为胜率。

共享表、作者队伍和队报的权利属于各自作者；公开可读不等于由本项目重新授权。独立网页、X 发布与回放由用户选择读取后保存于本地，随包不附调研队报全文。引用和本地研究解读分别保存。

## 重新打包

`pnpm licenses:collect` 从已安装的生产依赖重新汇总许可声明与文本。没有可读取的许可文本且没有补充来源时，打包会报出具体组件；补充来源维护在 `tools/license-sources.json`。`pnpm package:linux` 自动执行这一汇总步骤。
