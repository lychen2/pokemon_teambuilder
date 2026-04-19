self.window = self;
self.document = {};
self.localStorage = {getItem: () => null, setItem: () => {}, removeItem: () => {}};
const CHECKED_SELECTORS = new Set();
const CHECKED_IDS = new Set();

function createChain(selector = "") {
  return {
    ready() { return this; },
    keyup() { return this; },
    bind() { return this; },
    on() { return this; },
    change() { return this; },
    click() { return this; },
    prop(name) {
      if (name === "checked") {
        return CHECKED_SELECTORS.has(selector) || CHECKED_IDS.has(selector);
      }
      return false;
    },
    val() {
      return CHECKED_SELECTORS.has(selector) ? "on" : undefined;
    },
    text() { return this; },
    html() { return this; },
    show() { return this; },
    hide() { return this; },
    find() { return createChain(); },
    closest() { return createChain(); },
    parent() { return createChain(); },
    children() { return {toArray: () => []}; },
    append() { return this; },
    trigger() { return this; },
    each() { return this; },
    attr() { return ""; },
    not() { return this; },
    remove() { return this; },
    end() { return this; },
    is() { return false; },
  };
}

function deepClone(value) {
  if (Array.isArray(value)) return value.map(deepClone);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, deepClone(inner)]));
}

function deepMerge(target, source) {
  const output = Array.isArray(target) ? [...target] : {...target};
  Object.entries(source || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      output[key] = deepClone(value);
      return;
    }
    if (value && typeof value === "object") {
      output[key] = deepMerge(output[key] && typeof output[key] === "object" ? output[key] : {}, value);
      return;
    }
    output[key] = value;
  });
  return output;
}

function $(value) {
  return createChain(typeof value === "string" ? value : "");
}

$.extend = function extend() {
  const args = [...arguments];
  const deep = args[0] === true;
  const sources = deep ? args.slice(1) : args;
  const [initial = {}, ...rest] = sources;
  return rest.reduce((result, source) => {
    if (!source) return result;
    if (!deep) return Object.assign(result, source);
    return deepMerge(result, source);
  }, deep ? deepClone(initial) : initial);
};
$.isEmptyObject = (value) => !value || Object.keys(value).length === 0;
self.$ = $;
self.jQuery = $;

importScripts(
  "../../vendor/champions-damage-core/stat_data.js",
  "../../vendor/champions-damage-core/type_data.js",
  "../../vendor/champions-damage-core/nature_data.js",
  "../../vendor/champions-damage-core/ability_data.js",
  "../../vendor/champions-damage-core/item_data.js",
  "../../vendor/champions-damage-core/move_data.js",
  "../../vendor/champions-damage-core/pokedex.js",
  "../../vendor/champions-damage-core/ko_chance.js",
  "../../vendor/champions-damage-core/damage_MASTER.js",
  "../../vendor/champions-damage-core/damage_SV.js",
  "../../vendor/champions-damage-core/ap_calc.js",
);

gen = 10;
pokedex = POKEDEX_CHAMPIONS;
typeChart = TYPE_CHART_SV;
moves = MOVES_CHAMPIONS;
items = ITEMS_CHAMPIONS;
abilities = ABILITIES_CHAMPIONS;
STATS = STATS_GSC;
resultDisplayMode = "SPs";

const SIDE_KEYS = ["attacker", "defender"];
const MOVE_SLOTS = [0, 1, 2, 3];
const BOOSTS = {[AT]: 0, [DF]: 0, [SA]: 0, [SD]: 0, [SP]: 0};
const RUIN_SELECTORS = Object.freeze({
  "Sword of Ruin": "input:checkbox[id='sword-of-ruin']:checked",
  "Tablets of Ruin": "input:checkbox[id='tablets-of-ruin']:checked",
  "Beads of Ruin": "input:checkbox[id='beads-of-ruin']:checked",
  "Vessel of Ruin": "input:checkbox[id='vessel-of-ruin']:checked",
});
const AURA_SELECTORS = Object.freeze({
  "Fairy Aura": "input:checkbox[id='fairy-aura']:checked",
  "Dark Aura": "input:checkbox[id='dark-aura']:checked",
  "Aura Break": "input:checkbox[id='aura-break']:checked",
});
const INDEPENDENT_SELECTOR_BY_KEY = Object.freeze({
  fairyAura: "input:checkbox[id='fairy-aura']:checked",
  darkAura: "input:checkbox[id='dark-aura']:checked",
  auraBreak: "input:checkbox[id='aura-break']:checked",
  tabletsOfRuin: "input:checkbox[id='tablets-of-ruin']:checked",
  vesselOfRuin: "input:checkbox[id='vessel-of-ruin']:checked",
  swordOfRuin: "input:checkbox[id='sword-of-ruin']:checked",
  beadsOfRuin: "input:checkbox[id='beads-of-ruin']:checked",
});
const ID_SELECTOR_BY_KEY = Object.freeze({
  neutralizingGas: "#neutralizingGas",
});
const BOOST_KEY_MAP = Object.freeze({
  atk: AT,
  def: DF,
  spa: SA,
  spd: SD,
  spe: SP,
});

function normalizeCalcName(value) {
  return String(value || "").toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function buildLookup() {
  return new Map(Object.keys(pokedex).map((name) => [normalizeCalcName(name), name]));
}

const speciesLookup = buildLookup();

function syncRuntimeSelectors(attacker = {}, defender = {}, field = {}) {
  CHECKED_SELECTORS.clear();
  CHECKED_IDS.clear();
  Object.entries(field.independent || {})
    .filter(([, enabled]) => Boolean(enabled))
    .forEach(([key]) => {
      const selector = INDEPENDENT_SELECTOR_BY_KEY[key];
      if (selector) {
        CHECKED_SELECTORS.add(selector);
      }
      const idSelector = ID_SELECTOR_BY_KEY[key];
      if (idSelector) {
        CHECKED_IDS.add(idSelector);
      }
    });
  [attacker.ability, defender.ability]
    .filter(Boolean)
    .flatMap((ability) => [RUIN_SELECTORS[ability], AURA_SELECTORS[ability]])
    .filter(Boolean)
    .forEach((selector) => CHECKED_SELECTORS.add(selector));
}

function clampBoostStage(value) {
  return Math.max(-6, Math.min(6, Number(value || 0)));
}

function buildBoostState(boosts = {}) {
  return Object.entries(BOOST_KEY_MAP).reduce((mapped, [key, statKey]) => {
    mapped[statKey] = clampBoostStage(boosts[key]);
    return mapped;
  }, {});
}

function resolveSpecies(input) {
  const directName = String(input.speciesName || "").trim();
  if (pokedex[directName]) return directName;
  const mega = directName.match(/^(.*)-Mega(?:-([A-Z]))?$/);
  if (mega) {
    const base = speciesLookup.get(normalizeCalcName(mega[1]));
    if (!base) throw new Error(`伤害计算器里找不到物种：${directName}`);
    return mega[2] ? `Mega ${base} ${mega[2]}` : `Mega ${base}`;
  }
  const normalizedName = speciesLookup.get(normalizeCalcName(directName));
  if (normalizedName) return normalizedName;
  const normalizedId = speciesLookup.get(normalizeCalcName(input.speciesId || ""));
  if (normalizedId) return normalizedId;
  throw new Error(`伤害计算器里找不到物种：${directName || input.speciesId || "未知"}`);
}

function calcHp(base, points) {
  if (Number(base) === 1) return 1;
  return Math.floor((Number(base) * 2 + 31) * 50 / 100) + 60 + Number(points || 0);
}

function calcStat(base, points, nature, statKey) {
  const total = Math.floor((Number(base) * 2 + 31) * 50 / 100) + 5 + Number(points || 0);
  const [plus, minus] = NATURES[nature] || ["", ""];
  const modifier = plus === statKey ? 1.1 : minus === statKey ? 0.9 : 1;
  return Math.floor(total * modifier);
}

function resolveMoveHits(defaults, ability, item) {
  const range = defaults?.hitRange;
  if (typeof range === "number") {
    return range;
  }
  if (Array.isArray(range) && range.length === 2) {
    const [min, max] = range;
    if (min === 2 && max === 5) {
      if (ability === "Skill Link") return 5;
      if (item === "Loaded Dice") return 4;
      return 3;
    }
    if (max === 6) {
      return 1;
    }
    return max;
  }
  return 1;
}

function buildMove(moveName, ability, item) {
  const defaults = moves[moveName] || moves["(No Move)"] || {bp: 0, type: "Normal", category: "Status"};
  return {
    ...defaults,
    name: moveName,
    bp: Number(defaults.bp || 0),
    type: defaults.type || "Normal",
    category: defaults.category || "Status",
    isCrit: false,
    isZ: false,
    hits: resolveMoveHits(defaults, ability, item),
    isDouble: 0,
    combinePledge: 0,
    timesAffected: 0,
    usedOppMoveIndex: 0,
    getsStellarBoost: true,
    isPlusMove: false,
  };
}

function hasType() {
  return [...arguments].some((type) => [this.type1, this.type2].includes(type));
}

function buildPokemon(input) {
  const name = resolveSpecies(input);
  const entry = pokedex[name];
  const points = {...input.championPoints};
  const isDynamax = Boolean(input.dynamax);
  const rawStats = {
    hp: calcHp(entry.bs.hp, points.hp),
    [AT]: calcStat(entry.bs.at, points.atk, input.nature, AT),
    [DF]: calcStat(entry.bs.df, points.def, input.nature, DF),
    [SA]: calcStat(entry.bs.sa, points.spa, input.nature, SA),
    [SD]: calcStat(entry.bs.sd, points.spd, input.nature, SD),
    [SP]: calcStat(entry.bs.sp, points.spe, input.nature, SP),
  };
  const moveNames = [...(input.moveNames || [])];
  while (moveNames.length < 4) moveNames.push("(No Move)");
  const dynamaxMultiplier = isDynamax && rawStats.hp > 1 ? 2 : 1;
  const maxHP = rawStats.hp * dynamaxMultiplier;
  const hpPercent = Math.max(0, Math.min(100, Number(input.currentHpPercent || 100)));
  const currentHp = Math.max(0, Math.floor(maxHP * hpPercent / 100));
  return {
    name,
    type1: entry.t1,
    type2: entry.t2 || "",
    tera_type: input.teraType || entry.t1 || "",
    level: 50,
    maxHP,
    curHP: currentHp,
    HPEVs: 0,
    HPSPs: Number(points.hp || 0),
    HPIVs: 31,
    HPraw: maxHP,
    isDynamax,
    gmax_factor: false,
    isTerastalize: Boolean(input.terastal),
    rawStats,
    boosts: {...BOOSTS, ...buildBoostState(input.boosts)},
    stats: {},
    sps: {[AT]: Number(points.atk || 0), [DF]: Number(points.def || 0), [SA]: Number(points.spa || 0), [SD]: Number(points.spd || 0), [SP]: Number(points.spe || 0)},
    evs: {[AT]: 0, [DF]: 0, [SA]: 0, [SD]: 0, [SP]: 0},
    ivs: {[AT]: 31, [DF]: 31, [SA]: 31, [SD]: 31, [SP]: 31},
    nature: input.nature || "Serious",
    ability: input.ability || entry.ab || "",
    abilityOn: Boolean(input.abilityActive),
    supremeOverlord: 0,
    rivalryGender: "",
    highestStat: -1,
    item: input.item || "",
    status: input.status || "Healthy",
    toxicCounter: 0,
    moves: moveNames.slice(0, 4).map((name) => buildMove(name, input.ability || entry.ab || "", input.item || "")),
    glaiveRushMod: false,
    weight: entry.w || 0,
    canEvolve: Boolean(entry.canEvolve),
    isTransformed: false,
    hasType,
  };
}

function buildSide(field, defenderIndex) {
  const defenderKey = SIDE_KEYS[defenderIndex];
  const attackerKey = SIDE_KEYS[1 - defenderIndex];
  const defenderSide = field[defenderKey] || {};
  const attackerSide = field[attackerKey] || {};
  return new Side(
    field.format || "Doubles",
    field.terrain || "",
    field.weather || "",
    Boolean(field.gravity),
    Boolean(defenderSide.stealthRock),
    Number(defenderSide.spikes || 0),
    Boolean(defenderSide.reflect),
    Boolean(defenderSide.lightScreen),
    Boolean(defenderSide.foresight),
    Boolean(attackerSide.helpingHand),
    Boolean(defenderSide.friendGuard),
    Boolean(attackerSide.battery),
    Boolean(defenderSide.protect),
    Boolean(attackerSide.powerSpot),
    Boolean(attackerSide.steelySpirit),
    Boolean(field.independent?.neutralizingGas),
    Boolean(defenderSide.gMaxField),
    Boolean(defenderSide.flowerGift),
    Boolean(attackerSide.flowerGift),
    Boolean(defenderSide.tailwind),
    Boolean(defenderSide.saltCure),
    Boolean(defenderSide.auroraVeil),
    Boolean(defenderSide.swamp),
    Boolean(defenderSide.seaFire),
    Boolean(attackerSide.redItem),
    Boolean(defenderSide.blueItem),
    Boolean(attackerSide.charge),
  );
}

function buildField(field) {
  return {
    isNeutralizingGas: Boolean(field.independent?.neutralizingGas),
    getNeutralGas: () => Boolean(field.independent?.neutralizingGas),
    getTailwind: (index) => Boolean(field[SIDE_KEYS[index]]?.tailwind),
    getWeather: () => field.weather || "",
    getTerrain: () => field.terrain || "",
    getSwamp: (index) => Boolean(field[SIDE_KEYS[index]]?.swamp),
    clearWeather: () => {},
    clearTerrain: () => {},
    getSide: (index) => buildSide(field, index),
  };
}

function buildMoveResult(result, move, defender, side, isBadDreams) {
  const [minDamage, maxDamage] = calcMinMaxDamage(result.damage, move.hits);
  const minPercent = Math.floor(minDamage * 1000 / defender.maxHP) / 10;
  const maxPercent = Math.floor(maxDamage * 1000 / defender.maxHP) / 10;
  return {
    moveName: move.name,
    damageText: minPercent !== maxPercent
      ? `${minDamage}-${maxDamage} (${minPercent} - ${maxPercent}%)`
      : `${minDamage} (${maxPercent}%)`,
    koText: getKOChanceText(result.damage, move, defender, side, Boolean(isBadDreams)),
    description: result.description,
    minPercent,
    maxPercent,
  };
}

function buildSummary(attacker, defender, results, defenderView, defenderSide) {
  const moveResults = MOVE_SLOTS.map((slot) => (
    buildMoveResult(results[slot], attacker.moves[slot], defender, defenderSide, attacker.ability === "Bad Dreams")
  ));
  const buildHeadline = (entries) => {
    const best = entries.reduce((winner, current) => current.maxPercent > winner.maxPercent ? current : winner, entries[0]);
    const suffix = best.koText ? ` -- ${best.koText}` : "";
    return `${best.description}: ${best.damageText}${suffix}`;
  };
  return {
    leftHeadline: buildHeadline(moveResults),
    rightHeadline: buildHeadline(defenderView),
    leftMoves: moveResults,
    rightMoves: defenderView,
    attackerSpeed: attacker.stats[SP],
    defenderSpeed: defender.stats[SP],
  };
}

self.onmessage = (event) => {
  const {id, attacker, defender, field} = event.data || {};
  try {
    syncRuntimeSelectors(attacker, defender, field || {});
    const left = buildPokemon(attacker);
    const right = buildPokemon(defender);
    const battleField = buildField(field || {});
    const results = CALCULATE_ALL_MOVES_SV(left, right, battleField);
    const leftSide = battleField.getSide(0);
    const rightSide = battleField.getSide(1);
    const counter = MOVE_SLOTS.map((slot) => (
      buildMoveResult(results[1][slot], right.moves[slot], left, leftSide, right.ability === "Bad Dreams")
    ));
    const result = buildSummary(left, right, results[0], counter, rightSide);
    self.postMessage({id, ok: true, result});
  } catch (error) {
    self.postMessage({id, ok: false, error: error instanceof Error ? error.message : String(error)});
  }
};
