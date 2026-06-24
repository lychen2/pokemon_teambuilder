import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = {__TAURI_INTERNALS__: undefined};

const officialNatureTranslations = Object.freeze({
  Hardy: "勤奋",
  Lonely: "怕寂寞",
  Adamant: "固执",
  Naughty: "顽皮",
  Brave: "勇敢",
  Bold: "大胆",
  Docile: "坦率",
  Impish: "淘气",
  Lax: "乐天",
  Relaxed: "悠闲",
  Modest: "内敛",
  Mild: "慢吞吞",
  Bashful: "害羞",
  Rash: "马虎",
  Quiet: "冷静",
  Calm: "温和",
  Gentle: "温顺",
  Careful: "慎重",
  Quirky: "浮躁",
  Sassy: "自大",
  Timid: "胆小",
  Hasty: "急躁",
  Jolly: "爽朗",
  Naive: "天真",
  Serious: "认真",
});

const {ICON_SCHEMES, NATURE_TRANSLATIONS} = await import("../static/app/constants.js");
const {t} = await import("../static/app/i18n.js");
const {loadDatasets} = await import("../static/app/data.js");
const {spriteMarkup} = await import("../static/app/sprites.js");

test("official Simplified Chinese nature names stay aligned", () => {
  assert.deepEqual(NATURE_TRANSLATIONS, officialNatureTranslations);
});

test("current rules copy does not describe the bundled list as old rules", () => {
  assert.equal(t("zh", "library.browserTitle"), "当前规则名单宝可梦");
  assert.equal(t("zh", "library.speciesScopeSeason"), "当前规则名单");
  assert.equal(t("zh", "library.oldRuleBadge"), "规则名单");
  assert.equal(t("en", "library.browserTitle"), "Current Rules List Pokemon");
  assert.equal(t("en", "library.speciesScopeSeason"), "Current Rules List");
  assert.equal(t("en", "library.oldRuleBadge"), "Rules list");
});

test("Poke Icons scheme uses local standalone icons for Palafin and references", async () => {
  const datasets = await loadDatasets();
  assert.equal(datasets.pokeIconMap.palafin, "./static/team-planner-assets/pokemon/0964_000_mf_n.png");
  assert.equal(datasets.pokeIconMap.kyogre, "./static/team-planner-assets/pokemon/0382_000_uk_n.png");
  assert.equal(datasets.pokeIconMap.fluttermane, "./static/team-planner-assets/pokemon/0987_000_uk_n.png");

  const markup = spriteMarkup(
    {speciesId: "kyogre", speciesName: "Kyogre", spritePosition: {x: 400, y: 930}},
    {iconScheme: ICON_SCHEMES.POKE_ICONS, datasets},
  );
  assert.match(markup, /0382_000_uk_n\.png/);
  assert.doesNotMatch(markup, /sprite-fallback/);
});

test("Poke Icons title uses localized species names in Chinese", async () => {
  const datasets = await loadDatasets();
  const markup = spriteMarkup(
    {speciesId: "kyogre", speciesName: "Kyogre", spritePosition: {x: 400, y: 930}},
    {language: "zh", iconScheme: ICON_SCHEMES.POKE_ICONS, datasets},
  );

  assert.match(markup, /title="盖欧卡"/);
  assert.doesNotMatch(markup, /title="Kyogre"/);
});
