// Boons: the gifts you pick on the climb. Each hangs a hook on the fight and shows itself with a pixelfx effect.

import { PAL } from "../engine/pfx.js";
import { G, sfx, chance, rnd, pick } from "./ctx.js";
import { applyStatus, damage, aoe, inRadius, has } from "./combat.js";
import { Projectile } from "./entity.js";
import { who } from "./run.js";

export const ELEM_PAL = {
  fire: PAL.fire, ice: PAL.ice, shock: PAL.electric, shadow: PAL.arcane, holy: PAL.holy, poison: PAL.poison,
  water: PAL.water, arcane: PAL.neon, phys: PAL.metal, blood: PAL.blood, tech: PAL.cyber, nature: PAL.leaf,
};
export const ELEM_NAME = { fire: "EMBER", ice: "RIME", shock: "STORM", shadow: "VOID", holy: "DAWN", poison: "BLIGHT", water: "TIDE", arcane: "ARCANA", phys: "IRON", blood: "BLOOD", tech: "FORGE", nature: "THORN" };

// the player a boon acts through when it isn't tied to one: the first still standing
const P = () => G.run?.alive()[0] ?? G.world.player;
const proc = (e, amt, o) => damage(e, amt, { fromPlayer: true, proc: true, noCrit: true, ...o });
const nearestFoe = (x, y, r = 140) => G.world.nearest(x, y, "player", r);
const every = (n) => {
  let c = 0;
  return () => ++c % n === 0;
};

export const BOONS = [
  // ---- ember
  { id: "kindle", name: "KINDLED EDGE", elem: "fire", rarity: "common", desc: "HITS HAVE A 25% CHANCE TO SET FOES BURNING.",
    apply: (r) => r.hook("onHit", (t, d, i) => { if (!i.proc && chance(0.25)) applyStatus(t, "burn", 3, 1 + r.boons.filter((b) => b.elem === "fire").length * 0.3, P()); }) },
  { id: "pyre", name: "FUNERAL PYRE", elem: "fire", rarity: "rare", desc: "BURNING FOES EXPLODE WHEN THEY DIE.", need: (r) => r.has("kindle") || r.clsId === "mage" || r.clsId === "gunslinger",
    apply: (r) => r.hook("onKill", (e) => { if (!has(e, "burn")) return; G.world.spawnFx("explosions/small-explosion", e.x, e.y, { size: 0.45 }, { prio: 1 }); sfx("boom", 0.5); aoe(P(), e.x, e.y, 36, 14, { elem: "fire", proc: true, status: ["burn", 3], kb: 120 }); }) },
  { id: "flamewake", name: "FLAME WAKE", elem: "fire", rarity: "rare", desc: "DASHING RINGS YOU IN FIRE THAT BURNS NEARBY FOES. (3S COOLDOWN)",
    apply: (r) => { let cd = 0; r.hook("tick", (_, dt) => (cd -= dt)); r.hook("onDashEnd", (p) => { if (cd > 0) return; cd = 3; G.world.spawnFx("fire/fire-ring", p.x, p.y, { reach: 64 }, { prio: 1, speed: 1.4 }); sfx("fire"); G.world.after(0.25, () => aoe(p, p.x, p.y, 46, 10, { elem: "fire", status: ["burn", 3], proc: true, kb: 140 })); }); } },
  { id: "phoenix", name: "PHOENIX HEART", elem: "fire", rarity: "legendary", desc: "ONCE THIS CLIMB, RISE AGAIN FROM DEATH.",
    apply: (r) => (r.lives += 1) },
  // ---- rime
  { id: "frostbite", name: "FROSTBITE", elem: "ice", rarity: "common", desc: "HITS HAVE A 30% CHANCE TO CHILL, SLOWING FOES.",
    apply: (r) => r.hook("onHit", (t, d, i) => { if (!i.proc && chance(0.3)) applyStatus(t, "slow", 3, 1, P()); }) },
  { id: "shatter", name: "SHATTERPOINT", elem: "ice", rarity: "rare", desc: "CHILLED OR FROZEN FOES SHATTER ON DEATH, FREEZING THEIR NEIGHBOURS.",
    apply: (r) => r.hook("onKill", (e) => { if (!has(e, "slow") && !has(e, "freeze")) return; G.world.spawnFx("ice/ice-shatter", e.x, e.y, {}, { prio: 1 }); sfx("shatter"); for (const o of aoe(P(), e.x, e.y, 40, 10, { elem: "ice", proc: true, kb: 60 })) if (chance(0.5)) applyStatus(o, "freeze", 1.6); }) },
  { id: "novadash", name: "NOVA STEP", elem: "ice", rarity: "rare", desc: "DASHING RELEASES A FROST NOVA THAT FREEZES. (4S COOLDOWN)",
    apply: (r) => { let cd = 0; r.hook("tick", (_, dt) => (cd -= dt)); r.hook("onDash", (p) => { if (cd > 0) return; cd = 4; G.world.spawnFx("ice/frost-nova", p.x, p.y, { reach: 62 }, { prio: 1, speed: 1.2 }); sfx("ice", 1.2); G.world.after(0.35, () => { for (const e of aoe(p, p.x, p.y, 56, 8, { elem: "ice", proc: true, kb: 40 })) applyStatus(e, "freeze", 1.8); }); }); } },
  { id: "icicles", name: "ICICLE RAIN", elem: "ice", rarity: "epic", desc: "EVERY 6TH HIT DROPS AN ICICLE ON YOUR TARGET.",
    apply: (r) => { const n = every(6); r.hook("onHit", (t, d, i) => { if (i.proc || !n()) return; const x = t.x, y = t.y; G.world.spawnFx("ice/icicle-fall", x, y, {}, { prio: 1 }); G.world.after(0.95, () => { sfx("shatter", 0.6); aoe(P(), x, y, 24, 22, { elem: "ice", proc: true, status: ["freeze", 1.2, 0.5], kb: 30 }); }); }); } },
  // ---- storm
  { id: "static", name: "STATIC CHARGE", elem: "shock", rarity: "common", desc: "HITS HAVE A 20% CHANCE TO ELECTRIFY, ARCING TO NEIGHBOURS.",
    apply: (r) => r.hook("onHit", (t, d, i) => { if (!i.proc && chance(0.2)) applyStatus(t, "shock", 3, 1, P()); }) },
  { id: "chain", name: "CHAIN LIGHTNING", elem: "shock", rarity: "rare", desc: "CRITICAL HITS LEAP TO THREE MORE FOES.",
    apply: (r) => r.hook("onHit", (t, d, i) => {
      if (i.proc || !i.crit) return;
      let from = t;
      const done = new Set([t]);
      for (let k = 0; k < 3; k++) {
        const n = G.world.nearest(from.x, from.y, "player", 90, (e) => !done.has(e));
        if (!n) break;
        done.add(n);
        if (k === 0) G.world.spawnFx("lightning/chain-lightning", from.x, from.y, {}, { flip: n.x < from.x, prio: 0, speed: 1.6 });
        G.world.spawnFx("lightning/spark-arc", (from.x + n.x) / 2, (from.y + n.y) / 2, {}, { life: 0.3, prio: 0 });
        G.world.spawnFx("lightning/zap-hit", n.x, n.y - 16, {}, { prio: 0 });
        proc(n, d * 0.5, { elem: "shock", kb: 30 });
        from = n;
      }
      sfx("zap");
    }) },
  { id: "thunder", name: "THUNDER CALL", elem: "shock", rarity: "epic", desc: "EVERY 5 SECONDS, LIGHTNING STRIKES A FOE.",
    apply: (r) => { let t = 5; r.hook("tick", (_, dt) => { if ((t -= dt) > 0 || !G.room?.fighting) return; t = 5; const p = P(), e = p && pick(G.world.foes("player")); if (!e) return; const x = e.x, y = e.y; G.world.spawnFx("lightning/lightning-strike", x, y, {}, { prio: 1 }); G.world.after(0.75, () => { sfx("thunder"); G.world.shake(3, 0.2); aoe(p, x, y, 30, 26, { elem: "shock", proc: true, status: ["shock", 2], kb: 80 }); }); }); } },
  { id: "ballzap", name: "BALL LIGHTNING", elem: "shock", rarity: "rare", desc: "A BALL OF LIGHTNING FOLLOWS YOU AND ZAPS FOES NEAR IT.",
    room: (r, p) => { const orb = G.world.spawnFx("lightning/ball-lightning", p.x, p.y, {}, { follow: p, ox: -18, oy: -40, prio: 2, dz: -2 }); let t = 0; p.ballTick = (dt) => { if ((t -= dt) > 0) return; t = 1.2; const e = nearestFoe(p.x, p.y, 90); if (!e) return; G.world.spawnFx("lightning/zap-hit", e.x, e.y - 16, {}, { prio: 0 }); sfx("zap", 0.4); proc(e, 6, { elem: "shock", kb: 20, noNumber: false }); }; },
    apply: (r) => r.hook("tick", (_, dt) => { if (G.room?.fighting) for (const p of r.alive()) p.ballTick?.(dt); }) },
  // ---- void
  { id: "hex", name: "HEXBLADE", elem: "shadow", rarity: "common", desc: "HITS HAVE A 25% CHANCE TO CURSE: CURSED FOES TAKE 40% MORE DAMAGE.",
    apply: (r) => r.hook("onHit", (t, d, i) => { if (!i.proc && chance(0.25)) applyStatus(t, "curse", 4, 1, P()); }) },
  { id: "siphon", name: "SOUL SIPHON", elem: "shadow", rarity: "rare", desc: "EVERY 12 KILLS RESTORE HALF A HEART.",
    apply: (r) => { const n = every(12); r.hook("onKill", (e, i) => { if (!n()) return; const p = who(i); if (!p || p.down) return; G.world.spawnFx("shadow/life-steal", p.x, p.y, { actor: p.snapshot() }, { follow: p, prio: 1, life: 1.2 }); p.heal(1); }); } },
  { id: "skulls", name: "NECROMANTIC CHOIR", elem: "shadow", rarity: "epic", desc: "SKULLS CIRCLE YOU AND SPIT VOID FIRE AT FOES.",
    room: (r, p) => { G.world.spawnFx("shadow/necro-skulls", p.x, p.y, {}, { follow: p, prio: 2, dz: 1 }); let t = 1; p.skullTick = (dt) => { if ((t -= dt) > 0) return; t = 1.6; const e = nearestFoe(p.x, p.y, 150); if (!e) return; const d = Math.hypot(e.x - p.x, e.y - p.y) || 1; G.world.add(new Projectile({ x: p.x, y: p.y, z: 44, vx: ((e.x - p.x) / d) * 170, vy: ((e.y - p.y) / d) * 120, team: "player", owner: p, fxId: "fire/fireball", fxOpts: { radius: 2, palette: ["#140a26", "#2b1252", "#481c88", "#6b2cc0", "#9a48ec", "#c684ff", "#ecc8ff", "#ffffff", "#ffffff"] }, dmg: 9, elem: "shadow", kind: "flash", life: 1.5, homing: 2, gravity: 0, vz: -22, fromPlayer: true, status: ["curse", 3, 0.4] })); sfx("dark", 0.3, 1.5); }; },
    apply: (r) => r.hook("tick", (_, dt) => { if (G.room?.fighting) for (const p of r.alive()) p.skullTick?.(dt); }) },
  { id: "grasp", name: "GRASP OF THE DEEP", elem: "shadow", rarity: "rare", desc: "AFTER A DASH, HANDS RISE UNDER THE NEAREST FOE AND HOLD IT. (3S COOLDOWN)",
    apply: (r) => { let cd = 0; r.hook("tick", (_, dt) => (cd -= dt)); r.hook("onDashEnd", (p) => { if (cd > 0) return; const e = nearestFoe(p.x, p.y, 120); if (!e) return; cd = 3; G.world.spawnFx("shadow/grasping-hands", e.x, e.y, {}, { prio: 1 }); sfx("dark", 0.6); G.world.after(0.3, () => aoe(p, e.x, e.y, 26, 12, { elem: "shadow", stun: 1.4, kb: 0, proc: true })); }); } },
  // ---- dawn
  { id: "aegis", name: "AEGIS", elem: "holy", rarity: "rare", desc: "BEGIN EVERY ROOM WITH A DIVINE SHIELD THAT BLOCKS ONE HIT.",
    room: (r, p) => { p.shield = Math.max(p.shield, 1); p.aegisFx = G.world.spawnFx("holy/divine-shield", p.x, p.y, { actor: p.snapshot() }, { follow: p, prio: 2 }); },
    apply: (r) => { r.hook("onBlock", (p) => { if (p.aegisFx) G.world.fx.stop(p.aegisFx); p.aegisFx = null; }); } },
  { id: "smiter", name: "JUDGEMENT", elem: "holy", rarity: "rare", desc: "CRITICAL HITS HAVE A 35% CHANCE TO CALL DOWN A SMITE.",
    apply: (r) => r.hook("onHit", (t, d, i) => { if (i.proc || !i.crit || !chance(0.35)) return; const x = t.x, y = t.y; G.world.spawnFx("holy/smite", x, y, {}, { prio: 1 }); sfx("holy", 0.7); G.world.after(0.55, () => aoe(P(), x, y, 34, 24, { elem: "holy", proc: true, kb: 120, kz: 100 })); }) },
  { id: "blessing", name: "BLESSING", elem: "holy", rarity: "common", desc: "CLEARING A ROOM RESTORES HALF A HEART.",
    apply: (r) => r.hook("onRoomClear", () => r.each((p) => { if (p.hp < p.maxHp) { G.world.spawnFx("holy/blessing", p.x, p.y, { actor: p.snapshot() }, { follow: p, life: 1.6, prio: 1 }); p.heal(1, true); sfx("heal"); } })) },
  { id: "halo", name: "UNBROKEN HALO", elem: "holy", rarity: "epic", desc: "+35% DAMAGE WHILE YOUR HEARTS ARE FULL.",
    room: (r, p) => { r.haloFx = G.world.spawnFx("holy/halo", p.x, p.y, { actor: p.snapshot() }, { follow: p, prio: 2 }); },
    apply: (r) => r.hook("preHit", (t, d, i) => { const p = who(i); return p && p.hp >= p.maxHp ? d * 1.35 : d; }) },
  { id: "grace", name: "HEALING GRACE", elem: "holy", rarity: "common", desc: "+1 HEART AND HEAL FULLY.",
    apply: (r) => { for (const p of r.players) { p.maxHp += 2; if (!p.down) p.hp = p.maxHp; } } },
  // ---- blight / thorn
  { id: "venom", name: "VENOM", elem: "poison", rarity: "common", desc: "HITS HAVE A 30% CHANCE TO POISON.",
    apply: (r) => r.hook("onHit", (t, d, i) => { if (!i.proc && chance(0.3)) applyStatus(t, "poison", 4, 1 + r.boons.filter((b) => b.elem === "poison").length * 0.3, P()); }) },
  { id: "spores", name: "SPORE BLOOM", elem: "poison", rarity: "rare", desc: "FOES THAT DIE POISONED BURST INTO A CLOUD OF SPORES.",
    apply: (r) => r.hook("onKill", (e) => { if (!has(e, "poison")) return; G.world.spawnFx("nature/spore-burst", e.x, e.y, {}, { prio: 1, speed: 1.4 }); sfx("poison"); G.world.after(0.5, () => { for (const o of aoe(P(), e.x, e.y, 46, 6, { elem: "poison", proc: true, kb: 30 })) applyStatus(o, "poison", 4); }); }) },
  { id: "thorns", name: "BRIAR SKIN", elem: "nature", rarity: "rare", desc: "WHEN YOU ARE HURT, THORNS ERUPT ON BOTH SIDES OF YOU.",
    apply: (r) => r.hook("onHurt", (p) => { for (const f of [1, -1]) G.world.spawnFx("nature/thorns", p.x + f * 6, p.y, { count: 4 }, { flip: f < 0, prio: 1 }); G.world.after(0.3, () => { aoe(p, p.x, p.y, 90, 20, { ry: 14, elem: "nature", proc: true, kz: 100, status: ["bleed", 3] }); }); }) },
  { id: "roots", name: "ROOTBIND", elem: "nature", rarity: "common", desc: "AFTER A DASH, ROOTS SNARE FOES AROUND YOU. (4S COOLDOWN)",
    apply: (r) => { let cd = 0; r.hook("tick", (_, dt) => (cd -= dt)); r.hook("onDashEnd", (p) => { if (cd > 0) return; const L = inRadius("player", p.x, p.y, 70); if (!L.length) return; cd = 4; for (const e of L.slice(0, 3)) { G.world.spawnFx("nature/root-snare", e.x, e.y, {}, { prio: 1 }); applyStatus(e, "stun", 1.8); } sfx("hit", 0.6, 0.5); }); } },
  { id: "bloom", name: "VERDANT BLOOM", elem: "nature", rarity: "common", desc: "HEARTS DROP MORE OFTEN AND HEAL MORE. HEALING MAKES FLOWERS GROW.",
    apply: (r) => { r.stats.luck += 0.5; r.hook("onPickup", () => {}); } },
  // ---- arcana
  { id: "missiles", name: "ARCANE VOLLEY", elem: "arcane", rarity: "rare", desc: "EVERY 4TH ATTACK ALSO LOOSES THREE SEEKING BOLTS.",
    apply: (r) => { const n = every(4); r.hook("onAttack", (p) => { if (!n()) return; sfx("magic"); const t = G.world.nearest(p.x, p.y, "player", 200); if (t) G.world.spawnFx("projectiles/magic-missile", p.x, p.y, { reach: Math.max(40, Math.abs(t.x - p.x)) }, { flip: t.x < p.x, prio: 0 }); for (let k = 0; k < 3; k++) G.world.after(k * 0.08, () => G.world.add(new Projectile({ x: p.x, y: p.y, z: 30, vx: p.facing * 120, vy: (k - 1) * 70, team: "player", owner: p, fxId: "projectiles/energy-disc", fxOpts: { size: 5, palette: PAL.neon }, dmg: 7, elem: "arcane", kind: "flash", homing: 5, life: 1.6, fromPlayer: true, accel: 1.2 }))); }); } },
  { id: "surge", name: "MANA SURGE", elem: "arcane", rarity: "common", desc: "THE ULTIMATE FILLS 40% FASTER. USING IT RELEASES A MANA BURST.",
    apply: (r) => { r.stats.ultGain *= 1.4; r.hook("onUlt", (p) => { G.world.spawnFx("arcane/mana-burst", p.x, p.y, {}, { prio: 2 }); aoe(p, p.x, p.y, 60, 15, { elem: "arcane", proc: true, kb: 200 }); }); } },
  { id: "timestop", name: "STOPWATCH", elem: "arcane", rarity: "epic", desc: "YOUR ULTIMATE ALSO STOPS TIME FOR EVERY FOE.",
    apply: (r) => r.hook("onUlt", (p) => { G.world.spawnFx("arcane/time-stop", p.x, p.y, {}, { prio: 2, layer: "over", speed: 1.4 }); for (const e of G.world.foes("player")) applyStatus(e, "freeze", 3); sfx("magic", 1, 0.5); }) },
  { id: "runes", name: "RUNE WARD", elem: "arcane", rarity: "rare", desc: "STAND STILL A MOMENT TO DRAW A WARD: +30% DAMAGE WHILE INSIDE IT.",
    apply: (r) => {
      r.hook("tick", (_, dt) => {
        for (const p of r.alive()) {
          if (p.moving || p.dashT >= 0) p.still = 0;
          else p.still = (p.still ?? 0) + dt;
          if (p.still > 0.8 && (!p.ward || Math.hypot(p.ward.x - p.x, p.ward.y - p.y) > 40)) {
            if (p.ward?.fx) G.world.fx.stop(p.ward.fx);
            p.ward = { x: p.x, y: p.y, fx: G.world.spawnFx("arcane/rune-circle", p.x, p.y, {}, { layer: "floor", life: 6, prio: 1 }) };
            sfx("magic", 0.4, 0.8);
          }
          if (p.ward && p.ward.fx?.dead) p.ward = null;
        }
      });
      r.hook("preHit", (t, d, i) => { const p = who(i); return p?.ward && Math.hypot(p.ward.x - p.x, (p.ward.y - p.y) * 2) < 36 ? d * 1.3 : d; });
    } },
  // ---- tide
  { id: "tidal", name: "TIDAL FORCE", elem: "water", rarity: "rare", desc: "+60% KNOCKBACK. YOUR SPECIAL SENDS A CRASHING WAVE FORWARD.",
    apply: (r) => { r.stats.kb *= 1.6; r.hook("onSpecial", (p) => { G.world.after(0.15, () => { G.world.spawnFx("water/wave-crash", p.x + p.facing * 50, p.y, {}, { flip: p.facing < 0, prio: 1 }); sfx("water", 1.2); G.world.after(0.9, () => aoe(p, p.x + p.facing * 50, p.y, 60, 14, { elem: "water", proc: true, kb: 260 })); }); }); } },
  { id: "geyser", name: "WELLSPRING", elem: "water", rarity: "common", desc: "KILLS HAVE A 25% CHANCE TO ERUPT A GEYSER UNDER ANOTHER FOE.",
    apply: (r) => r.hook("onKill", (e) => { if (!chance(0.25)) return; const t = G.world.nearest(e.x, e.y, "player", 140, (o) => o !== e); if (!t) return; const x = t.x, y = t.y; G.world.spawnFx("water/geyser", x, y, { height: 60 }, { prio: 1, speed: 1.8 }); G.world.after(0.65, () => aoe(P(), x, y, 24, 16, { elem: "water", proc: true, kz: 220 })); }) },
  { id: "bubble", name: "BUBBLE BARRIER", elem: "water", rarity: "common", desc: "EVERY 15 SECONDS IN A FIGHT, BUBBLES GATHER INTO A SHIELD.",
    apply: (r) => { let t = 15; r.hook("tick", (_, dt) => { if (!G.room?.fighting || r.alive().every((p) => p.shield > 0)) return; if ((t -= dt) > 0) return; t = 15; for (const p of r.alive()) if (!p.shield) { p.shield = 1; G.world.spawnFx("water/bubbles", p.x, p.y, {}, { follow: p, life: 2, prio: 1 }); } sfx("water", 0.5, 1.6); }); } },
  // ---- iron / blood
  { id: "bleed", name: "BLOODLETTER", elem: "blood", rarity: "common", desc: "HITS HAVE A 30% CHANCE TO MAKE FOES BLEED.",
    apply: (r) => r.hook("onHit", (t, d, i) => { if (!i.proc && chance(0.3)) applyStatus(t, "bleed", 4, 1, P()); }) },
  { id: "berserk", name: "BERSERKER", elem: "blood", rarity: "rare", desc: "+45% DAMAGE WHILE BELOW HALF YOUR HEARTS.",
    apply: (r) => { r.hook("preHit", (t, d, i) => { const p = who(i); return p && p.hp * 2 <= p.maxHp ? d * 1.45 : d; }); r.hook("tick", () => { for (const p of r.alive()) { if (p.hp * 2 <= p.maxHp && !p.st.rage) applyStatus(p, "rage", 9999); if (p.hp * 2 > p.maxHp && p.st.rage) delete p.st.rage; } }); } },
  { id: "fleet", name: "FLEETFOOT", elem: "phys", rarity: "common", desc: "+20% MOVE SPEED, +25% DASH DISTANCE.",
    apply: (r) => { r.stats.speed *= 1.2; r.stats.dashLen *= 1.25; } },
  { id: "keen", name: "KEEN EDGE", elem: "phys", rarity: "common", desc: "+12% CRITICAL HIT CHANCE.",
    apply: (r) => (r.stats.crit += 0.12) },
  { id: "heavy", name: "HEAVY HANDS", elem: "phys", rarity: "common", desc: "+22% DAMAGE.",
    apply: (r) => (r.stats.dmg *= 1.22) },
  { id: "swift", name: "QUICKENING", elem: "phys", rarity: "common", desc: "+18% ATTACK SPEED, SPECIAL RECHARGES 20% FASTER.",
    apply: (r) => { r.stats.atkSpeed *= 1.18; r.stats.cdr *= 0.8; } },
  { id: "combo", name: "MOMENTUM", elem: "phys", rarity: "rare", desc: "+1% DAMAGE FOR EVERY HIT IN YOUR COMBO, UP TO +40%.",
    apply: (r) => r.hook("preHit", (t, d) => d * (1 + Math.min(0.4, r.combo * 0.01))) },
  { id: "glass", name: "GLASS CANNON", elem: "blood", rarity: "epic", desc: "+60% DAMAGE. YOU TAKE TWICE AS MUCH DAMAGE.",
    apply: (r) => { r.stats.dmg *= 1.6; r.stats.dmgTaken *= 2; } },
  { id: "executioner", name: "EXECUTIONER", elem: "blood", rarity: "epic", desc: "FOES BELOW 25% HEALTH TAKE DOUBLE DAMAGE. CRITS DEAL TRIPLE.",
    apply: (r) => { r.stats.critMul = 3; r.hook("preHit", (t, d) => (t.hp < t.maxhp * 0.25 ? d * 2 : d)); } },
  { id: "gilded", name: "GILDED TOUCH", elem: "phys", rarity: "common", desc: "+50% COINS. CRITICAL KILLS SPILL EXTRA GOLD.",
    apply: (r) => { r.stats.coinMul *= 1.5; r.hook("onKill", (e, i) => { if (i.crit) G.world.spawnFx("spawn/coin-drop", e.x, e.y, { coins: 4 }, { prio: 0 }), (r.coins += 2); }); } },
  // ---- forge
  { id: "decoy", name: "HOLO DECOY", elem: "tech", rarity: "rare", desc: "DASHING LEAVES A HOLOGRAM THAT FOES ATTACK INSTEAD. (5S COOLDOWN)",
    apply: (r) => { let cd = 0; r.hook("tick", (_, dt) => (cd -= dt)); r.hook("onDash", (p) => { if (cd > 0) return; cd = 5; G.world.spawnFx("scifi/hologram", p.x, p.y, {}, { life: 2.5, prio: 1 }); for (const e of G.world.foes("player")) if (Math.hypot(e.x - p.x, e.y - p.y) < 120) applyStatus(e, "confuse", 2.2); sfx("laser", 0.5, 0.6); }); } },
  { id: "emp", name: "EMP CORE", elem: "tech", rarity: "rare", desc: "WHEN YOU ARE HURT, AN EMP STUNS EVERY FOE AROUND YOU.",
    apply: (r) => r.hook("onHurt", (p) => { G.world.spawnFx("scifi/emp-blast", p.x, p.y, {}, { prio: 2 }); sfx("zap", 1.2, 0.5); G.world.after(0.4, () => { for (const e of aoe(p, p.x, p.y, 90, 6, { elem: "shock", proc: true, kb: 140 })) applyStatus(e, "stun", 2); }); }) },
  { id: "disc", name: "SAWBLADE DRONE", elem: "tech", rarity: "epic", desc: "EVERY 2.5 SECONDS, A SAWBLADE FLIES AT THE NEAREST FOE, CUTTING THROUGH.",
    apply: (r) => { let t = 2.5; r.hook("tick", (_, dt) => { if (!G.room?.fighting || (t -= dt) > 0) return; t = 2.5; const p = P(), e = p && nearestFoe(p.x, p.y, 200); if (!e) return; const d = Math.hypot(e.x - p.x, e.y - p.y) || 1; G.world.add(new Projectile({ x: p.x, y: p.y, z: 22, vx: ((e.x - p.x) / d) * 260, vy: ((e.y - p.y) / d) * 160, team: "player", owner: p, fxId: "projectiles/energy-disc", fxOpts: { size: 7 }, dmg: 12, pierce: 4, elem: "phys", kind: "slash", life: 1.2, fromPlayer: true, status: ["bleed", 2, 0.5] })); sfx("laser", 0.5, 0.7); }); } },
  { id: "field", name: "FORCE FIELD", elem: "tech", rarity: "epic", desc: "GO 8 SECONDS UNHURT TO RAISE A FORCE FIELD THAT BLOCKS A HIT.",
    apply: (r) => { r.hook("onHurt", (p) => (p.fieldT = 8)); r.hook("onBlock", (p) => { if (p.fieldFx) G.world.fx.stop(p.fieldFx); p.fieldFx = null; p.fieldT = 8; }); r.hook("tick", (_, dt) => { for (const p of r.alive()) { if (p.shield > 0) continue; p.fieldT = (p.fieldT ?? 8) - dt; if (p.fieldT > 0) continue; p.fieldT = 8; p.shield = 1; p.fieldFx = G.world.spawnFx("scifi/force-field", p.x, p.y, { radius: 36 }, { follow: p, prio: 2 }); sfx("laser", 0.4, 0.4); } }); } },
  { id: "jet", name: "JETSTREAM", elem: "tech", rarity: "common", desc: "+40% DASH DISTANCE, DASHES RECHARGE FASTER AND BURN WHAT THEY PASS.",
    apply: (r) => { r.stats.dashLen *= 1.4; r.stats.dashCd *= 0.75; r.hook("onDash", (p) => { G.world.spawnFx("scifi/jetpack", p.x, p.y - 26, { length: 16 }, { follow: p, oy: -26, life: 0.3, prio: 0 }); G.world.after(0.12, () => aoe(p, p.x, p.y, 26, 5, { elem: "fire", proc: true, status: ["burn", 2], kb: 30, fx: false })); }); } },
];
export const BOON_BY_ID = Object.fromEntries(BOONS.map((b) => [b.id, b]));
export const RARITY_COLOR = { common: "#c8c0e0", rare: "#58b4ec", epic: "#c684ff", legendary: "#ffd84a" };
void rnd;
