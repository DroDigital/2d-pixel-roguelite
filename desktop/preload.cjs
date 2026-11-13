// The little the game may ask of the desktop: fullscreen, quitting, which GPU it's on.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  arch: process.arch,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
  toggleFullscreen: () => ipcRenderer.invoke("emberspire:fullscreen"),
  quit: () => ipcRenderer.invoke("emberspire:quit"),
  gpu: () => ipcRenderer.invoke("emberspire:gpu"),
});
