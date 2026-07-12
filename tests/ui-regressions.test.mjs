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
const {buildUsageLookup, getUsageTeammateShare} = await import("../static/app/usage.js");
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

  const abomasiteMarkup = itemIconMarkup(datasets.items.abomasite, {iconScheme: ICON_SCHEMES.CHAMPIONS_OFFICIAL, datasets});
  assert.match(abomasiteMarkup, /champions-official-icons\/items\/abomasite\.png/);
  const itemMarkup = itemIconMarkup(datasets.items.barbaracite, {iconScheme: ICON_SCHEMES.CHAMPIONS_OFFICIAL, datasets});
  assert.match(itemMarkup, /champions-official-icons\/items\/barbaracite\.png/);
});

test("desktop UI CSS keeps public teams on one six-member row and a persistent two-column shell", async () => {
  const componentsCss = await readFile("static/css/components.css", "utf8");
  const shellCss = await readFile("static/css/shell.css", "utf8");
  const memberGridStart = componentsCss.indexOf(".vgcpastes-member-list {");
  const memberGridEnd = componentsCss.indexOf(".vgcpastes-member {", memberGridStart);
  const memberGridCss = componentsCss.slice(memberGridStart, memberGridEnd);
  const itemBadgeStart = componentsCss.indexOf(".vgcpastes-member-item-icon,");
  const itemBadgeEnd = componentsCss.indexOf(".vgcpastes-member-sprite .item-icon-image", itemBadgeStart);
  const itemBadgeCss = componentsCss.slice(itemBadgeStart, itemBadgeEnd);

  assert.match(memberGridCss, /repeat\(6, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(memberGridCss, /repeat\([23],|auto-fit|auto-fill/);
  assert.match(itemBadgeCss, /background-color: transparent/);
  assert.match(itemBadgeCss, /filter: drop-shadow/);
  assert.match(itemBadgeCss, /box-shadow: none/);
  assert.doesNotMatch(shellCss, /@media \(max-width: 1100px\)[\s\S]*grid-template-columns: 1fr/);
  assert.match(shellCss, /@media \(max-width: 1159px\)[\s\S]*grid-template-columns: 220px minmax\(0, 1fr\)/);
});

test("team analysis uses one balanced, bilingual workspace layout", async () => {
  const [analysisCss, typeCss, indexHtml, renderAnalysisJs, renderUsageJs, renderJs, mainJs] = await Promise.all([
    readFile("static/css/analysis.css", "utf8"),
    readFile("static/css/type-colors.css", "utf8"),
    readFile("index.html", "utf8"),
    readFile("static/app/render-analysis.js", "utf8"),
    readFile("static/app/render-usage.js", "utf8"),
    readFile("static/app/render.js", "utf8"),
    readFile("static/app/main.js", "utf8"),
  ]);
  const cssWithoutComments = analysisCss.replace(/\/\*[\s\S]*?\*\//g, "");
  let braceDepth = 0;
  for (const character of cssWithoutComments) {
    if (character === "{") braceDepth += 1;
    if (character === "}") braceDepth -= 1;
    assert.ok(braceDepth >= 0, "analysis.css must not close an unopened block");
  }

  assert.equal(braceDepth, 0, "analysis.css must close every block");
  assert.doesNotMatch(indexHtml, /analysis-question-nav/);
  assert.match(indexHtml, /analysis-jump-actions/);
  assert.match(indexHtml, /role="tablist"/);
  assert.match(renderAnalysisJs, /typeBadgeMarkup\(type, language\)/);
  assert.doesNotMatch(
    [typeCss, renderAnalysisJs, renderUsageJs, renderJs, mainJs].join("\n"),
    /\btype-(?:pill|chip)\b/,
    "all displayed Pokemon types should use typeBadgeMarkup",
  );
  assert.match(renderAnalysisJs, /analysis-evidence-disclosure/);
  assert.match(renderAnalysisJs, /analysis-section-disclosure/);
  assert.equal(t("zh", "analysis.workspaceCopy"), "先看结论，再下钻到属性、职能和核心证据。");
  assert.equal(t("en", "analysis.jumpSpeed"), "View speed tiers");
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
  assert.equal(raichuY.coreMembers.length, 2);
  assert.ok(raichuY.coreMembers.some((member) => member.speciesName === "Raichu-Mega-Y"));
  assert.equal(raichuY.coreMembers.filter((member) => member.speciesName.includes("-Mega")).length, 1);

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

test("pairing bias uses teammate percentages and changes recommendation order", async () => {
  const datasets = await loadDatasets();
  const usage = JSON.parse(await readFile("static/usage.json", "utf8"));
  const datasetsWithUsage = {
    ...datasets,
    usageLookup: buildUsageLookup(usage),
  };
  const text = await readFile("config-default.txt", "utf8");
  const {configs} = parseShowdownLibrary(text, datasetsWithUsage, {fallbackLevel: 50, language: "zh"});
  const team = ["garchomp", "whimsicott", "incineroar"]
    .map((speciesId) => configs.find((config) => config.speciesId === speciesId))
    .filter(Boolean);

  assert.equal(team.length, 3);
  assert.ok(Math.abs(getUsageTeammateShare(datasetsWithUsage, "garchomp", "charizardmegay") - 0.20849) < 1e-6);

  const teamFit = recommendConfigs(configs, team, [], "zh", {
    datasets: datasetsWithUsage,
    weights: {pairingBias: 0},
  }).recommendations;
  const pairing = recommendConfigs(configs, team, [], "zh", {
    datasets: datasetsWithUsage,
    weights: {pairingBias: 100},
  }).recommendations;

  assert.notDeepEqual(
    pairing.map((entry) => entry.speciesId),
    teamFit.map((entry) => entry.speciesId),
  );
  assert.ok(new Set(pairing.map((entry) => entry.recommendationAxes.pairingPercent)).size > 1);
});
