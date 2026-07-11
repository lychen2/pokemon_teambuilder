import {readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

import {buildGlobalItemUsageCounts, buildGlobalMoveUsageCounts, buildUsageLookup} from "../static/app/usage.js";
import {normalizeName} from "../static/app/utils.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function json5ToJson(text) {
  return text.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3');
}

async function readJson(relativePath) {
  const text = await readFile(path.join(repoRoot, relativePath), "utf8");
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(json5ToJson(text));
  }
}

async function writeJson(relativePath, value) {
  await writeFile(path.join(repoRoot, relativePath), `${JSON.stringify(value)}\n`, "utf8");
}

function getVgcpastesSourceKey(config = {}) {
  const moves = (config.moveNames || config.moves || [])
    .map((move) => normalizeName(move))
    .filter(Boolean)
    .sort()
    .join(",");
  return [
    normalizeName(config.speciesId || config.displayName || config.name),
    normalizeName(config.item),
    normalizeName(config.ability),
    normalizeName(config.nature),
    moves,
  ].join("|");
}

function buildVgcpastesSourceIndex(configs = []) {
  return Object.fromEntries(
    configs
      .map((config) => [getVgcpastesSourceKey(config), config.source || null])
      .filter(([, source]) => source),
  );
}

function mapToObject(map) {
  return Object.fromEntries([...map.entries()]);
}

async function main() {
  const [pasteSets, usage, moves, items] = await Promise.all([
    readJson("static/paste_sets_champions_mb.json"),
    readJson("static/usage.json"),
    readJson("poke_analysis-main/stats/moves.json"),
    readJson("poke_analysis-main/stats/items.json"),
  ]);

  const moveLookup = new Map(Object.values(moves).map((entry) => [normalizeName(entry.name || entry.id), entry]));
  const itemLookup = new Map(Object.values(items).map((entry) => [normalizeName(entry.name || entry.id), entry]));
  const usageLookup = buildUsageLookup(usage);

  await Promise.all([
    writeJson("static/vgcpastes-source-index.json", {
      schemaVersion: 1,
      sourcesByConfigKey: buildVgcpastesSourceIndex(Array.isArray(pasteSets?.configs) ? pasteSets.configs : []),
    }),
    writeJson("static/usage-derived.json", {
      schemaVersion: 1,
      globalMoveUsageCounts: mapToObject(buildGlobalMoveUsageCounts(usage, moveLookup)),
      globalItemUsageCounts: mapToObject(buildGlobalItemUsageCounts(usage, itemLookup)),
    }),
  ]);
}

await main();
