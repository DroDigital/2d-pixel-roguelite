// Accented capitals for German, Spanish and French, built from the pixel fonts' own letters: an accent row above
// (with a row of air between) or a cedilla below. Text is upper-cased before drawing, so capitals are all we need
// (and JavaScript upper-cases ß to SS).

const ACCENTS = {
  // mini (3 wide): one row of accent
  mini: { acute: ["..#"], grave: ["#.."], circ: [".#."], diaer: ["#.#"], tilde: ["###"] },
  // big (5 wide): two rows of accent
  big: { acute: ["...#.", "..#.."], grave: [".#...", "..#.."], circ: ["..#..", ".#.#."], diaer: [".....", ".#.#."], tilde: [".##.#", "#..#."] },
};
const CEDILLA = { mini: [".#.", "#.."], big: ["..#..", ".##.."] };
const MARKS = {
  À: ["A", "grave"], Â: ["A", "circ"], Ä: ["A", "diaer"], Á: ["A", "acute"],
  É: ["E", "acute"], È: ["E", "grave"], Ê: ["E", "circ"], Ë: ["E", "diaer"],
  Í: ["I", "acute"], Î: ["I", "circ"], Ï: ["I", "diaer"], Ì: ["I", "grave"],
  Ó: ["O", "acute"], Ô: ["O", "circ"], Ö: ["O", "diaer"], Ò: ["O", "grave"],
  Ú: ["U", "acute"], Û: ["U", "circ"], Ü: ["U", "diaer"], Ù: ["U", "grave"],
  Ñ: ["N", "tilde"], Ÿ: ["Y", "diaer"],
};
const row = (s) => [...s].map((c) => c === "#");

/** Fit an accent pattern to a glyph's width (centred). */
function fit(pat, w) {
  const pw = pat.length;
  if (pw === w) return row(pat);
  const off = Math.floor((w - pw) / 2), out = Array(w).fill(false);
  [...pat].forEach((c, i) => { if (c === "#" && i + off >= 0 && i + off < w) out[i + off] = true; });
  return out;
}

export function installLatin(FONTS) {
  for (const f of ["mini", "big"]) {
    const G = FONTS[f].glyphs;
    for (const [ch, [baseCh, mark]] of Object.entries(MARKS)) {
      const b = G[baseCh];
      if (!b) continue;
      const acc = ACCENTS[f][mark].map((r) => fit(r, b.w));
      G[ch] = { w: b.w, oy: -(acc.length + 1), rows: [...acc, Array(b.w).fill(false), ...b.rows] };
    }
    const c = G.C;
    G["Ç"] = { w: c.w, oy: 0, rows: [...c.rows, ...CEDILLA[f].map((r) => fit(r, c.w))] };
    // ¡ and ¿: their upright twins turned over
    for (const [inv, up] of [["¡", "!"], ["¿", "?"]]) {
      const g = G[up];
      G[inv] = { w: g.w, oy: 0, rows: g.rows.slice().reverse().map((r) => r.slice().reverse()) };
    }
  }
}
