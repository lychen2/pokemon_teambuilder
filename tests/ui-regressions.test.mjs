import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
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
const {analyzeTeam} = await import("../static/app/analysis.js");
const {t} = await import("../static/app/i18n.js");
const {loadDatasets} = await import("../static/app/data.js");
const {itemIconMarkup, spriteMarkup} = await import("../static/app/sprites.js");
const {recommendConfigs} = await import("../static/app/recommendations.js");
const {parseShowdownLibrary} = await import("../static/app/showdown.js");
const {createRoleContext} = await import("../static/app/team-roles.js");

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
  assert.match(markup, /--fallback-position: -400px -930px/);
  assert.match(markup, /poke-icon-loaded/);
  assert.doesNotMatch(markup, /sprite-fallback/);
});

test("Champions Official scheme uses synced Pokemon and item icons", async () => {
  const datasets = await loadDatasets();
  assert.equal(datasets.championsIconMaps.pokemon.aegislash, "./static/champions-official-icons/pokemon/aegislash.png");
  assert.equal(datasets.championsIconMaps.items.abomasite.url, "./static/champions-official-icons/items/abomasite.png");
  assert.equal(datasets.championsIconMaps.items.abomasite.lowResolution, true);
  assert.equal(datasets.championsIconMaps.items.barbaracite.url, "./static/champions-official-icons/items/barbaracite.png");
  assert.equal(datasets.championsIconMaps.items.barbaracite.lowResolution, false);

  const pokemonMarkup = spriteMarkup(
    {speciesId: "aegislash", speciesName: "Aegislash", spritePosition: {x: 40, y: 90}},
    {iconScheme: ICON_SCHEMES.CHAMPIONS_OFFICIAL, datasets},
  );
  assert.match(pokemonMarkup, /champions-official-icons\/pokemon\/aegislash\.png/);
  assert.match(pokemonMarkup, /--fallback-position: -40px -90px/);

  assert.equal(itemIconMarkup(datasets.items.abomasite, {iconScheme: ICON_SCHEMES.CHAMPIONS_OFFICIAL, datasets}), "");
  const itemMarkup = itemIconMarkup(datasets.items.barbaracite, {iconScheme: ICON_SCHEMES.CHAMPIONS_OFFICIAL, datasets});
  assert.match(itemMarkup, /champions-official-icons\/items\/barbaracite\.png/);
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

test("reference Mega cards include long-tail Megas without duplicate base representatives", async () => {
  const datasets = await loadDatasets();
  const text = await readFile("config-default.txt", "utf8");
  const {configs} = parseShowdownLibrary(text, datasets, {fallbackLevel: 50, language: "zh"});
  const analysis = analyzeTeam(configs.slice(0, 6), [], "zh", configs, {}, {datasets});
  const megaEntries = analysis.referenceTeams.entries.filter((entry) => entry.archetypeId === "mega");
  const scizor = megaEntries.find((entry) => entry.title === "巨钳螳螂-超级进化");
  const raichuY = megaEntries.find((entry) => entry.title === "雷丘-超级进化-Y");

  assert.ok(scizor, "Scizor-Mega should be represented even when fallback samples are incomplete");
  assert.ok(raichuY, "Raichu-Mega-Y should be represented");
  assert.deepEqual(
    raichuY.coreMembers.map((member) => member.speciesName),
    ["Raichu-Mega-Y", "Pelipper"],
  );

  const garchompMega = configs.find((config) => config.speciesId === "garchompmega");
  const rockSlideGarchompMega = {
    ...garchompMega,
    id: "test:garchompmega:rockslide",
    moves: garchompMega.moves.map((move, index) => index === 1
      ? {name: "Rock Slide", id: "rockslide", type: "Rock", category: "Physical", target: "alladjacentfoes"}
      : move),
  };
  const charizardCheckTeam = [rockSlideGarchompMega, "sinistcha", "basculegion", "whimsicott", "kingambit", "staraptor"]
    .map((entry) => typeof entry === "string" ? configs.find((config) => config.speciesId === entry) : entry)
    .filter(Boolean);
  const matchupAnalysis = analyzeTeam(charizardCheckTeam, [], "zh", configs, {}, {datasets});
  const charizardY = matchupAnalysis.referenceTeams.entries.find((entry) => entry.title === "喷火龙-超级进化-Y");
  assert.deepEqual(
    charizardY.lineup.map((member) => member.speciesName),
    ["Garchomp-Mega", "Basculegion", "Staraptor", "Kingambit"],
  );
  assert.equal(charizardY.lineup.filter((member) => member.speciesName.includes("-Mega")).length, 1);

  const doubleMegaTeam = [rockSlideGarchompMega, "staraptormega", "sinistcha", "basculegion", "whimsicott", "kingambit"]
    .map((entry) => typeof entry === "string" ? configs.find((config) => config.speciesId === entry) : entry)
    .filter(Boolean);
  const doubleMegaAnalysis = analyzeTeam(doubleMegaTeam, [], "zh", configs, {}, {datasets});
  const doubleMegaCharizardY = doubleMegaAnalysis.referenceTeams.entries.find((entry) => entry.title === "喷火龙-超级进化-Y");
  assert.equal(doubleMegaCharizardY.lineup.filter((member) => member.speciesName.includes("-Mega")).length, 1);

  const wolfeySixMegaTeam = ["clefablemega", "garchompmega", "gengarmega", "gyaradosmega", "scizormega", "tyranitarmega"]
    .map((speciesId) => configs.find((config) => config.speciesId === speciesId))
    .filter(Boolean);
  const sixMegaAnalysis = analyzeTeam(wolfeySixMegaTeam, [], "zh", configs, {}, {datasets});
  const sixMegaCharizardY = sixMegaAnalysis.referenceTeams.entries.find((entry) => entry.title === "喷火龙-超级进化-Y");
  assert.equal(sixMegaCharizardY.lineup.length, 4);
});

test("cached role context preserves analysis and recommendation output", async () => {
  const datasets = await loadDatasets();
  const text = await readFile("config-default.txt", "utf8");
  const {configs} = parseShowdownLibrary(text, datasets, {fallbackLevel: 50, language: "zh"});
  const team = configs.slice(0, 3);
  const library = configs.slice(0, 30);
  const roleContext = createRoleContext(library);
  const fullContext = createRoleContext(configs.slice(0, 30));
  const filteredContext = createRoleContext(configs.slice(0, 10));

  assert.notDeepEqual(fullContext, filteredContext);
  assert.deepEqual(
    analyzeTeam(team, [], "zh", library, {}, {datasets}),
    analyzeTeam(team, [], "zh", library, {}, {datasets, roleContext}),
  );
  assert.deepEqual(
    recommendConfigs(library, team, [], "zh", {datasets}),
    recommendConfigs(library, team, [], "zh", {datasets, roleContext}),
  );
});
