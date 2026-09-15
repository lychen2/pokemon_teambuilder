"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var names_exports = {};
__export(names_exports, {
  ColorNames: () => ColorNames,
  EggGroupNames: () => EggGroupNames,
  GenderNames: () => GenderNames,
  NatureNames: () => NatureNames,
  StatMediumNames: () => StatMediumNames,
  StatNames: () => StatNames,
  StatShortNames: () => StatShortNames,
  StatusNames: () => StatusNames,
  TargetNames: () => TargetNames,
  TypeNames: () => TypeNames
});
module.exports = __toCommonJS(names_exports);
const StatNames = {
  hp: "\uFF28\uFF30",
  atk: "\u653B\u6483",
  def: "\u9632\u5FA1",
  spa: "\u7279\u653B",
  spd: "\u7279\u9632",
  spe: "\u7D20\u65E9\u3055",
  accuracy: "\u547D\u4E2D\u7387",
  evasion: "\u56DE\u907F\u7387",
  spc: "\u7279\u6B8A",
  // n.b. used in "stats were lowered" battle messages,
  // so it should be lowercase (unlike "Stats" in ui.ts)
  stats: "\u30B9\u30C6\u30FC\u30BF\u30B9"
};
const StatMediumNames = {
  hp: "\uFF28\uFF30",
  atk: "\u3053\u3046\u3052\u304D",
  def: "\u307C\u3046\u304E\u3087",
  spa: "\u3068\u304F\u3053\u3046",
  spd: "\u3068\u304F\u307C\u3046",
  spe: "\u3059\u3070\u3084\u3055",
  accuracy: "\u3081\u3044\u3061\u3085\u3046",
  evasion: "\u304B\u3044\u3072",
  spc: "\u3068\u304F\u3057\u3085"
};
const StatShortNames = {
  hp: "\uFF28",
  atk: "\uFF21",
  def: "\uFF22",
  spa: "\uFF23",
  spd: "\uFF24",
  spe: "\uFF33",
  spc: "\uFF23\uFF24"
};
const TypeNames = {
  bug: "\u3080\u3057",
  dark: "\u3042\u304F",
  dragon: "\u30C9\u30E9\u30B4\u30F3",
  electric: "\u3067\u3093\u304D",
  fairy: "\u30D5\u30A7\u30A2\u30EA\u30FC",
  fighting: "\u304B\u304F\u3068\u3046",
  fire: "\u307B\u306E\u304A",
  flying: "\u3072\u3053\u3046",
  ghost: "\u30B4\u30FC\u30B9\u30C8",
  grass: "\u304F\u3055",
  ground: "\u3058\u3081\u3093",
  ice: "\u3053\u304A\u308A",
  normal: "\u30CE\u30FC\u30DE\u30EB",
  poison: "\u3069\u304F",
  psychic: "\u30A8\u30B9\u30D1\u30FC",
  rock: "\u3044\u308F",
  steel: "\u306F\u304C\u306D",
  stellar: "\u30B9\u30C6\u30E9",
  water: "\u307F\u305A"
};
const NatureNames = {
  adamant: "\u3044\u3058\u3063\u3071\u308A",
  bashful: "\u3066\u308C\u3084",
  bold: "\u305A\u3076\u3068\u3044",
  brave: "\u3086\u3046\u304B\u3093",
  calm: "\u304A\u3060\u3084\u304B",
  careful: "\u3057\u3093\u3061\u3087\u3046",
  docile: "\u3059\u306A\u304A",
  gentle: "\u304A\u3068\u306A\u3057\u3044",
  hardy: "\u304C\u3093\u3070\u308A\u3084",
  hasty: "\u305B\u3063\u304B\u3061",
  impish: "\u308F\u3093\u3071\u304F",
  jolly: "\u3088\u3046\u304D",
  lax: "\u306E\u3046\u3066\u3093\u304D",
  lonely: "\u3055\u307F\u3057\u304C\u308A",
  mild: "\u304A\u3063\u3068\u308A",
  modest: "\u3072\u304B\u3048\u3081",
  naive: "\u3080\u3058\u3083\u304D",
  naughty: "\u3084\u3093\u3061\u3083",
  quiet: "\u308C\u3044\u305B\u3044",
  quirky: "\u304D\u307E\u3050\u308C",
  rash: "\u3046\u3063\u304B\u308A\u3084",
  relaxed: "\u306E\u3093\u304D",
  sassy: "\u306A\u307E\u3044\u304D",
  serious: "\u307E\u3058\u3081",
  timid: "\u304A\u304F\u3073\u3087\u3046"
};
const GenderNames = {
  male: "\u30AA\u30B9",
  female: "\u30E1\u30B9",
  genderless: "\u305B\u3044\u3079\u3064\u306A\u3057"
};
const StatusNames = {
  // official status condition names
  brn: "\u3084\u3051\u3069",
  par: "\u307E\u3072",
  slp: "\u306D\u3080\u308A",
  frz: "\u3053\u304A\u308A",
  psn: "\u3069\u304F",
  tox: "\u3082\u3046\u3069\u304F",
  fnt: "\u3072\u3093\u3057",
  confusion: "\u3053\u3093\u3089\u3093"
};
const TargetNames = {
  normal: null,
  // NEEDS TRANSLATION
  normalDoubles: null,
  // NEEDS TRANSLATION
  normalSingles: null,
  // NEEDS TRANSLATION
  normalFFA: null,
  // NEEDS TRANSLATION
  self: null,
  // NEEDS TRANSLATION
  adjacentAlly: null,
  // NEEDS TRANSLATION
  adjacentAllyDoubles: null,
  // NEEDS TRANSLATION
  adjacentAllySingles: null,
  // NEEDS TRANSLATION
  adjacentAllyOrSelf: null,
  // NEEDS TRANSLATION
  adjacentAllyOrSelfDoubles: null,
  // NEEDS TRANSLATION
  adjacentFoe: null,
  // NEEDS TRANSLATION
  allAdjacentFoes: null,
  // NEEDS TRANSLATION
  allAdjacentFoesDoubles: null,
  // NEEDS TRANSLATION
  foeSide: null,
  // NEEDS TRANSLATION
  allySide: null,
  // NEEDS TRANSLATION
  allyTeam: null,
  // NEEDS TRANSLATION
  allAdjacent: null,
  // NEEDS TRANSLATION
  allAdjacentDoubles: null,
  // NEEDS TRANSLATION
  allAdjacentFFA: null,
  // NEEDS TRANSLATION
  any: null,
  // NEEDS TRANSLATION
  all: null,
  // NEEDS TRANSLATION
  scripted: null,
  // NEEDS TRANSLATION
  randomNormal: null,
  // NEEDS TRANSLATION
  randomNormalDoubles: null,
  // NEEDS TRANSLATION
  allies: null
  // NEEDS TRANSLATION
};
const EggGroupNames = {
  monster: null,
  // NEEDS TRANSLATION
  water1: null,
  // NEEDS TRANSLATION
  bug: null,
  // NEEDS TRANSLATION
  flying: null,
  // NEEDS TRANSLATION
  field: null,
  // NEEDS TRANSLATION
  fairy: null,
  // NEEDS TRANSLATION
  grass: null,
  // NEEDS TRANSLATION
  humanlike: null,
  // NEEDS TRANSLATION
  water3: null,
  // NEEDS TRANSLATION
  mineral: null,
  // NEEDS TRANSLATION
  amorphous: null,
  // NEEDS TRANSLATION
  water2: null,
  // NEEDS TRANSLATION
  ditto: null,
  // NEEDS TRANSLATION
  dragon: null,
  // NEEDS TRANSLATION
  undiscovered: null
  // NEEDS TRANSLATION
};
const ColorNames = {
  black: "\u9ED2",
  blue: "\u9752",
  brown: "\u8336",
  gray: "\u7070",
  green: "\u7DD1",
  pink: "\u6843",
  purple: "\u7D2B",
  red: "\u8D64",
  white: "\u767D",
  yellow: "\u9EC4"
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ColorNames,
  EggGroupNames,
  GenderNames,
  NatureNames,
  StatMediumNames,
  StatNames,
  StatShortNames,
  StatusNames,
  TargetNames,
  TypeNames
});
