function createBattleRecordError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}


const RESULT_VALUES = new Set(["win", "loss", "timeout"]);
const WEATHER_VALUES = new Set([null, "sun", "rain", "snow", "sand"]);
const TERRAIN_VALUES = new Set([null, "electric", "grassy", "misty", "psychic"]);
const FAILURE_TAGS = new Set([
  "speedTier",
  "damageOutput",
  "bulkInsufficient",
  "itemMissed",
  "megaMatchup",
  "executionError",
  "switchTiming",
  "abilityMissed",
  "protectMissed",
  "lineupBad",
  "synergyBroken",
  "weatherTerrainCounter",
  "other",
]);

export const BATTLE_RESULTS = ["win", "loss", "timeout"];
export const BATTLE_WEATHERS = ["sun", "rain", "snow", "sand"];
export const BATTLE_TERRAINS = ["electric", "grassy", "misty", "psychic"];
export const BATTLE_FAILURE_TAGS = [
  "speedTier",
  "damageOutput",
  "bulkInsufficient",
  "itemMissed",
  "megaMatchup",
  "executionError",
  "switchTiming",
  "abilityMissed",
  "protectMissed",
  "lineupBad",
  "synergyBroken",
  "weatherTerrainCounter",
  "other",
];
export const BATTLE_SCHEMA_VERSION = 1;

function generateBattleId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `battle:${ts}:${rand}`;
}

function cloneKeyKo(ko) {
  return {
    turn: Number.isFinite(ko?.turn) ? Number(ko.turn) : null,
    attacker: String(ko?.attacker || ""),
    target: String(ko?.target || ""),
    note: String(ko?.note || ""),
  };
}

export function createBattleRecord(input = {}) {
  const now = Date.now();
  return {
    id: input.id || generateBattleId(),
    createdAt: Number.isFinite(input.createdAt) ? Number(input.createdAt) : now,
    updatedAt: Number.isFinite(input.updatedAt) ? Number(input.updatedAt) : now,
    schemaVersion: BATTLE_SCHEMA_VERSION,
    teamId: String(input.teamId || ""),
    teamLabel: String(input.teamLabel || ""),
    ourLineup: Array.isArray(input.ourLineup) ? input.ourLineup.map(String) : [],
    ourLead: Array.isArray(input.ourLead) ? input.ourLead.map(String) : [],
    ourMvp: input.ourMvp ? String(input.ourMvp) : null,
    ourMegaUsed: input.ourMegaUsed ? String(input.ourMegaUsed) : null,
    opponentSavedId: input.opponentSavedId ? String(input.opponentSavedId) : null,
    opponentLabel: String(input.opponentLabel || ""),
    opponentTeam: Array.isArray(input.opponentTeam) ? input.opponentTeam.map(String) : [],
    opponentLineup: Array.isArray(input.opponentLineup) ? input.opponentLineup.map(String) : [],
    opponentLead: Array.isArray(input.opponentLead) ? input.opponentLead.map(String) : [],
    opponentMegaUsed: input.opponentMegaUsed ? String(input.opponentMegaUsed) : null,
    result: RESULT_VALUES.has(input.result) ? input.result : "loss",
    scoreOur: Number.isFinite(input.scoreOur) ? Number(input.scoreOur) : null,
    scoreTheir: Number.isFinite(input.scoreTheir) ? Number(input.scoreTheir) : null,
    field: {
      weather: WEATHER_VALUES.has(input.field?.weather ?? null) ? input.field?.weather ?? null : null,
      terrain: TERRAIN_VALUES.has(input.field?.terrain ?? null) ? input.field?.terrain ?? null : null,
    },
    keyKos: Array.isArray(input.keyKos) ? input.keyKos.map(cloneKeyKo) : [],
    failureTags: Array.isArray(input.failureTags)
      ? input.failureTags.filter((tag) => FAILURE_TAGS.has(tag))
      : [],
    notes: String(input.notes || ""),
  };
}

export function validateBattleRecord(record) {
  if (!record || typeof record !== "object") {
    throw createBattleRecordError("INVALID_RECORD", "Battle record is not an object.");
  }
  if (!record.teamId) {
    throw createBattleRecordError("INVALID_TEAM", "Battle record missing teamId.");
  }
  if (!Array.isArray(record.ourLineup) || record.ourLineup.length !== 4) {
    throw createBattleRecordError("INVALID_LINEUP", "ourLineup must have exactly 4 species.");
  }
  if (!Array.isArray(record.ourLead) || record.ourLead.length !== 2) {
    throw createBattleRecordError("INVALID_LEAD", "ourLead must have exactly 2 species.");
  }
  const lineupSet = new Set(record.ourLineup);
  if (!record.ourLead.every((id) => lineupSet.has(id))) {
    throw createBattleRecordError("INVALID_LEAD", "ourLead must be a subset of ourLineup.");
  }
  if (!Array.isArray(record.opponentTeam) || record.opponentTeam.length === 0 || record.opponentTeam.length > 6) {
    throw createBattleRecordError("INVALID_OPPONENT_TEAM", "opponentTeam length must be 1-6.");
  }
  if (!Array.isArray(record.opponentLineup) || record.opponentLineup.length !== 4) {
    throw createBattleRecordError("INVALID_OPPONENT_LINEUP", "opponentLineup must have exactly 4 species.");
  }
  if (!RESULT_VALUES.has(record.result)) {
    throw createBattleRecordError("INVALID_RESULT", "result must be win/loss/timeout.");
  }
  return record;
}

export function upsertBattleRecord(state, record) {
  if (!Array.isArray(state.battleRecords)) {
    state.battleRecords = [];
  }
  const idx = state.battleRecords.findIndex((entry) => entry.id === record.id);
  const stamped = {...record, updatedAt: Date.now()};
  if (idx >= 0) {
    state.battleRecords.splice(idx, 1, stamped);
  } else {
    state.battleRecords.push(stamped);
  }
  return stamped;
}

export function removeBattleRecord(state, id) {
  if (!Array.isArray(state.battleRecords)) {
    state.battleRecords = [];
    return false;
  }
  const idx = state.battleRecords.findIndex((entry) => entry.id === id);
  if (idx < 0) return false;
  state.battleRecords.splice(idx, 1);
  return true;
}

export function findBattleRecord(state, id) {
  if (!Array.isArray(state.battleRecords)) return null;
  return state.battleRecords.find((entry) => entry.id === id) || null;
}

export function migrateBattleRecord(raw) {
  return createBattleRecord(raw || {});
}
