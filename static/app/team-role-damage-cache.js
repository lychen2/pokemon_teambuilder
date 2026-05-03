const STORAGE_KEY = "pokeTypeDamageRoleCache";
const MAX_ENTRIES = 50;
const QUOTA_RETRY_TRIM_RATIO = 0.5;

function safeStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch (_error) {
    return null;
  }
}

function isQuotaError(error) {
  if (!error) return false;
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    if (error.code === 22 || error.code === 1014) return true;
  }
  const name = String(error.name || "");
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

function trimStoreInPlace(store, ratio) {
  const removeCount = Math.max(1, Math.floor(store.order.length * ratio));
  for (let i = 0; i < removeCount; i += 1) {
    const removed = store.order.shift();
    if (removed !== undefined) {
      delete store.values[removed];
    }
  }
}

function readStore() {
  const storage = safeStorage();
  if (!storage) return {order: [], values: {}};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {order: [], values: {}};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {order: [], values: {}};
    return {
      order: Array.isArray(parsed.order) ? parsed.order : [],
      values: parsed.values && typeof parsed.values === "object" ? parsed.values : {},
    };
  } catch (error) {
    console.warn("damage-cache read failed", error);
    return {order: [], values: {}};
  }
}

function writeStore(store) {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    if (isQuotaError(error)) {
      // Cache is rebuildable; trim and retry once. Surface any second
      // failure so callers (and the dev console) see the real cause.
      trimStoreInPlace(store, QUOTA_RETRY_TRIM_RATIO);
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(store));
        console.warn("damage-cache trimmed after quota error", {remaining: store.order.length});
        return;
      } catch (retryError) {
        console.warn("damage-cache write failed after trim", retryError);
        return;
      }
    }
    console.warn("damage-cache write failed", error);
  }
}

function touch(store, key) {
  store.order = store.order.filter((existing) => existing !== key);
  store.order.push(key);
}

function evict(store) {
  while (store.order.length > MAX_ENTRIES) {
    const removed = store.order.shift();
    delete store.values[removed];
  }
}

export function getCached(key) {
  if (!key) return null;
  const store = readStore();
  if (!(key in store.values)) return null;
  touch(store, key);
  writeStore(store);
  return store.values[key];
}

export function setCached(key, value) {
  if (!key) return;
  const store = readStore();
  store.values[key] = value;
  touch(store, key);
  evict(store);
  writeStore(store);
}

export function clearCache() {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("damage-cache clear failed", error);
  }
}

export function buildCacheKey(configHash, metaHash, fieldHash = "default") {
  return [configHash, metaHash, fieldHash].join("|");
}
