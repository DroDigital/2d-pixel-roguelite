// The screen: a 320 x 180 pixelfx frame for the world, another for the HUD, a text layer at twice the resolution
// (640 x 360, where the game's words are set) and a top frame for screen transitions, composited into one canvas and
// scaled up with crisp pixels. The world's background is a Uint32Array the room paints once.

import { createFrame, clearFrame, composite } from "./pfx.js";
import { GLPresenter } from "./gl.js";

export const W = 320, H = 180;
/** The text layer's resolution, per game pixel. */
export const TK = 2;

export class Screen {
  constructor(canvas, o = {}) {
    this.canvas = canvas;
    canvas.width = W * TK;
    canvas.height = H * TK;
    // the GPU composites when it can; the 2D canvas is the fallback
    if (o.renderer !== "2d")
      try {
        this.gl = new GLPresenter(canvas, W, H, o.renderer === "webgl2");
        this.kind = "webgl2";
      } catch (e) {
        console.info("WebGL2 not used, compositing in 2D:", e.message);
      }
    if (!this.gl) {
      // a canvas that tried WebGL can't switch to 2D: start over with a fresh one
      if (o.renderer !== "2d") {
        const fresh = canvas.cloneNode(false);
        canvas.replaceWith(fresh);
        this.canvas = canvas = fresh;
      }
      this.ctx = canvas.getContext("2d", { alpha: false });
      this.img = this.ctx.createImageData(W * TK, H * TK);
      this.lo = new Uint8ClampedArray(W * H * 4);
      this.kind = "canvas2d";
    }
    this.glow = o.glow ?? true;
    this.scanlines = !!o.scanlines;
    this.frame = createFrame(W, H);
    this.hud = createFrame(W, H);
    this.text = { w: W * TK, h: H * TK, color: new Uint32Array(W * TK * H * TK) };
    this.top = createFrame(W, H);
    this.bg = new Uint32Array(W * H).fill(0xff100c14);
    // the room's backdrop, as wide as the room: the world copies the part each view shows into bg every frame
    this.bgW = W;
    this.bgSrc = new Uint32Array(W * H).fill(0xff100c14);
    this.shake = [0, 0];
    this.flash = 0;
    this.flashColor = [255, 255, 255];
    this.dim = 0; // 0..1 darken the world (menus over gameplay)
    this.pixelPerfect = true;
    this.fit();
    addEventListener("resize", () => this.fit());
  }
  /** A fresh room-wide backdrop to paint into (w pixels wide, the screen's height). */
  backdrop(w = W) {
    if (this.bgW !== w || !this.bgSrc) this.bgSrc = new Uint32Array(w * H);
    this.bgW = w;
    this.bgSrc.fill(0xff100c14);
    return this.bgSrc;
  }
  fit() {
    const k = Math.min(innerWidth / W, innerHeight / H);
    const s = this.pixelPerfect && k >= 2 ? Math.floor(k) : k;
    const cw = Math.floor(W * s), ch = Math.floor(H * s);
    this.canvas.style.width = `${cw}px`;
    this.canvas.style.height = `${ch}px`;
    if (this.gl) {
      // render at the display's own pixels, so every game pixel lands crisp
      const d = Math.min(window.devicePixelRatio || 1, 3);
      this.canvas.width = Math.min(3840, Math.round(cw * d));
      this.canvas.height = Math.min(2160, Math.round(ch * d));
    }
  }
  begin() {
    clearFrame(this.frame);
    clearFrame(this.hud);
    clearFrame(this.top);
    this.text.color.fill(0);
  }
  present() {
    if (this.gl) return this.gl.present(this);
    const lo = this.lo;
    composite(this.frame, lo, this.bg);
    if (this.dim > 0) {
      const k = 1 - this.dim;
      for (let i = 0; i < lo.length; i += 4) {
        lo[i] *= k;
        lo[i + 1] *= k;
        lo[i + 2] *= k;
      }
    }
    // the HUD, then the top layer, each its own color over what's below and its own light on top
    const over = (F, i, j, o) => {
      const c = F.color[i], l = F.light ? F.light[i] : 0;
      if (c) {
        const a = c >>> 24;
        if (a === 255) {
          o[j] = c & 255;
          o[j + 1] = (c >>> 8) & 255;
          o[j + 2] = (c >>> 16) & 255;
        } else if (a) {
          const f = a / 255;
          o[j] = (c & 255) * f + o[j] * (1 - f);
          o[j + 1] = ((c >>> 8) & 255) * f + o[j + 1] * (1 - f);
          o[j + 2] = ((c >>> 16) & 255) * f + o[j + 2] * (1 - f);
        }
      }
      if (l & 0xffffff) {
        o[j] = Math.min(255, o[j] + (l & 255));
        o[j + 1] = Math.min(255, o[j + 1] + ((l >>> 8) & 255));
        o[j + 2] = Math.min(255, o[j + 2] + ((l >>> 16) & 255));
      }
    };
    for (let i = 0, n = W * H; i < n; i++) if (this.hud.color[i] || this.hud.light[i]) over(this.hud, i, i * 4, lo);
    // up to the text layer's resolution: each game pixel becomes TK x TK (whole rows copied at once), then the words
    // and the transitions go on where they have pixels
    const out = this.img.data, o32 = (this.o32 ??= new Uint32Array(out.buffer)), l32 = (this.l32 ??= new Uint32Array(lo.buffer));
    const T = this.text, TW = T.w, TC = T.color, top = this.top;
    for (let y = 0; y < H; y++) {
      const row = y * TK * TW;
      for (let x = 0, li = y * W, j = row; x < W; x++, li++, j += TK) {
        const c = l32[li] | 0xff000000;
        o32[j] = c;
        o32[j + 1] = c;
      }
      o32.copyWithin(row + TW, row, row + TW);
    }
    for (let i = 0, n = TC.length; i < n; i++) if (TC[i]) over(T, i, i * 4, out);
    const TOPC = top.color, TOPL = top.light;
    for (let li = 0, n = W * H; li < n; li++) {
      if (!TOPC[li] && !(TOPL[li] & 0xffffff)) continue;
      const x = (li % W) * TK, y = ((li / W) | 0) * TK;
      for (let dy = 0; dy < TK; dy++) for (let dx = 0; dx < TK; dx++) over(top, li, ((y + dy) * TW + x + dx) * 4, out);
    }
    if (this.flash > 0.01) {
      const k = Math.min(1, this.flash), [r, g, b] = this.flashColor;
      for (let i = 0; i < out.length; i += 4) {
        out[i] += (r - out[i]) * k;
        out[i + 1] += (g - out[i + 1]) * k;
        out[i + 2] += (b - out[i + 2]) * k;
      }
    }
    const [sx, sy] = this.shake;
    if (sx || sy) {
      this.ctx.fillStyle = "#07060b";
      this.ctx.fillRect(0, 0, W * TK, H * TK);
    }
    this.ctx.putImageData(this.img, sx * TK, sy * TK);
  }
}
