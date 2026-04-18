import {analyzeTeam} from "./analysis.js";
import {buildSpeciesTemplateConfigs} from "./champions-vgc.js";
import {normalizeRecommendationPreferences} from "./recommendation-preferences.js";
import {isMegaConfig} from "./utils.js";
import {buildRecommendationEntry} from "./recommendation-scoring/entry.js";

const MAX_TEAM_MEGAS = 2;

function buildTemplateRecommendations(library, team, datasets, analysis, speedTiers, language, preferences, weights, focusType = "") {
  if (!datasets?.availableSpecies?.length) {
    return [];
  }
  const configuredSpecies = new Set(library.map((config) => config.speciesId));
  const currentSpecies = new Set(team.map((config) => config.speciesId));
  return datasets.availableSpecies
    .filter((species) => !configuredSpecies.has(species.speciesId) && !currentSpecies.has(species.speciesId))
    .map((species) => {
      const templates = buildSpeciesTemplateConfigs(species, datasets, language);
      if (!templates.length) {
        return null;
      }
      const bestTemplate = templates
        .map((template) => buildRecommendationEntry(template, team, analysis, speedTiers, language, preferences, weights, datasets, focusType))
        .sort((left, right) => right.recommendationScore - left.recommendationScore)[0];
      if (!bestTemplate) {
        return null;
      }
      return {
        ...bestTemplate,
        recommendationSource: "template",
        recommendationAction: "configure",
      };
    })
    .filter(Boolean);
}

function sortRecommendations(left, right) {
  return (
    right.recommendationScore - left.recommendationScore
    || right.breakdown.focus - left.breakdown.focus
    || right.coveredThreats.length - left.coveredThreats.length
    || right.breakdown.quality - left.breakdown.quality
  );
}

export function recommendConfigs(library, team, speedTiers, language = "zh", options = {}) {
  if (!team.length || team.length >= 6) {
    return [];
  }
  const preferences = normalizeRecommendationPreferences(options.preferences);
  const weights = options.weights || {};
  const focusType = options.focusType || "";
  const analysis = analyzeTeam(team, speedTiers, language, library, preferences);
  const currentSpecies = new Set(team.map((config) => config.speciesId));
  const dismissedKeys = new Set(options.dismissedKeys || []);
  const megaCount = team.filter((member) => isMegaConfig(member)).length;
  const configuredRecommendations = library
    .filter((candidate) => !currentSpecies.has(candidate.speciesId))
    .filter((candidate) => !(megaCount >= MAX_TEAM_MEGAS && isMegaConfig(candidate)))
    .map((candidate) => ({
      ...buildRecommendationEntry(candidate, team, analysis, speedTiers, language, preferences, weights, options.datasets, focusType),
      recommendationSource: "library",
      recommendationAction: "add",
    }));
  const templateRecommendations = buildTemplateRecommendations(
    library,
    team,
    options.datasets,
    analysis,
    speedTiers,
    language,
    preferences,
    weights,
    focusType,
  ).filter((candidate) => !(megaCount >= MAX_TEAM_MEGAS && isMegaConfig(candidate)));
  return [...configuredRecommendations, ...templateRecommendations]
    .filter((entry) => !dismissedKeys.has(entry.recommendationKey))
    .sort(sortRecommendations)
    .slice(0, 12);
}
