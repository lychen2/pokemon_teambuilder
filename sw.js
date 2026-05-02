const CACHE_VERSION = "poke-type-v56-20260502-vgcpastes-picker-stat-fix";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const DATA_CACHE = `${CACHE_VERSION}-data`;
const IMAGE_CACHE = `${CACHE_VERSION}-image`;

const NETWORK_TIMEOUT_MS = 3000;

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./static/css/base.css",
  "./static/css/theme.css",
  "./static/css/layout.css",
  "./static/css/shell.css",
  "./static/css/analysis.css",
  "./static/css/role-analysis.css",
  "./static/css/matchup.css",
  "./static/css/motion.css",
  "./static/css/damage-scan.css",
  "./static/css/type-colors.css",
  "./static/css/damage-workspace.css",
  "./static/css/library-search.css",
  "./static/css/matchup-filters.css",
  "./static/css/usage.css",
  "./static/css/experience-polish.css",
  "./static/workers/damage-core-worker.js",
];

const APP_MODULES = [
  "ability-scores.js", "analysis.js", "battle-semantics.js",
  "builder-autocomplete.js", "champions-vgc.js", "command-palette.js",
  "core-candidates.js", "core-synergy.js", "coverage-potential.js",
  "constants.js", "damage-i18n.js", "damage-workspace.js", "data.js",
  "damage-scan-view.js",
  "history.js", "i18n.js", "keybindings.js", "library-builder.js", "main.js",
  "lead-turn-plan.js",
  "learnsets.js",
  "matchup-analysis.js", "matchup-board-data.js", "matchup-selection.js",
  "opponent-team-generator.js", "persistence.js",
  "recommendation-preferences.js", "recommendations.js",
  "render-analysis.js", "render-cache.js", "render-command-palette.js",
  "render-context-bar.js",
  "render-quick-start.js",
  "render-library-compare.js",
  "render-damage.js", "render-matchup-board.js", "render-matchup.js",
  "render-recommendations.js", "render-usage.js", "render-vgcpastes-picker.js", "render-vgcpastes-suggest.js", "render.js", "role-ui.js", "showdown.js", "speed.js",
  "search-utils.js", "sprites.js", "starter-templates.js", "team-config.js", "team-identity.js", "team-role-analysis.js",
  "team-role-explanations.js", "team-role-metrics.js", "team-role-primary.js", "team-role-rules.js", "team-roles.js", "toast.js", "usage.js", "usage-stats.js",
  "utils.js", "vgcpastes-search.js",
];

const APP_SUBMODULES = [
  "recommendation-scoring/candidate.js",
  "recommendation-scoring/entry.js",
  "recommendation-scoring/helpers.js",
  "recommendation-scoring/quality.js",
  "recommendation-scoring/score-breakdowns.js",
  "recommendation-scoring/teammates.js",
];

const VENDOR_ASSETS = [
  "vendor/champions-damage-core/stat_data.js",
  "vendor/champions-damage-core/type_data.js",
  "vendor/champions-damage-core/nature_data.js",
  "vendor/champions-damage-core/ability_data.js",
  "vendor/champions-damage-core/item_data.js",
  "vendor/champions-damage-core/move_data.js",
  "vendor/champions-damage-core/pokedex.js",
  "vendor/champions-damage-core/ko_chance.js",
  "vendor/champions-damage-core/damage_MASTER.js",
  "vendor/champions-damage-core/damage_SV.js",
  "vendor/champions-damage-core/ap_calc.js",
].map((path) => `./${path}`);

const IMAGE_ASSETS = [
  "./icon.png",
  "./static/itemicons-sheet.png",
  "./static/pokemonicons-sheet.png",
];

const DATA_ASSETS = [
  "./static/poke-icons-map.json",
  "./static/localization-data.json",
  "./static/usage.json",
  "./static/usage_official.json",
  "./static/paste_sets_champions_ma.json",
  "./static/paste_teams_champions_ma.json",
  "./config-default.txt",
  "./poke_analysis-main/stats/abilities.json",
  "./poke_analysis-main/stats/champions_vgc.json",
  "./poke_analysis-main/stats/formats.json",
  "./poke_analysis-main/stats/forms_index.json",
  "./poke_analysis-main/stats/items.json",
  "./poke_analysis-main/stats/learnsets.json",
  "./poke_analysis-main/stats/moves.json",
  "./poke_analysis-main/stats/pokedex.json",
];

const PRECACHE_SHELL = [
  ...SHELL_ASSETS,
  ...APP_MODULES.map((name) => `./static/app/${name}`),
  ...APP_SUBMODULES.map((path) => `./static/app/${path}`),
  ...VENDOR_ASSETS,
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(PRECACHE_SHELL).catch(() => {});
    const images = await caches.open(IMAGE_CACHE);
    await images.addAll(IMAGE_ASSETS).catch(() => {});
    const data = await caches.open(DATA_CACHE);
    await data.addAll(DATA_ASSETS).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (key.startsWith("poke-type-") && !key.startsWith(CACHE_VERSION)) {
        return caches.delete(key);
      }
      return Promise.resolve();
    }));
    await self.clients.claim();
  })());
});

function routeCacheName(url) {
  const path = url.pathname;
  if (
    path.endsWith("paste_sets_champions_ma.json")
    || path.endsWith("paste_teams_champions_ma.json")
    || path.endsWith("config-default.txt")
  ) {
    return {name: DATA_CACHE, mode: "network-first"};
  }
  if (path.endsWith(".json")) {
    return {name: DATA_CACHE, mode: "cache-first"};
  }
  if (path.endsWith(".png") || path.endsWith(".webp") || path.endsWith(".svg") || path.endsWith(".jpg")) {
    return {name: IMAGE_CACHE, mode: "cache-first"};
  }
  return {name: SHELL_CACHE, mode: "network-first"};
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    fetch(request).then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone()).catch(() => {});
      }
    }).catch(() => {});
    return cached;
  }
  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("sw-network-timeout")), NETWORK_TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([fetch(request), timeout]);
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  const route = routeCacheName(url);
  const handler = route.mode === "network-first" ? networkFirst : cacheFirst;
  event.respondWith(handler(request, route.name).catch(() => fetch(request)));
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
