import {analyzeTeam} from "./analysis.js";
import {buildSpeciesTemplateConfigs} from "./champions-vgc.js";
import {
  buildRecommendationComponentWeights,
  getRecommendationScoreMix,
  normalizeRecommendationPreferences,
} from "./recommendation-preferences.js";
import {countMegaConfigs, getBattleEquivalentSpeciesId, isMegaConfig} from "./utils.js";
import {buildCounterChainContext} from "./recommendation-scoring/counter-chain.js";
import {buildRecommendationEntry} from "./recommendation-scoring/entry.js";
import {
  annotateRecommendationAxisPercents,
  finalizeRecommendationScores,
  getRecommendationPairingCrossoverBias,
} from "./recommendation-scoring/score-mix.js";

const MAX_TEAM_MEGAS = 2;

function buildScoringContext(team, library, speedTiers, language, preferences, weights, options = {}) {
  const analysis = options.analysis
    || analyzeTeam(team, speedTiers, language, library, preferences, {fieldState: options.fieldState, datasets: options.datasets});
  return {
    team,
    analysis,
    speedTiers,
    language,
    preferences,
    weights,
    datasets: options.datasets,
    focusType: options.focusType || "",
    counterChain: buildCounterChainContext(library, team, options.datasets),
  };
}

function chooseBestRecommendationBySpecies(recommendations = []) {
  const bestBySpecies = new Map();
  recommendations.forEach((entry) => {
    const speciesKey = entry.battleEquivalentSpeciesId || entry.speciesId;
    const current = bestBySpecies.get(speciesKey);
    const currentHasItemConflict = Boolean(current?.itemConflictMembers?.length);
    const entryHasItemConflict = Boolean(entry?.itemConflictMembers?.length);
    if (currentHasItemConflict !== entryHasItemConflict) {
      if (!entryHasItemConflict) {
        bestBySpecies.set(speciesKey, entry);
      }
      return;
    }
    if (!current || sortRecommendations(entry, current) < 0) {
      bestBySpecies.set(speciesKey, entry);
    }
  });
  return [...bestBySpecies.values()];
}

function buildTemplateRecommendations(library, context = {}) {
  const {team = [], datasets, language = "zh"} = context;
  if (!datasets?.availableSpecies?.length) {
    return [];
  }
  const configuredSpecies = new Set(library.map((config) => getBattleEquivalentSpeciesId(config.speciesId, datasets)));
  const currentSpecies = new Set(team.map((config) => getBattleEquivalentSpeciesId(config.speciesId, datasets)));
  return datasets.availableSpecies
    .filter((species) => !configuredSpecies.has(getBattleEquivalentSpeciesId(species.speciesId, datasets)) && !currentSpecies.has(getBattleEquivalentSpeciesId(species.speciesId, datasets)))
    .flatMap((species) => buildSpeciesTemplateConfigs(species, datasets, language));
}

function sortRecommendations(left, right) {
  return (
    right.recommendationScore - left.recommendationScore
    || Number(right.recommendationAxes?.teamShapePercent || 0) - Number(left.recommendationAxes?.teamShapePercent || 0)
    || Number(right.recommendationAxes?.pairingPercent || 0) - Number(left.recommendationAxes?.pairingPercent || 0)
    || Number(right.recommendationAxes?.teamShapeScore || 0) - Number(left.recommendationAxes?.teamShapeScore || 0)
    || Number(right.recommendationAxes?.pairingScore || 0) - Number(left.recommendationAxes?.pairingScore || 0)
    || right.breakdown.focus - left.breakdown.focus
    || right.breakdown.counterChain - left.breakdown.counterChain
    || right.recommendationFloorPenalty - left.recommendationFloorPenalty
    || right.coveredThreats.length - left.coveredThreats.length
    || right.breakdown.quality - left.breakdown.quality
  );
}

function applyFocusTypeFilter(recommendations = [], focusType = "") {
  if (!focusType) {
    return recommendations.sort(sortRecommendations);
  }
  const matching = recommendations
    .filter((entry) => entry.breakdown.focus > 0)
    .sort(sortRecommendations);
  const fallback = recommendations
    .filter((entry) => entry.breakdown.focus <= 0)
    .sort(sortRecommendations)
    .map((entry) => ({...entry, recommendationFocusFallback: true}));
  if (matching.length >= 5) {
    return matching;
  }
  return [...matching, ...fallback];
}

export function recommendConfigs(library, team, speedTiers, language = "zh", options = {}) {
  const emptyScoreMix = getRecommendationScoreMix(team.length, options.weights);
  if (!team.length || team.length >= 6) {
    return {
      recommendations: [],
      scoreMix: emptyScoreMix,
    };
  }
  const preferences = normalizeRecommendationPreferences(options.preferences);
  const weights = buildRecommendationComponentWeights();
  const focusType = options.focusType || "";
  const scoringContext = buildScoringContext(
    team,
    library,
    speedTiers,
    language,
    preferences,
    weights,
    options,
  );
  const currentSpecies = new Set(team.map((config) => getBattleEquivalentSpeciesId(config.speciesId, options.datasets)));
  const dismissedKeys = new Set(options.dismissedKeys || []);
  const megaCount = countMegaConfigs(team);
  const currentMega = team.find((member) => isMegaConfig(member)) || null;
  const megaReplacementTeam = currentMega ? team.filter((member) => member.id !== currentMega.id) : [];
  const megaReplacementContext = currentMega && megaReplacementTeam.length
    ? buildScoringContext(
      megaReplacementTeam,
      library,
      speedTiers,
      language,
      preferences,
      weights,
      options,
    )
    : null;
  const canRecommendReplacementMega = megaCount === 1 && Boolean(megaReplacementContext);
  const shouldAllowMegaCandidate = (candidate) => {
    if (!isMegaConfig(candidate)) {
      return true;
    }
    if (megaCount >= MAX_TEAM_MEGAS) {
      return false;
    }
    if (!megaCount) {
      return true;
    }
    return canRecommendReplacementMega;
  };
  const buildCandidateRecommendation = (candidate, source) => {
    const ignoresCurrentMega = isMegaConfig(candidate) && canRecommendReplacementMega;
    const candidateContext = ignoresCurrentMega ? megaReplacementContext : scoringContext;
    const baseEntry = buildRecommendationEntry(candidate, candidateContext);
    return {
      ...baseEntry,
      recommendationSource: source,
      recommendationAction: source === "template" ? "configure" : "add",
      recommendationIgnoresCurrentMega: ignoresCurrentMega,
    };
  };
  const configuredRecommendations = library
    .filter((candidate) => !currentSpecies.has(getBattleEquivalentSpeciesId(candidate.speciesId, options.datasets)))
    .filter(shouldAllowMegaCandidate)
    .map((candidate) => buildCandidateRecommendation(candidate, "library"));
  const templateRecommendations = buildTemplateRecommendations(
    library,
    scoringContext,
  ).filter(shouldAllowMegaCandidate)
    .map((candidate) => buildCandidateRecommendation(candidate, "template"));
  const axisAnnotatedRecommendations = annotateRecommendationAxisPercents([
    ...configuredRecommendations,
    ...templateRecommendations,
  ]);
  const autoPresetBias = getRecommendationPairingCrossoverBias(axisAnnotatedRecommendations);
  const resolvedAutoBias = Number.isFinite(Number(autoPresetBias))
    ? Number(autoPresetBias)
    : emptyScoreMix.presetBias;
  const effectiveWeights = options.autoBias
    ? {pairingBias: resolvedAutoBias}
    : options.weights;
  const scoreMix = getRecommendationScoreMix(team.length, effectiveWeights, {
    presetBias: autoPresetBias,
  });
  const scoredRecommendations = finalizeRecommendationScores(
    axisAnnotatedRecommendations.map((entry) => ({
      ...entry,
      scoreMix,
    })),
    scoreMix,
  );
  const activeRecommendations = chooseBestRecommendationBySpecies(
    scoredRecommendations,
  )
    .filter((entry) => !dismissedKeys.has(entry.recommendationKey));
  return {
    recommendations: applyFocusTypeFilter(activeRecommendations, focusType).slice(0, 12),
    scoreMix,
  };
}
