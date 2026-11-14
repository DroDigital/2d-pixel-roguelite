// Things in rooms that aren't fighters: explosive barrels, floor hazards, the doors onward, and anything you can use.

import { PAL } from "../engine/pfx.js";
import { bake, blit, still } from "../engine/bake.js";
import { Ent } from "./entity.js";
import { G, sfx } from "./ctx.js";
import { aoe, damage, applyStatus } from "./combat.js";
import { text, C } from "./ui.js";

/** A barrel of something volatile. One hit and it blows. */
export class Barrel extends Ent {
  constructor(x, y, opts = {}) {
    super({ x, y, r: 7, h: 22, depthR: 5, team: "prop", isProp: true, hittable: true, solid: true, shadow: 8, hp: 1, maxhp: 1 });
    this.opts = opts;
    this.b = still("explosions/barrel-explosion", opts, 0);
  }
  update(dt) {
    this.age += dt;
    if (this.flash > 0) this.flash -= dt;
  }
  draw(frame) {
    blit(frame, this.b, this.x, this.y, 0, { tint: this.flash > 0 ? 0xffffffff : undefined, tintK: 0.8 });
  }
  onDeath() {
    const w = G.world, x = this.x, y = this.y;
    this.gone = true;
    w.spawnFx("explosions/barrel-explosion", x, y, this.opts, { prio: 2, speed: 1.4 });
    sfx("heavy", 0.5, 1.5);
    w.after(0.6, () => {
      sfx("boom");
      w.shake(5, 0.4);
      w.hitstop(0.06);
      aoe({ team: "player", x, y }, x, y, 44, 30, { elem: "fire", kb: 260, kz: 160, status: ["burn", 3], fromPlayer: true });
      for (const p of w.livePlayers()) if (Math.hypot(p.x - x, (p.y - y) * 2) < 44) damage(p, 2, { src: this, elem: "fire" });
    });
  }
}

/**
 * A patch of floor that hurts: a pixelfx loop (toxic puddle, laser grid, whirlpool, flames) with a radius, a tick of
 * damage for whoever stands in it, maybe a status and a pull. o: { fx, opts, r, dmg, every, status, pull, life, team, delay, baked }.
 */
export class Hazard extends Ent {
  constructor(x, y, o) {
    super({ x, y, r: o.r ?? 20, team: "hazard", hittable: false, ...o });
    this.inst = G.world.spawnFx(o.fx, x, y, o.opts ?? {}, { layer: o.layer ?? "floor", prio: 2, life: o.life ?? Infinity, delay: o.delay ?? 0 });
    this.tick = 0;
    this.hitT = new Map();
    this.dz = -40;
  }
  update(dt) {
    this.age += dt;
    if (this.follow) {
      const p = G.world.nearestPlayer(this.x, this.y);
      if (p) {
        this.x += Math.sign(p.x - this.x) * Math.min(Math.abs(p.x - this.x), this.follow * dt);
        this.y += Math.sign(p.y - this.y) * Math.min(Math.abs(p.y - this.y), this.follow * 0.6 * dt);
        if (this.inst) { this.inst.inst.options.x = this.x; this.inst.inst.options.y = this.y; this.inst.depth = this.y; }
      }
    }
    if (this.age < (this.delay ?? 0) + (this.warm ?? 0.3)) return;
    if (this.age > (this.life ?? Infinity) || this.inst?.dead) return (this.gone = true);
    if (this.active && !this.active(this.age)) return;
    const victims = [...G.world.livePlayers(), ...(this.hurtsEnemies ? G.world.enemies() : [])];
    for (const e of victims) {
      if (e.dead) continue;
      const dx = (e.x - this.x) / (this.r + e.r * 0.5), dy = (e.y - this.y) / (this.r * 0.4 + 3);
      if (dx * dx + dy * dy > 1) continue;
      if (this.pull) {
        e.x += Math.sign(this.x - e.x) * this.pull * dt;
        e.y += Math.sign(this.y - e.y) * this.pull * 0.5 * dt;
      }
      const last = this.hitT.get(e) ?? -9;
      if (this.age - last < (this.every ?? 0.8)) continue;
      this.hitT.set(e, this.age);
      if (this.status && !e.isPlayer) applyStatus(e, this.status[0], this.status[1]);
      damage(e, e.isPlayer ? this.dmg ?? 1 : (this.dmg ?? 1) * 8, { src: this, elem: this.elem ?? "phys", kb: 30, status: this.status, fx: !e.isPlayer ? undefined : false });
    }
  }
  draw() {}
}

/** Something you can walk up to and use: [E]. */
export class Interactable extends Ent {
  constructor(x, y, o) {
    super({ x, y, r: 14, team: "neutral", shadow: o.shadow ?? 0, ...o });
    this.b = o.fx ? bake(o.fx, o.opts ?? {}, 20) : null;
  }
  update(dt) {
    this.age += dt;
  }
  draw(frame) {
    if (this.b && !this.used) blit(frame, this.b, this.x, this.y + (this.yoff ?? 0), this.age, { light: this.lightK ?? 1 });
    this.drawExtra?.(frame);
    if (this.price !== undefined && !this.used) text(String(this.price), this.x, this.y + 4, G.run && G.run.coins >= this.price ? C.gold : C.red, { align: "center", frame });
    if (this.label && !this.used) text(this.label, this.x, this.y + (this.labelY ?? 4), C.text, { align: "center", frame });
  }
}

/** A door onward: a portal with what lies beyond floating above it. */
export class Door extends Ent {
  constructor(x, y, spec, icon) {
    super({ x, y, r: 12, team: "neutral" });
    this.spec = spec;
    this.icon = icon;
    this.portal = bake("arcane/portal", { width: 14, height: 26, palette: spec.palette ?? PAL.arcane }, 16);
    this.ib = icon ? bake(icon.fx, icon.opts ?? {}, 20) : null;
    this.open = 0;
    this.dz = -30;
  }
  update(dt) {
    this.age += dt;
    this.open = Math.min(1, this.open + dt * 1.5);
    // any member of the party stepping in takes everyone through
    if (this.open >= 1 && !G.room.leaving && G.world.livePlayers().some((p) => Math.abs(p.x - this.x) < 12 && Math.abs(p.y - this.y) < 8)) G.room.leave(this.spec, this);
  }
  draw(frame) {
    blit(frame, this.portal, this.x, this.y, this.age, { alpha: this.open, light: this.open });
    if (this.ib && this.open > 0.5) blit(frame, this.ib, this.x, this.y - 64 + Math.sin(this.age * 2) * 2 + (this.icon.yoff ?? 0), this.age, { light: 0.8 });
    if (this.open > 0.7) text(this.spec.label ?? "", this.x, this.y - 82, C.text, { align: "center", frame });
  }
}
