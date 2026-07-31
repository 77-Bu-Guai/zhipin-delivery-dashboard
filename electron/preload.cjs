// Electron 预加载脚本（contextIsolation 隔离环境下唯一能桥接渲染进程与 Node 的通道）
// 仅暴露「读本地数据文件」这一最小能力，不开启 nodeIntegration，不泄露 fs/path 等原始模块。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 渲染进程调用：await window.electronAPI.readDataFile('extension-data.json')
  // 主进程从磁盘读取并返回 JSON 字符串（file:// 协议下 fetch 被 Chrome CORS 拦截，故必须走 IPC）
  readDataFile: (relPath) => ipcRenderer.invoke('read-data-file', relPath),
});
