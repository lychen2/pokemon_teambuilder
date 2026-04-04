const PLUS_ONE_SPEED_ABILITIES = new Set([
  "Quick Feet",
  "Speed Boost",
]);
const CHOICE_SCARF = "Choice Scarf";

const CONDITIONAL_PLUS_ONE_SPEED_ABILITIES = new Set([
  "Protosynthesis",
  "Quark Drive",
]);

const NON_HP_STATS = ["atk", "def", "spa", "spd", "spe"];

function getMoveSpeedBoostStage(move = {}) {
  return Math.max(
    Number(move.boosts?.spe || 0),
    Number(move.self?.boosts?.spe || 0),
    Number(move.selfBoost?.boosts?.spe || 0),
    Number(move.secondary?.self?.boosts?.spe || 0),
  );
}

function canAbilityBoostSpeed(ability, stats = {}) {
  if (PLUS_ONE_SPEED_ABILITIES.has(ability)) {
    return true;
  }
  if (!CONDITIONAL_PLUS_ONE_SPEED_ABILITIES.has(ability)) {
    return false;
  }
  const maxStat = Math.max(...NON_HP_STATS.map((stat) => Number(stats[stat] || 0)));
  return Number(stats.spe || 0) >= maxStat;
}

export function getPlusOneSpeedData({ability, moves = [], stats = {}}) {
  const moveSources = moves
    .filter((move) => getMoveSpeedBoostStage(move) === 1)
    .map((move) => move.name);
  const sources = [...new Set(moveSources)];

  if (ability && canAbilityBoostSpeed(ability, stats)) {
    sources.push(ability);
  }
  if (!sources.length) {
    return null;
  }

  return {
    speed: Math.floor(Number(stats.spe || 0) * 1.5),
    sources: [...new Set(sources)],
  };
}

export function getChoiceScarfSpeedData({item, stats = {}}) {
  if (item !== CHOICE_SCARF) {
    return null;
  }
  return {
    speed: Math.floor(Number(stats.spe || 0) * 1.5),
    sources: [CHOICE_SCARF],
  };
}
