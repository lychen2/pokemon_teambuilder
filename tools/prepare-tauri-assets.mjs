import {cp, mkdir, rm, stat, readdir} from "node:fs/promises";
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
  "manifest.webmanifest",
  "sw.js",
  "config-default.txt",
  "PSChina Server Translation SV-1.7.2.user.js",
  "static/localization-data.json",
  "static/usage.json",
  "static/paste_sets_champions_mb.json",
  "static/paste_teams_champions_mb.json",
  "static/team-planner-assets.json",
  "static/pokemonicons-sheet.png",
  "static/itemicons-sheet.png",
  "static/poke-icons-map.json",
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
  "vendor/champions-damage-core",
];

async function assertExists(relativePath) {
  const source = path.join(repoRoot, relativePath);
  await stat(source).catch(() => {
    throw new Error(`Required desktop asset is missing: ${relativePath}`);
  });
}

async function copyFileAsset(relativePath) {
  const source = path.join(repoRoot, relativePath);
  const target = path.join(distRoot, relativePath);
  await mkdir(path.dirname(target), {recursive: true});
  await cp(source, target);
}

async function copyDirectoryAsset(relativePath) {
  const source = path.join(repoRoot, relativePath);
  const target = path.join(distRoot, relativePath);
  await mkdir(path.dirname(target), {recursive: true});
  await cp(source, target, {recursive: true});
}

async function countFiles(directory) {
  let total = 0;
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const entryPath = path.join(directory, entry.name);
    total += entry.isDirectory() ? await countFiles(entryPath) : 1;
  }
  return total;
}

async function check() {
  await Promise.all([...FILE_ASSETS, ...DIRECTORY_ASSETS].map(assertExists));
}

async function prepare() {
  await check();
  await rm(distRoot, {recursive: true, force: true});
  await mkdir(distRoot, {recursive: true});
  for (const file of FILE_ASSETS) {
    await copyFileAsset(file);
  }
  for (const directory of DIRECTORY_ASSETS) {
    await copyDirectoryAsset(directory);
  }
  const fileCount = await countFiles(distRoot);
  console.log(`Prepared ${fileCount} desktop asset files in ${path.relative(repoRoot, distRoot)}`);
}

if (process.argv.includes("--check")) {
  await check();
  console.log("Desktop asset inputs are present");
} else {
  await prepare();
}

if (!existsSync(path.join(distRoot, "index.html")) && !process.argv.includes("--check")) {
  throw new Error("Desktop asset staging did not create index.html");
}
