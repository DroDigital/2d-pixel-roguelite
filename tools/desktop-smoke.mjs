// Launch the desktop app through Playwright's Electron driver (under xvfb-run on a headless Linux box), run the
// benchmark inside it, and report which renderer and how many cores it used.
// xvfb-run -a node tools/desktop-smoke.mjs [seconds] [executable]
import { createRequire } from "node:module";
const { _electron } = createRequire(import.meta.url)("playwright");
const secs = +(process.argv[2] ?? 15), exe = process.argv[3];
// the project's own Electron (its package exports the binary's path) unless a packaged app is given
const electronPath = exe ?? createRequire(new URL("../package.json", import.meta.url))("electron");
const app = await _electron.launch({ executablePath: electronPath, args: [...(exe ? [] : ["."]), `--bench=${secs}`, "--no-sandbox"] });
const page = await app.firstWindow();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.waitForTimeout((secs + 5) * 1000);
const info = await page.evaluate(() => ({ bench: window.BENCH, renderer: G.screen.kind, workers: G.workers?.size, gpu: G.gpuName, desktop: !!window.desktop, platform: window.desktop?.platform }));
console.log(JSON.stringify(info));
await page.screenshot({ path: process.env.SHOT ?? "desktop.png" });
console.log(errors.join("\n") || "no errors");
await app.close();
