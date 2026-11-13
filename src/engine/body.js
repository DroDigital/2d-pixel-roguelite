// Vessels: pixelfx's rigged character, recolored per class and per enemy, with ember eyes that glow in the dark.
// The rig solves a pose (hands, feet, lean, weapon) into pixels; we paint those pixels with our own palette and carry
// the face's eye pixels through every turn and lean so the glow follows the head.

import { posed, hex, DUMMY_PAL, READY, STAND } from "./pfx.js";

const KEYS = ["k", "A", "B", "C", "D", "E", "F", "G", "J", "m"];
const BASE = Object.fromEntries(KEYS.map((k) => [k, hex(DUMMY_PAL[k]) >>> 0]));
const EYE_L = 3 * 24 + 13, EYE_R = 3 * 24 + 15;

/**
 * A vessel palette from a spec: { k ink, A B C D shell lit..dark, E F G core lit..dark, J seam, m mark, eye }.
 * Missing keys keep the stock grey. Returns { map: Map<rig color, our color>, eye }.
 */
export function vesselPal(spec) {
  const map = new Map();
  for (const k of KEYS) map.set(BASE[k], (spec[k] !== undefined ? hex(spec[k]) : BASE[k]) >>> 0);
  return { map, eye: hex(spec.eye ?? "#ffcf5a") >>> 0, spec };
}

const eyeCache = new WeakMap();
function eyesOf(r) {
  let e = eyeCache.get(r);
  if (e) return e;
  const pts = [[0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < r.n; i++) {
    const s = r.src[i];
    if ((s === EYE_L || s === EYE_R) && !r.ink[i]) {
      const p = pts[s === EYE_L ? 0 : 1];
      p[0] += r.xs[i]; p[1] += r.ys[i]; p[2]++;
    }
  }
  e = pts.filter((p) => p[2]).map((p) => [Math.round(p[0] / p[2]), Math.round(p[1] / p[2])]);
  eyeCache.set(r, e);
  return e;
}

const actorCache = new WeakMap();
/** The posed body as a pixelfx actor, so status and death effects wrap the real silhouette. */
export function bodyActor(pose, pal) {
  const r = posed(pose);
  let byPal = actorCache.get(r);
  if (!byPal) actorCache.set(r, (byPal = new Map()));
  let a = byPal.get(pal);
  if (a) return a;
  const x0 = r.x0, y0 = r.y0, w = r.x1 - x0 + 1, h = r.y1 - y0 + 1, data = new Uint8Array(w * h), pixels = new Uint32Array(w * h);
  for (let i = 0; i < r.n; i++) {
    const k = (r.ys[i] - y0) * w + (r.xs[i] - x0);
    data[k] = 1;
    pixels[k] = pal.map.get(r.color[i]) ?? r.color[i];
  }
  const cx = Math.round((x0 + r.x1) / 2);
  a = { mask: { w, h, data }, pixels, x: x0, y: y0, w, h, k: 2, head: [cx, y0], chest: [cx, -26], eyes: eyesOf(r).map(([x, y]) => [x - x0, y - y0]) };
  byPal.set(pal, a);
  return a;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/**
 * Paint a posed vessel with its feet at (X, Y). o: { flip, flash (0..1 white), tint, tintK, alpha (dithered),
 * eyes (glow strength, 0 for none), outline (color: a 1 px rim, for elites) }.
 */
export function drawBody(frame, pose, pal, X, Y, o = {}) {
  const r = posed(pose), W = frame.w, H = frame.h, C = frame.color, L = frame.light;
  X = Math.round(X) - frame.ox;
  Y = Math.round(Y) - frame.oy;
  const flip = !!o.flip, a = o.alpha ?? 1, flash = o.flash ?? 0, map = pal.map;
  const tint = o.tint, tk = o.tintK ?? 0;
  for (let i = 0; i < r.n; i++) {
    const x = flip ? X - r.xs[i] - 1 : X + r.xs[i], y = Y + r.ys[i];
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (a < 1 && a <= BAYER[((y & 3) << 2) | (x & 3)]) continue;
    let c = map.get(r.color[i]) ?? r.color[i];
    if (tint !== undefined && tk > 0) c = mixc(c, tint, tk);
    if (flash > 0) c = mixc(c, 0xffffffff, flash);
    C[y * W + x] = c;
    // crisp in front of its own after-images
    if (o.clearLight) L[y * W + x] = 0;
  }
  if (o.outline !== undefined) {
    // a lit rim just outside the silhouette (elites, charmed, shielded)
    const oc = o.outline, ok = o.outlineK ?? 0.8;
    for (let i = 0; i < r.n; i++) {
      if (!r.ink[i]) continue;
      const x = flip ? X - r.xs[i] - 1 : X + r.xs[i], y = Y + r.ys[i];
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      addLight(L, y * W + x, oc, ok);
    }
  }
  const ek = o.eyes ?? 1;
  if (ek > 0 && a > 0.3) {
    for (const [ex, ey] of eyesOf(r)) {
      const x = flip ? X - ex - 1 : X + ex, y = Y + ey;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      C[y * W + x] = pal.eye;
      addLight(L, y * W + x, pal.eye, 0.9 * ek);
      addLight(L, y * W + x - 1, pal.eye, 0.3 * ek);
      addLight(L, y * W + x + 1, pal.eye, 0.3 * ek);
      addLight(L, (y - 1) * W + x, pal.eye, 0.2 * ek);
    }
  }
  return r;
}

export function mixc(a, b, t) {
  const r = (a & 255) + ((b & 255) - (a & 255)) * t, g = ((a >>> 8) & 255) + (((b >>> 8) & 255) - ((a >>> 8) & 255)) * t;
  const bl = ((a >>> 16) & 255) + (((b >>> 16) & 255) - ((a >>> 16) & 255)) * t;
  return ((a & 0xff000000) | ((bl & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
}
export function addLight(L, j, c, k) {
  const d = L[j];
  const r = Math.min(255, (d & 255) + (c & 255) * k) | 0;
  const g = Math.min(255, ((d >>> 8) & 255) + ((c >>> 8) & 255) * k) | 0;
  const b = Math.min(255, ((d >>> 16) & 255) + ((c >>> 16) & 255) * k) | 0;
  L[j] = (255 << 24) | (b << 16) | (g << 8) | r;
}

// ---- locomotion poses: held drawings on 12 fps steps, like the acts
const step12 = (t) => Math.floor(t * 12) / 12;

/** Standing in guard, breathing. */
export function idlePose(base, t) {
  const up = Math.floor(t * 2.2) & 1;
  return { ...base, crouch: (base.crouch ?? 0) + up, fy: (base.fy ?? STAND.fy) + up, by: (base.by ?? STAND.by) + up };
}
/** A walk cycle from a guard pose; phase in seconds of walking, speed scales the stride. */
export function walkPose(base, t, speed = 1) {
  const ph = step12(t) * 9 * speed, s = Math.sin(ph), c = Math.cos(ph);
  const ffx = (base.ffx ?? READY.ffx) * 0.4, fbx = (base.fbx ?? READY.fbx) * 0.4;
  return {
    ...base,
    crouch: (base.crouch ?? 0) + 1 + Math.abs(c) * 1.5,
    lean: (base.lean ?? 0) + 2,
    ffx: ffx + s * 7, ffy: -4 - Math.max(0, -c) * 3,
    fbx: fbx - s * 7, fby: -4 - Math.max(0, c) * 3,
    fx: (base.fx ?? STAND.fx) - s * (base.weapon ? 1.5 : 4), fy: (base.fy ?? STAND.fy) + Math.abs(c),
    bx: (base.bx ?? STAND.bx) + s * 3, by: (base.by ?? STAND.by) + Math.abs(c),
  };
}
/** Knocked back by a hit. */
export function hurtPose(base, k = 1) {
  return { ...base, lean: -6 * k, crouch: 3, hx: -2, fx: (base.fx ?? 0) - 8, fy: (base.fy ?? -20) - 5, bx: (base.bx ?? 0) - 6, by: -30, ffx: 10, fbx: -9 };
}
/** Dashing low and fast. */
export function dashPose(base) {
  return { ...base, lean: 7, crouch: 6, fx: (base.fx ?? 10) - 6, fy: -18, bx: -10, by: -22, ffx: 14, fbx: -13, fby: -7, ghost: 1 };
}
/** Down on one knee (low HP idle, death). */
export function kneelPose(base) {
  return { ...base, crouch: 9, lean: 6, hy: 2, ffx: 9, fbx: -8, fby: -9, fx: 8, fy: -10, bx: 4, by: -14 };
}
/** Arms up, casting. */
export function castPose(base, t = 0) {
  const up = Math.floor(t * 6) & 1;
  return { ...base, crouch: 2, lean: -2, fx: -6, fy: -40 - up, bx: 9, by: -38 - up, turn: 1, ffx: 8, fbx: -8 };
}
