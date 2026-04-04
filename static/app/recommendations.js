import {SCORE_WEIGHTS, TYPE_ORDER} from "./constants.js";
import {analyzeTeam, getCoverageProfile, getResistanceProfile} from "./analysis.js";
import {t} from "./i18n.js";
import {clamp, getTypeLabel} from "./utils.js";

function scoreResistance(candidate, analysis) {
  const profile = getResistanceProfile(candidate.types);
  const total = analysis.weaknesses.reduce((score, weakness) => {
    const multiplier = profile[weakness.type] ?? 1;
    if (multiplier === 0 || multiplier <= 0.25) return score + 2;
    if (multiplier <= 0.5) return score + 1.5;
    if (multiplier >= 2) return score - 0.5;
    return score;
  }, 0);
  return clamp(total, 0, SCORE_WEIGHTS.resistance);
}

function scoreCoverage(candidate, analysis) {
  const current = Object.fromEntries(analysis.offensive.map((entry) => [entry.type, entry.effectiveness]));
  const next = getCoverageProfile(candidate.offensiveTypes || []);
  const total = TYPE_ORDER.reduce((score, type) => {
    if ((next[type] || 0) <= (current[type] || 0)) return score;
    if ((current[type] || 0) <= 1 && (next[type] || 0) >= 2) return score + 2;
    if ((current[type] || 0) < 4 && (next[type] || 0) === 4) return score + 1.5;
    return score + 1;
  }, 0);
  return clamp(total, 0, SCORE_WEIGHTS.coverage);
}

function scoreSpeed(candidate, speedTiers) {
  const totalCount = speedTiers.reduce((sum, tier) => sum + tier.totalCount, 0);
  if (!totalCount) return 0;
  const coveredCount = speedTiers
    .filter((tier) => tier.speed < (candidate.stats?.spe || 0))
    .reduce((sum, tier) => sum + tier.totalCount, 0);
  return clamp((coveredCount / totalCount) * SCORE_WEIGHTS.speed, 0, SCORE_WEIGHTS.speed);
}

function scoreSynergy(team, candidate) {
  if (!team.length) return 0;
  const teamTypes = new Set(team.flatMap((member) => member.types || []));
  const newTypes = (candidate.types || []).filter((type) => !teamTypes.has(type)).length;
  const supportMoves = (candidate.moves || []).filter((move) => move.category === "Status").length;
  const duplicateTypePenalty = (candidate.types || []).filter((type) => teamTypes.has(type)).length;
  const total = newTypes * 1.75 + Math.min(supportMoves, 2) - duplicateTypePenalty * 0.75;
  return clamp(total, 0, SCORE_WEIGHTS.synergy);
}

function scoreQuality(candidate) {
  const bst = Object.values(candidate.baseStats || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  const statPart = clamp(((bst - 350) / 300) * 2.5, 0, 2.5);
  const movePart = clamp(((candidate.moves || []).length / 4) * 1.5, 0, 1.5);
  return clamp(statPart + movePart, 0, SCORE_WEIGHTS.quality);
}

function buildReasons(candidate, breakdown, language) {
  const reasons = [];
  if (breakdown.resistance >= 4) reasons.push(t(language, "recommend.reason.resistance"));
  if (breakdown.coverage >= 4) reasons.push(t(language, "recommend.reason.coverage"));
  if (breakdown.speed >= 3) reasons.push(t(language, "recommend.reason.speed", {speed: candidate.stats?.spe || 0}));
  if (breakdown.synergy >= 2) reasons.push(t(language, "recommend.reason.synergy"));
  if (breakdown.quality >= 2) reasons.push(t(language, "recommend.reason.quality"));
  return reasons.length ? reasons : [t(language, "recommend.reason.balance")];
}

export function recommendConfigs(library, team, speedTiers, language = "zh") {
  if (!team.length || team.length >= 6) {
    return [];
  }

  const analysis = analyzeTeam(team, speedTiers, language);
  const currentSpecies = new Set(team.map((config) => config.speciesId));

  return library
    .filter((candidate) => !currentSpecies.has(candidate.speciesId))
    .map((candidate) => {
      const breakdown = {
        resistance: scoreResistance(candidate, analysis),
        coverage: scoreCoverage(candidate, analysis),
        speed: scoreSpeed(candidate, speedTiers),
        synergy: scoreSynergy(team, candidate),
        quality: scoreQuality(candidate),
        };
      const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
      return {
        ...candidate,
        recommendationScore: score,
        breakdown,
        reasons: buildReasons(candidate, breakdown, language),
        weaknessHelp: analysis.weaknesses.map((entry) => {
          const multiplier = getResistanceProfile(candidate.types)[entry.type] ?? 1;
          return `${getTypeLabel(entry.type, language)} ${multiplier}x`;
        }).slice(0, 3),
      };
    })
    .sort((left, right) => right.recommendationScore - left.recommendationScore)
    .slice(0, 12);
}
