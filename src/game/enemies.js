// The bestiary. Critters are pixelfx's living loops given a brain; vessels are the rig in an enemy's colors, attacking
// with acts played at full wind-up so every blow is telegraphed: the body coils, the rim glows red, then it lands.

import { PAL, READY } from "../engine/pfx.js";
import { vesselPal } from "../engine/body.js";
import { Vessel, Critter, Corpse, Projectile } from "./entity.js";
import { G, sfx, rnd, chance, clampX, clampY, FLOOR_TOP, FLOOR_BOT, pick } from "./ctx.js";
import { damage, aoe, applyStatus, STATUS } from "./combat.js";
import { resolveMoveHit, fxAt } from "./skills.js";

const RED = 0xff3a3aff >>> 0, GOLD = 0xff4ad8ff >>> 0;
const ev = (t, fn) => ({ t, fn });

// ---- palettes for enemy vessels
const VP = {
  bone: { A: "#efe6d0", B: "#c4b89c", C: "#8e8270", D: "#5e5648", E: "#3a2f2a", F: "#2a221e", G: "#1a1412", J: "#241c18", m: "#ff3030", eye: "#ff3030", k: "#0e0a08" },
  grave: { A: "#9aa0b4", B: "#646a82", C: "#40445a", D: "#262838", E: "#4a1820", F: "#341016", G: "#22080c", J: "#14101c", m: "#ff2a2a", eye: "#ff4040", k: "#06050a" },
  cult: { A: "#b49ac8", B: "#7c5c9a", C: "#4e3470", D: "#2e1c48", E: "#c8a46a", F: "#8a6a3a", G: "#4a361c", J: "#1c1028", m: "#ff5ad8", eye: "#ff5ad8", k: "#0a0610" },
  drowned: { A: "#a8e0cc", B: "#64a896", C: "#3a7064", D: "#1e4440", E: "#4a6a3a", F: "#30482a", G: "#1c2c1a", J: "#10201e", m: "#4fe0c8", eye: "#4fe0c8", k: "#060e0c" },
  frost: { A: "#f4fbff", B: "#bcdcf4", C: "#7ca8d4", D: "#4870a4", E: "#2a3c6a", F: "#1c2a4c", G: "#121c34", J: "#16203a", m: "#9bdcff", eye: "#9bdcff", k: "#080c18" },
  yeti: { A: "#ffffff", B: "#d8e4f0", C: "#a4b4c8", D: "#6c7c94", E: "#4a5a74", F: "#34405a", G: "#222a3c", J: "#2a3448", m: "#58b4ec", eye: "#58f4ff", k: "#0c1018" },
  iron: { A: "#d0d6e0", B: "#8c96a8", C: "#58627a", D: "#343c50", E: "#ff8a2a", F: "#b4561a", G: "#6a2c10", J: "#1c2030", m: "#ffd23c", eye: "#ff9a2a", k: "#08090e" },
  volt: { A: "#e0f0ff", B: "#90b0d8", C: "#5070a8", D: "#2c4074", E: "#ffd23c", F: "#c08818", G: "#704c0c", J: "#18203c", m: "#7cc8ff", eye: "#7cc8ff", k: "#060a14" },
  seraph: { A: "#fffbe6", B: "#f0d890", C: "#c8a040", D: "#8a6a20", E: "#f4f0ff", F: "#c8c0e0", G: "#8a80a8", J: "#5a4818", m: "#ffffff", eye: "#ffffff", k: "#1a1408" },
  paladin: { A: "#ffffff", B: "#e4dcc8", C: "#b8a878", D: "#7a6c44", E: "#ffd84a", F: "#c4941a", G: "#7a5a0c", J: "#4a3e20", m: "#ffd84a", eye: "#fff6c4", k: "#14100a" },
};

// ---- enemy attacks (dmg in half hearts)
const SLASH = { fx: "melee/sword-slash", from: -0.55, end: 0.8, speed: 0.85, hits: [{ t: 0.06, x0: -4, x1: 50, dy: 12, dmg: 1, kb: 140, stop: 0.06 }] };
const THRUST = { fx: "melee/thrust", from: -0.46, end: 0.62, speed: 0.8, weapon: "spear", opts: { palette: PAL.water }, hits: [{ t: 0.07, x0: 0, x1: 76, dy: 9, dmg: 1, kb: 160, stop: 0.06 }] };
const SWEEP = { fx: "melee/spear-sweep", from: -0.56, end: 1.0, speed: 0.85, opts: { palette: PAL.ice }, hits: [{ t: 0.1, x0: -14, x1: 62, dy: 14, dmg: 1, kb: 150, stop: 0.07, status: ["slow", 2] }] };
const CLEAVE = { fx: "melee/heavy-cleave", from: -0.42, end: 1.2, speed: 0.75, armor: true, hits: [{ t: 0.335, x0: -8, x1: 70, dy: 16, dmg: 2, kb: 220, stop: 0.12, shake: 4 }] };
const SMASH = { fx: "melee/hammer-smash", from: -0.72, end: 1.2, speed: 0.8, armor: true, opts: { palette: PAL.ice }, hits: [{ t: 0.15, x0: 6, x1: 72, dy: 16, dmg: 2, kb: 220, stop: 0.12, shake: 4, kind: "blunt" }] };
const SCYTHE = { fx: "melee/scythe-reap", from: -0.56, end: 1.1, speed: 0.85, hits: [{ t: 0.14, x0: -22, x1: 60, dy: 14, dmg: 1, kb: 150, stop: 0.07, elem: "shadow" }] };
const HOLYSLASH = { fx: "melee/double-slash", from: -0.42, end: 0.85, speed: 0.8, opts: { palette: PAL.holy }, hits: [{ t: 0.06, x0: 0, x1: 54, dy: 12, dmg: 1, kb: 40, stop: 0.03 }, { t: 0.16, x0: 0, x1: 54, dy: 12, dmg: 1, kb: 140, stop: 0.06 }] };

const CLAW = { fx: "melee/claw-swipe", from: -0.46, end: 0.85, speed: 0.85, opts: { palette: PAL.blood }, hits: [{ t: 0.04, x0: 0, x1: 46, dy: 11, dmg: 1, kb: 40, stop: 0.03 }, { t: 0.12, x0: 0, x1: 46, dy: 11, dmg: 1, kb: 140, stop: 0.06, status: ["bleed", 3] }] };
const FLURRY = { fx: "melee/dagger-flurry", from: -0.4, end: 1.0, speed: 0.85, opts: { palette: PAL.water }, hits: [0.05, 0.16, 0.27].map((t) => ({ t, x0: 0, x1: 50, dy: 10, dmg: 1, kb: 30, stop: 0.02, status: ["poison", 3, 0.4] })) };
const WHIP = { fx: "melee/whip-crack", weapon: "handle", from: -0.46, end: 0.9, speed: 0.85, opts: { palette: PAL.holy }, hits: [{ t: 0.21, x0: 30, x1: 96, dy: 9, dmg: 1, kb: 160, stop: 0.08 }] };
const MISSILES = { fx: "arcane/arcane-missiles", from: -0.52, end: 1.5, speed: 0.9, hits: [0.77, 0.95, 1.2].map((t) => ({ t, x0: 100, x1: 170, dy: 10, dmg: 1, kb: 60, stop: 0.02, elem: "arcane", kind: "zap" })) };
const PISTOLS = { fx: "moves/pistol-shots", from: -0.36, end: 1.3, speed: 0.85, hits: [0.26, 0.54, 0.82].map((t) => ({ t, x0: 24, x1: 176, dy: 6, dmg: 1, kb: 60, stop: 0.02, kind: "bullet" })) };
const CHAIN = { fx: "lightning/chain-lightning", from: -0.46, end: 1.3, speed: 0.85, hits: [[0.05, 40, 70], [0.14, 86, 116], [0.23, 132, 162]].map(([t, x0, x1]) => ({ t, x0, x1, dy: 10, dmg: 1, kb: 60, stop: 0.03, elem: "shock", kind: "zap", status: ["shock", 1.5] })) };
const FLAME = {
  poses: [[-0.5, { ...READY, weapon: "launcher", two: true, sa: 0, fx: 9, fy: -19 }], [-0.1, { ...READY, weapon: "launcher", two: true, sa: 0.05, fx: 12, fy: -20, crouch: 4, lean: 3 }], [1.2, { ...READY, weapon: "launcher", two: true, sa: 0.05, fx: 12, fy: -20, crouch: 4, lean: 3 }]], from: -0.5, end: 1.2,
  events: [ev(0, (a, p) => { fxAt(p, "fire/flamethrower", 26, -20, { reach: 90 }, { life: 1.1 }); sfx("fire", 1.2, 0.7); })],
  hits: [0.15, 0.45, 0.75, 1.05].map((t) => ({ t, x0: 20, x1: 112, dy: 9, dmg: 1, kb: 40, stop: 0.01, elem: "fire", status: ["burn", 2] })),
};
const BOULDER = { posesFrom: "moves/earth-stomp", from: -0.5, end: 0.9, speed: 0.8, events: [ev(0.06, (a, p) => { fxAt(p, "nature/boulder", 4, 0, { palette: PAL.ice }); sfx("heavy", 0.8, 0.6); })], hits: [{ t: 0.56, x0: 110, x1: 190, dy: 14, dmg: 2, kb: 200, kind: "blunt", stop: 0.1, shake: 4 }] };

const shotEv = (o) => ev(o.t, (a, p) => {
  if (o.muzzle) fxAt(p, o.muzzle, o.lx - 2, o.ly, { height: 0 }, { prio: 0 });
  const t = G.world.player, dy = t ? Math.max(-0.4, Math.min(0.4, (t.y - a.y) / Math.max(40, Math.abs(t.x - a.x)))) : 0;
  const [x] = p.at(o.lx, 0);
  G.world.add(new Projectile({ x, y: a.y + 1, z: -o.ly, vx: p.facing * o.speed, vy: dy * o.speed, team: "enemy", owner: a, fxId: o.fx, fxOpts: o.opts, dmg: o.dmg ?? 1, elem: o.elem ?? "phys", kind: o.kind ?? "bullet", life: 3, h: 8, status: o.status, onExpire: o.onExpire, r: o.r ?? 4 }));
  sfx(o.sfx ?? "shoot", 0.6);
});
const PISTOL_REST = { ...READY, weapon: "pistol", sa: 0.9, fx: 10, fy: -17, bx: 7, by: -16 };
const GAIM = { ...PISTOL_REST, crouch: 3, lean: 2, fx: 18, fy: -28, sa: 0, bx: 12, by: -25, ffx: 11, fbx: -9 };
const GUNSHOT = { poses: [[-0.5, PISTOL_REST], [-0.25, GAIM], [0, GAIM], [0.001, { ...GAIM, fy: -33, sa: -0.45 }, "snap"], [0.4, GAIM]], from: -0.5, end: 0.45, events: [shotEv({ t: 0.0005, lx: 30, ly: -32, speed: 230, fx: "projectiles/bullet-tracer", opts: { length: 14 }, muzzle: "projectiles/muzzle-pistol" })] };
const ARROW = { posesFrom: "moves/arrow-shot", from: -0.14, end: 0.9, speed: 0.9, events: [shotEv({ t: 0.56, lx: 30, ly: -28, speed: 210, fx: "projectiles/arrow", kind: "slash", sfx: "bow" })] };
const ROCKET = { posesFrom: "moves/rocket-launcher", weapon: "launcher", from: -0.18, end: 1.1, speed: 0.8, events: [shotEv({ t: 0.6, lx: 44, ly: -21, speed: 110, fx: "projectiles/rocket", opts: { speed: 72 }, muzzle: "projectiles/muzzle-shotgun", dmg: 2, r: 6, sfx: "boom", onExpire: (pr) => { G.world.spawnFx("explosions/small-explosion", pr.x, pr.y, { size: 0.55 }, { prio: 1 }); sfx("boom", 0.6); G.world.shake(3, 0.2); aoe(pr, pr.x, pr.y, 34, 2, { team: "enemy", kb: 160 }); } })] };
const HEX = {
  posesFrom: "arcane/spell-charge", from: -0.46, end: 0.9, speed: 0.8,
  events: [ev(-0.4, (a, p) => fxAt(p, "arcane/spell-charge", 0, 0, { palette: PAL.arcane }, { life: 0.5 })), ev(0, (a) => {
    const t = G.world.player;
    if (!t) return;
    const x = t.x, y = t.y;
    G.world.spawnFx("shadow/hex-sigil", x, y, {}, { prio: 1, layer: "floor", speed: 2.2 });
    G.world.telegraph(x, y, 26, 1.0, () => {
      G.world.spawnFx("shadow/grasping-hands", x, y, {}, { prio: 1 });
      sfx("dark", 0.7);
      G.world.after(0.15, () => aoe(a, x, y, 26, 1, { elem: "shadow", stun: 0.5, status: ["curse", 3] }));
    }, "#9a48ec");
  })],
};
const SMITE = {
  posesFrom: "moves/holy-smite", from: -0.42, end: 1.0, speed: 0.75,
  events: [ev(-0.2, (a) => {
    const t = G.world.player;
    if (!t) return;
    const x = t.x, y = t.y;
    G.world.telegraph(x, y, 30, 1.0, () => {
      G.world.spawnFx("holy/smite", x, y, {}, { prio: 1 });
      sfx("holy");
      G.world.after(0.5, () => aoe(a, x, y, 30, 2, { elem: "holy", kb: 120 }));
    }, "#ffd84a");
  })],
};

// ---- brains
function toward(e, tx, ty, sp, dt) {
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy * 1.4);
  if (d < 1) return true;
  const k = Math.min(1, (sp * dt) / d);
  e.x = clampX(e.x + dx * k);
  e.y = clampY(e.y + dy * k * 0.7);
  if (Math.abs(dx) > 2) e.facing = Math.sign(dx);
  return d < 4;
}
const tokens = () => G.world.ents.filter((e) => e.team === "enemy" && e.perf && !e.perf.done && !e.dead).length;

const AI = {
  // melee vessels: take a side, close in, line up, attack when a slot is free
  brawler(e, dt, t) {
    if (!t) return e.idle(dt);
    const dx = t.x - e.x, range = e.def.range ?? 44;
    if (e.side === undefined || Math.abs(dx) > 120) e.side = dx > 0 ? -1 : 1;
    const wantX = t.x + e.side * range * 0.85, wantY = t.y + (e.lane ?? 0);
    const close = Math.abs(dx) <= range + 4 && Math.abs(t.y - e.y) < 9;
    if (close && e.cool <= 0 && tokens() < (e.def.elite ? 3 : 2)) {
      e.facing = Math.sign(dx) || e.facing;
      return e.attack(pick(e.def.moves));
    }
    if (!toward(e, wantX, wantY, e.def.speed * e.speedK, dt)) {
      e.moving = true;
      e.walkT += dt;
    }
    e.facing = Math.sign(dx) || e.facing;
  },
  // ranged vessels: keep their distance, find the lane, shoot
  gunner(e, dt, t) {
    if (!t) return e.idle(dt);
    const dx = t.x - e.x, want = e.def.range ?? 110;
    const side = Math.sign(e.x - t.x) || 1;
    let wantX = t.x + side * want;
    if (wantX < 20 || wantX > 300) wantX = t.x - side * want;
    const aligned = Math.abs(t.y - e.y) < 8 && Math.abs(Math.abs(dx) - want) < 40;
    e.facing = Math.sign(dx) || e.facing;
    if (aligned && e.cool <= 0 && tokens() < 3) return e.attack(pick(e.def.moves));
    if (!toward(e, wantX, t.y, e.def.speed * e.speedK, dt)) {
      e.moving = true;
      e.walkT += dt;
    }
    e.facing = Math.sign(dx) || e.facing;
  },
  // casters cast from anywhere, then drift away
  caster(e, dt, t) {
    if (!t) return e.idle(dt);
    e.facing = Math.sign(t.x - e.x) || e.facing;
    if (e.cool <= 0 && tokens() < 3) return e.attack(pick(e.def.moves));
    const side = Math.sign(e.x - t.x) || 1;
    if (!toward(e, clampX(t.x + side * 120), e.home ?? t.y, e.def.speed * e.speedK, dt)) {
      e.moving = true;
      e.walkT += dt;
    }
  },
  // slimes ooze toward you
  crawler(e, dt, t) {
    if (!t) return;
    toward(e, t.x, t.y, e.def.speed * e.speedK * (0.6 + 0.4 * Math.sin(e.age * 3.4)), dt);
  },
  // bats circle, then dive
  swooper(e, dt, t) {
    if (!t) return;
    e.dive = (e.dive ?? rnd(1, 2.5)) - dt;
    if (e.dive > 0) {
      const a = e.age * 1.7 + e.seed;
      toward(e, t.x + Math.cos(a) * 60, t.y + Math.sin(a * 1.3) * 18, e.def.speed * e.speedK, dt);
    } else {
      if (e.dive > -0.05) {
        e.diveTo = [t.x, t.y];
        sfx("dash", 0.4, 1.6);
      }
      toward(e, e.diveTo[0], e.diveTo[1], 150 * e.speedK, dt);
      if (e.dive < -0.7) e.dive = rnd(1.6, 2.8);
    }
  },
  // hovering shooters
  floater(e, dt, t) {
    if (!t) return;
    const a = e.age * 0.6 + e.seed, side = Math.sign(e.x - t.x) || 1;
    toward(e, clampX(t.x + side * (90 + Math.sin(a) * 20)), t.y + Math.sin(a * 1.7) * 14, e.def.speed * e.speedK, dt);
    e.facing = Math.sign(t.x - e.x) || 1;
    if (e.cool <= 0 && Math.abs(t.y - e.y) < 16) {
      e.cool = e.def.cool * rnd(0.8, 1.3);
      e.def.shoot(e, t);
    }
  },
  // ghosts drift through you and blink behind you
  haunter(e, dt, t) {
    if (!t) return;
    e.alpha = 0.55 + 0.35 * Math.sin(e.age * 3);
    toward(e, t.x, t.y, e.def.speed * e.speedK, dt);
    if (e.cool <= 0 && Math.abs(t.x - e.x) > 50) {
      e.cool = e.def.cool;
      const w = G.world, nx = clampX(t.x - (t.facing || 1) * 34), ny = t.y;
      w.spawnFx("spawn/poof", e.x, e.y, { palette: PAL.ice }, { prio: 0 });
      e.x = nx;
      e.y = ny;
      w.spawnFx("arcane/blink-in", e.x, e.y, { actor: e.snapshot() }, { prio: 0 });
      sfx("magic", 0.4, 0.7);
    }
  },
  // frogs leap at you
  leaper(e, dt, t) {
    if (!t) return;
    e.facing = Math.sign(t.x - e.x) || e.facing;
    if (e.z <= 0 && e.cool <= 0) {
      e.cool = e.def.cool * rnd(0.8, 1.3);
      e.vz = 190;
      e.leap = [(t.x - e.x) / 0.75, (t.y - e.y) / 0.75];
      sfx("water", 0.3, 1.8);
    }
    if (e.z > 0 && e.leap) {
      e.x = clampX(e.x + e.leap[0] * dt);
      e.y = clampY(e.y + e.leap[1] * dt);
    } else if (e.leap) {
      G.world.spawnFx("water/splash", e.x, e.y, { palette: e.def.splash ?? PAL.water }, { prio: 0 });
      aoe(e, e.x, e.y, 18, 1, { team: "enemy", kb: 100 });
      e.leap = null;
    }
  },
  // snakes coil, then strike in a straight line
  slither(e, dt, t) {
    if (!t) return;
    e.dash = (e.dash ?? rnd(0.6, 1.4)) - dt;
    if (e.dash > 0) toward(e, t.x + (Math.sign(e.x - t.x) || 1) * 50, t.y, e.def.speed * 0.4 * e.speedK, dt);
    else {
      if (!e.dashV) {
        const dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy) || 1;
        e.dashV = [(dx / d) * 170, (dy / d) * 110];
        e.facing = Math.sign(dx) || 1;
      }
      e.x = clampX(e.x + e.dashV[0] * dt);
      e.y = clampY(e.y + e.dashV[1] * dt);
      if (e.dash < -0.45) {
        e.dash = rnd(0.8, 1.6);
        e.dashV = null;
      }
    }
  },
  // jellyfish drift and pulse lightning
  pulser(e, dt, t) {
    if (!t) return;
    toward(e, t.x + Math.sin(e.age * 0.7 + e.seed) * 40, t.y, e.def.speed * e.speedK, dt);
    if (e.cool <= 0 && Math.hypot(t.x - e.x, t.y - e.y) < 70) {
      e.cool = e.def.cool;
      const x = e.x, y = e.y;
      G.world.telegraph(x, y, 34, 0.8, () => {
        if (e.dead) return;
        G.world.spawnFx("lightning/thunderclap", x, y, { reach: 52 }, { prio: 1, speed: 1.3 });
        sfx("zap");
        aoe(e, x, y, 36, 1, { team: "enemy", elem: "shock", kb: 120, status: ["shock", 1.5] });
      }, "#7cc8ff");
    }
  },
  // turrets stand still and shoot
  turret(e, dt, t) {
    if (!t) return;
    e.facing = Math.sign(t.x - e.x) || 1;
    if (e.cool <= 0) {
      e.cool = e.def.cool * rnd(0.8, 1.2);
      e.def.shoot(e, t);
    }
  },
};

// ---- the shots critters fire
function fireAt(e, t, o) {
  const x = e.x + e.facing * (o.lx ?? 10), z = o.z ?? 24, d = Math.hypot(t.x - x, (t.y - e.y) * 1.2) || 1;
  const vx = ((t.x - x) / d) * o.speed, vy = ((t.y - e.y) / d) * o.speed * 0.8;
  G.world.add(new Projectile({ x, y: e.y + 1, z, vx, vy, team: "enemy", owner: e, fxId: o.fx, fxOpts: o.opts, dmg: o.dmg ?? 1, elem: o.elem ?? "phys", kind: o.kind ?? "flash", life: 3.5, h: 10, status: o.status, r: o.r ?? 4, homing: o.homing, onExpire: o.onExpire }));
  sfx(o.sfx ?? "magic", 0.4, o.pitch ?? 1);
}

// ---- the bestiary (hp at depth 1; scaled by the run)
export const ENEMIES = {
  slime: { name: "SLIME", type: "critter", fx: "critters/slime", hp: 26, speed: 26, r: 9, h: 14, ai: "crawler", contact: 1, coins: [1, 2], death: "poison" },
  magma: { name: "MAGMA SLIME", type: "critter", fx: "critters/slime", opts: { palette: ["#1a0a0e", "#4a1118", "#8c1d1c", "#cc3a1a", "#f2701f", "#ffae35", "#ffe27a"] }, hp: 34, speed: 24, r: 9, h: 14, ai: "crawler", contact: 1, coins: [1, 3], death: "fire", immune: ["burn"], trail: "burn" },
  frostslime: { name: "FROST SLIME", type: "critter", fx: "critters/slime", opts: { palette: PAL.ice.slice(0, 7) }, hp: 34, speed: 28, r: 9, h: 14, ai: "crawler", contact: 1, coins: [1, 3], death: "ice", immune: ["freeze", "slow"], touchStatus: ["slow", 2] },
  voltslime: { name: "VOLT SLIME", type: "critter", fx: "critters/slime", opts: { palette: PAL.electric }, hp: 36, speed: 30, r: 9, h: 14, ai: "crawler", contact: 1, coins: [1, 3], death: "shock", immune: ["shock"], touchStatus: ["shock", 1.5] },
  bat: { name: "BAT", type: "critter", fx: "critters/bat", hp: 16, speed: 70, r: 8, h: 40, yoff: -26, fly: true, ai: "swooper", contact: 1, coins: [0, 1], death: "phys" },
  snowbat: { name: "FROST BAT", type: "critter", fx: "critters/bat", opts: { palette: PAL.ice.slice(0, 7), eyes: ["#0c1430", "#58b4ec", "#d8f4ff", "#ffffff"] }, hp: 20, speed: 80, r: 8, h: 40, yoff: -26, fly: true, ai: "swooper", contact: 1, coins: [0, 2], death: "ice", touchStatus: ["slow", 2] },
  skull: { name: "BURNING SKULL", type: "critter", fx: "critters/flying-skull", opts: { hover: 24 }, hp: 22, speed: 40, r: 8, h: 60, fly: true, ai: "floater", cool: 2.4, coins: [1, 2], death: "fire", immune: ["burn"], shoot: (e, t) => fireAt(e, t, { fx: "fire/fireball", opts: { radius: 3 }, speed: 95, z: 30, elem: "fire", status: ["burn", 2], sfx: "fire" }) },
  eye: { name: "WATCHER", type: "critter", fx: "critters/eyeball", opts: { hover: 22 }, hp: 30, speed: 30, r: 9, h: 50, fly: true, ai: "floater", cool: 2.6, coins: [1, 3], death: "poison", shoot: (e, t) => fireAt(e, t, { fx: "projectiles/laser-bolt", opts: { length: 12, palette: PAL.poison }, speed: 170, z: 30, elem: "poison", kind: "zap", sfx: "laser" }) },
  drone: { name: "DRONE", type: "critter", fx: "critters/eyeball", opts: { hover: 26, flesh: ["#0c0e14", "#1c2230", "#2e3648", "#4a5468", "#6e7a90"], iris: ["#2a0c04", "#6a2c10", "#c8641a", "#ffb43c", "#fff0b0"] }, hp: 34, speed: 44, r: 9, h: 50, fly: true, ai: "floater", cool: 2.2, coins: [1, 3], death: "shock", shoot: (e, t) => fireAt(e, t, { fx: "projectiles/plasma-shot", opts: { size: 3, palette: PAL.volt }, speed: 150, z: 32, elem: "shock", kind: "zap", sfx: "laser", pitch: 0.7 }) },
  wisp: { name: "WISP", type: "critter", fx: "critters/wisp", opts: { hover: 20 }, hp: 20, speed: 46, r: 7, h: 46, fly: true, ai: "floater", cool: 2.4, coins: [1, 2], death: "shock", shoot: (e, t) => fireAt(e, t, { fx: "projectiles/plasma-shot", opts: { size: 3, palette: PAL.cyber }, speed: 120, z: 24, elem: "arcane", sfx: "magic" }) },
  icewisp: { name: "RIME WISP", type: "critter", fx: "critters/wisp", opts: { hover: 22, palette: PAL.ice.slice(0, 7) }, hp: 24, speed: 46, r: 7, h: 46, fly: true, ai: "floater", cool: 2.2, coins: [1, 2], death: "ice", shoot: (e, t) => fireAt(e, t, { fx: "ice/ice-lance", opts: { length: 20 }, speed: 150, z: 26, elem: "ice", status: ["slow", 2], sfx: "ice" }) },
  holywisp: { name: "CHERUB", type: "critter", fx: "critters/wisp", opts: { hover: 22, palette: PAL.holy.slice(0, 7) }, hp: 28, speed: 50, r: 7, h: 46, fly: true, ai: "floater", cool: 2.0, coins: [1, 3], death: "holy", shoot: (e, t) => fireAt(e, t, { fx: "fire/fireball", opts: { radius: 3, palette: ["#2a1c08", "#5a3e10", "#9a6c18", "#d8a428", "#ffd84a", "#fff09a", "#fffbe6", "#ffffff", "#ffffff"] }, speed: 120, z: 26, elem: "holy", sfx: "holy", homing: 1.2 }) },
  ghost: { name: "SHADE", type: "critter", fx: "critters/ghost", hp: 26, speed: 34, r: 8, h: 40, fly: true, ai: "haunter", cool: 4, contact: 1, touchStatus: ["curse", 3], coins: [1, 2], death: "shadow" },
  frostghost: { name: "FROST SHADE", type: "critter", fx: "critters/ghost", opts: { palette: PAL.ice.slice(0, 7) }, hp: 30, speed: 36, r: 8, h: 40, fly: true, ai: "haunter", cool: 3.6, contact: 1, touchStatus: ["slow", 2], coins: [1, 3], death: "ice" },
  frog: { name: "BOG FROG", type: "critter", fx: "critters/frog", hp: 30, speed: 30, r: 9, h: 14, ai: "leaper", cool: 1.8, coins: [1, 2], death: "poison" },
  snake: { name: "VIPER", type: "critter", fx: "critters/snake", hp: 22, speed: 60, r: 10, h: 10, ai: "slither", contact: 1, touchStatus: ["poison", 3], coins: [1, 2], death: "poison" },
  jelly: { name: "STORM JELLY", type: "critter", fx: "critters/jellyfish", hp: 32, speed: 22, r: 9, h: 50, yoff: -24, fly: true, ai: "pulser", cool: 3, coins: [1, 3], death: "shock" },
  butterfly: { name: "GLAMOUR MOTH", type: "critter", fx: "critters/butterfly", opts: { palette: PAL.neon.slice(0, 7) }, hp: 18, speed: 50, r: 8, h: 40, yoff: -22, fly: true, ai: "swooper", contact: 1, touchStatus: ["charm", 1.6], coins: [1, 2], death: "holy" },

  skeleton: { name: "SKELETON", type: "vessel", pal: VP.bone, guard: { ...READY, weapon: "sword", fx: 12, fy: -21, sa: -0.85 }, hp: 38, speed: 34, ai: "brawler", range: 44, moves: [SLASH], cool: 1.3, coins: [1, 3], death: "phys" },
  cultist: { name: "CULTIST", type: "vessel", pal: VP.cult, guard: { ...READY, fx: 9, fy: -19, bx: 8, by: -20 }, hp: 32, speed: 30, ai: "caster", moves: [HEX, HEX, MISSILES], cool: 2.6, coins: [2, 3], death: "shadow" },
  graveknight: { name: "GRAVE KNIGHT", type: "vessel", pal: VP.grave, guard: { ...READY, weapon: "greatsword", fx: 10, fy: -19, sa: 1.2 }, hp: 120, speed: 30, ai: "brawler", range: 52, moves: [CLEAVE, SCYTHE], cool: 1.2, coins: [5, 8], death: "shadow", heavy: true, elite: true },
  spearman: { name: "DROWNED", type: "vessel", pal: VP.drowned, guard: { ...READY, weapon: "spear", fx: 10, fy: -20, sa: 1.4 }, hp: 44, speed: 34, ai: "brawler", range: 64, moves: [THRUST], cool: 1.4, coins: [1, 3], death: "phys" },
  tidecaller: { name: "TIDECALLER", type: "vessel", pal: VP.drowned, guard: { ...READY, fx: 9, fy: -19, bx: 8, by: -20 }, hp: 130, speed: 28, ai: "caster", moves: [{ ...HEX, events: [ev(0, (a) => geyserAt(a, G.world.player))] }], cool: 2.2, coins: [5, 8], death: "phys", elite: true },
  frostknight: { name: "RIME KNIGHT", type: "vessel", pal: VP.frost, guard: { ...READY, weapon: "spear", fx: 10, fy: -20, sa: 1.4 }, hp: 50, speed: 34, ai: "brawler", range: 56, moves: [SWEEP], cool: 1.4, coins: [2, 3], death: "ice" },
  yeti: { name: "FROST TITAN", type: "vessel", pal: VP.yeti, guard: { ...READY, weapon: "hammer", fx: 10, fy: -19, sa: 1.2 }, hp: 150, speed: 28, ai: "brawler", range: 58, moves: [SMASH, BOULDER], cool: 1.5, coins: [5, 9], death: "ice", heavy: true, elite: true },
  gunner: { name: "GUNNER", type: "vessel", pal: VP.iron, guard: PISTOL_REST, hp: 36, speed: 34, ai: "gunner", range: 110, moves: [GUNSHOT, GUNSHOT, PISTOLS], cool: 1.6, coins: [1, 3], death: "shock" },
  rocketeer: { name: "BOMBARDIER", type: "vessel", pal: VP.iron, guard: { ...READY, weapon: "launcher", two: true, sa: -1, fx: 9, fy: -19 }, hp: 46, speed: 26, ai: "gunner", range: 140, moves: [ROCKET], cool: 2.6, coins: [2, 4], death: "fire" },
  mechbrute: { name: "IRON HULK", type: "vessel", pal: VP.volt, guard: { ...READY, weapon: "hammer", fx: 10, fy: -19, sa: 1.2 }, hp: 170, speed: 30, ai: "brawler", range: 58, moves: [{ ...SMASH, opts: { palette: PAL.electric }, hits: [{ ...SMASH.hits[0], elem: "shock", status: ["shock", 2] }] }], cool: 1.4, coins: [6, 10], death: "shock", heavy: true, elite: true, aura: "lightning/electrified" },
  ghoul: { name: "GHOUL", type: "vessel", pal: { ...VP.bone, A: "#a8b49a", B: "#7c8a6c", C: "#56624a", D: "#38402e", eye: "#9cff5a" }, guard: { ...READY, weapon: "claw", fx: 12, fy: -22 }, hp: 34, speed: 44, ai: "brawler", range: 40, moves: [CLAW], cool: 1.1, coins: [1, 3], death: "poison" },
  cutthroat: { name: "CUTTHROAT", type: "vessel", pal: VP.drowned, guard: { ...READY, weapon: "dagger", fx: 12, fy: -20 }, hp: 36, speed: 48, ai: "brawler", range: 44, moves: [FLURRY], cool: 1.3, coins: [1, 3], death: "water" },
  stormcaller: { name: "STORMCALLER", type: "vessel", pal: VP.volt, guard: { ...READY, fx: 9, fy: -19, bx: 8, by: -20 }, hp: 40, speed: 30, ai: "gunner", range: 100, moves: [CHAIN], cool: 2.4, coins: [2, 3], death: "shock" },
  flamer: { name: "SCORCHER", type: "vessel", pal: VP.iron, guard: { ...READY, weapon: "launcher", two: true, sa: -1, fx: 9, fy: -19 }, hp: 48, speed: 30, ai: "gunner", range: 80, moves: [FLAME], cool: 2.2, coins: [2, 4], death: "fire", immune: ["burn"] },
  lasher: { name: "FLAGELLANT", type: "vessel", pal: VP.seraph, guard: { ...READY, weapon: "handle", fx: 12, fy: -20 }, hp: 46, speed: 38, ai: "brawler", range: 80, moves: [WHIP], cool: 1.4, coins: [2, 3], death: "holy" },
  archer: { name: "SERAPH ARCHER", type: "vessel", pal: VP.seraph, guard: { ...READY, weapon: "bow", sa: -0.4, fx: 12, fy: -20, bx: 6, by: -17 }, hp: 40, speed: 36, ai: "gunner", range: 130, moves: [ARROW], cool: 1.8, coins: [2, 3], death: "holy" },
  seraph: { name: "SERAPH", type: "vessel", pal: VP.seraph, guard: { ...READY, weapon: "sword", fx: 12, fy: -21, sa: -0.85 }, hp: 56, speed: 38, ai: "brawler", range: 50, moves: [HOLYSLASH], cool: 1.2, coins: [2, 4], death: "holy", halo: true },
  paladin: { name: "PALADIN", type: "vessel", pal: VP.paladin, guard: { ...READY, weapon: "greatsword", fx: 10, fy: -19, sa: 1.2 }, hp: 190, speed: 30, ai: "brawler", range: 54, moves: [CLEAVE, SMITE], cool: 1.2, coins: [6, 10], death: "holy", heavy: true, elite: true, halo: true },
  priest: { name: "ZEALOT", type: "vessel", pal: VP.seraph, guard: { ...READY, fx: 9, fy: -19, bx: 8, by: -20 }, hp: 40, speed: 30, ai: "caster", moves: [SMITE], cool: 2.8, coins: [2, 3], death: "holy", halo: true },
};

function geyserAt(a, t) {
  if (!t) return;
  const x = t.x, y = t.y;
  G.world.spawnFx("water/ripples", x, y, {}, { layer: "floor", life: 1.1, prio: 0 });
  G.world.telegraph(x, y, 24, 1.1, () => {
    G.world.spawnFx("water/geyser", x, y, { height: 60 }, { prio: 1, speed: 1.6 });
    sfx("water", 1.2, 0.7);
    G.world.after(0.7, () => aoe(a, x, y, 24, 2, { team: "enemy", kz: 200, kb: 40, elem: "water" }));
  }, "#36a2e0");
}

// ---- deaths, by element
const DEATH = {
  phys: (e) => (e.type === "vessel" ? ["spawn/disintegrate", { accent: ["#ffffff", "#c8d4e8", "#8a9ab8"] }] : ["spawn/poof", {}]),
  fire: () => ["spawn/dissolve-burn", {}],
  ice: () => ["spawn/shatter-death", {}],
  shock: () => ["spawn/disintegrate", {}],
  shadow: () => ["spawn/soul-rise", { palette: PAL.arcane }],
  holy: () => ["spawn/soul-rise", { palette: PAL.holy }],
  poison: (e) => (e.type === "critter" ? ["nature/acid-splash", {}] : ["spawn/dissolve-burn", { palette: PAL.poison }]),
  water: (e) => (e.type === "vessel" ? ["spawn/disintegrate", {}] : ["water/splash", {}]),
  arcane: () => ["spawn/disintegrate", { accent: ["#ffffff", "#ecc8ff", "#9a48ec"] }],
  nature: () => ["spawn/dissolve-burn", { palette: PAL.leaf }],
};

function enemyDeath(e, info) {
  const w = G.world, elem = info.elem && info.elem !== "phys" ? info.elem : e.def.death ?? "phys";
  const [id, opts] = (DEATH[elem] ?? DEATH.phys)(e);
  if (id.startsWith("spawn/") && id !== "spawn/poof") w.add(new Corpse(e, id, opts, { fadeBody: id === "spawn/soul-rise" ? 0.9 : 0 }));
  else {
    w.spawnFx(id, e.x, e.y, opts, { prio: 1 });
    if (e.type === "critter") w.add(new Corpse(e, "spawn/poof", {}, { fadeBody: 0.15 }));
  }
  e.gone = true;
  e.perf?.cancel(true);
  sfx("die", 0.6, e.def.elite ? 0.6 : 1);
  if (e.def.elite) {
    w.hitstop(0.12);
    w.shake(4, 0.4);
  }
  G.run?.dropLoot(e);
  G.room?.onEnemyDeath?.(e);
}

// ---- the two bodies an enemy can have
function enemyTick(e, dt) {
  if (e.spawnT > 0) {
    e.spawnT -= dt;
    e.alpha = e.spawnT > 0 ? 0 : e.baseAlpha;
    e.hittable = e.spawnT <= 0;
    return false;
  }
  if (e.contactCd > 0) e.contactCd -= dt;
  if (e.cool > 0) e.cool -= dt * (e.st.rage || e.enraged ? 1.6 : 1);
  if (e.stopped) {
    if (e.perf && !e.perf.m.armor) e.perf = null;
    return false;
  }
  if (e.stun > 0 && !e.armored) {
    if (e.perf) e.perf = null;
    return false;
  }
  if (e.def.trail && e.age % 0.6 < dt && e.type === "critter") G.world.spawnFx("fire/candle", e.x, e.y, { palette: PAL.fire }, { life: 1, prio: 0, layer: "floor" });
  return true;
}
function targetOf(e) {
  const w = G.world;
  if (e.st.charm) return w.ents.find((o) => o.team === "enemy" && o !== e && !o.dead && o.hittable) ?? null;
  const p = w.player;
  return p && !p.dead ? p : null;
}
function contact(e) {
  const p = G.world.player;
  if (!e.def.contact || !p || e.contactCd > 0 || e.st.charm || e.spawnT > 0) return;
  if (Math.abs(p.x - e.x) < e.r + p.r - 2 && Math.abs(p.y - e.y) < 7) {
    if (damage(p, e.def.contact, { src: e, status: e.def.touchStatus })) e.contactCd = 1;
  }
}

class EnemyVessel extends Vessel {
  constructor(def, o) {
    super({ team: "enemy", pal: vesselPal(def.pal), base: def.guard, ...o });
    this.def = def;
    this.type = "vessel";
    this.cool = rnd(0.6, 1.4);
    this.seed = Math.random() * 10;
    this.lane = rnd(-6, 6);
    this.baseOutline = def.elite ? GOLD : undefined;
    this.outline = this.baseOutline;
    this.outlineK = 0.5;
    this.baseAlpha = 1;
    this.heavy = !!def.heavy;
    this.kbResist = def.heavy ? 0.35 : 1;
    this.eyeK = 1;
    if (def.aura) this.aura = G.world.spawnFx(def.aura, this.x, this.y, { actor: this.snapshot() }, { follow: this, prio: 1 });
  }
  get armored() {
    return (this.perf && this.perf.m.armor && !this.perf.done) || (this.heavy && this.perf && this.perf.t < 0.5);
  }
  attack(m) {
    this.perform(m, { speed: this.enraged ? 1.25 : 1 });
    this.cool = this.def.cool * rnd(0.85, 1.3);
    if (this.perf.t < -0.2) {
      const [x] = this.perf.at(0, 0);
      G.world.spawnFx("impacts/hit-flash", x, this.y, { palette: ["#3a0a14", "#a01824", "#ff5a50", "#ffd8cc", "#ffffff"] }, { follow: this, prio: 0, life: 0.2 });
    }
  }
  idle(dt) {
    this.facing = this.facing || 1;
  }
  update(dt) {
    this.baseUpdate(dt);
    if (this.dead) return;
    this.moving = false;
    if (!enemyTick(this, dt)) return;
    if (this.perf) {
      this.perf.update(dt * this.speedK);
      this.outline = this.perf.t < 0 ? RED : this.baseOutline;
      this.outlineK = this.perf.t < 0 ? 0.5 + 0.4 * (Math.floor(this.perf.t * 16) & 1) : 0.5;
      if (this.perf.done) {
        this.perf = null;
        this.outline = this.baseOutline;
      }
      return;
    }
    AI[this.def.ai](this, dt, targetOf(this));
    contact(this);
  }
  onMoveHit(h, perf) {
    return resolveMoveHit(this, h, perf);
  }
  drawExtra(frame) {
    if (this.def.halo && !this.dead && this.alpha !== 0) {
      this.haloFx ??= G.world.spawnFx("holy/halo", this.x, this.y, { actor: this.snapshot() }, { follow: this, prio: 1, oy: 0 });
    }
  }
  onDeath(info) {
    if (this.aura) G.world.fx.stop(this.aura);
    if (this.haloFx) G.world.fx.stop(this.haloFx);
    enemyDeath(this, info);
  }
}

class EnemyCritter extends Critter {
  constructor(def, o) {
    super({ team: "enemy", fxId: def.fx, fxOpts: def.opts, yoff: def.yoff ?? 0, fly: !!def.fly, ...o });
    this.def = def;
    this.type = "critter";
    this.cool = rnd(0.8, 2);
    this.seed = Math.random() * 10;
    this.baseAlpha = 1;
    this.heavy = false;
    this.shadow = def.fly ? 6 : 8;
  }
  get armored() {
    return false;
  }
  update(dt) {
    this.baseUpdate(dt);
    if (this.dead) return;
    if (!enemyTick(this, dt)) return;
    if (this.st.confuse) {
      this.x = clampX(this.x + Math.sin(this.age * 5) * 30 * dt);
      return;
    }
    AI[this.def.ai](this, dt, targetOf(this));
    contact(this);
  }
  onDeath(info) {
    enemyDeath(this, info);
  }
}

/** Make an enemy of kind `id` at (x, y), scaled for depth `lvl`. elite: a golden champion. */
export function makeEnemy(id, x, y, lvl = 1, elite = false) {
  const base = ENEMIES[id];
  const def = elite && !base.elite ? { ...base, elite: true } : base;
  const hpK = (1 + (lvl - 1) * 0.28) * (elite && !base.elite ? 2.4 : 1);
  const o = { x, y, hp: def.hp * hpK, maxhp: def.hp * hpK, r: def.r ?? 7, h: def.h ?? 36, immune: def.immune, kind: id, facing: x > 160 ? -1 : 1 };
  const e = def.type === "vessel" ? new EnemyVessel(def, o) : new EnemyCritter(def, o);
  e.lvl = lvl;
  if (elite) {
    e.outline = e.baseOutline = GOLD;
    e.dmgTaken = 0.9;
    if (def.type === "critter") {
      e.tint = 0xff4ad8ff >>> 0;
      e.tintK = 0.15;
    }
    applyStatus(e, "rage", 9999);
  }
  return e;
}

/** Bring an enemy in with a flourish: the biome's own way of summoning. */
export function summon(e, style = "portal") {
  const w = G.world;
  e.spawnT = 0.75;
  e.hittable = false;
  e.alpha = 0;
  const big = e.def.elite;
  switch (style) {
    case "rise": w.spawnFx(e.type === "vessel" ? "shadow/shadow-tendrils" : "spawn/poof", e.x, e.y, e.type === "vessel" ? { palette: PAL.shadow } : {}, { prio: 1, speed: 1.6 }); break;
    case "splash": w.spawnFx("water/splash", e.x, e.y, {}, { prio: 1 }); break;
    case "frost": w.spawnFx("ice/snowflake-burst", e.x, e.y, {}, { prio: 1 }); break;
    case "warp": if (e.type === "vessel") { w.spawnFx("scifi/warp-in", e.x, e.y, { actor: e.snapshot() }, { prio: 1, flip: e.facing < 0 }); e.spawnT = 1.4; } else w.spawnFx("scifi/teleporter-pad", e.x, e.y, {}, { prio: 0, life: 0.8, layer: "floor" }); break;
    case "holy": w.spawnFx("holy/holy-pillar", e.x, e.y, { shafts: 4 }, { prio: 1, speed: 1.5 }); break;
    default: w.spawnFx("spawn/spawn-portal", e.x, e.y, { width: big ? 1 : 0.7 }, { prio: 1, speed: 1.6 });
  }
  sfx("spawn", 0.6);
  return w.add(e);
}

export { AI, VP, toward, geyserAt, STATUS, chance, FLOOR_TOP, FLOOR_BOT };
