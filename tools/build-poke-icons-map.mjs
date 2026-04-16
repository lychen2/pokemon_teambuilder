import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const ICON_DIR = path.join(ROOT_DIR, "Poke Icons");
const POKEDEX_PATH = path.join(ROOT_DIR, "poke_analysis-main/stats/pokedex.json");
const OUTPUT_PATH = path.join(ROOT_DIR, "static/poke-icons-map.json");
const ICON_PREFIX = "./Poke%20Icons/";
const FORM_FALLBACKS = {
  meowsticfmega: "meowsticmmega",
  polteageistantique: "polteageist",
  sinistchamasterpiece: "sinistcha",
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getUsableIconFiles() {
  return fs.readdirSync(ICON_DIR)
    .filter((name) => name.endsWith(".png"))
    .filter((name) => !name.endsWith("_S.png"))
    .filter((name) => !name.includes(" #"));
}

function getBaseSpeciesId(speciesId, entry, nameToId) {
  if (!entry.baseSpecies) {
    return speciesId;
  }
  return nameToId.get(entry.baseSpecies) || speciesId;
}

function getFormIndex(speciesId, entry, pokedex, nameToId) {
  if (!entry.baseSpecies) {
    return 0;
  }
  const baseSpeciesId = getBaseSpeciesId(speciesId, entry, nameToId);
  const baseEntry = pokedex[baseSpeciesId];
  const formOrder = baseEntry?.formeOrder || [baseEntry?.name || entry.baseSpecies];
  const formIndex = formOrder.indexOf(entry.name);
  return formIndex >= 0 ? formIndex : 0;
}

function buildIconStem(num, formIndex) {
  return `ui_PokeIcon_01_${String(num).padStart(4, "0")}_${String(formIndex).padStart(2, "0")}_0`;
}

function buildIconUrlMap(files) {
  return new Map(
    files.map((name) => [
      name.replace(/\.png$/, ""),
      `${ICON_PREFIX}${encodeURIComponent(name)}`,
    ]),
  );
}

function resolveIconUrl(speciesId, pokedex, nameToId, iconUrls) {
  const entry = pokedex[speciesId];
  if (!entry?.num) {
    return "";
  }
  const stem = buildIconStem(entry.num, getFormIndex(speciesId, entry, pokedex, nameToId));
  if (iconUrls.has(stem)) {
    return iconUrls.get(stem);
  }
  const fallbackSpeciesId = FORM_FALLBACKS[speciesId];
  if (!fallbackSpeciesId) {
    return "";
  }
  return resolveIconUrl(fallbackSpeciesId, pokedex, nameToId, iconUrls);
}

function main() {
  const pokedex = readJson(POKEDEX_PATH);
  const nameToId = new Map(Object.entries(pokedex).map(([speciesId, entry]) => [entry.name, speciesId]));
  const iconUrls = buildIconUrlMap(getUsableIconFiles());
  const iconMap = {};

  Object.keys(pokedex).forEach((speciesId) => {
    const url = resolveIconUrl(speciesId, pokedex, nameToId, iconUrls);
    if (url) {
      iconMap[speciesId] = url;
    }
  });

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(iconMap, null, 2)}\n`);
  console.log(`Generated ${Object.keys(iconMap).length} Poke Icons mappings -> ${path.relative(ROOT_DIR, OUTPUT_PATH)}`);
}

main();
