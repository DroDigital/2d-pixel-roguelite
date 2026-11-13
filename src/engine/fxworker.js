// A worker thread that runs pixelfx effects off the main thread. It owns effect instances, steps and draws them when
// asked, and sends back only the pixels each one touched (sparse lists, transferred without copying). It also bakes
// looping effects into frames. Everything an effect needs is its own module and options, so it runs here unchanged.

import { createFx, createFrame, clearFrame } from "../../vendor/pixelfx/core/index.js";
import { effects as FX } from "../../vendor/pixelfx/fx/index.js";

const live = new Map();
const MARGIN = 40;

/** The non-empty pixels of a frame, relative to (ox, oy). */
function pack(f, ox, oy) {
  const C = f.color, L = f.light, n = f.w * f.h;
  let k = 0;
  for (let i = 0; i < n; i++) if (C[i] || L[i] & 0xffffff) k++;
  const dx = new Int16Array(k), dy = new Int16Array(k), c = new Uint32Array(k), l = new Uint32Array(k);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const cc = C[i], ll = L[i] & 0xffffff;
    if (!cc && !ll) continue;
    const x = i % f.w, y = (i / f.w) | 0;
    dx[j] = x - ox;
    dy[j] = y - oy;
    c[j] = cc;
    l[j] = ll ? L[i] : 0;
    j++;
  }
  return { n: k, dx, dy, c, l };
}
const bufs = (p, out) => out.push(p.dx.buffer, p.dy.buffer, p.c.buffer, p.l.buffer);

function spawn(op) {
  const mod = FX[op.id];
  if (!mod) return;
  const meta = mod.meta, [w, h] = meta.size, [mx, my] = meta.origin;
  // full-screen effects (weather, transitions) draw onto the whole screen; others get room to spill
  const full = op.full, m = full ? 0 : MARGIN;
  const fw = full ? 320 : Math.min(640, w + 2 * m), fh = full ? 180 : Math.min(480, h + 2 * m);
  const ox = full ? op.x : mx + m, oy = full ? op.y : my + m;
  const inst = createFx(mod, { ...op.opts, x: ox, y: oy, flip: !!op.flip, angle: op.angle ?? 0 });
  live.set(op.uid, { inst, frame: createFrame(fw, fh), ox, oy, layered: !op.single });
}

function bake(m) {
  const mod = FX[m.id], meta = mod.meta, [w, h] = meta.size, [ox, oy] = meta.origin;
  const D = meta.duration ?? 1, n = Math.max(1, Math.round(D * m.fps)), step = D / n;
  const f = createFrame(w, h), fx = createFx(mod, { ...m.opts, x: ox, y: oy });
  if (meta.loop && mod.create) for (let i = 0; i < n; i++) fx.update(step);
  const frames = [], tr = [];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < n; i++) {
    clearFrame(f);
    fx.draw(f);
    const p = pack(f, ox, oy);
    for (let k = 0; k < p.n; k++)
      if (p.c[k] >>> 24 === 255) {
        if (p.dx[k] < x0) x0 = p.dx[k];
        if (p.dx[k] > x1) x1 = p.dx[k];
        if (p.dy[k] < y0) y0 = p.dy[k];
        if (p.dy[k] > y1) y1 = p.dy[k];
      }
    frames.push(p);
    bufs(p, tr);
    fx.update(step);
  }
  postMessage({ type: "baked", key: m.key, frames, D, fps: m.fps, n, box: [x0, y0, x1, y1] }, tr);
}

onmessage = (ev) => {
  const m = ev.data;
  if (m.type === "bake") return bake(m);
  if (m.type !== "step") return;
  for (const op of m.ops) {
    if (op.k === "spawn") spawn(op);
    else if (op.k === "stop") live.get(op.uid)?.inst.stop();
    else if (op.k === "flip") { const L = live.get(op.uid); if (L) L.inst.options.flip = op.flip; }
    else if (op.k === "kill") live.delete(op.uid);
  }
  const out = [], tr = [];
  for (const [uid, dt] of m.dts) {
    const L = live.get(uid);
    if (!L) continue;
    if (dt > 0) L.inst.update(dt);
    const f = L.frame;
    let back = null, front;
    if (L.layered) {
      clearFrame(f);
      L.inst.draw(f, "back");
      back = pack(f, L.ox, L.oy);
      bufs(back, tr);
      clearFrame(f);
      L.inst.draw(f, "front");
    } else {
      clearFrame(f);
      L.inst.draw(f);
    }
    front = pack(f, L.ox, L.oy);
    bufs(front, tr);
    const done = L.inst.done();
    if (done) live.delete(uid);
    out.push({ uid, back, front, done });
  }
  postMessage({ type: "stepped", seq: m.seq, out }, tr);
};
