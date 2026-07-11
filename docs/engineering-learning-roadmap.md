# 从 Vibe 项目到可维护工程：Poke Type 学习路线

这份文档给当前维护者使用。目标不是把项目包装成课程作业，而是把一个已经能跑的项目拆成可理解、可验证、可长期维护的工程系统。

你现在的背景是：学过基础 C 语法，想靠 AI 辅助继续维护这个项目，但不想继续纯 vibe。正确目标是：能读懂代码边界，能判断 AI 改动是否靠谱，能写小而稳的功能，能发现性能和可维护性风险。

## 1. 项目是什么

当前仓库不是单一 Rust 项目，而是一个 Rust workspace 加原 Web UI 静态资源的本地工具。

核心产品形态：

- Showdown 文本是输入和输出边界。
- Rust CLI 提供稳定 JSON 契约。
- Web UI 复用现有 HTML、JS、CSS 和静态数据。
- `poke-type-core` 承担可迁移的核心逻辑。
- 大型数据来自仓库内 JSON，不依赖云端服务。

核心约束：

- 不隐藏机制。推荐分、伤害、覆盖、校验都要能解释。
- 不做静默 fallback。出错要显式反馈。
- CLI 输出契约优先。UI 可以变，核心 JSON 契约不能随便破坏。
- 本地优先。没有账号、遥测、云状态。
- 中英文并存时，用户可见文本要保持双语意识。

## 2. 仓库结构怎么读

优先读这些文件，不要从 UI 大文件开始硬啃。

```text
Cargo.toml
crates/
  poke-type-core/
  poke-type-cli/
  poke-type-web/
static/
index.html
README.md
docs/
```

### 2.1 Rust workspace

`Cargo.toml` 是 Rust workspace 入口。它把多个 crate 组合成一个项目：

- `crates/poke-type-core`: 核心业务逻辑。
- `crates/poke-type-cli`: 命令行入口。
- `crates/poke-type-web`: 本地静态服务器。
- `src-tauri`: 桌面打包入口。

你学习时要先记住一句话：CLI 和 Web 壳不应该承载核心业务。业务逻辑应该尽量进入 `poke-type-core`。

### 2.2 核心库

`crates/poke-type-core/src/lib.rs` 暴露模块：

- `showdown`: Showdown 文本解析和导出。
- `team`: Champions 队伍规则校验。
- `analysis`: 队伍分析。
- `recommend`: 补位推荐。
- `matchup`: 对局分析。
- `damage`: 伤害计算。
- `usage`: 使用率查询。
- `records`: 战绩记录。
- `dex`: 数据加载。
- `schema`: 数据结构和 JSON 结构。

维护顺序建议：先懂 `schema`，再懂 `showdown`，再懂 `team`，最后读 `damage`、`recommend`、`matchup`。

### 2.3 CLI 层

`crates/poke-type-cli/src/main.rs` 做三件事：

1. 解析命令行参数。
2. 读取输入文件和数据集。
3. 调用 `poke-type-core`，把结果写到 stdout。

CLI 层不要写复杂业务规则。比如“总点数不能超过 66”不该散落在 CLI，它属于 `team` 模块。

### 2.4 Web 层

`crates/poke-type-web/src/main.rs` 是轻量本地静态服务器，负责把 `index.html`、`static/` 和数据文件服务给浏览器。

它不是后端业务服务。它不应该保存业务状态，不应该做复杂计算，也不应该引入隐藏网络依赖。

### 2.5 静态数据

数据主要来自：

- `poke_analysis-main/stats/pokedex.json`
- `poke_analysis-main/stats/moves.json`
- `poke_analysis-main/stats/abilities.json`
- `poke_analysis-main/stats/items.json`
- `poke_analysis-main/stats/champions_vgc.json`
- `static/usage.json`
- `static/paste_teams_champions_mb.json`
- `static/paste_sets_champions_mb.json`

不要手改这些生成数据。数据刷新应走脚本。

## 3. 输入输出契约

这个项目最重要的工程资产不是某个 UI 页面，而是 CLI 契约。

典型命令：

```bash
cargo run -p poke-type-cli -- parse --team team.txt
cargo run -p poke-type-cli -- validate-team --team team.txt
cargo run -p poke-type-cli -- analyze --team team.txt
cargo run -p poke-type-cli -- recommend --team team.txt --limit 10
cargo run -p poke-type-cli -- damage --attacker attacker.txt --defender defender.txt
```

成功时：

- stdout 输出 JSON 或 Showdown 文本。
- stderr 不输出错误。
- 进程退出码是 0。

失败时：

- stderr 输出错误。
- 进程非 0 退出。

维护时先问：这次改动会不会改变某个命令的 JSON shape？如果会，必须有明确理由。

## 4. 第一阶段：读懂项目，不急着写

目标：能追踪一个命令从输入到输出的完整路径。

建议顺序：

1. 读 `README.md` 的命令列表。
2. 读 `crates/poke-type-cli/src/main.rs` 的 `Command` enum。
3. 选 `parse` 命令，追到 `parse_showdown_text`。
4. 选 `validate-team` 命令，追到 `validate_team`。
5. 选 `damage` 命令，追到 `calculate_damage_pair`。

你需要能回答：

- 输入文件在哪里读？
- 数据集在哪里加载？
- 哪个函数产生最终 JSON？
- 出错时错误怎么向上传？
- 哪些函数是纯函数？

这一阶段不要让 AI “优化代码”。只让 AI 解释调用链，并要求它引用具体文件和函数名。

## 5. 第二阶段：Rust 基础学习路线

你不需要先学完整 Rust 生态。按这个项目需要的内容学。

### 5.1 必学语法

- `struct`: 表达稳定数据结构。
- `enum`: 表达命令、状态、错误类别。
- `Option<T>`: 表达可能不存在。
- `Result<T, E>`: 表达可能失败。
- `Vec<T>`: 动态数组。
- `HashMap<K, V>` 和 `HashSet<T>`: 数据索引和去重。
- `&str` 和 `String`: 文本借用和拥有。
- `&[T]`: 不拥有数组，只读取。
- `impl`: 给类型绑定函数。
- `derive`: 自动生成 Debug、Clone、Serialize 等能力。
- `serde`: Rust 和 JSON 之间的桥。

### 5.2 这个项目中的 Rust 风格

好的写法：

- 核心函数接收引用，比如 `team: &[Config]`。
- 解析和计算返回结构体，而不是直接打印。
- 错误通过 `Result` 往上传。
- 规则判断放在小函数里。
- 测试直接覆盖业务行为。

需要警惕的写法：

- 在核心逻辑里读文件。
- 在核心逻辑里 `println!`。
- 遇到未知数据就悄悄给默认值。
- 为了省事把所有字段都变成字符串。
- 把 UI 文案和算法规则写在一起。

### 5.3 推荐练习

从 `team` 模块开始，因为它最像工程规则，不涉及复杂数学。

练习 1：写一个函数计算队伍点数总和。

练习 2：写一个函数判断招式数量是否超过 4。

练习 3：给 `validate_team` 加一个测试，不改行为。

练习 4：让 AI 生成一个测试，你自己审查它是否真的测了规则，而不是只测字段存在。

## 6. 第三阶段：C++ 对照实现

C++ 适合帮你理解性能、内存、值语义和生命周期。

你可以用 C++ 复刻三个小模块：

1. `validate_team`
2. 简化版 Showdown block parser
3. 简化版 damage calculator

### 6.1 C++ 中的数据结构

Rust 的 `Config` 可以对应 C++：

```cpp
struct ChampionPoints {
    uint16_t hp = 0;
    uint16_t atk = 0;
    uint16_t def = 0;
    uint16_t spa = 0;
    uint16_t spd = 0;
    uint16_t spe = 0;
};

struct Config {
    std::string species_id;
    std::string species_name;
    std::string item;
    std::vector<std::string> move_names;
    ChampionPoints champion_points;
};
```

工程重点：

- 只读参数用 `const Config&`。
- 数组只读用 `std::span<const Config>`。
- 文本不需要拥有时用 `std::string_view`。
- 不要随手返回裸指针。
- 不要让函数修改传入对象，除非名字明确说明会修改。

### 6.2 C++ 版校验函数思路

Rust：

```rust
pub fn validate_team(team: &[Config]) -> TeamValidation
```

C++：

```cpp
TeamValidation validate_team(std::span<const Config> team);
```

区别：

- Rust 借用检查器会阻止悬空引用。
- C++ 需要你自己保证 `span` 指向的数据还活着。
- Rust 默认 move 语义清晰。
- C++ 要主动避免不必要拷贝。

### 6.3 C++ 性能重点

先掌握这些：

- `std::vector` 连续内存，适合热路径遍历。
- `std::unordered_map` 适合按 id 查数据，但哈希和字符串分配有成本。
- `std::string_view` 可以减少拷贝，但不能延长字符串生命周期。
- `reserve()` 可以减少动态扩容。
- 热路径里避免重复 normalize 字符串。
- 浮点计算要明确舍入位置。

不要一开始就学模板元编程、协程、复杂多线程。这个项目还没到那里。

## 7. 第四阶段：C# 对照实现

C# 适合帮你理解应用层、JSON、CLI、工具开发和可读性。

你可以用 C# 写一个小 CLI：

```bash
dotnet run -- parse --team team.txt
```

### 7.1 C# 中的数据结构

Rust 的数据结构可以对应 C#：

```csharp
public sealed record ChampionPoints(
    ushort Hp,
    ushort Atk,
    ushort Def,
    ushort Spa,
    ushort Spd,
    ushort Spe
);

public sealed record Config(
    string SpeciesId,
    string SpeciesName,
    string Item,
    IReadOnlyList<string> MoveNames,
    ChampionPoints ChampionPoints
);
```

工程重点：

- DTO 和业务对象分开。
- `IReadOnlyList<T>` 表达只读意图。
- `Dictionary<string, T>` 做数据索引。
- `System.Text.Json` 做 JSON 边界。
- 不要用全局静态状态偷懒。
- LINQ 可读时用，热路径里谨慎用。

### 7.2 C# 错误处理

Rust 常用 `Result`。C# 通常用异常表达失败，用返回对象表达业务反馈。

适合抛异常：

- 文件不存在。
- JSON 格式错误。
- 参数不合法，命令无法继续。

适合返回 feedback：

- 某一行 Showdown 文本无法解析。
- 招式未知但仍能生成部分结果。
- 队伍规则不合法但需要展示具体原因。

## 8. 三语言能力对照

| 能力 | Rust | C++ | C# |
|---|---|---|---|
| 内存安全 | 编译器借用检查 | 程序员负责 | GC 管理对象生命周期 |
| 错误处理 | `Result` / `Option` | 返回值、异常、`std::optional` | 异常、nullable、结果对象 |
| JSON | `serde` | nlohmann/json 或 simdjson | `System.Text.Json` |
| CLI | `clap` | CLI11、Boost.Program_options 或手写 | System.CommandLine |
| 性能控制 | 高，默认安全 | 最高，风险也高 | 中高，受 GC 和运行时影响 |
| 适合本项目的位置 | core、CLI、WASM | 算法练习、性能实验 | 工具层、桌面/服务原型 |

学习重点不是选一个语言赢，而是知道同一条业务规则在不同语言中怎么表达。

## 9. 工程能力路线

### 9.1 输入边界

任何外部输入都不可信：

- Showdown 文本可能缺字段。
- JSON 数据可能缺字段。
- 文件路径可能不存在。
- 用户可能传空队伍。
- 宝可梦、招式、道具名可能有别名。

工程要求：

- 输入解析和业务计算分开。
- 缺失字段要么反馈，要么有明确默认规则。
- 默认值必须是产品规则，不是为了代码不报错。

### 9.2 数据模型

先把结构定义清楚，再写逻辑。

这个项目中的关键模型：

- `Config`: 单只宝可梦配置。
- `ChampionPoints`: Champions 点数。
- `Stats`: 实际能力值。
- `ParseResult`: 解析结果加反馈。
- `TeamValidation`: 队伍规则结果。
- `DamageSummary`: 双向伤害结果。

维护时不要轻易改这些结构的字段名，因为它们影响 JSON 输出。

### 9.3 错误和反馈

错误分两类：

1. 程序无法继续：文件读不到、JSON 无法解析、命令参数错误。
2. 业务可继续但需要告知：某行无法解析、队伍不合法、未知招式。

第一类用错误返回。第二类进入 feedback、warnings、errors 等结构化结果。

不要把第二类吞掉，也不要把第一类伪装成空结果。

### 9.4 测试习惯

这个项目已有 Rust 测试和 CLI 测试。你学习时按这个顺序：

1. 给纯函数写单元测试。
2. 给 CLI 命令写集成测试。
3. 用真实 fixture 验证 JSON shape。
4. 对修 bug 的行为先写失败测试。

好测试应该测规则，例如：

- 超过 6 只会报错。
- 超过 66 点会报错。
- 超过 4 招会报错。
- 未知行进入 warning。
- 伤害 roll 数量和范围合理。

差测试只测：

- 函数返回了某个字段。
- 数组不是空。
- 字符串包含某个偶然文案。

### 9.5 性能意识

这个项目的性能问题大概率来自：

- 启动时加载大型 JSON。
- 重复 normalize 名称。
- 对大量宝可梦、招式、队伍组合做嵌套循环。
- 伤害计算批量跑时重复查表。
- UI 一次渲染过多长表。

先做这些：

- 用缓存避免重复解析。
- 用 id 做查找，不用 display name 做核心键。
- 热路径里减少字符串分配。
- 把 `Vec` 预分配到已知容量。
- 把算法复杂度从 $O(n^2)$ 降到 $O(n \log n)$ 或 $O(n)$，再考虑微优化。

不要一开始就做这些：

- 为了性能牺牲正确性。
- 上多线程掩盖算法问题。
- 手写复杂缓存但没有失效规则。
- 用 unsafe Rust。
- 用 C++ 重写核心但没有测试对齐。

## 10. AI 辅助维护流程

你可以靠 AI 维护，但你要当 reviewer，不当乘客。

### 10.1 每次改动前

给 AI 的好问题：

- “请解释 `parse` 命令从 CLI 到 core 的调用链，引用函数名。”
- “我要修改队伍校验规则，只影响 `team` 模块，请列出可能影响的测试。”
- “这段 diff 是否改变 CLI JSON 契约？”
- “请为这个 bug 写最小失败测试，不要修改实现。”

不要这样问：

- “帮我优化整个项目。”
- “帮我重构一下。”
- “让代码更高级。”
- “顺便把 UI 也改好看。”

### 10.2 每次改动中

控制粒度：

- 一次只改一个行为。
- 一次只碰一个核心模块和必要测试。
- 不让 AI 同时改算法、格式、命名、UI。
- 不接受没有解释的“大重构”。

要求 AI 输出：

- 改了哪些文件。
- 为什么改。
- 哪个命令验证。
- JSON 契约是否变化。
- 哪些地方没碰。

### 10.3 每次改动后

自己检查：

```bash
cargo fmt --all
cargo test --workspace
cargo run -p poke-type-cli -- parse --team tests/fixtures/basic-team.txt
```

如果只改 JS：

```bash
node --check static/app/main.js
```

如果只改 Python 数据脚本：

```bash
python -m py_compile poke_analysis-main/update_all_data.py
```

不要只看 AI 说“测试通过”。要看命令输出。

## 11. 生产级代码标准

这部分是你从新手到可靠维护者的分水岭。

### 11.1 命名

好命名说明业务意图：

- `validate_team`
- `parse_showdown_text`
- `calculate_damage_pair`
- `champion_points`
- `usage_rows`

差命名隐藏意图：

- `handleData`
- `process`
- `doThing`
- `tmp`
- `result2`

### 11.2 函数

好函数：

- 输入明确。
- 输出明确。
- 不偷偷读写全局状态。
- 失败路径明确。
- 能单独测试。

差函数：

- 读文件、解析、计算、打印混在一起。
- 靠全局变量。
- 出错返回空数组。
- 名字和行为不一致。

### 11.3 模块边界

推荐边界：

```text
CLI: 参数、文件、stdout/stderr
core: 解析、规则、算法、结构化结果
web: 本地静态资源服务
static JS: UI 状态和展示
scripts: 数据刷新和生成
```

不要把边界打穿。例如不要在 core 里读 `team.txt`，也不要在 CLI 里手写伤害公式。

### 11.4 注释

注释解释原因，不重复代码。

好注释：

```text
Champions doubles spread moves use 0.75 because M-A follows doubles damage rules.
```

差注释：

```text
Add one to i.
```

### 11.5 删除代码

生产代码不是越多越好。发现这些可以删：

- 没有调用者的 helper。
- 为旧 API 保留但没人用的 shim。
- 注释掉的旧代码。
- 没有测试、没有契约、没有业务意义的 fallback。

删除前先确认调用点。不要凭感觉删。

## 12. 推荐学习计划

### 第 1 周：项目地图

目标：能说清每个 crate 干什么。

任务：

- 读 `README.md`。
- 跑 `cargo run -p poke-type-cli -- --help`。
- 追踪 `parse`、`validate-team`、`damage` 三条命令。
- 记录每条命令调用了哪些 core 函数。

产出：一张调用链笔记。

### 第 2 周：Rust 数据结构

目标：能读懂 `Config`、`ParseResult`、`TeamValidation`。

任务：

- 学 `struct`、`enum`、`Option`、`Result`。
- 读 `schema` 和 `team`。
- 给 `team` 加一个小测试。

产出：一个通过的 Rust 测试。

### 第 3 周：Showdown 解析

目标：能改解析规则而不破坏旧输入。

任务：

- 读 `showdown`。
- 画出 block parser 的状态。
- 给未知行、EVs、Points、Ability 各写一个测试。

产出：解析行为测试集。

### 第 4 周：C++ 复刻校验

目标：理解值、引用、容器和拷贝。

任务：

- 用 C++ 写 `Config` 和 `validate_team`。
- 使用 `std::vector`、`std::span`、`std::string`。
- 写 3 个断言测试。

产出：一个小型 C++ 控制台程序。

### 第 5 周：C# 复刻 CLI

目标：理解 DTO、JSON、命令行工具。

任务：

- 用 C# 写最小 `parse` 或 `validate-team` CLI。
- 输出 JSON。
- 对齐 Rust 版字段命名。

产出：一个小型 C# CLI。

### 第 6 周：伤害计算和性能

目标：理解整数计算、浮点、热路径。

任务：

- 读 `damage`。
- 找出哪些地方会分配字符串。
- 找出哪些地方会查 JSON map。
- 写一个固定输入的伤害测试。

产出：一份性能风险笔记。

### 第 7 周以后：按真实 issue 维护

每次只做一个小任务：

- 修一个解析问题。
- 增加一个校验规则。
- 改一个推荐评分项。
- 补一个 CLI 测试。
- 优化一个重复查表点。

每个任务都按同一流程：读契约，写测试，改 core，跑命令，看输出。

## 13. 你应该怎么审查 AI 代码

看五件事：

1. 有没有改错层。CLI 不该写业务，core 不该读文件。
2. 有没有破坏 JSON 字段名。
3. 有没有新增静默 fallback。
4. 有没有把一个小改动扩成大重构。
5. 有没有测试真实行为，而不是测试实现细节。

如果 AI 给出大段代码，先让它回答：

- 这个改动影响哪个命令？
- 这个改动影响哪个 JSON 字段？
- 有哪些旧输入仍然必须工作？
- 哪个测试能证明行为正确？
- 哪些文件不应该被改？

答不上来，就不要合并。

## 14. 长期目标

你最终要具备这些能力：

- 看懂 Rust core 的主要模块。
- 能用 CLI 验证每个功能。
- 能写小的 Rust 单元测试。
- 能用 C++ 解释性能和内存成本。
- 能用 C# 快速做工具层原型。
- 能识别 AI 写的“能跑但不能维护”的代码。
- 能把一个需求拆成输入、规则、输出、测试、性能风险。

这才是从 vibe 到工程维护的分界线。
