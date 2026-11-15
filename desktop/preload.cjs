// The little the game may ask of the desktop: fullscreen, quitting, which GPU it's on.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  arch: process.arch,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
  toggleFullscreen: () => ipcRenderer.invoke("emberlite:fullscreen"),
  quit: () => ipcRenderer.invoke("emberlite:quit"),
  gpu: () => ipcRenderer.invoke("emberlite:gpu"),
});
