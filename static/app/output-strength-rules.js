import {normalizeName} from "./utils.js";

const DEFAULT_STAB_MULTIPLIER = 1.5;
const ADAPTABILITY_STAB_MULTIPLIER = 2;
const DOUBLE_TARGET_MULTIPLIER = 0.75;
const TYPE_CONVERSION_MULTIPLIER = 1.2;
const TECHNICIAN_MULTIPLIER = 1.5;
const TOUGH_CLAWS_MULTIPLIER = 1.3;
const PUNK_ROCK_MULTIPLIER = 1.3;
const RECKLESS_MULTIPLIER = 1.2;
const SHEER_FORCE_MULTIPLIER = 1.3;
const MODERN_TRANSISTOR_MULTIPLIER = 1.3;
const LIFE_ORB_MULTIPLIER = 1.3;
const WEAK_ATTACK_ITEM_MULTIPLIER = 1.1;
const TYPE_BOOST_ITEM_MULTIPLIER = 1.2;
const CHOICE_ITEM_MULTIPLIER = 1.5;
const DOUBLED_ATTACK_MULTIPLIER = 2;
const FIELD_AURA_MULTIPLIER = 1.33;
const TYPE_ATTACK_BOOST_MULTIPLIER = 1.5;
const SPECIAL_ATTACK_BOOST_MULTIPLIER = 1.33;
const PARENTAL_BOND_MULTIPLIER = 1.25;
const WEATHER_MOVE_BOOST_MULTIPLIER = 1.5;
const WEATHER_MOVE_NERF_MULTIPLIER = 0.5;
const CRITICAL_HIT_MULTIPLIER = 1.5;
const WEATHER_BALL_ID = "weatherball";

const TYPE_CONVERSION_ABILITIES = new Map([
  ["Aerilate", "Flying"],
  ["Pixilate", "Fairy"],
  ["Refrigerate", "Ice"],
  ["Galvanize", "Electric"],
  ["Dragonize", "Dragon"],
]);

const FLAG_POWER_ABILITIES = new Map([
  ["Iron Fist", {flag: "punch", multiplier: 1.2}],
  ["Strong Jaw", {flag: "bite", multiplier: 1.5}],
  ["Sharpness", {flag: "slicing", multiplier: 1.5}],
  ["Mega Launcher", {flag: "pulse", multiplier: 1.5}],
]);

const FIELD_AURA_ABILITIES = new Map([
  ["Fairy Aura", {type: "Fairy", multiplier: FIELD_AURA_MULTIPLIER}],
  ["Dark Aura", {type: "Dark", multiplier: FIELD_AURA_MULTIPLIER}],
]);

const TYPE_ATTACK_ABILITIES = new Map([
  ["Dragon's Maw", {type: "Dragon", multiplier: TYPE_ATTACK_BOOST_MULTIPLIER}],
  ["Steelworker", {type: "Steel", multiplier: TYPE_ATTACK_BOOST_MULTIPLIER}],
  ["Steely Spirit", {type: "Steel", multiplier: TYPE_ATTACK_BOOST_MULTIPLIER}],
  ["Rocky Payload", {type: "Rock", multiplier: TYPE_ATTACK_BOOST_MULTIPLIER}],
  ["Transistor", {type: "Electric", multiplier: MODERN_TRANSISTOR_MULTIPLIER}],
  ["Water Bubble", {type: "Water", multiplier: DOUBLED_ATTACK_MULTIPLIER}],
]);

const SPECIES_OFFENSE_ITEMS = new Map([
  ["lightball", {speciesIds: new Set(["pikachu"]), stats: new Set(["atk", "spa"]), multiplier: DOUBLED_ATTACK_MULTIPLIER}],
  ["thickclub", {speciesIds: new Set(["cubone", "marowak", "marowakalola"]), stats: new Set(["atk"]), multiplier: DOUBLED_ATTACK_MULTIPLIER}],
  ["deepseatooth", {speciesIds: new Set(["clamperl"]), stats: new Set(["spa"]), multiplier: DOUBLED_ATTACK_MULTIPLIER}],
]);

const CONDITIONAL_MAX_POWER = new Map([
  ["waterspout", 150],
  ["eruption", 150],
  ["electroball", 150],
  ["gyroball", 150],
  ["heavyslam", 120],
  ["heatcrash", 120],
  ["grassknot", 120],
  ["lowkick", 120],
  ["flail", 200],
  ["reversal", 200],
  ["wringout", 120],
  ["crushgrip", 120],
]);

const RESTRICTED_REASON_PRIORITY = ["conditional", "accuracy", "charge", "recharge", "repeatlock", "recoil", "selfdestruct", "selfdrop", "ohko"];
const CONSECUTIVE_LOCK_MOVES = new Set(["bloodmoon", "gigatonhammer"]);
const SINGLE_TYPE_BOOST_PATTERN = /Holder's ([A-Za-z]+)-type attacks have ([0-9.]+)x power/i;
const DUAL_TYPE_BOOST_PATTERN = /its ([A-Za-z]+)- and ([A-Za-z]+)-type attacks have ([0-9.]+)x power/i;
const STABLE_STATUS_ITEMS = Object.freeze({
  "Guts": new Set(["flameorb", "toxicorb"]),
  "Flare Boost": new Set(["flameorb"]),
  "Toxic Boost": new Set(["toxicorb"]),
});
const SELF_WEATHER_ABILITIES = new Map([
  ["Drought", "Sun"],
  ["Drizzle", "Rain"],
  ["Sand Stream", "Sand"],
  ["Snow Warning", "Snow"],
  ["Mega Sol", "Sun"],
]);
const WEATHER_BALL_TYPES = Object.freeze({
  Sun: "Fire",
  Rain: "Water",
  Sand: "Rock",
  Snow: "Ice",
});

function makeConditional(maxMultiplier = 1, triggerKey = "", triggerSource = "") {
  return {baseMultiplier: 1, maxMultiplier, triggerKey, triggerSource};
}

function getMultiHitDescriptor(move) {
  return move?.multihit ?? move?.hitRange ?? move?.hits ?? null;
}

function isSoundMove(move) {
  return Boolean(move?.flags?.sound);
}

function hasSecondaryEffect(move) {
  return Boolean(move?.secondary || (Array.isArray(move?.secondaries) && move.secondaries.length));
}

function getStableTriggerSource(config) {
  const validItems = STABLE_STATUS_ITEMS[config.ability];
  return validItems?.has(normalizeName(config.item)) ? config.item || "" : "";
}

function findHighestBoostableStat(config) {
  return ["atk", "spa", "def", "spd", "spe"].reduce((best, key) => {
    const value = Number(config.stats?.[key] || 0);
    return value > best.value ? {key, value} : best;
  }, {key: "", value: -Infinity}).key;
}

function getSelfWeather(config) {
  return SELF_WEATHER_ABILITIES.get(config.ability) || "";
}

export function getRawMove(move, datasets) {
  return datasets?.moveLookup?.get(normalizeName(move?.name || move?.id || "")) || move || null;
}

export function getMoveId(move) {
  return normalizeName(move?.id || move?.name || "");
}

export function isDamagingMove(move) {
  return move && move.category !== "Status" && (Number(move.basePower || 0) > 0 || CONDITIONAL_MAX_POWER.has(getMoveId(move)));
}

export function getBasePower(move) {
  return CONDITIONAL_MAX_POWER.get(getMoveId(move)) || Number(move.basePower || 0);
}

export function getHitCount(move, config) {
  const multihit = getMultiHitDescriptor(move);
  if (typeof multihit === "number") return multihit;
  if (!Array.isArray(multihit) || multihit.length !== 2) return 1;
  const [min, max] = multihit;
  if (min === max) return max;
  if (min === 2 && max === 5) {
    if (config.ability === "Skill Link") return 5;
    if (config.item === "Loaded Dice") return 4;
  }
  return max;
}

export function getEffectiveType(move, config) {
  const moveId = getMoveId(move);
  const selfWeather = getSelfWeather(config);
  if (moveId === WEATHER_BALL_ID && selfWeather) return WEATHER_BALL_TYPES[selfWeather] || move?.type || "";
  if (config.ability === "Liquid Voice" && isSoundMove(move)) return "Water";
  if (config.ability === "Normalize") return "Normal";
  if (move?.type !== "Normal") return move?.type || "";
  return TYPE_CONVERSION_ABILITIES.get(config.ability) || move?.type || "";
}

export function getStabMultiplier(config, effectiveType) {
  if (!(config.types || []).includes(effectiveType)) return 1;
  return config.ability === "Adaptability" ? ADAPTABILITY_STAB_MULTIPLIER : DEFAULT_STAB_MULTIPLIER;
}

export function getOffenseStatKey(move) {
  return move?.category === "Physical" ? "atk" : "spa";
}

export function getStaticAttackMultiplier(config, statKey, effectiveType) {
  let multiplier = 1;
  if (statKey === "atk" && (config.ability === "Huge Power" || config.ability === "Pure Power")) multiplier *= DOUBLED_ATTACK_MULTIPLIER;
  if (statKey === "atk" && config.ability === "Hustle") multiplier *= TYPE_ATTACK_BOOST_MULTIPLIER;
  if (statKey === "atk" && config.ability === "Gorilla Tactics") multiplier *= TYPE_ATTACK_BOOST_MULTIPLIER;
  if ((statKey === "atk" && config.item === "Choice Band") || (statKey === "spa" && config.item === "Choice Specs")) multiplier *= CHOICE_ITEM_MULTIPLIER;
  const itemData = SPECIES_OFFENSE_ITEMS.get(normalizeName(config.item));
  if (itemData?.speciesIds.has(normalizeName(config.speciesId)) && itemData.stats.has(statKey)) multiplier *= itemData.multiplier;
  const typedBoost = TYPE_ATTACK_ABILITIES.get(config.ability);
  if (typedBoost?.type === effectiveType) multiplier *= typedBoost.multiplier;
  return multiplier;
}

export function getConditionalAttackInfo(move, config, statKey, effectiveType) {
  if (config.ability === "Guts" && statKey === "atk") return makeConditional(TYPE_ATTACK_BOOST_MULTIPLIER, "output.triggerCondition.anyStatus", getStableTriggerSource(config));
  if ((config.ability === "Plus" || config.ability === "Minus") && statKey === "spa") return makeConditional(TYPE_ATTACK_BOOST_MULTIPLIER, "output.triggerCondition.partnerBoost");
  if (config.ability === "Solar Power" && statKey === "spa") return makeConditional(TYPE_ATTACK_BOOST_MULTIPLIER, "output.triggerCondition.sun");
  if (config.ability === "Orichalcum Pulse" && statKey === "atk") return makeConditional(SPECIAL_ATTACK_BOOST_MULTIPLIER, "output.triggerCondition.sun");
  if (config.ability === "Hadron Engine" && statKey === "spa") return makeConditional(SPECIAL_ATTACK_BOOST_MULTIPLIER, "output.triggerCondition.electricTerrain");
  if (config.ability === "Stakeout") return makeConditional(DOUBLED_ATTACK_MULTIPLIER, "output.triggerCondition.targetSwitch");
  if (config.ability === "Flower Gift" && statKey === "atk" && normalizeName(config.speciesId) === "cherrim") return makeConditional(TYPE_ATTACK_BOOST_MULTIPLIER, "output.triggerCondition.sun");
  return makeConditional();
}

export function getStaticBpMultiplier(move, config, effectiveType, basePower) {
  let multiplier = 1;
  if ((TYPE_CONVERSION_ABILITIES.has(config.ability) && move.type === "Normal") || config.ability === "Normalize") multiplier *= TYPE_CONVERSION_MULTIPLIER;
  if (config.ability === "Technician" && basePower <= 60) multiplier *= TECHNICIAN_MULTIPLIER;
  const flagBoost = FLAG_POWER_ABILITIES.get(config.ability);
  if (flagBoost?.flag && move?.flags?.[flagBoost.flag]) multiplier *= flagBoost.multiplier;
  if (config.ability === "Tough Claws" && move?.flags?.contact) multiplier *= TOUGH_CLAWS_MULTIPLIER;
  if (config.ability === "Reckless" && (move?.recoil || move?.hasCrashDamage || move?.mindBlownRecoil)) multiplier *= RECKLESS_MULTIPLIER;
  if (config.ability === "Sheer Force" && hasSecondaryEffect(move)) multiplier *= SHEER_FORCE_MULTIPLIER;
  if (config.ability === "Punk Rock" && isSoundMove(move)) multiplier *= PUNK_ROCK_MULTIPLIER;
  const auraBoost = FIELD_AURA_ABILITIES.get(config.ability);
  if (auraBoost?.type === effectiveType) multiplier *= auraBoost.multiplier;
  return multiplier;
}

export function getConditionalBpInfo(move, config, statKey, effectiveType) {
  if (config.ability === "Flare Boost" && statKey === "spa") return makeConditional(TYPE_ATTACK_BOOST_MULTIPLIER, "damage.status.Burned", getStableTriggerSource(config));
  if (config.ability === "Toxic Boost" && statKey === "atk") return makeConditional(TYPE_ATTACK_BOOST_MULTIPLIER, "output.triggerCondition.poisoned", getStableTriggerSource(config));
  if (config.ability === "Sand Force" && ["Rock", "Ground", "Steel"].includes(effectiveType)) return makeConditional(PUNK_ROCK_MULTIPLIER, "output.triggerCondition.sand");
  if (config.ability === "Analytic") return makeConditional(PUNK_ROCK_MULTIPLIER, "output.triggerCondition.moveLast");
  if ((config.ability === "Electromorphosis" || config.ability === "Wind Power") && effectiveType === "Electric") return makeConditional(DOUBLED_ATTACK_MULTIPLIER, "output.triggerCondition.charged");
  if (config.ability === "Supreme Overlord") return makeConditional(TYPE_ATTACK_BOOST_MULTIPLIER, "output.triggerCondition.supremeOverlord");
  return makeConditional();
}

function canUseParentalBond(move) {
  const multihit = getMultiHitDescriptor(move);
  const isMultiHit = typeof multihit === "number" ? multihit > 1 : Array.isArray(multihit);
  return !["allAdjacentFoes", "allAdjacent"].includes(move?.target) && !isMultiHit;
}

function getWeatherDamageMultiplier(config, effectiveType) {
  const weather = getSelfWeather(config);
  if (weather === "Sun") {
    if (effectiveType === "Fire") return WEATHER_MOVE_BOOST_MULTIPLIER;
    if (effectiveType === "Water") return WEATHER_MOVE_NERF_MULTIPLIER;
  }
  if (weather === "Rain") {
    if (effectiveType === "Water") return WEATHER_MOVE_BOOST_MULTIPLIER;
    if (effectiveType === "Fire") return WEATHER_MOVE_NERF_MULTIPLIER;
  }
  return 1;
}

export function getFinalDamageInfo(move, config, effectiveType) {
  let multiplier = getWeatherDamageMultiplier(config, effectiveType);
  let labelKey = "";
  if (move?.willCrit === true || move?.alwaysCrit === true) {
    multiplier *= CRITICAL_HIT_MULTIPLIER;
    labelKey = "output.specialCase.guaranteedCrit";
  }
  if (config.ability === "Parental Bond" && canUseParentalBond(move)) {
    multiplier *= PARENTAL_BOND_MULTIPLIER;
    labelKey = "output.specialCase.parentalBond";
  }
  return {multiplier, labelKey};
}

function matchesItemUsers(itemInfo, config) {
  const itemUsers = itemInfo?.itemUser;
  if (!itemUsers) return true;
  const users = Array.isArray(itemUsers) ? itemUsers : [itemUsers];
  return users.some((name) => normalizeName(name) === normalizeName(config.speciesId));
}

function getTypeBoostMultiplier(itemInfo, effectiveType, config) {
  const text = itemInfo?.shortDesc || itemInfo?.desc || "";
  const dualMatch = text.match(DUAL_TYPE_BOOST_PATTERN);
  if (dualMatch && matchesItemUsers(itemInfo, config)) {
    const [, leftType, rightType, value] = dualMatch;
    if ([leftType, rightType].includes(effectiveType)) return Number(value || TYPE_BOOST_ITEM_MULTIPLIER);
  }
  const singleMatch = text.match(SINGLE_TYPE_BOOST_PATTERN);
  if (singleMatch && matchesItemUsers(itemInfo, config)) {
    const [, type, value] = singleMatch;
    if (type === effectiveType) return Number(value || TYPE_BOOST_ITEM_MULTIPLIER);
  }
  return 1;
}

export function getItemPowerMultiplier(move, config, effectiveType) {
  let multiplier = 1;
  if (config.item === "Life Orb") multiplier *= LIFE_ORB_MULTIPLIER;
  if (config.item === "Muscle Band" && move.category === "Physical") multiplier *= WEAK_ATTACK_ITEM_MULTIPLIER;
  if (config.item === "Wise Glasses" && move.category === "Special") multiplier *= WEAK_ATTACK_ITEM_MULTIPLIER;
  if (config.item === "Punching Glove" && move?.flags?.punch) multiplier *= WEAK_ATTACK_ITEM_MULTIPLIER;
  return multiplier * getTypeBoostMultiplier(config.itemInfo, effectiveType, config);
}

function getSelfDropTotal(move) {
  const sources = [move?.self?.boosts, move?.selfBoost?.boosts, move?.boosts];
  return sources.reduce((total, boosts) => total + Object.values(boosts || {})
    .filter((value) => Number(value) < 0)
    .reduce((sum, value) => sum + Math.abs(Number(value || 0)), 0), 0);
}

export function getRestrictedReasonIds(move) {
  const moveId = getMoveId(move);
  const reasons = new Set();
  if (CONDITIONAL_MAX_POWER.has(moveId) || Number(move?.basePower || 0) <= 0) reasons.add("conditional");
  if (move?.accuracy !== true && Number(move?.accuracy || 0) < 100) reasons.add("accuracy");
  if (move?.flags?.charge) reasons.add("charge");
  if (move?.flags?.recharge || move?.self?.volatileStatus === "mustrecharge") reasons.add("recharge");
  if (CONSECUTIVE_LOCK_MOVES.has(moveId)) reasons.add("repeatlock");
  if (move?.recoil || move?.mindBlownRecoil || move?.hasCrashDamage) reasons.add("recoil");
  if (move?.selfdestruct) reasons.add("selfdestruct");
  if (getSelfDropTotal(move) > 0) reasons.add("selfdrop");
  if (move?.ohko) reasons.add("ohko");
  return RESTRICTED_REASON_PRIORITY.filter((reasonId) => reasons.has(reasonId));
}

export function getSpreadMultiplier(move) {
  return ["allAdjacentFoes", "allAdjacent"].includes(move?.target) ? DOUBLE_TARGET_MULTIPLIER : 1;
}
