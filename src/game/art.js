// The rooms' backdrops, painted once per room into the screen's background buffer: back walls, skies and floors in
// hard ramp steps with ordered dither, lit from above, dark at the edges, the way the effects themselves are drawn.

import { hex, fbm, noise, rand, mix, scale } from "../engine/pfx.js";
import { FLOOR_TOP } from "./ctx.js";

// a room's backdrop is as wide as the room (set by each painting from its buffer); the screen is 180 tall
let W = 320;
const H = 180;
/** n points evenly along the width, `step` apart, centred, at least `margin` from either end. */
export function spread(w, step, margin = 28) {
  const n = Math.max(1, Math.floor((w - 2 * margin) / step) + 1), x0 = (w - (n - 1) * step) / 2;
  return Array.from({ length: n }, (_, i) => Math.round(x0 + i * step));
}
const mids = (xs) => xs.slice(1).map((x, i) => Math.round((x + xs[i]) / 2));
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
const R = (list) => list.map((c) => hex(c) >>> 0);
/** The ramp step for t (0..1) with dither between steps. */
const step = (ramp, t, x, y) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * (ramp.length - 1) + bay(x, y))))];

class Paint {
  constructor(buf) {
    this.b = buf;
    W = Math.round(buf.length / H);
  }
  px(x, y, c) {
    x |= 0;
    y |= 0;
    if (x >= 0 && y >= 0 && x < W && y < H) this.b[y * W + x] = c;
  }
  get(x, y) {
    return this.b[(y | 0) * W + (x | 0)];
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }
  /** Darken (k < 1) or lighten every pixel in a box. */
  tone(x, y, w, h, k) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const X = x + i, Y = y + j;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        this.b[Y * W + X] = scale(this.b[Y * W + X], k) >>> 0;
      }
  }
}

// ---- walls
function bricks(P, pal, o = {}) {
  const C = R(pal), top = o.top ?? 0, bot = o.bot ?? FLOOR_TOP, bh = o.bh ?? 8, seed = o.seed ?? 1;
  let row = 0;
  for (let y0 = top; y0 < bot; y0 += bh, row++) {
    let x0 = -((row * 7 + seed * 3) % 13);
    while (x0 < W) {
      const bw = 14 + Math.floor(rand(row, x0, seed) * 12), v = rand(x0, row, seed + 3), worn = rand(row, x0, 9) < 0.08;
      for (let y = y0; y < Math.min(bot, y0 + bh); y++)
        for (let x = x0; x < x0 + bw; x++) {
          if (x < 0 || x >= W) continue;
          const ly = y - y0, lx = x - x0;
          let c;
          if (ly === bh - 1 || lx === bw - 1) c = C[0];
          else {
            const n = fbm(x * 0.21, y * 0.21, seed, 2) * 0.5 + 0.5;
            let t = 0.35 + v * 0.25 + (n - 0.5) * 0.35 + (ly === 0 ? 0.22 : 0) + (lx === 0 ? 0.1 : 0) - (ly === bh - 2 ? 0.15 : 0);
            if (worn) t -= 0.2;
            c = step(C, Math.max(0, Math.min(1, t)) * 0.85 + 0.1, x, y);
          }
          P.px(x, y, c);
        }
      x0 += bw;
    }
  }
}
function rock(P, pal, o = {}) {
  const C = R(pal), seed = o.seed ?? 4;
  for (let y = 0; y < FLOOR_TOP; y++)
    for (let x = 0; x < W; x++) {
      const n = fbm(x * 0.045, y * 0.07, seed, 4), ridge = Math.abs(noise(x * 0.05 + y * 0.02, seed + 1)) * 0.4;
      const t = 0.45 + n * 0.55 - ridge * 0.4 + (fbm(x * 0.2, y * 0.2, seed + 7, 2) * 0.12);
      P.px(x, y, step(C, Math.max(0, Math.min(1, t)), x, y));
    }
  // stalactites
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rand(i, seed, 2) * W), len = 6 + rand(i, seed, 3) * 22, w = 2 + rand(i, seed, 4) * 4;
    for (let y = 0; y < len; y++) {
      const hw = w * (1 - y / len);
      for (let dx = -hw; dx <= hw; dx++) P.px(x + dx, y, step(C, 0.25 + (dx < 0 ? 0.25 : 0) + 0.2 * (1 - y / len), x + dx, y));
    }
  }
}
function sky(P, pal, o = {}) {
  const C = R(pal), seed = o.seed ?? 2, h = o.h ?? FLOOR_TOP;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < W; x++) {
      const t = y / h;
      P.px(x, y, step(C, t, x, y));
      const r = rand(x, y, seed + 77);
      if (o.stars && y < h * 0.7 && r > 0.993) P.px(x, y, mix(C[C.length - 1], hex("#ffffff"), r > 0.998 ? 1 : 0.3) >>> 0);
    }
  if (o.moon) {
    const [mx, my, mr] = o.moon;
    for (let y = -mr - 4; y <= mr + 4; y++)
      for (let x = -mr - 4; x <= mr + 4; x++) {
        const d = Math.hypot(x, y);
        if (d <= mr) {
          const crater = fbm((mx + x) * 0.3, (my + y) * 0.3, 5, 2) > 0.15;
          P.px(mx + x, my + y, hex(d > mr - 1 ? "#d8d0e8" : crater ? "#c4bcd8" : "#f4f0ff") >>> 0);
        } else if (d <= mr + 4 && bay(mx + x, my + y) < 0.35 * (1 - (d - mr) / 4)) P.px(mx + x, my + y, mix(P.get(mx + x, my + y), hex("#b0a8d0"), 0.5) >>> 0);
      }
  }
}
/** A ridge line of mountains (or treetops) across the screen. */
function ridge(P, pal, base, amp, o = {}) {
  const C = R(pal), seed = o.seed ?? 3, freq = o.freq ?? 0.02, jag = o.jag ?? 0.6;
  for (let x = 0; x < W; x++) {
    const n = fbm(x * freq, seed * 1.7, seed, 4) * 0.5 + 0.5, j = Math.abs(noise(x * freq * 4, seed + 9)) * jag;
    const top = Math.floor(base - (n + j * 0.4) * amp);
    for (let y = Math.max(0, top); y < (o.bottom ?? FLOOR_TOP); y++) {
      const lit = o.snow && y - top < 3 + n * 4 ? 1 : 0;
      const t = lit ? 1 : 0.15 + 0.4 * ((y - top) < 2 ? 1 : 0) * (x % 7 < 4 ? 1 : 0.4) + 0.25 * (1 - (y - top) / 60);
      P.px(x, y, lit ? C[C.length - 1] : step(C.slice(0, -1), Math.max(0, Math.min(1, t)), x, y));
    }
  }
}
function trees(P, pal, base, o = {}) {
  const C = R(pal), seed = o.seed ?? 5;
  for (let i = 0; i < (o.n ?? 16); i++) {
    const x = Math.floor((i / (o.n ?? 16)) * W + rand(i, seed) * 20), h = 30 + rand(i, seed, 1) * (o.h ?? 40), w = 8 + rand(i, seed, 2) * 8;
    for (let y = 0; y < h; y++) {
      const hw = w * (y / h) * (1 + 0.25 * Math.sin(y * 0.9 + i));
      for (let dx = -hw; dx <= hw; dx++) P.px(x + dx, base - h + y, step(C, 0.2 + (dx < -hw * 0.3 ? 0.35 : 0) * (y > h * 0.3 ? 1 : 0), x + dx, base - h + y));
    }
    P.rect(x - 1, base - 3, 3, 4, C[0]);
  }
}
/** The Emberspire itself, far away: a dark needle with a burning crown. */
function spire(P, x, base, h, glow = "#ff8a2a") {
  const ink = hex("#0a0812") >>> 0, rim = hex("#2a1c30") >>> 0, g = hex(glow) >>> 0;
  for (let y = 0; y < h; y++) {
    const hw = 2 + (y / h) * 9 + (y > h * 0.85 ? 3 : 0) + (Math.floor(y / 14) % 3 === 0 ? 1 : 0);
    for (let dx = -hw; dx <= hw; dx++) P.px(x + dx, base - h + y, dx === -Math.floor(hw) ? rim : ink);
  }
  for (let i = 0; i < 4; i++) P.px(x - 1 + (i % 2) * 2, base - h + 6 + i * 22, g);
  for (let y = -10; y < 6; y++)
    for (let dx = -6; dx <= 6; dx++) {
      const d = Math.hypot(dx, y * 0.8) / 7;
      if (d < 1 && bay(x + dx, base - h + y) < (1 - d) * 0.9) P.px(x + dx, base - h + y, mix(g, hex("#fff2c0"), 1 - d) >>> 0);
    }
}
function panels(P, pal, o = {}) {
  const C = R(pal), seed = o.seed ?? 6;
  for (let y = 0; y < FLOOR_TOP; y++)
    for (let x = 0; x < W; x++) {
      const px = x % 40, py = y % 30, edge = px === 0 || py === 0, hi = px === 1 || py === 1, lo = px === 39 || py === 29;
      const n = fbm(x * 0.08, y * 0.08, seed, 2) * 0.12;
      let t = 0.42 + n + (hi ? 0.25 : 0) - (lo ? 0.2 : 0) - (edge ? 0.35 : 0);
      if ((px === 4 || px === 35) && (py === 4 || py === 25)) t = 0.85; // rivets
      P.px(x, y, step(C, Math.max(0, Math.min(1, t)), x, y));
    }
}
function marble(P, pal, o = {}) {
  const C = R(pal), seed = o.seed ?? 7;
  for (let y = 0; y < FLOOR_TOP; y++)
    for (let x = 0; x < W; x++) {
      const vein = Math.abs(Math.sin(x * 0.05 + fbm(x * 0.03, y * 0.03, seed, 4) * 6));
      const t = 0.62 + vein * 0.25 - (vein < 0.06 ? 0.35 : 0) + (y % 24 === 0 ? -0.3 : 0);
      P.px(x, y, step(C, Math.max(0, Math.min(1, t)), x, y));
    }
}

// ---- wall furniture
function pillar(P, x, w, pal, top = 0) {
  const C = R(pal);
  for (let y = top; y < FLOOR_TOP; y++)
    for (let i = 0; i < w; i++) {
      const u = i / (w - 1), t = 0.25 + 0.6 * Math.sin(u * Math.PI * 0.9 + 0.2) - (i === 0 || i === w - 1 ? 0.3 : 0);
      P.px(x + i, y, step(C, Math.max(0, Math.min(1, t)), x + i, y));
    }
  // capital and base
  for (const [yy, hh] of [[top + 6, 5], [FLOOR_TOP - 7, 6]])
    for (let j = 0; j < hh; j++) for (let i = -2; i < w + 2; i++) P.px(x + i, yy + j, step(C, j === 0 ? 0.95 : j === hh - 1 ? 0.15 : 0.55, x + i, yy + j));
}
function arch(P, cx, w, h, pal) {
  const C = R(pal), top = FLOOR_TOP - h;
  for (let y = top; y < FLOOR_TOP; y++)
    for (let x = cx - w / 2; x < cx + w / 2; x++) {
      const u = (x - cx) / (w / 2), archY = top + (1 - Math.sqrt(Math.max(0, 1 - u * u))) * (w / 2);
      if (y < archY) continue;
      const depth = (y - archY) / h;
      P.px(x, y, step(C, 0.05 + 0.25 * depth * (1 - Math.abs(u)), x, y));
      if (y - archY < 1.2) P.px(x, y, C[3]);
    }
}
function windowGlass(P, cx, w, h, top, cols) {
  const C = R(cols);
  for (let y = top; y < top + h; y++)
    for (let x = cx - w / 2; x < cx + w / 2; x++) {
      const u = (x - cx) / (w / 2), archY = top + (1 - Math.sqrt(Math.max(0, 1 - u * u))) * (w / 2);
      if (y < archY) continue;
      const lead = (Math.floor(x) - cx) % 6 === 0 || (y - top) % 9 === 0;
      const cell = Math.floor(rand(Math.floor((x - cx) / 6), Math.floor((y - top) / 9), 4) * C.length);
      P.px(x, y, lead ? hex("#1a1408") >>> 0 : C[cell]);
    }
}
function banner(P, x, top, h, pal, emblem) {
  const C = R(pal);
  for (let y = top; y < top + h; y++)
    for (let i = 0; i < 12; i++) {
      const cut = y > top + h - 5 && Math.abs(i - 5.5) < (y - (top + h - 5)) * 1.2;
      if (cut) continue;
      P.px(x + i, y, step(C, 0.3 + (i < 2 ? 0.3 : 0) - (i > 9 ? 0.2 : 0) + 0.1 * Math.sin(y * 0.5), x + i, y));
    }
  P.rect(x - 1, top - 1, 14, 2, hex("#c48412") >>> 0);
  if (emblem) for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (Math.abs(i - 2) + Math.abs(j - 3) < 3) P.px(x + 4 + i, top + 8 + j, hex(emblem) >>> 0);
}

// ---- floors: tiles in perspective toward a vanishing point
function floor(P, pal, o = {}) {
  const C = R(pal), y0 = FLOOR_TOP, seed = o.seed ?? 11, vx = W / 2, vy = -260;
  for (let y = y0; y < H; y++) {
    const z = (y - vy) / (y0 - vy); // 1 at the wall, bigger toward us
    const row = Math.floor(Math.log(z) * (o.rows ?? 9));
    const rowEdge = Math.floor(Math.log((y + 1 - vy) / (y0 - vy)) * (o.rows ?? 9)) !== row;
    for (let x = 0; x < W; x++) {
      const u = (x - vx) / z, tw = o.tile ?? 28, off = o.checker || row % 2 === 0 ? 0 : tw / 2, col = Math.floor((u + off) / tw);
      const colEdge = Math.floor((u + off + 1 / z) / tw) !== col;
      const v = rand(col, row, seed), n = o.style === "snow" ? fbm(x * 0.05, y * 0.12, seed, 3) * 0.3 : fbm(u * 0.15, row * 3.1, seed, 2) * 0.18;
      let t = (o.base ?? 0.45) + (v - 0.5) * (o.var ?? 0.22) + n;
      if (o.checker) t += (row + col) % 2 ? 0.18 : -0.1;
      if (o.style !== "snow" && o.style !== "rock") {
        if (rowEdge || colEdge) t -= o.grout ?? 0.35;
        else if (Math.floor(Math.log((y - 1 - vy) / (y0 - vy)) * (o.rows ?? 9)) !== row) t += 0.18;
      }
      if (o.style === "grate" && (x + y) % 4 === 0 && !(rowEdge || colEdge)) t -= 0.25;
      // the wall's shadow at the back, darkness toward the near edge
      t -= Math.max(0, 1 - (y - y0) / 8) * 0.25 + Math.max(0, (y - 168) / 12) * 0.2;
      P.px(x, y, step(C, Math.max(0, Math.min(1, t)), x, y));
    }
  }
  // the edge where wall meets floor
  for (let x = 0; x < W; x++) {
    P.px(x, y0, C[Math.min(C.length - 1, (o.edge ?? 4))]);
    P.px(x, y0 - 1, C[1]);
  }
}
function vignette(P, k = 0.5) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // the room's ends darken as the screen's edges did; along a wide room only top and bottom do
      const sx = x < 160 ? x : x > W - 160 ? x - (W - 320) : 160;
      const dx = (sx - 160) / 180, dy = (y - 100) / 120, d = dx * dx + dy * dy;
      if (d > 0.45) P.b[y * W + x] = scale(P.b[y * W + x], 1 - Math.min(0.7, (d - 0.45) * k)) >>> 0;
    }
}
function topShade(P, h = 30, k = 0.55) {
  for (let y = 0; y < h; y++) P.tone(0, y, W, 1, 1 - k * (1 - y / h));
}

// ---- the camp
/** Where everything stands in the camp, left to right along its path. */
export const HUB = {
  W: 864, stationY: FLOOR_TOP + 12, start: 320,
  yard: [50, 132], party: 226, fire: 320, shrine: 476, codex: 612, portal: 772,
  tents: [[262, 30, 24, "#5a2a2a"], [378, 38, 28, "#2a3a5a"], [424, 26, 20, "#4a3a22"]],
  signs: [176, 404, 544, 690],
  torches: [150, 290, 352, 544, 690],
};
/** The path's middle at x: it wanders a little on its way to the spire. */
export const hubPathY = (x) => 146 + Math.sin(x * 0.017) * 7 + Math.sin(x * 0.047 + 1) * 3 - Math.max(0, (x - HUB.portal + 90) / 90) * 12;
const pickOf = (list, r) => list[Math.floor(r * list.length) % list.length];
function treeline(P, pal, base, seed, density) {
  const C = R(pal);
  for (let i = 0; i < W / 9; i++) {
    const x = Math.floor(i * 9 + rand(i, seed) * 8);
    if (rand(i, seed, 5) > density(x)) continue;
    const h = 26 + rand(i, seed, 1) * 40, w = 7 + rand(i, seed, 2) * 8;
    for (let y = 0; y < h; y++) {
      const hw = w * (y / h) * (1 + 0.25 * Math.sin(y * 0.9 + i));
      for (let dx = -hw; dx <= hw; dx++) P.px(x + dx, base - h + y, step(C, 0.2 + (dx < -hw * 0.3 ? 0.35 : 0) * (y > h * 0.3 ? 1 : 0), x + dx, base - h + y));
    }
    P.rect(x - 1, base - 3, 3, 4, C[0]);
  }
}
function tent(P, cx, base, w, h, color) {
  const c = hex(color) >>> 0, dark = scale(c, 0.55) >>> 0, lit = hex("#ffb45a") >>> 0;
  for (let y = 0; y < h; y++) {
    const hw = (w / 2) * (y / h);
    for (let dx = -hw; dx <= hw; dx++) {
      const x = Math.round(cx + dx), yy = base - h + y, stripe = Math.floor((dx + w) / 5) % 2;
      P.px(x, yy, dx < 0 ? (stripe ? dark : scale(dark, 0.8) >>> 0) : stripe ? c : scale(c, 0.85) >>> 0);
    }
  }
  // the flap is open and the lamp inside is lit
  for (let y = Math.floor(h * 0.45); y < h; y++) {
    const hw = (y - h * 0.45) * 0.35;
    for (let dx = -hw; dx <= hw; dx++) P.px(Math.round(cx + dx), base - h + y, bay(cx + dx, y) < 0.7 ? lit : hex("#c06a2a") >>> 0);
  }
  P.px(cx, base - h - 1, hex("#2a1c14") >>> 0);
  P.px(cx, base - h - 2, hex("#2a1c14") >>> 0);
}
function fence(P, x0, x1, base) {
  const wood = hex("#3a2a1c") >>> 0, hi = hex("#5a4230") >>> 0;
  for (let x = x0; x <= x1; x += 12) P.rect(x, base - 14, 2, 14, wood), P.px(x, base - 14, hi);
  for (const y of [base - 11, base - 6]) for (let x = x0; x <= x1; x++) P.px(x, y, (x & 7) === 0 ? hi : wood);
}
function rack(P, x, base) {
  const wood = hex("#4a3424") >>> 0, steel = hex("#a9bcdc") >>> 0;
  P.rect(x, base - 16, 2, 16, wood);
  P.rect(x + 20, base - 16, 2, 16, wood);
  P.rect(x, base - 15, 22, 2, wood);
  for (let i = 0; i < 4; i++) P.rect(x + 4 + i * 4, base - 22 + (i % 2) * 3, 1, 18 - (i % 2) * 3, i === 2 ? hex("#8a6a4a") >>> 0 : steel);
}
/** A broken stone arch at the foot of the path, framing the climb. */
function gate(P, cx, base) {
  const C = R(["#0e0c14", "#1a1724", "#2a2638", "#3e3a52", "#565070"]);
  for (const side of [-1, 1])
    for (let y = base - 58; y < base; y++)
      for (let i = 0; i < 9; i++) {
        const x = cx + side * 30 + i - 4, broke = side > 0 && y < base - 50 + (i % 3) * 2;
        if (broke) continue;
        P.px(x, y, step(C, 0.3 + (i < 2 ? 0.3 : 0) - (i > 6 ? 0.15 : 0) + ((y - base) % 9 === 0 ? -0.2 : 0), x, y));
      }
  for (let x = cx - 34; x < cx + 22; x++) {
    const u = (x - cx) / 34, top = base - 62 - Math.round(Math.sqrt(Math.max(0, 1 - u * u)) * 10);
    for (let y = top; y < top + 6; y++) P.px(x, y, step(C, 0.45 + (y === top ? 0.3 : 0), x, y));
  }
}
function signpost(P, x, base) {
  const wood = hex("#4a3424") >>> 0, plank = hex("#6a4c30") >>> 0, ink = hex("#ffb45a") >>> 0;
  P.rect(x, base - 16, 2, 16, wood);
  // a plank pointing on, toward the spire, with an ember-painted arrow
  for (let j = 0; j < 5; j++) for (let i = 0; i < 14 - (j === 0 || j === 4 ? 1 : 0); i++) P.px(x - 4 + i + (j === 2 ? 1 : 0), base - 18 + j, plank);
  P.px(x + 10, base - 16, plank);
  for (let i = 0; i < 6; i++) P.px(x - 1 + i, base - 16, ink);
  P.px(x + 4, base - 17, ink);
  P.px(x + 4, base - 15, ink);
}
function clearing(P, cx, cy, rx, ry, D) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const u = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (u > 1 || bay(x, y) < (u - 0.7) * 3.3) continue;
      P.px(x, y, step(D, 0.62 - u * 0.4 + fbm(x * 0.15, y * 0.3, 3, 2) * 0.18, x, y));
    }
}

// ---- the biomes
export const PAINTERS = {
  crypt(buf, seed = 1) {
    const P = new Paint(buf);
    bricks(P, ["#0d0b12", "#1a1722", "#26222f", "#332e3e", "#423b4f", "#544b62"], { seed });
    const cols = spread(W, 132);
    for (const cx of mids(cols)) arch(P, cx, 44, 56, ["#07060a", "#110e16", "#1a1622", "#2e2838", "#4a4060"]);
    for (const x of cols) pillar(P, x - 8, 16, ["#14121a", "#24202c", "#38323f", "#4e4656", "#6a6074", "#8a7e94"]);
    cols.forEach((x, i) => i % 2 === (cols.length >> 1) % 2 && banner(P, x - 6, 18, 30, ["#2a0810", "#4a0e1a", "#6e1424", "#8c1c2c"], "#c48412"));
    topShade(P, 40, 0.65);
    floor(P, ["#0c0a10", "#16131c", "#211c28", "#2c2634", "#383040", "#463c50"], { seed: seed + 3 });
    vignette(P, 0.9);
  },
  grotto(buf, seed = 2) {
    const P = new Paint(buf);
    rock(P, ["#050c10", "#0a161c", "#10222a", "#183038", "#22404a", "#2e525c"], { seed });
    // glowing fungus
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(rand(i, seed, 8) * W), y = 30 + Math.floor(rand(i, seed, 9) * (FLOOR_TOP - 34));
      P.px(x, y, hex(i % 3 ? "#4fe0c8" : "#a8fff0") >>> 0);
      if (i % 4 === 0) P.px(x + 1, y, hex("#1fa8a8") >>> 0);
    }
    topShade(P, 50, 0.7);
    floor(P, ["#050a0c", "#0a1418", "#101e22", "#18292e", "#21363a", "#2c4448"], { seed: seed + 5, style: "rock", base: 0.4, var: 0.3 });
    // a still pool along the back
    for (let y = FLOOR_TOP + 1; y < FLOOR_TOP + 7; y++)
      for (let x = 0; x < W; x++) if (noise(x * 0.04, seed) > -0.2 + (y - FLOOR_TOP) * 0.08) P.px(x, y, hex((x + y) % 9 === 0 ? "#2f7fcc" : y === FLOOR_TOP + 1 ? "#1c4e74" : "#0e2e4a") >>> 0);
    vignette(P, 1.0);
  },
  frost(buf, seed = 3) {
    const P = new Paint(buf);
    sky(P, ["#06081a", "#0a1028", "#101a3a", "#18284e", "#223864", "#2e4c7c"], { stars: true, seed, moon: [252, 26, 9] });
    ridge(P, ["#0e1430", "#162042", "#1e2c56", "#2a3c6a", "#e4f0ff"], FLOOR_TOP - 24, 50, { seed: seed + 1, freq: 0.012, snow: true });
    ridge(P, ["#0a0e22", "#121a36", "#1a2648", "#24345c", "#c8dcf4"], FLOOR_TOP - 4, 30, { seed: seed + 2, freq: 0.02, snow: true });
    floor(P, ["#1a2648", "#2a3c6a", "#4a6a9a", "#7ca0cc", "#b4d0f0", "#e4f0ff"], { seed: seed + 9, style: "snow", base: 0.62, var: 0.15, edge: 5 });
    vignette(P, 0.8);
  },
  foundry(buf, seed = 4) {
    const P = new Paint(buf);
    panels(P, ["#0a0c12", "#141822", "#1e2430", "#2a3242", "#384256", "#4a566c"], { seed });
    // a long window band showing the storm outside: sky, a burning skyline, factory towers
    const sk = R(["#06060c", "#0c0c18", "#141628", "#1c2036", "#262a44"]), win = (x, y) => y >= 14 && y < 56 && x % 64 > 3;
    const towers = Array.from({ length: Math.ceil(W / 40) }, (_, i) => ({ x: i * 42 + Math.floor(rand(i, 4) * 12), h: 14 + rand(i, 5) * 24, w: 8 + rand(i, 6) * 10 }));
    for (let y = 14; y < 56; y++)
      for (let x = 0; x < W; x++) {
        if (!win(x, y)) continue;
        let c = step(sk, (y - 14) / 42, x, y);
        const hz = 56 - (fbm(x * 0.05, 3, seed, 3) * 0.5 + 0.5) * 8;
        if (y > hz) c = hex(y - hz < 1.5 ? "#ff8a2a" : "#100c14") >>> 0;
        for (const t of towers) if (x >= t.x && x < t.x + t.w && y > 56 - t.h) c = hex((x - t.x) % 4 === 1 && (y % 5 === 0) && rand(x, y, 7) > 0.4 ? "#ffb43c" : "#0a0a12") >>> 0;
        P.px(x, y, c);
      }
    for (let x = 0; x < W; x += 64) P.rect(x, 12, 4, 46, hex("#384256") >>> 0);
    P.rect(0, 12, W, 2, hex("#4a566c") >>> 0);
    P.rect(0, 56, W, 2, hex("#1e2430") >>> 0);
    // pipes
    for (const [y, c] of [[64, "#5a3a2a"], [70, "#3a4a5a"]]) for (let x = 0; x < W; x++) for (let j = 0; j < 4; j++) P.px(x, y + j, mix(hex(c), hex(j === 0 ? "#c0a080" : "#000000"), j === 0 ? 0.3 : j * 0.15) >>> 0);
    // hazard stripes along the base
    for (let y = FLOOR_TOP - 8; y < FLOOR_TOP - 2; y++) for (let x = 0; x < W; x++) P.px(x, y, hex(Math.floor((x + y) / 4) % 2 ? "#e8a218" : "#1a1408") >>> 0);
    topShade(P, 20, 0.5);
    floor(P, ["#08090e", "#11131a", "#1a1e28", "#242a36", "#303846", "#3e4858"], { seed: seed + 2, style: "grate", tile: 24, grout: 0.3 });
    vignette(P, 0.8);
  },
  sanctum(buf, seed = 5) {
    const P = new Paint(buf);
    marble(P, ["#2a2420", "#4a4038", "#6e6254", "#968a78", "#bcb2a0", "#e0d8c8", "#f8f4ec"], { seed });
    const wins = spread(W, 96, 64);
    for (const cx of wins) windowGlass(P, cx, 30, 60, 12, ["#3a6ab0", "#c03a3a", "#e8b040", "#4aa060", "#8a50c0", "#f0e8d0"]);
    for (const x of [wins[0] - 48, ...wins.map((x) => x + 48)]) pillar(P, x - 5, 10, ["#4a4038", "#6e6254", "#968a78", "#bcb2a0", "#e0d8c8", "#fffaf0"]);
    P.rect(0, 4, W, 3, hex("#c48412") >>> 0);
    P.rect(0, FLOOR_TOP - 4, W, 2, hex("#c48412") >>> 0);
    topShade(P, 30, 0.35);
    floor(P, ["#3a3028", "#5c5044", "#8a7c68", "#b4a890", "#dcd2bc", "#f4eedc"], { seed: seed + 1, checker: true, tile: 26, base: 0.5, grout: 0.15 });
    vignette(P, 0.7);
  },
  /** The camp: a valley under the night, one path running from the training yard past the fire to the spire. */
  hub(buf, seed = 6) {
    const P = new Paint(buf), L = HUB;
    sky(P, ["#05040c", "#0a0818", "#120e26", "#1c1636", "#281e48", "#3a2a5a"], { stars: true, seed, moon: [70, 24, 7] });
    // the horizon burns where the spire stands: that's the way
    for (let y = 40; y < FLOOR_TOP; y++)
      for (let x = Math.max(0, L.portal - 200); x < W; x++) {
        const d = Math.hypot((x - L.portal) / 190, (y - FLOOR_TOP) / 60);
        if (d < 1 && bay(x, y) < (1 - d) * 0.55) P.px(x, y, mix(P.get(x, y), hex("#6a2a3a"), 0.5 * (1 - d)) >>> 0);
      }
    spire(P, L.portal + 4, FLOOR_TOP - 4, 96);
    ridge(P, ["#06050c", "#0c0a16", "#141020", "#1c162a", "#3a2a5a"], 86, 30, { seed: seed + 2, freq: 0.014 });
    // woods close in at the ends and thin out over the camp
    treeline(P, ["#040308", "#0a0812", "#120e1c", "#1a1428"], FLOOR_TOP + 2, seed, (x) => (x < L.yard[1] + 40 || x > L.codex + 40 ? 1 : Math.abs(x - L.fire) < 150 ? 0.25 : 0.6));
    // tents round the fire, a rack and a fence in the yard, a stone arch over the climb
    for (const [x, w, h, c] of L.tents) tent(P, x, FLOOR_TOP + 3, w, h, c);
    fence(P, 6, L.yard[1] + 34, FLOOR_TOP + 2);
    rack(P, L.yard[0] + 18, FLOOR_TOP + 1);
    gate(P, L.portal, FLOOR_TOP + 2);
    floor(P, ["#08060c", "#100c14", "#18141e", "#211b28", "#2c2434", "#3a3042"], { seed: seed + 4, style: "rock", base: 0.42, var: 0.25 });
    // the path: packed earth from one end to the other, with a clearing round the fire and stones before the shrine
    const D = R(["#24191a", "#33241f", "#443026", "#563e2e", "#6a4e38"]);
    for (let x = 0; x < W; x++) {
      const cy = hubPathY(x), hw = 9 + noise(x * 0.07, seed) * 2.5;
      for (let y = Math.floor(cy - hw * 0.45); y <= cy + hw * 0.45 + 1; y++) {
        const u = Math.abs(y - cy) / (hw * 0.45 + 1);
        if (u > 1 || bay(x, y) < (u - 0.75) * 3) continue;
        P.px(x, y, step(D, 0.75 - u * 0.5 + fbm(x * 0.2, y * 0.3, seed, 2) * 0.2, x, y));
      }
    }
    clearing(P, L.fire, 146, 58, 18, D);
    clearing(P, L.portal, 132, 46, 14, R(["#141018", "#221c28", "#30283a", "#40364c", "#544866"]));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, x = L.shrine + Math.cos(a) * 22, y = L.stationY + 2 + Math.sin(a) * 6;
      P.rect(Math.round(x) - 1, Math.round(y), 3, 2, hex("#4a4462") >>> 0);
      P.px(Math.round(x), Math.round(y) - 1, hex("#6a6088") >>> 0);
    }
    // signposts along the path point the way on
    for (const x of L.signs) signpost(P, x, FLOOR_TOP + 16);
    // grass and flowers, kept off the path
    for (let i = 0; i < W * 0.7; i++) {
      const x = Math.floor(rand(i, 3) * W), y = FLOOR_TOP + 3 + Math.floor(rand(i, 4) * (H - FLOOR_TOP - 4));
      if (Math.abs(y - hubPathY(x)) < 7 || Math.hypot((x - L.fire) / 58, (y - 146) / 18) < 1) continue;
      const flower = rand(i, 7) > 0.93;
      P.px(x, y, hex(flower ? pickOf(["#c684ff", "#ffd84a", "#ff86e6"], rand(i, 8)) : i % 3 ? "#1e2a1a" : "#2c3c24") >>> 0);
      P.px(x, y - 1, hex(flower ? "#2c3c24" : "#16201a") >>> 0);
      if (i % 5 === 0) P.px(x + 1, y - 1, hex("#16201a") >>> 0);
    }
    vignette(P, 1.0);
  },
  title(buf) {
    const P = new Paint(buf);
    sky(P, ["#05040c", "#0a0818", "#140e28", "#21163a", "#2e1e4a", "#4a2a5a", "#6a3450"], { stars: true, seed: 9, h: H });
    spire(P, 160, 158, 76, "#ff9a3c");
    ridge(P, ["#06050c", "#0c0a16", "#141020", "#1c162a", "#4a2a5a"], 150, 26, { seed: 12, freq: 0.02, bottom: H });
    ridge(P, ["#030208", "#06050c", "#0c0a14", "#120e1c", "#2a1c30"], 168, 18, { seed: 13, freq: 0.03, bottom: H });
    vignette(P, 1.1);
  },
};
