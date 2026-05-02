import {
  compareInitiative,
  getBestMoveEffectiveness,
  getEffectiveSpeed,
  getFieldFlags,
  getMovePriority,
  getMoveEffectiveness,
  hasPriorityBlockingAbility,
  isSpreadMove,
} from "./battle-semantics.js";
import {calculateSpeedLineTiers} from "./data.js";
import {buildLeadTurnOnePlan} from "./lead-turn-plan.js";
import {buildMatchupBoard} from "./matchup-board-data.js";
import {getAttackBias, getRoleSummaryIds, getUtilityRoles, hasMove} from "./team-roles.js";
import {countMegaConfigs} from "./utils.js";

const PREVIEW_LIMIT = 3;
const FOUR_SELECTION_SIZE = 4;
const CACHE_LIMIT = 16;
const DUPLICATE_WEATHER_LEAD_PENALTY = 3;
const DUPLICATE_WEATHER_LINEUP_PENALTY = 2.5;
const EXTRA_MEGA_LEAD_PENALTY = 12;
const EXTRA_MEGA_LINEUP_PENALTY = 18;
const LEAD_ROLE_BONUS = Object.freeze({
  fakeout: 4,
  tailwind: 3,
  speedboostself: 2.5,
  speeddebuff: 1.5,
  paralysiscontrol: 1.25,
  intimidate: 2,
  redirection: 2,
  guard: 1.5,
  disruption: 1.5,
  pivot: 1,
  weather: 1,
});

const MATCHUP_CACHE = new Map();

function getVariantConfigs(entry) {
  if (entry?.selectedConfigId && Array.isArray(entry?.configs)) {
    const selectedConfig = entry.configs.find((config) => config.id === entry.selectedConfigId);
    if (selectedConfig) return [selectedConfig];
  }
  return Array.isArray(entry?.configs) && entry.configs.length ? entry.configs : [entry].filter(Boolean);
}

function isGroupedEntry(entry) {
  return Array.isArray(entry?.configs) && entry.configs.length > 0;
}

function getMemberLabel(entry) {
  if (isGroupedEntry(entry)) return entry?.speciesName || entry?.displayName || "Unknown";
  return entry?.displayLabel || entry?.displayName || entry?.speciesName || "Unknown";
}

function averageValue(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function averageBreakdown(items = []) {
  const keys = ["pressure", "speed", "priority", "utility", "resistance", "intimidate", "guard"];
  return Object.fromEntries(keys.map((key) => [key, averageValue(items.map((item) => item?.[key]))]));
}

function getOffenseStat(config) {
  return Math.max(Number(config.stats?.atk || 0), Number(config.stats?.spa || 0));
}

function getBattleKey(config = {}, side = "ally") {
  return side === "opponent" ? String(config.speciesId || config.id || "") : String(config.id || config.speciesId || "");
}

function buildMemberRef(config, side, fieldState) {
  const variants = getVariantConfigs(config);
  const sample = variants[0] || config;
  return {
    id: isGroupedEntry(config) ? config.speciesId : config.id,
    speciesId: config.speciesId || "",
    speciesName: config.speciesName || getMemberLabel(config),
    label: getMemberLabel(config),
    note: config.note || "",
    speed: Math.max(...variants.map((entry) => getEffectiveSpeed(entry, side, fieldState)), 0),
    variantCount: variants.length,
    battleFlags: getFieldFlags(sample, side, fieldState),
  };
}

function getTaggedTeam(team = [], side, fieldState) {
  return team.flatMap((entry) => getVariantConfigs(entry).map((config) => ({
    ...config,
    matchupSide: side,
    battleFlags: getFieldFlags(config, side, fieldState),
  })));
}

function countRoleMembers(team = [], roleId) {
  return team.reduce((count, config) => count + (getUtilityRoles(config).includes(roleId) ? 1 : 0), 0);
}

function getDuplicateRolePenalty(team = [], roleId, penaltyPerExtra) {
  return Math.max(0, countRoleMembers(team, roleId) - 1) * penaltyPerExtra;
}

function getExtraMegaPenalty(team = [], penaltyPerExtra = 0) {
  return Math.max(0, countMegaConfigs(team) - 1) * penaltyPerExtra;
}

function getLeadUtilityBonus(pair = []) {
  const roles = new Set(pair.flatMap((config) => getUtilityRoles(config)));
  const roleBonus = [...roles].reduce((sum, roleId) => sum + Number(LEAD_ROLE_BONUS[roleId] || 0), 0);
  return roleBonus - getDuplicateRolePenalty(pair, "weather", DUPLICATE_WEATHER_LEAD_PENALTY);
}

function getPriorityBonus(attacker, defender, fieldState) {
  const defenderRoles = new Set(getUtilityRoles(defender));
  const blocked = hasPriorityBlockingAbility(defender) || defenderRoles.has("guard");
  if (blocked) return 0;
  return (attacker.moves || []).reduce((best, move) => {
    const priority = getMovePriority(move, attacker);
    const isStab = (attacker.types || []).includes(move.type);
    if (priority <= 0 || !isStab) return best;
    const effectiveness = getMoveEffectiveness(move, attacker, defender, {fieldState, side: "ally", defenderSide: "opponent"});
    return effectiveness > 0 ? Math.max(best, 2.5) : best;
  }, 0);
}

function getSnapshotUtilityScore(attacker, roles) {
  let score = 0;
  if (roles.has("fakeout")) score += 2;
  if (roles.has("disruption")) score += 1.5;
  if (roles.has("speedboostself") || roles.has("tailwind")) score += 1.2;
  if (roles.has("speeddebuff") || roles.has("paralysiscontrol")) score += 0.8;
  if (hasMove(attacker, "Helping Hand")) score += 0.6;
  return score;
}

function buildPressureSnapshot(attacker, defender, context) {
  const effectiveness = getBestMoveEffectiveness(attacker, defender, {
    fieldState: context.fieldState,
    side: context.attackerSide,
    defenderSide: context.defenderSide,
  });
  const roles = new Set(getUtilityRoles(attacker));
  const speed = getEffectiveSpeed(attacker, context.attackerSide, context.fieldState);
  const attackStat = getOffenseStat(attacker);
  const speedBonus = compareInitiative(attacker, defender, context.fieldState, context.attackerSide, context.defenderSide) > 0 ? 4 : 0;
  const priorityBonus = getPriorityBonus(attacker, defender, context.fieldState);
  const utilityBonus = getSnapshotUtilityScore(attacker, roles);
  const pressure = effectiveness * 12 + attackStat / 18;
  return {
    score: pressure + speedBonus + priorityBonus + utilityBonus,
    effectiveness,
    speed,
    breakdown: {
      pressure,
      speed: speedBonus,
      priority: priorityBonus,
      utility: utilityBonus,
    },
  };
}

function buildAnswerSnapshot(candidate, target, context) {
  const pressure = buildPressureSnapshot(candidate, target, context);
  const retaliation = buildPressureSnapshot(target, candidate, {
    ...context,
    attackerSide: context.defenderSide,
    defenderSide: context.attackerSide,
  });
  const incoming = getBestMoveEffectiveness(target, candidate, {
    fieldState: context.fieldState,
    side: context.defenderSide,
    defenderSide: context.attackerSide,
  });
  const roles = new Set(getUtilityRoles(candidate));
  const resistanceBonus = incoming < 1 ? 4 : 0;
  const immunityBonus = incoming === 0 ? 2 : 0;
  const intimidateBonus = roles.has("intimidate") && getAttackBias(target) === "physical" ? 3 : 0;
  const guardBonus = roles.has("guard") ? 1.5 : 0;
  return {
    score: pressure.score - retaliation.score * 0.6 + resistanceBonus + immunityBonus + intimidateBonus + guardBonus,
    effectiveness: pressure.effectiveness,
    resistance: incoming,
    speed: pressure.speed,
    breakdown: {
      ...pressure.breakdown,
      resistance: resistanceBonus + immunityBonus,
      intimidate: intimidateBonus,
      guard: guardBonus,
    },
  };
}

function aggregateSnapshots(snapshots = []) {
  return {
    score: averageValue(snapshots.map((snapshot) => snapshot.score)),
    effectiveness: averageValue(snapshots.map((snapshot) => snapshot.effectiveness)),
    resistance: averageValue(snapshots.map((snapshot) => snapshot.resistance)),
    speed: Math.max(...snapshots.map((snapshot) => snapshot.speed), 0),
    breakdown: averageBreakdown(snapshots.map((snapshot) => snapshot.breakdown)),
  };
}

function buildMemberSnapshotKey(attacker, defender, context, type) {
  return [
    type,
    context.attackerSide,
    context.defenderSide,
    getBattleKey(attacker, context.attackerSide),
    getBattleKey(defender, context.defenderSide),
  ].join(":");
}

function getPressureAgainstMember(attacker, defender, context) {
  const key = buildMemberSnapshotKey(attacker, defender, context, "pressure");
  if (context.pressureCache.has(key)) return context.pressureCache.get(key);
  const snapshot = aggregateSnapshots(
    getVariantConfigs(attacker).flatMap((attackerConfig) => {
      return getVariantConfigs(defender).map((defenderConfig) => {
        return buildPressureSnapshot(attackerConfig, defenderConfig, context);
      });
    }),
  );
  context.pressureCache.set(key, snapshot);
  return snapshot;
}

function getAnswerIntoMember(candidate, target, context) {
  const key = buildMemberSnapshotKey(candidate, target, context, "answer");
  if (context.answerCache.has(key)) return context.answerCache.get(key);
  const snapshot = aggregateSnapshots(
    getVariantConfigs(candidate).flatMap((candidateConfig) => {
      return getVariantConfigs(target).map((targetConfig) => {
        return buildAnswerSnapshot(candidateConfig, targetConfig, context);
      });
    }),
  );
  context.answerCache.set(key, snapshot);
  return snapshot;
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
  if (team.length < size) return [];
  walk(0, []);
  return entries;
}

function getSpreadPressureCount(pair = []) {
  return pair.reduce((count, config) => {
    return count + (config.moves || []).filter((move) => isSpreadMove(move)).length;
  }, 0);
}

function getPairSupportBreakdown(myPair, theirPair, context) {
  const hasRedirection = myPair.some((config) => getUtilityRoles(config).includes("redirection"));
  const hasGuard = myPair.some((config) => getUtilityRoles(config).includes("guard"));
  const hasHelpingHand = myPair.some((config) => hasMove(config, "Helping Hand"));
  const hasProtect = myPair.some((config) => hasMove(config, "Protect"));
  const offensivePartner = myPair.reduce((best, config) => Math.max(best, getOffenseStat(config)), 0);
  const highExposure = myPair.some((ally) => {
    return theirPair.some((foe) => getPressureAgainstMember(foe, ally, {
      ...context,
      attackerSide: "opponent",
      defenderSide: "ally",
    }).effectiveness >= 2);
  });
  return {
    redirection: hasRedirection && highExposure ? 2.2 : 0,
    wideGuard: hasGuard ? getSpreadPressureCount(theirPair) * 1.1 : 0,
    helpingHand: hasHelpingHand && offensivePartner >= 120 ? 1.6 : 0,
    protect: hasProtect && highExposure ? 1.2 : 0,
  };
}

function scorePairIntoPair(myPair, theirPair, context) {
  const pairKey = [
    myPair.map((entry) => entry.id).sort().join("+"),
    theirPair.map((entry) => entry.speciesId || entry.id).sort().join("+"),
  ].join("::");
  if (context.pairCache.has(pairKey)) return context.pairCache.get(pairKey);
  const pressure = theirPair.reduce((sum, foe) => {
    return sum + Math.max(...myPair.map((ally) => getAnswerIntoMember(ally, foe, context).score));
  }, 0);
  const exposure = myPair.reduce((sum, ally) => {
    return sum + Math.max(...theirPair.map((foe) => getPressureAgainstMember(foe, ally, {
      ...context,
      attackerSide: "opponent",
      defenderSide: "ally",
    }).score));
  }, 0);
  const support = getPairSupportBreakdown(myPair, theirPair, context);
  const megaPenalty = getExtraMegaPenalty(myPair, EXTRA_MEGA_LEAD_PENALTY);
  const result = {
    score: pressure - exposure * 0.65 + Object.values(support).reduce((sum, value) => sum + value, 0) - megaPenalty,
    breakdown: {
      pressure,
      exposure,
      ...support,
    },
  };
  context.pairCache.set(pairKey, result);
  return result;
}

function hasLeadMembers(lineup, leadPair) {
  const lineupIds = new Set(lineup.map((config) => config.id));
  return leadPair.every((config) => lineupIds.has(config.id));
}

function scoreLineup(lineup, opponentTeam, leadScore, context) {
  const answerScore = opponentTeam.reduce((sum, foe) => {
    return sum + Math.max(...lineup.map((ally) => getAnswerIntoMember(ally, foe, context).score));
  }, 0);
  const exposure = lineup.reduce((sum, ally) => {
    return sum + Math.max(...opponentTeam.map((foe) => getPressureAgainstMember(foe, ally, {
      ...context,
      attackerSide: "opponent",
      defenderSide: "ally",
    }).score));
  }, 0);
  const roles = new Set(lineup.flatMap((config) => getUtilityRoles(config)));
  const weatherPenalty = getDuplicateRolePenalty(lineup, "weather", DUPLICATE_WEATHER_LINEUP_PENALTY);
  const megaPenalty = getExtraMegaPenalty(lineup, EXTRA_MEGA_LINEUP_PENALTY);
  return answerScore - exposure * 0.45 + roles.size * 0.75 + leadScore * 0.5 - weatherPenalty - megaPenalty;
}

function summarizeLeadPair(pair, opponentPairs, context) {
  const pairScores = opponentPairs.map((enemyPair) => scorePairIntoPair(pair, enemyPair, context));
  const averageScore = averageValue(pairScores.map((entry) => entry.score));
  const averageBreakdown = {
    pressure: averageValue(pairScores.map((entry) => entry.breakdown.pressure)),
    exposure: averageValue(pairScores.map((entry) => entry.breakdown.exposure)),
    redirection: averageValue(pairScores.map((entry) => entry.breakdown.redirection)),
    wideGuard: averageValue(pairScores.map((entry) => entry.breakdown.wideGuard)),
    helpingHand: averageValue(pairScores.map((entry) => entry.breakdown.helpingHand)),
    protect: averageValue(pairScores.map((entry) => entry.breakdown.protect)),
  };
  const keyTargets = opponentPairs.length
    ? [...new Set(opponentPairs.flatMap((enemyPair) => {
      const target = enemyPair.map((foe) => ({
        foe,
        score: Math.max(...pair.map((ally) => getAnswerIntoMember(ally, foe, context).score)),
      })).sort((left, right) => right.score - left.score)[0]?.foe;
      return target ? [target] : [];
    }))].slice(0, PREVIEW_LIMIT).map((entry) => buildMemberRef(entry, "opponent", context.fieldState))
    : [];
  return {
    members: pair.map((entry) => buildMemberRef(entry, "ally", context.fieldState)),
    score: averageScore + getLeadUtilityBonus(pair),
    targets: keyTargets,
    roles: [...new Set(pair.flatMap((config) => [
      ...getRoleSummaryIds(config, 6),
      ...getUtilityRoles(config),
    ]))],
    breakdown: averageBreakdown,
    turnOnePlan: buildLeadTurnOnePlan(pair, context.opponentTeam, context.fieldState),
  };
}

function summarizeLeadLineup(pair, team, opponentTeam, leadScore, context) {
  const lineupSize = Math.min(FOUR_SELECTION_SIZE, team.length);
  const lineups = getPairEntries(team, lineupSize).filter((lineup) => hasLeadMembers(lineup, pair));
  const best = lineups.map((lineup) => ({
    lineupMembers: lineup.map((member) => buildMemberRef(member, "ally", context.fieldState)),
    backline: lineup.filter((member) => !pair.includes(member)).map((member) => buildMemberRef(member, "ally", context.fieldState)),
    lineupScore: scoreLineup(lineup, opponentTeam, leadScore, context),
  })).sort((left, right) => right.lineupScore - left.lineupScore)[0];
  return best || {lineupMembers: pair.map((entry) => buildMemberRef(entry, "ally", context.fieldState)), backline: [], lineupScore: leadScore};
}

function summarizeLeadPairs(team, opponentTeam, context) {
  const myPairs = getPairEntries(team, 2);
  const opponentPairs = getPairEntries(opponentTeam, 2);
  return myPairs.map((pair) => {
    const summary = summarizeLeadPair(pair, opponentPairs, context);
    return {...summary, ...summarizeLeadLineup(pair, team, opponentTeam, summary.score, context)};
  }).sort((left, right) => right.score - left.score || right.lineupScore - left.lineupScore).slice(0, PREVIEW_LIMIT);
}

function summarizeThreats(team, opponentTeam, context) {
  return team.map((member) => ({
    member: buildMemberRef(member, "ally", context.fieldState),
    threats: opponentTeam.map((foe) => ({
      member: buildMemberRef(foe, "opponent", context.fieldState),
      ...getPressureAgainstMember(foe, member, {
        ...context,
        attackerSide: "opponent",
        defenderSide: "ally",
      }),
    })).sort((left, right) => right.score - left.score).slice(0, PREVIEW_LIMIT),
  }));
}

function summarizeAnswers(team, opponentTeam, context) {
  return opponentTeam.map((foe) => ({
    member: buildMemberRef(foe, "opponent", context.fieldState),
    answers: team.map((ally) => ({
      member: buildMemberRef(ally, "ally", context.fieldState),
      ...getAnswerIntoMember(ally, foe, context),
    })).sort((left, right) => right.score - left.score).slice(0, PREVIEW_LIMIT),
  }));
}

function summarizeOverview(team, opponentTeam, speedLines, fieldState) {
  return {
    allyCount: team.length,
    opponentCount: opponentTeam.length,
    speedLineCount: speedLines.length,
    trickRoom: Boolean(fieldState?.trickRoom),
  };
}

function buildBoardMatrix(team, opponentTeam, context) {
  const allyHeaders = team.map((entry) => buildMemberRef(entry, "ally", context.fieldState));
  const opponentHeaders = opponentTeam.map((entry) => buildMemberRef(entry, "opponent", context.fieldState));
  const rows = opponentTeam.map((foe) => {
    const opponent = buildMemberRef(foe, "opponent", context.fieldState);
    const cells = team.map((ally) => {
      const allyAnswer = getAnswerIntoMember(ally, foe, context);
      const foeAnswer = getAnswerIntoMember(foe, ally, {
        ...context,
        attackerSide: "opponent",
        defenderSide: "ally",
      });
      return {
        allyId: ally.id,
        opponentId: foe.speciesId || foe.id,
        allySpeciesId: ally.speciesId || "",
        opponentSpeciesId: foe.speciesId || "",
        allyName: getMemberLabel(ally),
        opponentName: getMemberLabel(foe),
        delta: allyAnswer.score - foeAnswer.score,
        allyScore: allyAnswer.score,
        opponentScore: foeAnswer.score,
      };
    });
    return {opponent, cells};
  });
  const maxAbsDelta = Math.max(
    ...rows.flatMap((row) => row.cells.map((cell) => Math.abs(cell.delta))),
    1,
  );
  return {allyHeaders, opponentHeaders, rows, maxAbsDelta};
}

function buildMatchupCacheKey(team = [], opponentTeam = [], fieldState = {}) {
  const allyKey = team.map((entry) => entry.id).join(",");
  const opponentKey = opponentTeam.map((entry) => `${entry.speciesId}:${entry.selectedConfigId || ""}`).join(",");
  const allyFlags = Object.entries(fieldState.allyFlags || {}).map(([key, flags]) => `${key}:${Number(Boolean(flags?.terastallized))}${Number(Boolean(flags?.paralyzed))}`).sort().join(",");
  const opponentFlags = Object.entries(fieldState.opponentFlags || {}).map(([key, flags]) => `${key}:${Number(Boolean(flags?.terastallized))}${Number(Boolean(flags?.paralyzed))}`).sort().join(",");
  return [allyKey, opponentKey, Number(Boolean(fieldState.allyTailwind)), Number(Boolean(fieldState.opponentTailwind)), Number(Boolean(fieldState.trickRoom)), allyFlags, opponentFlags].join("|");
}

function setCachedMatchup(key, value) {
  MATCHUP_CACHE.set(key, value);
  if (MATCHUP_CACHE.size <= CACHE_LIMIT) return;
  const firstKey = MATCHUP_CACHE.keys().next().value;
  MATCHUP_CACHE.delete(firstKey);
}

export function analyzeMatchup(team = [], opponentTeam = [], datasets = null, options = {}) {
  if (!team.length || !opponentTeam.length) return null;
  const fieldState = options.fieldState || {};
  const cacheKey = buildMatchupCacheKey(team, opponentTeam, fieldState);
  if (MATCHUP_CACHE.has(cacheKey)) return MATCHUP_CACHE.get(cacheKey);
  const context = {
    fieldState,
    opponentTeam,
    attackerSide: "ally",
    defenderSide: "opponent",
    pressureCache: new Map(),
    answerCache: new Map(),
    pairCache: new Map(),
  };
  const taggedEntries = [
    ...getTaggedTeam(team, "ally", fieldState),
    ...getTaggedTeam(opponentTeam, "opponent", fieldState),
  ];
  const speedLines = calculateSpeedLineTiers(taggedEntries, {fieldState});
  const leadPairs = summarizeLeadPairs(team, opponentTeam, context);
  const allyThreats = summarizeThreats(team, opponentTeam, context);
  const opponentAnswers = summarizeAnswers(team, opponentTeam, context);
  const result = {
    fieldState,
    overview: summarizeOverview(team, opponentTeam, speedLines, fieldState),
    speedLines,
    leadPairs,
    allyThreats,
    opponentAnswers,
    board: (() => {
      const board = buildMatchupBoard({
      team,
      opponentTeam,
      allyThreats,
      opponentAnswers,
      datasets,
      });
      if (!board) {
        return null;
      }
      return {
        ...board,
        matrix: buildBoardMatrix(team, opponentTeam, context),
      };
    })(),
  };
  setCachedMatchup(cacheKey, result);
  return result;
}
