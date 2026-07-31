const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// 判断是否为开发模式
const isDev = !app.isPackaged;

/**
 * 数据文件所在目录（Electron 打包环境下 file:// 无法 fetch 本地 JSON，需主进程读盘后走 IPC 回传）
 * - 开发模式：项目根 public/（与 vite dev server 中间件 serve 的文件一致）
 * - 打包模式：app.asar 内的 dist/（vite 把 public/* 原样拷进 dist/，electron-builder 的 files 含 dist/**）
 */
function dataDir() {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), 'dist');
  }
  return path.join(__dirname, '..', 'public');
}

/**
 * 渲染进程请求读取本地数据文件（仅限白名单内的相对路径，防目录穿越）
 * 返回 JSON 字符串；文件不存在/读取失败返回 null（交给渲染进程回退逻辑）
 */
ipcMain.handle('read-data-file', (_event, relPath) => {
  if (typeof relPath !== 'string') return null;
  // 只允许白名单文件名，且去除任何 ../ 目录穿越，杜绝读取任意文件
  const allowed = ['extension-data.json', 'extension-delta.json', 'job-categories.json', 'factor-categories.json'];
  const name = relPath.replace(/^\/+/, '').replace(/\\/g, '/').split('/').pop();
  if (!allowed.includes(name)) return null;
  const file = path.join(dataDir(), name);
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Boss 投递分析',
    icon: path.join(__dirname, '../public/icon.ico'),
    backgroundColor: '#020617',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // 预加载脚本：桥接渲染进程读取本地数据文件（不开启 nodeIntegration，安全隔离）
      preload: path.join(__dirname, 'preload.cjs'),
    },
    // 隐藏默认菜单栏（可选）
    autoHideMenuBar: true,
  });

  // 移除默认菜单
  Menu.setApplicationMenu(null);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // 开发模式下打开 DevTools
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    // 窗口关闭
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});