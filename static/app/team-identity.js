import {getStructureRoles, getUtilityRoles} from "./team-roles.js";
import {getTypeLabel} from "./utils.js";

const DEFENSIVE_COMBOS = [
  {id: "fire-water-grass", types: ["Fire", "Water", "Grass"]},
  {id: "dragon-steel-fairy", types: ["Dragon", "Steel", "Fairy"]},
  {id: "water-ground-flying", types: ["Water", "Ground", "Flying"]},
  {id: "electric-ground-flying", types: ["Electric", "Ground", "Flying"]},
];

function buildCounts(team = []) {
  const utilityCounts = new Map();
  const structureCounts = new Map();
  team.forEach((config) => {
    getUtilityRoles(config).forEach((roleId) => {
      utilityCounts.set(roleId, Number(utilityCounts.get(roleId) || 0) + 1);
    });
    getStructureRoles(config).forEach((roleId) => {
      structureCounts.set(roleId, Number(structureCounts.get(roleId) || 0) + 1);
    });
  });
  return {utilityCounts, structureCounts};
}

function getCount(map, key) {
  return Number(map.get(key) || 0);
}

function buildArchetypeEntries(team = [], speedContext, counts) {
  const sweepers = getCount(counts.structureCounts, "sweeper") + getCount(counts.structureCounts, "frailsweeper");
  const bulky = getCount(counts.structureCounts, "tank") + getCount(counts.structureCounts, "bulkysupport");
  const utility = counts.utilityCounts;
  const entries = [];
  if (speedContext.mode === "trickroom") entries.push("trickroom");
  if (speedContext.mode === "hybrid") entries.push("hybridspeed");
  if (getCount(utility, "tailwind") >= 1 && sweepers >= 2) entries.push("tailwindoffense");
  if (getCount(utility, "pivot") >= 2 && (getCount(utility, "fakeout") >= 1 || getCount(utility, "intimidate") >= 1) && bulky >= 2) {
    entries.push("pivotbalance");
  }
  if (sweepers >= 3 && [...utility.values()].filter((count) => count > 0).length <= 4) entries.push("hyperoffense");
  if (!entries.length) entries.push("balanced");
  if (entries[0] !== "balanced" && !entries.includes("balanced")) entries.push("balanced");
  return entries;
}

function buildDefensiveCombos(team = [], language = "zh") {
  return DEFENSIVE_COMBOS.map((combo) => {
    const coveredTypes = combo.types.filter((type) => team.some((config) => (config.types || []).includes(type)));
    const missingTypes = combo.types.filter((type) => !coveredTypes.includes(type));
    const status = missingTypes.length === 0 ? "complete" : (missingTypes.length === 1 ? "near" : "missing");
    return {
      id: combo.id,
      label: combo.types.map((type) => getTypeLabel(type, language)).join(" / "),
      coveredTypes: coveredTypes.map((type) => getTypeLabel(type, language)),
      missingTypes: missingTypes.map((type) => getTypeLabel(type, language)),
      focusType: missingTypes.length === 1 ? missingTypes[0] : "",
      status,
    };
  });
}

export function summarizeTeamIdentity(team = [], speedContext, language = "zh") {
  const counts = buildCounts(team);
  const archetypes = buildArchetypeEntries(team, speedContext, counts);
  return {
    primaryArchetypeId: archetypes[0] || "balanced",
    secondaryArchetypeIds: archetypes.slice(1, 3),
    defensiveCombos: buildDefensiveCombos(team, language),
  };
}
