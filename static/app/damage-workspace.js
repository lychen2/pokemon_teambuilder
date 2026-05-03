let workerInstance = null;
let requestId = 0;
const pendingRequests = new Map();

const REQUEST_TIMEOUT_MS = 5000;

function clearPendingTimeout(pending) {
  if (pending?.timeoutId) {
    clearTimeout(pending.timeoutId);
    pending.timeoutId = null;
  }
}

function failPending(pending, id, error) {
  clearPendingTimeout(pending);
  pendingRequests.delete(id);
  pending.reject(error);
}

function getWorker() {
  if (workerInstance) {
    return workerInstance;
  }
  workerInstance = new Worker(new URL("../workers/damage-core-worker.js", import.meta.url));
  workerInstance.addEventListener("message", (event) => {
    const {id, ok, result, error} = event.data || {};
    const pending = pendingRequests.get(id);
    if (!pending) {
      return;
    }
    clearPendingTimeout(pending);
    pendingRequests.delete(id);
    if (ok) {
      pending.resolve(result);
      return;
    }
    const failure = new Error(error || "伤害计算失败。");
    failure.code = "DAMAGE_WORKER_ERROR";
    pending.reject(failure);
  });
  workerInstance.addEventListener("error", (event) => {
    pendingRequests.forEach((pending, id) => {
      const failure = new Error(event.message || "伤害计算 worker 初始化失败。");
      failure.code = "DAMAGE_WORKER_FATAL";
      failPending(pending, id, failure);
    });
    pendingRequests.clear();
    workerInstance = null;
  });
  return workerInstance;
}

function buildSideState(side = {}) {
  return {
    reflect: Boolean(side.reflect),
    lightScreen: Boolean(side.lightScreen),
    protect: Boolean(side.protect),
    helpingHand: Boolean(side.helpingHand),
    friendGuard: Boolean(side.friendGuard),
    tailwind: Boolean(side.tailwind),
    auroraVeil: Boolean(side.auroraVeil),
    battery: Boolean(side.battery),
    powerSpot: Boolean(side.powerSpot),
    steelySpirit: Boolean(side.steelySpirit),
    flowerGift: Boolean(side.flowerGift),
    stealthRock: Boolean(side.stealthRock),
    spikes: Math.max(0, Math.min(3, Number(side.spikes || 0))),
    foresight: Boolean(side.foresight),
    gMaxField: Boolean(side.gMaxField),
    saltCure: Boolean(side.saltCure),
    swamp: Boolean(side.swamp),
    seaFire: Boolean(side.seaFire),
    redItem: Boolean(side.redItem),
    blueItem: Boolean(side.blueItem),
    charge: Boolean(side.charge),
  };
}

function buildFieldState(field = {}) {
  return {
    format: field.format || "Doubles",
    weather: field.weather || "",
    terrain: field.terrain || "",
    gravity: Boolean(field.gravity),
    independent: {
      neutralizingGas: Boolean(field.independent?.neutralizingGas),
      fairyAura: Boolean(field.independent?.fairyAura),
      darkAura: Boolean(field.independent?.darkAura),
      auraBreak: Boolean(field.independent?.auraBreak),
      tabletsOfRuin: Boolean(field.independent?.tabletsOfRuin),
      vesselOfRuin: Boolean(field.independent?.vesselOfRuin),
      swordOfRuin: Boolean(field.independent?.swordOfRuin),
      beadsOfRuin: Boolean(field.independent?.beadsOfRuin),
    },
    attacker: buildSideState(field.attacker),
    defender: buildSideState(field.defender),
  };
}

function buildPokemonPayload(config = {}) {
  return {
    speciesId: config.speciesId || "",
    speciesName: config.speciesName || "",
    displayName: config.displayName || config.speciesName || "",
    championPoints: {...(config.championPoints || {})},
    currentHpPercent: Number(config.currentHpPercent || 100),
    nature: config.nature || "Serious",
    ability: config.ability || "",
    item: config.item || "",
    moveNames: [...(config.moveNames || [])],
    teraType: config.teraType || "",
    status: config.status || "Healthy",
    boosts: {
      atk: Number(config.boosts?.atk || 0),
      def: Number(config.boosts?.def || 0),
      spa: Number(config.boosts?.spa || 0),
      spd: Number(config.boosts?.spd || 0),
      spe: Number(config.boosts?.spe || 0),
    },
    dynamax: Boolean(config.dynamax),
    terastal: Boolean(config.terastal),
    abilityActive: Boolean(config.abilityActive),
  };
}

function cancelPendingRequestsByKind(kind) {
  if (!kind) {
    return;
  }
  [...pendingRequests.entries()]
    .filter(([, pending]) => pending.kind === kind)
    .forEach(([id, pending]) => {
      clearPendingTimeout(pending);
      pendingRequests.delete(id);
      pending.resolve(null);
    });
}

function buildRequestPayload(attacker, defender, field) {
  return {
    attacker: buildPokemonPayload(attacker),
    defender: buildPokemonPayload(defender),
    field: buildFieldState(field),
  };
}

function enqueueRequest(payload, options = {}) {
  const worker = getWorker();
  cancelPendingRequestsByKind(options.cancelKind || "");
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const pending = {resolve, reject, kind: options.kind || "pair", timeoutId: null};
    pending.timeoutId = setTimeout(() => {
      const stale = pendingRequests.get(id);
      if (!stale) return;
      pendingRequests.delete(id);
      stale.timeoutId = null;
      const failure = new Error("伤害计算超时（5 秒未返回）");
      failure.code = "DAMAGE_WORKER_TIMEOUT";
      stale.reject(failure);
    }, REQUEST_TIMEOUT_MS);
    pendingRequests.set(id, pending);
    worker.postMessage({id, ...payload});
  });
}

function mapScanResults(entries, results, projector) {
  return entries
    .map((entry, index) => {
      const result = results[index];
      if (!entry || !result) return null;
      return projector(entry, result);
    })
    .filter(Boolean);
}

export function createDamageWorkspace() {
  async function syncPair(attacker, defender, field) {
    return enqueueRequest(buildRequestPayload(attacker, defender, field), {
      kind: "pair",
      cancelKind: "pair",
    });
  }

  async function scanAttackerAgainstTargets(attacker, targets, field) {
    const results = await Promise.all(
      targets.map((defender) => enqueueRequest(buildRequestPayload(attacker, defender, field), {kind: "scan"})),
    );
    return mapScanResults(targets, results, (defender, result) => ({defender, result}));
  }

  async function scanAttackersIntoDefender(attackers, defender, field) {
    const results = await Promise.all(
      attackers.map((attacker) => enqueueRequest(buildRequestPayload(attacker, defender, field), {kind: "scan"})),
    );
    return mapScanResults(attackers, results, (attacker, result) => ({attacker, result}));
  }

  return {
    async waitForReady() {
      getWorker();
    },
    scanAttackersIntoDefender,
    scanAttackerAgainstTargets,
    syncPair,
  };
}
