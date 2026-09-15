// esbuild 原生二进制的跨平台定位。
// 非 Windows：postinstall 会把平台二进制硬链到 esbuild/bin/esbuild。
// Windows：esbuild/bin/esbuild 只是 JS 转发脚本，真正的可执行文件在 @esbuild/win32-<arch>/esbuild.exe。
import {createRequire} from 'node:module';
import {dirname, resolve} from 'node:path';

const windowsArch = {arm64: 'arm64', ia32: 'ia32', x64: 'x64'};

export function esbuildPlatformPackage() {
  if (process.platform === 'win32') {
    const arch = windowsArch[process.arch];
    if (!arch) throw new Error(`esbuild 未提供 Windows ${process.arch} 的原生二进制。`);
    return `@esbuild/win32-${arch}`;
  }
  if (process.platform === 'darwin') return `@esbuild/darwin-${process.arch}`;
  if (process.platform === 'linux') return `@esbuild/linux-${process.arch}`;
  throw new Error(`esbuild 未提供 ${process.platform} 的原生二进制。`);
}

/** 返回要复制到 assets/runtime 的源文件，以及在打包产物中使用的文件名。 */
export function esbuildBinary() {
  const require = createRequire(import.meta.url);
  // require.resolve 指向 esbuild/lib/main.js，上一级是 esbuild 包根目录。
  const packageRoot = resolve(dirname(require.resolve('esbuild')), '..');
  if (process.platform !== 'win32') return {source: resolve(packageRoot, 'bin', 'esbuild'), name: 'esbuild'};
  // pnpm 把平台包放在 esbuild 包的兄弟目录下：node_modules/@esbuild/win32-x64/esbuild.exe
  const platformPackage = esbuildPlatformPackage().split('/')[1];
  return {source: resolve(packageRoot, '..', '@esbuild', platformPackage, 'esbuild.exe'), name: 'esbuild.exe'};
}

/** 打包产物里 esbuild 可执行文件的文件名，主进程与同步工具共用同一规则。 */
export function runtimeBinaryName() {
  return process.platform === 'win32' ? 'esbuild.exe' : 'esbuild';
}
