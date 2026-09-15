// 为发布产物生成 SHA256SUMS。
// 用 Node 实现，避免在 CI 里区分 sha256sum 与 Windows 的 Get-FileHash。
import {createHash} from 'node:crypto';
import {readdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const directory = process.argv[2];
if (!directory) throw new Error('用法：node tools/checksums.mjs <发布目录>');
const installers = /\.(AppImage|tar\.gz|zip|exe)$/;
const names = (await readdir(directory)).filter(name => installers.test(name)).sort();
if (!names.length) throw new Error(`${directory} 下没有找到安装包。`);
const lines = [];
for (const name of names) {
  const digest = createHash('sha256').update(await readFile(join(directory, name))).digest('hex');
  lines.push(`${digest}  ${name}`);
}
await writeFile(join(directory, 'SHA256SUMS'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
