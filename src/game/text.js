// The text layer: every word the game prints is drawn here, in Jersey 10 at its native size, on a layer with twice
// the game's resolution (640 x 360 over the 320 x 180 world). A Jersey capital is 10 px tall with 2 px strokes, so
// on this layer it stands 5 game pixels tall, the size of the old 3x5 font, with all of the font's detail.
//
// Sizes keep their old meaning. The small font ("mini") at scale k is Jersey at k, 5k game pixels tall as before.
// Headings ("big", 7k game pixels tall before) are Jersey at k + 1: 10, 15 and 20 game pixels for scales 1 to 3.
//
// The layer sits over the HUD and under screen transitions; a panel drawn over earlier text clears it (eraseText).
// Coordinates and sizes in and out are game pixels, so callers don't change.

import { G } from "./ctx.js";
import { JERSEY } from "./lang/jersey.js";
import { decode } from "./lang/decode.js";

export const TK = 2; // text pixels per game pixel
const LATIN = decode(JERSEY.glyphs), SPACE = JERSEY.space;
let GLYPHS = { ...LATIN };

/** The glyphs drawn: Jersey's Latin plus the current language's CJK set (from i18n.setLang). */
export function setTextGlyphs(extra = {}) {
  GLYPHS = { ...LATIN, ...extra };
}
const glyph = (ch) => GLYPHS[ch] ?? GLYPHS[ch.toUpperCase()];

/** The Jersey scale for a font and size. */
export const textScale = (font = "mini", k = 1) => (font === "big" ? k + 1 : k);

/** Width in text-layer pixels. */
function widthHi(str, s) {
  let w = 0;
  for (const ch of str) {
    const g = glyph(ch);
    w += g ? (g.w + 1) * s : SPACE * s;
  }
  return Math.max(0, w - s);
}
/** Width in game pixels of a string in a font and size. */
export const measure = (str, font = "mini", k = 1) => widthHi(String(str), textScale(font, k)) / TK;

/** The 640 x 360 layer (made by the screen). */
const layer = () => G.screen.text;

/** Clear the text under a rectangle (game pixels): a panel drawn over earlier words hides them. */
export function eraseText(x, y, w, h) {
  const T = layer();
  if (!T) return;
  const x0 = Math.max(0, Math.floor(x * TK)), y0 = Math.max(0, Math.floor(y * TK)), x1 = Math.min(T.w, Math.ceil((x + w) * TK)), y1 = Math.min(T.h, Math.ceil((y + h) * TK));
  for (let yy = y0; yy < y1; yy++) T.color.fill(0, yy * T.w + x0, yy * T.w + x1);
}

function put(T, x, y, c, a) {
  if (x < 0 || y < 0 || x >= T.w || y >= T.h) return;
  const i = y * T.w + x;
  if (a >= 1) return void (T.color[i] = c | 0xff000000);
  const old = T.color[i], oa = (old >>> 24) / 255, na = a + oa * (1 - a);
  if (na <= 0) return;
  const mix = (sh) => Math.round((((c >>> sh) & 255) * a + ((old >>> sh) & 255) * oa * (1 - a)) / na);
  T.color[i] = ((Math.round(na * 255) << 24) | (mix(16) << 16) | (mix(8) << 8) | mix(0)) >>> 0;
}

/**
 * Draw a string. x, y: game pixels (the top of the capitals, as before). c: a color, or (gx, gy) => color in the old
 * font's pixel coordinates (gradients). o: { font, scale, align, outline (color), shadow (color), a (alpha), dim }.
 */
export function drawText(str, x, y, c, o = {}) {
  const T = layer();
  if (!T) return;
  const font = o.font ?? "mini", k = o.scale ?? 1, s = textScale(font, k), a = o.a ?? 1;
  if (a <= 0.01) return;
  const w = widthHi(str, s);
  const left = Math.round(x * TK - (o.align === "center" ? w / 2 : o.align === "right" ? w : 0));
  // headings are taller than they were: keep them centred on the old line
  const top = Math.round(y * TK) + (font === "big" ? 7 * k - 5 * s : 0);
  const oldH = font === "big" ? 7 : 5, fy = oldH / 10;
  const dim = o.dim ? 1 - o.dim : 1;
  const shade = (col) => (dim >= 1 ? col : ((col & 0xff000000) | (Math.round(((col >>> 16) & 255) * dim) << 16) | (Math.round(((col >>> 8) & 255) * dim) << 8) | Math.round((col & 255) * dim)) >>> 0);
  // every inked pixel of the string, in glyph pixels from the top-left
  const ink = [];
  let cx = 0;
  for (const ch of str) {
    const g = glyph(ch);
    if (!g) {
      cx += SPACE;
      continue;
    }
    const oy = g.oy ?? 0;
    for (let r = 0; r < g.rows.length; r++) for (let q = 0; q < g.w; q++) if (g.rows[r][q]) ink.push(cx + q, r + oy);
    cx += g.w + 1;
  }
  const block = (gx, gy, dx, dy, grow, col) => {
    const px = left + gx * s + dx - grow, py = top + gy * s + dy - grow, n = s + grow * 2;
    for (let yy = 0; yy < n; yy++) for (let xx = 0; xx < n; xx++) put(T, px + xx, py + yy, col, a);
  };
  // the outline is one text pixel per scale step: as heavy, relative to the strokes, as the old 1 px outline
  if (o.outline !== undefined && o.outline !== null) {
    const ol = shade(o.outline), grow = Math.max(1, s);
    for (let i = 0; i < ink.length; i += 2) block(ink[i], ink[i + 1], 0, 0, grow, ol);
  }
  if (o.shadow !== undefined && o.shadow !== null) {
    const sh = shade(o.shadow), off = Math.max(2, s);
    for (let i = 0; i < ink.length; i += 2) block(ink[i], ink[i + 1], off, off, 0, sh);
  }
  const fn = typeof c === "function";
  for (let i = 0; i < ink.length; i += 2) block(ink[i], ink[i + 1], 0, 0, 0, shade(fn ? c(ink[i], ink[i + 1] * fy) : c));
}
