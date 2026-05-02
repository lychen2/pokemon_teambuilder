export {
  ATTACK_BIAS_ORDER,
  PRIMARY_ROLE_ORDER,
  STRUCTURE_ROLE_ORDER,
  SUPPORT_ROLE_ORDER,
  TACTICAL_ROLE_ORDER,
  analyzePokemonRoles,
  getAttackBias,
  getRoleSummaryIds,
  getStructureRoles,
  getUtilityRoles,
} from "./team-role-analysis.js";

export {
  getNormalizedMoveNames,
  hasMove,
  hasTrackedMove,
} from "./team-role-metrics.js";

export {
  KEY_ROLE_ORDER,
  RECOMMENDATION_ROLE_IDS,
} from "./team-role-rules.js";

export {
  createRoleContext,
  getEstimatedRoleMetrics,
} from "./team-role-proxy.js";

export {analyzePokemonDamageRoles} from "./team-role-damage.js";
export {buildRoleMeta, getMetaHash} from "./team-role-meta.js";
export {getCached as getDamageRolesCache, setCached as setDamageRolesCache, clearCache as clearDamageRolesCache, buildCacheKey as buildDamageCacheKey} from "./team-role-damage-cache.js";
