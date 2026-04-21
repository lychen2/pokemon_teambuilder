import {FALLBACK_LEVEL} from "./constants.js";
import {t} from "./i18n.js";
import {getSpeedBoostAbilityNames, isDoubleSpeedAbility} from "./speed.js";
import {hydrateConfigs} from "./showdown.js";
import {getUsageReferenceMoveEntries} from "./usage.js";
import {compareSpeciesByDex, normalizeName} from "./utils.js";

const FASTEST_TEMPLATE_ID = "fastest";
const SLOWEST_TEMPLATE_ID = "slowest";
const OUTPUT_TEMPLATE_ID = "output";
const SPEED_ABILITY_TEMPLATE_ID = "ability";
const OUTPUT_TEMPLATE_MIN_BASE_SPEED = 30;
const TEMPLATE_GROUP_CACHE = new Map();

const TEMPLATE_NOTE_KEYS = {
  [FASTEST_TEMPLATE_ID]: "library.templateFastest",
  [SLOWEST_TEMPLATE_ID]: "library.templateSlowest",
  [OUTPUT_TEMPLATE_ID]: "library.templateOutput",
};

function getPrimaryAttackStat(baseStats = {}) {
  return Number(baseStats.atk || 0) > Number(baseStats.spa || 0) ? "atk" : "spa";
}

function buildChampionPoints(baseStats = {}, templateId) {
  const attackStat = getPrimaryAttackStat(baseStats);
  if (templateId === SLOWEST_TEMPLATE_ID) {
    return {
      hp: 32,
      atk: attackStat === "atk" ? 32 : 0,
      def: attackStat === "atk" ? 2 : 0,
      spa: attackStat === "spa" ? 32 : 0,
      spd: attackStat === "spa" ? 2 : 0,
      spe: 0,
    };
  }
  return {
    hp: 2,
    atk: attackStat === "atk" ? 32 : 0,
    def: 0,
    spa: attackStat === "spa" ? 32 : 0,
    spd: 0,
    spe: 32,
  };
}

function getNature(baseStats = {}, templateId) {
  const isPhysical = getPrimaryAttackStat(baseStats) === "atk";
  if (templateId === FASTEST_TEMPLATE_ID) {
    return isPhysical ? "Jolly" : "Timid";
  }
  if (templateId === OUTPUT_TEMPLATE_ID) {
    return isPhysical ? "Adamant" : "Modest";
  }
  return isPhysical ? "Brave" : "Quiet";
}

function getTemplateMoveNames(speciesId, datasets) {
  return getUsageReferenceMoveEntries(speciesId, datasets, {
    minShare: 0.1,
    topLimit: 6,
    finalLimit: 4,
  }).map((entry) => entry.name);
}

function createTemplateSeed(species, datasets, language, templateId) {
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
    note: t(language, TEMPLATE_NOTE_KEYS[templateId] || "library.templateFastest"),
    level: FALLBACK_LEVEL,
    championPoints: buildChampionPoints(species.baseStats, templateId),
    moveNames: getTemplateMoveNames(species.speciesId, datasets),
    teammates: {},
    usage: 0,
  };
}

function hydrateTemplate(seed, datasets) {
  return hydrateConfigs([seed], datasets, FALLBACK_LEVEL)[0] || null;
}

function stripBoostFields(template) {
  if (!template) return template;
  const clone = {...template};
  delete clone.plusOneSpeed;
  delete clone.choiceScarfSpeed;
  delete clone.doubleSpeed;
  return clone;
}

function createAbilityBoostTemplate(fastestTemplate, species, language) {
  const abilities = getSpeedBoostAbilityNames(species.abilities, fastestTemplate.stats);
  if (!abilities.length) {
    return null;
  }
  const doubleAbilities = abilities.filter((ability) => isDoubleSpeedAbility(ability));
  const useDouble = doubleAbilities.length > 0;
  const chosenAbilities = useDouble ? doubleAbilities : abilities;
  const baseSpe = Number(fastestTemplate.stats?.spe || 0);
  const boostedSpeed = useDouble ? baseSpe * 2 : Math.floor(baseSpe * 1.5);
  const boostData = {speed: boostedSpeed, sources: chosenAbilities};
  const payload = useDouble ? {doubleSpeed: boostData} : {plusOneSpeed: boostData};
  return {
    ...fastestTemplate,
    id: `template:${species.speciesId}:${SPEED_ABILITY_TEMPLATE_ID}`,
    note: t(language, "speed.syntheticAbility"),
    ability: chosenAbilities[0],
    excludeBaseSpeedTier: true,
    ...payload,
  };
}

function createTemplateGroup(species, datasets, language) {
  const fastest = hydrateTemplate(createTemplateSeed(species, datasets, language, FASTEST_TEMPLATE_ID), datasets);
  const slowest = stripBoostFields(hydrateTemplate(createTemplateSeed(species, datasets, language, SLOWEST_TEMPLATE_ID), datasets));
  if (!fastest || !slowest) {
    return null;
  }
  const templates = [fastest, slowest];
  if (Number(species.baseStats?.spe || 0) >= OUTPUT_TEMPLATE_MIN_BASE_SPEED) {
    const output = hydrateTemplate(createTemplateSeed(species, datasets, language, OUTPUT_TEMPLATE_ID), datasets);
    if (output) {
      templates.push(output);
    }
  }
  return {
    speciesId: species.speciesId,
    speciesName: species.speciesName,
    dexNumber: Number(species.dexNumber || 0),
    spritePosition: species.spritePosition,
    types: species.types,
    searchText: normalizeName([species.speciesName, species.speciesId, ...(species.types || [])].join(" ")),
    templates,
    speedAbilityTemplate: createAbilityBoostTemplate(fastest, species, language),
  };
}

function getDatasetTemplateCache(datasets) {
  let cache = TEMPLATE_GROUP_CACHE.get(datasets);
  if (!cache) {
    cache = new Map();
    TEMPLATE_GROUP_CACHE.set(datasets, cache);
  }
  return cache;
}

function getTemplateCacheKey(speciesId, language) {
  return `${language}:${speciesId}`;
}

function getTemplateGroup(species, datasets, language) {
  if (!species?.speciesId) {
    return null;
  }
  const cache = getDatasetTemplateCache(datasets);
  const cacheKey = getTemplateCacheKey(species.speciesId, language);
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  const group = createTemplateGroup(species, datasets, language);
  if (group) {
    cache.set(cacheKey, group);
  }
  return group;
}

export function clearSpeciesTemplateCache(datasets = null) {
  if (datasets) {
    TEMPLATE_GROUP_CACHE.delete(datasets);
    return;
  }
  TEMPLATE_GROUP_CACHE.clear();
}

export function buildSpeciesTemplateConfigs(species, datasets, language) {
  const group = getTemplateGroup(species, datasets, language);
  return group?.templates || [];
}

export function buildAvailableSpeciesOptions(datasets, library, language) {
  const configuredSpecies = new Set(library.map((config) => config.speciesId));
  return (datasets.availableSpecies || [])
    .filter((species) => !configuredSpecies.has(species.speciesId))
    .map((species) => getTemplateGroup(species, datasets, language))
    .filter(Boolean)
    .sort(compareSpeciesByDex);
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
    .map((species) => getTemplateGroup(species, datasets, language))
    .filter(Boolean)
    .flatMap((group) => group.speedAbilityTemplate
      ? [...group.templates, group.speedAbilityTemplate]
      : group.templates);
}
