// Emberspire for the desktop: a native window around the game, with the GPU and every core put to work.

const { app, BrowserWindow, ipcMain, shell, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

// ---- the machine's power, all of it
app.commandLine.appendSwitch("ignore-gpu-blocklist"); // use the GPU even if Chromium is wary of its driver
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("force_high_performance_gpu"); // the discrete GPU on dual-GPU laptops
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required"); // music can start on the title screen
if (process.argv.includes("--software")) app.disableHardwareAcceleration();

if (!app.requestSingleInstanceLock()) app.quit();

const STATE = path.join(app.getPath("userData"), "window.json");
const readState = () => {
  try {
    return JSON.parse(fs.readFileSync(STATE, "utf8"));
  } catch {
    return {};
  }
};

let win = null;
function create() {
  const st = readState(), area = screen.getPrimaryDisplay().workAreaSize;
  // the largest whole multiple of 320 x 180 that fits, for crisp pixels from the first frame
  const k = Math.max(2, Math.min(Math.floor((area.width * 0.9) / 320), Math.floor((area.height * 0.9) / 180)));
  win = new BrowserWindow({
    width: st.width ?? 320 * k, height: st.height ?? 180 * k, x: st.x, y: st.y,
    minWidth: 640, minHeight: 360, backgroundColor: "#07060b", title: "Emberspire", show: false,
    autoHideMenuBar: true, fullscreen: process.argv.includes("--fullscreen") || (!!st.fullscreen && !process.argv.includes("--windowed")),
    icon: path.join(__dirname, "icons", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, spellcheck: false },
  });
  win.setMenuBarVisibility(false);
  const query = { desktop: "1" };
  for (const a of process.argv) {
    const m = /^--(renderer|workers|bench|seed)=(\w+)$/.exec(a);
    if (m) query[m[1]] = m[2];
  }
  win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { query });
  win.once("ready-to-show", () => win.show());
  // F11 or Alt+Enter: fullscreen
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type === "keyDown" && (input.key === "F11" || (input.key === "Enter" && input.alt))) {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
  });
  // links leave for the browser; nothing navigates the game window away
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  const save = () => {
    if (!win || win.isDestroyed()) return;
    const b = win.getNormalBounds();
    try {
      fs.writeFileSync(STATE, JSON.stringify({ ...b, fullscreen: win.isFullScreen() }));
    } catch {}
  };
  win.on("close", save);
  win.on("closed", () => (win = null));
}

ipcMain.handle("emberspire:fullscreen", () => {
  if (win) win.setFullScreen(!win.isFullScreen());
  return win?.isFullScreen();
});
ipcMain.handle("emberspire:quit", () => app.quit());
ipcMain.handle("emberspire:gpu", async () => {
  const info = await app.getGPUInfo("basic");
  return info?.gpuDevice?.find((d) => d.active)?.deviceString ?? info?.auxAttributes?.glRenderer ?? "unknown";
});

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
app.whenReady().then(create);
app.on("window-all-closed", () => app.quit());
app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && create());
