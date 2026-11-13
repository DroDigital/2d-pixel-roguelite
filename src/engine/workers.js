// The worker pool: one thread per spare CPU core, each running heavy pixelfx effects (explosions, weather, big
// spells, screen transitions) and baking looping effects, so the main thread only stamps finished pixels.
//
// A remote effect looks like a local createFx instance (update, draw, stop, done, options, t, meta) so the rest of
// the game doesn't care where it runs. Steps are pipelined: the main thread posts each worker the time that passed for
// its effects and draws the latest pixels that came back; a busy worker just gets a bigger step next time, so a heavy
// moment slows an effect's frame rate, never the game's.

import { fxMod } from "./pfx.js";
import { blit, insertBaked, bakeKey } from "./bake.js";

const FADE = 0.3;
let UID = 1;

class RemoteFx {
  constructor(pool, wk, id, mod, opts, full) {
    this.pool = pool;
    this.wk = wk;
    this.uid = UID++;
    this.id = id;
    this.mod = mod;
    this.meta = mod.meta;
    this.options = { ...opts };
    this.t = 0;
    this.pend = 0;
    this.stopAt = Infinity;
    this.res = null;
    this.remoteDone = false;
    this.sentFlip = !!opts.flip;
    this.touched = pool.frame;
    this.remote = true;
    const clean = { ...opts };
    delete clean.x;
    delete clean.y;
    delete clean.flip;
    delete clean.angle;
    wk.ops.push({ k: "spawn", uid: this.uid, id, opts: clean, flip: !!opts.flip, angle: opts.angle ?? 0, full, x: opts.x, y: opts.y });
    wk.uids.add(this.uid);
    pool.live.set(this.uid, this);
  }
  update(dt) {
    this.t += dt;
    this.pend += dt;
    this.touched = this.pool.frame;
    const f = !!this.options.flip;
    if (f !== this.sentFlip) {
      this.sentFlip = f;
      this.wk.ops.push({ k: "flip", uid: this.uid, flip: f });
    }
  }
  draw(frame, layer) {
    this.touched = this.pool.frame;
    const r = this.res;
    if (!r) return;
    const X = Math.round(this.options.x ?? 0), Y = Math.round(this.options.y ?? 0);
    if (layer !== "front" && r.back) blit(frame, null, X, Y, r.back);
    if (layer !== "back") blit(frame, null, X, Y, r.front);
  }
  stop() {
    if (this.stopAt !== Infinity) return;
    this.stopAt = this.t;
    this.wk.ops.push({ k: "stop", uid: this.uid });
  }
  done() {
    return this.remoteDone || this.t - this.stopAt >= FADE || (!this.meta.loop && this.t >= (this.meta.duration ?? 1));
  }
  kill() {
    this.pool.live.delete(this.uid);
    this.wk.uids.delete(this.uid);
    this.wk.ops.push({ k: "kill", uid: this.uid });
  }
}

/** The running pool, if any (set by startPool's caller). */
export const pools = { current: null };

export class FxPool {
  constructor(n, make) {
    this.live = new Map();
    this.frame = 0;
    this.waiting = new Map();
    this.workers = Array.from({ length: n }, (_, i) => {
      const w = make();
      const wk = { w, i, busy: false, ops: [], uids: new Set(), seq: 0, bakes: 0 };
      w.onmessage = (ev) => this.receive(wk, ev.data);
      w.onerror = (e) => console.error("fx worker", e.message ?? e);
      return wk;
    });
    this.size = n;
  }
  /** Is this effect worth sending away? Big, long or full-screen ones are; quick small sparks stay local. */
  worthy(mod, opts) {
    if (opts.actor) return false;
    const [w, h] = mod.meta.size;
    return w * h >= 20000 || (mod.meta.duration ?? 1) >= 2;
  }
  spawn(id, opts, full = false) {
    const mod = fxMod(id);
    let best = this.workers[0];
    for (const wk of this.workers) if (wk.uids.size + wk.bakes * 4 < best.uids.size + best.bakes * 4) best = wk;
    return new RemoteFx(this, best, id, mod, opts, full);
  }
  /** Once a frame: send each idle worker its effects' elapsed time and any spawns, stops and kills. */
  flush() {
    this.frame++;
    if (this.frame % 60 === 0)
      for (const rf of this.live.values()) if (this.frame - rf.touched > 120 || (rf.done() && this.frame - rf.touched > 2)) rf.kill();
    for (const wk of this.workers) {
      if (wk.busy) continue;
      const dts = [];
      for (const uid of wk.uids) {
        const rf = this.live.get(uid);
        if (!rf) continue;
        if (rf.pend > 0 || !rf.res) {
          dts.push([uid, rf.pend]);
          rf.pend = 0;
        }
      }
      if (!dts.length && !wk.ops.length) continue;
      wk.busy = true;
      wk.w.postMessage({ type: "step", seq: ++wk.seq, ops: wk.ops, dts });
      wk.ops = [];
    }
  }
  receive(wk, m) {
    if (m.type === "baked") {
      wk.bakes--;
      const mod = this.waiting.get(m.key);
      this.waiting.delete(m.key);
      if (mod) insertBaked(m.key, { ...m, meta: mod.meta, id: mod.id, frames: m.frames.map((f) => ({ ...f, actor: null })) });
      return;
    }
    wk.busy = false;
    for (const o of m.out) {
      const rf = this.live.get(o.uid);
      if (!rf) continue;
      rf.res = { back: o.back, front: o.front };
      if (o.done) {
        rf.remoteDone = true;
        this.live.delete(o.uid);
        wk.uids.delete(o.uid);
      }
    }
  }
  /** Bake looping effects in the background; bake() finds them in the cache when they're done. */
  prebake(list) {
    for (const [id, opts = {}, fps = 24] of list) {
      const key = bakeKey(id, opts, fps);
      if (this.waiting.has(key) || insertBaked.has(key)) continue;
      let best = this.workers[0];
      for (const wk of this.workers) if (wk.bakes < best.bakes) best = wk;
      best.bakes++;
      this.waiting.set(key, { meta: fxMod(id).meta, id });
      best.w.postMessage({ type: "bake", key, id, opts, fps });
    }
  }
}

/** Start the pool if this machine has the cores and the browser has workers. */
export function startPool() {
  if (typeof Worker === "undefined") return null;
  const cores = navigator.hardwareConcurrency || 2;
  const n = Math.max(1, Math.min(8, cores - 1));
  let make;
  try {
    // the bundle carries the worker's source; unbundled, it loads as a module next to this file
    if (typeof __FX_WORKER_SRC__ !== "undefined") {
      const url = URL.createObjectURL(new Blob([__FX_WORKER_SRC__], { type: "text/javascript" }));
      make = () => new Worker(url);
    } else {
      const url = new URL("./fxworker.js", import.meta.url);
      make = () => new Worker(url, { type: "module" });
    }
    return new FxPool(n, make);
  } catch (e) {
    console.warn("no worker pool:", e);
    return null;
  }
}
