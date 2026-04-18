export const RECOMMENDATION_PREFERENCE_ITEMS = Object.freeze([
  {id: "patchWeakness", labelKey: "recommend.pref.patchWeakness"},
  {id: "patchRoles", labelKey: "recommend.pref.patchRoles"},
  {id: "patchSpeed", labelKey: "recommend.pref.patchSpeed"},
  {id: "avoidDuplicateTypes", labelKey: "recommend.pref.avoidDuplicateTypes"},
]);

export const RECOMMENDATION_WEIGHT_ITEMS = Object.freeze([
  ...RECOMMENDATION_PREFERENCE_ITEMS,
  {id: "usageTeammates", labelKey: "recommend.weight.usageTeammates"},
]);

export const DEFAULT_RECOMMENDATION_PREFERENCES = Object.freeze({
  patchWeakness: true,
  patchRoles: true,
  patchSpeed: true,
  avoidDuplicateTypes: true,
});

export const DEFAULT_RECOMMENDATION_WEIGHTS = Object.freeze({
  patchWeakness: 100,
  patchRoles: 100,
  patchSpeed: 100,
  avoidDuplicateTypes: 100,
  usageTeammates: 100,
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
  return RECOMMENDATION_WEIGHT_ITEMS.reduce((weights, item) => {
    const rawValue = Number(value?.[item.id]);
    return {
      ...weights,
      [item.id]: Number.isFinite(rawValue)
        ? Math.min(200, Math.max(0, Math.round(rawValue)))
        : DEFAULT_RECOMMENDATION_WEIGHTS[item.id],
    };
  }, {});
}
