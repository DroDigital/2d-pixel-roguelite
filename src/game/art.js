// The rooms' backdrops, painted once per room into the screen's background buffer: back walls, skies and floors in
// hard ramp steps with ordered dither, lit from above, dark at the edges, the way the effects themselves are drawn.

import { hex, fbm, noise, rand, mix, scale } from "../engine/pfx.js";
import { FLOOR_TOP } from "./ctx.js";

const W = 320, H = 180;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
const R = (list) => list.map((c) => hex(c) >>> 0);
/** The ramp step for t (0..1) with dither between steps. */
const step = (ramp, t, x, y) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * (ramp.length - 1) + bay(x, y))))];

class Paint {
  constructor(buf) {
    this.b = buf;
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
  const C = R(pal), y0 = FLOOR_TOP, seed = o.seed ?? 11, vx = 160, vy = -260;
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
      const dx = (x - 160) / 180, dy = (y - 100) / 120, d = dx * dx + dy * dy;
      if (d > 0.45) P.b[y * W + x] = scale(P.b[y * W + x], 1 - Math.min(0.7, (d - 0.45) * k)) >>> 0;
    }
}
function topShade(P, h = 30, k = 0.55) {
  for (let y = 0; y < h; y++) P.tone(0, y, W, 1, 1 - k * (1 - y / h));
}

// ---- the biomes
export const PAINTERS = {
  crypt(buf, seed = 1) {
    const P = new Paint(buf);
    bricks(P, ["#0d0b12", "#1a1722", "#26222f", "#332e3e", "#423b4f", "#544b62"], { seed });
    for (const cx of [80, 240]) arch(P, cx, 44, 64, ["#07060a", "#110e16", "#1a1622", "#2e2838", "#4a4060"]);
    for (const x of [20, 152, 284]) pillar(P, x, 16, ["#14121a", "#24202c", "#38323f", "#4e4656", "#6a6074", "#8a7e94"]);
    banner(P, 154, 18, 34, ["#2a0810", "#4a0e1a", "#6e1424", "#8c1c2c"], "#c48412");
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
    ridge(P, ["#0e1430", "#162042", "#1e2c56", "#2a3c6a", "#e4f0ff"], 92, 56, { seed: seed + 1, freq: 0.012, snow: true });
    ridge(P, ["#0a0e22", "#121a36", "#1a2648", "#24345c", "#c8dcf4"], 112, 34, { seed: seed + 2, freq: 0.02, snow: true });
    floor(P, ["#1a2648", "#2a3c6a", "#4a6a9a", "#7ca0cc", "#b4d0f0", "#e4f0ff"], { seed: seed + 9, style: "snow", base: 0.62, var: 0.15, edge: 5 });
    vignette(P, 0.8);
  },
  foundry(buf, seed = 4) {
    const P = new Paint(buf);
    panels(P, ["#0a0c12", "#141822", "#1e2430", "#2a3242", "#384256", "#4a566c"], { seed });
    // a long window band showing the storm outside: sky, a burning skyline, factory towers
    const sk = R(["#06060c", "#0c0c18", "#141628", "#1c2036", "#262a44"]), win = (x, y) => y >= 14 && y < 56 && x % 64 > 3;
    const towers = Array.from({ length: 8 }, (_, i) => ({ x: i * 42 + Math.floor(rand(i, 4) * 12), h: 14 + rand(i, 5) * 24, w: 8 + rand(i, 6) * 10 }));
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
    for (const cx of [64, 160, 256]) windowGlass(P, cx, 30, 70, 12, ["#3a6ab0", "#c03a3a", "#e8b040", "#4aa060", "#8a50c0", "#f0e8d0"]);
    for (const x of [16, 108, 204, 296]) pillar(P, x, 10, ["#4a4038", "#6e6254", "#968a78", "#bcb2a0", "#e0d8c8", "#fffaf0"]);
    P.rect(0, 4, W, 3, hex("#c48412") >>> 0);
    P.rect(0, FLOOR_TOP - 4, W, 2, hex("#c48412") >>> 0);
    topShade(P, 30, 0.35);
    floor(P, ["#3a3028", "#5c5044", "#8a7c68", "#b4a890", "#dcd2bc", "#f4eedc"], { seed: seed + 1, checker: true, tile: 26, base: 0.5, grout: 0.15 });
    vignette(P, 0.7);
  },
  hub(buf, seed = 6) {
    const P = new Paint(buf);
    sky(P, ["#05040c", "#0a0818", "#120e26", "#1c1636", "#281e48", "#3a2a5a"], { stars: true, seed, moon: [60, 30, 7] });
    spire(P, 230, FLOOR_TOP - 10, 104);
    ridge(P, ["#06050c", "#0c0a16", "#141020", "#1c162a", "#3a2a5a"], 100, 30, { seed: seed + 2, freq: 0.018 });
    trees(P, ["#040308", "#0a0812", "#120e1c", "#1a1428"], FLOOR_TOP + 2, { seed, n: 18, h: 36 });
    floor(P, ["#08060c", "#100c14", "#18141e", "#211b28", "#2c2434", "#3a3042"], { seed: seed + 4, style: "rock", base: 0.42, var: 0.25 });
    // grass tufts
    for (let i = 0; i < 160; i++) {
      const x = Math.floor(rand(i, 3) * W), y = FLOOR_TOP + 2 + Math.floor(rand(i, 4) * (H - FLOOR_TOP - 3));
      P.px(x, y, hex(i % 3 ? "#1e2a1a" : "#2c3c24") >>> 0);
      P.px(x, y - 1, hex("#16201a") >>> 0);
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
