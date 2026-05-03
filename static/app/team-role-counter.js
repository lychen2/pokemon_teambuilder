import {normalizeName} from "./utils.js";

const COUNTER_RATE_THRESHOLD = 0.35;
const PRESSURED_RATE_THRESHOLD = 0.35;
const FAST_PERCENTILE = 0.55;
const TR_SLOW_PERCENTILE = 0.45;
const TRICK_ROOM_MOVE_ID = "trickroom";
const SCARF_ITEM_ID = "choicescarf";

const SPEED_BOOST_NATURES = new Set(["timid", "jolly", "naive", "hasty"]);
const SPEED_NERF_NATURES = new Set(["brave", "quiet", "sassy", "relaxed"]);

function natureSpeedFactor(nature = "") {
  const id = normalizeName(nature);
  if (SPEED_BOOST_NATURES.has(id)) return 1.1;
  if (SPEED_NERF_NATURES.has(id)) return 0.9;
  return 1;
}

export function effectiveSpeed(config = {}) {
  const baseStats = config.baseStats || config.stats || {};
  const base = Number(baseStats.spe || 0);
  if (!base) return 0;
  const points = Number(config?.championPoints?.spe || 0);
  let speed = (base + 20 + points) * natureSpeedFactor(config?.nature);
  speed = Math.floor(speed);
  const itemId = normalizeName(config?.item || "");
  if (itemId === SCARF_ITEM_ID) speed = Math.floor(speed * 1.5);
  return speed;
}

function hasMoveId(config, moveId) {
  const moves = config?.moves || [];
  if (Array.isArray(moves) && moves.length) {
    if (moves.some((move) => normalizeName(move?.name || "") === moveId)) return true;
  }
  const moveNames = config?.moveNames || [];
  return moveNames.some((name) => normalizeName(name || "") === moveId);
}

function isOhkoResult(result) {
  if (!result) return false;
  const max = Number(result.maxPercent || result.maxDamagePercent || 0);
  if (max >= 100) return true;
  const damage = Number(result.max || result.maxDamage || result.damageMax || 0);
  const hp = Number(result.defenderHp || result.defenderMaxHp || 100);
  return hp > 0 && damage >= hp;
}

function speedPercentile(target, speeds) {
  if (!speeds.length) return 0.5;
  const below = speeds.filter((value) => value < target).length;
  return below / speeds.length;
}

function countMatched(meta, predicate) {
  let count = 0;
  let total = 0;
  (meta.entries || []).forEach((entry, index) => {
    total += 1;
    if (predicate(entry, index)) count += 1;
  });
  return {count, total};
}

function isTrickRoomSelf(config, selfPercentile) {
  return hasMoveId(config, TRICK_ROOM_MOVE_ID) && selfPercentile <= TR_SLOW_PERCENTILE;
}

export function computeCounterMetrics(config, meta, attackResults = [], defendResults = []) {
  const entries = meta?.entries || [];
  if (!entries.length) {
    return {counterRate: 0, pressuredRate: 0, available: false};
  }
  const speeds = entries.map((entry) => effectiveSpeed(entry.config || {}));
  const selfSpeed = effectiveSpeed(config);
  const selfPercentile = speedPercentile(selfSpeed, speeds);
  const trMode = isTrickRoomSelf(config, selfPercentile);
  const counter = countMatched(meta, (_, index) => {
    const ohko = isOhkoResult(attackResults[index]?.result);
    if (!ohko) return false;
    const opponentSpeed = speeds[index];
    const outspeed = selfSpeed > opponentSpeed;
    if (outspeed) return true;
    return trMode && opponentSpeed > selfSpeed;
  });
  const pressured = countMatched(meta, (_, index) => {
    const theyOhkoUs = isOhkoResult(defendResults[index]?.result);
    if (!theyOhkoUs) return false;
    const opponentSpeed = speeds[index];
    const opponentOutspeed = opponentSpeed > selfSpeed;
    if (!opponentOutspeed && !trMode) return false;
    if (trMode) return false;
    const weCanRetaliate = isOhkoResult(attackResults[index]?.result) && (selfSpeed > opponentSpeed);
    return !weCanRetaliate;
  });
  const counterRate = counter.total ? counter.count / counter.total : 0;
  const pressuredRate = pressured.total ? pressured.count / pressured.total : 0;
  return {counterRate, pressuredRate, available: true, selfPercentile, trMode};
}

export function deriveCounterRoles(metrics = {}) {
  const roles = [];
  if (metrics.counterRate >= COUNTER_RATE_THRESHOLD) roles.push("metacounter");
  if (metrics.pressuredRate >= PRESSURED_RATE_THRESHOLD) roles.push("counterpressured");
  return roles;
}
