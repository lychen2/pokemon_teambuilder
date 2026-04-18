import {normalizeName} from "../utils.js";
import {getUsageReferenceMoveEntries} from "../usage.js";

const REFERENCE_MOVE_LIMIT = 6;
const REFERENCE_MOVE_MIN_SHARE = 0.1;
const REFERENCE_MOVE_TOP_LIMIT = 6;

function buildScoringMoveDetails(moveNames = [], datasets) {
  const moveLookup = datasets?.moveLookup;
  if (!moveLookup) {
    return [];
  }
  return moveNames.map((moveName) => {
    const move = moveLookup.get(normalizeName(moveName));
    if (!move) {
      return null;
    }
    return {
      name: move.name,
      type: move.type,
      category: move.category || "Status",
      accuracy: move.accuracy ?? 0,
      basePower: Number(move.basePower || 0),
      shortDesc: move.shortDesc || "",
      flags: move.flags || {},
    };
  }).filter(Boolean);
}

function getExistingMoveNames(candidate) {
  if (Array.isArray(candidate?.moveNames) && candidate.moveNames.length) {
    return candidate.moveNames.filter(Boolean);
  }
  return (candidate?.moves || []).map((move) => move?.name).filter(Boolean);
}

function buildOffensiveTypes(moves = []) {
  return [...new Set(
    moves
      .filter((move) => move.category !== "Status" && Number(move.basePower || 0) > 0)
      .map((move) => move.type)
      .filter(Boolean),
  )];
}

export function enrichCandidateForScoring(candidate, datasets) {
  const existingMoveNames = getExistingMoveNames(candidate);
  if (existingMoveNames.length) {
    return candidate;
  }
  const referenceMoveNames = getUsageReferenceMoveEntries(candidate?.speciesId, datasets, {
    minShare: REFERENCE_MOVE_MIN_SHARE,
    topLimit: REFERENCE_MOVE_TOP_LIMIT,
    finalLimit: REFERENCE_MOVE_LIMIT,
  }).map((entry) => entry.name);
  if (!referenceMoveNames.length) {
    return candidate;
  }
  const moves = buildScoringMoveDetails(referenceMoveNames, datasets);
  return {
    ...candidate,
    moveNames: referenceMoveNames,
    moves,
    offensiveTypes: buildOffensiveTypes(moves),
  };
}
