import {getScaledAbilityScore} from "../ability-scores.js";
import {SCORE_WEIGHTS} from "../constants.js";
import {getUtilityRoles} from "../team-roles.js";
import {clamp} from "../utils.js";

const QUALITY_DAMAGE_PRODUCT_REFERENCE = 46000;
const QUALITY_SPEED_EXTREME_REFERENCE = 220;
const QUALITY_PRIMARY_OFFENSE_REFERENCE = 220;
const QUALITY_PHYSICAL_BULK_REFERENCE = 38000;
const QUALITY_SPECIAL_BULK_REFERENCE = 38000;
const QUALITY_OFFENSE_CAP = 1;
const QUALITY_PHYSICAL_BULK_CAP = 0.4;
const QUALITY_SPECIAL_BULK_CAP = 0.4;
const QUALITY_SPEED_CAP = 0.45;
const QUALITY_ABILITY_CAP = 0.3;
const QUALITY_ROLE_CAP = 0.25;
const QUALITY_MOVE_CAP = 0.2;
const QUALITY_KEYS = Object.freeze(["hp", "atk", "def", "spa", "spd", "spe"]);

function getStatsTotal(stats = {}) {
  return QUALITY_KEYS.reduce((sum, stat) => sum + Number(stats[stat] || 0), 0);
}

function getPrimaryOffenseValue(stats = {}) {
  return Math.max(Number(stats.atk || 0), Number(stats.spa || 0));
}

function scaleQualityPart(value, reference, cap) {
  if (!Number.isFinite(value) || value <= 0 || !reference) {
    return 0;
  }
  return clamp((value / reference) * cap, 0, cap);
}

function getCandidateAbilityQuality(candidate) {
  if (candidate.ability) {
    return getScaledAbilityScore(candidate.ability, QUALITY_ABILITY_CAP, QUALITY_ABILITY_CAP * -0.25);
  }
  const legalAbilities = [...new Set(Object.values(candidate.abilities || {}).filter(Boolean))];
  return legalAbilities.reduce((bestScore, abilityName) => (
    Math.max(bestScore, getScaledAbilityScore(abilityName, QUALITY_ABILITY_CAP, QUALITY_ABILITY_CAP * -0.25))
  ), 0);
}

export function buildQualityBreakdown(candidate) {
  const battleStats = candidate.stats || candidate.baseStats || {};
  const hpValue = Number(battleStats.hp || 0);
  const offenseValue = getPrimaryOffenseValue(battleStats);
  const speedValue = Math.max(0, Number(battleStats.spe || 0));
  const physicalBulkValue = hpValue * Number(battleStats.def || 0);
  const specialBulkValue = hpValue * Number(battleStats.spd || 0);
  const damageValue = offenseValue * speedValue;
  const utilityRoles = getUtilityRoles(candidate).length;
  const output = (
    scaleQualityPart(damageValue, QUALITY_DAMAGE_PRODUCT_REFERENCE, QUALITY_OFFENSE_CAP * 0.7)
    + scaleQualityPart(offenseValue, QUALITY_PRIMARY_OFFENSE_REFERENCE, QUALITY_OFFENSE_CAP * 0.3)
  );
  const physicalBulk = scaleQualityPart(physicalBulkValue, QUALITY_PHYSICAL_BULK_REFERENCE, QUALITY_PHYSICAL_BULK_CAP);
  const specialBulk = scaleQualityPart(specialBulkValue, QUALITY_SPECIAL_BULK_REFERENCE, QUALITY_SPECIAL_BULK_CAP);
  const speedFlex = scaleQualityPart(speedValue, QUALITY_SPEED_EXTREME_REFERENCE, QUALITY_SPEED_CAP);
  const ability = getCandidateAbilityQuality(candidate);
  const utility = clamp(utilityRoles * 0.08, 0, QUALITY_ROLE_CAP);
  const moves = clamp(((candidate.moves || []).length / 4) * QUALITY_MOVE_CAP, 0, QUALITY_MOVE_CAP);
  const total = clamp(output + physicalBulk + specialBulk + speedFlex + ability + utility + moves, 0, SCORE_WEIGHTS.quality);
  return {
    total,
    parts: {output, physicalBulk, specialBulk, speedFlex, ability, utility, moves},
    totals: {
      base: getStatsTotal(candidate.baseStats || {}),
      battle: getStatsTotal(battleStats),
      damage: Math.round(damageValue),
      physicalBulk: Math.round(physicalBulkValue),
      specialBulk: Math.round(specialBulkValue),
    },
  };
}
