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
  hp: "HP",
  atk: "\u653B\u51FB",
  def: "\u9632\u5FA1",
  spa: "\u7279\u653B",
  spd: "\u7279\u9632",
  spe: "\u901F\u5EA6",
  accuracy: "\u547D\u4E2D\u7387",
  evasion: "\u95EA\u907F\u7387",
  spc: "\u7279\u6B8A",
  // n.b. used in "stats were lowered" battle messages,
  // so it should be lowercase (unlike "Stats" in ui.ts)
  stats: "\u80FD\u529B"
};
const StatMediumNames = {
  hp: "HP",
  atk: "\u653B\u51FB",
  def: "\u9632\u5FA1",
  spa: "\u7279\u653B",
  spd: "\u7279\u9632",
  spe: "\u901F\u5EA6",
  accuracy: "\u547D\u4E2D",
  evasion: "\u95EA\u907F",
  spc: "\u7279\u6B8A"
};
const StatShortNames = {
  hp: "HP",
  atk: "\u653B",
  def: "\u9632",
  spa: "\u7279\u653B",
  spd: "\u7279\u9632",
  spe: "\u901F",
  spc: "\u7279"
};
const TypeNames = {
  bug: "\u866B",
  dark: "\u6076",
  dragon: "\u9F99",
  electric: "\u7535",
  fairy: "\u5996\u7CBE",
  fighting: "\u683C\u6597",
  fire: "\u706B",
  flying: "\u98DE\u884C",
  ghost: "\u5E7D\u7075",
  grass: "\u8349",
  ground: "\u5730\u9762",
  ice: "\u51B0",
  normal: "\u4E00\u822C",
  poison: "\u6BD2",
  psychic: "\u8D85\u80FD\u529B",
  rock: "\u5CA9\u77F3",
  steel: "\u94A2",
  stellar: "\u661F\u6676",
  water: "\u6C34"
};
const NatureNames = {
  adamant: "\u56FA\u6267",
  bashful: "\u5BB3\u7F9E",
  bold: "\u5927\u80C6",
  brave: "\u52C7\u6562",
  calm: "\u6E29\u548C",
  careful: "\u614E\u91CD",
  docile: "\u5766\u7387",
  gentle: "\u6E29\u987A",
  hardy: "\u52E4\u594B",
  hasty: "\u6025\u8E81",
  impish: "\u6DD8\u6C14",
  jolly: "\u723D\u6717",
  lax: "\u4E50\u5929",
  lonely: "\u6015\u5BC2\u5BDE",
  mild: "\u6162\u541E\u541E",
  modest: "\u5185\u655B",
  naive: "\u5929\u771F",
  naughty: "\u987D\u76AE",
  quiet: "\u51B7\u9759",
  quirky: "\u6D6E\u8E81",
  rash: "\u9A6C\u864E",
  relaxed: "\u60A0\u95F2",
  sassy: "\u81EA\u5927",
  serious: "\u8BA4\u771F",
  timid: "\u80C6\u5C0F"
};
const GenderNames = {
  male: "\u96C4\u6027",
  female: "\u96CC\u6027",
  genderless: null
  // NEEDS TRANSLATION
};
const StatusNames = {
  brn: "\u707C\u4F24",
  par: "\u9EBB\u75F9",
  slp: "\u7761\u7720",
  frz: "\u51B0\u51BB",
  psn: "\u4E2D\u6BD2",
  tox: "\u5267\u6BD2",
  fnt: "\u6FD2\u6B7B",
  // official (Gen 7+ ability/flavor text, e.g. 引爆 "变为濒死时")
  confusion: "\u6DF7\u4E71"
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
  black: "\u9ED1\u8272",
  blue: "\u84DD\u8272",
  brown: "\u8910\u8272",
  gray: "\u7070\u8272",
  green: "\u7EFF\u8272",
  pink: "\u7C89\u7EA2\u8272",
  purple: "\u7D2B\u8272",
  red: "\u7EA2\u8272",
  white: "\u767D\u8272",
  yellow: "\u9EC4\u8272"
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
