// Build: bundle the game into dist/ (index.html + game.js), plus a single self-contained dist/emberspire.html.
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
await mkdir(ROOT + "dist", { recursive: true });
// the effects worker is bundled first and carried inside the game as source, so even the single-file build can spawn it
const wr = await build({ entryPoints: [ROOT + "src/engine/fxworker.js"], bundle: true, minify: true, format: "iife", target: "es2020", write: false, legalComments: "none" });
const workerSrc = wr.outputFiles[0].text;
const r = await build({ entryPoints: [ROOT + "src/main.js"], bundle: true, minify: true, format: "iife", target: "es2020", write: false, legalComments: "eof", define: { __FX_WORKER_SRC__: JSON.stringify(workerSrc) }, logOverride: { "empty-import-meta": "silent" } });
const js = r.outputFiles[0].text;
const html = await readFile(ROOT + "index.html", "utf8");
const tag = '<script type="module" src="./src/main.js"></script>';
await writeFile(ROOT + "dist/game.js", js);
await writeFile(ROOT + "dist/index.html", html.replace(tag, '<script src="./game.js"></script>'));
await writeFile(ROOT + "dist/emberspire.html", html.replace(tag, () => `<script>${js.replace(/<\/script/g, "<\\/script")}</script>`));
// a page for hosts that supply the document skeleton themselves (a claude.ai Artifact): title, style, canvas, script
const style = html.match(/<style>[\s\S]*?<\/style>/)[0]
  .replace(":root { color-scheme: dark; }", ":root { --ink: #07060b; --ember: #ff9a4a; --text: #cfc8ff; color-scheme: dark; }")
  .replace("html, body { margin: 0; height: 100%; background: #07060b;", "html, body { margin: 0; height: 100%; background: var(--ink);")
  .replace("color: #cfc8ff; }", "color: var(--text); }")
  .replace("color: #ff9a4a; }", "color: var(--ember); }");
await writeFile(ROOT + "dist/artifact.html", `<title>Emberspire</title>\n${style}\n<canvas id="game" width="320" height="180" tabindex="0"></canvas>\n<div id="boot">KINDLING THE EMBER…</div>\n<script>${js.replace(/<\/script/g, "<\\/script")}</script>\n<script>document.getElementById("game").focus();</script>\n`);
await cp(ROOT + "vendor/pixelfx/LICENSE", ROOT + "dist/PIXELFX-LICENSE.txt");
console.log(`dist/game.js ${(js.length / 1024).toFixed(0)} KB (worker ${(workerSrc.length / 1024).toFixed(0)} KB inside)`);
