// Smoke test in headless Chromium: load a scene, press keys, collect errors, take screenshots.
// node tools/smoke.mjs "<query>" out.png [script json: [[key, holdMs, waitMs], ...]]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // the system Playwright (NODE_PATH)
const [q = "?sandbox", out = "shot.png", scriptJson = "[]"] = process.argv.slice(2);
const url = `http://localhost:${process.env.PORT ?? 8080}/${process.env.PAGE ?? "index.html"}${q}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.stack));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + " " + m.text()); });
await page.goto(url);
await page.waitForTimeout(1500);
for (const [key, hold = 50, wait = 100] of JSON.parse(scriptJson)) {
  if (key === "wait") { await page.waitForTimeout(hold); continue; }
  if (key === "eval") { console.log("eval:", await page.evaluate(hold)); continue; }
  if (key === "shot") { await page.locator("#game").screenshot({ path: hold }); continue; }
  await page.keyboard.down(key);
  await page.waitForTimeout(hold);
  await page.keyboard.up(key);
  await page.waitForTimeout(wait);
}
await page.locator("#game").screenshot({ path: out });
const fps = await page.evaluate(() => window.G && Math.round(window.G.fps));
console.log("fps", fps);
console.log(errors.slice(0, 20).join("\n") || "no errors");
await browser.close();
