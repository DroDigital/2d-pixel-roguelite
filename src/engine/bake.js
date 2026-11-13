// Baked loops: a looping effect (a critter, a torch, a spinning coin) played once into a list of sparse frames, then
// stamped wherever it's needed. The same pixels the effect draws live, at a fraction of the cost, mirrorable, tintable
// and fadeable. Also gives each frame's silhouette as a pixelfx actor, so status effects can wrap a critter.

import { createFx, createFrame, clearFrame, fxMod, mix } from "./pfx.js";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const cache = new Map();

/** Bake effect `id` with options at `fps`. Loops bake one period; one-shots bake their whole life. */
export function bake(id, opts = {}, fps = 24) {
  const key = id + "|" + JSON.stringify(opts) + "|" + fps;
  let b = cache.get(key);
  if (b) return b;
  const mod = fxMod(id), meta = mod.meta, [w, h] = meta.size, [ox, oy] = meta.origin;
  const D = meta.duration ?? 1, n = Math.max(1, Math.round(D * fps)), step = D / n;
  const f = createFrame(w, h), fx = createFx(mod, { ...opts, x: ox, y: oy });
  // simulated loops need one period of warm-up so the first frame already has its particles in flight
  if (meta.loop && mod.create) for (let i = 0; i < n; i++) fx.update(step);
  const frames = [];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < n; i++) {
    clearFrame(f);
    fx.draw(f);
    const dx = [], dy = [], c = [], l = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const k = y * w + x, cc = f.color[k], ll = f.light[k] & 0xffffff;
        if (!cc && !ll) continue;
        dx.push(x - ox);
        dy.push(y - oy);
        c.push(cc);
        l.push(ll ? f.light[k] : 0);
        if (cc >>> 24 === 255) {
          if (x - ox < x0) x0 = x - ox;
          if (x - ox > x1) x1 = x - ox;
          if (y - oy < y0) y0 = y - oy;
          if (y - oy > y1) y1 = y - oy;
        }
      }
    frames.push({ n: dx.length, dx: Int16Array.from(dx), dy: Int16Array.from(dy), c: Uint32Array.from(c), l: Uint32Array.from(l), actor: null });
    fx.update(step);
  }
  b = { id, frames, D, fps, n, meta, box: [x0, y0, x1, y1] };
  cache.set(key, b);
  return b;
}

export const frameAt = (b, t) => b.frames[Math.min(b.n - 1, Math.floor((((t % b.D) + b.D) % b.D) * b.fps))];

/**
 * Stamp a baked effect into a frame with its origin at (X, Y). o: { flip, tint (color), tintK (0..1), alpha (dithered),
 * light (multiplier), onlyLight, noLight }.
 */
export function blit(frame, b, X, Y, t, o = {}) {
  const F = typeof t === "number" ? frameAt(b, t) : t;
  const W = frame.w, H = frame.h, C = frame.color, L = frame.light;
  X = Math.round(X) - frame.ox;
  Y = Math.round(Y) - frame.oy;
  const flip = !!o.flip, a = o.alpha ?? 1, tint = o.tint, tk = o.tintK ?? 1, lk = o.noLight ? 0 : o.light ?? 1;
  for (let i = 0; i < F.n; i++) {
    const x = flip ? X - F.dx[i] - 1 : X + F.dx[i], y = Y + F.dy[i];
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const j = y * W + x;
    let c = F.c[i];
    if (c && !o.onlyLight) {
      if (a < 1 && a <= BAYER[((y & 3) << 2) | (x & 3)]) c = 0;
      if (c) {
        const ca = c >>> 24;
        if (tint !== undefined) c = ((ca << 24) | (mix(c, tint, tk) & 0xffffff)) >>> 0;
        if (ca === 255 || !C[j]) C[j] = c;
        else {
          const d = C[j], f = ca / 255, da = (d >>> 24) / 255, oa = f + da * (1 - f), k = f / oa;
          const ch = (s) => (((c >>> s) & 255) * k + ((d >>> s) & 255) * (1 - k)) & 255;
          C[j] = ((((oa * 255) & 255) << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)) >>> 0;
        }
      }
    }
    const l = F.l[i];
    if (l && lk > 0) {
      const d = L[j];
      const r = Math.min(255, (d & 255) + (l & 255) * lk) | 0;
      const g = Math.min(255, ((d >>> 8) & 255) + ((l >>> 8) & 255) * lk) | 0;
      const bb = Math.min(255, ((d >>> 16) & 255) + ((l >>> 16) & 255) * lk) | 0;
      L[j] = (255 << 24) | (bb << 16) | (g << 8) | r;
    }
  }
}

/** A frame's opaque silhouette as a pixelfx actor ({ mask, pixels, x, y, w, h, head, chest }), feet at (0, 0). */
export function frameActor(b, F) {
  if (F.actor) return F.actor;
  let [x0, y0, x1, y1] = [1e9, 1e9, -1e9, -1e9];
  for (let i = 0; i < F.n; i++)
    if (F.c[i] >>> 24 === 255) {
      x0 = Math.min(x0, F.dx[i]); x1 = Math.max(x1, F.dx[i]); y0 = Math.min(y0, F.dy[i]); y1 = Math.max(y1, F.dy[i]);
    }
  if (x0 > x1) [x0, y0, x1, y1] = [-4, -8, 4, -1];
  const w = x1 - x0 + 1, h = y1 - y0 + 1, data = new Uint8Array(w * h), pixels = new Uint32Array(w * h);
  for (let i = 0; i < F.n; i++)
    if (F.c[i] >>> 24 === 255) {
      const k = (F.dy[i] - y0) * w + (F.dx[i] - x0);
      data[k] = 1;
      pixels[k] = F.c[i];
    }
  const cx = Math.round((x0 + x1) / 2);
  F.actor = { mask: { w, h, data }, pixels, x: x0, y: y0, w, h, k: 2, head: [cx, y0], chest: [cx, Math.round((y0 + y1) / 2)] };
  return F.actor;
}

export const bakedCount = () => cache.size;

/** One frame of an effect at time t, baked like a loop (for still props: a barrel before it blows). */
export function still(id, opts = {}, t = 0) {
  const key = "still|" + id + "|" + JSON.stringify(opts) + "|" + t;
  let b = cache.get(key);
  if (b) return b;
  const mod = fxMod(id), meta = mod.meta, [w, h] = meta.size, [ox, oy] = meta.origin;
  const f = createFrame(w, h), fx = createFx(mod, { ...opts, x: ox, y: oy });
  if (t > 0) fx.update(t);
  fx.draw(f);
  const dx = [], dy = [], c = [], l = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (!f.color[k] && !(f.light[k] & 0xffffff)) continue;
      dx.push(x - ox); dy.push(y - oy); c.push(f.color[k]); l.push(f.light[k] & 0xffffff ? f.light[k] : 0);
    }
  b = { id, frames: [{ n: dx.length, dx: Int16Array.from(dx), dy: Int16Array.from(dy), c: Uint32Array.from(c), l: Uint32Array.from(l), actor: null }], D: 1, fps: 1, n: 1, meta, box: [0, 0, 0, 0] };
  cache.set(key, b);
  return b;
}
