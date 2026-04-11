import {FALLBACK_LEVEL} from "./constants.js";
import {t} from "./i18n.js";
import {getSpeedBoostAbilityNames} from "./speed.js";
import {hydrateConfigs} from "./showdown.js";
import {normalizeName} from "./utils.js";

const FASTEST_TEMPLATE_ID = "fastest";
const SLOWEST_TEMPLATE_ID = "slowest";
const SPEED_ABILITY_TEMPLATE_ID = "ability";

function getPrimaryAttackStat(baseStats = {}) {
  return Number(baseStats.atk || 0) > Number(baseStats.spa || 0) ? "atk" : "spa";
}

function buildChampionPoints(baseStats = {}, templateId) {
  const attackStat = getPrimaryAttackStat(baseStats);
  if (templateId === FASTEST_TEMPLATE_ID) {
    return {
      hp: 2,
      atk: attackStat === "atk" ? 32 : 0,
      def: 0,
      spa: attackStat === "spa" ? 32 : 0,
      spd: 0,
      spe: 32,
    };
  }
  return {
    hp: 32,
    atk: attackStat === "atk" ? 32 : 0,
    def: attackStat === "atk" ? 2 : 0,
    spa: attackStat === "spa" ? 32 : 0,
    spd: attackStat === "spa" ? 2 : 0,
    spe: 0,
  };
}

function getNature(baseStats = {}, templateId) {
  const isPhysical = getPrimaryAttackStat(baseStats) === "atk";
  if (templateId === FASTEST_TEMPLATE_ID) {
    return isPhysical ? "Jolly" : "Timid";
  }
  return isPhysical ? "Brave" : "Quiet";
}

function createTemplateSeed(species, language, templateId) {
  return {
    id: `template:${species.speciesId}:${templateId}`,
    source: "template",
    speciesId: species.speciesId,
    speciesName: species.speciesName,
    displayName: species.speciesName,
    ability: "",
    item: "",
    teraType: "",
    nature: getNature(species.baseStats, templateId),
    note: t(language, templateId === FASTEST_TEMPLATE_ID ? "library.templateFastest" : "library.templateSlowest"),
    level: FALLBACK_LEVEL,
    championPoints: buildChampionPoints(species.baseStats, templateId),
    moveNames: [],
    teammates: {},
    usage: 0,
  };
}

function hydrateTemplate(seed, datasets) {
  return hydrateConfigs([seed], datasets, FALLBACK_LEVEL)[0] || null;
}

function createAbilityBoostTemplate(fastestTemplate, species, language) {
  const abilities = getSpeedBoostAbilityNames(species.abilities, fastestTemplate.stats);
  if (!abilities.length) {
    return null;
  }
  return {
    ...fastestTemplate,
    id: `template:${species.speciesId}:${SPEED_ABILITY_TEMPLATE_ID}`,
    note: t(language, "speed.syntheticAbility"),
    ability: abilities[0],
    excludeBaseSpeedTier: true,
    plusOneSpeed: {
      speed: Math.floor(Number(fastestTemplate.stats?.spe || 0) * 1.5),
      sources: abilities,
    },
  };
}

function createTemplateGroup(species, datasets, language) {
  const fastest = hydrateTemplate(createTemplateSeed(species, language, FASTEST_TEMPLATE_ID), datasets);
  const slowest = hydrateTemplate(createTemplateSeed(species, language, SLOWEST_TEMPLATE_ID), datasets);
  if (!fastest || !slowest) {
    return null;
  }
  return {
    speciesId: species.speciesId,
    speciesName: species.speciesName,
    spritePosition: species.spritePosition,
    types: species.types,
    searchText: normalizeName([species.speciesName, species.speciesId, ...(species.types || [])].join(" ")),
    templates: [fastest, slowest],
    speedAbilityTemplate: createAbilityBoostTemplate(fastest, species, language),
  };
}

export function buildSpeciesTemplateConfigs(species, datasets, language) {
  const group = createTemplateGroup(species, datasets, language);
  return group?.templates || [];
}

export function buildAvailableSpeciesOptions(datasets, library, language) {
  const configuredSpecies = new Set(library.map((config) => config.speciesId));
  return (datasets.availableSpecies || [])
    .filter((species) => !configuredSpecies.has(species.speciesId))
    .map((species) => createTemplateGroup(species, datasets, language))
    .filter(Boolean)
    .sort((left, right) => left.speciesName.localeCompare(right.speciesName, "zh-Hans-CN"));
}

export function filterAvailableSpeciesOptions(options, search) {
  const token = normalizeName(search);
  if (!token) {
    return options;
  }
  return options.filter((option) => option.searchText.includes(token));
}

export function findTemplateConfig(options, templateId) {
  for (const option of options) {
    const template = option.templates.find((entry) => entry.id === templateId);
    if (template) {
      return template;
    }
  }
  return null;
}

export function buildSyntheticSpeedEntries(datasets, library, language) {
  const configuredSpecies = new Set(library.map((config) => config.speciesId));
  return (datasets.availableSpecies || [])
    .filter((species) => !configuredSpecies.has(species.speciesId))
    .map((species) => createTemplateGroup(species, datasets, language))
    .filter(Boolean)
    .flatMap((group) => group.speedAbilityTemplate
      ? [...group.templates, group.speedAbilityTemplate]
      : group.templates);
}
