// A repeatable stress test: ?bench. A seeded fight in a crowded, rain-and-fog crypt with ultimates and explosions
// going off, measuring how long the main thread spends on each frame. Results land in window.BENCH and on screen.

import { G, FLOOR_TOP } from "./ctx.js";
import { makeEnemy } from "./enemies.js";
import { text, C, panel } from "./ui.js";

export function seedRandom(seed = 1234567) {
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KINDS = ["skeleton", "skull", "slime", "bat", "cultist", "ghost", "graveknight", "skeleton", "eye", "wisp", "frog", "gunner"];

export class Bench {
  constructor(GameScene, secs = 20) {
    this.inner = new GameScene("knight", { biome: 0 });
    this.secs = secs;
    this.warm = 3;
    this.t = 0;
    this.samples = [];
    this.done = false;
  }
  enter() {
    this.inner.enter();
    G.scene = this;
    const w = G.world;
    w.weather.length = 0;
    w.addWeather("weather/fog", {});
    w.addWeather("weather/rain", {});
    G.run.godMode = true;
    this.refill();
  }
  refill() {
    const w = G.world;
    while (w.enemies().length < 12) {
      const k = KINDS[w.enemies().length % KINDS.length];
      const e = makeEnemy(k, 40 + Math.random() * 240, FLOOR_TOP + 8 + Math.random() * 46, 3);
      e.spawnT = 0;
      e.hittable = true;
      e.alpha = undefined;
      w.add(e);
    }
  }
  /** Called by the main loop with the CPU time of one whole frame. */
  sample(ms) {
    this.wall ??= performance.now();
    const el = (performance.now() - this.wall) / 1000;
    if (el > this.warm && !this.done) this.samples.push(ms);
    if (!this.done && el > this.warm + this.secs) this.finish();
  }
  update(dt) {
    this.t += dt;
    const I = G.input, w = G.world, p = w.player;
    if (!this.done) {
      I.stamp.attack = I.time + 0.02;
      if (Math.floor(this.t * 2) % 7 === 0) I.stamp.special = I.time + 0.02;
      if (Math.floor(this.t * 10) % 37 === 0) {
        G.run.ult = 100;
        I.stamp.ult = I.time + 0.02;
      }
      if (Math.floor(this.t * 10) % 23 === 0 && w.fx.list.length < 50) w.spawnFx("explosions/big-explosion", 60 + Math.random() * 200, FLOOR_TOP + 20 + Math.random() * 30, {}, { prio: 2 });
      p.x += Math.sin(this.t * 0.7) * 1.2;
      for (const e of w.enemies()) if (e.hp < e.maxhp * 0.3) e.hp = e.maxhp;
      this.refill();
    }
    this.inner.update(dt);
  }
  finish() {
    this.done = true;
    const a = this.samples.slice().sort((x, y) => x - y), n = a.length, q = (k) => a[Math.min(n - 1, Math.floor(n * k))];
    const avg = a.reduce((s, v) => s + v, 0) / n;
    window.BENCH = { frames: n, avg: +avg.toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +a[n - 1].toFixed(2), renderer: G.screen.kind, workers: G.workers?.size ?? 0 };
    console.log("BENCH", JSON.stringify(window.BENCH));
  }
  draw() {
    this.inner.draw();
    if (this.done) {
      const B = window.BENCH;
      panel(80, 50, 160, 70, { a: 0.95 });
      text("BENCHMARK", 160, 56, C.gold, { align: "center", font: "big" });
      [["AVG CPU MS", B.avg], ["P95", B.p95], ["P99", B.p99], ["RENDERER", B.renderer], ["WORKERS", B.workers]].forEach(([k, v], i) => {
        text(k, 92, 70 + i * 9, C.dim);
        text(String(v), 228, 70 + i * 9, C.white, { align: "right" });
      });
    } else text(`BENCH ${Math.max(0, Math.ceil(this.warm + this.secs - (performance.now() - (this.wall ?? performance.now())) / 1000))}`, 160, 24, C.white, { align: "center" });
  }
}
