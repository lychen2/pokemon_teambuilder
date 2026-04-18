const STORAGE_KEY = "poke-type:builder-state:v1";
const PERSIST_DELAY_MS = 120;

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

export function loadPersistedState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch (error) {
    console.error("读取本地配置失败", error);
    return null;
  }
}

export function persistState(state) {
  clearScheduledPersist();
  try {
    const payload = {
      library: state.library,
      team: state.team,
      opponentTeam: state.opponentTeam.map((entry) => ({
        speciesId: entry.speciesId,
        selectedConfigId: entry.selectedConfigId || "",
      })),
      activeView: state.activeView,
      iconScheme: state.iconScheme,
      recommendPreferences: state.recommendPreferences,
      recommendWeights: state.recommendWeights,
      dismissedRecommendationKeys: state.dismissedRecommendationKeys,
      savedTeams: state.savedTeams,
      savedOpponentTeams: state.savedOpponentTeams,
      language: state.language,
      damage: {
        attackerId: state.damage.attackerId,
        defenderId: state.damage.defenderId,
        focusSide: state.damage.focusSide,
        overridePairKey: state.damage.overridePairKey,
        overrides: state.damage.overrides,
        field: state.damage.field,
        statuses: state.damage.statuses,
        healthPercent: state.damage.healthPercent,
        boosts: state.damage.boosts,
        meta: state.damage.meta,
        teraTypes: state.damage.teraTypes,
        moveSelections: state.damage.moveSelections,
      },
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error("保存本地配置失败", error);
  }
}

export function schedulePersistState(state) {
  clearScheduledPersist();
  const callback = () => {
    persistHandle = null;
    persistState(state);
  };
  if (typeof window.requestIdleCallback === "function") {
    persistHandle = window.requestIdleCallback(callback, {timeout: PERSIST_DELAY_MS});
    return;
  }
  persistHandle = window.setTimeout(callback, PERSIST_DELAY_MS);
}

export function flushPersistState(state) {
  persistState(state);
}

export function clearPersistedState() {
  clearScheduledPersist();
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("清理本地配置失败", error);
  }
}
