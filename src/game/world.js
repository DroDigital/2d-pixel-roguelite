// A room in play: its entities, its effects, decor and weather, and the feel of the fight: hit-stop that freezes
// everything on contact, screen shake, slow motion, and floor telegraphs that warn before something lands.

import { FxManager } from "../engine/fxm.js";
import { createFx, fxMod, painterFor, hex, createFrame, clearFrame } from "../engine/pfx.js";
import { bake, blit } from "../engine/bake.js";
import { G, FLOOR_TOP } from "./ctx.js";

const SHADOW = 0x70000000;

export class World {
  constructor() {
    this.ents = [];
    this.fx = new FxManager();
    this.fx.low = !!G.save?.settings.lowfx;
    this.timers = [];
    this.tele = [];
    this.decor = [];
    this.t = 0;
    this.freeze = 0;
    this.shakeT = 0;
    this.shake0 = 1;
    this.shakeA = 0;
    this.slowT = 0;
    this.slowK = 1;
    this.weather = [];
    this.player = null;
    this.paused = false;
  }
  add(e) {
    e.world = this;
    this.ents.push(e);
    e.onAdd?.(this);
    return e;
  }
  /** Living enemies that can be hit. */
  foes(team = "player") {
    return this.ents.filter((e) => e.hittable && !e.dead && e.team !== team && e.team !== "neutral");
  }
  enemies() {
    return this.ents.filter((e) => e.team === "enemy" && !e.dead && e.counts !== false);
  }
  nearest(x, y, team = "player", maxD = Infinity, filter) {
    let best = null, bd = maxD;
    for (const e of this.foes(team)) {
      if (filter && !filter(e)) continue;
      const d = Math.hypot(e.x - x, (e.y - y) * 1.6);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }
  after(sec, fn) {
    this.timers.push({ t: sec, fn });
  }
  hitstop(s) {
    this.freeze = Math.min(0.25, Math.max(this.freeze, s));
  }
  shake(amp, sec = 0.2) {
    const k = G.save?.settings.shake ?? 1;
    if (k <= 0) return;
    if (amp * k >= this.shakeA * (this.shakeT / this.shake0 || 0)) {
      this.shakeA = amp * k;
      this.shakeT = this.shake0 = sec;
    }
  }
  slowmo(k, sec) {
    this.slowK = k;
    this.slowT = sec;
  }
  /** Play an effect in the world (see FxManager.spawn). */
  spawnFx(id, x, y, opts, s) {
    return this.fx.spawn(id, x, y, opts, s);
  }
  /** A warning on the floor: an ellipse that pulses for `dur` then calls `then`. */
  telegraph(x, y, rx, dur, then, color = "#ff4040") {
    const t = { x, y, rx, ry: Math.max(3, rx * 0.32), dur, t: 0, then, c: hex(color) >>> 0 };
    this.tele.push(t);
    return t;
  }
  /** A looping effect baked and stamped in place (torches, braziers, waterfalls). */
  addDecor(id, x, y, opts = {}, s = {}) {
    const d = { b: bake(id, opts, s.fps ?? 20), x, y, depth: s.depth ?? y, flip: !!s.flip, off: Math.random() * 10, light: s.light ?? 1, solid: s.solid ?? 0, wall: s.wall ?? false, alpha: s.alpha ?? 1 };
    this.decor.push(d);
    return d;
  }
  addWeather(id, opts = {}) {
    if (G.save?.settings.lowfx) return;
    this.weather.push(createFx(fxMod(id), { ...opts, x: 160, y: 170 }));
  }
  update(dt) {
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.freeze > 0) {
      this.freeze -= dt;
      return;
    }
    if (this.slowT > 0) {
      this.slowT -= dt;
      dt *= this.slowK;
    }
    this.t += dt;
    for (let i = 0; i < this.timers.length; i++) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i--, 1);
        tm.fn();
      }
    }
    for (let i = 0; i < this.tele.length; i++) {
      const t = this.tele[i];
      t.t += dt;
      if (t.t >= t.dur) {
        this.tele.splice(i--, 1);
        t.then?.();
      }
    }
    const list = this.ents.slice();
    for (const e of list) if (!e.gone) e.update(dt);
    this.separate();
    this.fx.update(dt);
    for (const w of this.weather) w.update(dt);
    if (this.ents.some((e) => e.gone)) this.ents = this.ents.filter((e) => !e.gone);
  }
  /** Bodies on the floor push gently apart so crowds don't stack into one pixel. */
  separate() {
    const L = this.ents.filter((e) => e.solid && !e.dead);
    for (let i = 0; i < L.length; i++)
      for (let j = i + 1; j < L.length; j++) {
        const a = L[i], b = L[j], dx = b.x - a.x, dy = (b.y - a.y) * 1.8, r = (a.r + b.r) * 0.8, d = Math.hypot(dx, dy);
        if (d >= r || d < 0.001) continue;
        const push = (r - d) * 0.25, nx = dx / d, ny = dy / d / 1.8;
        const wa = a.heavy ? 0.1 : b.heavy ? 0.9 : a.isPlayer ? 0.3 : b.isPlayer ? 0.7 : 0.5;
        a.x -= nx * push * 2 * (1 - wa);
        a.y -= ny * push * 2 * (1 - wa);
        b.x += nx * push * 2 * wa;
        b.y += ny * push * 2 * wa;
        a.clampPos?.();
        b.clampPos?.();
      }
    // solid decor
    for (const d of this.decor) {
      if (!d.solid) continue;
      for (const e of this.ents) {
        if (!e.solid || e.dead || e.z > 10) continue;
        const dx = e.x - d.x, dy = (e.y - d.y) * 2.2, dd = Math.hypot(dx, dy), r = d.solid + e.r * 0.6;
        if (dd < r && dd > 0.001) {
          e.x = d.x + (dx / dd) * r;
          e.y = d.y + (dy / dd / 2.2) * r;
        }
      }
    }
  }
  get shakeXY() {
    if (this.shakeT <= 0) return [0, 0];
    const k = this.shakeA * (this.shakeT / this.shake0), f = Math.floor(G.time * 60);
    return [Math.round(Math.sin(f * 2.4) * k), Math.round(Math.cos(f * 3.7) * k * 0.7)];
  }
  draw(frame) {
    const T = this.t;
    // the wall's decor, the weather's far half, then what lies on the floor
    for (const d of this.decor) if (d.wall) blit(frame, d.b, d.x, d.y, T + d.off, { flip: d.flip, light: d.light, alpha: d.alpha });
    this.drawWeather(frame, "back");
    this.fx.drawLayer(frame, "floor");
    this.drawTele(frame);
    this.drawShadows(frame);
    const L = [];
    for (const e of this.ents) if (!e.hidden) L.push({ d: e.y + (e.dz ?? 0), f: () => e.draw(frame) });
    for (const d of this.decor) if (!d.wall) L.push({ d: d.depth, f: () => blit(frame, d.b, d.x, d.y, T + d.off, { flip: d.flip, light: d.light, alpha: d.alpha }) });
    this.fx.collect(L, frame, "world");
    L.sort((a, b) => a.d - b.d);
    for (const it of L) it.f();
    this.drawWeather(frame, "front");
    this.fx.drawLayer(frame, "over");
  }
  /** Weather is slow and costly: render it at 30 Hz into its own layers and lay those over the frame. */
  drawWeather(frame, layer) {
    if (!this.weather.length) return;
    if (!this.wc) this.wc = { back: createFrame(frame.w, frame.h), front: createFrame(frame.w, frame.h), n: -1 };
    const c = this.wc, tick = Math.floor(G.time * 30);
    if (layer === "back" && tick !== c.n) {
      c.n = tick;
      clearFrame(c.back);
      clearFrame(c.front);
      for (const w of this.weather) {
        w.draw(c.back, "back");
        w.draw(c.front, "front");
      }
    }
    const src = c[layer], S = src.color, SL = src.light, D = frame.color, DL = frame.light, n = frame.w * frame.h;
    for (let i = 0; i < n; i++) {
      const s = S[i];
      if (s) {
        const a = s >>> 24;
        if (a === 255 || !D[i]) D[i] = s;
        else {
          const d = D[i], f = a / 255, da = (d >>> 24) / 255, oa = f + da * (1 - f), k = f / oa;
          D[i] = ((((oa * 255) & 255) << 24) | ((((s >>> 16) & 255) * k + ((d >>> 16) & 255) * (1 - k)) << 16) | ((((s >>> 8) & 255) * k + ((d >>> 8) & 255) * (1 - k)) << 8) | ((s & 255) * k + (d & 255) * (1 - k))) >>> 0;
        }
      }
      const l = SL[i];
      if (l & 0xffffff) {
        const d = DL[i];
        DL[i] = (255 << 24) | (Math.min(255, ((d >>> 16) & 255) + ((l >>> 16) & 255)) << 16) | (Math.min(255, ((d >>> 8) & 255) + ((l >>> 8) & 255)) << 8) | Math.min(255, (d & 255) + (l & 255));
      }
    }
  }
  drawShadows(frame) {
    const C = frame.color, W = frame.w;
    for (const e of this.ents) {
      if (!e.shadow || e.hidden) continue;
      const k = Math.max(0.4, 1 - (e.z ?? 0) / 90), rx = Math.round(e.shadow * k), ry = Math.max(1, Math.round(rx * 0.3));
      const cx = Math.round(e.x), cy = Math.round(e.y);
      for (let y = -ry; y <= ry; y++)
        for (let x = -rx; x <= rx; x++) {
          if ((x * x) / (rx * rx) + (y * y) / (ry * ry) > 1) continue;
          const px = cx + x, py = cy + y;
          if (px < 0 || py < FLOOR_TOP - 6 || px >= W || py >= frame.h) continue;
          const j = py * W + px;
          if (!C[j]) C[j] = SHADOW;
        }
    }
  }
  drawTele(frame) {
    if (!this.tele.length) return;
    const p = painterFor(frame);
    for (const t of this.tele) {
      const u = t.t / t.dur, blink = Math.floor(t.t * (8 + u * 16)) & 1, a = 0.25 + 0.5 * u;
      const rx = t.rx * (0.55 + 0.45 * Math.min(1, u * 2.5)), ry = t.ry * (0.55 + 0.45 * Math.min(1, u * 2.5));
      for (let i = 0; i < 64; i++) {
        const ang = (i / 64) * Math.PI * 2, x = t.x + Math.cos(ang) * rx, y = t.y + Math.sin(ang) * ry;
        p.dot(x, y, t.c, blink ? 1 : 0.6);
        p.light(x, y, t.c, 0.35 + 0.4 * u);
      }
      // the inner fill fills up as it nears
      const fr = u;
      for (let yy = -ry; yy <= ry; yy++)
        for (let xx = -rx; xx <= rx; xx++)
          if ((xx * xx) / (rx * rx) + (yy * yy) / (ry * ry) < fr * fr) p.dot(t.x + xx, t.y + yy, t.c, a * 0.45);
    }
  }
}

/** Paint a pixelfx actor's own pixels (a snapshot of a body) with its feet at (X, Y). */
export function drawActorPixels(frame, a, X, Y, flip, alpha = 1, tint, tintK = 0) {
  const W = frame.w, H = frame.h, C = frame.color, m = a.mask;
  X = Math.round(X);
  Y = Math.round(Y);
  for (let my = 0; my < m.h; my++)
    for (let mx = 0; mx < m.w; mx++) {
      const k = my * m.w + mx;
      if (!m.data[k]) continue;
      const lx = a.x + mx, x = flip ? X - lx - 1 : X + lx, y = Y + a.y + my;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (alpha < 1 && alpha <= BAYER[((y & 3) << 2) | (x & 3)]) continue;
      let c = a.pixels[k];
      if (tint !== undefined && tintK > 0) c = mixTo(c, tint, tintK);
      C[y * W + x] = c;
    }
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
function mixTo(a, b, t) {
  const r = (a & 255) + ((b & 255) - (a & 255)) * t, g = ((a >>> 8) & 255) + (((b >>> 8) & 255) - ((a >>> 8) & 255)) * t;
  const bl = ((a >>> 16) & 255) + (((b >>> 16) & 255) - ((a >>> 16) & 255)) * t;
  return ((a & 0xff000000) | ((bl & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
}
