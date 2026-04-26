import {compareInitiative, getMoveEffectiveness} from "./battle-semantics.js";
import {hasMove} from "./team-roles.js";
import {normalizeName} from "./utils.js";

const SPEED_CONTROL_MOVES = new Set(["icywind", "electroweb", "thunderwave", "nuzzle", "glare", "stunspore"]);
const REDIRECTION_MOVES = new Set(["followme", "ragepowder"]);

function getDisplayName(config = {}) {
  return config.displayName || config.speciesName || "Unknown";
}

function findMove(config, predicate) {
  return (config.moves || []).find((move) => predicate(normalizeName(move.name), move)) || null;
}

function getBestAttackAction(attacker, opponents, fieldState) {
  const attackMoves = (attacker.moves || []).filter((move) => move.category !== "Status");
  const fallback = {actorId: attacker.id, moveName: attacker.moveNames?.[0] || "", targetName: getDisplayName(opponents[0]), targetSpeciesId: opponents[0]?.speciesId || "", reasonKey: "matchup.planReasonPressure"};
  if (!attackMoves.length || !opponents.length) return fallback;
  const scored = opponents.flatMap((opponent) => attackMoves.map((move) => {
    const effectiveness = getMoveEffectiveness(move, attacker, opponent, {fieldState, side: "ally", defenderSide: "opponent"});
    const speedBonus = compareInitiative(attacker, opponent, fieldState, "ally", "opponent") > 0 ? 2 : 0;
    return {move, opponent, score: effectiveness * 12 + speedBonus};
  }));
  const best = scored.sort((left, right) => right.score - left.score)[0] || null;
  if (!best) return fallback;
  return {actorId: attacker.id, moveName: best.move.name, targetName: getDisplayName(best.opponent), targetSpeciesId: best.opponent.speciesId || "", reasonKey: "matchup.planReasonPressure"};
}

function getThreatTarget(opponents, defender, fieldState) {
  if (!opponents.length) return null;
  const scores = opponents.map((opponent) => {
    const best = (opponent.moves || [])
      .filter((move) => move.category !== "Status")
      .reduce((score, move) => Math.max(score, getMoveEffectiveness(move, opponent, defender, {fieldState, side: "opponent", defenderSide: "ally"}) * 12), 0);
    const speedBonus = compareInitiative(opponent, defender, fieldState, "opponent", "ally") > 0 ? 2 : 0;
    return {opponent, score: best + speedBonus};
  });
  return scores.sort((left, right) => right.score - left.score)[0]?.opponent || opponents[0];
}

function buildFieldAction(actor, moveName, reasonKey) {
  return {actorId: actor.id, moveName, targetName: "", targetSpeciesId: "", targetLabelKey: "matchup.planTargetField", reasonKey};
}

function buildPartnerAction(actor, moveName, partner, reasonKey) {
  return {actorId: actor.id, moveName, targetName: getDisplayName(partner), targetSpeciesId: partner.speciesId || "", reasonKey};
}

function buildFakeOutPlan(fakeOutUser, partner, opponents, fieldState) {
  const target = getThreatTarget(opponents, partner, fieldState);
  if (!target) return null;
  const followUp = hasMove(partner, "Trick Room")
    ? buildFieldAction(partner, "Trick Room", "matchup.planReasonTrickRoom")
    : getBestAttackAction(partner, opponents, fieldState);
  return [
    {actorId: fakeOutUser.id, moveName: "Fake Out", targetName: getDisplayName(target), targetSpeciesId: target.speciesId || "", reasonKey: "matchup.planReasonFakeOut"},
    followUp,
  ];
}

function buildSupportPlan(left, right, opponents, fieldState) {
  const leftTailwind = findMove(left, (moveId) => moveId === "tailwind");
  if (leftTailwind) return [buildFieldAction(left, leftTailwind.name, "matchup.planReasonTailwind"), getBestAttackAction(right, opponents, fieldState)];
  const leftSpeedControl = findMove(left, (moveId) => SPEED_CONTROL_MOVES.has(moveId));
  if (leftSpeedControl) return [buildFieldAction(left, leftSpeedControl.name, "matchup.planReasonSpeedControl"), getBestAttackAction(right, opponents, fieldState)];
  const leftHelpingHand = findMove(left, (moveId) => moveId === "helpinghand");
  if (leftHelpingHand) return [buildPartnerAction(left, leftHelpingHand.name, right, "matchup.planReasonHelpingHand"), getBestAttackAction(right, opponents, fieldState)];
  const leftRedirect = findMove(left, (moveId) => REDIRECTION_MOVES.has(moveId));
  if (leftRedirect) {
    const partnerAction = hasMove(right, "Trick Room")
      ? buildFieldAction(right, "Trick Room", "matchup.planReasonTrickRoom")
      : getBestAttackAction(right, opponents, fieldState);
    return [buildPartnerAction(left, leftRedirect.name, right, "matchup.planReasonRedirection"), partnerAction];
  }
  return null;
}

function buildDoubleAttackPlan(pair, opponents, fieldState) {
  return pair.map((member) => getBestAttackAction(member, opponents, fieldState));
}

export function buildLeadTurnOnePlan(pair = [], opponentTeam = [], fieldState = {}) {
  if (pair.length !== 2 || !opponentTeam.length) return [];
  const [left, right] = pair;
  const fakeOutPlan = hasMove(left, "Fake Out")
    ? buildFakeOutPlan(left, right, opponentTeam, fieldState)
    : hasMove(right, "Fake Out")
      ? buildFakeOutPlan(right, left, opponentTeam, fieldState)
      : null;
  if (fakeOutPlan) return fakeOutPlan;
  const supportPlan = buildSupportPlan(left, right, opponentTeam, fieldState)
    || buildSupportPlan(right, left, opponentTeam, fieldState);
  if (supportPlan) return supportPlan;
  return buildDoubleAttackPlan(pair, opponentTeam, fieldState);
}
