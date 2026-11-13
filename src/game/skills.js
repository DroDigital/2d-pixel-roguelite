// Small helpers moves use: play an effect at a point of the move, fire a projectile from the hand, find a target.

import { G } from "./ctx.js";
import { Projectile } from "./entity.js";

/** Spawn an effect at a point in the move's local space (mirrored with its facing). */
export function fxAt(perf, id, lx, ly = 0, opts = {}, s = {}) {
  const [x, y] = perf.at(lx, 0);
  return G.world.spawnFx(id, x, y + ly, opts, { flip: perf.facing < 0, depth: perf.oy + (s.dz ?? 4), prio: 2, ...s });
}

/** The nearest foe in front (or anywhere), else a point `fall` px ahead. */
export function aimPoint(a, range = 160, fall = 90, anyDir = false) {
  const w = G.world;
  const t = w.nearest(a.x, a.y, a.team, range, (e) => anyDir || (e.x - a.x) * a.facing > -10);
  if (t) return { x: t.x, y: t.y, e: t };
  return { x: Math.max(20, Math.min(300, a.x + a.facing * fall)), y: a.y, e: null };
}

/**
 * Fire a projectile from a point of the move. p: { fx, opts, lx, ly (hand, local), speed, aim (toward nearest foe's
 * depth), dmg, ... any Projectile fields }.
 */
export function shoot(a, perf, p) {
  const [x] = perf.at(p.lx ?? 20, 0);
  let vy = 0;
  if (p.aim !== false) {
    const t = G.world.nearest(x, a.y, a.team, 260, (e) => (e.x - x) * perf.facing > 0);
    if (t) vy = Math.max(-0.35, Math.min(0.35, (t.y - a.y) / Math.max(30, Math.abs(t.x - x)))) * p.speed;
  }
  const pr = new Projectile({
    x, y: a.y + 1, z: -(p.ly ?? -24), vx: perf.facing * p.speed, vy: (p.vy ?? 0) + vy, team: a.team, owner: a,
    ...p, fxId: p.fx, fxOpts: p.opts,
  });
  if (a.isPlayer && G.run) G.run.decorateShot?.(pr);
  return G.world.add(pr);
}

import { inBox, inRadius, damage } from "./combat.js";
/**
 * A hit of a move lands: a box in front ({ x0, x1, dy }) or a circle ({ r, lx } or { r, at(a, perf) -> [x, y] }).
 * The rest of the hit is passed to damage(): dmg, kb, kz, stun, stop, kind, elem, status.
 */
export function resolveMoveHit(a, h, perf) {
  let hits, cx = 0;
  if (h.r) {
    const [x, y] = h.at ? h.at(a, perf) : perf.at(h.lx ?? 0, 0);
    cx = x;
    hits = inRadius(a.team, x, y, h.r, h.ry);
  } else hits = inBox(a.team, perf.ox, perf.oy, perf.facing, h.x0 ?? 0, h.x1 ?? 40, h.dy ?? 12, h.zmax ?? 60);
  const k = a.dmgMul ?? 1;
  for (const e of hits)
    damage(e, h.dmg * k, {
      src: a, kind: h.kind ?? "slash", elem: h.elem ?? a.elem ?? "phys", kb: h.kb ?? 90, kz: h.kz ?? 0, stun: h.stun ?? 0.3,
      stop: h.stop ?? 0.06, status: h.status, dir: h.r ? Math.sign(e.x - cx) || perf.facing : perf.facing, crit: h.crit, fromPlayer: a.isPlayer,
    });
  if (hits.length && h.shake) G.world.shake(h.shake, 0.2);
  h.after?.(a, perf, hits);
  return hits.length > 0;
}
