// Things in a room: the base entity, vessels (rigged characters), critters (baked pixelfx loops), corpses playing their
// death effect, projectiles and pickups.

import { createFx, fxMod, actorAlphaOf, poseAt } from "../engine/pfx.js";
import { bake, blit, frameAt, frameActor } from "../engine/bake.js";
import { drawBody, bodyActor, idlePose, walkPose, hurtPose } from "../engine/body.js";
import { G, clampX, clampY, FLOOR_TOP, FLOOR_BOT, X_MIN, X_MAX, sfx } from "./ctx.js";
import { tickStatus, drawStatus, damage, STATUS } from "./combat.js";
import { drawActorPixels } from "./world.js";
import { Performer } from "./perform.js";

const GRAV = 520;

export class Ent {
  constructor(o = {}) {
    Object.assign(this, {
      x: 160, y: 150, z: 0, vx: 0, vy: 0, vz: 0, facing: 1, r: 7, h: 34, depthR: 6, team: "neutral",
      hp: 1, maxhp: 1, dead: false, gone: false, hittable: false, solid: false, shadow: 0, inv: 0, flash: 0,
      st: {}, stun: 0, kbx: 0, age: 0, fly: false, speed: 40,
    }, o);
  }
  clampPos() {
    this.x = clampX(this.x);
    this.y = clampY(this.y);
  }
  get stopped() {
    for (const k in this.st) if (STATUS[k].stops) return true;
    return false;
  }
  get speedK() {
    let k = 1;
    for (const n in this.st) if (STATUS[n].speed) k *= STATUS[n].speed;
    return k;
  }
  physics(dt) {
    if (this.kbx) {
      this.x += this.kbx * dt;
      this.kbx *= Math.pow(0.0008, dt);
      if (Math.abs(this.kbx) < 2) this.kbx = 0;
    }
    if (!this.fly && (this.z > 0 || this.vz > 0)) {
      this.vz -= GRAV * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.z = 0;
        if (this.vz < -160 && this.hittable) {
          G.world.spawnFx("impacts/heavy-landing", this.x, this.y, {}, { prio: 0 });
          sfx("thud", 0.4);
        }
        this.vz = 0;
      }
    }
    this.clampPos();
  }
  baseUpdate(dt) {
    this.age += dt;
    if (this.inv > 0) this.inv -= dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.stun > 0) this.stun -= dt;
    tickStatus(this, dt);
    this.physics(dt);
  }
  update(dt) {
    this.baseUpdate(dt);
  }
  draw() {}
}

/** A rigged character: guard pose, walk cycle, moves from pixelfx acts, status effects wrapped round the real pose. */
export class Vessel extends Ent {
  constructor(o) {
    super({ r: 7, h: 36, depthR: 6, shadow: 9, solid: true, hittable: true, ...o });
    this.perf = null;
    this.walkT = 0;
    this.moving = false;
    this.pose = this.base;
  }
  /** Start a move (see perform.js). */
  perform(move, o) {
    this.perf = new Performer(this, move, o);
    return this.perf;
  }
  /** The pose right now. */
  posture() {
    if (this.perf && !this.perf.done) return this.perf.pose;
    if (this.stun > 0 && !this.armored) return hurtPose(this.base, Math.min(1, this.stun * 4));
    if (this.moving) return walkPose(this.base, this.walkT, this.walkSpeed ?? 1);
    return idlePose(this.base, this.age);
  }
  draw(frame) {
    const pose = (this.pose = this.posture());
    const flip = this.facing < 0, X = this.x, Y = this.y - this.z;
    const actor = Object.keys(this.st).length || this.needActor ? bodyActor(pose, this.pal) : null;
    let alpha = this.alpha ?? 1;
    if (actor) alpha = Math.min(alpha, drawStatus(this, frame, "back", actor));
    this.drawExtraBack?.(frame);
    if (alpha > 0) {
      const blink = this.inv > 0 && this.isPlayer && Math.floor(this.inv * 20) & 1;
      drawBody(frame, pose, this.pal, X, Y, {
        flip, alpha: blink ? alpha * 0.45 : alpha, flash: this.flash > 0 ? 0.85 : 0,
        eyes: this.dead ? 0 : this.eyeK ?? 1, outline: this.outline, outlineK: this.outlineK, tint: this.tint, tintK: this.tintK, clearLight: !!this.ghosts?.length,
      });
    }
    if (actor) drawStatus(this, frame, "front", actor);
    this.drawExtra?.(frame);
  }
  /** The body as it is now, as a pixelfx actor (for death effects). */
  snapshot() {
    return bodyActor(this.pose ?? this.base, this.pal);
  }
}

/** A critter: one of pixelfx's living loops, baked once and moved about. */
export class Critter extends Ent {
  constructor(o) {
    super({ r: 7, h: 16, depthR: 6, shadow: 7, solid: true, hittable: true, ...o });
    this.b = bake(this.fxId, this.fxOpts ?? {}, 24);
    this.animT = Math.random() * 3;
    this.animK = 1;
  }
  update(dt) {
    this.baseUpdate(dt);
    if (!this.stopped) this.animT += dt * this.animK;
  }
  draw(frame) {
    const F = frameAt(this.b, this.animT), flip = this.facing < 0 !== !!this.mirror, X = this.x, Y = this.y - this.z + (this.yoff ?? 0);
    const actor = Object.keys(this.st).length ? frameActor(this.b, F) : null;
    let alpha = this.alpha ?? 1;
    if (actor) {
      // statuses wrap the critter's own silhouette
      const sx = this.x, sy = this.y, sz = this.z;
      this.y = this.y + (this.yoff ?? 0);
      alpha = Math.min(alpha, drawStatus(this, frame, "back", actor));
      this.y = sy;
      this.x = sx;
      this.z = sz;
    }
    if (alpha > 0) blit(frame, this.b, X, Y, F, { flip, alpha, tint: this.flash > 0 ? 0xffffffff : this.tint, tintK: this.flash > 0 ? 0.85 : this.tintK ?? 0.5, light: this.lightK ?? 1 });
    else blit(frame, this.b, X, Y, F, { flip, onlyLight: true, light: 0.5 });
    if (actor) {
      const sy = this.y;
      this.y += this.yoff ?? 0;
      drawStatus(this, frame, "front", actor);
      this.y = sy;
    }
    this.drawExtra?.(frame);
  }
  snapshot() {
    return frameActor(this.b, frameAt(this.b, this.animT));
  }
}

/** What's left when something dies: its body, frozen, played out by a pixelfx death effect. */
export class Corpse extends Ent {
  constructor(src, fxId, opts = {}, o = {}) {
    super({ x: src.x, y: src.y, z: src.z, facing: src.facing });
    this.actor = src.snapshot();
    this.yoff = src.yoff ?? 0;
    this.mod = fxMod(fxId);
    this.inst = createFx(this.mod, { ...opts, actor: this.actor, x: this.x, y: this.y - this.z + this.yoff, flip: this.facing < 0 });
    this.fadeBody = o.fadeBody ?? 0;
    this.shadow = 0;
  }
  update(dt) {
    this.age += dt;
    this.inst.update(dt);
    if (this.inst.done()) this.gone = true;
  }
  draw(frame) {
    const D = this.mod.meta.duration ?? 1, t = Math.min(this.inst.t, D);
    let a = actorAlphaOf(this.mod, t, this.inst.options);
    if (this.fadeBody) a = Math.min(a, 1 - this.age / this.fadeBody);
    this.inst.draw(frame, "back");
    if (a > 0) drawActorPixels(frame, this.actor, this.x, this.y - this.z + this.yoff, this.facing < 0, a);
    this.inst.draw(frame, "front");
  }
}

/** A projectile: a pixelfx loop flown across the room; it hits the first foe it meets (or several, if it pierces). */
export class Projectile extends Ent {
  constructor(o) {
    super({ r: 4, h: 6, team: "player", z: 20, life: 3, dmg: 5, pierce: 0, elem: "phys", kind: "slash", ...o });
    this.mod = this.fxId ? fxMod(this.fxId) : null;
    this.inst = this.mod ? createFx(this.mod, { ...(this.fxOpts ?? {}), x: this.x, y: this.y - this.z }) : null;
    this.hitSet = new Set();
    this.shadow = this.noShadow ? 0 : 3;
  }
  update(dt) {
    this.age += dt;
    if (this.homing && !this.dead) {
      const tg = G.world.nearest(this.x, this.y, this.team, 200);
      if (tg) {
        const sp = Math.hypot(this.vx, this.vy), ang = Math.atan2(this.vy, this.vx), want = Math.atan2(tg.y - this.y, tg.x - this.x);
        let d = want - ang;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const na = ang + Math.max(-1, Math.min(1, d)) * this.homing * dt;
        this.vx = Math.cos(na) * sp;
        this.vy = Math.sin(na) * sp;
      }
    }
    if (this.accel) {
      this.vx *= 1 + this.accel * dt;
      this.vy *= 1 + this.accel * dt;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.vz || this.gravity) {
      this.vz -= (this.gravity ?? 0) * dt;
      this.z += this.vz * dt;
    }
    this.inst?.update(dt);
    if (this.trail && this.age % 0.05 < dt) this.trail(this);
    const out = this.x < X_MIN - 30 || this.x > X_MAX + 30 || this.y < FLOOR_TOP - 10 || this.y > FLOOR_BOT + 10;
    if (this.age > this.life || out || (this.z <= 0 && this.gravity)) return this.expire();
    for (const e of G.world.foes(this.team)) {
      if (this.hitSet.has(e)) continue;
      if (Math.abs(e.x - this.x) > e.r + this.r || Math.abs(e.y - this.y) > e.depthR + 5) continue;
      if (this.z > e.z + e.h + 4 || this.z + this.h < e.z - 2) continue;
      this.hitSet.add(e);
      const ok = this.onHitFoe ? this.onHitFoe(e) : damage(e, this.dmg, { src: this, elem: this.elem, kind: this.kind, kb: this.kb ?? 60, status: this.status, dir: Math.sign(this.vx) || 1, fromPlayer: this.team === "player", stop: this.stop ?? 0.03 });
      if (ok !== false && this.pierce-- <= 0) return this.expire(true);
    }
  }
  expire(hit = false) {
    if (this.gone) return;
    this.gone = true;
    this.dead = true;
    this.onExpire?.(this, hit);
  }
  draw(frame) {
    if (!this.inst) return this.drawSelf?.(frame);
    const o = this.inst.options, flip = this.vx < 0, b = Math.atan2(this.vy * (this.flat ? 0 : 1), Math.abs(this.vx) || 1);
    o.x = this.x;
    o.y = this.y - this.z;
    o.flip = flip;
    o.angle = this.spinAngle ?? (flip ? -b : b);
    this.inst.draw(frame, "back");
    this.inst.draw(frame, "front");
  }
}

/** A pickup lying on the floor: a baked pixelfx loop that bobs, gets pulled to the player and collected. */
export class Pickup extends Ent {
  constructor(o) {
    super({ r: 6, h: 10, shadow: 4, team: "neutral", magnet: 46, ...o });
    this.b = bake(this.fxId, this.fxOpts ?? {}, 20);
    this.animT = Math.random() * 2;
    this.vz = this.vz || 0;
  }
  update(dt) {
    this.age += dt;
    this.animT += dt;
    // pop out, bounce, settle
    if (this.z > 0 || this.vz > 0) {
      this.vz -= 400 * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.z = 0;
        this.vz = Math.abs(this.vz) > 60 ? -this.vz * 0.4 : 0;
      }
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= Math.pow(0.05, dt);
    this.vy *= Math.pow(0.05, dt);
    this.clampPos();
    const p = G.world.player;
    if (!p || p.dead || this.age < (this.delay ?? 0.4)) return;
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy * 1.5);
    const mag = this.magnet * (G.run?.stats.magnet ?? 1);
    if (this.auto || d < mag) {
      const sp = 60 + (this.auto ? 200 : 260 * (1 - d / mag)) + this.age * 40;
      this.x += (dx / (d || 1)) * sp * dt;
      this.y += (dy / (d || 1)) * sp * dt;
    }
    if (d < 9 && (!this.canTake || this.canTake(p))) {
      this.gone = true;
      this.onTake?.(p);
    }
  }
  draw(frame) {
    const bob = this.z > 0 ? 0 : Math.round(Math.sin(this.age * 4) * 1.5);
    blit(frame, this.b, this.x, this.y - this.z - bob + (this.yoff ?? 0), this.animT, { light: this.lightK ?? 1 });
  }
}

export { poseAt, damage };
