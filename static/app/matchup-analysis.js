import {calculateSpeedLineTiers} from "./data.js";
import {buildMatchupBoard} from "./matchup-board-data.js";
import {TYPE_CHART} from "./constants.js";
import {getAttackBias, getUtilityRoles} from "./team-roles.js";
const PREVIEW_LIMIT = 3;
const FOUR_SELECTION_SIZE = 4;
const DUPLICATE_WEATHER_LEAD_PENALTY = 3;
const DUPLICATE_WEATHER_LINEUP_PENALTY = 2.5;
const LEAD_ROLE_BONUS = {
  fakeout: 4,
  tailwind: 3,
  speedcontrol: 2,
  intimidate: 2,
  redirection: 2,
  guard: 1.5,
  disruption: 1.5,
  pivot: 1,
  weather: 1,
};

function getAttackMultiplier(attackType, defendTypes = []) {
  return defendTypes.reduce((total, defendType) => {
    const next = TYPE_CHART[attackType]?.[defendType];
    return total * (next ?? 1);
  }, 1);
}

function getBestAttackMultiplier(attackTypes = [], defendTypes = []) {
  return attackTypes.reduce((best, attackType) => {
    return Math.max(best, getAttackMultiplier(attackType, defendTypes));
  }, 0);
}

function getFastestSpeed(config) {
  return Math.max(
    Number(config.stats?.spe || 0),
    Number(config.plusOneSpeed?.speed || 0),
    Number(config.choiceScarfSpeed?.speed || 0),
  );
}

function getVariantConfigs(entry) {
  if (entry?.selectedConfigId && Array.isArray(entry?.configs)) {
    const selectedConfig = entry.configs.find((config) => config.id === entry.selectedConfigId);
    if (selectedConfig) {
      return [selectedConfig];
    }
  }
  return Array.isArray(entry?.configs) && entry.configs.length ? entry.configs : [entry].filter(Boolean);
}

function isGroupedEntry(entry) {
  return Array.isArray(entry?.configs) && entry.configs.length > 0;
}

function getMemberLabel(entry) {
  if (isGroupedEntry(entry)) {
    return entry?.speciesName || entry?.displayName || "Unknown";
  }
  return entry?.displayLabel || entry?.displayName || entry?.speciesName || "Unknown";
}

function averageValue(values = []) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function aggregateSnapshots(snapshots = []) {
  return {
    score: averageValue(snapshots.map((snapshot) => snapshot.score)),
    effectiveness: averageValue(snapshots.map((snapshot) => snapshot.effectiveness)),
    resistance: averageValue(snapshots.map((snapshot) => snapshot.resistance)),
    speed: Math.max(...snapshots.map((snapshot) => snapshot.speed), 0),
  };
}

function getOffenseStat(config) {
  return Math.max(Number(config.stats?.atk || 0), Number(config.stats?.spa || 0));
}

function getTaggedTeam(team = [], side) {
  return team.flatMap((entry) => getVariantConfigs(entry).map((config) => ({...config, matchupSide: side})));
}

function buildMemberRef(config) {
  const variants = getVariantConfigs(config);
  return {
    id: isGroupedEntry(config) ? config.speciesId : config.id,
    speciesId: config.speciesId || "",
    speciesName: config.speciesName || getMemberLabel(config),
    label: getMemberLabel(config),
    note: config.note || "",
    speed: Math.max(...variants.map((entry) => Number(entry.stats?.spe || 0)), 0),
    variantCount: variants.length,
  };
}

function countRoleMembers(team = [], roleId) {
  return team.reduce((count, config) => {
    return count + (getUtilityRoles(config).includes(roleId) ? 1 : 0);
  }, 0);
}

function getDuplicateRolePenalty(team = [], roleId, penaltyPerExtra) {
  const duplicateCount = Math.max(0, countRoleMembers(team, roleId) - 1);
  return duplicateCount * penaltyPerExtra;
}

function getLeadUtilityBonus(pair = []) {
  const roles = new Set(pair.flatMap((config) => getUtilityRoles(config)));
  const roleBonus = [...roles].reduce((sum, roleId) => sum + Number(LEAD_ROLE_BONUS[roleId] || 0), 0);
  return roleBonus - getDuplicateRolePenalty(pair, "weather", DUPLICATE_WEATHER_LEAD_PENALTY);
}

function getPressureSnapshot(attacker, defender) {
  const effectiveness = getBestAttackMultiplier(attacker.offensiveTypes || [], defender.types || []);
  const attackStat = getOffenseStat(attacker);
  const speed = getFastestSpeed(attacker);
  const defenderSpeed = getFastestSpeed(defender);
  const roles = new Set(getUtilityRoles(attacker));
  let score = effectiveness * 12 + attackStat / 18;
  if (speed > defenderSpeed) score += 4;
  if (roles.has("fakeout")) score += 2;
  if (roles.has("disruption")) score += 1.5;
  if (roles.has("speedcontrol") || roles.has("tailwind")) score += 1;
  return {score, effectiveness, speed};
}

function getAnswerSnapshot(candidate, target) {
  const pressure = getPressureSnapshot(candidate, target);
  const retaliation = getPressureSnapshot(target, candidate);
  const incoming = getBestAttackMultiplier(target.offensiveTypes || [], candidate.types || []);
  const roles = new Set(getUtilityRoles(candidate));
  let score = pressure.score - retaliation.score * 0.6;
  if (incoming < 1) score += 4;
  if (incoming === 0) score += 2;
  if (roles.has("intimidate") && getAttackBias(target) === "physical") score += 3;
  if (roles.has("guard")) score += 1.5;
  return {score, effectiveness: pressure.effectiveness, resistance: incoming, speed: pressure.speed};
}

function getPressureAgainstMember(attacker, defender) {
  return aggregateSnapshots(
    getVariantConfigs(attacker).flatMap((attackerConfig) => {
      return getVariantConfigs(defender).map((defenderConfig) => getPressureSnapshot(attackerConfig, defenderConfig));
    }),
  );
}

function getAnswerIntoMember(candidate, target) {
  return aggregateSnapshots(
    getVariantConfigs(candidate).flatMap((candidateConfig) => {
      return getVariantConfigs(target).map((targetConfig) => getAnswerSnapshot(candidateConfig, targetConfig));
    }),
  );
}

function getPairEntries(team = [], size) {
  const entries = [];
  function walk(startIndex, picked) {
    if (picked.length === size) {
      entries.push([...picked]);
      return;
    }
    for (let index = startIndex; index < team.length; index += 1) {
      picked.push(team[index]);
      walk(index + 1, picked);
      picked.pop();
    }
  }
  if (team.length < size) {
    return [];
  }
  walk(0, []);
  return entries;
}

function scorePairIntoPair(myPair, theirPair) {
  const pressure = theirPair.reduce((sum, foe) => {
    return sum + Math.max(...myPair.map((ally) => getAnswerIntoMember(ally, foe).score));
  }, 0);
  const exposure = myPair.reduce((sum, ally) => {
    return sum + Math.max(...theirPair.map((foe) => getPressureAgainstMember(foe, ally).score));
  }, 0);
  return pressure - exposure * 0.65;
}

function summarizeLeadPair(pair, opponentPairs) {
  const averageScore = opponentPairs.reduce((sum, enemyPair) => {
    return sum + scorePairIntoPair(pair, enemyPair);
  }, 0) / Math.max(opponentPairs.length, 1);
  const keyTargets = opponentPairs.length
    ? [...new Set(opponentPairs.flatMap((enemyPair) => {
      const target = enemyPair
        .map((foe) => ({
          foe,
          score: Math.max(...pair.map((ally) => getAnswerIntoMember(ally, foe).score)),
        }))
        .sort((left, right) => right.score - left.score)[0]?.foe;
      return target ? [target] : [];
    }))].slice(0, PREVIEW_LIMIT).map(buildMemberRef)
    : [];
  return {
    members: pair.map(buildMemberRef),
    score: averageScore + getLeadUtilityBonus(pair),
    targets: keyTargets,
    roles: [...new Set(pair.flatMap((config) => getUtilityRoles(config)))],
  };
}

function hasLeadMembers(lineup, leadPair) {
  const lineupIds = new Set(lineup.map((config) => config.id));
  return leadPair.every((config) => lineupIds.has(config.id));
}

function scoreLineup(lineup, opponentTeam, leadScore) {
  const answerScore = opponentTeam.reduce((sum, foe) => {
    return sum + Math.max(...lineup.map((ally) => getAnswerIntoMember(ally, foe).score));
  }, 0);
  const exposure = lineup.reduce((sum, ally) => {
    return sum + Math.max(...opponentTeam.map((foe) => getPressureAgainstMember(foe, ally).score));
  }, 0);
  const roles = new Set(lineup.flatMap((config) => getUtilityRoles(config)));
  const weatherPenalty = getDuplicateRolePenalty(lineup, "weather", DUPLICATE_WEATHER_LINEUP_PENALTY);
  return answerScore - exposure * 0.45 + roles.size * 0.75 + leadScore * 0.5 - weatherPenalty;
}

function summarizeLeadLineup(pair, team, opponentTeam, leadScore) {
  const lineupSize = Math.min(FOUR_SELECTION_SIZE, team.length);
  const lineups = getPairEntries(team, lineupSize).filter((lineup) => hasLeadMembers(lineup, pair));
  const best = lineups
    .map((lineup) => ({
      lineupMembers: lineup.map(buildMemberRef),
      backline: lineup.filter((member) => !pair.includes(member)).map(buildMemberRef),
      lineupScore: scoreLineup(lineup, opponentTeam, leadScore),
    }))
    .sort((left, right) => right.lineupScore - left.lineupScore)[0];
  return best || {lineupMembers: pair.map(buildMemberRef), backline: [], lineupScore: leadScore};
}

function summarizeLeadPairs(team, opponentTeam) {
  const myPairs = getPairEntries(team, 2);
  const opponentPairs = getPairEntries(opponentTeam, 2);
  return myPairs
    .map((pair) => {
      const summary = summarizeLeadPair(pair, opponentPairs);
      return {...summary, ...summarizeLeadLineup(pair, team, opponentTeam, summary.score)};
    })
    .sort((left, right) => right.score - left.score || right.lineupScore - left.lineupScore)
    .slice(0, PREVIEW_LIMIT);
}

function summarizeThreats(team, opponentTeam) {
  return team.map((member) => ({
    member: buildMemberRef(member),
    threats: opponentTeam
      .map((foe) => ({member: buildMemberRef(foe), ...getPressureAgainstMember(foe, member)}))
      .sort((left, right) => right.score - left.score)
      .slice(0, PREVIEW_LIMIT),
  }));
}

function summarizeAnswers(team, opponentTeam) {
  return opponentTeam.map((foe) => ({
    member: buildMemberRef(foe),
    answers: team
      .map((ally) => ({member: buildMemberRef(ally), ...getAnswerIntoMember(ally, foe)}))
      .sort((left, right) => right.score - left.score)
      .slice(0, PREVIEW_LIMIT),
  }));
}

function summarizeOverview(team, opponentTeam, speedLines) {
  return {
    allyCount: team.length,
    opponentCount: opponentTeam.length,
    speedLineCount: speedLines.length,
  };
}

export function analyzeMatchup(team = [], opponentTeam = [], datasets = null) {
  if (!team.length || !opponentTeam.length) {
    return null;
  }
  const speedLines = calculateSpeedLineTiers([
    ...getTaggedTeam(team, "ally"),
    ...getTaggedTeam(opponentTeam, "opponent"),
  ]);
  const leadPairs = summarizeLeadPairs(team, opponentTeam);
  const allyThreats = summarizeThreats(team, opponentTeam);
  const opponentAnswers = summarizeAnswers(team, opponentTeam);
  return {
    overview: summarizeOverview(team, opponentTeam, speedLines),
    speedLines,
    leadPairs,
    allyThreats,
    opponentAnswers,
    board: buildMatchupBoard({
      team,
      opponentTeam,
      allyThreats,
      opponentAnswers,
      datasets,
    }),
  };
}
