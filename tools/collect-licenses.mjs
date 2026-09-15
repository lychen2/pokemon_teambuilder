import {execFileSync} from 'node:child_process';
import {readFile, readdir, mkdir, writeFile, copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {esbuildPlatformPackage} from './esbuild-runtime.mjs';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const groups = JSON.parse(execFileSync(pnpm, ['licenses', 'list', '--prod', '--json'], {encoding: 'utf8', shell: process.platform === 'win32'}));
const platformEsbuild = esbuildPlatformPackage();
const packages = Object.values(groups).flat();
const supplemental = JSON.parse(await readFile(new URL('./license-sources.json', import.meta.url), 'utf8'));
const directory = 'assets/licenses';
await mkdir(directory, {recursive: true});
const sections = []; const manifest = [];
for (const dependency of packages) {
  for (const path of dependency.paths) {
    const metadata = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
    let licenseDirectory = path;
    let provenance = 'License files from the installed npm package.';
    if (dependency.name === platformEsbuild) {
      licenseDirectory = packages.find(row => row.name === 'esbuild').paths[0];
      provenance = 'Platform binary distributed by esbuild; license from the matching esbuild package.';
    }
    const filenames = (await readdir(licenseDirectory)).filter(name => /^(licen[sc]e|copying|notice)/i.test(name));
    const addition = supplemental.find(row => row.name === dependency.name);
    if (!filenames.length && !addition) throw new Error(`Missing license text: ${dependency.name}@${metadata.version}`);
    const texts = await Promise.all(filenames.map(name => readFile(join(licenseDirectory, name), 'utf8')));
    if (addition) {texts.push(addition.text); provenance = `${addition.note}\n${addition.source}`;}
    const record = {name: dependency.name, version: metadata.version, license: dependency.license, homepage: dependency.homepage ?? '', provenance};
    manifest.push(record);
    sections.push(`${dependency.name}@${metadata.version}\nDeclared license: ${dependency.license}\n${provenance}\n\n${texts.join('\n\n')}`);
  }
}
await writeFile(join(directory, 'NODE-DEPENDENCIES.txt'), sections.join('\n\n' + '='.repeat(72) + '\n\n'));
await writeFile(join(directory, 'components.json'), JSON.stringify(manifest, null, 2));
await copyFile('THIRD_PARTY_NOTICES.md', join(directory, 'THIRD_PARTY_NOTICES.md'));
console.log(`已收集 ${manifest.length} 份依赖许可及来源说明。`);
