import {app, BrowserWindow, dialog, ipcMain, Menu, shell, utilityProcess} from 'electron';
import {join, resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

if (process.env.POKE_DATA) app.setPath('userData', resolve(process.env.POKE_DATA));
// 改名前叫 Poke Teambuilder，队伍与记录存在同一台机器的旧目录里；
// 新目录还没有数据库时继续用旧目录，避免用户以为队伍丢了。
const legacyUserData = join(app.getPath('appData'), 'poke-teambuilder');
if (!process.env.POKE_DATA && !existsSync(join(app.getPath('userData'), 'teambuilder.sqlite')) && existsSync(join(legacyUserData, 'teambuilder.sqlite'))) app.setPath('userData', legacyUserData);
if (process.env.POKE_TEST) app.disableHardwareAcceleration();
let window: BrowserWindow | null = null;
let backend: Electron.UtilityProcess;
let ready: Promise<void>;
let canFlush = false; let closePending = false; let closeApproved = false;
const pending = new Map<string, {resolve: (value: unknown) => void; reject: (error: Error) => void}>();

function startBackend(assets: string): Promise<void> {
  return new Promise((resolveReady, rejectReady) => {
    backend = utilityProcess.fork(join(__dirname, 'service.cjs'), [], {serviceName: '结阵 Sixfold 本地服务', env: {...process.env, POKE_DATA: app.getPath('userData'), POKE_ASSETS: assets, ESBUILD_BINARY_PATH: join(assets, 'runtime', process.platform === 'win32' ? 'esbuild.exe' : 'esbuild')}});
    backend.on('message', message => {
      if (message.type === 'ready') {resolveReady(); return;}
      if (message.type === 'progress') {window?.webContents.send('poke:progress', message.job); return;}
      const call = pending.get(message.id); if (!call) return;
      pending.delete(message.id); if (message.error) call.reject(new Error(message.error)); else call.resolve(message.result);
    });
    backend.on('exit', code => {const error = new Error(`本地服务已退出（${code}），请重启应用并查看本地 errors.log。`); rejectReady(error); for (const call of pending.values()) call.reject(error); pending.clear();});
  });
}

async function openExternal(url: string) {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('仅支持打开网页来源链接。');
  await shell.openExternal(parsed.href);
}

app.whenReady().then(async () => {
  const assets = app.isPackaged ? join(process.resourcesPath, 'assets') : resolve(__dirname, '../assets');
  ready = startBackend(assets);
  ipcMain.handle('poke:call', async (_event, method: string, input: unknown) => {
    await ready;
    return new Promise((resolve, reject) => {const id = randomUUID(); pending.set(id, {resolve, reject}); backend.postMessage({id, method, input});});
  });
  ipcMain.handle('poke:external', (_event, url) => openExternal(url));
  ipcMain.on('poke:close-listener', event => {if (event.sender === window?.webContents) canFlush = true;});
  ipcMain.on('poke:close-ready', (event, result) => {
    if (event.sender !== window?.webContents || !closePending) return;
    closePending = false;
    if (result.error) {void dialog.showMessageBox(window!, {type: 'error', title: '队伍尚未保存', message: '保存失败，窗口已保留', detail: String(result.error), buttons: ['返回队伍']}); return;}
    closeApproved = true; window!.close();
  });
  ipcMain.handle('poke:directory', async () => {const result = await dialog.showOpenDialog(window!, {title: '选择 Showdown 检出目录', properties: ['openDirectory']}); return result.canceled ? null : result.filePaths[0];});
  ipcMain.handle('poke:save-text', async (_event, name: string, text: string) => {
    if (typeof name !== 'string' || typeof text !== 'string') throw new Error('导出内容无效。');
    const result = await dialog.showSaveDialog(window!, {title: '保存文本资料', defaultPath: name.replace(/[\\/]/g, '_'), filters: [{name: 'Showdown 文本', extensions: ['txt']}]});
    if (result.canceled || !result.filePath) return false;
    await writeFile(result.filePath, text, 'utf8'); return true;
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label: '文件', submenu: [{role: 'quit', label: '退出'}]}, {label: '编辑', submenu: [{role: 'undo', label: '撤销'}, {role: 'redo', label: '重做'}, {type: 'separator'}, {role: 'cut', label: '剪切'}, {role: 'copy', label: '复制'}, {role: 'paste', label: '粘贴'}, {role: 'selectAll', label: '全选'}]}, {label: '视图', submenu: [{role: 'resetZoom', label: '实际大小'}, {role: 'zoomIn', label: '放大'}, {role: 'zoomOut', label: '缩小'}, {role: 'togglefullscreen', label: '全屏'}]}]));
  window = new BrowserWindow({width: 1480, height: 940, minWidth: 760, minHeight: 600, title: '结阵 Sixfold', icon: join(assets, 'app-icon.png'), backgroundColor: '#f6f7fb', autoHideMenuBar: true, webPreferences: {preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true}});
  window.webContents.setWindowOpenHandler(({url}) => {void openExternal(url); return {action: 'deny'};});
  window.webContents.on('will-navigate', (event, url) => {if (url !== window?.webContents.getURL()) event.preventDefault();});
  window.on('close', event => {
    if (closeApproved || !canFlush) return;
    event.preventDefault();
    if (!closePending) {closePending = true; window!.webContents.send('poke:before-close');}
  });
  if (process.env.POKE_DEV_URL) await window.loadURL(process.env.POKE_DEV_URL); else await window.loadFile(join(__dirname, 'renderer/index.html'));
  window.on('closed', () => {window = null;});
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => backend?.kill());
