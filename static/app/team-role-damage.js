import {getNormalizedItem, hasTrackedMove} from "./team-role-metrics.js";
import {PRIORITY_MOVES, RECOVERY_MOVES, SETUP_MOVES} from "./team-role-rules.js";
import {buildCacheKey, getCached, setCached} from "./team-role-damage-cache.js";
import {getMetaHash} from "./team-role-meta.js";

const HIGH_BULK_HP_DEF = 10000;
const CHOICE_SCARF = "choicescarf";
const TOP_THREAT_COUNT = 8;

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
    const metrics = {
      ohkoRate: rateOver(attackResults, (result) => isOHKO(result)),
      twoHkoRate: rateOver(attackResults, (result) => is2HKO(result)),
      twoHkoBulkyRate: (() => {
        const filtered = attackResults.filter((_, index) => isHighBulk(meta.entries[index]));
        return rateOver(filtered, (result) => is2HKO(result));
      })(),
      ohkoLowHpRate: rateOver(lowHpResults, (result) => isOHKO(result)),
      survivePhysRate: rateOver(defendResults, (result) => maxDamagePercent(result) <= 50),
      surviveSpRate: rateOver(defendResults, (result) => maxDamagePercent(result) <= 50),
      threatTopRate: rateOver(topResults, (result) => isOHKO(result)),
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
