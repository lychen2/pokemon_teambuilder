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
  atk: "Ataque",
  "atk:grammar": "ms",
  def: "Defensa",
  "def:grammar": "fs",
  spa: "Ataque Especial",
  "spa:grammar": "ms",
  spd: "Defensa Especial",
  "spd:grammar": "fs",
  spe: "Velocidad",
  "spe:grammar": "fs",
  accuracy: "Precisi\xF3n",
  "accuracy:grammar": "fs",
  evasion: "Evasi\xF3n",
  "evasion:grammar": "fs",
  spc: "Especial",
  "spc:grammar": "ms",
  // n.b. used in "stats were lowered" battle messages,
  // so it should be lowercase (unlike "Stats" in ui.ts)
  stats: "caracter\xEDsticas",
  "stats:grammar": "fp"
};
const StatMediumNames = {
  hp: "PS",
  atk: "Ataque",
  def: "Defensa",
  spa: "At. Esp.",
  spd: "Def. Esp.",
  spe: "Velocidad",
  accuracy: "Precisi\xF3n",
  evasion: "Evasi\xF3n",
  spc: "Especial"
};
const StatShortNames = {
  hp: "PS",
  atk: "Ata",
  def: "Def",
  spa: "AEs",
  spd: "DEs",
  spe: "Vel",
  spc: "Esp"
};
const TypeNames = {
  bug: "Bicho",
  dark: "Siniestro",
  dragon: "Drag\xF3n",
  electric: "El\xE9ctrico",
  fairy: "Hada",
  fighting: "Lucha",
  fire: "Fuego",
  flying: "Volador",
  ghost: "Fantasma",
  grass: "Planta",
  ground: "Tierra",
  ice: "Hielo",
  normal: "Normal",
  poison: "Veneno",
  psychic: "Ps\xEDquico",
  rock: "Roca",
  steel: "Acero",
  stellar: "Astral",
  water: "Agua"
};
const NatureNames = {
  adamant: "Firme",
  bashful: "T\xEDmida",
  bold: "Osada",
  brave: "Audaz",
  calm: "Serena",
  careful: "Cauta",
  docile: "D\xF3cil",
  gentle: "Amable",
  hardy: "Fuerte",
  hasty: "Activa",
  impish: "Agitada",
  jolly: "Alegre",
  lax: "Floja",
  lonely: "Hura\xF1a",
  mild: "Afable",
  modest: "Modesta",
  naive: "Ingenua",
  naughty: "P\xEDcara",
  quiet: "Mansa",
  quirky: "Rara",
  rash: "Alocada",
  relaxed: "Pl\xE1cida",
  sassy: "Grosera",
  serious: "Seria",
  timid: "Miedosa"
};
const GenderNames = {
  male: "Macho",
  female: "Hembra",
  genderless: "Desconocido"
};
const StatusNames = {
  brn: "Quemado",
  // verified: SV es_common 21613
  par: "Paralizado",
  // verified: SV es_common 21609
  slp: null,
  // NEEDS TRANSLATION
  frz: null,
  // NEEDS TRANSLATION
  psn: "Envenenado",
  // verified: SV es_common 21607
  tox: "Grav. envenenado",
  // verified: SV es_common 21545
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
  black: "Negro",
  blue: "Azul",
  brown: "Marr\xF3n",
  gray: "Gris",
  green: "Verde",
  pink: "Rosa",
  purple: "Morado",
  red: "Rojo",
  white: "Blanco",
  yellow: "Amarillo"
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
