import {TYPE_CHART, TYPE_ORDER} from "./constants.js";
import {t} from "./i18n.js";
import {getTypeLabel, uniqueStrings} from "./utils.js";

export function getResistanceProfile(types = []) {
  return Object.fromEntries(
    TYPE_ORDER.map((attackType) => {
      const multiplier = types.reduce((total, defendType) => {
        const next = TYPE_CHART[attackType]?.[defendType];
        return total * (next ?? 1);
      }, 1);
      return [attackType, multiplier];
    }),
  );
}

export function getCoverageProfile(moveTypes = []) {
  return Object.fromEntries(
    TYPE_ORDER.map((defendType) => {
      const best = moveTypes.reduce((maxValue, attackType) => {
        const effect = TYPE_CHART[attackType]?.[defendType] ?? 1;
        return Math.max(maxValue, effect);
      }, 0);
      return [defendType, best];
    }),
  );
}

function summarizeDefensive(team, language) {
  return TYPE_ORDER.map((attackType) => {
    const multipliers = team.map((config) => getResistanceProfile(config.types)[attackType] || 1);
    const average = multipliers.reduce((total, value) => total + value, 0) / Math.max(team.length, 1);
    return {
      type: attackType,
      label: getTypeLabel(attackType, language),
      average,
      weakCount: multipliers.filter((value) => value > 1).length,
      resistCount: multipliers.filter((value) => value < 1 && value > 0).length,
      immuneCount: multipliers.filter((value) => value === 0).length,
    };
  }).sort((left, right) => right.average - left.average);
}

function summarizeOffensive(team, language) {
  const teamMoveTypes = uniqueStrings(team.flatMap((config) => config.offensiveTypes || []));
  const coverage = getCoverageProfile(teamMoveTypes);
  return TYPE_ORDER.map((defendType) => ({
    type: defendType,
    label: getTypeLabel(defendType, language),
    effectiveness: coverage[defendType] || 0,
  })).sort((left, right) => right.effectiveness - left.effectiveness);
}

function summarizeSpeed(team, speedTiers, language) {
  return [...team]
    .sort((left, right) => (right.stats?.spe || 0) - (left.stats?.spe || 0))
    .map((config) => {
      const speed = config.stats?.spe || 0;
      const fasterThan = speedTiers.filter((tier) => tier.speed < speed).slice(0, 3);
      const slowerThan = speedTiers.find((tier) => tier.speed > speed);
      return {
        id: config.id,
        label: config.displayLabel || config.displayName,
        speed,
        aheadOf: fasterThan.map((tier) => `${tier.speed} (${tier.entries[0]?.speciesLabel || tier.entries[0]?.displayLabel || tier.entries[0]?.speciesName || t(language, "common.unknown")})`),
        nextThreat: slowerThan
          ? `${slowerThan.speed} (${slowerThan.entries[0]?.speciesLabel || slowerThan.entries[0]?.displayLabel || slowerThan.entries[0]?.speciesName || t(language, "common.unknown")})`
          : t(language, "analysis.fastest"),
      };
    });
}

function summarizeStructure(team, language) {
  const moveCategories = team.flatMap((config) => config.moves || []).map((move) => move.category);
  const typeSpread = team.flatMap((config) => config.types || []);
  return {
    physical: moveCategories.filter((category) => category === "Physical").length,
    special: moveCategories.filter((category) => category === "Special").length,
    support: moveCategories.filter((category) => category === "Status").length,
    duplicateTypes: Object.entries(
      typeSpread.reduce((counts, type) => ({...counts, [type]: (counts[type] || 0) + 1}), {}),
    )
      .filter(([, count]) => count > 1)
      .map(([type, count]) => `${getTypeLabel(type, language)}×${count}`),
  };
}

export function analyzeTeam(team, speedTiers = [], language = "zh") {
  if (!team.length) {
    return null;
  }

  const defensive = summarizeDefensive(team, language);
  const offensive = summarizeOffensive(team, language);
  const structure = summarizeStructure(team, language);
  return {
    defensive,
    offensive,
    speed: summarizeSpeed(team, speedTiers, language),
    structure,
    weaknesses: defensive.filter((entry) => entry.average > 1.15).slice(0, 6),
    blindSpots: offensive.filter((entry) => entry.effectiveness <= 1).slice(0, 8),
  };
}
