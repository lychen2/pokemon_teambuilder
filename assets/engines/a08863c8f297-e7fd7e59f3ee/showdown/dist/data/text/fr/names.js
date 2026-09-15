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
  hp: "PV",
  atk: "Attaque",
  "atk:grammar": "fs",
  def: "D\xE9fense",
  "def:grammar": "fs",
  spa: "Attaque Sp\xE9ciale",
  "spa:grammar": "fs",
  spd: "D\xE9fense Sp\xE9ciale",
  "spd:grammar": "fs",
  spe: "Vitesse",
  "spe:grammar": "fs",
  accuracy: "Pr\xE9cision",
  "accuracy:grammar": "fs",
  evasion: "Esquive",
  "evasion:grammar": "fs",
  spc: "Sp\xE9cial",
  "spc:grammar": "ms",
  // n.b. used in "stats were lowered" battle messages,
  // so it should be lowercase (unlike "Stats" in ui.ts)
  stats: "stats",
  "stats:grammar": "fp"
};
const StatMediumNames = {
  hp: "PV",
  atk: "Attaque",
  def: "D\xE9fense",
  spa: "Atq. Sp\xE9.",
  spd: "D\xE9f. Sp\xE9.",
  spe: "Vitesse",
  accuracy: "Pr\xE9cision",
  evasion: "Esquive",
  spc: "Sp\xE9cial"
};
const StatShortNames = {
  hp: "PV",
  atk: "Atq",
  def: "D\xE9f",
  spa: "ASp",
  spd: "DSp",
  spe: "Vit",
  spc: "Sp\xE9"
};
const TypeNames = {
  bug: "Insecte",
  dark: "T\xE9n\xE8bres",
  dragon: "Dragon",
  electric: "\xC9lectrik",
  fairy: "F\xE9e",
  fighting: "Combat",
  fire: "Feu",
  flying: "Vol",
  ghost: "Spectre",
  grass: "Plante",
  ground: "Sol",
  ice: "Glace",
  normal: "Normal",
  poison: "Poison",
  psychic: "Psy",
  rock: "Roche",
  steel: "Acier",
  stellar: "Stellaire",
  water: "Eau"
};
const NatureNames = {
  adamant: "Rigide",
  bashful: "Pudique",
  bold: "Assur\xE9",
  brave: "Brave",
  calm: "Calme",
  careful: "Prudent",
  docile: "Docile",
  gentle: "Gentil",
  hardy: "Hardi",
  hasty: "Press\xE9",
  impish: "Malin",
  jolly: "Jovial",
  lax: "L\xE2che",
  lonely: "Solo",
  mild: "Doux",
  modest: "Modeste",
  naive: "Na\xEFf",
  naughty: "Mauvais",
  quiet: "Discret",
  quirky: "Bizarre",
  rash: "Foufou",
  relaxed: "Relax",
  sassy: "Malpoli",
  serious: "S\xE9rieux",
  timid: "Timide"
};
const GenderNames = {
  male: "M\xE2le",
  female: "Femelle",
  genderless: null
  // NEEDS TRANSLATION
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
  black: "Noir",
  blue: "Bleu",
  brown: "Brun",
  gray: "Gris",
  green: "Vert",
  pink: "Rose",
  purple: "Violet",
  red: "Rouge",
  white: "Blanc",
  yellow: "Jaune"
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
