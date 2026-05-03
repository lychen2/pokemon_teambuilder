export const TRICK_ROOM_MOVE = "trickroom";

export const TAILWIND_MOVES = new Set(["tailwind"]);
export const SPEED_DEBUFF_MOVES = new Set([
  "icywind",
  "electroweb",
  "scaryface",
  "cottonspore",
  "bulldoze",
  "rocktomb",
  "stringshot",
]);
export const PARALYSIS_CONTROL_MOVES = new Set(["thunderwave", "nuzzle", "glare", "stunspore"]);
export const PIVOT_MOVES = new Set(["partingshot", "uturn", "voltswitch", "flipturn", "batonpass", "teleport", "chillyreception"]);
export const REDIRECTION_MOVES = new Set(["followme", "ragepowder"]);
export const GUARD_MOVES = new Set(["wideguard", "quickguard"]);
export const WIDE_GUARD_MOVES = new Set(["wideguard"]);
export const QUICK_GUARD_MOVES = new Set(["quickguard"]);
export const HELPING_HAND_MOVES = new Set(["helpinghand"]);
export const SLEEP_MOVES = new Set(["spore", "sleeppowder", "yawn", "hypnosis", "lovelykiss", "sing", "grasswhistle"]);
export const WILL_O_WISP_MOVES = new Set(["willowisp"]);
export const STATUS_SPREAD_MOVES = new Set(["toxic", "poisonpowder", "toxicthread"]);
export const DISRUPTION_MOVES = new Set(["taunt", "encore", "willowisp", "nuzzle", "disable", "imprison", ...SLEEP_MOVES]);
export const STAT_DROP_MOVES = new Set(["faketears", "eerieimpulse", "charm", "breakingswipe", "icywind", "electroweb", "snarl", "lunge", "strugglebug", "partingshot", "featherdance", "nobleroar", "tickle", "babydolleyes"]);
export const OFFENSIVE_DEBUFF_MOVES = new Set(["faketears", "screech", "metalsound", "acidspray", "nobleroar", "tickle"]);
export const SETUP_MOVES = new Set(["swordsdance", "bellydrum", "nastyplot", "quiverdance", "dragondance", "bulkup", "calmmind", "coil", "irondefense", "amnesia", "agility", "shellsmash", "geomancy", "victorydance", "noretreat", "growth", "focusenergy"]);
export const RECOVERY_MOVES = new Set(["roost", "recover", "moonlight", "synthesis", "morningsun", "slackoff", "softboiled", "wish", "lunarblessing", "healpulse", "ingrain", "strengthsap", "gigadrain", "hornleech", "matchagotcha", "pollenpuff"]);
export const PASSIVE_DAMAGE_MOVES = new Set(["toxic", "poisonpowder", "toxicthread", "leechseed", "firespin", "whirlpool", "sandtomb", "infestation", "magmastorm", "saltcure", "willowisp"]);
export const PHASING_MOVES = new Set(["roar", "whirlwind", "dragontail", "circlethrow"]);
export const CLERIC_MOVES = new Set(["aromatherapy", "healbell", "healpulse", "lifedew", "lunarblessing", "pollenpuff", "junglehealing", "wish", "floralhealing"]);
export const ANTI_SETUP_MOVES = new Set(["haze", "clearsmog", ...PHASING_MOVES]);
export const SCREEN_MOVES = new Set(["reflect", "lightscreen", "auroraveil"]);
export const WEATHER_MOVES = new Set(["sunnyday", "raindance", "sandstorm", "snowscape", "hail"]);
export const WEATHER_ABILITIES = new Set(["drought", "drizzle", "sandstream", "snowwarning", "orichalcumpulse", "desolateland", "primordialsea"]);
export const WEATHER_ABUSER_MOVES = new Set(["weatherball", "solarbeam", "solarblade", "thunder", "hurricane", "auroraveil", "morningsun", "synthesis"]);
export const WEATHER_SPEED_ABILITIES = new Set(["chlorophyll", "swiftswim", "sandrush", "slushrush"]);
export const WEATHER_ABUSER_ABILITIES = new Set(["chlorophyll", "swiftswim", "sandrush", "slushrush", "solarpower", "protosynthesis", "icebody", "raindish", "sandforce"]);
export const TERRAIN_MOVES = new Set(["electricterrain", "grassyterrain", "psychicterrain", "mistyterrain"]);
export const TERRAIN_ABILITIES = new Set(["electricsurge", "grassysurge", "psychicsurge", "mistysurge", "hadronengine", "seedsower"]);
export const TERRAIN_ABUSER_MOVES = new Set(["terrainpulse", "expandingforce", "grassyglide", "mistyexplosion"]);
export const TERRAIN_ABUSER_ABILITIES = new Set(["surgesurfer", "quarkdrive", "grasspelt", "hadronengine"]);
export const PRIORITY_MOVES = new Set(["aquajet", "bulletpunch", "extremespeed", "iceshard", "machpunch", "quickattack", "shadowsneak", "suckerpunch", "fakeout", "firstimpression", "jetpunch", "accelerock", "watershuriken", "grassyglide"]);
export const INTIMIDATE_ABILITIES = new Set(["intimidate"]);
export const ANTI_INTIMIDATE_ABILITIES = new Set(["defiant", "competitive"]);
export const ANTI_INTIMIDATE_ITEMS = new Set(["clearamulet"]);
export const ANTI_FAKE_OUT_ABILITIES = new Set(["innerfocus"]);
export const ANTI_FAKE_OUT_ITEMS = new Set(["covertcloak"]);
export const ANTI_PRIORITY_ABILITIES = new Set(["dazzling", "queenlymajesty", "armortail"]);
export const POWDER_IMMUNE_ABILITIES = new Set(["overcoat"]);
export const POWDER_IMMUNE_ITEMS = new Set(["safetygoggles"]);
export const SLEEP_IMMUNE_ABILITIES = new Set(["sweetveil", "insomnia", "vitalspirit", "comatose"]);

export const BULKY_SUPPORT_THRESHOLD = 128;
export const TANK_BULK_THRESHOLD = 130;
export const FRAIL_SWEEPER_BULK_THRESHOLD = 118;
export const FAST_ATTACKER_SPEED_THRESHOLD = 135;
export const SWEEPER_ATTACK_THRESHOLD = 155;
export const WALLBREAKER_ATTACK_THRESHOLD = 175;
export const SLOW_ATTACKER_ATTACK_THRESHOLD = 130;
export const SLOW_ATTACKER_SPEED_THRESHOLD = 90;
export const OFFENSE_LEAN_THRESHOLD = 24;
export const OFFENSE_INVESTMENT_THRESHOLD = 24;
export const OFFENSE_INTENT_THRESHOLD = 12;
export const DEFENSE_INVESTMENT_THRESHOLD = 18;

export const TACTICAL_ROLE_ORDER = ["modeenabler", "tempocontrol", "leadpressure", "speedboostself", "softspeedcontrol", "speeddebuff", "paralysiscontrol", "tailwind", "trickroom", "slowattacker", "trickroomsweeper", "antitrickroom", "antitailwind", "antispeedcontrol", "screens", "reflectsetter", "lightscreensetter", "auroraveilsetter", "weather", "weathersetter", "rainsetter", "sunsetter", "sandsetter", "snowsetter", "weathercore", "weatherresetpivot", "weathersweeper", "weatherabuser", "terrain", "terrainsetter", "electricterrainsetter", "psychicterrainsetter", "grassyterrainsetter", "mistyterrainsetter", "terrainstatusguard", "terrainpriorityguard", "terraincore", "terrainresetpivot", "terrainabuser", "setup"];
export const SUPPORT_ROLE_ORDER = ["lead", "fakeout", "redirection", "followme", "ragepowder", "antiredirection", "guard", "wideguard", "quickguard", "antispread", "helpinghand", "protectivesupport", "pivot", "partingshot", "uturnpivot", "voltswitchpivot", "flipturnpivot", "fakeoutpivot", "intimidatepivot", "regeneratorpivot", "hazardsetter", "stealthrocksetter", "spikessetter", "toxicspikessetter", "stickywebsetter", "hazardremoval", "rapidspin", "defog", "courtchange", "mortalspin", "tidyup", "disruption", "tempocontrol", "statusspreader", "taunt", "encore", "disable", "debuffer", "snarl", "eerieimpulse", "offensivedebuffer", "faketears", "screech", "metalsound", "acidspray", "willowisp", "paralysisspreader", "sleep", "recovery", "healingsupport", "cleric", "leftoverssustain", "attritioncore", "wall", "mixedwall", "damagesponge", "bulkyattacker", "recoverywall", "midgamestabilizer", "defensiveswitchin", "baitsink", "tradepiece", "wallbreaker", "revengekiller", "endgamewincondition", "utilitypokemon", "threatcheck", "backlinecleaner", "corecheck", "metacounter", "counterpressured", "trapper", "antisetup", "haze", "clearsmog", "imprison", "phazer", "priority", "priorityattacker", "choicescarf", "focussash", "assaultvest", "covertcloak", "safetygoggles", "clearamulet", "consistentaction", "intimidate", "antiintimidate", "powderimmune", "antisleep", "antipowder", "antipriority", "fakeoutproof", "antiweather", "antiterrain"];
export const STRUCTURE_ROLE_ORDER = ["sweeper", "frailsweeper", "tank", "support", "bulkysupport"];
export const PRIMARY_ROLE_ORDER = ["attacker", "speedcontrol", "support", "disruptor", "pivot", "tank", "modesetter", "techcheck", "compression"];
export const KEY_ROLE_ORDER = [...TACTICAL_ROLE_ORDER, ...SUPPORT_ROLE_ORDER];
export const RECOMMENDATION_ROLE_IDS = ["modeenabler", "tempocontrol", "leadpressure", "speedboostself", "speeddebuff", "paralysiscontrol", "trickroom", "slowattacker", "trickroomsweeper", "antitrickroom", "antitailwind", "fakeout", "redirection", "antiredirection", "guard", "wideguard", "quickguard", "helpinghand", "pivot", "fakeoutpivot", "intimidatepivot", "regeneratorpivot", "hazardsetter", "hazardremoval", "statusspreader", "disruption", "screens", "weather", "weathersetter", "weathercore", "weatherresetpivot", "weathersweeper", "weatherabuser", "terrain", "terrainsetter", "terrainstatusguard", "terrainpriorityguard", "terraincore", "terrainresetpivot", "terrainabuser", "trapper", "phazer", "intimidate", "antiintimidate", "antisleep", "antipriority", "fakeoutproof", "antispread", "choicescarf", "consistentaction", "wall", "mixedwall", "damagesponge", "bulkyattacker", "recoverywall", "midgamestabilizer", "assaultvesttank", "wallbreaker", "revengekiller", "endgamewincondition", "utilitypokemon", "corecheck", "metacounter"];
export const ATTACK_BIAS_ORDER = ["physical", "special", "mixed", "support"];

export const SUPPORT_SIGNAL_ROLES = new Set([
  "speedboostself",
  "modeenabler",
  "tempocontrol",
  "softspeedcontrol",
  "speeddebuff",
  "paralysiscontrol",
  "tailwind",
  "trickroom",
  "slowattacker",
  "antitrickroom",
  "antitailwind",
  "screens",
  "weather",
  "weathersetter",
  "weatherresetpivot",
  "weatherabuser",
  "terrain",
  "terrainsetter",
  "terrainstatusguard",
  "terrainpriorityguard",
  "terrainresetpivot",
  "terrainabuser",
  "lead",
  "fakeout",
  "redirection",
  "antiredirection",
  "guard",
  "wideguard",
  "helpinghand",
  "protectivesupport",
  "pivot",
  "fakeoutpivot",
  "intimidatepivot",
  "regeneratorpivot",
  "hazardsetter",
  "hazardremoval",
  "disruption",
  "statusspreader",
  "debuffer",
  "sleep",
  "recovery",
  "cleric",
  "leftoverssustain",
  "antisetup",
  "phazer",
  "trapper",
  "intimidate",
  "antiintimidate",
  "antisleep",
  "antipriority",
  "fakeoutproof",
  "antispread",
  "focussash",
  "covertcloak",
  "safetygoggles",
  "clearamulet",
  "consistentaction",
]);

export const ITEM_ROLE_HINTS = Object.freeze({
  choicescarf: ["choicescarf", "cleaner", "externalspeed"],
  choicespecs: ["nuke", "wallbreaker"],
  choiceband: ["nuke", "wallbreaker"],
  lifeorb: ["nuke"],
  expertbelt: ["wallbreaker"],
  assaultvest: ["assaultvest", "specialwall", "tank"],
  focussash: ["focussash", "lead", "consistentaction", "coverdependent"],
  sitrusberry: ["tank", "support"],
  leftovers: ["leftoverssustain", "tank"],
  covertcloak: ["covertcloak", "techcheck", "fakeoutproof", "consistentaction"],
  safetygoggles: ["safetygoggles", "antisleep", "powderimmune", "techcheck"],
  clearamulet: ["clearamulet", "techcheck", "antiintimidate"],
  electricseed: ["terrainabuser", "tank"],
  grassyseed: ["terrainabuser", "tank"],
  mistyseed: ["terrainabuser", "tank"],
  psychicseed: ["terrainabuser", "tank"],
});
