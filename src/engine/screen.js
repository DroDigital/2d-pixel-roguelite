// The screen: a 320 x 180 pixelfx frame for the world, another for the HUD, composited into one canvas and scaled up
// with crisp pixels. The world's background is a Uint32Array the room paints once.

import { createFrame, clearFrame, composite } from "./pfx.js";

export const W = 320, H = 180;

export class Screen {
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.img = this.ctx.createImageData(W, H);
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
    this.canvas.style.width = `${Math.floor(W * s)}px`;
    this.canvas.style.height = `${Math.floor(H * s)}px`;
  }
  begin() {
    clearFrame(this.frame);
    clearFrame(this.hud);
  }
  present() {
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
