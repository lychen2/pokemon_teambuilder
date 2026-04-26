import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const AUTO_RUN_PATTERN = /\(function\(\)\s*\{[\s\S]*$/;
const JQUERY_NO_CONFLICT_PATTERN = /var QQ = \$\.noConflict\(\);/;

function buildTranslations(source) {
  const normalizedSource = source
    .replaceAll("NodeFilter.SHOW_Element", "NodeFilter.SHOW_ELEMENT")
    .replace(JQUERY_NO_CONFLICT_PATTERN, "var QQ = null;")
    .replace(AUTO_RUN_PATTERN, "");
  const factory = new Function(`${normalizedSource}\nreturn {translations};`);
  const {translations = {}} = factory();
  return translations;
}

async function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const sourcePath = path.join(rootDir, "PSChina Server Translation SV-1.7.2.user.js");
  const outputPath = path.join(rootDir, "static", "localization-data.json");
  const source = await fs.readFile(sourcePath, "utf8");
  const translations = buildTranslations(source);
  const payload = {
    generatedAt: new Date().toISOString(),
    source: path.basename(sourcePath),
    translations,
  };
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Wrote ${outputPath} with ${Object.keys(translations).length} translations.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
