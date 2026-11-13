// The screen: a 320 x 180 pixelfx frame for the world, another for the HUD, composited into one canvas and scaled up
// with crisp pixels. The world's background is a Uint32Array the room paints once.

import { createFrame, clearFrame, composite } from "./pfx.js";
import { GLPresenter } from "./gl.js";

export const W = 320, H = 180;

export class Screen {
  constructor(canvas, o = {}) {
    this.canvas = canvas;
    canvas.width = W;
    canvas.height = H;
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
      this.img = this.ctx.createImageData(W, H);
      this.kind = "canvas2d";
    }
    this.glow = o.glow ?? true;
    this.scanlines = !!o.scanlines;
    this.frame = createFrame(W, H);
    this.hud = createFrame(W, H);
    this.bg = new Uint32Array(W * H).fill(0xff100c14);
    this.shake = [0, 0];
    this.flash = 0;
    this.flashColor = [255, 255, 255];
    this.dim = 0; // 0..1 darken the world (menus over gameplay)
    this.pixelPerfect = true;
    this.fit();
    addEventListener("resize", () => this.fit());
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
  }
  present() {
    if (this.gl) return this.gl.present(this);
    const out = this.img.data;
    composite(this.frame, out, this.bg);
    if (this.dim > 0) {
      const k = 1 - this.dim;
      for (let i = 0; i < out.length; i += 4) {
        out[i] *= k;
        out[i + 1] *= k;
        out[i + 2] *= k;
      }
    }
    // the HUD: its own color over the world, its own light on top
    const C = this.hud.color, L = this.hud.light, n = W * H;
    for (let i = 0; i < n; i++) {
      const c = C[i], l = L[i];
      if (!c && !l) continue;
      const j = i * 4;
      if (c) {
        const a = c >>> 24;
        if (a === 255) {
          out[j] = c & 255;
          out[j + 1] = (c >>> 8) & 255;
          out[j + 2] = (c >>> 16) & 255;
        } else {
          const f = a / 255;
          out[j] = (c & 255) * f + out[j] * (1 - f);
          out[j + 1] = ((c >>> 8) & 255) * f + out[j + 1] * (1 - f);
          out[j + 2] = ((c >>> 16) & 255) * f + out[j + 2] * (1 - f);
        }
      }
      if (l & 0xffffff) {
        out[j] = Math.min(255, out[j] + (l & 255));
        out[j + 1] = Math.min(255, out[j + 1] + ((l >>> 8) & 255));
        out[j + 2] = Math.min(255, out[j + 2] + ((l >>> 16) & 255));
      }
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
      this.ctx.fillRect(0, 0, W, H);
    }
    this.ctx.putImageData(this.img, sx, sy);
  }
}
