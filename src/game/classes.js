// The six vessels you can play. Each borrows its body language from pixelfx acts (wind-up, release, recovery) and its
// punch from the library's effects; the numbers are ours.

import { PAL, READY } from "../engine/pfx.js";
import { G, sfx, clampX } from "./ctx.js";
import { fxAt, shoot, aimPoint } from "./skills.js";
import { aoe, applyStatus, damage, inRadius } from "./combat.js";

const ev = (t, fn) => ({ t, fn });
const tgt = (a, p) => [p.data.tx, p.data.ty];
/** Remember where a targeted spell lands. */
const lockOn = (range = 170, fall = 90) => (a, p) => {
  const pt = aimPoint(a, range, fall);
  p.data.tx = clampX(pt.x);
  p.data.ty = pt.y;
};

// ---------------------------------------------------------------- the knight: sword, holy
const SWORD_GUARD = { ...READY, weapon: "sword", fx: 12, fy: -21, sa: -0.85 };
const knight = {
  id: "knight", name: "KNIGHT", title: "THE OATHBOUND", cost: 0,
  desc: "SWORD AND OATH. A THREE-HIT COMBO, A DASHING STRIKE, AND A PILLAR OF HOLY LIGHT.",
  pal: { A: "#e8eef8", B: "#a9bcdc", C: "#6f84b2", D: "#45527c", E: "#8a4e3a", F: "#62362a", G: "#3e2018", J: "#2b2238", m: "#ff6a3d", eye: "#ffcf5a", k: "#120e1a" },
  ghost: "#8fb4ff", guard: SWORD_GUARD, hp: 10, speed: 74,
  combo: [
    { fx: "melee/sword-slash", from: -0.14, end: 0.44, cancel: 0.17, speed: 1.15, hits: [{ t: 0.06, x0: -4, x1: 52, dy: 13, dmg: 10, kb: 90, stop: 0.07, shake: 1 }], sfx: "swing" },
    { fx: "melee/double-slash", from: -0.12, end: 0.5, cancel: 0.27, speed: 1.15, hits: [{ t: 0.06, x0: 0, x1: 56, dy: 13, dmg: 7, kb: 40, stop: 0.04 }, { t: 0.16, x0: 0, x1: 56, dy: 13, dmg: 9, kb: 110, stop: 0.08, shake: 1 }], sfx: "swing" },
    { fx: "melee/spin-slash", from: -0.18, end: 0.62, cancel: 0.42, speed: 1.1, hits: [{ t: 0.17, x0: -52, x1: 54, dy: 16, dmg: 15, kb: 170, kz: 130, stop: 0.12, shake: 3 }], sfx: "heavy" },
  ],
  special: {
    name: "DASH STRIKE", cd: 3.2,
    move: {
      posesFrom: "moves/dash-strike", from: -0.12, end: 0.52, cancel: 0.42, speed: 1.1, armor: true, iframes: [0, 0.18],
      events: [ev(0, () => sfx("dash")), ev(0.16, (a, p) => fxAt(p, "melee/sword-slash", 116, 0, {}, { speed: 1.1 }))],
      hits: [{ t: 0.08, x0: 0, x1: 116, dy: 12, dmg: 8, kb: 30, stop: 0.03 }, { t: 0.22, x0: 100, x1: 168, dy: 15, dmg: 22, kb: 160, stop: 0.16, shake: 3, crit: true }],
    },
  },
  ult: {
    name: "HOLY SMITE",
    move: {
      posesFrom: "moves/holy-smite", from: -0.3, end: 1.0, speed: 1, armor: true, iframes: [-0.3, 1],
      events: [ev(-0.3, lockOn()), ev(0, (a, p) => { G.world.spawnFx("holy/smite", p.data.tx, p.data.ty, {}, { flip: p.facing < 0, prio: 2 }); sfx("holy"); })],
      hits: [{ t: 0.55, r: 46, at: tgt, dmg: 70, elem: "holy", kb: 200, kz: 160, stop: 0.18, shake: 5, crit: true }, { t: 0.9, r: 60, at: tgt, dmg: 15, elem: "holy", kb: 60, stop: 0.03 }],
    },
  },
  dash: { kind: "ghost" },
};

// ---------------------------------------------------------------- the brute: hammer, earth
const HAMMER_GUARD = { ...READY, weapon: "hammer", fx: 10, fy: -19, sa: 1.2, two: false };
const brute = {
  id: "brute", name: "BRUTE", title: "THE ANVIL", cost: 30,
  desc: "SLOW AND CRUSHING. A HAMMER THAT STUNS, A LEAPING GROUND POUND, AND THE EARTH ITSELF. TAKES LESS DAMAGE.",
  pal: { A: "#f6cf94", B: "#cf9150", C: "#925c2e", D: "#5c3418", E: "#566a3e", F: "#3c4a2c", G: "#26301c", J: "#2a1c14", m: "#ff4040", eye: "#ff8a2a", k: "#140c08" },
  ghost: "#ffb46a", guard: HAMMER_GUARD, hp: 12, speed: 64, armor: 0.75,
  combo: [
    { fx: "melee/uppercut", weapon: "hammer", from: -0.2, end: 0.5, cancel: 0.24, speed: 1.2, hits: [{ t: 0.076, x0: 0, x1: 44, dy: 13, dmg: 14, kb: 60, kz: 210, stun: 0.6, kind: "blunt", stop: 0.1, shake: 2 }], sfx: "heavy" },
    { fx: "melee/hammer-smash", from: -0.32, end: 0.62, cancel: 0.42, speed: 1.15, armor: true, hits: [{ t: 0.15, x0: 6, x1: 74, dy: 16, dmg: 26, kb: 200, stun: 0.7, kind: "blunt", stop: 0.16, shake: 4, status: ["stun", 0.9, 0.3] }], sfx: "heavy" },
    { fx: "melee/heavy-cleave", weapon: "hammer", from: -0.3, end: 0.8, cancel: 0.6, speed: 1.2, armor: true, hits: [{ t: 0.335, x0: -10, x1: 74, dy: 18, dmg: 32, kb: 260, kz: 120, stun: 0.8, kind: "blunt", stop: 0.2, shake: 5 }], sfx: "heavy" },
  ],
  special: {
    name: "GROUND POUND", cd: 4,
    move: {
      posesFrom: "moves/ground-pound", from: -0.16, end: 1.0, cancel: 0.85, speed: 1.2, armor: true, iframes: [0, 0.6],
      events: [ev(0, () => sfx("dash")), ev(0.62, (a, p) => { fxAt(p, "impacts/ground-slam", 0); sfx("boom", 0.7); })],
      hits: [{ t: 0.62, r: 64, lx: 0, dmg: 30, kind: "blunt", kb: 220, kz: 180, stun: 0.8, stop: 0.2, shake: 6 }],
    },
  },
  ult: {
    name: "EARTHBREAKER",
    move: {
      posesFrom: "moves/earth-stomp", from: -0.3, end: 1.2, speed: 1, armor: true, iframes: [-0.3, 1.2],
      events: [ev(-0.3, lockOn(180, 100)), ev(0.06, (a, p) => {
        G.world.spawnFx("nature/earth-spike", p.data.tx, p.data.ty, {}, { prio: 2 });
        G.world.spawnFx("explosions/dirt-explosion", p.data.tx, p.data.ty, {}, { prio: 1, delay: 0.3 });
        fxAt(p, "nature/quake", 0);
        sfx("bigboom", 0.6);
      })],
      hits: [{ t: 0.1, r: 100, lx: 0, dmg: 18, kind: "blunt", kb: 120, stun: 1, stop: 0.05, shake: 6 }, { t: 0.43, r: 44, at: tgt, dmg: 75, kind: "blunt", kz: 260, kb: 60, stun: 1.2, stop: 0.2, shake: 6, crit: true }],
    },
  },
  dash: { kind: "charge" },
};

// ---------------------------------------------------------------- the reaper: scythe, shadow
const SCYTHE_GUARD = { ...READY, weapon: "scythe", fx: 10, fy: -20, sa: 1.35 };
const SHADOW_SWEEP = ["#140a26", "#2b1252", "#481c88", "#6b2cc0", "#9a48ec", "#c684ff", "#ecc8ff"];
const reaper = {
  id: "reaper", name: "REAPER", title: "THE QUIET HARVEST", cost: 60,
  desc: "A SCYTHE THAT CURSES. HANDS FROM BELOW THAT HOLD FOES IN PLACE, AND A HUNGRY VOID. KILLS FEED THE ULTIMATE.",
  pal: { A: "#cbc3dc", B: "#8d82ab", C: "#5c507c", D: "#382e52", E: "#2c2440", F: "#1f182c", G: "#150f1e", J: "#100c18", m: "#b04aff", eye: "#c684ff", k: "#08060c" },
  ghost: "#9a48ec", guard: SCYTHE_GUARD, hp: 9, speed: 78, elem: "shadow",
  combo: [
    { fx: "melee/scythe-reap", from: -0.2, end: 0.52, cancel: 0.3, speed: 1.25, hits: [{ t: 0.14, x0: -24, x1: 62, dy: 15, dmg: 12, kb: 70, stop: 0.08, elem: "shadow", status: ["curse", 3, 0.35], shake: 1 }], sfx: "swing" },
    { fx: "melee/spear-sweep", weapon: "scythe", opts: { palette: SHADOW_SWEEP }, from: -0.2, end: 0.55, cancel: 0.32, speed: 1.3, hits: [{ t: 0.1, x0: -14, x1: 64, dy: 15, dmg: 12, kb: 90, stop: 0.07, elem: "shadow", status: ["curse", 3, 0.35] }], sfx: "swing" },
    { fx: "melee/spin-slash", weapon: "scythe", opts: { palette: SHADOW_SWEEP }, from: -0.18, end: 0.62, cancel: 0.42, speed: 1.1, hits: [{ t: 0.17, x0: -56, x1: 58, dy: 17, dmg: 17, kb: 160, kz: 110, stop: 0.12, elem: "shadow", shake: 3 }], sfx: "heavy" },
  ],
  special: {
    name: "GRASP", cd: 4,
    move: {
      posesFrom: "arcane/spell-charge", from: -0.2, end: 0.45, cancel: 0.35, speed: 1.2,
      events: [ev(-0.2, lockOn(180, 80)), ev(0, (a, p) => { G.world.spawnFx("shadow/grasping-hands", p.data.tx, p.data.ty, {}, { prio: 2 }); sfx("dark"); })],
      hits: [{ t: 0.3, r: 38, at: tgt, dmg: 16, elem: "shadow", kb: 0, stun: 1.6, stop: 0.08, status: ["curse", 4] }],
    },
  },
  ult: {
    name: "VOID MAW",
    move: {
      posesFrom: "moves/meteor-call", from: 1.2, end: 2.1, speed: 1, armor: true, iframes: [1.2, 2.1],
      events: [ev(1.2, lockOn(170, 90)), ev(1.5, (a, p) => {
        const w = G.world, x = p.data.tx, y = p.data.ty;
        w.spawnFx("shadow/black-hole", x, y + 6, {}, { life: 2.6, prio: 2 });
        sfx("dark", 1.2, 0.6);
        let n = 0;
        const pull = () => {
          for (const e of inRadius("player", x, y, 110)) {
            e.x += Math.sign(x - e.x) * Math.min(Math.abs(x - e.x), 55 * 0.1);
            e.y += Math.sign(y - e.y) * Math.min(Math.abs(y - e.y), 25 * 0.1);
            if (n % 3 === 0) damage(e, 5, { src: a, elem: "shadow", kb: 0, stun: 0.3, noStop: true, fromPlayer: true, fx: false });
          }
          if (++n < 26) w.after(0.1, pull);
          else {
            w.spawnFx("shadow/dark-explosion", x, y, {}, { prio: 2 });
            sfx("bigboom", 0.7);
            w.shake(5, 0.4);
            aoe(a, x, y, 80, 60, { elem: "shadow", kb: 220, kz: 160, stop: 0.15, status: ["curse", 5], fromPlayer: true });
          }
        };
        pull();
      })],
    },
  },
  dash: { kind: "shadow" },
};

// ---------------------------------------------------------------- the gunslinger: pistol, explosions
const PISTOL_REST = { ...READY, weapon: "pistol", sa: 0.9, fx: 10, fy: -17, bx: 7, by: -16 };
const AIM = { ...PISTOL_REST, crouch: 3, lean: 2, fx: 18, fy: -28, sa: 0, bx: 12, by: -25, ffx: 11, fbx: -9 };
const KICK = { ...AIM, lean: 0, fx: 16, fy: -33, sa: -0.45, by: -28 };
const bullet = (dmg, extra = {}) => (a, p) => {
  fxAt(p, "projectiles/muzzle-pistol", 28, -32, { height: 0 }, { prio: 1 });
  shoot(a, p, { fx: "projectiles/bullet-tracer", lx: 30, ly: -32, speed: 560, dmg, kind: "bullet", kb: 50, h: 8, life: 0.8, opts: { length: 24 }, ...extra });
  sfx("shoot", 0.8);
};
const shot = (dmg) => ({
  poses: [[0, AIM], [0.001, KICK, "snap"], [0.12, AIM], [0.3, AIM]], from: 0, end: 0.26, cancel: 0.15, speed: 1,
  events: [ev(0.0005, bullet(dmg))],
});
const gunslinger = {
  id: "gunslinger", name: "GUNSLINGER", title: "THE LAST ROUND", cost: 60,
  desc: "FIGHTS FROM RANGE. RAPID SHOTS, A POINT-BLANK SHOTGUN THAT THROWS FOES BACK, AND A ROCKET. HIGHER CRIT CHANCE.",
  pal: { A: "#f2deb0", B: "#caa670", C: "#907048", D: "#5c442c", E: "#3c5c6c", F: "#2c4452", G: "#1c2c38", J: "#20160e", m: "#3cc8ff", eye: "#4ce8d8", k: "#100c0a" },
  ghost: "#4ce8d8", guard: PISTOL_REST, hp: 8, speed: 80, crit: 0.12,
  combo: [shot(7), shot(7), { posesFrom: "moves/pistol-shots", from: 0.08, end: 0.95, cancel: 0.85, speed: 1.3, events: [0.14, 0.42, 0.7].map((t) => ev(t, bullet(7))) }],
  special: {
    name: "SCATTERSHOT", cd: 2.4,
    move: {
      poses: [[-0.1, AIM], [0, AIM], [0.001, { ...KICK, x: -5, lean: -4 }, "snap"], [0.3, AIM], [0.45, PISTOL_REST]], from: -0.1, end: 0.42, cancel: 0.32,
      events: [ev(0.0005, (a, p) => { fxAt(p, "projectiles/muzzle-shotgun", 26, -30, { height: 0 }); sfx("shoot", 1.3, 0.6); G.world.shake(3, 0.15); })],
      hits: [{ t: 0.01, x0: 8, x1: 92, dy: 22, dmg: 24, kb: 280, kz: 60, kind: "bullet", stun: 0.6, stop: 0.1, shake: 2 }],
    },
  },
  ult: {
    name: "ROCKET",
    move: {
      posesFrom: "moves/rocket-launcher", weapon: "launcher", from: 0.1, end: 1.1, speed: 1.2, armor: true, iframes: [0.1, 1.0],
      events: [ev(0.6, (a, p) => {
        fxAt(p, "projectiles/muzzle-shotgun", 34, -21, { height: 0 });
        sfx("boom", 0.5, 1.6);
        shoot(a, p, {
          fx: "projectiles/rocket", lx: 44, ly: -21, speed: 160, accel: 2.6, dmg: 20, kind: "blunt", h: 10, life: 2.5, r: 6,
          onExpire: (pr) => {
            G.world.spawnFx("explosions/big-explosion", pr.x, pr.y, {}, { prio: 2 });
            sfx("bigboom");
            G.world.shake(7, 0.6);
            G.world.hitstop(0.12);
            aoe(a, pr.x, pr.y, 84, 85, { elem: "fire", kb: 260, kz: 200, stop: 0.08, status: ["burn", 4, 0.8], fromPlayer: true });
          },
        });
      })],
    },
  },
  dash: { kind: "roll" },
};

// ---------------------------------------------------------------- the ranger: bow, nature
const BOW_REST = { ...READY, weapon: "bow", sa: -0.4, fx: 12, fy: -20, bx: 6, by: -17 };
const ranger = {
  id: "ranger", name: "RANGER", title: "THE THORNWARDEN", cost: 40,
  desc: "ARROWS THAT PIERCE. A LINE OF THORNS THAT BLEEDS, AND A RAIN OF FALLING STARS. MOVES FAST.",
  pal: { A: "#dcecb4", B: "#a0c274", C: "#628c48", D: "#38582e", E: "#6e4c2c", F: "#4c341e", G: "#302012", J: "#1a2210", m: "#ffe066", eye: "#b4ff70", k: "#0c1008" },
  ghost: "#b4e070", guard: BOW_REST, hp: 8, speed: 86,
  combo: [
    {
      posesFrom: "moves/arrow-shot", from: 0.3, end: 0.66, cancel: 0.6, speed: 1.6,
      events: [ev(0.56, (a, p) => { shoot(a, p, { fx: "projectiles/arrow", lx: 30, ly: -28, speed: 430, dmg: 11, pierce: 1, kind: "slash", h: 8, life: 1, kb: 70 }); sfx("bow"); })],
    },
    {
      posesFrom: "moves/arrow-shot", from: 0.3, end: 0.66, cancel: 0.6, speed: 1.6,
      events: [ev(0.56, (a, p) => { shoot(a, p, { fx: "projectiles/arrow", lx: 30, ly: -28, speed: 430, dmg: 11, pierce: 1, kind: "slash", h: 8, life: 1, kb: 70 }); sfx("bow"); })],
    },
    {
      posesFrom: "moves/earth-stomp", from: -0.14, end: 0.62, cancel: 0.55, speed: 1.3,
      events: [ev(0, (a, p) => { fxAt(p, "nature/vine-whip", 0, 0); sfx("swing", 1, 0.6); })],
      hits: [{ t: 0.57, x0: 40, x1: 150, dy: 10, dmg: 16, elem: "nature", kb: 200, stun: 0.5, stop: 0.08, status: ["bleed", 3, 0.5], shake: 2 }],
    },
  ],
  special: {
    name: "THORNLINE", cd: 3.2,
    move: {
      posesFrom: "moves/earth-stomp", from: -0.14, end: 0.5, cancel: 0.4, speed: 1.2,
      events: [ev(0.06, (a, p) => { fxAt(p, "nature/thorns", 14, 0, { count: 6 }); sfx("hit", 0.8, 0.6); })],
      hits: [{ t: 0.3, x0: 16, x1: 196, dy: 14, dmg: 18, elem: "nature", kb: 40, kz: 90, stun: 0.6, stop: 0.06, status: ["bleed", 4], shake: 2 }],
    },
  },
  ult: {
    name: "STARFALL",
    move: {
      posesFrom: "moves/lightning-call", from: 0.3, end: 1.2, speed: 1, armor: true, iframes: [0.3, 1.2],
      events: [ev(0.3, lockOn(200, 100)), ev(0.7, (a, p) => { G.world.spawnFx("arcane/star-fall", p.data.tx, p.data.ty, { palette: PAL.holy }, { prio: 2 }); sfx("magic", 1.2); })],
      hits: [0.9, 1.15, 1.4, 1.65].map((t, i) => ({ t: t + 0.4, r: 70, at: tgt, dmg: i === 3 ? 30 : 16, elem: "holy", kb: 50, stun: 0.5, stop: 0.04, shake: 2 })),
    },
  },
  dash: { kind: "roll" },
};

// ---------------------------------------------------------------- the mage: fire and ice
const fireBolt = (dmg, big) => (a, p) => {
  shoot(a, p, {
    fx: "fire/fireball", opts: { radius: big ? 5 : 3 }, lx: 26, ly: -22, speed: big ? 230 : 300, dmg, elem: "fire", kind: "flash", h: 10, life: 1.2,
    status: ["burn", 3, big ? 0.9 : 0.3], kb: big ? 150 : 50,
    onExpire: (pr, hit) => {
      if (big) {
        G.world.spawnFx("explosions/small-explosion", pr.x, pr.y, { size: 0.6 }, { prio: 1 });
        sfx("boom", 0.6);
        G.world.shake(3, 0.25);
        aoe(a, pr.x, pr.y, 44, dmg * 0.6, { elem: "fire", kb: 140, status: ["burn", 3], fromPlayer: true, stop: 0.05 });
      } else if (!hit) G.world.spawnFx("impacts/hit-spark", pr.x, pr.y, { palette: PAL.fire, height: pr.z }, { prio: 0 });
    },
  });
  sfx("fire", 0.8);
};
const mage = {
  id: "mage", name: "PYROMANCER", title: "THE EMBERWITCH", cost: 80,
  desc: "FIREBOLTS THAT BURN, A PIERCING ICE LANCE THAT FREEZES, AND A METEOR FROM THE SKY. BLINKS INSTEAD OF DASHING.",
  pal: { A: "#ffe8c4", B: "#eaa456", C: "#b2522e", D: "#722c20", E: "#5c2c6c", F: "#401e4c", G: "#281232", J: "#1c0c14", m: "#ffd84a", eye: "#ff9aff", k: "#100810" },
  ghost: "#ff8a2a", guard: { ...READY, fx: 9, fy: -19, bx: 8, by: -20 }, hp: 8, speed: 76, ultGain: 1.4,
  combo: [
    { posesFrom: "moves/fireball-throw", from: 0.78, end: 1.12, cancel: 1.02, speed: 1.6, events: [ev(0.95, fireBolt(9, false)), ev(0.8, (a, p) => fxAt(p, "arcane/spell-charge", 0, 0, { palette: PAL.fire }, { life: 0.25 }))] },
    { posesFrom: "moves/fireball-throw", from: 0.84, end: 1.12, cancel: 1.02, speed: 1.6, events: [ev(0.95, fireBolt(9, false))] },
    { posesFrom: "moves/fireball-throw", from: 0.7, end: 1.2, cancel: 1.1, speed: 1.3, events: [ev(0.95, fireBolt(18, true))] },
  ],
  special: {
    name: "ICE LANCE", cd: 2.6,
    move: {
      posesFrom: "moves/ice-lance-throw", from: 0.5, end: 1.0, cancel: 0.92, speed: 1.4,
      events: [ev(0.5, (a, p) => fxAt(p, "arcane/spell-charge", 0, 0, { palette: PAL.ice }, { life: 0.3 })), ev(0.8, (a, p) => {
        shoot(a, p, {
          fx: "ice/ice-lance", lx: 34, ly: -24, speed: 420, dmg: 20, elem: "ice", kind: "flash", h: 10, pierce: 3, life: 1, status: ["freeze", 1.6, 0.6], kb: 60,
          onHitFoe: (e) => { G.world.spawnFx("ice/snowflake-burst", e.x, e.y, {}, { prio: 0 }); return undefined; },
        });
        sfx("ice");
      })],
    },
  },
  ult: {
    name: "METEOR",
    move: {
      posesFrom: "moves/meteor-call", from: 0, end: 2.2, speed: 1.1, armor: true, iframes: [0, 2.2],
      events: [ev(0, (a, p) => { lockOn(200, 110)(a, p); fxAt(p, "arcane/magic-circle-cast", 0, 0, { palette: PAL.fire }); sfx("magic"); }),
        ev(1.43, (a, p) => { G.world.spawnFx("fire/meteor", p.data.tx, p.data.ty, {}, { prio: 2 }); G.world.telegraph(p.data.tx, p.data.ty, 60, 0.6, null, "#ff8a2a"); })],
      hits: [{ t: 2.06, r: 74, at: tgt, dmg: 95, elem: "fire", kb: 260, kz: 220, stun: 1, stop: 0.2, shake: 8, status: ["burn", 5], crit: true }],
    },
  },
  dash: { kind: "blink" },
};

export const CLASSES = { knight, brute, ranger, reaper, gunslinger, mage };
export const CLASS_ORDER = ["knight", "brute", "ranger", "reaper", "gunslinger", "mage"];
void applyStatus;
