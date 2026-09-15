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
  hp: "KP",
  atk: "Angriff",
  "atk:grammar": "ms",
  def: "Verteidigung",
  "def:grammar": "fs",
  spa: "Spezial-Angriff",
  "spa:grammar": "ms",
  spd: "Spezial-Verteidigung",
  "spd:grammar": "fs",
  spe: "Initiative",
  "spe:grammar": "fs",
  accuracy: "Genauigkeit",
  "accuracy:grammar": "fs",
  evasion: "Ausweichwert",
  "evasion:grammar": "ms",
  spc: "Spezial",
  "spc:grammar": "ns",
  // n.b. used in "stats were lowered" battle messages,
  // so it should be lowercase (unlike "Stats" in ui.ts)
  stats: "Statuswerte",
  "stats:grammar": "mp"
};
const StatMediumNames = {
  hp: "KP",
  atk: "Angriff",
  def: "Verteidigung",
  spa: "Sp.-Ang.",
  spd: "Sp.-Vert.",
  spe: "Initiative",
  accuracy: "Genauigkeit",
  evasion: "Ausweichwert",
  spc: "Spezial"
};
const StatShortNames = {
  hp: "KP",
  atk: "Ang",
  def: "Ver",
  spa: "SpA",
  spd: "SpV",
  spe: "Ini",
  spc: "Spz"
};
const TypeNames = {
  bug: "K\xE4fer",
  dark: "Unlicht",
  dragon: "Drache",
  electric: "Elektro",
  fairy: "Fee",
  fighting: "Kampf",
  fire: "Feuer",
  flying: "Flug",
  ghost: "Geist",
  grass: "Pflanze",
  ground: "Boden",
  ice: "Eis",
  normal: "Normal",
  poison: "Gift",
  psychic: "Psycho",
  rock: "Gestein",
  steel: "Stahl",
  stellar: "Stellar",
  water: "Wasser"
};
const NatureNames = {
  adamant: "Hart",
  bashful: "Zaghaft",
  bold: "K\xFChn",
  brave: "Mutig",
  calm: "Still",
  careful: "Sacht",
  docile: "Sanft",
  gentle: "Zart",
  hardy: "Robust",
  hasty: "Hastig",
  impish: "Pfiffig",
  jolly: "Froh",
  lax: "Lasch",
  lonely: "Solo",
  mild: "Mild",
  modest: "M\xE4\xDFig",
  naive: "Naiv",
  naughty: "Frech",
  quiet: "Ruhig",
  quirky: "Kauzig",
  rash: "Hitzig",
  relaxed: "Locker",
  sassy: "Forsch",
  serious: "Ernst",
  timid: "Scheu"
};
const GenderNames = {
  male: "M\xE4nnlich",
  female: "Weiblich",
  genderless: "Unbekannt"
};
const StatusNames = {
  brn: "Verbrennungen",
  par: "Paralyse",
  slp: "Schlaf",
  frz: "Gefroren",
  psn: "Vergiftung",
  tox: "Schwere Vergiftung",
  fnt: null,
  // NEEDS TRANSLATION
  confusion: "Verwirrung"
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
  black: "Schwarz",
  blue: "Blau",
  brown: "Braun",
  gray: "Grau",
  green: "Gr\xFCn",
  pink: "Rosa",
  purple: "Violett",
  red: "Rot",
  white: "Wei\xDF",
  yellow: "Gelb"
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
