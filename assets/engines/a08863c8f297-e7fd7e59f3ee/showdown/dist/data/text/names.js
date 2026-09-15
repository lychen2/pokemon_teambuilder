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
  atk: "Attack",
  def: "Defense",
  spa: "Sp. Atk",
  spd: "Sp. Def",
  spe: "Speed",
  accuracy: "accuracy",
  evasion: "evasiveness",
  spc: "Special",
  // n.b. used in "stats were lowered" battle messages,
  // so it should be lowercase (unlike "Stats" in ui.ts)
  stats: "stats"
};
const StatMediumNames = {
  hp: "HP",
  atk: "Attack",
  def: "Defense",
  spa: "Sp. Atk",
  spd: "Sp. Def",
  spe: "Speed",
  accuracy: "Accuracy",
  evasion: "Evasiveness",
  spc: "Special"
};
const StatShortNames = {
  hp: "HP",
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe",
  spc: "Spc"
};
const TypeNames = {
  bug: "Bug",
  dark: "Dark",
  dragon: "Dragon",
  electric: "Electric",
  fairy: "Fairy",
  fighting: "Fighting",
  fire: "Fire",
  flying: "Flying",
  ghost: "Ghost",
  grass: "Grass",
  ground: "Ground",
  ice: "Ice",
  normal: "Normal",
  poison: "Poison",
  psychic: "Psychic",
  rock: "Rock",
  steel: "Steel",
  stellar: "Stellar",
  water: "Water"
};
const NatureNames = {
  adamant: "Adamant",
  bashful: "Bashful",
  bold: "Bold",
  brave: "Brave",
  calm: "Calm",
  careful: "Careful",
  docile: "Docile",
  gentle: "Gentle",
  hardy: "Hardy",
  hasty: "Hasty",
  impish: "Impish",
  jolly: "Jolly",
  lax: "Lax",
  lonely: "Lonely",
  mild: "Mild",
  modest: "Modest",
  naive: "Naive",
  naughty: "Naughty",
  quiet: "Quiet",
  quirky: "Quirky",
  rash: "Rash",
  relaxed: "Relaxed",
  sassy: "Sassy",
  serious: "Serious",
  timid: "Timid"
};
const GenderNames = {
  male: "Male",
  female: "Female",
  genderless: "Genderless"
};
const StatusNames = {
  brn: "Burned",
  par: "Paralyzed",
  slp: "Asleep",
  frz: "Frozen",
  psn: "Poisoned",
  tox: "Badly Poisoned",
  fnt: "Fainted",
  confusion: "Confused"
};
const TargetNames = {
  normal: "Can target any adjacent ally or foe",
  normalDoubles: "Can target ally or any foe",
  normalSingles: "Hits foe",
  normalFFA: "Can target any foe",
  self: "Hits user",
  adjacentAlly: "Can target any adjacent ally",
  adjacentAllyDoubles: "Hits your ally",
  adjacentAllySingles: "Always fails in Singles",
  adjacentAllyOrSelf: "Can target user or adjacent ally",
  adjacentAllyOrSelfDoubles: "Can target user or ally",
  adjacentFoe: "Can target any adjacent foe",
  allAdjacentFoes: "Hits adjacent foes",
  allAdjacentFoesDoubles: "Hits both foes",
  foeSide: "Hits opposing side",
  allySide: "Hits user's side",
  allyTeam: "Hits user's team",
  allAdjacent: "Hits adjacent allies and foes",
  allAdjacentDoubles: "Hits ally and both foes",
  allAdjacentFFA: "Hits all foes",
  any: "Can target distant Pok\xE9mon in Triples",
  all: "Hits all Pok\xE9mon",
  scripted: "Target chosen automatically",
  randomNormal: "Hits random adjacent foe",
  randomNormalDoubles: "Hits random foe",
  allies: "Hits user and allies"
};
const EggGroupNames = {
  monster: "Monster",
  water1: "Water 1",
  bug: "Bug",
  flying: "Flying",
  field: "Field",
  // Stadium 2: "Ground"
  fairy: "Fairy",
  grass: "Grass",
  // Stadium 2: "Plant"
  humanlike: "Human-Like",
  // Stadium 2: "Humanshape"
  water3: "Water 3",
  mineral: "Mineral",
  amorphous: "Amorphous",
  // Stadium 2: "Indeterminate"
  water2: "Water 2",
  ditto: "Ditto",
  dragon: "Dragon",
  undiscovered: "Undiscovered"
  // Stadium 2: "No EGGs"
};
const ColorNames = {
  black: "Black",
  blue: "Blue",
  brown: "Brown",
  gray: "Gray",
  green: "Green",
  pink: "Pink",
  purple: "Purple",
  red: "Red",
  white: "White",
  yellow: "Yellow"
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
