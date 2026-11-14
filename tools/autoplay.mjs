// A bot that climbs: kills what's in the room, takes rewards and boons, walks through doors, and screenshots as it goes.
// node tools/autoplay.mjs <class> <seconds> <outdir> [biome]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [cls = "knight", secs = "60", out = "auto", biome = "0", fair = ""] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.stack));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`http://localhost:${process.env.PORT ?? 8080}/index.html?sandbox&debug&class=${cls}&biome=${biome}${process.env.COOP ? `&coop=${process.env.COOP}` : ""}`);
await page.waitForTimeout(1200);
await page.evaluate((fair) => {
  window.FAIR = !!fair;
  const D = G.director, u = D.update.bind(D), d = D.draw.bind(D);
  window.PF = { u: [], d: [] };
  D.update = (dt) => { const t = performance.now(); u(dt); PF.u.push(performance.now() - t); };
  D.draw = () => { const t = performance.now(); d(); PF.d.push(performance.now() - t); };
  if (!fair) G.run.godMode = true;
  window.G.run.size;
  window.botLog = [];
  setInterval(() => {
    const s = G.scene, w = G.world, p = w?.player, I0 = G.input;
    if (!s || !w || !p) return;
    if (s.overlay) { I0.stamp.confirm = I0.time + 0.02; return; }
    // the other party members fight the nearest foe on their own devices
    for (const q of w.players.slice(1)) {
      const C = q.ctrl, e = w.nearest(q.x, q.y, "player", 400);
      if (q.down || !e) continue;
      if (Math.abs(e.x - q.x) > 24) q.x += Math.sign(e.x - q.x) * 3;
      q.y += Math.sign(e.y - q.y) * Math.min(2, Math.abs(e.y - q.y));
      q.facing = Math.sign(e.x - q.x) || 1;
      const r = Math.random();
      C.stamp[r < 0.65 ? "attack" : r < 0.8 ? "special" : r < 0.9 ? "dash" : "ult"] = C.time + 0.02;
    }
    const I = p.ctrl;
    const foes = w.enemies().filter((e) => e.hittable);
    // fight properly a little, then cull
    if (foes.length) {
      const e = foes[0];
      if (Math.random() < 0.5) { p.x += Math.sign(e.x - p.x) * Math.min(4, Math.abs(e.x - p.x)); p.y += Math.sign(e.y - p.y) * Math.min(2, Math.abs(e.y - p.y)); p.facing = Math.sign(e.x - p.x) || 1; }
      const r = Math.random();
      I.stamp[r < 0.6 ? "attack" : r < 0.75 ? "special" : r < 0.85 ? "dash" : "ult"] = I.time + 0.02;
      if (!window.FAIR && Math.random() < 0.08) G.dbg.damage(e, e.boss ? 120 : 60, { src: p, fromPlayer: true, elem: ["fire", "ice", "shock", "shadow", "holy", "poison", "phys"][Math.floor(Math.random() * 7)] });
      return;
    }
    const pick = w.ents.find((e) => e.onTake && e.magnet === 0);
    if (pick) { p.x = pick.x; p.y = pick.y; return; }
    const it = p.interactable;
    if (it && !it.used && (it.price === undefined || G.run.coins >= it.price)) { I.stamp.interact = I.time + 0.02; return; }
    const its = G.room?.interactables?.filter((i) => !i.used) ?? [];
    if (its.length && !G.room.cleared && !["combat", "shop", "boss", "elite"].includes(G.room.type)) { p.x = its[0].x; p.y = its[0].y; return; }
    const door = w.ents.find((e) => e.spec && e.open >= 1);
    if (door) { p.x = door.x; p.y = door.y; window.botLog.push((G.run.biome) + ":" + G.run.room + ":" + door.spec.type); }
  }, 100);
}, fair);
const n = +secs;
for (let t = 0; t < n; t += 5) {
  await page.waitForTimeout(5000);
  await page.locator("#game").screenshot({ path: `${out}/t${String(t).padStart(4, "0")}.png` });
  const st = await page.evaluate(() => ({ fps: Math.round(G.fps), biome: G.run?.biome, room: G.run?.room, type: G.room?.type, fx: G.world?.fx.list.length, ents: G.world?.ents.length, boons: G.run?.boons.length, coins: G.run?.coins, hp: G.run?.players?.map((q) => (q.down ? "D" : q.hp)).join("/"), kills: G.run?.kills, over: !!G.run?.over, ...(() => { const r = { um: Math.max(...PF.u).toFixed(0), ua: (PF.u.reduce((a, b) => a + b, 0) / PF.u.length).toFixed(1), dm: Math.max(...PF.d).toFixed(0), da: (PF.d.reduce((a, b) => a + b, 0) / PF.d.length).toFixed(1), n: PF.d.length }; PF.u = []; PF.d = []; return r; })() }));
  console.log(t, JSON.stringify(st));
}
console.log((await page.evaluate(() => window.botLog)).filter((v, i, a) => a.indexOf(v) === i).join(" "));
console.log(errors.slice(0, 15).join("\n") || "no errors");
await browser.close();
