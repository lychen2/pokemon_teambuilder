import {TYPE_CHART, TYPE_ORDER} from "./constants.js";
import {t} from "./i18n.js";
import {getTypeLabel, normalizeName, uniqueStrings} from "./utils.js";

const TRICK_ROOM_MOVE = "trickroom";
const SPEED_MODE_STANDARD = "standard";
const SPEED_MODE_TRICK_ROOM = "trickroom";
const SPEED_MODE_HYBRID = "hybrid";
const SPEED_PREVIEW_LIMIT = 3;
const THREAT_PREVIEW_LIMIT = 3;
const SUPER_EFFECTIVE_THRESHOLD = 2;
const BLIND_SPOT_THRESHOLD = 0.5;
const DEFENSIVE_TYPE_PAIRS = buildDefensiveTypePairs();

function hasMove(config, moveName) {
  const target = normalizeName(moveName);
  return (config.moveNames || config.moves?.map((move) => move.name) || [])
    .some((name) => normalizeName(name) === target);
}

function getMedianSpeed(speedTiers = []) {
  const totalCount = speedTiers.reduce((sum, tier) => sum + tier.totalCount, 0);
  if (!totalCount) return 0;
  let seen = 0;
  const midpoint = totalCount / 2;
  for (const tier of [...speedTiers].sort((left, right) => left.speed - right.speed)) {
    seen += tier.totalCount;
    if (seen >= midpoint) return tier.speed;
  }
  return speedTiers[0]?.speed || 0;
}

export function getSpeedContext(team = [], speedTiers = []) {
  const medianSpeed = getMedianSpeed(speedTiers);
  const setterCount = team.filter((config) => hasMove(config, TRICK_ROOM_MOVE)).length;
  const slowCount = team.filter((config) => (config.stats?.spe || 0) <= medianSpeed).length;
  const fastCount = team.length - slowCount;
  if (setterCount && slowCount >= fastCount) {
    return {mode: SPEED_MODE_TRICK_ROOM, medianSpeed, setterCount};
  }
  if (setterCount) {
    return {mode: SPEED_MODE_HYBRID, medianSpeed, setterCount};
  }
  return {mode: SPEED_MODE_STANDARD, medianSpeed, setterCount};
}

export function getResistanceProfile(types = []) {
  return Object.fromEntries(
    TYPE_ORDER.map((attackType) => {
      return [attackType, getAttackMultiplier(attackType, types)];
    }),
  );
}

export function getCoverageProfile(moveTypes = []) {
  return Object.fromEntries(
    TYPE_ORDER.map((defendType) => {
      return [defendType, getBestAttackMultiplier(moveTypes, [defendType])];
    }),
  );
}

function getAttackMultiplier(attackType, defendTypes = []) {
  return defendTypes.reduce((total, defendType) => {
    const next = TYPE_CHART[attackType]?.[defendType];
    return total * (next ?? 1);
  }, 1);
}

function getBestAttackMultiplier(attackTypes = [], defendTypes = []) {
  return attackTypes.reduce(
    (maxValue, attackType) => Math.max(maxValue, getAttackMultiplier(attackType, defendTypes)),
    0,
  );
}

function buildDefensiveTypePairs() {
  const pairs = [];
  for (let leftIndex = 0; leftIndex < TYPE_ORDER.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < TYPE_ORDER.length; rightIndex += 1) {
      pairs.push([TYPE_ORDER[leftIndex], TYPE_ORDER[rightIndex]]);
    }
  }
  return pairs;
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

function summarizeOffensivePairs(team, language) {
  const teamMoveTypes = uniqueStrings(team.flatMap((config) => config.offensiveTypes || []));
  return DEFENSIVE_TYPE_PAIRS
    .map((types) => ({
      types,
      label: types.map((type) => getTypeLabel(type, language)).join(" / "),
      effectiveness: getBestAttackMultiplier(teamMoveTypes, types),
    }))
    .filter((entry) => entry.effectiveness <= BLIND_SPOT_THRESHOLD)
    .sort((left, right) => (
      left.effectiveness - right.effectiveness
      || left.label.localeCompare(right.label, "zh-Hans-CN")
    ));
}

function getSortedSpeedTiers(speedTiers = []) {
  return [...speedTiers].sort((left, right) => left.speed - right.speed);
}

function createTierReference(tier, language) {
  const entry = tier?.entries?.[0];
  if (!tier || !entry) {
    return null;
  }
  return {
    speed: tier.speed,
    label: entry.speciesName || entry.displayName || entry.speciesLabel || t(language, "common.unknown"),
    note: entry.note || "",
  };
}

function getThreatSpeed(candidate) {
  return Math.max(
    Number(candidate.stats?.spe || 0),
    Number(candidate.plusOneSpeed?.speed || 0),
    Number(candidate.choiceScarfSpeed?.speed || 0),
  );
}

function summarizePressureThreats(config, library = [], selectedSpeciesIds = new Set(), language = "zh") {
  const memberSpeed = Number(config.stats?.spe || 0);
  return library
    .filter((candidate) => (
      candidate.id !== config.id
      && candidate.speciesId !== config.speciesId
      && !selectedSpeciesIds.has(candidate.speciesId)
    ))
    .map((candidate) => ({
      label: candidate.speciesName || candidate.displayName || t(language, "common.unknown"),
      note: candidate.note || "",
      speed: getThreatSpeed(candidate),
      effectiveness: getBestAttackMultiplier(candidate.offensiveTypes || [], config.types || []),
    }))
    .filter((candidate) => candidate.speed > memberSpeed && candidate.effectiveness >= SUPER_EFFECTIVE_THRESHOLD)
    .sort((left, right) => (
      right.effectiveness - left.effectiveness
      || left.speed - right.speed
      || left.label.localeCompare(right.label, "zh-Hans-CN")
    ))
    .slice(0, THREAT_PREVIEW_LIMIT);
}

function summarizeSpeed(team, speedTiers, language, speedContext, library) {
  const sortedSpeedTiers = getSortedSpeedTiers(speedTiers);
  const selectedSpeciesIds = new Set(team.map((config) => config.speciesId).filter(Boolean));
  return [...team]
    .sort((left, right) => (right.stats?.spe || 0) - (left.stats?.spe || 0))
    .map((config) => {
      const speed = config.stats?.spe || 0;
      const slowerTiers = sortedSpeedTiers.filter((tier) => tier.speed < speed);
      const fasterTiers = sortedSpeedTiers.filter((tier) => tier.speed > speed);
      return {
        id: config.id,
        label: config.displayName,
        note: config.note || "",
        speed,
        isTrickRoomSetter: hasMove(config, TRICK_ROOM_MOVE),
        aheadOf: slowerTiers.slice(-SPEED_PREVIEW_LIMIT).reverse().map((tier) => createTierReference(tier, language)).filter(Boolean),
        nextThreat: createTierReference(fasterTiers[0], language),
        trickRoomAheadOf: speedContext.mode === SPEED_MODE_STANDARD
          ? []
          : fasterTiers.slice(0, SPEED_PREVIEW_LIMIT).map((tier) => createTierReference(tier, language)).filter(Boolean),
        pressureThreats: summarizePressureThreats(config, library, selectedSpeciesIds, language),
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

export function analyzeTeam(team, speedTiers = [], language = "zh", library = []) {
  if (!team.length) {
    return null;
  }

  const defensive = summarizeDefensive(team, language);
  const offensive = summarizeOffensive(team, language);
  const offensivePairs = summarizeOffensivePairs(team, language);
  const structure = summarizeStructure(team, language);
  const speedContext = getSpeedContext(team, speedTiers);
  return {
    defensive,
    offensive,
    offensivePairs,
    speed: summarizeSpeed(team, speedTiers, language, speedContext, library),
    speedContext,
    structure,
    weaknesses: defensive.filter((entry) => entry.average > 1.15).slice(0, 6),
    blindSpots: offensivePairs.slice(0, 8),
  };
}
