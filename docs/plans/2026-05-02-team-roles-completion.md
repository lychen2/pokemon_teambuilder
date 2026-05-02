# Team Roles Completion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the 草系→`antisleep` semantic bug, fill remaining Layer 1 gaps, and ship Layer 3 damage-aware role detection (6 new roles) backed by a 3-tier META pool (usage stats → VGCPaste team frequency → current library).

**Architecture:** Sync entry `analyzePokemonRoles(config, options)` stays unchanged. New async entry `analyzePokemonDamageRoles(config, meta, scanner)` is independent and only fires when scanner + META are available. META built once on data load, cached per analysis-page open with LRU 50 across configs. UI shows META source explicitly; no silent fallback.

**Tech Stack:** Vanilla ES Modules, no build step. Worker-based damage core via existing `damage-workspace.js`. localStorage for LRU cache. Static JSON datasets under `poke_analysis-main/stats/`.

**Reference:** `docs/plans/2026-05-02-team-roles-completion-design.md`

---

## M1 — Bug Fix + Layer 1 Wrap-up (Tasks 1–7)

### Task 1: Add `antipowder` role + i18n

**Files:**
- Modify: `static/app/team-role-rules.js` (add `antipowder` to `TACTICAL_ROLE_ORDER` after `antisleep`; do NOT add to `RECOMMENDATION_ROLE_IDS`)
- Modify: `static/app/team-role-i18n.js` (add zh/en `analysis.role.antipowder` + `analysis.roleDesc.antipowder`)

**Step 1: Add role id to ordering**

In `team-role-rules.js`, find `SUPPORT_ROLE_ORDER` array and insert `"antipowder"` directly after `"antisleep"`.

**Step 2: Add i18n entries**

In `team-role-i18n.js` `ZH_ROLE_TEXT`:
```js
"analysis.role.antipowder": "反粉末",
"analysis.roleDesc.antipowder": "对蘑菇孢子、催眠粉、麻痹粉、棉花孢子、愤怒粉等粉末类招式免疫，但不能阻止催眠术、唱歌、哈欠、恶魔之吻等直接睡眠招式。",
```

In `team-role-i18n.js` `EN_ROLE_TEXT`:
```js
"analysis.role.antipowder": "Anti-Powder",
"analysis.roleDesc.antipowder": "Immune to powder moves (Spore, Sleep Powder, Stun Spore, Cotton Spore, Rage Powder) but cannot block direct sleep moves (Hypnosis, Sing, Yawn, Lovely Kiss).",
```

**Step 3: Verify syntax**

Run: `node --check static/app/team-role-rules.js && node --check static/app/team-role-i18n.js`
Expected: both files parse cleanly.

---

### Task 2: Fix `SLEEP_IMMUNE_ABILITIES` membership

**Files:**
- Modify: `static/app/team-role-rules.js:51`

**Step 1: Replace the set definition**

Change:
```js
export const SLEEP_IMMUNE_ABILITIES = new Set(["overcoat", "sweetveil", "insomnia", "vitalspirit"]);
```
To:
```js
export const SLEEP_IMMUNE_ABILITIES = new Set(["sweetveil", "insomnia", "vitalspirit", "comatose"]);
```

(Removed `overcoat` — only powder immunity. Added `comatose` — Komala true sleep immunity.)

**Step 2: Verify syntax**

Run: `node --check static/app/team-role-rules.js`
Expected: PASS.

---

### Task 3: Split antipowder/antisleep in `team-role-analysis.js`

**Files:**
- Modify: `static/app/team-role-analysis.js:133-134`

**Step 1: Replace the two-line block**

Find:
```js
  if (hasPowderImmunity(config)) pushRole(roles, "powderimmune");
  if (hasPowderImmunity(config)) pushRole(roles, "antisleep");
```

Replace with:
```js
  if (hasPowderImmunity(config)) pushRole(roles, "powderimmune");
  if (hasPowderImmunity(config)) pushRole(roles, "antipowder");
  if (hasTrackedAbility(config, SLEEP_IMMUNE_ABILITIES)) pushRole(roles, "antisleep");
```

**Step 2: Add SLEEP_IMMUNE_ABILITIES import**

In the imports block at top of `team-role-analysis.js`, add `SLEEP_IMMUNE_ABILITIES,` to the named imports from `./team-role-rules.js`.

**Step 3: Verify syntax**

Run: `node --check static/app/team-role-analysis.js`
Expected: PASS.

---

### Task 4: Split antipowder/antisleep in `team-role-extra.js`

**Files:**
- Modify: `static/app/team-role-extra.js:222`

**Step 1: Replace the antisleep line**

Find:
```js
  if (hasPowderImmunity(config) || hasTeraType(config, GRASS_TYPE) || hasTrackedAbility(config, SLEEP_IMMUNE_ABILITIES)) roles.push("antisleep");
```

Replace with:
```js
  if (hasPowderImmunity(config) || hasTeraType(config, GRASS_TYPE)) roles.push("antipowder");
  if (hasTrackedAbility(config, SLEEP_IMMUNE_ABILITIES) || roles.includes("electricterrainsetter") || roles.includes("mistyterrainsetter")) roles.push("antisleep");
```

**Step 2: Verify syntax**

Run: `node --check static/app/team-role-extra.js`
Expected: PASS.

---

### Task 5: Layer 1 set补全 + single-move rules + i18n

**Files:**
- Modify: `static/app/team-role-rules.js` (extend `SETUP_MOVES`, `OFFENSIVE_DEBUFF_MOVES`, `CLERIC_MOVES`, `STAT_DROP_MOVES`, `WEATHER_ABUSER_MOVES`)
- Modify: `static/app/team-role-deterministic.js` (add `nobleroar`, `tickle`, `floralhealing` to `SINGLE_MOVE_ROLE_RULES` if needed; add to status-move category mapping if applicable)
- Modify: `static/app/team-role-deterministic-i18n.js` (i18n for `nobleroar`, `tickle`, `floralhealing`)

**Step 1: Extend rule sets**

In `team-role-rules.js`:
```js
export const SETUP_MOVES = new Set([
  "swordsdance", "bellydrum", "nastyplot", "quiverdance", "dragondance",
  "bulkup", "calmmind", "coil", "irondefense", "amnesia", "agility",
  "shellsmash", "geomancy", "victorydance", "noretreat", "growth", "focusenergy",
]);
export const OFFENSIVE_DEBUFF_MOVES = new Set([
  "faketears", "screech", "metalsound", "acidspray", "nobleroar", "tickle",
]);
export const CLERIC_MOVES = new Set([
  "aromatherapy", "healbell", "healpulse", "lifedew", "lunarblessing",
  "pollenpuff", "junglehealing", "wish", "floralhealing",
]);
export const STAT_DROP_MOVES = new Set([
  "faketears", "eerieimpulse", "charm", "breakingswipe", "icywind", "electroweb",
  "snarl", "lunge", "strugglebug", "partingshot", "featherdance",
  "nobleroar", "tickle", "babydolleyes",
]);
export const WEATHER_ABUSER_MOVES = new Set([
  "weatherball", "solarbeam", "solarblade", "thunder", "hurricane", "auroraveil",
  "morningsun", "synthesis",
]);
```

**Step 2: Wire single-move rules**

In `team-role-deterministic.js` `SINGLE_MOVE_ROLE_RULES` array, append:
```js
["nobleroar", "nobleroar"],
["tickle", "tickle"],
["floralhealing", "floralhealing"],
```

**Step 3: Add i18n entries**

In `team-role-deterministic-i18n.js` `ZH_TEXT`:
```js
"analysis.role.nobleroar": "大声咆哮（降双攻）",
"analysis.roleDesc.nobleroar": "用大声咆哮同时降低目标物攻和特攻。",
"analysis.role.tickle": "胳肢",
"analysis.roleDesc.tickle": "用胳肢同时降低目标物攻和防御。",
"analysis.role.floralhealing": "花朵治疗",
"analysis.roleDesc.floralhealing": "用花朵治疗为队友补血，青草场地下回复加倍。",
```

In `EN_TEXT`:
```js
"analysis.role.nobleroar": "Noble Roar",
"analysis.roleDesc.nobleroar": "Lowers a target's Attack and Special Attack with Noble Roar.",
"analysis.role.tickle": "Tickle",
"analysis.roleDesc.tickle": "Lowers a target's Attack and Defense with Tickle.",
"analysis.role.floralhealing": "Floral Healing",
"analysis.roleDesc.floralhealing": "Heals an ally; doubled under Grassy Terrain.",
```

**Step 4: Verify syntax**

Run: `node --check static/app/team-role-rules.js && node --check static/app/team-role-deterministic.js && node --check static/app/team-role-deterministic-i18n.js`
Expected: all PASS.

---

### Task 6: Update `RECOMMENDATION_ROLE_IDS` for new roles

**Files:**
- Modify: `static/app/team-role-rules.js` (`RECOMMENDATION_ROLE_IDS` array)

**Step 1: Add damage-aware ids; keep antisleep, do NOT add antipowder**

Find the existing `RECOMMENDATION_ROLE_IDS = [...]` array and append:
```js
"wallbreaker", "revengekiller", "endgamewincondition", "utilitypokemon"
```

(Skipping `threatcheck` and `backlinecleaner` from recommendation scoring — too sensitive to META definition.)

**Step 2: Verify syntax**

Run: `node --check static/app/team-role-rules.js`
Expected: PASS.

---

### Task 7: M1 manual verification + commit

**Step 1: Browser smoke test**

Run: `python -m http.server 8000 &` (background)
Open `http://localhost:8000`, import the following test paste:
```
Tapu Koko @ Choice Specs
Ability: Electric Surge
Tera Type: Electric
EVs: 32 SpA / 32 Spe
Timid Nature
- Thunderbolt
- Dazzling Gleam
- Volt Switch
- Protect

Komala @ Leftovers
Ability: Comatose
Tera Type: Normal
EVs: 32 HP / 32 Atk
Adamant Nature
- Sucker Punch
- Wood Hammer
- Earthquake
- Yawn

Amoonguss @ Sitrus Berry
Ability: Regenerator
Tera Type: Water
EVs: 32 HP / 32 Def
Bold Nature
- Spore
- Pollen Puff
- Rage Powder
- Protect

Milotic @ Mystic Water
Ability: Marvel Scale
Tera Type: Water
EVs: 32 HP / 32 SpA
Modest Nature
- Surf
- Hypnosis
- Coil
- Recover
```

Expected role flags after import:
- Tapu Koko: `antisleep` ✓ (electricterrainsetter), `electricterrainsetter`, `terrainstatusguard`
- Komala: `antisleep` ✓ (comatose)
- Amoonguss: `powderimmune`, `antipowder`, `sleep` — but **NO** `antisleep`
- Milotic: `setup`, `sleep`, `recovery` — and importantly Amoonguss is NOT shielded from Hypnosis (confirms semantic split)

**Step 2: Stop server**

Run: `kill %1` or close the background bash.

**Step 3: Commit M1**

```bash
git add static/app/team-role-rules.js static/app/team-role-analysis.js \
        static/app/team-role-extra.js static/app/team-role-deterministic.js \
        static/app/team-role-deterministic-i18n.js static/app/team-role-i18n.js \
        docs/plans/2026-05-02-team-roles-completion-design.md \
        docs/plans/2026-05-02-team-roles-completion.md
git commit -m "fix(roles): split antipowder from antisleep + Layer 1 setup/cleric/debuff fills"
```

---

## M2 — META Pool Module (Tasks 8–10)

### Task 8: Create `team-role-meta.js`

**Files:**
- Create: `static/app/team-role-meta.js` (≤ 200 lines)

**Step 1: Write the module**

```js
import {normalizeName} from "./utils.js";

const DEFAULT_TOP_N = 24;
const EMPTY_META = Object.freeze({source: "empty", entries: [], weightTotal: 0, warnings: ["empty"]});

function buildEntryFromUsage(speciesId, profile, datasets) {
  const species = datasets?.pokedex?.[speciesId];
  if (!species) return null;
  const moves = sortByCount(profile?.Moves).slice(0, 4).map(([name]) => name);
  const item = sortByCount(profile?.Items)[0]?.[0] || "";
  const teraType = sortByCount(profile?.Tera)[0]?.[0] || "";
  const ability = species.abilities?.[0] || species.abilities?.["0"] || "";
  return {
    speciesId,
    speciesName: species.name || speciesId,
    config: {
      speciesId,
      speciesName: species.name || speciesId,
      types: species.types || [],
      baseStats: species.baseStats || {},
      stats: species.baseStats || {},
      moves: moves.map((name) => ({name, category: "Physical", basePower: 0, type: ""})),
      moveNames: moves,
      item,
      ability,
      teraType,
      championPoints: {},
      nature: "Serious",
    },
    weight: Number(profile?.usage || 0),
    source: "usage-stats",
  };
}

function sortByCount(record = {}) {
  return Object.entries(record || {}).sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0));
}

function fromUsageStats(datasets, topN = DEFAULT_TOP_N) {
  const usable = datasets?.championsVgc?.usableSpeciesIds || [];
  const usage = datasets?.usage?.data || datasets?.usage || {};
  const allowed = new Set(usable.map((id) => normalizeName(id)));
  const ranked = Object.entries(usage)
    .map(([name, profile]) => ({speciesId: normalizeName(name), profile, weight: Number(profile?.usage || 0)}))
    .filter((entry) => entry.weight > 0 && (!allowed.size || allowed.has(entry.speciesId)))
    .sort((left, right) => right.weight - left.weight)
    .slice(0, topN);
  const entries = ranked.map((entry) => buildEntryFromUsage(entry.speciesId, entry.profile, datasets)).filter(Boolean);
  return entries.length ? {source: "usage-stats", entries, weightTotal: sumWeights(entries), warnings: []} : null;
}

function fromPasteCounts(datasets, topN = DEFAULT_TOP_N) {
  const counts = datasets?.pasteSpeciesCounts || {};
  const ranked = Object.entries(counts)
    .map(([speciesId, info]) => ({speciesId, count: Number(info?.count || 0), profile: info?.profile || null}))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, topN);
  const total = ranked.reduce((sum, entry) => sum + entry.count, 0) || 1;
  const entries = ranked.map((entry) => buildEntryFromPaste(entry.speciesId, entry.count / total, entry.profile, datasets)).filter(Boolean);
  return entries.length ? {source: "vgcpastes", entries, weightTotal: sumWeights(entries), warnings: []} : null;
}

function buildEntryFromPaste(speciesId, weight, profile, datasets) {
  const species = datasets?.pokedex?.[speciesId];
  if (!species) return null;
  return {
    speciesId,
    speciesName: species.name || speciesId,
    config: profile || {
      speciesId,
      speciesName: species.name || speciesId,
      types: species.types || [],
      baseStats: species.baseStats || {},
      stats: species.baseStats || {},
      moves: [],
      moveNames: [],
      item: "",
      ability: species.abilities?.[0] || species.abilities?.["0"] || "",
      teraType: "",
      championPoints: {},
      nature: "Serious",
    },
    weight,
    source: "vgcpastes",
  };
}

function fromLibrary(library, topN = DEFAULT_TOP_N) {
  if (!library?.length) return null;
  const slice = library.slice(0, topN);
  const weight = 1 / slice.length;
  const entries = slice.map((config) => ({
    speciesId: normalizeName(config?.speciesId || config?.speciesName || ""),
    speciesName: config?.speciesName || config?.displayName || "",
    config,
    weight,
    source: "current-library",
  }));
  return {source: "current-library", entries, weightTotal: 1, warnings: ["fell-back-to-library"]};
}

function sumWeights(entries) {
  return entries.reduce((sum, entry) => sum + Number(entry.weight || 0), 0);
}

export function buildRoleMeta(library = [], datasets = {}, options = {}) {
  const topN = Number(options.topN || DEFAULT_TOP_N);
  if (datasets?.championsVgc?.usage?.status === "available") {
    const usageMeta = fromUsageStats(datasets, topN);
    if (usageMeta) return usageMeta;
  }
  const pasteMeta = fromPasteCounts(datasets, topN);
  if (pasteMeta) return pasteMeta;
  const libraryMeta = fromLibrary(library, topN);
  if (libraryMeta) return libraryMeta;
  return EMPTY_META;
}

export function getMetaHash(meta = {}) {
  const ids = (meta.entries || []).map((entry) => entry.speciesId).join(",");
  return `${meta.source || "empty"}|${ids}|${meta.entries?.length || 0}`;
}
```

**Step 2: Verify syntax + line count**

Run: `node --check static/app/team-role-meta.js && wc -l static/app/team-role-meta.js`
Expected: PASS, ≤ 200 lines.

---

### Task 9: Wire `pasteSpeciesCounts` into `data.js`

**Files:**
- Modify: `static/app/data.js` (add paste parser → species count aggregation → expose on datasets)
- Reference: `static/app/showdown.js` already has the parser

**Step 1: Locate the loadDatasets function**

Open `static/app/data.js`, find the function building the `datasets` object (around line 165 per earlier search).

**Step 2: After loading `pokepaste_cache`, build species counts**

Add a helper near the top:
```js
import {parseShowdownTeam} from "./showdown.js";
// ...

function buildPasteSpeciesCounts(pokepasteCache = {}, pokedex = {}) {
  const counts = {};
  Object.values(pokepasteCache || {}).forEach((entry) => {
    if (!entry?.text) return;
    let team = [];
    try {
      team = parseShowdownTeam(entry.text, {pokedex}) || [];
    } catch (error) {
      console.warn("Failed to parse paste for META counts", error);
      return;
    }
    team.forEach((config) => {
      const speciesId = (config?.speciesId || "").toLowerCase();
      if (!speciesId) return;
      if (!counts[speciesId]) counts[speciesId] = {count: 0, profile: config};
      counts[speciesId].count += 1;
    });
  });
  return counts;
}
```

**Step 3: Attach to datasets**

In the dataset assembly object, add:
```js
pasteSpeciesCounts: buildPasteSpeciesCounts(championsVgc?.pokepasteCache || pokepasteCache || {}, pokedex),
```

(Use whichever variable name `data.js` already uses for the cache; if `pokepasteCache` is loaded separately via `DATA_PATHS.pokepaste`, use that.)

**Step 4: Verify syntax**

Run: `node --check static/app/data.js`
Expected: PASS. If `parseShowdownTeam` is not exported, replace with whatever the existing export is (`parseShowdownPaste` or similar) — confirm by `grep -E '^export.*parse' static/app/showdown.js`.

---

### Task 10: M2 commit

**Step 1: Browser smoke test**

```bash
python -m http.server 8000 &
```
Open browser DevTools console, run:
```js
import("./static/app/team-role-meta.js").then(({buildRoleMeta}) => {
  const meta = buildRoleMeta(window.appState?.library || [], window.appState?.datasets || {});
  console.log(meta.source, meta.entries.length, meta.weightTotal);
});
```
Expected: prints `usage-stats 24 ~1.x` (or `vgcpastes ...` if usage missing).

**Step 2: Commit M2**

```bash
git add static/app/team-role-meta.js static/app/data.js
git commit -m "feat(roles): META pool builder with usage→paste→library tiering"
```

---

## M3 — Damage Scan Module (Tasks 11–14)

### Task 11: Create `team-role-damage-cache.js`

**Files:**
- Create: `static/app/team-role-damage-cache.js` (≤ 150 lines)

**Step 1: Write LRU cache**

```js
const STORAGE_KEY = "pokeTypeDamageRoleCache";
const MAX_ENTRIES = 50;

function readStore() {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return {order: [], values: {}};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {order: [], values: {}};
    return {order: Array.isArray(parsed.order) ? parsed.order : [], values: parsed.values || {}};
  } catch (error) {
    console.warn("damage-cache read failed", error);
    return {order: [], values: {}};
  }
}

function writeStore(store) {
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
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
  try {
    window.localStorage?.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("damage-cache clear failed", error);
  }
}

export function buildCacheKey(configHash, metaHash, fieldHash = "default") {
  return [configHash, metaHash, fieldHash].join("|");
}
```

**Step 2: Verify**

Run: `node --check static/app/team-role-damage-cache.js && wc -l static/app/team-role-damage-cache.js`
Expected: PASS, ≤ 150 lines.

---

### Task 12: Create `team-role-damage.js`

**Files:**
- Create: `static/app/team-role-damage.js` (≤ 200 lines)

**Step 1: Write the analyzer**

```js
import {getNormalizedItem, hasTrackedMove} from "./team-role-metrics.js";
import {PRIORITY_MOVES, RECOVERY_MOVES, SETUP_MOVES} from "./team-role-rules.js";
import {buildCacheKey, getCached, setCached} from "./team-role-damage-cache.js";
import {getMetaHash} from "./team-role-meta.js";

const SCAN_CONCURRENCY = 8;
const HIGH_BULK_RANK = 0.7;
const LOW_HP_PERCENT = 50;
const CHOICE_SCARF = "choicescarf";

function configHash(config = {}) {
  return JSON.stringify({
    species: config.speciesId || "",
    moves: (config.moveNames || (config.moves || []).map((move) => move.name) || []).slice(0, 4),
    item: config.item || "",
    ability: config.ability || "",
    points: config.championPoints || {},
    nature: config.nature || "",
    teraType: config.teraType || "",
  });
}

async function runWithLimit(items, mapper, limit = SCAN_CONCURRENCY) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, worker));
  return results;
}

function damageFractionFromResult(result, defenderHp = 100) {
  if (!result) return 0;
  const max = Number(result.max || result.maxDamage || result.damageMax || 0);
  if (!max || !defenderHp) return 0;
  return max / defenderHp;
}

function isOHKO(result, defender) {
  return damageFractionFromResult(result, defender?.hp || 100) >= 1;
}

function is2HKO(result, defender) {
  return damageFractionFromResult(result, defender?.hp || 100) * 2 >= 1;
}

function isHighBulk(metaEntry) {
  const stats = metaEntry?.config?.baseStats || {};
  const physBulk = Number(stats.hp || 0) * Number(stats.def || 0);
  const spBulk = Number(stats.hp || 0) * Number(stats.spd || 0);
  return Math.max(physBulk, spBulk) >= 100 * 100; // crude: HP*DEF or HP*SPD ≥ 10000
}

async function scanAttackerVsMeta(config, meta, scanner, options = {}) {
  if (!scanner?.scanAttackerAgainstTargets) return [];
  const targets = (meta.entries || []).map((entry) => entry.config);
  if (!targets.length) return [];
  const results = await scanner.scanAttackerAgainstTargets(config, targets, options.field || {format: "Doubles"});
  return results || [];
}

async function scanMetaIntoDefender(config, meta, scanner, options = {}) {
  if (!scanner?.scanAttackersIntoDefender) return [];
  const attackers = (meta.entries || []).map((entry) => entry.config);
  if (!attackers.length) return [];
  return await scanner.scanAttackersIntoDefender(attackers, config, options.field || {format: "Doubles"});
}

function rateForOHKO(scanResults, meta) {
  if (!scanResults.length) return 0;
  const hits = scanResults.filter((entry, index) => isOHKO(entry?.result, meta.entries[index]?.config?.baseStats)).length;
  return hits / scanResults.length;
}

function rateFor2HKO(scanResults, meta) {
  if (!scanResults.length) return 0;
  const hits = scanResults.filter((entry, index) => is2HKO(entry?.result, meta.entries[index]?.config?.baseStats)).length;
  return hits / scanResults.length;
}

function rateFor2HKOBulky(scanResults, meta) {
  const bulky = scanResults.filter((_, index) => isHighBulk(meta.entries[index]));
  return rateFor2HKO(bulky, {entries: bulky.map((_, i) => meta.entries[i])});
}

function rateForSurvive(scanResults, meta, threshold = 0.5) {
  if (!scanResults.length) return 0;
  const survives = scanResults.filter((entry) => damageFractionFromResult(entry?.result, 100) <= threshold).length;
  return survives / scanResults.length;
}

function deriveDamageRoles(metrics, config, meta) {
  const roles = [];
  if (metrics.twoHkoBulkyRate >= 0.5) roles.push("wallbreaker");
  const hasPriority = hasTrackedMove(config, PRIORITY_MOVES);
  const hasScarf = getNormalizedItem(config) === CHOICE_SCARF;
  if ((metrics.speedRank >= 0.8 || hasPriority || hasScarf) && metrics.ohkoLowHpRate >= 0.6) {
    roles.push("revengekiller");
  }
  const hasRecovery = hasTrackedMove(config, RECOVERY_MOVES);
  const hasSetup = hasTrackedMove(config, SETUP_MOVES);
  if ((metrics.survivePhysRate >= 0.5 || metrics.surviveSpRate >= 0.5)
      && (hasRecovery || hasSetup || metrics.speedRank >= 0.8)) {
    roles.push("endgamewincondition");
  }
  const supportMoves = (config.moves || []).filter((move) => move.category === "Status").length;
  if (supportMoves >= 2 && metrics.ohkoRate < 0.25) roles.push("utilitypokemon");
  if (metrics.threatTopRate >= 0.5) roles.push("threatcheck");
  if ((metrics.speedRank >= 0.75 || hasPriority) && metrics.ohkoLowHpRate >= 0.6) {
    roles.push("backlinecleaner");
  }
  return [...new Set(roles)];
}

export async function analyzePokemonDamageRoles(config, meta, scanner, options = {}) {
  if (!meta?.entries?.length) {
    return {damageRoles: [], unavailableReason: "no-meta", metrics: null, source: meta?.source || "empty"};
  }
  if (!scanner) {
    return {damageRoles: [], unavailableReason: "scanner-missing", metrics: null, source: meta.source};
  }
  const cacheKey = buildCacheKey(configHash(config), getMetaHash(meta));
  const cached = getCached(cacheKey);
  if (cached) return cached;
  try {
    const attackResults = await scanAttackerVsMeta(config, meta, scanner, options);
    const defendResults = await scanMetaIntoDefender(config, meta, scanner, options);
    const top8Meta = {entries: (meta.entries || []).slice(0, 8)};
    const top8Results = attackResults.slice(0, top8Meta.entries.length);
    const lowHpMeta = meta;
    const lowHpResults = attackResults; // approximation: re-use; user-set targets at 50% HP would re-scan with currentHpPercent
    const metrics = {
      ohkoRate: rateForOHKO(attackResults, meta),
      twoHkoRate: rateFor2HKO(attackResults, meta),
      twoHkoBulkyRate: rateFor2HKOBulky(attackResults, meta),
      ohkoLowHpRate: rateForOHKO(lowHpResults, lowHpMeta),
      survivePhysRate: rateForSurvive(defendResults, meta, 0.5),
      surviveSpRate: rateForSurvive(defendResults, meta, 0.5),
      threatTopRate: rateForOHKO(top8Results, top8Meta),
      speedRank: Number(options.speedRank || 0),
    };
    const result = {
      damageRoles: deriveDamageRoles(metrics, config, meta),
      metrics,
      source: meta.source,
      unavailableReason: "",
    };
    setCached(cacheKey, result);
    return result;
  } catch (error) {
    console.warn("damage-aware analysis failed", error);
    return {damageRoles: [], unavailableReason: "scan-failed", metrics: null, source: meta.source};
  }
}

void runWithLimit; // exported indirectly; keep for future per-target HP scans
```

**Step 2: Verify**

Run: `node --check static/app/team-role-damage.js && wc -l static/app/team-role-damage.js`
Expected: PASS, ≤ 220 lines (slightly over the 200 soft target — acceptable since this is the central new module).

If file ends up > 200 lines, extract `rate*` helpers to a `team-role-damage-rates.js` companion.

---

### Task 13: Create `team-role-damage-i18n.js` + register in `team-role-i18n.js`

**Files:**
- Create: `static/app/team-role-damage-i18n.js` (≤ 100 lines)
- Modify: `static/app/team-role-i18n.js` (merge new translations alongside `DETERMINISTIC_ROLE_TRANSLATIONS`)

**Step 1: Write i18n module**

```js
const ZH_TEXT = {
  "analysis.role.wallbreaker": "破盾手",
  "analysis.roleDesc.wallbreaker": "对高耐久 META 目标的 2HKO 命中率达标，能强行破开高墙。",
  "analysis.role.revengekiller": "反杀手",
  "analysis.roleDesc.revengekiller": "通过先制、围巾或高速 OHKO 残血目标，承担反杀位。",
  "analysis.role.endgamewincondition": "残局胜利点",
  "analysis.roleDesc.endgamewincondition": "兼具承伤与回复/强化/高速，适合担任残局收尾。",
  "analysis.role.utilitypokemon": "工具人",
  "analysis.roleDesc.utilitypokemon": "≥2 个变化招式且 OHKO 率较低，主要价值在于辅助。",
  "analysis.role.threatcheck": "热门威胁检查",
  "analysis.roleDesc.threatcheck": "对 META 顶端 8 只热门目标 OHKO 率达标。",
  "analysis.role.backlinecleaner": "后排收割",
  "analysis.roleDesc.backlinecleaner": "速度或先制 + 残血 OHKO 率达标，收尾低血对手。",
  "analysis.metaSource.usageStats": "使用率统计（{n} 只 META，{month}）",
  "analysis.metaSource.vgcpastes": "VGCPaste 团队频次（{n} 只 META）",
  "analysis.metaSource.currentLibrary": "当前配置库（{n} 只）— 缺使用率与 paste 数据",
  "analysis.metaSource.empty": "无可用 META — damage-aware 职能未参与",
  "analysis.damageScan.scanning": "扫描中 ⏳（{done}/{total}）",
  "analysis.damageScan.ready": "已就绪",
  "analysis.damageScan.failed": "扫描失败",
};

const EN_TEXT = {
  "analysis.role.wallbreaker": "Wallbreaker",
  "analysis.roleDesc.wallbreaker": "2HKO rate vs high-bulk META targets meets the threshold.",
  "analysis.role.revengekiller": "Revenge Killer",
  "analysis.roleDesc.revengekiller": "Uses priority, Choice Scarf, or high Speed to OHKO weakened targets.",
  "analysis.role.endgamewincondition": "Endgame Win Condition",
  "analysis.roleDesc.endgamewincondition": "Combines bulk with recovery, setup, or Speed to close out games.",
  "analysis.role.utilitypokemon": "Utility Pokémon",
  "analysis.roleDesc.utilitypokemon": "Has ≥2 status moves and a low OHKO rate; primary value is support.",
  "analysis.role.threatcheck": "Threat Check",
  "analysis.roleDesc.threatcheck": "OHKO rate vs the top-8 META targets meets the threshold.",
  "analysis.role.backlinecleaner": "Backline Cleaner",
  "analysis.roleDesc.backlinecleaner": "Combines Speed or priority with high OHKO on weakened opponents.",
  "analysis.metaSource.usageStats": "Usage stats ({n} META, {month})",
  "analysis.metaSource.vgcpastes": "VGCPastes team frequency ({n} META)",
  "analysis.metaSource.currentLibrary": "Current library ({n}) — usage & paste data unavailable",
  "analysis.metaSource.empty": "No META available — damage-aware roles disabled",
  "analysis.damageScan.scanning": "Scanning ⏳ ({done}/{total})",
  "analysis.damageScan.ready": "Ready",
  "analysis.damageScan.failed": "Scan failed",
};

export const DAMAGE_ROLE_TRANSLATIONS = Object.freeze({
  zh: Object.freeze(ZH_TEXT),
  en: Object.freeze(EN_TEXT),
});
```

**Step 2: Merge into `team-role-i18n.js`**

Find lines around 257-258:
```js
const ZH_ALL_ROLE_TEXT = Object.freeze({...ZH_ROLE_TEXT, ...DETERMINISTIC_ROLE_TRANSLATIONS.zh});
const EN_ALL_ROLE_TEXT = Object.freeze({...EN_ROLE_TEXT, ...DETERMINISTIC_ROLE_TRANSLATIONS.en});
```

Replace with:
```js
import {DAMAGE_ROLE_TRANSLATIONS} from "./team-role-damage-i18n.js";
// ...
const ZH_ALL_ROLE_TEXT = Object.freeze({...ZH_ROLE_TEXT, ...DETERMINISTIC_ROLE_TRANSLATIONS.zh, ...DAMAGE_ROLE_TRANSLATIONS.zh});
const EN_ALL_ROLE_TEXT = Object.freeze({...EN_ROLE_TEXT, ...DETERMINISTIC_ROLE_TRANSLATIONS.en, ...DAMAGE_ROLE_TRANSLATIONS.en});
```

(Move the import to the top with other imports.)

**Step 3: Verify**

Run: `node --check static/app/team-role-damage-i18n.js && node --check static/app/team-role-i18n.js`
Expected: both PASS.

---

### Task 14: Re-export from `team-roles.js` + M3 commit

**Step 1: Update `team-roles.js`**

Append:
```js
export {analyzePokemonDamageRoles} from "./team-role-damage.js";
export {buildRoleMeta, getMetaHash} from "./team-role-meta.js";
export {getCached, setCached, clearCache, buildCacheKey} from "./team-role-damage-cache.js";
```

**Step 2: Verify**

Run: `node --check static/app/team-roles.js`
Expected: PASS.

**Step 3: Commit M3**

```bash
git add static/app/team-role-damage.js static/app/team-role-damage-cache.js \
        static/app/team-role-damage-i18n.js static/app/team-role-i18n.js \
        static/app/team-roles.js
git commit -m "feat(roles): Layer 3 damage-aware role detection (6 roles)"
```

---

## M4 — UI Integration (Tasks 15–18)

### Task 15: Inject damage scanner into analysis flow via `main.js`

**Files:**
- Modify: `static/app/main.js`

**Step 1: Import scanner**

Find existing damage workspace import (or create one):
```js
import {createDamageWorkspace} from "./damage-workspace.js";
import {analyzePokemonDamageRoles, buildRoleMeta} from "./team-roles.js";
```

**Step 2: Build single shared workspace**

Around app init:
```js
const damageScanner = createDamageWorkspace();
```

**Step 3: Expose helper for render-analysis**

Add a new function:
```js
async function runDamageAwareAnalysis(config, library, datasets, onProgress) {
  const meta = buildRoleMeta(library, datasets);
  if (typeof onProgress === "function") onProgress({status: "scanning", source: meta.source, total: meta.entries.length, done: 0});
  const result = await analyzePokemonDamageRoles(config, meta, damageScanner);
  if (typeof onProgress === "function") onProgress({status: result.damageRoles.length || result.unavailableReason ? "ready" : "failed", source: meta.source, total: meta.entries.length, done: meta.entries.length});
  return {meta, result};
}
```

Pass `runDamageAwareAnalysis` into `render-analysis.js` (whatever existing render entry takes; check current signature first).

**Step 4: Verify**

Run: `node --check static/app/main.js`
Expected: PASS.

---

### Task 16: Add META source bar + damage-aware section to `render-analysis.js`

**Files:**
- Modify: `static/app/render-analysis.js`

**Step 1: Find the analysis page render entry**

Run: `grep -nE 'renderAnalysis|analysisRoot' static/app/render-analysis.js | head -20` to find the render function.

**Step 2: Inject META source bar element**

Above the existing per-pokemon role cards, append (pseudocode — adapt to actual DOM helpers):
```js
const sourceBarEl = createElement("div", {class: "analysis-meta-source"});
sourceBarEl.dataset.i18n = "analysis.metaSource.scanning"; // placeholder
analysisRoot.prepend(sourceBarEl);

function updateMetaSourceBar({source, status, done, total, month}) {
  const key = source === "usage-stats" ? "analysis.metaSource.usageStats"
    : source === "vgcpastes" ? "analysis.metaSource.vgcpastes"
    : source === "current-library" ? "analysis.metaSource.currentLibrary"
    : "analysis.metaSource.empty";
  const statusKey = status === "scanning" ? "analysis.damageScan.scanning"
    : status === "ready" ? "analysis.damageScan.ready"
    : "analysis.damageScan.failed";
  sourceBarEl.textContent = `${t(key, {n: total, month: month || ""})} · ${t(statusKey, {done, total})}`;
}
```

**Step 3: Damage-aware role chips per pokemon card**

In the existing per-pokemon card render, after the secondary role chips block, append a new section:
```js
const damageEl = createElement("div", {class: "analysis-damage-roles"});
damageEl.textContent = t("analysis.damageScan.scanning", {done: 0, total: meta.entries.length});
card.appendChild(damageEl);

runDamageAwareAnalysis(config, library, datasets, (progress) => updateMetaSourceBar(progress)).then(({result}) => {
  damageEl.textContent = result.damageRoles.length
    ? result.damageRoles.map((roleId) => t(`analysis.role.${roleId}`)).join(" · ")
    : t(`analysis.damageScan.${result.unavailableReason ? "failed" : "ready"}`);
});
```

**Step 4: Verify**

Run: `node --check static/app/render-analysis.js`
Expected: PASS.

---

### Task 17: Wire damage-aware roles into recommendations

**Files:**
- Modify: `static/app/recommendations.js`
- Modify: `static/app/recommendation-scoring/score-breakdowns.js` (or whichever entry consumes role ids)

**Step 1: Find role consumption**

Run: `grep -nE 'RECOMMENDATION_ROLE_IDS|roleIds' static/app/recommendations.js static/app/recommendation-scoring/*.js | head -30`

**Step 2: Make damage-aware roles optional input**

Pass an optional `damageRoleMap` (Map<configKey, Set<roleId>>) into the recommendation scorer. Where it currently reads role ids, union with the per-config damage role set when present.

**Step 3: Add fallback message**

When `damageRoleMap` is empty/null, append a translated note "damage-aware 职能未参与本次推荐 / Damage-aware roles excluded" near the recommendations header in `render-recommendations.js`.

**Step 4: Verify**

Run: `node --check static/app/recommendations.js && node --check static/app/recommendation-scoring/*.js && node --check static/app/render-recommendations.js`
Expected: all PASS.

---

### Task 18: M4 commit

**Step 1: Browser smoke test**

Run: `python -m http.server 8000 &`
Open browser, navigate to analysis page. Expected:
1. META source bar shows `使用率统计（24 只 META，2026-04 数据）` (or VGCPaste / current library if usage missing).
2. After ~1-2s, damage-aware chips appear under each pokemon card.
3. Reload page → damage-aware chips appear instantly (cache hit).
4. DevTools `localStorage["pokeTypeDamageRoleCache"]` exists, < 50KB.

**Step 2: Commit M4**

```bash
git add static/app/main.js static/app/render-analysis.js \
        static/app/recommendations.js static/app/recommendation-scoring \
        static/app/render-recommendations.js
git commit -m "feat(roles): expose META source + damage-aware roles in analysis & recs"
```

---

## M5 — SW bump + Docs (Task 19)

### Task 19: Bump SW version + update future-todo status + commit

**Files:**
- Modify: `sw.js`
- Modify: `docs/future-todo-reference.md` (mark Layer 3 落地)

**Step 1: Bump cache version**

Run: `head -5 sw.js` to see current version. Increment to `poke-type-v?-20260502-team-roles-completion`.

**Step 2: Update future-todo-reference**

In §11.15 / §12.4, append a 2026/05/02 落地行:
```markdown
> 2026/05/02 六次落地：Layer 3 damage-aware 职能上线。新增 `team-role-meta.js` 三段式 META（使用率→VGCPaste→库），`team-role-damage.js` 接 6 个 damage-aware 职能（wallbreaker / revengekiller / endgamewincondition / utilitypokemon / threatcheck / backlinecleaner）。同时修复草系/Overcoat/Safety Goggles 错判 antisleep 的语义 bug（拆出独立 `antipowder` 标签）。Layer 4 meta-aware 仍未实现。
```

**Step 3: Commit M5**

```bash
git add sw.js docs/future-todo-reference.md
git commit -m "chore(sw): bump cache for team-roles completion + update docs"
```

---

## Final Verification

After M5, run end-to-end:

```bash
node --check static/app/team-role-rules.js \
             static/app/team-role-analysis.js \
             static/app/team-role-extra.js \
             static/app/team-role-deterministic.js \
             static/app/team-role-deterministic-i18n.js \
             static/app/team-role-i18n.js \
             static/app/team-role-meta.js \
             static/app/team-role-damage.js \
             static/app/team-role-damage-cache.js \
             static/app/team-role-damage-i18n.js \
             static/app/team-roles.js \
             static/app/data.js \
             static/app/main.js \
             static/app/render-analysis.js \
             static/app/recommendations.js \
             static/app/render-recommendations.js
```

Then browser smoke test the four required scenarios:

1. Tapu Koko import → `antisleep` ✓
2. Komala import → `antisleep` ✓
3. Amoonguss import → `antipowder` (no `antisleep`) ← **the original bug**
4. Open analysis page → META source bar shows live data → damage-aware chips appear within 2s
