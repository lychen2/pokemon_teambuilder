import {FALLBACK_LEVEL} from "./constants.js";
import {t} from "./i18n.js";
import {
  getBasePower,
  getConditionalAttackInfo,
  getConditionalBpInfo,
  getEffectiveType,
  getFinalDamageInfo,
  getHitCount,
  getItemPowerMultiplier,
  getOffenseStatKey,
  getRawMove,
  getRestrictedReasonIds,
  getSpreadMultiplier,
  getStabMultiplier,
  getStaticAttackMultiplier,
  getStaticBpMultiplier,
  isDamagingMove,
} from "./output-strength-rules.js";
import {hydrateConfigs} from "./showdown.js";

const OUTPUT_REFERENCE_SEEDS = Object.freeze([
  {
    id: "reference:kyogre-scarf",
    labelKey: "output.referenceKyogre",
    speciesId: "kyogre",
    speciesName: "Kyogre",
    displayName: "Kyogre",
    ability: "Drizzle",
    item: "Choice Scarf",
    nature: "Timid",
    championPoints: {hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32},
    moveNames: ["Water Spout", "Origin Pulse", "Ice Beam", "Thunder"],
  },
  {
    id: "reference:flutter-mane-specs",
    labelKey: "output.referenceFlutterMane",
    speciesId: "fluttermane",
    speciesName: "Flutter Mane",
    displayName: "Flutter Mane",
    ability: "Protosynthesis",
    item: "Choice Specs",
    nature: "Modest",
    championPoints: {hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32},
    moveNames: ["Moonblast", "Shadow Ball", "Dazzling Gleam", "Power Gem"],
  },
]);

function buildScore(offenseStat, attackMultiplier, powerMultiplier) {
  return offenseStat * attackMultiplier * powerMultiplier;
}

function normalizeMoveAccuracy(rawAccuracy) {
  if (rawAccuracy === true) return 100;
  const normalized = Number(rawAccuracy || 0);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}

function scoreMove(config, move, datasets) {
  const rawMove = getRawMove(move, datasets);
  if (!isDamagingMove(rawMove)) return null;
  const basePower = getBasePower(rawMove);
  if (!basePower) return null;
  const effectiveType = getEffectiveType(rawMove, config);
  const statKey = getOffenseStatKey(rawMove);
  const offenseStat = Number(config.stats?.[statKey] || 0);
  const staticAttackMultiplier = getStaticAttackMultiplier(config, statKey, effectiveType);
  const conditionalAttack = getConditionalAttackInfo(rawMove, config, statKey, effectiveType);
  const staticBpMultiplier = getStaticBpMultiplier(rawMove, config, effectiveType, basePower);
  const conditionalBp = getConditionalBpInfo(rawMove, config, statKey, effectiveType);
  const finalDamageInfo = getFinalDamageInfo(rawMove, config, effectiveType);
  const breakdown = {
    statKey,
    offenseStat,
    basePower,
    hitCount: getHitCount(rawMove, config),
    spreadMultiplier: getSpreadMultiplier(rawMove),
    stabMultiplier: getStabMultiplier(config, effectiveType),
    itemMultiplier: getItemPowerMultiplier(rawMove, config, effectiveType),
    baseAttackMultiplier: staticAttackMultiplier * conditionalAttack.baseMultiplier,
    attackMultiplier: staticAttackMultiplier * conditionalAttack.maxMultiplier,
    baseBpMultiplier: staticBpMultiplier * conditionalBp.baseMultiplier,
    bpMultiplier: staticBpMultiplier * conditionalBp.maxMultiplier,
    finalDamageMultiplier: finalDamageInfo.multiplier,
    triggerKey: conditionalAttack.triggerKey || conditionalBp.triggerKey || "",
    triggerSource: conditionalAttack.triggerSource || conditionalBp.triggerSource || "",
    specialCaseLabelKey: finalDamageInfo.labelKey,
  };
  const basePowerScore = breakdown.basePower
    * breakdown.hitCount
    * breakdown.spreadMultiplier
    * breakdown.stabMultiplier
    * breakdown.baseBpMultiplier
    * breakdown.itemMultiplier
    * breakdown.finalDamageMultiplier;
  const maxPowerScore = breakdown.basePower
    * breakdown.hitCount
    * breakdown.spreadMultiplier
    * breakdown.stabMultiplier
    * breakdown.bpMultiplier
    * breakdown.itemMultiplier
    * breakdown.finalDamageMultiplier;
  const baseScore = buildScore(offenseStat, breakdown.baseAttackMultiplier, basePowerScore);
  const maxScore = buildScore(offenseStat, breakdown.attackMultiplier, maxPowerScore);
  return {
    name: rawMove.name || move?.name || "",
    score: maxScore,
    baseScore,
    maxScore,
    accuracy: normalizeMoveAccuracy(rawMove.accuracy),
    isSpread: breakdown.spreadMultiplier < 1,
    restrictedReasonIds: getRestrictedReasonIds(rawMove),
    breakdown: {
      ...breakdown,
      effectiveType,
      effectiveOffense: offenseStat * breakdown.attackMultiplier,
      baseValue: baseScore,
      maxValue: maxScore,
    },
  };
}

function findAlternateTargetMove(moves, primaryMove) {
  return moves.find((move) => move.isSpread !== primaryMove.isSpread) || null;
}

function selectDisplayMoves(moves = [], predicate = () => true) {
  const eligible = moves.filter(predicate);
  if (!eligible.length) return [];
  const primaryMove = eligible[0];
  const alternateMove = findAlternateTargetMove(eligible, primaryMove);
  return alternateMove ? [primaryMove, alternateMove] : [primaryMove];
}

function buildDisplaySummary(moves = []) {
  const [primaryMove] = moves;
  return {
    moves,
    primaryMoveName: primaryMove?.name || "",
    primaryScore: primaryMove?.score || 0,
    primaryIsSpread: Boolean(primaryMove?.isSpread),
    primaryBreakdown: primaryMove?.breakdown || null,
    restrictedReasonIds: primaryMove?.restrictedReasonIds || [],
  };
}

function buildOutputEntry(config, datasets, index) {
  const scoredMoves = (config.moves || [])
    .map((move) => scoreMove(config, move, datasets))
    .filter(Boolean)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.name.localeCompare(right.name, "zh-Hans-CN");
    });
  if (!scoredMoves.length) return null;
  const peakMoves = buildDisplaySummary(selectDisplayMoves(scoredMoves));
  const stableMoves = buildDisplaySummary(selectDisplayMoves(scoredMoves, (entry) => entry.restrictedReasonIds.length === 0));
  return {
    ...config,
    peakMoves: peakMoves.moves,
    peakMoveName: peakMoves.primaryMoveName,
    peakScore: peakMoves.primaryScore,
    peakIsSpread: peakMoves.primaryIsSpread,
    peakBreakdown: peakMoves.primaryBreakdown,
    peakRestrictedReasonIds: peakMoves.restrictedReasonIds,
    stableMoves: stableMoves.moves,
    stableMoveName: stableMoves.primaryMoveName,
    stableScore: stableMoves.primaryScore,
    stableIsSpread: stableMoves.primaryIsSpread,
    stableBreakdown: stableMoves.primaryBreakdown,
    stableRestrictedReasonIds: [],
    isReference: Boolean(config.isOutputReference),
    referenceLabel: config.outputReferenceLabel || "",
    _outputIndex: index,
  };
}

function buildTierMap(entries = []) {
  const tiers = new Map();
  entries.forEach((entry) => {
    const score = Math.round(Number(entry.peakScore || 0));
    const list = tiers.get(score) || [];
    list.push(entry);
    tiers.set(score, list);
  });

  function dedupeTierEntries(scoreEntries = []) {
    const seenSpecies = new Set();
    return scoreEntries.filter((entry) => {
      const speciesKey = entry.speciesId || entry.speciesName || entry.displayName || "";
      if (seenSpecies.has(speciesKey)) return false;
      seenSpecies.add(speciesKey);
      return true;
    });
  }

  return [...tiers.entries()]
    .sort((left, right) => Number(right[0]) - Number(left[0]))
    .map(([score, scoreEntries]) => {
      const sortedEntries = [...scoreEntries].sort((left, right) => {
        if (right.peakScore !== left.peakScore) return right.peakScore - left.peakScore;
        if (left.isReference !== right.isReference) return left.isReference ? -1 : 1;
        return left._outputIndex - right._outputIndex;
      });
      const uniqueEntries = dedupeTierEntries(sortedEntries);
      return {score: Number(score), totalCount: uniqueEntries.length, entries: uniqueEntries};
    });
}

function buildReferenceSeeds(language) {
  return OUTPUT_REFERENCE_SEEDS.map((entry) => ({
    ...entry,
    note: t(language, "output.referenceNote"),
    outputReferenceLabel: t(language, entry.labelKey),
    isOutputReference: true,
  }));
}

export function buildOutputReferenceConfigs(datasets, language = "zh") {
  if (!datasets) return [];
  return hydrateConfigs(buildReferenceSeeds(language), datasets, FALLBACK_LEVEL).map((config, index) => ({
    ...config,
    id: OUTPUT_REFERENCE_SEEDS[index]?.id || config.id,
    isOutputReference: true,
    outputReferenceLabel: t(language, OUTPUT_REFERENCE_SEEDS[index]?.labelKey || "output.referenceNote"),
  }));
}

export function calculateOutputStrengthTiers(configs = [], datasets) {
  if (!datasets) return [];
  return buildTierMap(configs.map((config, index) => buildOutputEntry(config, datasets, index)).filter(Boolean));
}
