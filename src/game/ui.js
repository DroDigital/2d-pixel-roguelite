// Drawing helpers for menus and the HUD: panels, wrapped pixel text, icons.

import { painterFor, hex, textWidth } from "../engine/pfx.js";
import { bake, blit } from "../engine/bake.js";
import { G } from "./ctx.js";
import { L, isCJK, lineExtra } from "./i18n.js";

export const INK = hex("#0b0a10") >>> 0;
export const C = Object.fromEntries(Object.entries({
  white: "#ffffff", text: "#e8e2ff", dim: "#8a82a8", dark: "#4a4462", gold: "#ffd84a", ember: "#ff8a2a", red: "#ff4a4a", green: "#7ee88a",
  blue: "#58b4ec", violet: "#c684ff", panel: "#14111c", panel2: "#1e1a2a", edge: "#3a3450", edgeHi: "#6a6088",
}).map(([k, v]) => [k, hex(v) >>> 0]));

export const P = (frame) => painterFor(frame ?? G.screen.hud);

/** Text with a dark outline. o: { font, scale, align, color fn, shadow, a }. */
export function text(str, x, y, c = C.text, o = {}) {
  const s = String(L(str)).toUpperCase(), font = o.font ?? "mini", k = o.scale ?? 1;
  const st = { outline: o.outline === false ? undefined : (o.outline ?? INK), font, scale: k, align: o.align ?? "left", a: o.a ?? 1, shadow: o.shadow };
  if (o.max && textWidth(s, font) * k > o.max) return squeeze(s, x, y, c, o.max, st, o.frame);
  P(o.frame).text(s, x, y, c, st);
}
/** Too wide for its room (a long translation): cut short with "..". */
function squeeze(s, x, y, c, max, st, frame) {
  const k = st.scale;
  let chars = [...s];
  while (chars.length > 1 && textWidth(chars.join("") + "..", st.font) * k > max) chars.pop();
  P(frame).text(chars.join("").trimEnd() + "..", x, y, c, st);
}
export const width = (str, font = "mini", scale = 1) => textWidth(String(L(str)).toUpperCase(), font) * scale;

/** Word-wrap to a pixel width; returns lines. */
export function wrap(str, w, font = "mini") {
  // words are runs between spaces; in Chinese and Japanese every character is a word of its own (no spaces)
  const s = String(L(str)).toUpperCase(), tokens = [], lines = [];
  for (const m of s.matchAll(/(\s+)|([\u2e80-\u9fff\u3000-\u303f\uff00-\uffef])|([^\s\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]+)/g)) {
    if (m[1]) { if (tokens.length) tokens[tokens.length - 1].sp = true; continue; }
    tokens.push({ s: m[2] ?? m[3], sp: false });
  }
  let line = "", prevSp = false;
  for (const tk of tokens) {
    const next = line ? line + (prevSp ? " " : "") + tk.s : tk.s;
    // closing punctuation never starts a line
    if (textWidth(next, font) > w && line && !NO_START.includes(tk.s)) {
      lines.push(line);
      line = tk.s;
    } else line = next;
    prevSp = tk.sp;
  }
  if (line) lines.push(line);
  return lines;
}
const NO_START = "、。，．！？：；）」』】〉》ー…・,.!?:;)";
export function para(str, x, y, w, c = C.text, o = {}) {
  const lines = wrap(str, w, o.font), lh = (o.lh ?? (o.font === "big" ? 9 : 7)) + lineExtra();
  lines.forEach((l, i) => text(l, o.align === "center" ? x + w / 2 : x, y + i * lh, c, { ...o, align: o.align ?? "left" }));
  return lines.length * lh;
}

/** A framed panel: dark fill, a lit top-left edge, a dark bottom-right, corner studs. */
export function panel(x, y, w, h, o = {}) {
  const p = P(o.frame), fill = o.fill ?? C.panel, edge = o.edge ?? C.edge, hi = o.hi ?? C.edgeHi, a = o.a ?? 0.92;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const border = i === 0 || j === 0 || i === w - 1 || j === h - 1;
      if (border && (i === 0 || i === w - 1) && (j === 0 || j === h - 1)) continue;
      const c = border ? (i === 0 || j === 0 ? hi : edge) : j < 2 ? C.panel2 : fill;
      if (border) p.px(x + i, y + j, c);
      else p.blend(x + i, y + j, c, a);
    }
  if (o.glow) for (let i = 1; i < w - 1; i++) { p.light(x + i, y, o.glow, 0.5); p.light(x + i, y + h - 1, o.glow, 0.3); }
}
export function bar(x, y, w, h, t, c, o = {}) {
  const p = P(o.frame);
  p.rect(x - 1, y - 1, w + 2, h + 2, INK);
  p.rect(x, y, w, h, o.bg ?? hex("#2a2438") >>> 0);
  if (o.trail !== undefined && o.trail > t) p.rect(x, y, Math.round(w * o.trail), h, C.white);
  p.rect(x, y, Math.round(w * Math.max(0, Math.min(1, t))), h, c);
  if (h > 2) p.rect(x, y, Math.round(w * Math.max(0, Math.min(1, t))), 1, hex("#ffffff") >>> 0, 0.35);
  if (o.glow) for (let i = 0; i < Math.round(w * t); i++) p.light(x + i, y + h / 2, c, o.glow);
}

/** A baked pixelfx loop as an icon (clipped to nothing; keep it small). */
export function icon(id, x, y, t, opts = {}, o = {}) {
  blit(o.frame ?? G.screen.hud, bake(id, opts, o.fps ?? 20), x, y, t, { light: o.light ?? 0.7, alpha: o.alpha ?? 1, tint: o.tint, tintK: o.tintK });
}

export const HEART = [".kkk.kkk.", "kRRRkRRRk", "kRrRRRRRk", "kRRRRRRRk", ".kRRRRRk.", "..kRRRk..", "...kRk...", "....k...."];
export const HEART_HALF = [".kkk.kkk.", "kRRRkeeek", "kRrReeeek", "kRRReeeek", ".kRReeek.", "..kReek..", "...kek...", "....k...."];
export const HEART_EMPTY = [".kkk.kkk.", "keeekeeek", "keeeeeeek", "keeeeeeek", ".keeeeek.", "..keeek..", "...kek...", "....k...."];
export const HEART_PAL = { k: "#0b0a10", R: "#e8304a", r: "#ffb0b8", e: "#3a2030" };
export const SHIELD_PAL = { k: "#0b0a10", R: "#58b4ec", r: "#d8f4ff", e: "#1a2a40" };

// the pixel fonts have no brackets: add them, for key prompts like [E]
import { FONTS } from "../engine/pfx.js";
const glyph = (src) => { const rows = src.split("|"); return { w: rows[0].length, rows: rows.map((r) => [...r].map((c) => c === "#")) }; };
Object.assign(FONTS.mini.glyphs, { "[": glyph("##|#.|#.|#.|##"), "]": glyph("##|.#|.#|.#|##") });
Object.assign(FONTS.big.glyphs, { "[": glyph("###|#..|#..|#..|#..|#..|###"), "]": glyph("###|..#|..#|..#|..#|..#|###") });
