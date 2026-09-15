# Champions 宝可梦素材

本地素材用于构筑工作台，原始版权归 Pokémon、Nintendo、Creatures 和 GAME FREAK 等权利人。没有将图片标记为本项目自行创作或重新授权。

- 主要来源：[PokeAPI/sprites 的 Champions 目录](https://github.com/PokeAPI/sprites/tree/2ecb4eeacd5a1718621fc30f12772e3f60d830b9/sprites/pokemon/versions/generation-ix/champions)，128×128 PNG。
- 花纹等补充素材：[KevinToodlepoot/pokemon-champions-sprites](https://github.com/KevinToodlepoot/pokemon-champions-sprites/tree/65f3c0d7434ef9206ddda61856d8938b82cfc710)，120×120 PNG；该仓库注明素材来自 Bulbapedia，没有另行提供图片许可证。
- 物种与形态编号：[PokeAPI/pokeapi](https://github.com/PokeAPI/pokeapi/tree/4b82c204ddd19ecb8eda2ea044ccb59e222b721c/data/v2/csv)。

`manifest.json` 逐项保留完整物种 ID、上游名称、仓库提交、原始路径、尺寸与 SHA-256。图片按内容哈希保存在 `images/`；构建时打入本地界面资源，无需联网加载。

映射使用完整物种和形态名称，不使用全国图鉴编号推断截取位置。爱管侍、超能妙喵、幽尾玄鱼的雌雄素材分别匹配；炎狮的雌性外观通过配置性别选择。地区形态、花纹、家庭数量和 Mega 形态分别登记。怖思壶真货及来悲粗茶杰作的正面图片与普通形态共享，索引中明确记录原因；不把这种例外推广到其他形态。

维护命令：`pnpm sprites:sync` 复现固定提交；`pnpm sprites:sync --latest` 获取上述来源的新提交并重新验证当前环境覆盖。不存在的新物种图片在界面显示“待补图”，不会冒用基础形态图片。新增规则引入物种时，在发布前更新素材并运行形态与界面回归。
