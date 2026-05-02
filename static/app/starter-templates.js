export const STARTER_TEMPLATES = Object.freeze([
  Object.freeze({
    id: "balance",
    labelKey: "starter.balanceTitle",
    descriptionKey: "starter.balanceCopy",
    tagKeys: ["starter.tag.safe", "starter.tag.pivot"],
    speciesIds: ["incineroar", "garchompmega", "sinistchamasterpiece", "kingambit", "milotic", "sneasler"],
  }),
  Object.freeze({
    id: "rain",
    labelKey: "starter.rainTitle",
    descriptionKey: "starter.rainCopy",
    tagKeys: ["starter.tag.weather", "starter.tag.speed"],
    speciesIds: ["pelipper", "basculegion", "archaludon", "milotic", "incineroar", "farigiraf"],
  }),
  Object.freeze({
    id: "sun",
    labelKey: "starter.sunTitle",
    descriptionKey: "starter.sunCopy",
    tagKeys: ["starter.tag.weather", "starter.tag.offense"],
    speciesIds: ["charizardmegay", "venusaur", "torkoal", "whimsicott", "incineroar", "kingambit"],
  }),
  Object.freeze({
    id: "trick-room",
    labelKey: "starter.trickRoomTitle",
    descriptionKey: "starter.trickRoomCopy",
    tagKeys: ["starter.tag.trickRoom", "starter.tag.bulk"],
    speciesIds: ["farigiraf", "hatterene", "torkoal", "sinistcha", "kingambit", "aegislash"],
  }),
]);

export function findStarterTemplate(templateId) {
  return STARTER_TEMPLATES.find((template) => template.id === templateId) || null;
}
