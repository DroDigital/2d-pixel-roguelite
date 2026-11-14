// Lists every piece of on-screen text in the game and reports, per language, which are missing a translation (and
// which translations no longer match any text). On-screen text is written in capitals in this codebase, so the scan
// takes every string literal with two capitals in a row and no lower case; t("...") keys are included the same way.
//
//   node tools/i18n-check.mjs            report
//   node tools/i18n-check.mjs --keys     print the keys, one per line
//   node tools/i18n-check.mjs --strict   exit 1 if anything is missing (for CI)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = [path.join(root, "src/game"), path.join(root, "src/engine/input.js")];
// debug and benchmark readouts stay in English
const SKIP = new Set(["bench.js", "i18n.js"]);
const IGNORE = new Set(["EMBERSPIRE", "GPU", "FPS", "BENCH", "AVG CPU MS", "WORKERS", "P1", "P2", "P3", "P4", "OK"]);

export function collect() {
  const files = [];
  for (const s of SRC) {
    if (s.endsWith(".js")) files.push(s);
    else for (const f of fs.readdirSync(s)) if (f.endsWith(".js") && !SKIP.has(f)) files.push(path.join(s, f));
  }
  const keys = new Map();
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
      let v = m[2];
      if (m[1] === "`") {
        if (v.includes("${")) continue; // built text goes through t() with placeholders
      }
      v = v.replace(/\\(.)/g, "$1");
      if (!/[A-Z]{2}/.test(v) || /[a-z]/.test(v) || IGNORE.has(v)) continue;
      if (/^[A-Z][A-Z0-9_]*$/.test(v) && /_/.test(v)) continue; // CONSTANT_NAMES
      if (/^(Key|Arrow|Numpad|Digit)/.test(v)) continue;
      if (!keys.has(v)) keys.set(v, path.basename(f));
    }
  }
  // t("...") calls inside template strings
  for (const f of files) for (const m of fs.readFileSync(f, "utf8").matchAll(/\bt\("((?:\\.|[^"\\])*)"/g)) if (!keys.has(m[1])) keys.set(m[1], path.basename(f));
  return keys;
}

/** The characters the game can draw in a language. */
async function glyphs(id) {
  const imp = (p) => import(pathToFileURL(path.join(root, p)).href);
  const { FONTS } = await imp("vendor/pixelfx/core/font.js");
  const { installLatin } = await imp("src/game/lang/latin.js");
  const { CJK } = await imp("src/game/lang/glyphs.js");
  const F = { mini: { glyphs: { ...FONTS.mini.glyphs, "[": 1, "]": 1 } }, big: { glyphs: { ...FONTS.big.glyphs, "[": 1, "]": 1 } } };
  installLatin({ mini: { glyphs: F.mini.glyphs }, big: { glyphs: F.big.glyphs } });
  const set = new Set(Object.keys(F.mini.glyphs));
  for (const s of [CJK[id], CJK.names]) if (s) for (const item of s.mini.split("|")) set.add(item.slice(0, item.indexOf(":", 1)));
  return set;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const keys = collect();
  if (process.argv.includes("--keys")) {
    console.log([...keys.keys()].join("\n"));
    process.exit(0);
  }
  let bad = 0;
  for (const id of ["de", "es", "fr", "zh", "ja"]) {
    const dict = (await import(pathToFileURL(path.join(root, `src/game/lang/${id}.js`)).href)).default;
    const missing = [...keys.keys()].filter((k) => !(k in dict));
    const unused = Object.keys(dict).filter((k) => !keys.has(k));
    // a translation must keep every {n} placeholder of its key
    const holes = Object.entries(dict).filter(([k, v]) => (k.match(/\{\d\}/g) ?? []).sort().join() !== (v.match(/\{\d\}/g) ?? []).sort().join());
    console.log(`${id}: ${Object.keys(dict).length} translated, ${missing.length} missing, ${unused.length} unused, ${holes.length} placeholder mismatches`);
    for (const k of missing) console.log(`  missing  ${k}   (${keys.get(k)})`);
    for (const k of unused) console.log(`  unused   ${k}`);
    for (const [k, v] of holes) console.log(`  holes    ${k}  ->  ${v}`);
    // every character must have a glyph: the Latin fonts (with accents) or this language's CJK set
    const have = await glyphs(id), lost = [...new Set(Object.values(dict).join("").replace(/\{\d\}/g, "").toUpperCase())].filter((c) => c !== " " && !have.has(c));
    if (lost.length) console.log(`  no glyph for: ${lost.join(" ")}`);
    bad += missing.length + holes.length + lost.length;
  }
  console.log(`${keys.size} keys`);
  if (process.argv.includes("--strict") && bad) process.exit(1);
}
