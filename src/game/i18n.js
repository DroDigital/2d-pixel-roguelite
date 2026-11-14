// Languages. The English text is the key: t("ROOM CLEARED") looks it up in the current language's dictionary and
// falls back to the English. {0}, {1}... are filled from the arguments (and arguments that are themselves keys, like a
// vessel's name, are translated too).
//
// Text drawn through ui.text / para / width is looked up automatically, so plain literals and game data (boon names,
// vessels, foes) need no call at all; only text built from pieces needs t().
//
// The pixel fonts get the extra letters each language needs: accented capitals for German, Spanish and French, and
// for Chinese and Japanese pixel glyphs cut from Fusion Pixel (OFL) for exactly the characters the translations use.

import { FONTS } from "../engine/pfx.js";
import { FxManager } from "../engine/fxm.js";
import { installLatin } from "./lang/latin.js";
import { CJK } from "./lang/glyphs.js";
import de from "./lang/de.js";
import es from "./lang/es.js";
import fr from "./lang/fr.js";
import zh from "./lang/zh.js";
import ja from "./lang/ja.js";

export const LANGS = [
  { id: "en", name: "ENGLISH", html: "en" },
  { id: "de", name: "DEUTSCH", html: "de" },
  { id: "es", name: "ESPAÑOL", html: "es" },
  { id: "fr", name: "FRANÇAIS", html: "fr" },
  { id: "zh", name: "简体中文", html: "zh-Hans" },
  { id: "ja", name: "日本語", html: "ja" },
];
const DICTS = { de, es, fr, zh, ja };

let lang = "en", dict = null;

/** The current language's text for an English key (or the key itself). */
export const L = (s) => (dict && typeof s === "string" ? dict[s] ?? s : s);

/** Translate a key and fill its {0}, {1}... placeholders. */
export function t(key, ...args) {
  const s = L(key);
  return args.length ? s.replace(/\{(\d+)\}/g, (_, i) => String(L(args[i]) ?? "")) : s;
}

export const lang_ = () => lang;
/** Chinese and Japanese: taller glyphs (lines need more room) and no spaces between words. */
export const isCJK = () => lang === "zh" || lang === "ja";
/** Extra line height for wrapped text: CJK glyphs are taller, and accents need room (with their outline) above a line. */
export const lineExtra = () => (isCJK() ? 3 : lang === "en" ? 0 : 2);
/** A character set without spaces between words (wrap anywhere). */
export const CJK_RE = /[⺀-鿿　-〿＀-￯]/;

/** The language the browser or OS prefers, if we have it. */
export function detectLang() {
  const prefs = typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : [];
  for (const p of prefs) {
    const id = String(p ?? "").toLowerCase().split("-")[0];
    if (LANGS.some((l) => l.id === id)) return id;
  }
  return "en";
}

const base = { mini: { ...FONTS.mini.glyphs }, big: { ...FONTS.big.glyphs } };
let installed = false;

/** Switch language: swap the dictionary and the glyphs the fonts need. */
export function setLang(id) {
  if (!LANGS.some((l) => l.id === id)) id = "en";
  if (!installed) {
    installLatin(FONTS);
    base.mini = { ...FONTS.mini.glyphs };
    base.big = { ...FONTS.big.glyphs };
    installed = true;
  }
  lang = id;
  dict = DICTS[id] ?? null;
  // start from the Latin fonts, add the CJK glyphs every language menu shows (the names of the languages), then
  // the current language's own (Japanese and Chinese draw some shared characters differently)
  FONTS.mini.glyphs = { ...base.mini };
  FONTS.big.glyphs = { ...base.big };
  for (const set of ["names", id === "zh" || id === "ja" ? id : null]) {
    if (!set || !CJK[set]) continue;
    for (const f of ["mini", "big"]) Object.assign(FONTS[f].glyphs, decode(CJK[set][f]));
  }
  if (typeof document !== "undefined") document.documentElement.lang = LANGS.find((l) => l.id === id).html;
}

/** Glyph data: "char:w,oy,row,row,..." with each row a hex bitmask (bit 0 = leftmost column), joined by "|". */
function decode(src = "") {
  const out = {};
  if (!src) return out;
  for (const item of src.split("|")) {
    const i = item.indexOf(":", 1), ch = item.slice(0, i), [w, oy, ...rows] = item.slice(i + 1).split(",");
    const W = +w;
    out[ch] = { w: W, oy: +oy, rows: rows.map((r) => { const b = parseInt(r, 16); return Array.from({ length: W }, (_, c) => !!(b >> c & 1)); }) };
  }
  return out;
}

// effects that print words (toasts, level-ups, the countdown) get them translated as they spawn
FxManager.translate = L;
