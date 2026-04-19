let workerInstance = null;
let requestId = 0;
const pendingRequests = new Map();

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
    pendingRequests.delete(id);
    if (ok) {
      pending.resolve(result);
      return;
    }
    pending.reject(new Error(error || "伤害计算失败。"));
  });
  workerInstance.addEventListener("error", (event) => {
    pendingRequests.forEach(({reject}) => reject(new Error(event.message || "伤害计算 worker 初始化失败。")));
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

export function createDamageWorkspace() {
  async function syncPair(attacker, defender, field) {
    const worker = getWorker();
    if (pendingRequests.size) {
      const stale = [...pendingRequests.values()];
      pendingRequests.clear();
      stale.forEach(({resolve}) => resolve(null));
    }
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      pendingRequests.set(id, {resolve, reject});
      worker.postMessage({
        id,
        attacker: buildPokemonPayload(attacker),
        defender: buildPokemonPayload(defender),
        field: buildFieldState(field),
      });
    });
  }

  return {
    async waitForReady() {
      getWorker();
    },
    syncPair,
  };
}
