import {TYPE_CHART, TYPE_ORDER} from "./constants.js";
import {normalizeName} from "./utils.js";

const ALLY_SIDE = "ally";
const OPPONENT_SIDE = "opponent";
const TERA_BLAST = "terablast";
const FREEZE_DRY = "freezedry";
const FLYING_PRESS = "flyingpress";
const THOUSAND_ARROWS = "thousandarrows";
const BASE_PRIORITY_BLOCK_ABILITIES = new Set(["dazzling", "queenlymajesty", "armortail"]);
const GHOST_BREAK_ABILITIES = new Set(["scrappy", "mindseye"]);
const IGNORE_DEFENDER_ABILITIES = new Set(["moldbreaker", "turboblaze", "teravolt"]);
const TINTED_LENS = "tintedlens";
const PRANKSTER = "prankster";
const LEVITATE = "levitate";
const DOUBLE_SPEED_MODES = new Set(["double"]);
const PRIORITY_BLOCK_MOVE_NAMES = new Set(["quickguard"]);
const ABILITY_TYPE_IMMUNITIES = Object.freeze({
  flashfire: "Fire",
  stormdrain: "Water",
  waterabsorb: "Water",
  dryskin: "Water",
  lightningrod: "Electric",
  voltabsorb: "Electric",
  motordrive: "Electric",
  sapsipper: "Grass",
});
const SPREAD_MOVE_TARGETS = new Set(["alladjacent", "alladjacentfoes", "allyteam"]);

function getSideFlagKey(side) {
  return side === OPPONENT_SIDE ? "opponentFlags" : "allyFlags";
}

function getBattleMemberKey(config = {}, side = ALLY_SIDE) {
  if (side === OPPONENT_SIDE) {
    return String(config.speciesId || config.id || "");
  }
  return String(config.id || config.speciesId || "");
}

function getNormalizedAbility(config = {}) {
  return normalizeName(config.ability || "");
}

function getMoveId(move = {}) {
  return normalizeName(move.id || move.name || "");
}

function getMoveCategory(move = {}) {
  return String(move.category || "Status");
}

function getTypeMultiplier(attackType, defendType) {
  return TYPE_CHART[attackType]?.[defendType] ?? 1;
}

function getTypeMultiplierForMove({
  attackType,
  defendType,
  moveId,
  attackerAbility,
  defenderAbility,
  ignoreDefenderAbility,
}) {
  if (!attackType) return 0;
  if (moveId === FLYING_PRESS) {
    return (
      getTypeMultiplierForMove({attackType: "Fighting", defendType, moveId: "fighting", attackerAbility, defenderAbility, ignoreDefenderAbility})
      * getTypeMultiplierForMove({attackType: "Flying", defendType, moveId: "flying", attackerAbility, defenderAbility, ignoreDefenderAbility})
    );
  }
  if (moveId === FREEZE_DRY && defendType === "Water") {
    return 2;
  }
  if ((attackerAbility === "scrappy" || attackerAbility === "mindseye") && defendType === "Ghost" && (attackType === "Normal" || attackType === "Fighting")) {
    return 1;
  }
  if (moveId === THOUSAND_ARROWS && defendType === "Flying" && attackType === "Ground") {
    return 1;
  }
  if (!ignoreDefenderAbility) {
    const immuneType = ABILITY_TYPE_IMMUNITIES[defenderAbility];
    if (immuneType === attackType) {
      return moveId === THOUSAND_ARROWS && attackType === "Ground" ? 1 : 0;
    }
    if (defenderAbility === LEVITATE && attackType === "Ground") {
      return moveId === THOUSAND_ARROWS ? 1 : 0;
    }
  }
  return getTypeMultiplier(attackType, defendType);
}

function getFieldSideState(fieldState = {}, side = ALLY_SIDE) {
  const tailwindKey = side === OPPONENT_SIDE ? "opponentTailwind" : "allyTailwind";
  return {
    tailwind: Boolean(fieldState?.[tailwindKey]),
    trickRoom: Boolean(fieldState?.trickRoom),
  };
}

function getFieldSpeedMultiplier(sideState, flags) {
  let multiplier = 1;
  if (sideState.tailwind) multiplier *= 2;
  if (flags.paralyzed) multiplier *= 0.5;
  return multiplier;
}

function dedupeSpeedVariants(variants = []) {
  const seen = new Set();
  return variants.filter((variant) => {
    const key = `${variant.mode}:${variant.speed}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getFieldFlags(config = {}, side = ALLY_SIDE, fieldState = {}) {
  const memberKey = getBattleMemberKey(config, side);
  const flags = fieldState?.[getSideFlagKey(side)]?.[memberKey];
  return {
    terastallized: Boolean(flags?.terastallized),
    paralyzed: Boolean(flags?.paralyzed),
  };
}

export function getEffectiveTypes(config = {}, options = {}) {
  const flags = options.flags || getFieldFlags(config, options.side, options.fieldState);
  const teraType = String(config.teraType || "").trim();
  if (flags.terastallized && teraType && teraType !== "Stellar") {
    return [teraType];
  }
  return Array.isArray(config.types) ? config.types : [];
}

export function getDamagingMoves(config = {}) {
  return (config.moves || []).filter((move) => getMoveCategory(move) !== "Status" && move.type);
}

export function getMoveType(move = {}, attacker = {}, options = {}) {
  if (getMoveId(move) !== TERA_BLAST) {
    return move.type || "";
  }
  const flags = options.flags || getFieldFlags(attacker, options.side, options.fieldState);
  const teraType = String(attacker.teraType || "").trim();
  return flags.terastallized && teraType && teraType !== "Stellar" ? teraType : (move.type || "");
}

export function getMovePriority(move = {}, attacker = {}) {
  let priority = Number(move.priority || 0);
  if (getMoveCategory(move) === "Status" && getNormalizedAbility(attacker) === PRANKSTER) {
    priority += 1;
  }
  return priority;
}

export function isSpreadMove(move = {}) {
  return SPREAD_MOVE_TARGETS.has(normalizeName(move.target || ""));
}

export function getMoveEffectiveness(move = {}, attacker = {}, defender = {}, options = {}) {
  const moveId = getMoveId(move);
  const attackType = getMoveType(move, attacker, options);
  const defenderTypes = getEffectiveTypes(defender, {fieldState: options.fieldState, side: options.defenderSide, flags: options.defenderFlags});
  if (!attackType || !defenderTypes.length) {
    return 0;
  }
  const attackerAbility = getNormalizedAbility(attacker);
  const defenderAbility = getNormalizedAbility(defender);
  const ignoreDefenderAbility = IGNORE_DEFENDER_ABILITIES.has(attackerAbility);
  let multiplier = defenderTypes.reduce((total, defendType) => {
    return total * getTypeMultiplierForMove({
      attackType,
      defendType,
      moveId,
      attackerAbility,
      defenderAbility,
      ignoreDefenderAbility,
    });
  }, 1);
  if (multiplier > 0 && multiplier < 1 && attackerAbility === TINTED_LENS) {
    multiplier *= 2;
  }
  return multiplier;
}

export function getBestMoveEffectiveness(attacker = {}, defender = {}, options = {}) {
  return getDamagingMoves(attacker).reduce((best, move) => {
    return Math.max(best, getMoveEffectiveness(move, attacker, defender, options));
  }, 0);
}

export function getResistanceProfileForConfig(config = {}, options = {}) {
  const defenderTypes = getEffectiveTypes(config, options);
  return Object.fromEntries(TYPE_ORDER.map((attackType) => {
    const move = {name: attackType, id: attackType, type: attackType, category: "Special"};
    return [attackType, getMoveEffectiveness(move, {}, {types: defenderTypes, ability: config.ability, teraType: config.teraType}, options)];
  }));
}

export function getCoverageProfileForConfig(config = {}, options = {}) {
  return Object.fromEntries(TYPE_ORDER.map((defendType) => {
    return [defendType, getBestMoveEffectiveness(config, {types: [defendType]}, options)];
  }));
}

export function getBestMoveEffectivenessAgainstTypes(config = {}, defendTypes = [], options = {}) {
  return getDamagingMoves(config).reduce((best, move) => {
    return Math.max(best, getMoveEffectiveness(move, config, {types: defendTypes}, options));
  }, 0);
}

export function getSpeedVariants(config = {}, side = ALLY_SIDE, fieldState = {}) {
  const flags = getFieldFlags(config, side, fieldState);
  const sideState = getFieldSideState(fieldState, side);
  const baseSpeed = Number(config.stats?.spe || 0);
  const candidates = [
    {mode: "base", speed: baseSpeed, sources: []},
    {mode: "plus1", speed: Number(config.plusOneSpeed?.speed || 0), sources: config.plusOneSpeed?.sources || []},
    {mode: "scarf", speed: Number(config.choiceScarfSpeed?.speed || 0), sources: config.choiceScarfSpeed?.sources || []},
    {mode: "double", speed: Number(config.doubleSpeed?.speed || 0), sources: config.doubleSpeed?.sources || []},
  ];
  return dedupeSpeedVariants(candidates
    .filter((variant) => variant.speed > 0)
    .map((variant) => {
      const multiplier = getFieldSpeedMultiplier(sideState, flags);
      const adjusted = Math.max(1, Math.floor(variant.speed * multiplier));
      return {
        ...variant,
        adjustedSpeed: adjusted,
        speed: adjusted,
        isBoosted: DOUBLE_SPEED_MODES.has(variant.mode) || variant.mode === "plus1" || variant.mode === "scarf",
      };
    }));
}

export function getEffectiveSpeed(config = {}, side = ALLY_SIDE, fieldState = {}) {
  return getSpeedVariants(config, side, fieldState).reduce((best, variant) => {
    return Math.max(best, Number(variant.speed || 0));
  }, 0);
}

export function compareInitiative(left = {}, right = {}, fieldState = {}, leftSide = ALLY_SIDE, rightSide = OPPONENT_SIDE) {
  const leftSpeed = getEffectiveSpeed(left, leftSide, fieldState);
  const rightSpeed = getEffectiveSpeed(right, rightSide, fieldState);
  if (leftSpeed === rightSpeed) return 0;
  const delta = leftSpeed > rightSpeed ? 1 : -1;
  return fieldState?.trickRoom ? -delta : delta;
}

export function hasPriorityBlockingAbility(config = {}) {
  return BASE_PRIORITY_BLOCK_ABILITIES.has(getNormalizedAbility(config));
}

export function hasQuickGuard(config = {}) {
  return getDamagingMoves(config).some((move) => PRIORITY_BLOCK_MOVE_NAMES.has(getMoveId(move)))
    || (config.moveNames || []).some((name) => PRIORITY_BLOCK_MOVE_NAMES.has(normalizeName(name)));
}
