import {getNormalizedItem, hasTrackedMove} from "./team-role-metrics.js";
import {PRIORITY_MOVES, RECOVERY_MOVES, SETUP_MOVES} from "./team-role-rules.js";
import {buildCacheKey, getCached, setCached} from "./team-role-damage-cache.js";
import {getMetaHash} from "./team-role-meta.js";
import {normalizeName} from "./utils.js";
import {computeCounterMetrics, deriveCounterRoles} from "./team-role-counter.js";

const HIGH_BULK_HP_DEF = 10000;
const CHOICE_SCARF = "choicescarf";
const TOP_THREAT_COUNT = 8;
const SURVIVE_THRESHOLD_PERCENT = 50;
const CORECHECK_RATE_THRESHOLD = 0.4;
const BAITSINK_OHKD_THRESHOLD = 0.3;
const TRADEPIECE_OHKO_THRESHOLD = 0.25;
const TRADEPIECE_OHKD_THRESHOLD = 0.4;

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

function maxDamagePercent(result) {
  if (!result) return 0;
  const pct = Number(result.maxPercent || result.maxDamagePercent || 0);
  if (pct) return pct;
  const max = Number(result.max || result.maxDamage || result.damageMax || 0);
  const hp = Number(result.defenderHp || result.defenderMaxHp || 100);
  return hp > 0 ? (max / hp) * 100 : 0;
}

function isOHKO(result) {
  return maxDamagePercent(result) >= 100;
}

function is2HKO(result) {
  return maxDamagePercent(result) * 2 >= 100;
}

function isHighBulk(metaEntry) {
  const stats = metaEntry?.config?.baseStats || metaEntry?.config?.stats || {};
  const hp = Number(stats.hp || 0);
  const physBulk = hp * Number(stats.def || 0);
  const spBulk = hp * Number(stats.spd || 0);
  return Math.max(physBulk, spBulk) >= HIGH_BULK_HP_DEF;
}

function rateOver(results, predicate) {
  if (!results.length) return 0;
  const matched = results.filter((entry, index) => predicate(entry?.result, index)).length;
  return matched / results.length;
}

function buildLowHpDefenders(meta) {
  return (meta.entries || []).map((entry) => ({
    ...entry.config,
    currentHpPercent: 50,
  }));
}

async function scanAttacker(scanner, attacker, defenders, field) {
  if (!scanner?.scanAttackerAgainstTargets) return [];
  if (!defenders.length) return [];
  return await scanner.scanAttackerAgainstTargets(attacker, defenders, field || {format: "Doubles"});
}

async function scanDefender(scanner, attackers, defender, field) {
  if (!scanner?.scanAttackersIntoDefender) return [];
  if (!attackers.length) return [];
  return await scanner.scanAttackersIntoDefender(attackers, defender, field || {format: "Doubles"});
}

function deriveDamageRoles(metrics, config, options = {}) {
  const roles = [];
  if (metrics.twoHkoBulkyRate >= 0.5) roles.push("wallbreaker");
  const hasPriority = hasTrackedMove(config, PRIORITY_MOVES);
  const hasScarf = getNormalizedItem(config) === CHOICE_SCARF;
  const speedRank = Number(options.speedRank || 0);
  if ((speedRank >= 0.8 || hasPriority || hasScarf) && metrics.ohkoLowHpRate >= 0.6) {
    roles.push("revengekiller");
  }
  const hasRecovery = hasTrackedMove(config, RECOVERY_MOVES);
  const hasSetup = hasTrackedMove(config, SETUP_MOVES);
  if ((metrics.survivePhysRate >= 0.5 || metrics.surviveSpRate >= 0.5)
      && (hasRecovery || hasSetup || speedRank >= 0.8)) {
    roles.push("endgamewincondition");
  }
  const supportMoves = (config.moves || []).filter((move) => move.category === "Status").length;
  if (supportMoves >= 2 && metrics.ohkoRate < 0.25) roles.push("utilitypokemon");
  if (metrics.threatTopRate >= 0.5) roles.push("threatcheck");
  if ((speedRank >= 0.75 || hasPriority) && metrics.ohkoLowHpRate >= 0.6) {
    roles.push("backlinecleaner");
  }
  if (metrics.corecheckRate >= CORECHECK_RATE_THRESHOLD) roles.push("corecheck");
  const hasProtect = (config.moves || []).some((move) => normalizeName(move?.name || "") === "protect");
  const dualSurvive = (metrics.survivePhysRate || 0) + (metrics.surviveSpRate || 0);
  if (metrics.ohkdByMetaRate >= BAITSINK_OHKD_THRESHOLD && (hasProtect || dualSurvive >= 1.0)) {
    roles.push("baitsink");
  }
  if (metrics.ohkoRate >= TRADEPIECE_OHKO_THRESHOLD && metrics.ohkdByMetaRate >= TRADEPIECE_OHKD_THRESHOLD) {
    roles.push("tradepiece");
  }
  deriveCounterRoles(metrics).forEach((roleId) => roles.push(roleId));
  return [...new Set(roles)];
}

function buildSpeciesIndex(meta) {
  const index = new Map();
  (meta.entries || []).forEach((entry, i) => {
    const id = normalizeName(entry?.speciesId || "");
    if (id && !index.has(id)) index.set(id, i);
  });
  return index;
}

function computeCorecheckRate(meta, attackResults, defendResults) {
  const cores = meta.cores || [];
  if (!cores.length) return 0;
  const indexBySpecies = buildSpeciesIndex(meta);
  let handled = 0;
  let total = 0;
  cores.forEach((core) => {
    const ai = indexBySpecies.get(core.a);
    const bi = indexBySpecies.get(core.b);
    if (ai === undefined || bi === undefined) return;
    total += 1;
    const a2hko = is2HKO(attackResults[ai]?.result);
    const b2hko = is2HKO(attackResults[bi]?.result);
    const aSurvive = maxDamagePercent(defendResults[ai]?.result) <= SURVIVE_THRESHOLD_PERCENT;
    const bSurvive = maxDamagePercent(defendResults[bi]?.result) <= SURVIVE_THRESHOLD_PERCENT;
    if (a2hko && b2hko && (aSurvive || bSurvive)) handled += 1;
  });
  return total ? handled / total : 0;
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
    const defenders = (meta.entries || []).map((entry) => entry.config);
    const attackers = defenders;
    const lowHpDefenders = buildLowHpDefenders(meta);
    const topThreatDefenders = defenders.slice(0, TOP_THREAT_COUNT);
    const [attackResults, defendResults, lowHpResults, topResults] = await Promise.all([
      scanAttacker(scanner, config, defenders, options.field),
      scanDefender(scanner, attackers, config, options.field),
      scanAttacker(scanner, config, lowHpDefenders, options.field),
      scanAttacker(scanner, config, topThreatDefenders, options.field),
    ]);
    const counterMetrics = computeCounterMetrics(config, meta, attackResults, defendResults);
    const metrics = {
      ohkoRate: rateOver(attackResults, (result) => isOHKO(result)),
      twoHkoRate: rateOver(attackResults, (result) => is2HKO(result)),
      twoHkoBulkyRate: (() => {
        const filtered = attackResults.filter((_, index) => isHighBulk(meta.entries[index]));
        return rateOver(filtered, (result) => is2HKO(result));
      })(),
      ohkoLowHpRate: rateOver(lowHpResults, (result) => isOHKO(result)),
      survivePhysRate: rateOver(defendResults, (result) => maxDamagePercent(result) <= SURVIVE_THRESHOLD_PERCENT),
      surviveSpRate: rateOver(defendResults, (result) => maxDamagePercent(result) <= SURVIVE_THRESHOLD_PERCENT),
      threatTopRate: rateOver(topResults, (result) => isOHKO(result)),
      ohkdByMetaRate: rateOver(defendResults, (result) => isOHKO(result)),
      corecheckRate: computeCorecheckRate(meta, attackResults, defendResults),
      counterRate: counterMetrics.counterRate,
      pressuredRate: counterMetrics.pressuredRate,
      counterMode: counterMetrics.trMode ? "trickroom" : "fast",
    };
    const result = {
      damageRoles: deriveDamageRoles(metrics, config, options),
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
