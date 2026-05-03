const ROLE_CATEGORY = Object.freeze({
  attacker: "offense", cleaner: "offense", nuke: "offense", wallbreaker: "offense",
  metacounter: "offense", revengekiller: "offense", endgamewincondition: "offense",
  backlinecleaner: "offense", spreadattacker: "offense", singlebreaker: "offense",
  setupsweeper: "offense", priorityattacker: "offense", primaryattacker: "offense",
  secondaryattacker: "offense", fastattacker: "offense", speedpressure: "offense",
  trickroomsweeper: "offense", slowattacker: "offense", setup: "offense",
  stabattacker: "offense", coverageattacker: "offense",

  tank: "defense", wall: "defense", mixedwall: "defense", damagesponge: "defense",
  bulkyattacker: "defense", recoverywall: "defense", midgamestabilizer: "defense",
  defensiveswitchin: "defense", assaultvesttank: "defense", bulkysupport: "defense",
  physicalwall: "defense", specialwall: "defense", recovery: "defense",
  leftoverssustain: "defense", attritioncore: "defense", baitsink: "defense",

  tailwind: "speedcontrol", trickroom: "speedcontrol", softspeedcontrol: "speedcontrol",
  speeddebuff: "speedcontrol", paralysiscontrol: "speedcontrol", priority: "speedcontrol",
  weathersweeper: "speedcontrol", choicescarf: "speedcontrol", speedboostself: "speedcontrol",
  speedcontrol: "speedcontrol",

  fakeout: "support", redirection: "support", followme: "support", ragepowder: "support",
  guard: "support", wideguard: "support", quickguard: "support", helpinghand: "support",
  cleric: "support", healingsupport: "support", screens: "support",
  reflectsetter: "support", lightscreensetter: "support", auroraveilsetter: "support",
  protectivesupport: "support", support: "support",

  disruption: "disruption", debuffer: "disruption", antisetup: "disruption",
  phazer: "disruption", sleep: "disruption", taunt: "disruption", encore: "disruption",
  disable: "disruption", imprison: "disruption", willowisp: "disruption",
  paralysisspreader: "disruption", haze: "disruption", clearsmog: "disruption",
  snarl: "disruption", eerieimpulse: "disruption", faketears: "disruption",
  screech: "disruption", metalsound: "disruption", acidspray: "disruption",
  offensivedebuffer: "disruption", nobleroar: "disruption", tickle: "disruption",
  trapper: "disruption", statusspreader: "disruption", intimidate: "disruption",
  disruptor: "disruption",

  pivot: "pivot", fakeoutpivot: "pivot", intimidatepivot: "pivot",
  regeneratorpivot: "pivot", partingshot: "pivot", weatherresetpivot: "pivot",
  terrainresetpivot: "pivot", uturnpivot: "pivot", voltswitchpivot: "pivot",
  flipturnpivot: "pivot",

  weather: "mode", weathersetter: "mode", rainsetter: "mode", sunsetter: "mode",
  sandsetter: "mode", snowsetter: "mode", weathercore: "mode", weatherabuser: "mode",
  terrain: "mode", terrainsetter: "mode", electricterrainsetter: "mode",
  psychicterrainsetter: "mode", grassyterrainsetter: "mode", mistyterrainsetter: "mode",
  terraincore: "mode", terrainabuser: "mode", terrainstatusguard: "mode",
  terrainpriorityguard: "mode", modeenabler: "mode", hazardsetter: "mode",
  stealthrocksetter: "mode", spikessetter: "mode", toxicspikessetter: "mode",
  stickywebsetter: "mode", hazardremoval: "mode", rapidspin: "mode", defog: "mode",
  courtchange: "mode", mortalspin: "mode", tidyup: "mode", modesetter: "mode",

  techcheck: "counter", corecheck: "counter", threatcheck: "counter",
  antitrickroom: "counter", antitailwind: "counter", antiredirection: "counter",
  antiintimidate: "counter", antiweather: "counter", antiterrain: "counter",
  antisleep: "counter", antipowder: "counter", antipriority: "counter",
  fakeoutproof: "counter", antispread: "counter", antispeedcontrol: "counter",
  counterpressured: "counter",

  lead: "tempo", leadpressure: "tempo", tempocontrol: "tempo",
  consistentaction: "tempo", utilitypokemon: "tempo", tradepiece: "tempo",

  focussash: "item", assaultvest: "item", covertcloak: "item",
  safetygoggles: "item", clearamulet: "item",
});

const NON_SCORING_CATEGORIES = new Set(["item", "tempo"]);

export function getRoleCategory(roleId) {
  return ROLE_CATEGORY[roleId] || "";
}

export function getDistinctRoleCategories(roleIds = []) {
  const categories = new Set();
  roleIds.forEach((roleId) => {
    const category = ROLE_CATEGORY[roleId];
    if (category && !NON_SCORING_CATEGORIES.has(category)) {
      categories.add(category);
    }
  });
  return categories;
}

export function getScoringCategoryCount(primary, secondary = []) {
  return getDistinctRoleCategories([primary, ...secondary]).size;
}
