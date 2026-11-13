// The app icon, drawn with pixelfx like everything else: the spire under a night sky with its ember burning on top,
// 64 x 64 pixels scaled up crisp to 1024. Writes desktop/icons/icon.png (electron-builder makes .icns and .ico from it).
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { createFrame, createFx, composite, hex, mix, PAL } from "../vendor/pixelfx/core/index.js";
import * as flame from "../vendor/pixelfx/fx/fire/spirit-flame.js";

const N = 64, K = 16, ROOT = fileURLToPath(new URL("..", import.meta.url));
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const sky = ["#0a0818", "#140e28", "#21163a", "#2e1e4a", "#4a2a5a", "#6a3450"].map(hex);
const bg = new Uint32Array(N * N);
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const t = y / (N - 1), s = Math.min(sky.length - 1, Math.floor(t * (sky.length - 1) + BAYER[((y & 3) << 2) | (x & 3)]));
    let c = sky[s];
    const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    if (h - Math.floor(h) > 0.975 && y < 40 && Math.abs(x - 32) > 9) c = hex("#cfc8ff");
    bg[y * N + x] = c;
  }
// the spire: a dark needle widening to the ground, a lit rim on its left
const ink = hex("#0a0812"), rim = hex("#3a2440");
for (let y = 38; y < N; y++) {
  const hw = 1.5 + ((y - 38) / 26) * 9 + (Math.floor(y / 7) % 3 === 0 ? 1 : 0);
  for (let dx = -Math.floor(hw); dx <= Math.floor(hw); dx++) bg[y * N + 32 + dx] = dx === -Math.floor(hw) ? rim : ink;
}
for (const [x, y] of [[31, 45], [33, 51], [31, 57]]) bg[y * N + x] = hex("#ff9a3c");
// hills
for (let x = 0; x < N; x++) for (let y = 56 + Math.round(Math.sin(x * 0.2) * 2); y < N; y++) bg[y * N + x] = mix(ink, hex("#140e20"), 0.5);
// the ember, a pixelfx spirit flame, a few frames in
const f = createFrame(N, N), fx = createFx(flame, { x: 32, y: 44, palette: PAL.fire });
for (let i = 0; i < 20; i++) fx.update(1 / 30);
fx.draw(f, "back");
fx.draw(f, "front");
const rgba = new Uint8ClampedArray(N * N * 4);
composite(f, rgba, bg);
// a rounded tile, then scale up
const S = N * K, img = Buffer.alloc(S * (S * 4 + 1));
const inside = (x, y) => {
  const r = 10, cx = Math.min(Math.max(x, r), N - 1 - r), cy = Math.min(Math.max(y, r), N - 1 - r);
  return Math.hypot(x - cx, y - cy) <= r + 0.3;
};
for (let y = 0; y < S; y++) {
  img[y * (S * 4 + 1)] = 0;
  for (let x = 0; x < S; x++) {
    const px = Math.floor(x / K), py = Math.floor(y / K), s = (py * N + px) * 4, d = y * (S * 4 + 1) + 1 + x * 4, a = inside(px, py) ? 255 : 0;
    img[d] = rgba[s]; img[d + 1] = rgba[s + 1]; img[d + 2] = rgba[s + 2]; img[d + 3] = a;
  }
}
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), cr = Buffer.alloc(4); len.writeUInt32BE(data.length); cr.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, cr]); };
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(img, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
mkdirSync(ROOT + "desktop/icons", { recursive: true });
writeFileSync(ROOT + "desktop/icons/icon.png", png);
console.log(`desktop/icons/icon.png ${S}x${S}, ${(png.length / 1024).toFixed(0)} KB`);
