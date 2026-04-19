import {getResistanceProfileForConfig} from "../battle-semantics.js";

const ENABLED_FACTOR = 1.2;
const DISABLED_FACTOR = 0.5;

export function getSliderFactor(weightValue) {
  return Math.max(0, Number(weightValue || 0)) / 100;
}

export function applyWeightPreference(value, enabled, weightValue) {
  const toggleFactor = enabled ? ENABLED_FACTOR : DISABLED_FACTOR;
  return value * toggleFactor * getSliderFactor(weightValue);
}

export function countCoveredEntries(speedTiers, predicate) {
  return speedTiers.filter(predicate).reduce((sum, tier) => sum + tier.totalCount, 0);
}

export function getThreatTypes(analysis) {
  const pressureTypes = analysis.defensive
    .filter((entry) => entry.weakCount > entry.resistCount + entry.immuneCount)
    .map((entry) => entry.type);
  return pressureTypes.length
    ? pressureTypes
    : analysis.weaknesses.map((entry) => entry.type);
}

export function getCoverSummary(candidate, analysis) {
  const profile = getResistanceProfileForConfig(candidate, {fieldState: analysis.fieldState, side: "ally"});
  const threatTypes = getThreatTypes(analysis);
  const teamWeaknessTypes = analysis.weaknesses.map((entry) => entry.type);
  return {
    threatTypes,
    coveredThreats: threatTypes.filter((type) => (profile[type] ?? 1) < 1),
    immuneThreats: threatTypes.filter((type) => (profile[type] ?? 1) === 0),
    patchedWeaknesses: teamWeaknessTypes.filter((type) => (profile[type] ?? 1) < 1),
  };
}

export function getTopAverage(values = [], limit = 2) {
  if (!values.length) {
    return 0;
  }
  const topValues = [...values]
    .sort((left, right) => right - left)
    .slice(0, limit);
  return topValues.reduce((sum, value) => sum + value, 0) / topValues.length;
}
