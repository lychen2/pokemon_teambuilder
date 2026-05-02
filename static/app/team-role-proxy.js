import {getEffectiveSpeed} from "./battle-semantics.js";
import {normalizeName} from "./utils.js";

const EMPTY_CONTEXT = Object.freeze({
  available: false,
  unavailableReasonKey: "analysis.roleProxyUnavailable.emptyLibrary",
  samples: Object.freeze({speed: [], atk: [], spa: [], physBulk: [], spBulk: []}),
});
const MISSING_SAMPLE_CONTEXT = Object.freeze({
  available: false,
  unavailableReasonKey: "analysis.roleProxyUnavailable.missingSamples",
  samples: EMPTY_CONTEXT.samples,
});

const CHOICE_BAND = "choiceband";
const CHOICE_SPECS = "choicespecs";
const LIFE_ORB = "lifeorb";
const ASSAULT_VEST = "assaultvest";
const POWER_ITEM_MULTIPLIERS = Object.freeze({
  [CHOICE_BAND]: {atk: 1.5, spa: 1},
  [CHOICE_SPECS]: {atk: 1, spa: 1.5},
  [LIFE_ORB]: {atk: 1.3, spa: 1.3},
});
const ASSAULT_VEST_SP_BULK_MULTIPLIER = 1.5;
const DEFAULT_MOVE_POWER = 1;

function getItemId(config = {}) {
  return normalizeName(config.item);
}

function getMovePower(move = {}, category) {
  if (move.category !== category) return 0;
  return Math.max(Number(move.basePower || 0), DEFAULT_MOVE_POWER);
}

function getBestMovePower(config = {}, category) {
  return Math.max(
    DEFAULT_MOVE_POWER,
    ...(config.moves || []).map((move) => getMovePower(move, category)),
  );
}

function getItemMultiplier(config = {}, statKey) {
  const multipliers = POWER_ITEM_MULTIPLIERS[getItemId(config)];
  return Number(multipliers?.[statKey] || 1);
}

function getAttackValue(config = {}, statKey, category) {
  const stats = config.stats || config.baseStats || {};
  return Number(stats[statKey] || 0) * getBestMovePower(config, category) * getItemMultiplier(config, statKey);
}

function getBulkValue(config = {}, defenseKey) {
  const stats = config.stats || config.baseStats || {};
  const itemMultiplier = defenseKey === "spd" && getItemId(config) === ASSAULT_VEST
    ? ASSAULT_VEST_SP_BULK_MULTIPLIER
    : 1;
  return Number(stats.hp || 0) * Number(stats[defenseKey] || 0) * itemMultiplier;
}

function buildSamples(configs = []) {
  return {
    speed: configs.map((config) => getEffectiveSpeed(config, "ally")).filter((value) => value > 0),
    atk: configs.map((config) => getAttackValue(config, "atk", "Physical")).filter((value) => value > 0),
    spa: configs.map((config) => getAttackValue(config, "spa", "Special")).filter((value) => value > 0),
    physBulk: configs.map((config) => getBulkValue(config, "def")).filter((value) => value > 0),
    spBulk: configs.map((config) => getBulkValue(config, "spd")).filter((value) => value > 0),
  };
}

function getRank(value, samples = []) {
  if (!samples.length || !Number.isFinite(value)) return null;
  const covered = samples.filter((sample) => sample <= value).length;
  return covered / samples.length;
}

export function createRoleContext(library = []) {
  if (!library.length) return EMPTY_CONTEXT;
  const samples = buildSamples(library);
  const hasSamples = Object.values(samples).some((values) => values.length);
  if (!hasSamples) return MISSING_SAMPLE_CONTEXT;
  return {
    available: true,
    unavailableReasonKey: "",
    samples,
  };
}

export function getEstimatedRoleMetrics(config = {}, roleContext = EMPTY_CONTEXT) {
  if (!roleContext?.available) {
    return {available: false, unavailableReasonKey: roleContext?.unavailableReasonKey || EMPTY_CONTEXT.unavailableReasonKey};
  }
  const samples = roleContext.samples || EMPTY_CONTEXT.samples;
  const speed = getEffectiveSpeed(config, "ally");
  const atk = getAttackValue(config, "atk", "Physical");
  const spa = getAttackValue(config, "spa", "Special");
  return {
    available: true,
    estimatedSpeedRank: getRank(speed, samples.speed),
    estimatedAtkRank: getRank(atk, samples.atk),
    estimatedSpaRank: getRank(spa, samples.spa),
    estimatedPhysBulkRank: getRank(getBulkValue(config, "def"), samples.physBulk),
    estimatedSpBulkRank: getRank(getBulkValue(config, "spd"), samples.spBulk),
    estimatedAtkValue: atk,
    estimatedSpaValue: spa,
  };
}
