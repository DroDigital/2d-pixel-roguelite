// The wardens of each realm. A boss is a vessel with a book of patterns: every one warned on the floor before it lands,
// faster and meaner past each phase line.

import { PAL, READY } from "../engine/pfx.js";
import { vesselPal } from "../engine/body.js";
import { Vessel, Projectile, Corpse } from "./entity.js";
import { G, sfx, rnd, pick, chance, clampX, clampY, FLOOR_TOP, FLOOR_BOT } from "./ctx.js";
import { aoe, applyStatus, damage } from "./combat.js";
import { resolveMoveHit } from "./skills.js";
import { makeEnemy, summon, VP, geyserAt } from "./enemies.js";
import { Hazard } from "./props.js";
import { Pickup } from "./entity.js";
import { ember, coin } from "./run.js";

const ev = (t, fn) => ({ t, fn });
const ENEMY = { team: "enemy" };
const blast = (x, y, r, dmg, o = {}) => aoe(ENEMY, x, y, r, dmg, { team: "enemy", ...o });
const tele = (x, y, r, dur, then, c) => G.world.telegraph(x, y, r, dur, then, c);
const P = () => G.world.player;
const fx = (id, x, y, opts = {}, s = {}) => G.world.spawnFx(id, x, y, opts, { prio: 2, ...s });

// moves bosses borrow (dmg in half hearts)
const CLEAVE = { fx: "melee/heavy-cleave", from: -0.42, end: 1.1, speed: 0.85, armor: true, hits: [{ t: 0.335, x0: -10, x1: 76, dy: 18, dmg: 2, kb: 240, stop: 0.12, shake: 4 }] };
const BIGSWEEP = (pal) => ({ fx: "melee/spear-sweep", weapon: "spear", opts: { palette: pal }, from: -0.56, end: 1.0, speed: 0.9, armor: true, hits: [{ t: 0.1, x0: -20, x1: 70, dy: 16, dmg: 2, kb: 200, stop: 0.1, status: ["slow", 2] }] });
const THRUST = (pal) => ({ fx: "melee/thrust", weapon: "spear", opts: { palette: pal, reach: 1.2 }, from: -0.46, end: 0.75, speed: 0.85, armor: true, hits: [{ t: 0.07, x0: 0, x1: 96, dy: 10, dmg: 2, kb: 200, stop: 0.1 }] });
const COMBO = { posesFrom: "moves/sword-combo", fx: null, from: -0.4, end: 1.6, speed: 1, armor: true, events: [ev(0, (a, p) => fxAt2(p, "melee/sword-slash", 0, PAL.holy)), ev(0.5, (a, p) => fxAt2(p, "melee/double-slash", 10, PAL.holy)), ev(1.04, (a, p) => fxAt2(p, "melee/heavy-cleave", 20, PAL.holy))],
  hits: [{ t: 0.06, x0: -4, x1: 54, dy: 13, dmg: 1, kb: 100 }, { t: 0.66, x0: 6, x1: 66, dy: 13, dmg: 1, kb: 140 }, { t: 1.375, x0: 10, x1: 90, dy: 16, dmg: 2, kb: 240, shake: 4, stop: 0.12 }] };
function fxAt2(p, id, lx, pal) {
  const [x] = p.at(lx, 0);
  return G.world.spawnFx(id, x, p.oy, { palette: pal }, { flip: p.facing < 0, prio: 2, depth: p.oy + 3 });
}

/** A ring of shots from a point. */
function ring(x, y, z, n, speed, o) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (o.off ?? 0);
    G.world.add(new Projectile({ x, y, z, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * 0.55, team: "enemy", fxId: o.fx, fxOpts: o.opts, dmg: 1, elem: o.elem ?? "phys", kind: "flash", life: 3, h: 12, r: 4, homing: o.homing }));
  }
}

const BOSSES = {
  hollowking: {
    title: "THE HOLLOW KING", sub: "FIRST WARDEN OF THE SPIRE", pal: VP.grave, guard: { ...READY, weapon: "greatsword", fx: 10, fy: -19, sa: 1.2 }, hp: 900, speed: 32,
    aura: ["shadow/shadow-flames", { palette: PAL.shadow }], death: "spawn/soul-rise", deathOpts: { palette: PAL.arcane },
    patterns: {
      cleave: { w: 3, range: 60, run: (b) => b.melee(CLEAVE) },
      hands: { w: 2, run: (b) => {
        b.cast(0.8);
        const n = b.phase > 0 ? 4 : 3;
        for (let i = 0; i < n; i++) b.later(0.3 + i * 0.35, () => {
          const p = P(), x = i === 0 ? p.x : clampX(p.x + rnd(-60, 60)), y = i === 0 ? p.y : clampY(p.y + rnd(-14, 14));
          fx("shadow/hex-sigil", x, y, {}, { layer: "floor", speed: 2.4 });
          tele(x, y, 26, 1.0, () => { fx("shadow/grasping-hands", x, y); sfx("dark", 0.6); G.world.after(0.15, () => blast(x, y, 26, 2, { elem: "shadow", stun: 0.6, status: ["curse", 3] })); }, "#9a48ec");
        });
        return 2.4;
      } },
      summon: { w: 1.4, when: (b) => G.world.enemies().length < 4, run: (b) => {
        b.cast(1.2);
        sfx("roar", 0.6);
        for (const x of [80, 240]) {
          fx("spawn/summon-rise", x, 156, {}, { layer: "world" });
          b.later(2.0, () => summon(makeEnemy(chance(0.5) ? "skeleton" : "cultist", x, 156, 2), "rise"));
        }
        return 2.6;
      } },
      tendrils: { w: 2, run: (b) => {
        b.cast(0.9);
        tele(b.x, b.y, 70, 1.0, () => { fx("shadow/shadow-tendrils", b.x, b.y); sfx("dark"); G.world.after(0.4, () => blast(b.x, b.y, 70, 2, { elem: "shadow", kb: 220 })); }, "#9a48ec");
        return 2.0;
      } },
      voidorb: { w: 1.4, phase: 1, run: (b) => {
        b.cast(1.0);
        b.later(0.5, () => {
          sfx("dark", 1, 0.5);
          G.world.add(new Projectile({ x: b.x + b.facing * 16, y: b.y, z: 6, vx: b.facing * 30, vy: 0, team: "enemy", fxId: "shadow/void-orb", dmg: 2, elem: "shadow", kind: "flash", life: 6, homing: 0.9, r: 10, h: 60, noShadow: true, onExpire: (pr) => { fx("explosions/implosion", pr.x, pr.y - 20, { palette: PAL.arcane }); sfx("dark"); } }));
        });
        return 2.0;
      } },
      drain: { w: 1, when: (b) => b.hp < b.maxhp * 0.9, run: (b) => {
        const p = P();
        b.facing = Math.sign(p.x - b.x) || 1;
        b.cast(2.0);
        tele(p.x, p.y, 22, 0.8, null, "#cfe6ff");
        b.later(0.6, () => {
          fx("shadow/soul-drain", b.x + b.facing * 10, b.y, {}, { flip: b.facing < 0, life: 1.4 });
          sfx("dark", 0.8, 1.4);
          const q = P();
          if (q && Math.abs(q.y - b.y) < 14 && (q.x - b.x) * b.facing > 0 && Math.abs(q.x - b.x) < 180) { damage(q, 1, { src: b, elem: "shadow" }); b.hp = Math.min(b.maxhp, b.hp + b.maxhp * 0.03); }
        });
        return 2.4;
      } },
      eruption: { w: 2, phase: 1, run: (b) => {
        const p = P();
        fx("arcane/blink-out", b.x, b.y, { actor: b.snapshot(), palette: PAL.arcane });
        b.hidden = true;
        b.hittable = false;
        b.later(0.7, () => {
          b.x = clampX(p.x + (chance(0.5) ? -50 : 50));
          b.y = p.y;
          b.hidden = false;
          b.hittable = true;
          fx("arcane/blink-in", b.x, b.y, { actor: b.snapshot(), palette: PAL.arcane });
          tele(b.x, b.y, 56, 0.9, () => { fx("shadow/dark-explosion", b.x, b.y); sfx("bigboom", 0.7); G.world.shake(5, 0.4); blast(b.x, b.y, 56, 2, { elem: "shadow", kb: 260, kz: 160 }); }, "#c684ff");
        });
        return 2.6;
      } },
    },
  },
  oracle: {
    title: "THE DROWNED ORACLE", sub: "SHE SPEAKS IN TIDES", pal: VP.drowned, guard: { ...READY, weapon: "spear", fx: 10, fy: -20, sa: 1.4 }, hp: 1150, speed: 34,
    aura: ["water/bubbles", {}], death: "spawn/disintegrate", deathOpts: { accent: ["#ffffff", "#c4ecff", "#36a2e0"] }, float: 0,
    patterns: {
      thrust: { w: 3, range: 80, run: (b) => b.melee(THRUST(PAL.water)) },
      geysers: { w: 2.4, run: (b) => {
        b.cast(0.8);
        const n = b.phase > 0 ? 5 : 3;
        for (let i = 0; i < n; i++) b.later(i * 0.55, () => geyserAt(b, P()));
        return 1.2 + n * 0.55;
      } },
      wave: { w: 2, run: (b) => {
        b.cast(0.9);
        const dir = P().x > 160 ? 1 : -1;
        for (let k = 0; k < 4; k++) {
          const x = 160 - dir * 120 + dir * k * 80;
          b.later(0.2 + k * 0.35, () => tele(x, 148, 48, 0.8, () => { fx("water/wave-crash", x, 148, {}, { flip: dir < 0 }); sfx("water", 1); G.world.after(0.9, () => blast(x, 148, 50, 2, { elem: "water", kb: 260 * dir, ry: 26 })); }, "#36a2e0"));
        }
        return 3.0;
      } },
      jet: { w: 1.6, run: (b) => {
        const p = P();
        b.facing = Math.sign(p.x - b.x) || 1;
        b.y = clampY(b.y + Math.max(-20, Math.min(20, p.y - b.y)));
        const y = b.y, x0 = b.x + b.facing * 14;
        for (let k = 1; k < 6; k++) tele(x0 + b.facing * k * 30, y, 14, 0.9, null, "#36a2e0");
        b.cast(1.6);
        b.later(0.9, () => {
          const j = fx("water/water-jet", x0, y - 26, { length: 180 }, { flip: b.facing < 0, life: 1.0 });
          sfx("water", 1.2, 0.6);
          let n = 0;
          const tick = () => { for (const e of [P()]) if (e && (e.x - x0) * b.facing > 0 && Math.abs(e.y - y) < 9) damage(e, 1, { src: b, elem: "water", dir: b.facing }); if (++n < 4) G.world.after(0.25, tick); };
          tick();
          void j;
        });
        return 2.4;
      } },
      whirl: { w: 1.2, when: () => !G.world.ents.some((e) => e.whirl), run: (b) => {
        b.cast(0.8);
        const p = P();
        const h = G.world.add(new Hazard(p.x, p.y, { fx: "water/whirlpool", r: 30, dmg: 1, every: 1, pull: 30, life: 7, elem: "water", delay: 0.4 }));
        h.whirl = true;
        return 1.4;
      } },
      orbs: { w: 1.6, run: (b) => {
        b.cast(1.2);
        b.later(0.6, () => { sfx("water", 1, 1.4); ring(b.x, b.y, 18, 6 + b.phase * 2, 55, { fx: "water/water-orb", opts: { radius: 6 }, elem: "water", homing: 0.5 }); });
        return 2.2;
      } },
      frogs: { w: 1, phase: 1, when: () => G.world.enemies().length < 4, run: (b) => {
        b.cast(1);
        for (const x of [90, 230]) { fx("spawn/egg-hatch", x, 150, { palette: PAL.poison }); b.later(1.6, () => summon(makeEnemy("frog", x, 150, 3), "splash")); }
        return 2;
      } },
    },
  },
  rimequeen: {
    title: "THE RIME QUEEN", sub: "THE COLD THAT WAITS", pal: VP.frost, guard: { ...READY, weapon: "spear", fx: 10, fy: -20, sa: 1.4 }, hp: 1400, speed: 36,
    aura: ["holy/halo", { palette: PAL.ice }], death: "spawn/shatter-death", deathOpts: {},
    patterns: {
      sweep: { w: 3, range: 64, run: (b) => b.melee(BIGSWEEP(PAL.ice)) },
      nova: { w: 2, run: (b) => {
        b.cast(1.0);
        tele(b.x, b.y, 72, 0.9, () => { fx("ice/frost-nova", b.x, b.y); sfx("ice", 1.3); G.world.after(0.42, () => { const p = P(); if (blast(b.x, b.y, 72, 2, { elem: "ice", kb: 160, status: ["freeze", 1.2] }).includes(p)) fx("ice/freeze", p.x, p.y, { actor: p.snapshot() }, { follow: p, life: 1.4 }); }); }, "#9bdcff");
        return 2.2;
      } },
      spikes: { w: 2, run: (b) => {
        const p = P();
        b.facing = Math.sign(p.x - b.x) || 1;
        const y = b.y;
        b.cast(1.2);
        for (let k = 1; k <= 7; k++) tele(b.x + b.facing * k * 28, y, 14, 0.7 + k * 0.08, null, "#9bdcff");
        b.later(0.7, () => {
          fx("ice/ice-spikes", b.x + b.facing * 10, y, { reach: 196 }, { flip: b.facing < 0 });
          sfx("shatter");
          for (let k = 1; k <= 7; k++) G.world.after(0.15 + k * 0.1, () => blast(b.x + b.facing * k * 28, y, 16, 2, { elem: "ice", kz: 160, status: ["slow", 2] }));
        });
        return 2.4;
      } },
      icicles: { w: 2, run: (b) => {
        b.cast(1.0);
        const n = b.phase > 0 ? 8 : 5;
        for (let i = 0; i < n; i++) b.later(i * 0.22, () => {
          const p = P(), x = i % 2 ? p.x : rnd(30, 290), y = i % 2 ? p.y : rnd(FLOOR_TOP + 8, FLOOR_BOT - 4);
          tele(x, y, 18, 0.95, () => { sfx("shatter", 0.6); blast(x, y, 18, 2, { elem: "ice", status: ["freeze", 1] }); }, "#9bdcff");
          fx("ice/icicle-fall", x, y);
        });
        return 1.4 + n * 0.22;
      } },
      breath: { w: 1.6, run: (b) => {
        const p = P();
        b.facing = Math.sign(p.x - b.x) || 1;
        b.cast(1.8);
        b.later(0.5, () => {
          fx("ice/frost-breath", b.x + b.facing * 10, b.y - 30, { spread: 0.3 }, { flip: b.facing < 0, life: 1.2 });
          sfx("ice", 1, 0.6);
          let n = 0;
          const tick = () => { const e = P(); if (e && (e.x - b.x) * b.facing > 0 && (e.x - b.x) * b.facing < 150 && Math.abs(e.y - b.y) < 20) damage(e, 1, { src: b, elem: "ice", status: ["slow", 2], dir: b.facing }); if (++n < 4) G.world.after(0.3, tick); };
          tick();
        });
        return 2.2;
      } },
      blizzard: { w: 1, phase: 1, when: () => !G.world.ents.some((e) => e.vortex), run: (b) => {
        b.cast(1);
        const h = G.world.add(new Hazard(b.x, b.y, { fx: "ice/blizzard-vortex", layer: "world", r: 22, dmg: 1, every: 0.9, life: 8, follow: 26, elem: "ice", status: ["slow", 2] }));
        h.vortex = true;
        sfx("ice", 1.2, 0.5);
        return 1.6;
      } },
    },
  },
  engine: {
    title: "THE IRON ENGINE", sub: "IT WAS BUILT TO BURN", pal: VP.iron, guard: { ...READY, weapon: "launcher", two: true, sa: -1, fx: 9, fy: -19 }, hp: 1700, speed: 30,
    aura: ["lightning/electrified", {}], death: "spawn/disintegrate", deathOpts: {},
    patterns: {
      rockets: { w: 2.5, run: (b) => {
        b.cast(1.4);
        const n = b.phase > 0 ? 4 : 3;
        for (let i = 0; i < n; i++) b.later(0.3 + i * 0.3, () => {
          fx("projectiles/muzzle-shotgun", b.x + b.facing * 20, b.y, { height: 26 }, { flip: b.facing < 0 });
          sfx("boom", 0.4, 1.6);
          G.world.add(new Projectile({ x: b.x + b.facing * 20, y: b.y, z: 30, vx: b.facing * 60, vy: rnd(-40, 40), team: "enemy", fxId: "projectiles/rocket", fxOpts: { speed: 60 }, dmg: 2, life: 3.5, homing: 1.6, accel: 0.4, r: 6, h: 14,
            onExpire: (pr) => { fx("explosions/small-explosion", pr.x, pr.y, { size: 0.5 }); sfx("boom", 0.6); G.world.shake(3, 0.2); blast(pr.x, pr.y, 30, 2, { elem: "fire", kb: 160 }); } }));
        });
        return 2.4;
      } },
      grid: { w: 1.6, when: () => G.world.ents.filter((e) => e.grid).length < 2, run: (b) => {
        b.cast(0.8);
        const p = P();
        const h = G.world.add(new Hazard(p.x, p.y, { fx: "scifi/laser-grid", layer: "world", r: 26, dmg: 1, every: 0.5, life: 6, elem: "fire", delay: 0.6, active: (t) => t % 2 < 1.3 }));
        h.grid = true;
        tele(p.x, p.y, 26, 0.6, null, "#ff4040");
        return 1.4;
      } },
      strikes: { w: 2, run: (b) => {
        b.cast(1.0);
        fx("lightning/storm-cloud", P().x, P().y, {}, { follow: P(), followFlip: false, life: 1.8, layer: "world", dz: 40 });
        for (let i = 0; i < 3; i++) b.later(i * 0.45, () => { const p = P(), x = p.x, y = p.y; fx("lightning/lightning-strike", x, y); tele(x, y, 22, 0.75, () => { sfx("thunder"); G.world.shake(3, 0.2); blast(x, y, 22, 2, { elem: "shock", status: ["shock", 1.5] }); }, "#7cc8ff"); });
        return 2.2;
      } },
      emp: { w: 1.4, run: (b) => {
        b.cast(1);
        tele(b.x, b.y, 80, 1.0, () => { fx("scifi/emp-blast", b.x, b.y); sfx("zap", 1.4, 0.4); G.world.after(0.4, () => blast(b.x, b.y, 80, 1, { elem: "shock", stun: 1.2, kb: 200 })); }, "#7cc8ff");
        return 2.0;
      } },
      minigun: { w: 2, run: (b) => {
        const p = P();
        b.facing = Math.sign(p.x - b.x) || 1;
        b.cast(1.6);
        for (let i = 0; i < 8; i++) b.later(0.5 + i * 0.1, () => {
          if (i === 0) fx("projectiles/muzzle-smg", b.x + b.facing * 22, b.y, { height: 28 }, { flip: b.facing < 0, life: 0.8 });
          const t = P(), dy = t ? (t.y - b.y) / Math.max(40, Math.abs(t.x - b.x)) : 0;
          G.world.add(new Projectile({ x: b.x + b.facing * 24, y: b.y, z: 28, vx: b.facing * 230, vy: (dy + rnd(-0.15, 0.15)) * 230, team: "enemy", fxId: "projectiles/bullet-tracer", fxOpts: { length: 12 }, dmg: 1, kind: "bullet", life: 2 }));
          sfx("shoot", 0.4);
        });
        return 1.8;
      } },
      grenades: { w: 1.6, run: (b) => {
        b.cast(1.0);
        for (let i = 0; i < 3; i++) b.later(i * 0.3, () => {
          const p = P(), x = clampX(p.x + rnd(-40, 40)), y = clampY(p.y + rnd(-10, 10));
          fx("explosions/grenade", x, y, {});
          tele(x, y, 30, 1.6, () => { sfx("boom", 0.7); G.world.shake(3, 0.2); blast(x, y, 30, 2, { elem: "fire", kb: 180 }); }, "#ff8a2a");
        });
        return 2.2;
      } },
      missile: { w: 1.4, phase: 1, run: (b) => {
        b.cast(1.0);
        for (let i = 0; i < 2; i++) b.later(i * 0.6, () => { const p = P(), x = p.x, y = p.y; fx("projectiles/homing-missile", x, y, {}, { flip: x > b.x }); tele(x, y, 30, 1.15, () => { sfx("boom"); G.world.shake(4, 0.3); blast(x, y, 30, 2, { elem: "fire", kb: 200 }); }, "#ff4040"); });
        return 2.4;
      } },
      cannon: { w: 1.6, run: (b) => {
        const p = P();
        b.facing = Math.sign(p.x - b.x) || 1;
        b.y = clampY(b.y + Math.max(-16, Math.min(16, p.y - b.y)));
        for (let k = 1; k < 6; k++) tele(b.x + b.facing * k * 34, b.y, 14, 0.7, null, "#ff4040");
        b.cast(1.4);
        b.later(0.7, () => { fx("projectiles/cannonball", b.x + b.facing * 18, b.y, { height: 24 }, { flip: b.facing < 0 }); sfx("bigboom", 0.5, 1.4); G.world.shake(4, 0.3); const q = P(); if (q && (q.x - b.x) * b.facing > 0 && Math.abs(q.y - b.y) < 12) damage(q, 2, { src: b, kind: "blunt", kb: 260, dir: b.facing }); });
        return 2.0;
      } },
      tractor: { w: 1, phase: 1, run: (b) => {
        b.cast(1.6);
        const p = P();
        fx("scifi/tractor-beam", p.x, p.y, {}, { life: 1.6 });
        sfx("laser", 1, 0.3);
        let n = 0;
        const pull = () => { const q = P(); if (!q) return; q.x = clampX(q.x + Math.sign(b.x - q.x) * 4); if (++n < 14) G.world.after(0.1, pull); };
        pull();
        return 2.2;
      } },
      shield: { w: 9, phase: 1, once: true, run: (b) => {
        // the engine shields itself and hides behind two energy cores: break them
        b.cast(1.2);
        b.shieldFx = fx("scifi/force-field", b.x, b.y, { radius: 48 }, { follow: b });
        b.shielded = true;
        sfx("laser", 1, 0.4);
        b.cores = [70, 250].map((x) => {
          const c = summon(makeEnemy("drone", x, 150, 4), "warp");
          c.coreFor = b;
          return c;
        });
        return 2;
      } },
    },
    updateExtra(b) {
      if (b.shielded && b.cores && b.cores.every((c) => c.dead)) {
        b.shielded = false;
        G.world.fx.stop(b.shieldFx);
        fx("explosions/plasma-explosion", b.x, b.y - 20);
        sfx("bigboom", 0.6);
        b.stun = 1.5;
        G.hud.toast("SHIELD BROKEN", "STRIKE NOW", PAL.electric);
      }
    },
  },
  seraph: {
    title: "THE LAST SERAPH", sub: "KEEPER OF THE FIRST FLAME", pal: VP.paladin, guard: { ...READY, weapon: "sword", fx: 12, fy: -21, sa: -0.85 }, hp: 2200, speed: 40, phases: [0.66, 0.33],
    aura: ["holy/halo", {}], death: "holy/resurrection", deathOpts: {},
    patterns: {
      combo: { w: 3, range: 70, run: (b) => b.melee(COMBO) },
      smites: { w: 2, run: (b) => {
        b.cast(1);
        const n = 3 + b.phase;
        for (let i = 0; i < n; i++) b.later(i * 0.4, () => { const p = P(), x = p.x, y = p.y; tele(x, y, 30, 0.9, () => { fx("holy/smite", x, y); sfx("holy", 0.7); G.world.after(0.55, () => blast(x, y, 30, 2, { elem: "holy", kb: 140 })); }, "#ffd84a"); });
        return 1.6 + n * 0.4;
      } },
      pillars: { w: 1.6, run: (b) => {
        b.cast(1.2);
        const lane = rnd(0, 1) < 0.5;
        for (let k = 0; k < 5; k++) {
          const x = 40 + k * 60 + (lane ? 30 : 0), y = rnd(FLOOR_TOP + 10, FLOOR_BOT - 6);
          tele(x, y, 24, 1.0, () => { fx("holy/holy-pillar", x, y, { shafts: 4 }); sfx("holy", 0.5); G.world.after(0.62, () => blast(x, y, 24, 2, { elem: "holy", kz: 120 })); }, "#ffd84a");
        }
        return 2.2;
      } },
      feathers: { w: 1.6, run: (b) => {
        b.cast(1.2);
        b.later(0.6, () => { fx("holy/feather-burst", b.x, b.y - 30); sfx("holy"); ring(b.x, b.y, 26, 10 + b.phase * 4, 90, { fx: "fire/fireball", opts: { radius: 2, palette: ["#2a1c08", "#5a3e10", "#9a6c18", "#d8a428", "#ffd84a", "#fff09a", "#fffbe6", "#ffffff", "#ffffff"] }, elem: "holy" }); });
        return 2.0;
      } },
      starfall: { w: 1.4, run: (b) => {
        b.cast(1.2);
        const p = P(), x = p.x, y = p.y;
        fx("arcane/star-fall", x, y, { palette: PAL.holy });
        for (const t of [0.95, 1.2, 1.45]) b.later(t, () => blast(x, y, 60, 1, { elem: "holy", kb: 60 }));
        tele(x, y, 60, 0.9, null, "#ffd84a");
        return 2.0;
      } },
      beam: { w: 1.4, run: (b) => {
        const p = P();
        b.facing = Math.sign(p.x - b.x) || 1;
        b.y = clampY(b.y + Math.max(-16, Math.min(16, p.y - b.y)));
        for (let k = 1; k < 8; k++) tele(b.x + b.facing * k * 30, b.y, 12, 0.9, null, "#ffd84a");
        b.cast(2);
        b.later(0.9, () => {
          fx("arcane/arcane-beam", b.x + b.facing * 6, b.y, { palette: PAL.holy }, { flip: b.facing < 0, life: 1 });
          sfx("laser", 1.2, 0.5);
          let n = 0;
          const tick = () => { const q = P(); if (q && (q.x - b.x) * b.facing > 0 && Math.abs(q.y - b.y) < 9) damage(q, 1, { src: b, elem: "holy", dir: b.facing }); if (++n < 4) G.world.after(0.25, tick); };
          tick();
        });
        return 2.4;
      } },
      breath: { w: 1.4, phase: 1, run: (b) => {
        const p = P();
        b.facing = Math.sign(p.x - b.x) || 1;
        b.cast(1.8);
        b.later(0.5, () => {
          fx("fire/fire-breath", b.x + b.facing * 10, b.y - 30, {}, { flip: b.facing < 0, life: 1.2 });
          sfx("fire", 1.3, 0.6);
          let n = 0;
          const tick = () => { const e = P(); if (e && (e.x - b.x) * b.facing > 0 && (e.x - b.x) * b.facing < 150 && Math.abs(e.y - b.y) < 20) damage(e, 1, { src: b, elem: "fire", status: ["burn", 2], dir: b.facing }); if (++n < 4) G.world.after(0.3, tick); };
          tick();
        });
        return 2.2;
      } },
      meteor: { w: 1.6, phase: 1, run: (b) => {
        b.cast(1.6);
        fx("arcane/magic-circle-cast", b.x, b.y, { palette: PAL.fire });
        const p = P(), x = p.x, y = p.y;
        b.later(1.0, () => { fx("fire/meteor", x, y); tele(x, y, 56, 0.62, () => { sfx("bigboom"); G.world.shake(7, 0.5); blast(x, y, 56, 3, { elem: "fire", kb: 260, status: ["burn", 3] }); fx("fire/flame-pillar", x, y, { height: 84 }); }, "#ff8a2a"); });
        return 2.4;
      } },
      tornado: { w: 1, phase: 1, when: () => !G.world.ents.some((e) => e.tornado), run: (b) => {
        b.cast(0.8);
        const h = G.world.add(new Hazard(b.x + b.facing * 40, b.y, { fx: "fire/fire-tornado", layer: "world", r: 20, dmg: 1, every: 0.8, life: 7, follow: 30, elem: "fire", status: ["burn", 2] }));
        h.tornado = true;
        sfx("fire", 1.3, 0.6);
        return 1.4;
      } },
      eclipse: { w: 8, phase: 2, once: true, run: (b) => {
        b.cast(2.2);
        G.screen.flash = 0.6;
        G.world.spawnFx("shadow/eclipse", 160, 40, {}, { layer: "floor", prio: 2 });
        fx("arcane/time-stop", P().x, P().y, {}, { layer: "over" });
        applyStatus(P(), "slow", 3);
        sfx("dark", 1.4, 0.5);
        G.hud.toast("THE SUN GOES OUT", "SHE BURNS HOTTER IN THE DARK", PAL.shadow);
        b.later(1.2, () => { const h = G.world.add(new Hazard(160, 148, { fx: "shadow/black-hole", layer: "world", r: 34, dmg: 1, every: 1, pull: 22, life: 9 })); void h; });
        return 3;
      } },
    },
  },
};

class Boss extends Vessel {
  constructor(id, def, x, y, run) {
    const hp = def.hp * (1 + (G.save?.stats.wins ?? 0) * 0.15);
    super({ team: "enemy", x, y, facing: -1, pal: vesselPal(def.pal), base: def.guard, hp, maxhp: hp, r: 9, h: 40, depthR: 7, kind: id });
    this.def = def;
    this.boss = true;
    this.isElite = true;
    this.title = def.title;
    this.sub = def.sub;
    this.heavy = true;
    this.kbResist = 0.15;
    this.busy = 1.2;
    this.phase = 0;
    this.phases = def.phases ?? [0.5];
    this.used = new Set();
    this.timers = [];
    this.awake = false;
    this.outline = 0xff4ad8ff >>> 0;
    this.outlineK = 0.3;
    this.last = null;
    this.casting = 0;
  }
  get armored() {
    return true;
  }
  intro() {
    sfx("roar");
    G.world.shake(4, 0.8);
    G.screen.flash = 0.3;
    G.screen.flashColor = [255, 220, 200];
    const [id, o] = this.def.aura;
    this.auraFx = G.world.spawnFx(id, this.x, this.y, { actor: this.snapshot(), ...o }, { follow: this, prio: 2 });
    G.world.spawnFx("ui/exclamation", this.x, this.y, { actor: this.snapshot() }, { follow: this, prio: 2 });
  }
  later(t, fn) {
    G.world.after(t, () => !this.dead && fn());
  }
  cast(t) {
    this.casting = t;
  }
  melee(m) {
    this.facing = Math.sign(P().x - this.x) || this.facing;
    this.perform(m, { speed: this.enraged ? 1.2 : 1 });
    return (m.end - (m.from ?? 0)) / (m.speed ?? 1) + 0.2;
  }
  onMoveHit(h, perf) {
    return resolveMoveHit(this, h, perf);
  }
  posture() {
    if (this.casting > 0 && !this.perf) {
      const up = Math.floor(this.age * 6) & 1;
      return { ...this.base, crouch: 2, lean: -3, fx: -6, fy: -42 - up, bx: 9, by: -40 - up, turn: 1, weapon: this.base.weapon };
    }
    return super.posture();
  }
  update(dt) {
    this.baseUpdate(dt);
    if (this.dead) return;
    this.stun = Math.min(this.stun, 0);
    if (this.casting > 0) this.casting -= dt;
    this.def.updateExtra?.(this);
    // phase lines
    const f = this.hp / this.maxhp;
    while (this.phase < this.phases.length && f < this.phases[this.phase]) {
      this.phase++;
      this.enraged = true;
      applyStatus(this, "rage", 9999);
      G.world.spawnFx("ui/health-bar-hit", 160, 150, { from: this.phases[this.phase - 1] + 0.1, to: this.phases[this.phase - 1] }, { layer: "over", prio: 2 });
      G.world.spawnFx("impacts/impact-frame", 160, 90, {}, { layer: "over", prio: 2 });
      G.world.hitstop(0.25);
      sfx("roar", 0.8, 1.2);
      this.busy = 0.6;
    }
    if (!this.awake || this.stopped) return;
    if (this.perf) {
      this.perf.update(dt);
      if (this.perf.done) this.perf = null;
      return;
    }
    this.busy -= dt * (this.enraged ? 1.25 : 1);
    const p = P();
    if (!p || p.dead) return;
    if (this.busy > 0) {
      if (this.casting <= 0) {
        // drift to a fighting distance
        const want = p.x + (this.x > p.x ? 70 : -70), dx = want - this.x, dy = p.y - this.y;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 4) {
          this.x = clampX(this.x + Math.sign(dx) * Math.min(Math.abs(dx), this.def.speed * dt));
          this.y = clampY(this.y + Math.sign(dy) * Math.min(Math.abs(dy), this.def.speed * 0.6 * dt));
          this.moving = true;
          this.walkT += dt;
        } else this.moving = false;
        this.facing = Math.sign(p.x - this.x) || this.facing;
      }
      return;
    }
    this.moving = false;
    const dist = Math.abs(p.x - this.x);
    const opts = Object.entries(this.def.patterns).filter(([k, pt]) => (pt.phase ?? 0) <= this.phase && (!pt.once || !this.used.has(k)) && (!pt.when || pt.when(this)) && (!pt.range || (dist < pt.range && Math.abs(p.y - this.y) < 14)) && k !== this.last);
    if (!opts.length) {
      this.busy = 0.4;
      return;
    }
    // a once-pattern of a new phase goes first
    const first = opts.find(([, pt]) => pt.once);
    const tot = opts.reduce((s, [, pt]) => s + pt.w, 0);
    let r = Math.random() * tot, pickd = opts[0];
    for (const o of opts) if ((r -= o[1].w) <= 0) { pickd = o; break; }
    if (first) pickd = first;
    const [k, pt] = pickd;
    this.last = k;
    if (pt.once) this.used.add(k);
    this.facing = Math.sign(p.x - this.x) || this.facing;
    this.busy = (pt.run(this) ?? 1.5) + rnd(0.3, 0.9) / (this.enraged ? 1.6 : 1);
  }
  onDeath() {
    const w = G.world, run = G.run;
    if (this.auraFx) w.fx.stop(this.auraFx);
    if (this.shieldFx) w.fx.stop(this.shieldFx);
    for (const e of w.enemies()) if (e !== this) e.hp = 0, e.dead = true, e.onDeath?.({});
    w.slowmo(0.2, 1.6);
    w.hitstop(0.25);
    w.shake(8, 1.2);
    G.screen.flash = 0.8;
    G.screen.flashColor = [255, 255, 255];
    sfx("bigboom");
    w.spawnFx("impacts/impact-frame", 160, 90, {}, { layer: "over", prio: 2 });
    w.add(new Corpse(this, this.def.death, this.def.deathOpts, { fadeBody: this.def.death === "holy/resurrection" ? 2.5 : 0 }));
    w.spawnFx(this.kind === "seraph" ? "explosions/nuke" : "explosions/big-explosion", this.x, this.y, {}, { prio: 2 });
    this.gone = true;
    run.stat("bosses");
    G.hud.boss = null;
    G.hud.toast("WARDEN SLAIN", this.title, PAL.gold);
    for (let i = 0; i < 6 + run.biome * 2; i++) w.add(new Pickup({ x: this.x, y: this.y, z: 20, vx: rnd(-90, 90), vy: rnd(-30, 30), vz: rnd(90, 160), ...ember() }));
    for (let i = 0; i < 20; i++) w.add(new Pickup({ x: this.x, y: this.y, z: 20, vx: rnd(-100, 100), vy: rnd(-35, 35), vz: rnd(90, 170), ...coin(2) }));
    w.after(1.8, () => G.room.clear());
  }
}

export function makeBoss(id, x, y, run) {
  const b = new Boss(id, BOSSES[id], x, y, run);
  return G.world.add(b);
}
export { BOSSES, pick };
