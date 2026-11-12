// Hits, damage, statuses and deaths. Everything that happens when something connects goes through here, so the feel
// stays consistent: a spark in the element's colors, a number, a freeze on contact, a shake, a knock back, a status.

import { PAL, fxMod, createFx, actorAlphaOf } from "../engine/pfx.js";
import { G, sfx, rnd, chance, clampX, clampY } from "./ctx.js";

export const ELEM = {
  phys: { pal: null, sfx: "hit" },
  fire: { pal: PAL.fire, sfx: "fire", status: "burn" },
  ice: { pal: PAL.ice, sfx: "ice", status: "slow" },
  shock: { pal: PAL.electric, sfx: "zap", status: "shock" },
  shadow: { pal: PAL.arcane, sfx: "dark", status: "curse" },
  holy: { pal: PAL.holy, sfx: "holy" },
  poison: { pal: PAL.poison, sfx: "poison", status: "poison" },
  water: { pal: PAL.water, sfx: "water" },
  arcane: { pal: PAL.arcane, sfx: "magic" },
  nature: { pal: PAL.leaf, sfx: "hit" },
};

/** Statuses: what they do and the pixelfx loop that shows them on the body. */
export const STATUS = {
  burn: { fx: "status/burning", dot: 4, tick: 0.5, elem: "fire", color: "#ff8a2a" },
  freeze: { fx: "status/frozen", stops: true, color: "#9bdcff" },
  slow: { fx: "status/slowed", speed: 0.5, color: "#58b4ec" },
  poison: { fx: "status/poisoned", dot: 3, tick: 0.6, elem: "poison", color: "#6cb82a" },
  curse: { fx: "status/cursed", vuln: 1.4, color: "#9a48ec" },
  stun: { fx: "status/stunned", stops: true, color: "#ffe066" },
  bleed: { fx: "status/bleeding", dot: 3, tick: 0.4, elem: "phys", color: "#d42a30" },
  charm: { fx: "status/charmed", charm: true, color: "#ff86e6" },
  confuse: { fx: "status/confused", confuse: true, color: "#c684ff" },
  sleep: { fx: "status/sleep", stops: true, wake: true, color: "#a6d4ff" },
  petrify: { fx: "status/petrified", stops: true, vuln: 1.6, color: "#a4a4b2" },
  shock: { fx: "lightning/electrified", dot: 2, tick: 0.5, elem: "shock", arc: true, color: "#7cc8ff" },
  rage: { fx: "status/rage", rage: true, color: "#ff5a50" },
  haste: { fx: "status/haste", speed: 1.35, color: "#c8f0ff" },
};
const STATUS_FX_CAP = 10;

export function applyStatus(e, name, dur, power = 1, src = null) {
  if (!e || e.dead || !STATUS[name]) return;
  if (e.immune?.includes(name)) return;
  if (e.boss && (name === "freeze" || name === "petrify" || name === "sleep" || name === "charm")) dur *= 0.35;
  const S = STATUS[name], cur = e.st[name];
  if (cur) {
    cur.t = Math.max(cur.t, dur);
    cur.power = Math.max(cur.power, power);
    return cur;
  }
  const live = G.world ? G.world.ents.reduce((n, x) => n + Object.keys(x.st ?? {}).length, 0) : 0;
  const inst = live < STATUS_FX_CAP && !G.save?.settings.lowfx ? createFx(fxMod(S.fx), { x: e.x, y: e.y, seed: (Math.random() * 999) | 0 }) : null;
  e.st[name] = { t: dur, power, src, inst, tick: 0, mod: fxMod(S.fx) };
  if (name === "freeze") sfx("ice");
  if (name === "petrify") sfx("thud", 0.6, 0.6);
  return e.st[name];
}
export function clearStatus(e, name) {
  delete e.st[name];
}
export const has = (e, name) => !!e.st?.[name];

/** Run statuses for one tick: timers, damage over time, and their visuals. */
export function tickStatus(e, dt) {
  for (const [name, s] of Object.entries(e.st)) {
    const S = STATUS[name];
    s.t -= dt;
    s.inst?.update(dt);
    if (S.dot && !e.dead) {
      s.tick += dt;
      if (s.tick >= S.tick) {
        s.tick -= S.tick;
        damage(e, S.dot * s.power * (e.isPlayer ? 0 : 1), { elem: S.elem, dot: true, src: s.src, noStop: true, kb: 0 });
        if (S.arc && G.world && Math.random() < 0.5) arcFrom(e, s.src);
      }
    }
    if (s.t <= 0) delete e.st[name];
  }
}
/** Status loops drawn round a body: layer "back" or "front"; returns how visible the body itself should be. */
export function drawStatus(e, frame, layer, actor) {
  let alpha = 1;
  for (const [name, s] of Object.entries(e.st)) {
    if (!s.inst) continue;
    const o = s.inst.options;
    o.actor = actor;
    o.x = e.x;
    o.y = e.y - e.z;
    o.flip = e.facing < 0;
    s.inst.draw(frame, layer);
    if (layer === "back") {
      const D = s.inst.meta.duration ?? 1, tt = s.inst.meta.loop ? s.inst.t % D : Math.min(s.inst.t, D);
      alpha = Math.min(alpha, actorAlphaOf(s.mod, tt, o));
    }
  }
  return alpha;
}

/** Lightning jumps from e to a neighbour. */
export function arcFrom(e, src) {
  const w = G.world, n = w.nearest(e.x, e.y, "player", 70, (o) => o !== e);
  if (!n) return;
  w.spawnFx("lightning/zap-hit", n.x, n.y - 16, {}, { prio: 0 });
  sfx("zap", 0.5);
  damage(n, 3, { elem: "shock", src, noStop: true, kb: 20 });
}

// ---- hits
const numbers = [];
/** A floating damage number: red for normal, a CRIT starburst for crits, colored by element. */
export function number(x, y, amt, crit, elem = "phys", heal = false) {
  const w = G.world;
  if (!w) return;
  const now = w.t;
  while (numbers.length && now - numbers[0] > 0.5) numbers.shift();
  if (!crit && numbers.length > 7) return;
  numbers.push(now);
  const txt = (heal ? "+" : "") + Math.max(1, Math.round(amt));
  if (crit) w.spawnFx("ui/crit-number", x, y - 6, { text: txt + "!" }, { layer: "over", prio: 1 });
  else {
    const pal = heal ? PAL.heal : elem !== "phys" && ELEM[elem]?.pal ? ELEM[elem].pal : undefined;
    w.spawnFx("ui/damage-number", x + rnd(-4, 4), y, { text: heal ? txt : "-" + txt, ...(pal ? { palette: pal } : {}) }, { layer: "over", prio: 0 });
  }
}

/** The spark at the point of contact, by kind of blow and element. */
export function impact(x, y, kind = "slash", elem = "phys", facing = 1, crit = false) {
  const w = G.world, pal = ELEM[elem]?.pal, P = pal ? { palette: pal } : {};
  if (crit) return w.spawnFx("impacts/crit-hit", x, y, { ...P, height: 0 }, { flip: facing < 0, prio: 2, depth: y + 40 });
  switch (kind) {
    case "blunt": return w.spawnFx("impacts/blunt-hit", x, y + 14, { height: 14 }, { flip: facing < 0, prio: 1, depth: y + 40 });
    case "bullet": return w.spawnFx("impacts/bullet-impact", x, y + 10, { height: 10 }, { flip: facing > 0, prio: 0, depth: y + 40 });
    case "zap": return w.spawnFx("lightning/zap-hit", x, y, {}, { flip: facing < 0, prio: 0, depth: y + 40 });
    case "flash": return w.spawnFx("impacts/hit-flash", x, y + 14, P, { flip: facing < 0, prio: 0, depth: y + 40 });
    default: return w.spawnFx("impacts/hit-spark", x, y + 12, { ...P, height: 12, aim: rnd(-0.2, 0.2) }, { flip: facing < 0, prio: 0, depth: y + 40 });
  }
}

/**
 * Deal damage. info: { src, elem, crit, kind, kb (px/s), kz (launch), stun (hit-stun s), status: [name, dur, chance],
 * noNumber, noStop, dot, armorBreak, fx: false to skip the spark }. Returns true if it landed.
 */
export function damage(t, amt, info = {}) {
  if (!t || t.dead || !t.hittable) return false;
  if (t.isPlayer) return t.hurt(amt, info);
  if (t.inv > 0 && !info.dot) return false;
  const run = G.run, src = info.src, fromPlayer = src?.isPlayer || src?.owner?.isPlayer || info.fromPlayer;
  let dmg = amt, crit = !!info.crit;
  if (fromPlayer && run && !info.dot) {
    dmg *= run.stats.dmg;
    if (!info.noCrit && !crit && chance(run.stats.crit)) crit = true;
    if (crit) dmg *= run.stats.critMul;
    for (const f of run.hooks.preHit) dmg = f(t, dmg, info) ?? dmg;
  }
  if (t.st.curse) dmg *= STATUS.curse.vuln;
  if (t.st.petrify) dmg *= STATUS.petrify.vuln;
  if (t.shielded) {
    dmg *= 0.15;
    sfx("block", 0.6);
    if (G.world && !info.dot) G.world.spawnFx("impacts/ricochet", t.x, t.y, { height: 24 }, { flip: (info.dir ?? 1) > 0, prio: 0 });
  }
  dmg *= t.dmgTaken ?? 1;
  t.hp -= dmg;
  t.flash = 0.12;
  t.lastHit = info;
  if (t.st.sleep) delete t.st.sleep;
  if (!info.dot) {
    const dir = info.dir ?? (src ? Math.sign(t.x - src.x) || 1 : 1);
    const kb = (info.kb ?? 80) * (t.kbResist ?? 1) * (fromPlayer && run ? run.stats.kb : 1);
    t.kbx += dir * kb;
    if (info.kz && !t.heavy) t.vz = Math.max(t.vz, info.kz * (t.kbResist ?? 1));
    if (!t.armored) t.stun = Math.max(t.stun, info.stun ?? 0.25);
    if (info.fx !== false) impact(t.x, t.y - t.z - t.h * 0.55, info.kind, info.elem, dir, crit);
    sfx(crit ? "crit" : ELEM[info.elem]?.sfx ?? "hit", 0.8);
    if (info.status) {
      const [name, dur, p = 1] = info.status;
      if (Math.random() < p) applyStatus(t, name, dur, 1, src);
    }
    if (fromPlayer && dmg >= 40 && Math.random() < 0.35 && G.world) G.world.spawnFx("explosions/cartoon-pow", t.x, t.y - t.h - 10, { text: ["POW!", "BAM!", "WHAM!", "KRAK!", "BOOM!"][Math.floor(Math.random() * 5)] }, { layer: "over", prio: 1 });
    if (fromPlayer && run) {
      run.onPlayerHit(t, dmg, { ...info, crit });
      if (G.world && !info.noStop) G.world.hitstop((info.stop ?? 0.05) * (crit ? 1.6 : 1));
    }
  }
  if (!info.noNumber && (dmg >= 1 || !info.dot)) number(t.x, t.y - t.z - t.h - 4, dmg, crit, info.elem);
  t.onDamaged?.(dmg, info);
  if (t.hp <= 0) kill(t, { ...info, crit });
  return true;
}

export function kill(t, info = {}) {
  if (t.dead) return;
  t.dead = true;
  t.hp = 0;
  t.onDeath?.(info);
  if (info.src?.isPlayer || info.src?.owner?.isPlayer || info.fromPlayer) G.run?.onKill(t, info);
}

/** Everything of the other team inside a box in front of an attacker: x along facing from the origin, depth +-dy. */
export function inBox(team, ox, oy, facing, x0, x1, dy, zmax = 60) {
  return G.world.foes(team).filter((e) => {
    const rel = (e.x - ox) * facing;
    return rel >= x0 - e.r && rel <= x1 + e.r && Math.abs(e.y - oy) <= dy + e.depthR && e.z <= zmax;
  });
}
/** Everything of the other team within an ellipse on the floor. */
export function inRadius(team, x, y, r, ry = r * 0.45) {
  return G.world.foes(team).filter((e) => {
    const dx = (e.x - x) / (r + e.r), dy = (e.y - y) / (ry + e.depthR);
    return dx * dx + dy * dy <= 1;
  });
}
/** Damage everything of the other team round (x, y). */
export function aoe(src, x, y, r, amt, info = {}) {
  const team = src?.team ?? info.team ?? "player";
  const hits = inRadius(team, x, y, r, info.ry);
  for (const e of hits) damage(e, amt, { src, ...info, dir: Math.sign(e.x - x) || 1 });
  return hits;
}

/** Push an entity away from a point (used by blasts and shoves). */
export function shove(e, fromX, k) {
  e.kbx += Math.sign(e.x - fromX || 1) * k;
}
export { clampX, clampY };
