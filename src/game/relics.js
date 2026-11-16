// Relics: the wardens' treasures. Only a fallen warden gives one (a choice of three, its own among them). A player
// wears up to three at once; the rest wait in their satchel for the rest of the climb, and can be swapped in at any
// time from the pause menu. Equipping applies a relic and unequipping undoes it exactly: stats are multiplied or
// added and taken back, hooks are hung on the build and taken down, hearts given and taken away.

import { hex, painterFor } from "../engine/pfx.js";
import { G, sfx } from "./ctx.js";
import { aoe, applyStatus } from "./combat.js";

export const RELIC_SLOTS = 3;

// 7 x 7 pixel icons, drawn small on the HUD and three times larger on the cards
const RELICS = [
  { id: "hollowcrown", boss: "hollowking", name: "HOLLOW CROWN", color: "#c684ff", desc: "+30% DAMAGE. EVERY KILL FILLS 5% OF YOUR ULTIMATE.",
    sprite: ["k.k.k.k", "kGkGkGk", "kGGGGGk", "kGvGvGk", "kGGGGGk", "kgggggk", ".kkkkk."], pal: { k: "#140a1c", G: "#c684ff", g: "#7a3cb0", v: "#ffe066" },
    mul: { dmg: 1.3 }, hooks: (b) => ({ onKill: () => (b.owner.ult = Math.min(100, b.owner.ult + 5)) }) },
  { id: "drownedpearl", boss: "oracle", name: "DROWNED PEARL", color: "#4fe0c8", desc: "YOUR SPECIAL RECHARGES 35% FASTER AND RELEASES A TIDE THAT THROWS FOES BACK.",
    sprite: [".kkkkk.", "kbBBBbk", "kBWBBBk", "kBBBBBk", "kbBBBbk", ".kbbbk.", "..kkk.."], pal: { k: "#06141c", B: "#7ef0e0", b: "#2a9a9a", W: "#ffffff" },
    mul: { cdr: 0.65 }, hooks: (b) => ({ onSpecial: (p) => { G.world.spawnFx("water/ripples", p.x, p.y, {}, { layer: "floor", prio: 1 }); aoe(p, p.x, p.y, 54, 6, { elem: "water", proc: true, kb: 240 }); } }) },
  { id: "rimeheart", boss: "rimequeen", name: "RIME HEART", color: "#9bdcff", desc: "+1 HEART. WHATEVER HURTS YOU IS FROZEN SOLID.",
    sprite: [".kk.kk.", "kIIkIIk", "kIWIIIk", "kIIIIIk", ".kIIIk.", "..kIk..", "...k..."], pal: { k: "#0a1424", I: "#9bdcff", W: "#ffffff" },
    hearts: 2, hooks: (b) => ({ onHurt: (p, info) => { const s = info?.src?.owner ?? info?.src; if (s && !s.isPlayer && s.hittable && !s.heavy) { applyStatus(s, "freeze", 2); G.world.spawnFx("ice/snowflake-burst", s.x, s.y, {}, { prio: 1 }); } } }) },
  { id: "enginecore", boss: "engine", name: "ENGINE CORE", color: "#ffd23c", desc: "+25% ATTACK SPEED AND +20% MOVE SPEED.",
    sprite: ["..kkk..", ".kMMMk.", "kMyYyMk", "kMYWYMk", "kMyYyMk", ".kMMMk.", "..kkk.."], pal: { k: "#100c08", M: "#5a6478", y: "#e8a218", Y: "#ffd23c", W: "#ffffff" },
    mul: { atkSpeed: 1.25, speed: 1.2 } },
  { id: "seraphfeather", boss: "seraph", name: "SERAPH FEATHER", color: "#fff09a", desc: "BEGIN EVERY ROOM WITH TWO HOLY SHIELDS.",
    sprite: ["....kk.", "...kWk.", "..kWYk.", ".kWYk..", "kWYk...", "kYk....", "kk....."], pal: { k: "#2a1c08", W: "#fffbe6", Y: "#ffd84a" },
    hooks: (b) => ({ onRoomStart: (bd, p) => { p.shield = Math.max(p.shield, 2); G.world.spawnFx("holy/divine-shield", p.x, p.y, { actor: p.snapshot() }, { follow: p, prio: 1, life: 1.6 }); } }) },
  { id: "emberheart", name: "EMBER HEART", color: "#ff8a2a", desc: "+2 HEARTS.",
    sprite: [".kk.kk.", "kRRkRRk", "kRYRRRk", "kRRRRRk", ".kRRRk.", "..kRk..", "...k..."], pal: { k: "#1a0806", R: "#ff6a2a", Y: "#ffe27a" },
    hearts: 4 },
  { id: "chalice", name: "BLOOD CHALICE", color: "#e0302c", desc: "EVERY 15 KILLS RESTORE A WHOLE HEART.",
    sprite: ["kkkkkkk", "kGrrrGk", ".kGrGk.", "..kGk..", "..kGk..", ".kGGGk.", ".kkkkk."], pal: { k: "#1a0508", G: "#d8a428", r: "#c0142a" },
    hooks: (b) => { let n = 0; return { onKill: () => { if (++n % 15 || b.owner.down) return; b.owner.heal(2); G.world.spawnFx("shadow/life-steal", b.owner.x, b.owner.y, { actor: b.owner.snapshot() }, { follow: b.owner, prio: 1, life: 1.2 }); } }; } },
  { id: "stormsigil", name: "STORM SIGIL", color: "#7ad4ff", desc: "EVERY 4 SECONDS IN A FIGHT, LIGHTNING STRIKES THE FOE NEAREST YOU.",
    sprite: ["kkkkkkk", "kB..YBk", "kB.YB.k", "kBYYYBk", "k.BYB.k", "kBY..Bk", "kkkkkkk"], pal: { k: "#0a0c1c", B: "#2a3c6a", Y: "#fff04a" },
    hooks: (b) => { let t = 4; return { tick: (_, dt) => { if (!G.room?.fighting || (t -= dt) > 0) return; t = 4; const p = b.owner, e = !p.down && G.world.nearest(p.x, p.y, "player", 200); if (!e) return; const x = e.x, y = e.y; G.world.spawnFx("lightning/lightning-strike", x, y, {}, { prio: 1 }); G.world.after(0.75, () => { sfx("thunder", 0.8); aoe(p, x, y, 28, 34, { elem: "shock", proc: true, status: ["shock", 2], kb: 90 }); }); } }; } },
  { id: "voidlens", name: "VOID LENS", color: "#9a48ec", desc: "+15% CRITICAL HIT CHANCE. CRITICAL HITS DEAL TRIPLE DAMAGE INSTEAD OF DOUBLE.",
    sprite: ["..kkk..", ".kVVVk.", "kVvWvVk", "kVWkWVk", "kVvWvVk", ".kVVVk.", "..kkk.."], pal: { k: "#0a0412", V: "#6b2cc0", v: "#c684ff", W: "#ecc8ff" },
    add: { crit: 0.15, critMul: 1 } },
  { id: "idol", name: "GILDED IDOL", color: "#f5b92c", desc: "+75% COINS, AND RARER BOONS ARE OFFERED MORE OFTEN.",
    sprite: ["..kkk..", ".kGGGk.", ".kGkGk.", ".kGGGk.", "kkGGGkk", "kGGgGGk", "kkkkkkk"], pal: { k: "#2a1405", G: "#f5b92c", g: "#fff4bc" },
    mul: { coinMul: 1.75 }, add: { luck: 1.5 } },
  { id: "thornmail", name: "THORN MAIL", color: "#7ee88a", desc: "WHEN YOU ARE HURT, THORNS TEAR EVERYTHING AROUND YOU FOR HEAVY DAMAGE.",
    sprite: ["k.kkk.k", ".kGGGk.", "kGgGgGk", "kGGGGGk", "kGgGgGk", ".kGGGk.", "k.kkk.k"], pal: { k: "#0c1408", G: "#4aa060", g: "#b4ff70" },
    hooks: () => ({ onHurt: (p) => { for (const f of [1, -1]) G.world.spawnFx("nature/thorns", p.x + f * 6, p.y, { count: 5 }, { flip: f < 0, prio: 1 }); G.world.after(0.25, () => aoe(p, p.x, p.y, 80, 40, { ry: 16, elem: "nature", proc: true, kz: 120, status: ["bleed", 4] })); } }) },
  { id: "hourglass", name: "SAND OF AGES", color: "#e8d090", desc: "THE ULTIMATE FILLS 50% FASTER AND YOUR DASH RECHARGES 30% FASTER.",
    sprite: ["kkkkkkk", ".kSSSk.", "..kSk..", "...k...", "..k.k..", ".kSSSk.", "kkkkkkk"], pal: { k: "#2a2010", S: "#e8d090" },
    mul: { ultGain: 1.5, dashCd: 0.7 } },
];
export const RELIC_BY_ID = Object.fromEntries(RELICS.map((r) => [r.id, r]));
export { RELICS };

/** Three relics for a build to choose from: the fallen warden's own first, if they don't hold it yet. */
export function relicOffer(bd, bossKind, n = 3) {
  const own = new Set(bd.satchel.map((r) => r.id)), out = [];
  const sig = RELICS.find((r) => r.boss === bossKind && !own.has(r.id));
  if (sig) out.push(sig);
  const pool = RELICS.filter((r) => !own.has(r.id) && r !== sig);
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

/** Put a relic on: its numbers, its hearts, its hooks. */
export function equip(bd, r) {
  if (bd.relics.includes(r) || bd.relics.length >= RELIC_SLOTS) return false;
  if (!bd.satchel.includes(r)) bd.satchel.push(r);
  bd.relics.push(r);
  for (const [k, v] of Object.entries(r.mul ?? {})) bd.stats[k] *= v;
  for (const [k, v] of Object.entries(r.add ?? {})) bd.stats[k] += v;
  const p = bd.owner;
  if (r.hearts && p) {
    p.maxHp += r.hearts;
    if (!p.down && !p.dead) p.hp = Math.min(p.maxHp, p.hp + r.hearts);
  }
  const hooks = (bd.relicHooks ??= new Map()), h = r.hooks?.(bd) ?? {};
  hooks.set(r.id, h);
  for (const [name, fn] of Object.entries(h)) bd.hooks[name].push(fn);
  return true;
}
/** Take a relic off (it stays in the satchel): everything it gave is taken back. */
export function unequip(bd, r) {
  const i = bd.relics.indexOf(r);
  if (i < 0) return false;
  bd.relics.splice(i, 1);
  for (const [k, v] of Object.entries(r.mul ?? {})) bd.stats[k] /= v;
  for (const [k, v] of Object.entries(r.add ?? {})) bd.stats[k] -= v;
  const p = bd.owner;
  if (r.hearts && p) {
    p.maxHp = Math.max(2, p.maxHp - r.hearts);
    if (!p.down && !p.dead) p.hp = Math.max(1, Math.min(p.hp, p.maxHp));
  }
  const h = bd.relicHooks?.get(r.id) ?? {};
  for (const [name, fn] of Object.entries(h)) {
    const L = bd.hooks[name], j = L.indexOf(fn);
    if (j >= 0) L.splice(j, 1);
  }
  bd.relicHooks?.delete(r.id);
  return true;
}

/** A relic's icon at (x, y), `s` times its size, with a soft glow in its colour. */
export function drawRelic(r, x, y, s = 1, o = {}) {
  const p = painterFor(o.frame ?? G.screen.hud), pal = (r._pal ??= Object.fromEntries(Object.entries(r.pal).map(([k, c]) => [k, hex(c) >>> 0])));
  const dim = o.dim ?? 0;
  r.sprite.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === ".") return;
    let c = pal[ch];
    if (dim) c = (0xff000000 | (((((c >>> 16) & 255) * (1 - dim)) | 0) << 16) | (((((c >>> 8) & 255) * (1 - dim)) | 0) << 8) | (((c & 255) * (1 - dim)) | 0)) >>> 0;
    p.rect(x + i * s, y + j * s, s, s, c);
  }));
  if (!dim && o.glow !== 0) p.light(x + 3.5 * s, y + 3.5 * s, hex(r.color) >>> 0, (o.glow ?? 0.25) * Math.min(2, s));
}
