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
  hp: "PS",
  "hp:grammar": "mp",
  atk: "Attacco",
  "atk:grammar": "ms",
  def: "Difesa",
  "def:grammar": "fs",
  spa: "Attacco Speciale",
  "spa:grammar": "ms",
  spd: "Difesa Speciale",
  "spd:grammar": "fs",
  spe: "Velocit\xE0",
  "spe:grammar": "fs",
  accuracy: "precisione",
  "accuracy:grammar": "fs",
  evasion: "elusione",
  "evasion:grammar": "fs",
  spc: "Speciale",
  "spc:grammar": "ms",
  // n.b. used in "stats were lowered" battle messages,
  // so it should be lowercase (unlike "Stats" in ui.ts)
  stats: "statistiche",
  "stats:grammar": "fp"
};
const StatMediumNames = {
  hp: "PS",
  atk: "Attacco",
  def: "Difesa",
  spa: "Att. Sp.",
  spd: "Dif. Sp.",
  spe: "Velocit\xE0",
  accuracy: "Precisione",
  evasion: "Elusione",
  spc: "Speciale"
};
const StatShortNames = {
  hp: "PS",
  atk: "Att",
  def: "Dif",
  spa: "ASp",
  spd: "DSp",
  spe: "Vel",
  spc: "Spc"
  // deliberate PS shorthand: avoids clash with English "Spe" (Speed)
};
const TypeNames = {
  bug: "Coleottero",
  dark: "Buio",
  dragon: "Drago",
  electric: "Elettro",
  fairy: "Folletto",
  fighting: "Lotta",
  fire: "Fuoco",
  flying: "Volante",
  ghost: "Spettro",
  grass: "Erba",
  ground: "Terra",
  ice: "Ghiaccio",
  normal: "Normale",
  poison: "Veleno",
  psychic: "Psico",
  rock: "Roccia",
  steel: "Acciaio",
  stellar: "Astrale",
  water: "Acqua"
};
const NatureNames = {
  adamant: "Decisa",
  bashful: "Ritrosa",
  bold: "Sicura",
  brave: "Audace",
  calm: "Calma",
  careful: "Cauta",
  docile: "Docile",
  gentle: "Gentile",
  hardy: "Ardita",
  hasty: "Lesta",
  impish: "Scaltra",
  jolly: "Allegra",
  lax: "Fiacca",
  lonely: "Schiva",
  mild: "Mite",
  modest: "Modesta",
  naive: "Ingenua",
  naughty: "Birbona",
  quiet: "Quieta",
  quirky: "Furba",
  rash: "Ardente",
  relaxed: "Placida",
  sassy: "Vivace",
  serious: "Seria",
  timid: "Timida"
};
const GenderNames = {
  male: "Maschio",
  female: "Femmina",
  genderless: "Sconosciuto"
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
  black: "Nero",
  blue: "Blu",
  brown: "Marrone",
  gray: "Grigio",
  green: "Verde",
  pink: "Rosa",
  purple: "Viola",
  red: "Rosso",
  white: "Bianco",
  yellow: "Giallo"
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
