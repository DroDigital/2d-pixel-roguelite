// Live effects in the world. Each is a pixelfx instance with a place in the depth order: "floor" effects lie under
// everything, "world" ones sort with the characters by their feet, "over" ones draw above the world, "hud" ones on the
// HUD frame. An effect can follow an entity, run faster or slower, and is dropped when it's done.

import { createFx, fxMod } from "./pfx.js";

export class FxManager {
  constructor() {
    this.list = [];
    this.budget = 70;
    this.low = false;
  }
  clear() {
    this.list.length = 0;
  }
  /**
   * Play effect `id` at (x, y). s: { flip, angle, layer, follow (entity), ox, oy (offset from it, mirrored with its
   * facing), depth (sort y), speed, life (seconds, then a loop is told to stop), prio (0 skippable .. 2 always) }.
   */
  spawn(id, x, y, opts = {}, s = {}) {
    const prio = s.prio ?? 1;
    if (prio < 2 && this.list.length >= this.budget * (prio === 0 ? 0.6 : 1)) return null;
    if (this.low && prio === 0) return null;
    const mod = fxMod(id);
    const inst = createFx(mod, { ...opts, x, y, flip: !!s.flip, angle: s.angle ?? 0 });
    const e = {
      id, mod, inst, layer: s.layer ?? "world", follow: s.follow ?? null, ox: s.ox ?? 0, oy: s.oy ?? 0,
      depth: s.depth ?? y, dz: s.dz ?? 0, speed: s.speed ?? 1, life: s.life ?? Infinity, age: 0, dead: false,
      followFlip: s.followFlip ?? true, onDone: s.onDone ?? null, delay: s.delay ?? 0,
    };
    this.place(e);
    this.list.push(e);
    return e;
  }
  place(e) {
    const f = e.follow;
    if (!f) return;
    const sign = e.followFlip ? (f.facing < 0 ? -1 : 1) : 1;
    e.inst.options.x = f.x + e.ox * sign;
    e.inst.options.y = f.y - (f.z ?? 0) + e.oy;
    if (e.followFlip) e.inst.options.flip = f.facing < 0;
    e.depth = f.y + e.dz;
  }
  stop(e) {
    if (e && !e.dead) e.inst.stop();
  }
  update(dt) {
    for (const e of this.list) {
      if (e.dead) continue;
      if (e.delay > 0) {
        e.delay -= dt;
        continue;
      }
      e.inst.update(dt * e.speed);
      e.age += dt;
      if (e.follow) {
        if (e.follow.gone) e.inst.stop();
        else this.place(e);
      }
      if (e.age >= e.life) e.inst.stop();
      if (e.inst.done()) {
        e.dead = true;
        e.onDone?.();
      }
    }
    if (this.list.some((e) => e.dead)) this.list = this.list.filter((e) => !e.dead);
  }
  /** Push draw calls for one layer into `out` as { d, f }; floor and over layers get flat depths. */
  collect(out, frame, layer) {
    for (const e of this.list) {
      if (e.layer !== layer || e.delay > 0) continue;
      if (layer === "world") {
        out.push({ d: e.depth - 0.4, f: () => e.inst.draw(frame, "back") });
        out.push({ d: e.depth + 0.4, f: () => e.inst.draw(frame, "front") });
      } else out.push({ d: e.depth, f: () => e.inst.draw(frame) });
    }
  }
  drawLayer(frame, layer) {
    for (const e of this.list) if (e.layer === layer && e.delay <= 0) e.inst.draw(frame);
  }
}
