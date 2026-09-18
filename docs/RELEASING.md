# 发布流程

发布由 GitHub Actions 完成，本机只负责改版本号、打标签和推送。

## 一次性准备

仓库 secrets 不需要额外配置，工作流只用默认的 `GITHUB_TOKEN`（`permissions: contents: write`）。打包在 GitHub 托管的 runner 上执行，本机不需要装 Windows 工具链。

## 发布一个版本

1. 改 `package.json` 的 `version`（例如 `0.1.1`），并更新需要一起发布的文档数字。
2. 提交：

   ```bash
   pnpm verify          # 类型检查 + 单元测试
   pnpm build           # 确认本地可构建
   git commit -am "release: v0.1.1"
   git push
   ```

3. 打标签并推送。标签必须与 `package.json` 的版本一致，否则工作流在「校版本」这一步直接失败：

   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```

4. 工作流 [`release.yml`](../.github/workflows/release.yml) 会：

   - 校版本：标签与 `package.json` 不一致就中止；
   - 在 `ubuntu-latest` 与 `windows-latest` 上并行执行 `pnpm install --frozen-lockfile`、`pnpm verify`，然后分别运行 `pnpm package:linux` 与 `pnpm package:win`；
   - 用 `node tools/checksums.mjs release/<版本>` 生成 `SHA256SUMS`；
   - 汇总两个平台的产物，创建或更新 `结阵 Sixfold v<版本>` 这个 Release，并自动生成变更说明。

5. 检查 Release 里的文件是否齐全：

   | 平台 | 产物 |
   |---|---|
   | Linux | `sixfold-<版本>-linux-x86_64.AppImage`、`sixfold-<版本>-linux-x64.tar.gz` |
   | Windows | `sixfold-<版本>-windows-x64-setup.exe`、`sixfold-<版本>-windows-x64.zip` |
   | 通用 | `SHA256SUMS` |

发布说明同时保留对应版本的 `docs/releases/<版本>.md`；Release 创建后将该内容写入正文，并保留 Windows 未签名说明。`builder-debug.yml` 是本地打包诊断文件，当前工作流不将其上传到 Release。

## 手动触发

`workflow_dispatch` 可以在不打标签的情况下跑一遍打包，产物只作为 Actions artifact 上传，不会创建 Release（`publish` 任务有 `if: github.ref_type == 'tag'`）。

## 命名与版本约定

- 应用名 **结阵 Sixfold**；可执行文件、包名与安装包前缀统一用 `sixfold`。
- Linux 桌面项为 `sixfold.desktop`；Windows 安装包默认建桌面快捷方式「结阵 Sixfold」。
- Windows 产物未做代码签名，用户首次运行会看到 SmartScreen 提示，发布说明里要保留这句提醒。
- `appId` 为 `io.github.lychen2.sixfold`；改名或改 `appId` 会影响已安装版本的标识，需要同步检查桌面项与本地数据目录。

## 本地数据目录

队伍与记录存在 Electron 的 `userData` 目录：

| 平台 | 路径 |
|---|---|
| Linux | `~/.config/sixfold/teambuilder.sqlite` |
| Windows | `%APPDATA%\sixfold\teambuilder.sqlite` |

改名前叫 `poke-teambuilder`。主进程在启动时会检查：新目录还没有数据库、而旧目录里有，就继续使用旧目录，避免用户误以为队伍丢失。

## 发布前的最小检查

```bash
pnpm verify                    # 类型检查 + 单元测试
xvfb-run -a -s '-screen 0 3200x2000x24' pnpm test:ui   # 桌面流程
pnpm package:linux && pnpm smoke-release                # 打包产物真实启动
```

`pnpm test:ime` 需要本机有 fcitx5 与真实输入法环境，只在有桌面会话的机器上跑。完整验收项与历史结果见 [VALIDATION.md](VALIDATION.md)。
