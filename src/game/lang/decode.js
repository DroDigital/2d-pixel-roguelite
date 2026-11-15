// Glyph data, as the generators write it: "char:width,top row,row,row,..." per glyph, each row a hex bitmask (bit 0 is
// the leftmost column), glyphs joined by "|". Decodes to the pixel fonts' format: { w, oy, rows: [[bool]] }.
export function decode(src = "") {
  const out = {};
  if (!src) return out;
  for (const item of src.split("|")) {
    const i = item.indexOf(":", 1), ch = item.slice(0, i), [w, oy, ...rows] = item.slice(i + 1).split(",");
    const W = +w;
    out[ch] = { w: W, oy: +oy, rows: rows.map((r) => { const b = parseInt(r, 16); return Array.from({ length: W }, (_, c) => !!((b >> c) & 1)); }) };
  }
  return out;
}
