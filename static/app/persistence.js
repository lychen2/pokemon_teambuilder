const STORAGE_KEY = "poke-type:builder-state:v2";
const LEGACY_STORAGE_KEYS = ["poke-type:builder-state:v1"];
const CURRENT_SCHEMA_VERSION = 2;
const PERSIST_DELAY_MS = 120;

export const PERSIST_SIZE_WARNING_BYTES = 4 * 1024 * 1024;

let persistHandle = null;

function clearScheduledPersist() {
  if (persistHandle === null) {
    return;
  }
  if (typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(persistHandle);
  } else {
    window.clearTimeout(persistHandle);
  }
  persistHandle = null;
}

function buildStatePayload(state) {
  return {
    library: state.library,
    team: state.team,
    opponentTeam: state.opponentTeam.map((entry) => ({
      speciesId: entry.speciesId,
      selectedConfigId: entry.selectedConfigId || "",
      pinned: Boolean(entry.pinned),
    })),
    activeView: state.activeView,
    iconScheme: state.iconScheme,
    recommendPreferences: state.recommendPreferences,
    recommendWeights: state.recommendWeights,
    recommendBiasAuto: state.recommendBiasAuto,
    dismissedRecommendationKeys: state.dismissedRecommendationKeys,
    savedTeams: state.savedTeams,
    savedOpponentTeams: state.savedOpponentTeams,
    language: state.language,
    damage: {
      attackerId: state.damage.attackerId,
      defenderId: state.damage.defenderId,
      focusSide: state.damage.focusSide,
      scanMode: state.damage.scanMode,
      field: state.damage.field,
    },
  };
}

function buildStateEnvelope(payload) {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    payload,
  };
}

function createPersistenceError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

function parsePersistedText(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw createPersistenceError("INVALID_JSON", "Invalid persisted JSON.", {cause: error});
  }
}

function normalizePersistedPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw createPersistenceError("INVALID_STATE", "Persisted payload is not an object.");
  }
  return payload;
}

export function migratePersistedState(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw createPersistenceError("INVALID_STATE", "Persisted state is not an object.");
  }
  if (!("schemaVersion" in parsed)) {
    return normalizePersistedPayload(parsed);
  }
  if (parsed.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw createPersistenceError("UNSUPPORTED_SCHEMA_VERSION", "Persisted state uses a newer schema.", {
      schemaVersion: parsed.schemaVersion,
    });
  }
  if (parsed.schemaVersion === CURRENT_SCHEMA_VERSION) {
    return normalizePersistedPayload(parsed.payload);
  }
  throw createPersistenceError("UNSUPPORTED_SCHEMA_VERSION", "Persisted state uses an unsupported schema.", {
    schemaVersion: parsed.schemaVersion,
  });
}

function readPersistedRawValue() {
  const keys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
  for (const key of keys) {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      return raw;
    }
  }
  return null;
}

export function loadPersistedState() {
  try {
    const raw = readPersistedRawValue();
    if (!raw) {
      return null;
    }
    return migratePersistedState(parsePersistedText(raw));
  } catch (error) {
    console.error("读取本地配置失败", error);
    return null;
  }
}

export function estimatePersistSize(state) {
  return JSON.stringify(buildStateEnvelope(buildStatePayload(state))).length;
}

export function persistState(state, options = {}) {
  clearScheduledPersist();
  try {
    const envelope = buildStateEnvelope(buildStatePayload(state));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    options.onPersisted?.(envelope);
    return true;
  } catch (error) {
    options.onError?.(error);
    return false;
  }
}

export function schedulePersistState(state, options = {}) {
  clearScheduledPersist();
  const callback = () => {
    persistHandle = null;
    persistState(state, options);
  };
  if (typeof window.requestIdleCallback === "function") {
    persistHandle = window.requestIdleCallback(callback, {timeout: PERSIST_DELAY_MS});
    return;
  }
  persistHandle = window.setTimeout(callback, PERSIST_DELAY_MS);
}

export function flushPersistState(state, options = {}) {
  persistState(state, options);
}

export function clearPersistedState() {
  clearScheduledPersist();
  try {
    [STORAGE_KEY, ...LEGACY_STORAGE_KEYS].forEach((key) => window.localStorage.removeItem(key));
  } catch (error) {
    console.error("清理本地配置失败", error);
  }
}

export function exportFullState(state) {
  const serialized = JSON.stringify(buildStateEnvelope(buildStatePayload(state)), null, 2);
  return new Blob([serialized], {type: "application/json;charset=utf-8"});
}

export function importFullState(text) {
  return migratePersistedState(parsePersistedText(text));
}
