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

/**
 * Per-config raw weight a "+1 reachable" variant earns. Speed Boost and
 * Tailwind both have setup cost (one turn / Tailwind setter must move),
 * so the "+1 active" state is on-screen ~half the relevant turns. The
 * remaining 0.5 stays at base. Scarf, by contrast, is always-on (1.0).
 */
const PLUS_ONE_ACTIVATION_WEIGHT = 0.5;

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

/**
 * Decompose one config into its weighted speed-mode variants.
 *
 * Each config contributes total raw weight 1.0 spread across its modes:
 * - plain non-scarf, no +1 capability: 1 variant @ base_spe weight 1
 * - non-scarf with +1 (Speed Boost ability or Tailwind/Agility-class move):
 *     2 variants — base_spe @ 0.5, +1_spe @ 0.5 (the +1 mode pays half-weight
 *     for setup cost: Speed Boost needs a turn, Tailwind needs a setter)
 * - plain scarf, no +1 on top: 1 variant @ scarf_spe weight 1 (always-on)
 * - scarf with +1 capability (rare, e.g. Scarf user with self-Tailwind via
 *     a partner): 2 variants — scarf_spe @ 0.5, scarf_spe×1.5 @ 0.5
 *
 * Returned variants will be aggregated per-species and renormalized so each
 * species's total contribution to the population sample equals 1. That
 * encodes "within-library usage rate" automatically: a species with 4 of
 * 10 configs scarfed lands ~0.4 weight on the scarf value, ~0.6 on
 * non-scarf modes, summing to 1.
 */
function getConfigSpeedContribution(config = {}) {
  const baseSpe = Number(config.stats?.spe || config.baseStats?.spe || 0);
  const scarfSpe = Number(config.choiceScarfSpeed?.speed || 0);
  const plusOneSpe = Number(config.plusOneSpeed?.speed || 0);
  const doubleSpe = Number(config.doubleSpeed?.speed || 0);

  const isScarf = scarfSpe > 0;
  // Speed Boost ability and Quick-Feet/Unburden double-speed compress into
  // the same "reachable +1 class" — pick whichever is higher.
  const plusOneReach = Math.max(plusOneSpe, doubleSpe);
  const hasPlusOne = plusOneReach > 0;

  if (isScarf) {
    if (hasPlusOne) {
      return [
        {value: scarfSpe, weight: PLUS_ONE_ACTIVATION_WEIGHT},
        {value: scarfSpe * 1.5, weight: PLUS_ONE_ACTIVATION_WEIGHT},
      ];
    }
    return [{value: scarfSpe, weight: 1}];
  }
  if (hasPlusOne && baseSpe > 0) {
    return [
      {value: baseSpe, weight: PLUS_ONE_ACTIVATION_WEIGHT},
      {value: plusOneReach, weight: PLUS_ONE_ACTIVATION_WEIGHT},
    ];
  }
  if (baseSpe > 0) return [{value: baseSpe, weight: 1}];
  return [];
}

function bySpecies(configs = []) {
  const groups = new Map();
  for (const config of configs) {
    const id = config.speciesId || normalizeName(config.speciesName || config.displayName || "");
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(config);
  }
  return groups;
}

/**
 * Build the speed-axis sample distribution.
 *
 * For each species in the library we collect every config's mode-weighted
 * variants, sum them, then renormalize so the species's total weight in
 * the population sample is exactly 1.0. This means the global denominator
 * is exactly `species_count`; "Garchomp with 8 builds" doesn't outweigh
 * "Whimsicott with 1 build". Within each species, distribution across
 * variants matches the within-library usage rate × per-mode activation
 * (Scarf 1.0, +1 0.5).
 */
function buildSpeedSamples(configs) {
  const samples = [];
  for (const group of bySpecies(configs).values()) {
    const variants = group.flatMap((config) => getConfigSpeedContribution(config));
    const total = variants.reduce((sum, variant) => sum + variant.weight, 0);
    if (total <= 0) continue;
    for (const variant of variants) {
      samples.push({value: variant.value, weight: variant.weight / total});
    }
  }
  return samples;
}

/**
 * Pick one representative config per species for non-speed axes (atk / spa
 * / bulk). The same +1-modal complexity doesn't apply to Attack / Defense,
 * so a single canonical "most-frequent build, fastest tiebreak" stands in
 * cleanly. Kept as its own helper because mode-weighting is speed-only.
 */
function pickSpeciesRepresentatives(configs = []) {
  const representatives = [];
  for (const group of bySpecies(configs).values()) {
    const fingerprintCounts = new Map();
    for (const config of group) {
      const stats = config.stats || config.baseStats || {};
      const fp = [
        Math.round(Number(stats.hp || 0)),
        Math.round(Number(stats.atk || 0)),
        Math.round(Number(stats.def || 0)),
        Math.round(Number(stats.spa || 0)),
        Math.round(Number(stats.spd || 0)),
        Math.round(Number(stats.spe || 0)),
        normalizeName(config.item || ""),
        normalizeName(config.ability || ""),
        normalizeName(config.nature || ""),
      ].join("|");
      const entry = fingerprintCounts.get(fp) || {count: 0, config, speed: Number(stats.spe || 0)};
      entry.count += 1;
      fingerprintCounts.set(fp, entry);
    }
    let best = null;
    for (const entry of fingerprintCounts.values()) {
      if (!best
          || entry.count > best.count
          || (entry.count === best.count && entry.speed > best.speed)) {
        best = entry;
      }
    }
    if (best?.config) representatives.push(best.config);
  }
  return representatives;
}

function buildSamples(configs = []) {
  const reps = pickSpeciesRepresentatives(configs);
  const flatPerRep = (project) => reps
    .map((config) => ({value: Number(project(config) || 0), weight: 1}))
    .filter((sample) => sample.value > 0);
  return {
    speed: buildSpeedSamples(configs),
    atk: flatPerRep((config) => getAttackValue(config, "atk", "Physical")),
    spa: flatPerRep((config) => getAttackValue(config, "spa", "Special")),
    physBulk: flatPerRep((config) => getBulkValue(config, "def")),
    spBulk: flatPerRep((config) => getBulkValue(config, "spd")),
  };
}

/**
 * Weighted percentile: (sum of weights with sample.value <= candidate)
 * divided by total sample weight. Returns null on empty samples or
 * non-finite candidate so callers can render an honest "—". The result
 * can exceed 1.0 when the candidate outpaces every population sample —
 * the Scarf-on-candidate case the renderer prints as "100%+" to keep
 * the mechanic visible.
 */
function getRank(value, samples = []) {
  if (!samples.length || !Number.isFinite(value)) return null;
  let coveredWeight = 0;
  let totalWeight = 0;
  for (const sample of samples) {
    const weight = Number(sample?.weight || 0);
    if (weight <= 0) continue;
    totalWeight += weight;
    if (Number(sample.value) <= value) coveredWeight += weight;
  }
  if (totalWeight <= 0) return null;
  return coveredWeight / totalWeight;
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
  // Candidate's speed reads as `getEffectiveSpeed` — the maximum across
  // base / +1 / Scarf / double — so a Scarf'd or Speed-Boost'd config
  // shows the speed advantage it actually plays at. Population variants
  // include Scarf weighted by usage rate, so Scarf'd candidates that
  // outpace every realistic non-Scarf state can read above 100%.
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
