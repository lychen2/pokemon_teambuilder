const DEFAULT_HISTORY_LIMIT = 20;

function cloneSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}

function createEntry(snapshot) {
  const cloned = cloneSnapshot(snapshot);
  return {
    snapshot: cloned,
    serialized: JSON.stringify(cloned),
  };
}

export function snapshotHistoryState(state) {
  return {
    library: state.library,
    team: state.team,
    opponentTeam: state.opponentTeam,
    savedTeams: state.savedTeams,
    savedOpponentTeams: state.savedOpponentTeams,
  };
}

export function createHistoryStore(limit = DEFAULT_HISTORY_LIMIT) {
  return {
    limit,
    past: [],
    future: [],
    present: null,
  };
}

export function initializeHistory(store, snapshot) {
  store.past = [];
  store.future = [];
  store.present = createEntry(snapshot);
}

export function recordHistory(store, snapshot) {
  const nextEntry = createEntry(snapshot);
  if (!store.present) {
    store.present = nextEntry;
    return false;
  }
  if (store.present.serialized === nextEntry.serialized) {
    return false;
  }
  store.past.push(store.present);
  if (store.past.length > store.limit) {
    store.past.shift();
  }
  store.present = nextEntry;
  store.future = [];
  return true;
}

export function undoHistory(store) {
  if (!store.present || !store.past.length) {
    return null;
  }
  store.future.unshift(store.present);
  store.present = store.past.pop();
  return cloneSnapshot(store.present.snapshot);
}

export function redoHistory(store) {
  if (!store.present || !store.future.length) {
    return null;
  }
  store.past.push(store.present);
  store.present = store.future.shift();
  return cloneSnapshot(store.present.snapshot);
}
