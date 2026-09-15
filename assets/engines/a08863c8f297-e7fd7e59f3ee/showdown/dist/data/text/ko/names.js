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
  atk: "\uACF5\uACA9",
  def: "\uBC29\uC5B4",
  spa: "\uD2B9\uC218\uACF5\uACA9",
  spd: "\uD2B9\uC218\uBC29\uC5B4",
  spe: "\uC2A4\uD53C\uB4DC",
  accuracy: "\uBA85\uC911\uB960",
  evasion: "\uD68C\uD53C\uC728",
  spc: "\uD2B9\uC218",
  // n.b. used in "stats were lowered" battle messages,
  // so it should be lowercase (unlike "Stats" in ui.ts)
  stats: "\uC2A4\uD14C\uC774\uD130\uC2A4"
};
const StatMediumNames = {
  hp: "HP",
  atk: "\uACF5\uACA9",
  def: "\uBC29\uC5B4",
  spa: "\uD2B9\uC218\uACF5\uACA9",
  spd: "\uD2B9\uC218\uBC29\uC5B4",
  spe: "\uC2A4\uD53C\uB4DC",
  accuracy: "\uBA85\uC911",
  evasion: "\uD68C\uD53C",
  spc: "\uD2B9\uC218"
};
const StatShortNames = {
  hp: "HP",
  atk: "\uACF5",
  def: "\uBC29",
  spa: "\uD2B9\uACF5",
  spd: "\uD2B9\uBC29",
  spe: "\uC2A4\uD54F",
  spc: "\uD2B9\uC218"
};
const TypeNames = {
  bug: "\uBC8C\uB808",
  dark: "\uC545",
  dragon: "\uB4DC\uB798\uACE4",
  electric: "\uC804\uAE30",
  fairy: "\uD398\uC5B4\uB9AC",
  fighting: "\uACA9\uD22C",
  fire: "\uBD88\uAF43",
  flying: "\uBE44\uD589",
  ghost: "\uACE0\uC2A4\uD2B8",
  grass: "\uD480",
  ground: "\uB545",
  ice: "\uC5BC\uC74C",
  normal: "\uB178\uB9D0",
  poison: "\uB3C5",
  psychic: "\uC5D0\uC2A4\uD37C",
  rock: "\uBC14\uC704",
  steel: "\uAC15\uCCA0",
  stellar: "\uC2A4\uD154\uB77C",
  water: "\uBB3C"
};
const NatureNames = {
  adamant: "\uACE0\uC9D1",
  bashful: "\uC218\uC90D\uC74C",
  bold: "\uB300\uB2F4",
  brave: "\uC6A9\uAC10",
  calm: "\uCC28\uBD84",
  careful: "\uC2E0\uC911",
  docile: "\uC628\uC21C",
  gentle: "\uC58C\uC804",
  hardy: "\uB178\uB825",
  hasty: "\uC131\uAE09",
  impish: "\uC7A5\uB09C\uAFB8\uB7EC\uAE30",
  jolly: "\uBA85\uB791",
  lax: "\uCD10\uB791",
  lonely: "\uC678\uB85C\uC6C0",
  mild: "\uC758\uC813",
  modest: "\uC870\uC2EC",
  naive: "\uCC9C\uC9C4\uB09C\uB9CC",
  naughty: "\uAC1C\uAD6C\uC7C1\uC774",
  quiet: "\uB0C9\uC815",
  quirky: "\uBCC0\uB355",
  rash: "\uB35C\uB801",
  relaxed: "\uBB34\uC0AC\uD0DC\uD3C9",
  sassy: "\uAC74\uBC29",
  serious: "\uC131\uC2E4",
  timid: "\uAC81\uC7C1\uC774"
};
const GenderNames = {
  male: "\uC218\uCEF7",
  female: "\uC554\uCEF7",
  genderless: "\uC131\uBCC4 \uC5C6\uC74C"
};
const StatusNames = {
  brn: null,
  // NEEDS TRANSLATION
  par: null,
  // NEEDS TRANSLATION
  slp: null,
  // NEEDS TRANSLATION
  frz: null,
  // NEEDS TRANSLATION
  psn: null,
  // NEEDS TRANSLATION
  tox: null,
  // NEEDS TRANSLATION
  fnt: null,
  // NEEDS TRANSLATION
  confusion: null
  // NEEDS TRANSLATION
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
  black: "\uAC80\uC815",
  blue: "\uD30C\uB791",
  brown: "\uAC08\uC0C9",
  gray: "\uD68C\uC0C9",
  green: "\uCD08\uB85D",
  pink: "\uB2F4\uD64D",
  purple: "\uBCF4\uB77C",
  red: "\uBE68\uAC15",
  white: "\uD558\uC591",
  yellow: "\uB178\uB791"
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
