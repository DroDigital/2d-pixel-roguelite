// You: a vessel driven by the controls. Combos chain when the last swing can be cancelled, dashes dodge through hits
// (and a dash timed just before a blow is a parry), the ultimate fills as you fight.

import { vesselPal, dashPose, kneelPose, castPose } from "../engine/body.js";
import { posed } from "../engine/pfx.js";
import { Vessel } from "./entity.js";
import { G, sfx, clampX, clampY } from "./ctx.js";
import { resolveMoveHit } from "./skills.js";
import { applyStatus, aoe, damage, inRadius } from "./combat.js";
import { hex, PAL, painterFor } from "../engine/pfx.js";

export const PLAYER_COLORS = ["#ff9a3c", "#58b4ec", "#7ee88a", "#ff86e6"];

export class Player extends Vessel {
  constructor(cls, x = 60, y = 150, slot = 0, device = null) {
    super({ team: "player", isPlayer: true, x, y, facing: 1, pal: vesselPal(cls.pal), base: cls.guard, r: 7, hp: 1, maxhp: 1 });
    this.cls = cls;
    this.slot = slot;
    // solo: every device drives you; in co-op, your own device only
    this.device = device;
    this.color = hex(PLAYER_COLORS[slot] ?? PLAYER_COLORS[0]) >>> 0;
    this.maxHp = cls.hp;
    this.hp = cls.hp;
    this.ult = 0;
    this.shield = 0;
    this.down = false;
    this.reviveT = 0;
    this.combo = 0;
    this.comboT = 0;
    this.cd = { special: 0, dash: 0 };
    this.dashT = -1;
    this.dashDir = [1, 0];
    this.ghosts = [];
    this.ghostC = hex(cls.ghost ?? "#8fb4ff") >>> 0;
    this.iframe = 0;
    this.lastDash = -9;
    this.hurtT = 0;
    this.interactable = null;
    this.locked = false; // cutscenes, menus
    this.stepT = 0;
    this.elem = cls.elem;
  }
  get run() {
    return G.run;
  }
  get ctrl() {
    return this.device ? G.input.device(this.device) : G.input;
  }
  get dmgMul() {
    return 1;
  }
  get inv() {
    return Math.max(this.iframe, this.dashT >= 0 ? 1 : 0, this.perf && this.perf.m.iframes && this.perf.t >= this.perf.m.iframes[0] && this.perf.t <= this.perf.m.iframes[1] ? 1 : 0);
  }
  set inv(v) {}
  update(dt) {
    this.baseUpdate(dt);
    if (this.iframe > 0) this.iframe -= dt;
    const inp = this.ctrl, run = this.run;
    for (const k in this.cd) if (this.cd[k] > 0) this.cd[k] -= dt;
    if (this.comboT > 0 && (this.comboT -= dt) <= 0) this.combo = 0;
    for (const g of this.ghosts) g.age += dt;
    while (this.ghosts.length && this.ghosts[0].age > 0.2) this.ghosts.shift();
    if (this.dead) return;
    this.moving = false;
    if (this.down) return this.updateDown(dt);
    if (this.locked) return;
    if (this.stopped || this.stun > 0) {
      if (this.perf && !this.perf.m.armor) this.perf = null;
      return;
    }
    // a dash in progress
    if (this.dashT >= 0) return this.updateDash(dt);
    // a move in progress
    if (this.perf) {
      this.perf.update(dt);
      if (this.perf.m.armor || this.perf.t < (this.perf.m.ghostUntil ?? -9)) this.trail(dt);
      if (this.perf.done) this.perf = null;
      else if (this.perf.cancellable) {
        if (inp.pressed("dash", 0.15) && this.cd.dash <= 0) {
          inp.take("dash", 0.15);
          this.perf.cancel();
          this.perf = null;
          return this.startDash();
        }
        if (inp.pressed("attack", 0.25) && this.perf.m.comboStep !== undefined && this.combo < this.cls.combo.length) {
          inp.take("attack", 0.25);
          this.perf.cancel();
          return this.attack();
        }
        if (inp.pressed("special", 0.15) && this.cd.special <= 0) {
          inp.take("special", 0.15);
          this.perf.cancel();
          return this.special();
        }
        // walking out of the recovery
        if (Math.hypot(...inp.axis) > 0.3 && this.perf.t > (this.perf.m.cancel ?? 0) + 0.05) this.perf = null;
      }
      if (this.perf) return;
    }
    // free
    if (inp.take("ult", 0.1) && this.ult >= 100) return this.ultimate();
    if (inp.take("dash", 0.1) && this.cd.dash <= 0) return this.startDash();
    if (inp.take("special", 0.1)) {
      if (this.cd.special <= 0) return this.special();
      sfx("nope", 0.5);
    }
    if (inp.take("attack", 0.12)) return this.attack();
    if (inp.take("interact", 0.1) && this.interactable) return this.interactable.interact(this);
    const [ax, ay] = inp.axis, sp = this.cls.speed * run.stats.speed * this.speedK;
    if (Math.hypot(ax, ay) > 0.15) {
      this.x = clampX(this.x + ax * sp * dt);
      this.y = clampY(this.y + ay * sp * 0.62 * dt);
      if (Math.abs(ax) > 0.15) this.facing = Math.sign(ax);
      this.moving = true;
      this.walkT += dt * (0.6 + 0.5 * Math.hypot(ax, ay));
      this.walkSpeed = 1;
      if ((this.stepT -= dt) <= 0) {
        this.stepT = 0.28;
        sfx("step", 0.5);
      }
    }
  }
  /** Turn to face the nearest foe if there's one close behind and none in front; drift into its lane. */
  autoAim(range = 110) {
    const w = G.world, foes = w.foes("player").filter((e) => Math.abs(e.y - this.y) < 26 && Math.abs(e.x - this.x) < range);
    const ahead = foes.filter((e) => (e.x - this.x) * this.facing > -6);
    const pool = ahead.length ? ahead : foes;
    if (!pool.length) return null;
    pool.sort((a, b) => Math.abs(a.x - this.x) + Math.abs(a.y - this.y) * 2 - (Math.abs(b.x - this.x) + Math.abs(b.y - this.y) * 2));
    const t = pool[0];
    if (!ahead.length) this.facing = Math.sign(t.x - this.x) || this.facing;
    this.y = clampY(this.y + Math.max(-7, Math.min(7, t.y - this.y)));
    return t;
  }
  attack() {
    const cls = this.cls, i = this.combo % cls.combo.length;
    this.autoAim();
    const m = cls.combo[i];
    m.comboStep = i;
    this.perform(m, { speed: this.run.stats.atkSpeed });
    if (m.sfx) sfx(m.sfx);
    this.combo = i + 1;
    if (this.combo >= cls.combo.length) this.combo = 0;
    this.comboT = 0.9;
    for (const f of this.run.hooks.onAttack) f(this, i);
  }
  special() {
    const s = this.cls.special;
    this.autoAim(160);
    this.perform(s.move, { speed: this.run.stats.atkSpeed });
    this.cd.special = s.cd * this.run.stats.cdr;
    this.combo = 0;
    for (const f of this.run.hooks.onSpecial) f(this);
  }
  ultimate() {
    const u = this.cls.ult;
    this.autoAim(200);
    this.ult = 0;
    this.perform(u.move);
    G.world.slowmo(0.5, 0.25);
    G.world.spawnFx("lightning/charge-up", this.x, this.y, { actor: this.snapshot() }, { follow: this, life: 0.7, prio: 1 });
    G.screen.flash = 0.25;
    sfx("powerup", 0.8, 0.8);
    for (const f of this.run.hooks.onUlt) f(this);
  }
  startDash() {
    const inp = this.ctrl, [ax, ay] = inp.axis, run = this.run;
    let dx = ax, dy = ay;
    if (Math.hypot(dx, dy) < 0.2) {
      dx = this.facing;
      dy = 0;
    }
    const l = Math.hypot(dx, dy);
    this.dashDir = [dx / l, dy / l];
    if (Math.abs(dx) > 0.2) this.facing = Math.sign(dx);
    this.cd.dash = 0.42 * run.stats.dashCd;
    this.lastDash = G.world.t;
    this.combo = 0;
    const kind = this.cls.dash.kind;
    sfx("dash");
    if (kind === "blink") {
      // the pyromancer steps through space instead
      const w = G.world;
      w.spawnFx("arcane/blink-out", this.x, this.y, { actor: this.snapshot() }, { flip: this.facing < 0, prio: 1 });
      const dist = 78 * run.stats.dashLen;
      this.x = clampX(this.x + this.dashDir[0] * dist);
      this.y = clampY(this.y + this.dashDir[1] * dist * 0.5);
      w.spawnFx("arcane/blink-in", this.x, this.y, { actor: this.snapshot() }, { flip: this.facing < 0, prio: 1 });
      this.iframe = Math.max(this.iframe, 0.3);
      this.dashT = -1;
      for (const f of run.hooks.onDash) f(this);
      sfx("magic", 0.6, 1.4);
      return;
    }
    this.dashT = 0;
    if (kind === "roll" && this.cls.id === "ranger") G.world.spawnFx("nature/leaf-storm", this.x, this.y, { actor: this.snapshot() }, { follow: this, life: 0.5, prio: 0 });
    if (kind === "shadow") G.world.spawnFx("explosions/smoke-bomb", this.x, this.y, { palette: ["#0e0c12", "#1c1230", "#2c1a4a", "#432468", "#5e3290", "#8048b8"] }, { prio: 0, speed: 1.6, life: 1 });
    else G.world.spawnFx("spawn/poof", this.x - this.dashDir[0] * 6, this.y, {}, { prio: 0 });
    for (const f of run.hooks.onDash) f(this);
  }
  updateDash(dt) {
    const run = this.run, D = 0.2, sp = 250 * run.stats.dashLen;
    this.dashT += dt;
    this.x = clampX(this.x + this.dashDir[0] * sp * dt);
    this.y = clampY(this.y + this.dashDir[1] * sp * 0.6 * dt);
    this.trail(dt);
    if (this.cls.dash.kind === "charge") {
      // the brute's shoulder charge bowls foes over
      for (const e of inRadius("player", this.x + this.facing * 8, this.y, 16)) {
        if (e.chargeHit === this.lastDash) continue;
        e.chargeHit = this.lastDash;
        damage(e, 8, { src: this, kind: "blunt", kb: 220, stun: 0.6, dir: this.facing, fromPlayer: true, stop: 0.05 });
      }
    }
    if (this.dashT >= D) {
      this.dashT = -1;
      this.iframe = Math.max(this.iframe, 0.06);
      for (const f of run.hooks.onDashEnd) f(this);
    }
  }
  trail(dt) {
    this.ghostAcc = (this.ghostAcc ?? 0) + dt;
    if (this.ghostAcc < 1 / 30) return;
    this.ghostAcc = 0;
    this.ghosts.push({ pose: this.posture(), x: this.x, y: this.y - this.z, f: this.facing, age: 0 });
    if (this.ghosts.length > 6) this.ghosts.shift();
  }
  posture() {
    if (this.dead) return kneelPose(this.base);
    if (this.dashT >= 0) return dashPose(this.base);
    if (this.locked && this.castPose) return castPose(this.base, this.age);
    if (this.down) return { ...kneelPose(this.base), crouch: 10, lean: 8, hy: 3 };
    if (this.hp <= 2 && !this.moving && !this.perf && this.stun <= 0 && Math.floor(this.age * 0.5) % 3 === 0) return { ...this.base, crouch: 5, lean: 4, hy: 1 };
    return super.posture();
  }
  drawExtraBack(frame) {
    // after-images are light, not paint: they glow over what's behind and leave nothing muddy
    const L = frame.light, W = frame.w, H = frame.h, c = this.ghostC;
    for (const g of this.ghosts) {
      const r = posed(g.pose), k = 0.55 * (1 - g.age / 0.2), X = Math.round(g.x), Y = Math.round(g.y);
      if (k <= 0) continue;
      const cr = (c & 255) * k, cg = ((c >>> 8) & 255) * k, cb = ((c >>> 16) & 255) * k;
      for (let i = 0; i < r.n; i++) {
        const x = g.f < 0 ? X - r.xs[i] - 1 : X + r.xs[i], y = Y + r.ys[i];
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const j = y * W + x, d = L[j];
        L[j] = (255 << 24) | (Math.min(255, ((d >>> 16) & 255) + cb) << 16) | (Math.min(255, ((d >>> 8) & 255) + cg) << 8) | Math.min(255, (d & 255) + cr);
      }
    }
  }
  onMoveHit(h, perf) {
    return resolveMoveHit(this, h, perf);
  }
  /** Something hits you. amt is in half hearts. */
  hurt(amt, info = {}) {
    const run = this.run, w = G.world;
    if (this.dead || run.godMode) return false;
    if (this.dashT >= 0 && G.world.t - this.lastDash < 0.13 && !info.unblockable) {
      // a perfect dodge: a parry
      if (this.parried !== this.lastDash) {
        this.parried = this.lastDash;
        w.spawnFx("impacts/parry", this.x, this.y, {}, { prio: 2, layer: "over" });
        w.slowmo(0.25, 0.5);
        sfx("parry");
        this.ult = Math.min(100, this.ult + 12);
        run.stat("parries");
        for (const f of run.hooks.onParry) f(this, info);
      }
      return false;
    }
    if (this.inv > 0) return false;
    if (this.down) return false;
    if (this.shield > 0 && !info.unblockable) {
      this.shield--;
      w.spawnFx("impacts/shield-block", this.x, this.y, {}, { flip: this.facing < 0, prio: 2 });
      sfx("block");
      this.iframe = 0.8;
      for (const f of run.hooks.onBlock) f(this, info);
      return false;
    }
    let n = Math.max(1, Math.round(amt * (this.cls.armor ?? 1) * run.stats.dmgTaken));
    if (amt <= 0) return false;
    this.hp -= n;
    run.damageTaken += n;
    run.noHitRoom = false;
    this.iframe = 1.1;
    this.flash = 0.15;
    if (this.perf && !this.perf.m.armor) this.perf = null;
    this.dashT = -1;
    this.stun = 0.28;
    const dir = info.dir ?? (info.src ? Math.sign(this.x - info.src.x) || -this.facing : -this.facing);
    this.kbx += dir * 130;
    w.hitstop(0.1);
    w.shake(4, 0.3);
    G.screen.flash = 0.18;
    G.screen.flashColor = [255, 40, 60];
    w.spawnFx("impacts/hit-flash", this.x, this.y, { palette: ["#3a0a14", "#a01824", "#ff5a50", "#ffd8cc", "#ffffff"] }, { follow: this, prio: 2 });
    run.heartLost(this, n);
    sfx("hurt");
    if (info.elem === "shock") w.spawnFx("scifi/glitch", this.x, this.y, { actor: this.snapshot() }, { follow: this, life: 0.6, prio: 1 });
    if (info.status) {
      const [s, d, p = 1] = info.status;
      if (Math.random() < p * 0.6) applyStatus(this, s, d * 0.5, 1, info.src);
    }
    for (const f of run.hooks.onHurt) f(this, info);
    if (this.hp <= 0) run.playerDown(this);
    return true;
  }
  heal(n, quiet) {
    if (this.down) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    if (this.hp > before && !quiet) {
      G.world.spawnFx("holy/heal", this.x, this.y, { actor: this.snapshot() }, { follow: this, prio: 2 });
      sfx("heal");
    }
    return this.hp - before;
  }
  /** Out of hearts in co-op: on your knees until a friend stands by you long enough, or the room is cleared. */
  goDown() {
    this.down = true;
    this.hittable = false;
    this.perf = null;
    this.dashT = -1;
    this.reviveT = 0;
    this.st = {};
    G.world.spawnFx("spawn/soul-rise", this.x, this.y, { actor: this.snapshot(), palette: PAL.fire }, { prio: 2 });
    G.hud?.toast(`P${this.slot + 1} IS DOWN`, "STAND BY THEM TO REKINDLE", PAL.blood);
  }
  revive(hp = 2) {
    this.down = false;
    this.hittable = true;
    this.hp = Math.max(1, Math.min(this.maxHp, hp));
    this.iframe = 2;
    G.world.spawnFx("spawn/respawn-beam", this.x, this.y, { actor: this.snapshot() }, { follow: this, prio: 2 });
    sfx("holy", 0.9, 1.2);
  }
  updateDown(dt) {
    // a living teammate standing close rekindles you
    const helper = G.world.players.find((o) => o !== this && !o.down && !o.dead && Math.hypot(o.x - this.x, (o.y - this.y) * 1.6) < 28);
    this.reviveT = helper ? this.reviveT + dt : Math.max(0, this.reviveT - dt * 0.5);
    if (this.reviveT >= 1.8) this.revive(Math.ceil(this.maxHp / 3));
  }
  drawExtra(frame) {
    const coop = G.world?.players?.length > 1;
    if (!coop || this.hidden) return;
    // who's who: a tag in your color over your head, a ring while you're being rekindled
    const p = painterFor(frame), y = this.y - this.z - 46;
    p.text(`P${this.slot + 1}`, this.x, y, this.color, { align: "center", outline: 0xff0b0a10 });
    p.px(this.x, y + 7, this.color);
    p.light(this.x, y + 3, this.color, 0.4);
    if (this.down) {
      const k = this.reviveT / 1.8;
      for (let i = 0; i < 24; i++) if (i / 24 < k || Math.floor(G.time * 4) & 1) p.dot(this.x + Math.cos((i / 24) * 6.283 - 1.57) * 12, this.y - 2 + Math.sin((i / 24) * 6.283 - 1.57) * 4, i / 24 < k ? this.color : 0xff4a4462, 1);
    }
  }
}
export { aoe };
