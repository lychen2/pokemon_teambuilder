import {calculateSpeedLineTiers} from "./data.js";
import {TYPE_CHART} from "./constants.js";
import {getAttackBias, getUtilityRoles} from "./team-roles.js";

const PREVIEW_LIMIT = 3;
const FOUR_SELECTION_SIZE = 4;
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

function getOffenseStat(config) {
  return Math.max(Number(config.stats?.atk || 0), Number(config.stats?.spa || 0));
}

function getTaggedTeam(team = [], side) {
  return team.map((config) => ({...config, matchupSide: side}));
}

function buildMemberRef(config) {
  return {
    id: config.id,
    label: config.displayName || config.speciesName || "Unknown",
    note: config.note || "",
    speed: Number(config.stats?.spe || 0),
  };
}

function getLeadUtilityBonus(pair = []) {
  const roles = new Set(pair.flatMap((config) => getUtilityRoles(config)));
  return [...roles].reduce((sum, roleId) => sum + Number(LEAD_ROLE_BONUS[roleId] || 0), 0);
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
    return sum + Math.max(...myPair.map((ally) => getAnswerSnapshot(ally, foe).score));
  }, 0);
  const exposure = myPair.reduce((sum, ally) => {
    return sum + Math.max(...theirPair.map((foe) => getPressureSnapshot(foe, ally).score));
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
          score: Math.max(...pair.map((ally) => getAnswerSnapshot(ally, foe).score)),
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

function summarizeLeadPairs(team, opponentTeam) {
  const myPairs = getPairEntries(team, 2);
  const opponentPairs = getPairEntries(opponentTeam, 2);
  return myPairs
    .map((pair) => summarizeLeadPair(pair, opponentPairs))
    .sort((left, right) => right.score - left.score)
    .slice(0, PREVIEW_LIMIT);
}

function scoreLineup(lineup, opponentTeam, leadPairs) {
  const answerScore = opponentTeam.reduce((sum, foe) => {
    return sum + Math.max(...lineup.map((ally) => getAnswerSnapshot(ally, foe).score));
  }, 0);
  const exposure = lineup.reduce((sum, ally) => {
    return sum + Math.max(...opponentTeam.map((foe) => getPressureSnapshot(foe, ally).score));
  }, 0);
  const roles = new Set(lineup.flatMap((config) => getUtilityRoles(config)));
  const leadBonus = leadPairs
    .filter((entry) => entry.members.every((member) => lineup.some((config) => config.id === member.id)))
    .sort((left, right) => right.score - left.score)[0]?.score || 0;
  return answerScore - exposure * 0.45 + roles.size * 0.75 + leadBonus * 0.5;
}

function summarizeRecommendedFour(team, opponentTeam, leadPairs) {
  const size = Math.min(FOUR_SELECTION_SIZE, team.length);
  const lineups = getPairEntries(team, size);
  const best = lineups
    .map((lineup) => ({members: lineup.map(buildMemberRef), score: scoreLineup(lineup, opponentTeam, leadPairs)}))
    .sort((left, right) => right.score - left.score)[0];
  return best || {members: team.map(buildMemberRef), score: 0};
}

function summarizeThreats(team, opponentTeam) {
  return team.map((member) => ({
    member: buildMemberRef(member),
    threats: opponentTeam
      .map((foe) => ({member: buildMemberRef(foe), ...getPressureSnapshot(foe, member)}))
      .sort((left, right) => right.score - left.score)
      .slice(0, PREVIEW_LIMIT),
  }));
}

function summarizeAnswers(team, opponentTeam) {
  return opponentTeam.map((foe) => ({
    member: buildMemberRef(foe),
    answers: team
      .map((ally) => ({member: buildMemberRef(ally), ...getAnswerSnapshot(ally, foe)}))
      .sort((left, right) => right.score - left.score)
      .slice(0, PREVIEW_LIMIT),
  }));
}

function summarizeOverview(team, opponentTeam, speedLines, leadPairs, recommendedFour) {
  return {
    allyCount: team.length,
    opponentCount: opponentTeam.length,
    speedLineCount: speedLines.length,
    bestLead: leadPairs[0] || null,
    recommendedFour,
  };
}

export function analyzeMatchup(team = [], opponentTeam = []) {
  if (!team.length || !opponentTeam.length) {
    return null;
  }
  const speedLines = calculateSpeedLineTiers([
    ...getTaggedTeam(team, "ally"),
    ...getTaggedTeam(opponentTeam, "opponent"),
  ]);
  const leadPairs = summarizeLeadPairs(team, opponentTeam);
  const recommendedFour = summarizeRecommendedFour(team, opponentTeam, leadPairs);
  return {
    overview: summarizeOverview(team, opponentTeam, speedLines, leadPairs, recommendedFour),
    speedLines,
    leadPairs,
    recommendedFour,
    allyThreats: summarizeThreats(team, opponentTeam),
    opponentAnswers: summarizeAnswers(team, opponentTeam),
  };
}
