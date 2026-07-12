import {cp, mkdir, readFile, readdir, rm, stat, utimes, writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {existsSync} from "node:fs";
import path from "node:path";
import process from "node:process";

function findRepoRoot(startDirectory) {
  let current = startDirectory;
  while (true) {
    if (existsSync(path.join(current, "index.html")) && existsSync(path.join(current, "static", "app", "main.js"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Could not find repository root from current working directory");
    }
    current = parent;
  }
}

const repoRoot = findRepoRoot(process.cwd());
const distRoot = path.join(repoRoot, "dist", "desktop");

const FILE_ASSETS = [
  "index.html",
  "icon.png",
  "config-default.txt",
  "PSChina Server Translation SV-1.7.2.user.js",
  "static/localization-data.json",
  "static/usage.json",
  "static/paste_sets_champions_mb.json",
  "static/paste_teams_champions_mb.json",
  "static/usage-derived.json",
  "static/vgcpastes-source-index.json",
  "static/team-planner-assets.json",
  "static/pokemonicons-sheet.png",
  "static/itemicons-sheet.png",
  "static/poke-icons-map.json",
  "static/champions-official-icons.json",
  "poke_analysis-main/stats/abilities.json",
  "poke_analysis-main/stats/champions_vgc.json",
  "poke_analysis-main/stats/formats.json",
  "poke_analysis-main/stats/forms_index.json",
  "poke_analysis-main/stats/items.json",
  "poke_analysis-main/stats/learnsets.json",
  "poke_analysis-main/stats/moves.json",
  "poke_analysis-main/stats/pokedex.json",
];

const DIRECTORY_ASSETS = [
  "static/app",
  "static/css",
  "static/workers",
  "static/team-planner-assets",
  "static/champions-official-icons",
  "vendor/champions-damage-core",
];

const DATA_CACHE_VERSION_PATH = "static/data-cache-version.json";
const DATA_CACHE_ASSETS = FILE_ASSETS.filter((relativePath) => relativePath.endsWith(".json"));

async function assertExists(relativePath) {
  const source = path.join(repoRoot, relativePath);
  await stat(source).catch(() => {
    throw new Error(`Required desktop asset is missing: ${relativePath}`);
  });
}

async function copyIfChanged(source, target) {
  const [sourceStat, targetStat] = await Promise.all([
    stat(source),
    stat(target).catch(() => null),
  ]);
  if (targetStat && targetStat.size === sourceStat.size && targetStat.mtimeMs >= sourceStat.mtimeMs) {
    return false;
  }
  await mkdir(path.dirname(target), {recursive: true});
  await cp(source, target);
  await utimes(target, sourceStat.atime, sourceStat.mtime);
  return true;
}


async function copyFileAsset(relativePath, options = {}) {
  const source = path.join(repoRoot, relativePath);
  const target = path.join(distRoot, relativePath);
  if (options.incremental) {
    return copyIfChanged(source, target);
  }
  await mkdir(path.dirname(target), {recursive: true});
  await cp(source, target);
  return true;
}

async function copyDirectoryAsset(relativePath, options = {}) {
  const source = path.join(repoRoot, relativePath);
  const target = path.join(distRoot, relativePath);
  if (options.incremental) {
    return copyDirectoryChanged(source, target);
  }
  await mkdir(path.dirname(target), {recursive: true});
  await cp(source, target, {recursive: true});
  return true;
}

async function copyDirectoryChanged(source, target) {
  let changed = 0;
  await mkdir(target, {recursive: true});
  for (const entry of await readdir(source, {withFileTypes: true})) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      changed += await copyDirectoryChanged(sourcePath, targetPath);
      continue;
    }
    if (entry.isFile() && await copyIfChanged(sourcePath, targetPath)) {
      changed += 1;
    }
  }
  return changed;
}


async function countFiles(directory) {
  let total = 0;
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const entryPath = path.join(directory, entry.name);
    total += entry.isDirectory() ? await countFiles(entryPath) : 1;
  }
  return total;
}

async function writeDataCacheVersion() {
  const hash = createHash("sha256");
  for (const relativePath of DATA_CACHE_ASSETS) {
    hash.update(relativePath);
    hash.update(await readFile(path.join(repoRoot, relativePath)));
  }
  const target = path.join(distRoot, DATA_CACHE_VERSION_PATH);
  await mkdir(path.dirname(target), {recursive: true});
  await writeFile(target, `${JSON.stringify({version: hash.digest("hex")})}\n`);
}

async function check() {
  await Promise.all([...FILE_ASSETS, ...DIRECTORY_ASSETS].map(assertExists));
}

async function prepare(options = {}) {
  await check();
  if (!options.incremental) {
    await rm(distRoot, {recursive: true, force: true});
  }
  await mkdir(distRoot, {recursive: true});
  let changed = 0;
  for (const file of FILE_ASSETS) {
    changed += await copyFileAsset(file, options) ? 1 : 0;
  }
  for (const directory of DIRECTORY_ASSETS) {
    const copied = await copyDirectoryAsset(directory, options);
    changed += Number(copied || 0);
  }
  await writeDataCacheVersion();
  const fileCount = await countFiles(distRoot);
  const mode = options.incremental ? "Updated" : "Prepared";
  console.log(`${mode} ${changed} changed files, ${fileCount} total desktop asset files in ${path.relative(repoRoot, distRoot)}`);
}

if (process.argv.includes("--check")) {
  await check();
  console.log("Desktop asset inputs are present");
} else {
  await prepare({incremental: process.argv.includes("--dev")});
}

if (!existsSync(path.join(distRoot, "index.html")) && !process.argv.includes("--check")) {
  throw new Error("Desktop asset staging did not create index.html");
}
