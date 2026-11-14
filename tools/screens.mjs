// Screenshots of the game's screens in every language, to check that translated text fits.
//   npm run dev   (in another terminal)
//   node tools/screens.mjs [out-dir] [langs]     e.g. node tools/screens.mjs shots de,ja
import { createRequire } from "node:module";
import fs from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");

const out = process.argv[2] ?? "screens";
const langs = (process.argv[3] ?? "en,de,es,fr,zh,ja").split(",");
const base = `http://localhost:${process.env.PORT ?? 8080}/index.html`;
fs.mkdirSync(out, { recursive: true });

// each: [name, query, script run in the page (or null), wait ms]
const SHOTS = [
  ["title", "", null, 1500],
  ["controls", "?hub", "G.scene.overlay = new G.ui.Controls(() => {})", 2500],
  ["options", "?hub", "G.scene.overlay = G.ui.optionsMenu(() => {})", 2500],
  ["altar", "?hub", "G.scene.overlay = new G.ui.ClassAltar(() => {}, () => {})", 2500],
  ["shrine", "?hub", "G.scene.overlay = new G.ui.Shrine(() => {})", 2500],
  ["party", "?hub&coop=3", "G.scene.overlay = new G.ui.PartyMenu(() => {}, () => {})", 2500],
  ["hub", "?hub&coop=2", "G.save.stats.runs = 1", 2500],
  ["boons", "?sandbox", "G.scene.openBoons(null, 0)", 2500],
  ["fight", "?sandbox&coop=2", "G.hud.toast('SECOND CHANCE', 'ONCE PER REALM'); G.run.players[1].goDown()", 2200],
  ["end", "?sandbox", "G.run.lives = 0; G.run.secondChance = false; const p = G.run.players[0]; p.iframe = 0; p.hp = 1; p.hurt(1, {})", 6000],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
for (const lang of langs) {
  for (const [name, q, js, wait] of SHOTS) {
    await page.goto(`${base}${q ? q + "&" : "?"}lang=${lang}`);
    await page.waitForTimeout(1200);
    if (js) await page.evaluate(js);
    await page.waitForTimeout(wait - 1200 > 0 ? wait - 1200 : 300);
    await page.locator("#game").screenshot({ path: `${out}/${name}-${lang}.png` });
  }
  console.log(lang, "done");
}
console.log(errors.join("\n") || "no errors");
await browser.close();
