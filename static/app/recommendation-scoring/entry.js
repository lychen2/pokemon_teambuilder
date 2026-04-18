import {SCORE_WEIGHTS} from "../constants.js";
import {getResistanceProfile} from "../analysis.js";
import {t} from "../i18n.js";
import {hasMove} from "../team-roles.js";
import {clamp, getTypeLabel} from "../utils.js";
import {enrichCandidateForScoring} from "./candidate.js";
import {getCoverSummary} from "./helpers.js";
import {buildQualityBreakdown} from "./quality.js";
import {scoreCoverage, scoreFocus, scoreResistance, scoreSpeed, scoreSynergy} from "./score-breakdowns.js";
import {buildTeammateUsageSummary} from "./teammates.js";

function buildReasons(candidate, breakdown, language, analysis, focusType = "") {
  const coverSummary = getCoverSummary(candidate, analysis);
  const reasons = [];
  if (focusType && breakdown.focus >= 2) {
    reasons.push(t(language, "recommend.reason.focusType", {value: getTypeLabel(focusType, language)}));
  }
  if (coverSummary.coveredThreats.length) {
    reasons.push(t(language, "recommend.reason.coverThreats", {
      value: coverSummary.coveredThreats.map((type) => getTypeLabel(type, language)).join(" / "),
    }));
  }
  if (breakdown.resistance >= 3.5) reasons.push(t(language, "recommend.reason.resistance"));
  if (breakdown.coverage >= 2.5) reasons.push(t(language, "recommend.reason.coverage"));
  if (breakdown.speed >= 2.2) {
    const speed = candidate.stats?.spe || 0;
    const isTrickRoomFit = hasMove(candidate, "trickroom") && speed <= Number(analysis.speedContext?.medianSpeed || 0);
    reasons.push(isTrickRoomFit ? t(language, "recommend.reason.trickRoom", {speed}) : t(language, "recommend.reason.speed", {speed}));
  }
  if (breakdown.synergy >= 1.8) reasons.push(t(language, "recommend.reason.synergy"));
  if (breakdown.teammates >= 1 && candidate.teammateMatches?.length) {
    reasons.push(t(language, "recommend.reason.teammates", {
      value: candidate.teammateMatches.map((entry) => entry.member.displayName || entry.member.speciesName).join(" / "),
    }));
  }
  if (breakdown.quality >= 1.4) reasons.push(t(language, "recommend.reason.quality"));
  return reasons.length ? reasons : [t(language, "recommend.reason.balance")];
}

function buildPenalties(candidate, team, analysis, language, focusType = "") {
  const teamTypes = new Set(team.flatMap((member) => member.types || []));
  const duplicateTypes = (candidate.types || []).filter((type) => teamTypes.has(type));
  const penalties = [];
  if (duplicateTypes.length) {
    penalties.push(t(language, "recommend.penalty.duplicateTypes", {
      value: duplicateTypes.map((type) => getTypeLabel(type, language)).join(" / "),
    }));
  }
  if (focusType && (getResistanceProfile(candidate.types)[focusType] ?? 1) > 1) {
    penalties.push(t(language, "recommend.penalty.focusWeak", {value: getTypeLabel(focusType, language)}));
  }
  if (analysis.weaknesses.length && !getCoverSummary(candidate, analysis).coveredThreats.length) {
    penalties.push(t(language, "recommend.penalty.noPatch"));
  }
  return penalties.slice(0, 2);
}

function buildWeaknessHelp(candidate, analysis, language) {
  const coverSummary = getCoverSummary(candidate, analysis);
  if (coverSummary.coveredThreats.length) {
    return coverSummary.coveredThreats.map((type) => getTypeLabel(type, language)).slice(0, 3);
  }
  return analysis.weaknesses.map((entry) => {
    const multiplier = getResistanceProfile(candidate.types)[entry.type] ?? 1;
    return `${getTypeLabel(entry.type, language)} ${multiplier}x`;
  }).slice(0, 3);
}

export function buildRecommendationEntry(candidate, team, analysis, speedTiers, language, preferences, weights, datasets, focusType = "") {
  const scoringCandidate = enrichCandidateForScoring(candidate, datasets);
  const qualityBreakdown = buildQualityBreakdown(scoringCandidate);
  const usageTeammates = buildTeammateUsageSummary(team, scoringCandidate, datasets);
  const breakdown = {
    resistance: scoreResistance(scoringCandidate, analysis, preferences, weights),
    coverage: scoreCoverage(scoringCandidate, analysis, preferences, weights, datasets),
    speed: scoreSpeed(scoringCandidate, speedTiers, analysis, preferences, weights),
    synergy: scoreSynergy(team, scoringCandidate, analysis, preferences, weights),
    teammates: clamp(usageTeammates.score * (Math.max(0, Number(weights.usageTeammates || 0)) / 100), 0, SCORE_WEIGHTS.teammates),
    quality: qualityBreakdown.total,
    focus: scoreFocus(scoringCandidate, focusType),
  };
  const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  const coverSummary = getCoverSummary(scoringCandidate, analysis);
  const result = {
    ...scoringCandidate,
    recommendationKey: `${candidate.source || "library"}:${candidate.id}`,
    recommendationScore: score,
    coveredThreats: coverSummary.coveredThreats,
    breakdown,
    teammateMatches: usageTeammates.matches,
    qualityBreakdown,
  };
  return {
    ...result,
    reasons: buildReasons(result, breakdown, language, analysis, focusType),
    penalties: buildPenalties(result, team, analysis, language, focusType),
    weaknessHelp: buildWeaknessHelp(result, analysis, language),
  };
}
