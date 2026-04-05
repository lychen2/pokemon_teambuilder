const STORAGE_KEY = "poke-type:builder-state:v1";

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
  try {
    const payload = {
      library: state.library,
      team: state.team,
      opponentTeam: state.opponentTeam.map((entry) => ({speciesId: entry.speciesId})),
      activeView: state.activeView,
      savedTeams: state.savedTeams,
      savedOpponentTeams: state.savedOpponentTeams,
      language: state.language,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error("保存本地配置失败", error);
  }
}

export function clearPersistedState() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("清理本地配置失败", error);
  }
}
