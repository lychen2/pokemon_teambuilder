import {clamp} from "./utils.js";

export const RECOMMENDATION_PREFERENCE_ITEMS = Object.freeze([
  {id: "patchWeakness", labelKey: "recommend.pref.patchWeakness"},
  {id: "patchCoverage", labelKey: "recommend.pref.patchCoverage"},
  {id: "patchRoles", labelKey: "recommend.pref.patchRoles"},
  {id: "patchSpeed", labelKey: "recommend.pref.patchSpeed"},
  {id: "avoidDuplicateTypes", labelKey: "recommend.pref.avoidDuplicateTypes"},
]);

const DEFAULT_COMPONENT_WEIGHT = 100;
const PAIRING_BIAS_CENTER = 50;
const TEAM_SIZE_PAIRING_PRESETS = Object.freeze({
  1: 78,
  2: 66,
  3: 56,
  4: 44,
  5: 30,
});

export const RECOMMENDATION_BIAS_ITEM = Object.freeze({
  id: "pairingBias",
  labelKey: "recommend.weight.balance",
  minLabelKey: "recommend.weight.teamShape",
  maxLabelKey: "recommend.weight.pairing",
});

export const DEFAULT_RECOMMENDATION_PREFERENCES = Object.freeze({
  patchWeakness: true,
  patchCoverage: true,
  patchRoles: true,
  patchSpeed: true,
  avoidDuplicateTypes: true,
});

export const DEFAULT_RECOMMENDATION_WEIGHTS = Object.freeze({
  pairingBias: PAIRING_BIAS_CENTER,
});

export function normalizeRecommendationPreferences(value = {}) {
  return RECOMMENDATION_PREFERENCE_ITEMS.reduce((preferences, item) => {
    return {
      ...preferences,
      [item.id]: typeof value?.[item.id] === "boolean"
        ? value[item.id]
        : DEFAULT_RECOMMENDATION_PREFERENCES[item.id],
    };
  }, {});
}

export function normalizeRecommendationWeights(value = {}) {
  const rawBias = Number(value?.pairingBias);
  if (Number.isFinite(rawBias)) {
    return {pairingBias: clamp(Math.round(rawBias), 0, 100)};
  }
  const legacyUsageWeight = Number(value?.usageTeammates);
  if (Number.isFinite(legacyUsageWeight)) {
    return {pairingBias: clamp(Math.round(legacyUsageWeight / 2), 0, 100)};
  }
  return {...DEFAULT_RECOMMENDATION_WEIGHTS};
}

export function buildRecommendationComponentWeights() {
  return {
    patchWeakness: DEFAULT_COMPONENT_WEIGHT,
    patchCoverage: DEFAULT_COMPONENT_WEIGHT,
    patchRoles: DEFAULT_COMPONENT_WEIGHT,
    patchSpeed: DEFAULT_COMPONENT_WEIGHT,
    avoidDuplicateTypes: DEFAULT_COMPONENT_WEIGHT,
  };
}

export function getRecommendationPairingPreset(teamSize = 0) {
  const size = Math.max(1, Math.min(5, Math.floor(Number(teamSize || 0))));
  return TEAM_SIZE_PAIRING_PRESETS[size] ?? PAIRING_BIAS_CENTER;
}

export function getRecommendationScoreMix(teamSize = 0, weights = {}, options = {}) {
  const sliderBias = normalizeRecommendationWeights(weights).pairingBias;
  const fallbackPreset = getRecommendationPairingPreset(teamSize);
  const presetBias = Number.isFinite(Number(options.presetBias))
    ? clamp(Math.round(Number(options.presetBias)), 0, 100)
    : fallbackPreset;
  const pairingBias = sliderBias;
  return {
    sliderBias,
    presetBias,
    fallbackPreset,
    pairingBias,
    teamShapeBias: 100 - pairingBias,
    pairingShare: pairingBias / 100,
    teamShapeShare: (100 - pairingBias) / 100,
  };
}
