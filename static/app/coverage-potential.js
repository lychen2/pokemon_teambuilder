import {getMoveEffectiveness} from "./battle-semantics.js";
import {getLearnsetMap} from "./learnsets.js";
import {normalizeName} from "./utils.js";

const MEMBER_PREVIEW_LIMIT = 3;
const MOVE_PREVIEW_LIMIT = 2;

function createMemberReference(config = {}) {
  return {
    id: config.id,
    speciesId: config.speciesId || "",
    speciesName: config.speciesName || config.displayName || "",
    label: config.displayName || config.speciesName || "",
    note: config.note || "",
    spritePosition: config.spritePosition || null,
  };
}

function getMoveEntry(datasets, moveId) {
  const normalized = normalizeName(moveId);
  if (!normalized) {
    return null;
  }
  return datasets?.moveLookup?.get(normalized) || datasets?.moves?.[normalized] || null;
}

function isDamagingMove(move) {
  return move && move.category !== "Status" && move.type;
}

function sortMoveEntries(left, right) {
  return right.effectiveness - left.effectiveness
    || Number(right.stab) - Number(left.stab)
    || Number(right.basePower || 0) - Number(left.basePower || 0)
    || Number(right.accuracy || 0) - Number(left.accuracy || 0)
    || String(left.name || "").localeCompare(String(right.name || ""), "zh-Hans-CN");
}

function buildMoveEntry(config, move, defendTypes, currentBestEffectiveness, fieldState) {
  const effectiveness = getMoveEffectiveness(
    move,
    config,
    {types: defendTypes},
    {fieldState, side: "ally"},
  );
  if (effectiveness <= currentBestEffectiveness) {
    return null;
  }
  return {
    name: move.name,
    effectiveness,
    basePower: Number(move.basePower || 0),
    accuracy: Number(move.accuracy || 0),
    stab: (config.types || []).includes(move.type),
  };
}

function buildMemberSuggestion(config, spot, datasets, fieldState) {
  const learnset = getLearnsetMap(config.speciesId, datasets, {itemName: config.item}) || {};
  const currentMoveIds = new Set((config.moveNames || []).map((name) => normalizeName(name)));
  const moves = Object.keys(learnset)
    .map((moveId) => getMoveEntry(datasets, moveId))
    .filter((move) => isDamagingMove(move) && !currentMoveIds.has(normalizeName(move.name)))
    .map((move) => buildMoveEntry(config, move, spot.defendTypes, spot.currentBestEffectiveness, fieldState))
    .filter(Boolean)
    .sort(sortMoveEntries)
    .slice(0, MOVE_PREVIEW_LIMIT);
  if (!moves.length) {
    return null;
  }
  return {
    member: createMemberReference(config),
    moves,
    bestEffectiveness: moves[0]?.effectiveness || 0,
  };
}

function sortMemberSuggestions(left, right) {
  return right.bestEffectiveness - left.bestEffectiveness
    || right.moves.length - left.moves.length
    || String(left.member.label || "").localeCompare(String(right.member.label || ""), "zh-Hans-CN");
}

function normalizeBlindSpotEntry(entry = {}) {
  const defendTypes = Array.isArray(entry.types) && entry.types.length
    ? entry.types
    : [entry.type].filter(Boolean);
  return {
    id: defendTypes.join(":") || String(entry.label || ""),
    label: entry.label || defendTypes.join(" / "),
    defendTypes,
    currentBestEffectiveness: Number(entry.effectiveness || 0),
  };
}

export function buildOffensiveGapCards(team = [], blindSpots = [], datasets, fieldState = {}) {
  return blindSpots.map((entry) => {
    const spot = normalizeBlindSpotEntry(entry);
    const suggestions = datasets
      ? team
        .map((config) => buildMemberSuggestion(config, spot, datasets, fieldState))
        .filter(Boolean)
        .sort(sortMemberSuggestions)
        .slice(0, MEMBER_PREVIEW_LIMIT)
      : [];
    const potentialBestEffectiveness = suggestions.reduce((best, item) => {
      return Math.max(best, Number(item.bestEffectiveness || 0));
    }, spot.currentBestEffectiveness);
    return {
      ...spot,
      patchable: suggestions.length > 0,
      potentialBestEffectiveness,
      suggestions,
    };
  });
}
