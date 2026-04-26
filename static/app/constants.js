export const DATA_PATHS = {
  pokedex: "./poke_analysis-main/stats/pokedex.json",
  formsIndex: "./poke_analysis-main/stats/forms_index.json",
  moves: "./poke_analysis-main/stats/moves.json",
  learnsets: "./poke_analysis-main/stats/learnsets.json",
  abilities: "./poke_analysis-main/stats/abilities.json",
  items: "./poke_analysis-main/stats/items.json",
  championsVgc: "./poke_analysis-main/stats/champions_vgc.json",
  pokeIconMap: "./static/poke-icons-map.json",
  localizationData: "./static/localization-data.json",
  usage: "./static/usage.json",
};

export const ICON_SCHEMES = {
  SHOWDOWN: "showdown",
  POKE_ICONS: "poke-icons",
};

export const TYPE_LABELS = {
  Normal: "一般",
  Fighting: "格斗",
  Flying: "飞行",
  Poison: "毒",
  Ground: "地面",
  Rock: "岩石",
  Bug: "虫",
  Ghost: "幽灵",
  Steel: "钢",
  Fire: "火",
  Water: "水",
  Grass: "草",
  Electric: "电",
  Psychic: "超能",
  Ice: "冰",
  Dragon: "龙",
  Dark: "恶",
  Fairy: "妖精",
};

export const TYPE_ORDER = Object.keys(TYPE_LABELS);

export const TYPE_CHART = {
  Normal: {Rock: 0.5, Ghost: 0, Steel: 0.5},
  Fighting: {Normal: 2, Flying: 0.5, Poison: 0.5, Rock: 2, Bug: 0.5, Ghost: 0, Steel: 2, Psychic: 0.5, Ice: 2, Dark: 2, Fairy: 0.5},
  Flying: {Fighting: 2, Rock: 0.5, Bug: 2, Steel: 0.5, Grass: 2, Electric: 0.5},
  Poison: {Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Grass: 2, Fairy: 2},
  Ground: {Flying: 0, Poison: 2, Rock: 2, Bug: 0.5, Steel: 2, Fire: 2, Grass: 0.5, Electric: 2},
  Rock: {Fighting: 0.5, Flying: 2, Ground: 0.5, Bug: 2, Steel: 0.5, Fire: 2, Ice: 2},
  Bug: {Fighting: 0.5, Flying: 0.5, Poison: 0.5, Ghost: 0.5, Steel: 0.5, Fire: 0.5, Grass: 2, Psychic: 2, Dark: 2, Fairy: 0.5},
  Ghost: {Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5},
  Steel: {Rock: 2, Steel: 0.5, Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Fairy: 2},
  Fire: {Rock: 0.5, Bug: 2, Steel: 2, Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Dragon: 0.5},
  Water: {Ground: 2, Rock: 2, Fire: 2, Water: 0.5, Grass: 0.5, Dragon: 0.5},
  Grass: {Flying: 0.5, Poison: 0.5, Ground: 2, Rock: 2, Bug: 0.5, Steel: 0.5, Fire: 0.5, Water: 2, Grass: 0.5, Dragon: 0.5},
  Electric: {Flying: 2, Ground: 0, Water: 2, Grass: 0.5, Electric: 0.5, Dragon: 0.5},
  Psychic: {Fighting: 2, Poison: 2, Steel: 0.5, Psychic: 0.5, Dark: 0},
  Ice: {Flying: 2, Ground: 2, Steel: 0.5, Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Dragon: 2},
  Dragon: {Steel: 0.5, Dragon: 2, Fairy: 0},
  Dark: {Fighting: 0.5, Ghost: 2, Psychic: 2, Dark: 0.5, Fairy: 0.5},
  Fairy: {Poison: 0.5, Steel: 0.5, Fire: 0.5, Fighting: 2, Dragon: 2, Dark: 2},
};

export const NATURE_EFFECTS = {
  Adamant: {plus: "atk", minus: "spa"},
  Bold: {plus: "def", minus: "atk"},
  Brave: {plus: "atk", minus: "spe"},
  Calm: {plus: "spd", minus: "atk"},
  Careful: {plus: "spd", minus: "spa"},
  Gentle: {plus: "spd", minus: "def"},
  Hasty: {plus: "spe", minus: "def"},
  Impish: {plus: "def", minus: "spa"},
  Jolly: {plus: "spe", minus: "spa"},
  Lax: {plus: "def", minus: "spd"},
  Lonely: {plus: "atk", minus: "def"},
  Mild: {plus: "spa", minus: "def"},
  Modest: {plus: "spa", minus: "atk"},
  Naive: {plus: "spe", minus: "spd"},
  Naughty: {plus: "atk", minus: "spd"},
  Quiet: {plus: "spa", minus: "spe"},
  Rash: {plus: "spa", minus: "spd"},
  Relaxed: {plus: "def", minus: "spe"},
  Sassy: {plus: "spd", minus: "spe"},
  Timid: {plus: "spe", minus: "atk"},
};

export const NATURE_TRANSLATIONS = Object.freeze({
  Adamant: "固执",
  Bashful: "害羞",
  Bold: "大胆",
  Brave: "勇敢",
  Calm: "沉着",
  Careful: "慎重",
  Docile: "坦率",
  Gentle: "温和",
  Hardy: "勤奋",
  Hasty: "急躁",
  Impish: "淘气",
  Jolly: "爽朗",
  Lax: "乐天",
  Lonely: "怕寂寞",
  Mild: "慢吞吞",
  Modest: "内敛",
  Naive: "天真",
  Naughty: "顽皮",
  Quiet: "冷静",
  Quirky: "浮躁",
  Rash: "马虎",
  Relaxed: "悠闲",
  Sassy: "自大",
  Serious: "认真",
  Timid: "胆小",
});

export const SCORE_WEIGHTS = {
  resistance: 10,
  coverage: 8,
  focus: 4,
  speed: 4,
  synergy: 5,
  teammates: 4,
  quality: 3,
  counterChain: 6,
};

export const CHAMPION_TOTAL_POINTS = 66;
export const CHAMPION_STAT_CAP = 32;
export const DEFAULT_CHAMPION_POINTS = {
  hp: 0,
  atk: 32,
  def: 0,
  spa: 32,
  spd: 0,
  spe: 2,
};

export const FALLBACK_LEVEL = 50;
