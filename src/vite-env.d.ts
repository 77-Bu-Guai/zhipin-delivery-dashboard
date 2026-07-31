/// <reference types="vite/client" />

// Electron 预加载脚本通过 contextBridge 暴露的最小 API（详见 electron/preload.cjs）
interface ElectronAPI {
  readDataFile: (relPath: string) => Promise<unknown>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

