// A move, performed: the body follows the pose track of a pixelfx act (wind-up, release, recovery on 12 fps steps),
// the effect plays from t = 0 where the act's origin is, and hits and events fire on the act's own clock.
//
// move: {
//   fx: effect id played at the origin at t = 0 (or null), opts: its options, fxAt: when it starts (default 0),
//   poses: a track [[t, pose, how]] or posesFrom: an effect id whose act.poses to borrow (default fx),
//   weapon: swap the weapon in every pose, from / end: when the move starts and gives control back,
//   cancel: from when the next move can cut in, speed, hits: [{ t, x0, x1, dy, dmg, ... }], events: [{ t, fn }],
//   still: don't let the poses move the body along the floor, armor: can't be knocked out of it
// }

import { fxMod, poseAt } from "../engine/pfx.js";
import { G, clampX } from "./ctx.js";

const trackCache = new WeakMap();
function trackOf(move) {
  let tr = trackCache.get(move);
  if (tr) return tr;
  let poses = move.poses;
  if (!poses) {
    const src = move.posesFrom ?? move.fx;
    poses = fxMod(src).act?.poses ?? [[0, {}]];
  }
  if (move.weapon !== undefined || move.over) poses = poses.map(([t, p, h]) => [t, { ...p, ...(move.weapon !== undefined ? { weapon: move.weapon || undefined } : {}), ...(move.over ?? {}) }, h]);
  if (move.shift) poses = poses.map(([t, p, h]) => [t + move.shift, p, h]);
  trackCache.set(move, poses);
  return poses;
}

export class Performer {
  constructor(actor, move, o = {}) {
    this.a = actor;
    this.m = move;
    this.track = trackOf(move);
    this.t = move.from ?? this.track[0][0];
    this.end = move.end ?? this.track[this.track.length - 1][0];
    this.speed = (move.speed ?? 1) * (o.speed ?? 1);
    this.facing = actor.facing;
    const p0 = poseAt(this.track, this.t);
    this.ox = actor.x - this.facing * (move.still ? 0 : p0.x ?? 0);
    this.oy = actor.y;
    this.hits = (move.hits ?? []).slice().sort((a, b) => a.t - b.t);
    this.hi = 0;
    while (this.hi < this.hits.length && this.hits[this.hi].t < this.t) this.hi++;
    this.events = (move.events ?? []).slice().sort((a, b) => a.t - b.t);
    this.ei = 0;
    while (this.ei < this.events.length && this.events[this.ei].t < this.t) this.ei++;
    this.fxAt = move.fxAt ?? 0;
    this.fxe = null;
    this.done = false;
    this.hitAny = false;
    this.pose = p0;
    this.data = {};
  }
  get cancellable() {
    return this.t >= (this.m.cancel ?? this.end);
  }
  get phase() {
    return this.t < 0 ? "windup" : this.t < (this.hits[this.hits.length - 1]?.t ?? 0) ? "active" : "recovery";
  }
  update(dt) {
    if (this.done) return;
    const w = G.world, a = this.a;
    this.t += dt * this.speed;
    if (this.m.fx && !this.fxe && this.t >= this.fxAt) {
      const opts = typeof this.m.opts === "function" ? this.m.opts(a, this) : this.m.opts ?? {};
      this.fxe = w.spawnFx(this.m.fx, this.ox, this.oy, opts, { flip: this.facing < 0, speed: this.speed, depth: this.oy + (this.m.dz ?? 2), prio: 2 });
      if (this.fxe && this.t > this.fxAt) this.fxe.inst.update((this.t - this.fxAt));
    }
    while (this.hi < this.hits.length && this.hits[this.hi].t <= this.t) {
      const h = this.hits[this.hi++];
      if (a.dead) break;
      if (a.onMoveHit(h, this)) this.hitAny = true;
    }
    while (this.ei < this.events.length && this.events[this.ei].t <= this.t) {
      const ev = this.events[this.ei++];
      if (!a.dead) ev.fn(a, this);
    }
    const p = poseAt(this.track, Math.min(this.t, this.end));
    this.pose = p;
    if (!this.m.still) a.x = clampX(this.ox + this.facing * (p.x ?? 0));
    a.z = Math.max(0, -(p.y ?? 0));
    if (this.t >= this.end) this.done = true;
  }
  /** Stop: the effect plays out, the body is free. */
  cancel(killFx = false) {
    this.done = true;
    if (killFx && this.fxe) G.world.fx.stop(this.fxe);
    this.a.z = 0;
  }
  /** Where a point in the move's local space is in the world. */
  at(lx, ly) {
    return [this.ox + this.facing * lx, this.oy + ly];
  }
}
