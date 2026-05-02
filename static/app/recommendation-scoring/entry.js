import {SCORE_WEIGHTS} from "../constants.js";
import {getResistanceProfileForConfig} from "../battle-semantics.js";
import {t} from "../i18n.js";
import {hasMove} from "../team-roles.js";
import {clamp, getBattleEquivalentSpeciesId, getTypeLabel, normalizeName} from "../utils.js";
import {enrichCandidateForScoring} from "./candidate.js";
import {scoreCounterChain} from "./counter-chain.js";
import {getCoverSummary} from "./helpers.js";
import {buildQualityBreakdown} from "./quality.js";
import {buildRecommendationAxisSnapshot} from "./score-mix.js";
import {scoreCoverage, scoreFocus, scoreResistance, scoreSpeed, scoreSynergy} from "./score-breakdowns.js";
import {buildTeammateUsageSummary} from "./teammates.js";
const ITEM_CONFLICT_PENALTY = 0.82;

function counterTargetLabel(entry, language) {
  return language === "zh" ? entry.localizedLabel || entry.label : entry.label;
}

function getItemConflictMembers(team = [], candidate = {}) {
  const itemId = normalizeName(candidate.item);
  if (!itemId) {
    return [];
  }
  return team.filter((member) => normalizeName(member.item) === itemId);
}

function createInsightItem(kind, score, label, detail = "") {
  return {
    kind,
    score: Number(score || 0),
    label,
    detail: detail || label,
  };
}

function sortInsightItems(left, right) {
  return right.score - left.score
    || String(left.label || "").localeCompare(String(right.label || ""), "zh-Hans-CN");
}

function buildReasonItems(candidate, breakdown, context = {}) {
  const {analysis, focusType = "", language = "zh", datasets} = context;
  const localizedSpeciesNames = datasets?.localizedSpeciesNames;
  const localizeMember = (member = {}) => {
    if (localizedSpeciesNames && member.speciesId) {
      const localized = localizedSpeciesNames.get(member.speciesId);
      if (localized) return localized;
    }
    return member.displayName || member.speciesName || member.speciesId || "";
  };
  const coverSummary = getCoverSummary(candidate, analysis);
  const reasons = [];
  if (focusType && breakdown.focus >= 2) {
    reasons.push(createInsightItem(
      "focus",
      breakdown.focus,
      t(language, "recommend.reason.focusType", {value: getTypeLabel(focusType, language)}),
      t(language, "recommend.focus", {value: breakdown.focus.toFixed(1)}),
    ));
  }
  if (coverSummary.coveredThreats.length) {
    reasons.push(createInsightItem(
      "coverThreats",
      coverSummary.coveredThreats.length + breakdown.resistance * 0.5,
      t(language, "recommend.reason.coverThreats", {
        value: coverSummary.coveredThreats.map((type) => getTypeLabel(type, language)).join(" / "),
      }),
      `${t(language, "recommend.resistance", {value: breakdown.resistance.toFixed(1)})} / ${t(language, "recommend.coverage", {value: breakdown.coverage.toFixed(1)})}`,
    ));
  }
  if (breakdown.resistance >= 3.5) {
    reasons.push(createInsightItem(
      "resistance",
      breakdown.resistance,
      t(language, "recommend.reason.resistance"),
      t(language, "recommend.resistance", {value: breakdown.resistance.toFixed(1)}),
    ));
  }
  if (breakdown.coverage >= 2.5) {
    reasons.push(createInsightItem(
      "coverage",
      breakdown.coverage,
      t(language, "recommend.reason.coverage"),
      t(language, "recommend.coverage", {value: breakdown.coverage.toFixed(1)}),
    ));
  }
  if (breakdown.speed >= 2.2) {
    const speed = candidate.stats?.spe || 0;
    const isTrickRoomFit = hasMove(candidate, "trickroom") && speed <= Number(analysis.speedContext?.medianSpeed || 0);
    reasons.push(createInsightItem(
      "speed",
      breakdown.speed,
      isTrickRoomFit ? t(language, "recommend.reason.trickRoom", {speed}) : t(language, "recommend.reason.speed", {speed}),
      t(language, "recommend.speed", {value: breakdown.speed.toFixed(1)}),
    ));
  }
  if (breakdown.synergy >= 1.8) {
    reasons.push(createInsightItem(
      "synergy",
      breakdown.synergy,
      t(language, "recommend.reason.synergy"),
      t(language, "recommend.synergy", {value: breakdown.synergy.toFixed(1)}),
    ));
  }
  if (breakdown.teammates >= 1 && candidate.teammateMatches?.length) {
    reasons.push(createInsightItem(
      "teammates",
      breakdown.teammates,
      t(language, "recommend.reason.teammates", {
        value: candidate.teammateMatches.map((entry) => localizeMember(entry.member)).join(" / "),
      }),
      t(language, "recommend.teammates", {value: breakdown.teammates.toFixed(1)}),
    ));
  }
  if (breakdown.counterChain >= 2.5 && candidate.counterChain?.targets?.length) {
    reasons.push(createInsightItem(
      "counterChain",
      breakdown.counterChain,
      t(language, "recommend.reason.counterChain", {
        value: candidate.counterChain.targets.map((entry) => counterTargetLabel(entry, language)).join(" / "),
      }),
      t(language, "recommend.counterChain", {value: breakdown.counterChain.toFixed(1)}),
    ));
  }
  if (breakdown.quality >= 1.4) {
    reasons.push(createInsightItem(
      "quality",
      breakdown.quality,
      t(language, "recommend.reason.quality"),
      t(language, "recommend.quality", {value: breakdown.quality.toFixed(1)}),
    ));
  }
  if (!reasons.length) {
    reasons.push(createInsightItem("balance", 0.1, t(language, "recommend.reason.balance")));
  }
  return reasons.sort(sortInsightItems);
}

function buildPenaltyItems(candidate, context = {}) {
  const {team = [], analysis, focusType = "", language = "zh"} = context;
  const teamTypes = new Set(team.flatMap((member) => member.types || []));
  const duplicateTypes = (candidate.types || []).filter((type) => teamTypes.has(type));
  const resistanceProfile = getResistanceProfileForConfig(candidate, {fieldState: analysis.fieldState, side: "ally"});
  const penalties = [];
  if (duplicateTypes.length) {
    penalties.push(createInsightItem(
      "duplicateTypes",
      duplicateTypes.length + 0.5,
      t(language, "recommend.penalty.duplicateTypes", {
        value: duplicateTypes.map((type) => getTypeLabel(type, language)).join(" / "),
      }),
    ));
  }
  if (focusType && (resistanceProfile[focusType] ?? 1) > 1) {
    penalties.push(createInsightItem(
      "focusWeak",
      resistanceProfile[focusType] ?? 1,
      t(language, "recommend.penalty.focusWeak", {value: getTypeLabel(focusType, language)}),
    ));
  }
  if (analysis.weaknesses.length && !getCoverSummary(candidate, analysis).coveredThreats.length) {
    penalties.push(createInsightItem("noPatch", 1.2, t(language, "recommend.penalty.noPatch")));
  }
  if (candidate.itemConflictMembers?.length) {
    penalties.push(createInsightItem(
      "itemConflict",
      candidate.itemConflictMembers.length + 0.8,
      t(language, "recommend.penalty.itemConflict", {value: candidate.item}),
    ));
  }
  return penalties.sort(sortInsightItems).slice(0, 2);
}

function buildWeaknessHelp(candidate, analysis, language) {
  const coverSummary = getCoverSummary(candidate, analysis);
  if (coverSummary.coveredThreats.length) {
    return coverSummary.coveredThreats.map((type) => getTypeLabel(type, language)).slice(0, 3);
  }
  const resistanceProfile = getResistanceProfileForConfig(candidate, {fieldState: analysis.fieldState, side: "ally"});
  return analysis.weaknesses.map((entry) => {
    const multiplier = resistanceProfile[entry.type] ?? 1;
    return `${getTypeLabel(entry.type, language)} ${multiplier}x`;
  }).slice(0, 3);
}

export function buildRecommendationEntry(candidate, context = {}) {
  const {
    team = [],
    analysis,
    speedTiers = [],
    language = "zh",
    preferences = {},
    weights = {},
    scoreMix = {},
    datasets,
    focusType = "",
    counterChain: counterChainContext,
    roleContext,
  } = context;
  const scoringCandidate = enrichCandidateForScoring(candidate, datasets);
  const qualityBreakdown = buildQualityBreakdown(scoringCandidate);
  const usageTeammates = buildTeammateUsageSummary(team, scoringCandidate, datasets);
  const counterChain = scoreCounterChain(scoringCandidate, counterChainContext);
  const itemConflictMembers = getItemConflictMembers(team, scoringCandidate);
  const breakdown = {
    resistance: scoreResistance(scoringCandidate, analysis, preferences, weights),
    coverage: scoreCoverage(scoringCandidate, analysis, preferences, weights, datasets),
    speed: scoreSpeed(scoringCandidate, speedTiers, analysis, preferences, weights),
    synergy: scoreSynergy(team, scoringCandidate, analysis, preferences, weights, roleContext),
    teammates: clamp(usageTeammates.score, 0, SCORE_WEIGHTS.teammates),
    quality: qualityBreakdown.total,
    focus: scoreFocus(scoringCandidate, focusType),
    counterChain: counterChain.score,
  };
  const floorPenaltyBase = breakdown.resistance < 1 || breakdown.coverage < 1 ? 0.3 : 1;
  const floorPenalty = itemConflictMembers.length
    ? floorPenaltyBase * ITEM_CONFLICT_PENALTY
    : floorPenaltyBase;
  const coverSummary = getCoverSummary(scoringCandidate, analysis);
  const reasonItems = buildReasonItems(
    {
      ...scoringCandidate,
      teammateMatches: usageTeammates.matches,
      counterChain,
    },
    breakdown,
    context,
  );
  const penaltyItems = buildPenaltyItems(
    {
      ...scoringCandidate,
      itemConflictMembers,
    },
    context,
  );
  const result = {
    ...scoringCandidate,
    battleEquivalentSpeciesId: getBattleEquivalentSpeciesId(scoringCandidate.speciesId, datasets),
    recommendationKey: `${candidate.source || "library"}:${candidate.id}`,
    recommendationScore: 0,
    recommendationFloorPenalty: floorPenalty,
    recommendationAxes: buildRecommendationAxisSnapshot(breakdown),
    coveredThreats: coverSummary.coveredThreats,
    breakdown,
    counterChain,
    teammateMatches: usageTeammates.matches,
    itemConflictMembers,
    qualityBreakdown,
    scoreMix,
    reasonItems,
    penaltyItems,
  };
  return {
    ...result,
    reasons: reasonItems.map((item) => item.label),
    penalties: penaltyItems.map((item) => item.label),
    weaknessHelp: buildWeaknessHelp(result, analysis, language),
  };
}
