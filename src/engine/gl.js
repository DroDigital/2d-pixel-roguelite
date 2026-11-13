// The GPU presenter: instead of compositing 57,600 pixels a frame in JavaScript, the world's color and light, the
// backdrop and the HUD go up as textures and one fragment shader puts them together at the display's own resolution,
// with screen shake, dimming, flashes, an optional glow (a soft bloom of the light buffer) and optional scanlines.

const VS = `#version 300 es
in vec2 a;
out vec2 uv;
void main() { uv = vec2(a.x * 0.5 + 0.5, 0.5 - a.y * 0.5); gl_Position = vec4(a, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uBg, uCol, uLit, uHudC, uHudL;
uniform vec2 uShake, uSize;
uniform float uDim, uFlash, uGlow, uScan, uRows;
uniform vec3 uFlashC;
in vec2 uv;
out vec4 o;
vec3 lightAt(ivec2 p) { return texelFetch(uLit, clamp(p, ivec2(0), ivec2(319, 179)), 0).rgb; }
void main() {
  vec2 px = uv * uSize - uShake;
  if (px.x < 0.0 || px.y < 0.0 || px.x >= uSize.x || px.y >= uSize.y) { o = vec4(0.027, 0.024, 0.043, 1.0); return; }
  ivec2 p = ivec2(px);
  vec3 bg = texelFetch(uBg, p, 0).rgb;
  vec4 c = texelFetch(uCol, p, 0);
  vec3 col = mix(bg, c.rgb, c.a);
  col = min(col + lightAt(p), 1.0);
  if (uGlow > 0.0) {
    // light bleeds a little into its surroundings
    vec3 b = vec3(0.0);
    for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
      float w = 1.0 / (1.0 + float(x * x + y * y));
      b += lightAt(p + ivec2(x * 2, y * 2)) * w;
    }
    col = min(col + b * (uGlow / 9.0), 1.0);
  }
  col *= 1.0 - uDim;
  vec4 h = texelFetch(uHudC, p, 0);
  col = mix(col, h.rgb, h.a);
  col = min(col + texelFetch(uHudL, p, 0).rgb, 1.0);
  col = mix(col, uFlashC, uFlash);
  if (uScan > 0.0) col *= 1.0 - uScan * step(0.5, fract(px.y)) * step(2.5, uRows);
  o = vec4(col, 1.0);
}`;

export class GLPresenter {
  constructor(canvas, W, H, force = false) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance", desynchronized: true });
    if (!gl) throw new Error("no webgl2");
    // a software rasterizer is slower than compositing in JS: only use real GPUs unless told to
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    this.device = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    if (!force && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(this.device)) {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      throw new Error(`software GL (${this.device})`);
    }
    this.gl = gl;
    this.W = W;
    this.H = H;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    this.pr = pr;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = ["uBg", "uCol", "uLit", "uHudC", "uHudL"].map((name, i) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, W, H);
      gl.uniform1i(gl.getUniformLocation(pr, name), i);
      return t;
    });
    this.u = Object.fromEntries(["uShake", "uSize", "uDim", "uFlash", "uFlashC", "uGlow", "uScan", "uRows"].map((n) => [n, gl.getUniformLocation(pr, n)]));
    gl.uniform2f(this.u.uSize, W, H);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    this.lost = false;
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); this.lost = true; });
  }
  upload(i, u32) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[i]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.W, this.H, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(u32.buffer, u32.byteOffset, this.W * this.H * 4));
  }
  present(s) {
    const gl = this.gl, c = gl.canvas;
    if (this.lost) return;
    gl.viewport(0, 0, c.width, c.height);
    this.upload(0, s.bg);
    this.upload(1, s.frame.color);
    this.upload(2, s.frame.light);
    this.upload(3, s.hud.color);
    this.upload(4, s.hud.light);
    const u = this.u, [fr, fg, fb] = s.flashColor;
    gl.uniform2f(u.uShake, s.shake[0], s.shake[1]);
    gl.uniform1f(u.uDim, s.dim);
    gl.uniform1f(u.uFlash, s.flash > 0.01 ? Math.min(1, s.flash) : 0);
    gl.uniform3f(u.uFlashC, fr / 255, fg / 255, fb / 255);
    gl.uniform1f(u.uGlow, s.glow ? 0.9 : 0);
    gl.uniform1f(u.uScan, s.scanlines ? 0.22 : 0);
    gl.uniform1f(u.uRows, c.height / this.H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
