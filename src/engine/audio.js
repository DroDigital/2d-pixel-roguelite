// Sound, made on the spot with WebAudio: every effect sound is a few oscillators and filtered noise with envelopes,
// and each biome has a small generative score (pad, bass, arpeggio, drums) scheduled ahead of time.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, sfx: 0.8, music: 0.55 };
    this.last = {};
    this.track = null;
    this.nextT = 0;
    this.beat = 0;
    this.muted = false;
  }
  /** Browsers start audio only after a gesture: call on the first key or click. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.comp.connect(this.master);
    this.sfx = c.createGain();
    this.sfx.connect(this.comp);
    this.mus = c.createGain();
    this.mus.connect(this.comp);
    // a little room for the music
    this.delay = c.createDelay(1);
    this.delay.delayTime.value = 0.3;
    this.fb = c.createGain();
    this.fb.gain.value = 0.32;
    this.dlp = c.createBiquadFilter();
    this.dlp.type = "lowpass";
    this.dlp.frequency.value = 2200;
    this.delay.connect(this.dlp);
    this.dlp.connect(this.fb);
    this.fb.connect(this.delay);
    this.dlp.connect(this.mus);
    this.musBus = c.createGain();
    this.musBus.connect(this.mus);
    this.musBus.connect(this.delay);
    const len = c.sampleRate * 1.5, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.applyVolume();
    setInterval(() => this.schedule(), 40);
  }
  applyVolume() {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : this.vol.master;
    this.sfx.gain.value = this.vol.sfx;
    this.mus.gain.value = this.vol.music * 0.5;
  }

  // ---- building blocks
  tone({ f = 440, f1, dur = 0.15, type = "square", vol = 0.2, a = 0.005, at = 0, dest, q, lp, detune = 0, curve = "exp" }) {
    const c = this.ctx, t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.detune.value = detune;
    if (f1) curve === "lin" ? o.frequency.linearRampToValueAtTime(f1, t + dur) : o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = o;
    if (lp) {
      const fl = c.createBiquadFilter();
      fl.type = "lowpass";
      fl.frequency.value = lp;
      if (q) fl.Q.value = q;
      o.connect(fl);
      n = fl;
    }
    n.connect(g);
    g.connect(dest ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  noise({ dur = 0.2, vol = 0.2, type = "lowpass", f = 2000, f1, q = 1, a = 0.003, at = 0, dest }) {
    const c = this.ctx, t = c.currentTime + at, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    fl.type = type;
    fl.frequency.setValueAtTime(f, t);
    if (f1) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    fl.Q.value = q;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl);
    fl.connect(g);
    g.connect(dest ?? this.sfx);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  /** Play a named sound. k scales loudness; pitch shifts it. */
  play(name, k = 1, pitch = 1) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < 0.035) return;
    this.last[name] = now;
    const S = SFX[name];
    if (S) S(this, k, pitch * (0.96 + Math.random() * 0.08));
  }

  // ---- music
  music(name) {
    if (!this.ctx) {
      this.pending = name;
      return;
    }
    if (this.track?.name === name) return;
    this.track = name ? { name, ...SONGS[name] } : null;
    this.beat = 0;
    this.nextT = this.ctx.currentTime + 0.1;
  }
  schedule() {
    if (!this.ctx) return;
    if (this.pending !== undefined) {
      const p = this.pending;
      this.pending = undefined;
      this.music(p);
    }
    const T = this.track;
    if (!T) return;
    const spb = 60 / T.bpm / 4; // sixteenth notes
    while (this.nextT < this.ctx.currentTime + 0.15) {
      this.step(T, this.beat, this.nextT - this.ctx.currentTime);
      this.beat++;
      this.nextT += spb;
    }
  }
  step(T, b, at) {
    const bar = Math.floor(b / 16), s = b % 16, chord = T.prog[bar % T.prog.length], root = T.root;
    const deg = (d) => root + T.scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
    const d = this.musBus, spb = 60 / T.bpm / 4;
    if (s === 0) {
      // the pad: a soft triad held across the bar
      for (const k of [0, 2, 4]) this.tone({ f: NOTE(deg(chord + k) + 12), dur: spb * 16, type: T.pad, vol: 0.035, a: 0.6, at, dest: d, lp: 1200, detune: (k - 2) * 4 });
    }
    if (T.bass[s]) this.tone({ f: NOTE(deg(chord) - 12), dur: spb * T.bass[s], type: "triangle", vol: 0.12, a: 0.01, at, dest: this.mus, lp: 600 });
    if (T.arp && T.arp[s] !== null && T.arp[s] !== undefined && (bar % 4 !== 3 || s < 8)) this.tone({ f: NOTE(deg(chord + T.arp[s]) + 24), dur: spb * 1.5, type: T.lead ?? "square", vol: 0.03, a: 0.004, at, dest: d, lp: 2600 });
    if (T.kick?.[s]) this.tone({ f: 120, f1: 40, dur: 0.18, type: "sine", vol: 0.32, a: 0.002, at, dest: this.mus });
    if (T.snare?.[s]) this.noise({ dur: 0.14, vol: 0.09, type: "bandpass", f: 1800, q: 0.7, at, dest: this.mus });
    if (T.hat?.[s]) this.noise({ dur: 0.04, vol: 0.035, type: "highpass", f: 7000, at, dest: this.mus });
  }
}

const P = (n) => n; // readability
const SFX = {
  swing: (A, k, p) => A.noise({ dur: 0.12, vol: 0.16 * k, type: "bandpass", f: 900 * p, f1: 3500 * p, q: 1.2 }),
  heavy: (A, k, p) => { A.noise({ dur: 0.25, vol: 0.2 * k, type: "bandpass", f: 400 * p, f1: 1200, q: 1 }); A.tone({ f: 90 * p, f1: 50, dur: 0.2, type: "sine", vol: 0.2 * k }); },
  hit: (A, k, p) => { A.noise({ dur: 0.09, vol: 0.28 * k, f: 3000 * p, f1: 600 }); A.tone({ f: 180 * p, f1: 70, dur: 0.1, type: "square", vol: 0.12 * k, lp: 1500 }); },
  thud: (A, k, p) => { A.tone({ f: 110 * p, f1: 40, dur: 0.22, type: "sine", vol: 0.35 * k }); A.noise({ dur: 0.14, vol: 0.2 * k, f: 900, f1: 200 }); },
  crit: (A, k, p) => { A.noise({ dur: 0.18, vol: 0.3 * k, f: 5000, f1: 500 }); A.tone({ f: 880 * p, f1: 1760, dur: 0.18, type: "square", vol: 0.08 * k, lp: 4000 }); A.tone({ f: 140, f1: 45, dur: 0.25, type: "sine", vol: 0.3 * k }); },
  boom: (A, k, p) => { A.noise({ dur: 0.9, vol: 0.45 * k, f: 1400 * p, f1: 80 }); A.tone({ f: 80 * p, f1: 28, dur: 0.6, type: "sine", vol: 0.45 * k }); },
  bigboom: (A, k, p) => { A.noise({ dur: 1.8, vol: 0.55 * k, f: 1000 * p, f1: 40, a: 0.01 }); A.tone({ f: 60 * p, f1: 22, dur: 1.4, type: "sine", vol: 0.5 * k }); },
  zap: (A, k, p) => { A.tone({ f: 1400 * p, f1: 200, dur: 0.16, type: "sawtooth", vol: 0.08 * k, lp: 5000 }); A.noise({ dur: 0.12, vol: 0.12 * k, type: "highpass", f: 3000 }); },
  thunder: (A, k, p) => { A.noise({ dur: 0.08, vol: 0.4 * k, type: "highpass", f: 2000 }); A.noise({ dur: 1.4, vol: 0.35 * k, f: 700 * p, f1: 60, at: 0.05 }); },
  fire: (A, k, p) => A.noise({ dur: 0.45, vol: 0.18 * k, type: "bandpass", f: 500 * p, f1: 1600, q: 0.6 }),
  ice: (A, k, p) => { A.tone({ f: 2200 * p, f1: 3400, dur: 0.25, type: "triangle", vol: 0.06 * k }); A.tone({ f: 3300 * p, f1: 2600, dur: 0.3, type: "sine", vol: 0.05 * k, at: 0.03 }); A.noise({ dur: 0.2, vol: 0.1 * k, type: "highpass", f: 4000 }); },
  shatter: (A, k, p) => { for (let i = 0; i < 5; i++) A.tone({ f: (2000 + Math.random() * 2500) * p, dur: 0.12, type: "triangle", vol: 0.05 * k, at: i * 0.025 }); A.noise({ dur: 0.3, vol: 0.15 * k, type: "highpass", f: 3000 }); },
  magic: (A, k, p) => { for (let i = 0; i < 3; i++) A.tone({ f: 600 * p * (1 + i * 0.5), f1: 1200 * p * (1 + i * 0.5), dur: 0.25, type: "sine", vol: 0.06 * k, at: i * 0.04 }); },
  holy: (A, k, p) => { for (const [i, n] of [72, 76, 79, 84].entries()) A.tone({ f: NOTE(n) * p, dur: 0.7, type: "sine", vol: 0.06 * k, a: 0.04, at: i * 0.05 }); },
  dark: (A, k, p) => { A.tone({ f: 110 * p, f1: 55, dur: 0.6, type: "sawtooth", vol: 0.08 * k, lp: 500 }); A.noise({ dur: 0.5, vol: 0.12 * k, f: 300, f1: 1200, q: 4, type: "bandpass" }); },
  poison: (A, k, p) => { for (let i = 0; i < 3; i++) A.tone({ f: (300 + i * 80) * p, f1: 150, dur: 0.12, type: "sine", vol: 0.08 * k, at: i * 0.06 }); },
  water: (A, k, p) => { A.noise({ dur: 0.35, vol: 0.2 * k, type: "bandpass", f: 700 * p, f1: 300, q: 2 }); A.tone({ f: 500 * p, f1: 1100, dur: 0.1, type: "sine", vol: 0.06 * k, at: 0.05 }); },
  shoot: (A, k, p) => { A.noise({ dur: 0.12, vol: 0.3 * k, f: 4000, f1: 400 }); A.tone({ f: 300 * p, f1: 80, dur: 0.1, type: "square", vol: 0.1 * k, lp: 2000 }); },
  bow: (A, k, p) => { A.tone({ f: 220 * p, f1: 90, dur: 0.15, type: "triangle", vol: 0.14 * k }); A.noise({ dur: 0.18, vol: 0.08 * k, type: "bandpass", f: 2000, f1: 600 }); },
  laser: (A, k, p) => A.tone({ f: 1800 * p, f1: 300, dur: 0.18, type: "square", vol: 0.06 * k, lp: 4000 }),
  dash: (A, k, p) => A.noise({ dur: 0.18, vol: 0.12 * k, type: "bandpass", f: 600 * p, f1: 2400, q: 0.8 }),
  hurt: (A, k, p) => { A.tone({ f: 330 * p, f1: 110, dur: 0.25, type: "square", vol: 0.14 * k, lp: 1800 }); A.noise({ dur: 0.12, vol: 0.2 * k, f: 2000, f1: 400 }); },
  die: (A, k, p) => { A.tone({ f: 400 * p, f1: 60, dur: 0.5, type: "square", vol: 0.1 * k, lp: 1200 }); A.noise({ dur: 0.35, vol: 0.14 * k, f: 1200, f1: 100 }); },
  coin: (A, k, p) => { A.tone({ f: 1318 * p, dur: 0.06, type: "square", vol: 0.05 * k, lp: 5000 }); A.tone({ f: 1975 * p, dur: 0.16, type: "square", vol: 0.05 * k, at: 0.05, lp: 5000 }); },
  gem: (A, k, p) => { for (const [i, n] of [84, 88, 91].entries()) A.tone({ f: NOTE(n) * p, dur: 0.18, type: "triangle", vol: 0.07 * k, at: i * 0.05 }); },
  heal: (A, k, p) => { for (const [i, n] of [67, 71, 74, 79].entries()) A.tone({ f: NOTE(n) * p, dur: 0.3, type: "triangle", vol: 0.07 * k, at: i * 0.07 }); },
  powerup: (A, k, p) => { for (const [i, n] of [60, 64, 67, 72, 76, 79, 84].entries()) A.tone({ f: NOTE(n) * p, dur: 0.2, type: "square", vol: 0.045 * k, at: i * 0.045, lp: 3500 }); },
  ui: (A, k, p) => A.tone({ f: 880 * p, dur: 0.05, type: "square", vol: 0.04 * k, lp: 3000 }),
  ok: (A, k, p) => { A.tone({ f: 660 * p, dur: 0.06, type: "square", vol: 0.05 * k, lp: 3000 }); A.tone({ f: 990 * p, dur: 0.1, type: "square", vol: 0.05 * k, at: 0.06, lp: 3000 }); },
  nope: (A, k, p) => A.tone({ f: 160 * p, f1: 120, dur: 0.15, type: "square", vol: 0.06 * k, lp: 1200 }),
  door: (A, k, p) => { A.tone({ f: 200 * p, f1: 800, dur: 0.5, type: "sine", vol: 0.1 * k }); A.noise({ dur: 0.6, vol: 0.08 * k, type: "bandpass", f: 400, f1: 3000, q: 2 }); },
  portal: (A, k, p) => { A.tone({ f: 100 * p, f1: 400, dur: 1.2, type: "sawtooth", vol: 0.05 * k, lp: 800, curve: "lin" }); A.tone({ f: 600 * p, f1: 1500, dur: 1.2, type: "sine", vol: 0.05 * k, curve: "lin" }); },
  spawn: (A, k, p) => { A.tone({ f: 200 * p, f1: 600, dur: 0.3, type: "triangle", vol: 0.08 * k }); A.noise({ dur: 0.3, vol: 0.08 * k, type: "bandpass", f: 800, f1: 2000, q: 3 }); },
  roar: (A, k, p) => { A.tone({ f: 90 * p, f1: 60, dur: 1.2, type: "sawtooth", vol: 0.14 * k, lp: 700 }); A.tone({ f: 93 * p, f1: 58, dur: 1.2, type: "sawtooth", vol: 0.14 * k, lp: 700 }); A.noise({ dur: 1.1, vol: 0.18 * k, type: "bandpass", f: 300, f1: 150, q: 2 }); },
  clear: (A, k, p) => { for (const [i, n] of [72, 76, 79, 84, 88].entries()) A.tone({ f: NOTE(n) * p, dur: 0.35, type: "square", vol: 0.045 * k, at: i * 0.08, lp: 3000 }); },
  chest: (A, k, p) => { A.noise({ dur: 0.2, vol: 0.15 * k, f: 600 }); SFX.powerup(A, k * 0.8, p); },
  step: (A, k, p) => A.noise({ dur: 0.05, vol: 0.04 * k, f: 600 * p, f1: 200 }),
  parry: (A, k, p) => { A.tone({ f: 1500 * p, dur: 0.4, type: "triangle", vol: 0.12 * k }); A.tone({ f: 2250 * p, dur: 0.3, type: "sine", vol: 0.08 * k }); },
  block: (A, k, p) => { A.tone({ f: 900 * p, f1: 700, dur: 0.2, type: "triangle", vol: 0.12 * k }); A.noise({ dur: 0.1, vol: 0.15 * k, type: "highpass", f: 2500 }); },
  gameover: (A, k, p) => { for (const [i, n] of [67, 63, 60, 55].entries()) A.tone({ f: NOTE(n) * p, dur: 0.6, type: "triangle", vol: 0.1 * k, at: i * 0.3 }); },
  win: (A, k, p) => { for (const [i, n] of [60, 64, 67, 72, 67, 72, 76, 79, 84].entries()) A.tone({ f: NOTE(n) * p, dur: 0.3, type: "square", vol: 0.05 * k, at: i * 0.1, lp: 3000 }); },
};

// scales and songs: progressions are scale degrees of each bar's chord root; patterns are per sixteenth
const MINOR = [0, 2, 3, 5, 7, 8, 10], DORIAN = [0, 2, 3, 5, 7, 9, 10], PHRYG = [0, 1, 3, 5, 7, 8, 10], MAJOR = [0, 2, 4, 5, 7, 9, 11], LYD = [0, 2, 4, 6, 7, 9, 11];
const _ = null;
const BASS_A = [2, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 1, 0], BASS_B = [1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1];
const K4 = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], K2 = [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0];
const SN = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], HAT = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1];
const SONGS = {
  title: { bpm: 72, root: 50, scale: DORIAN, prog: [0, 5, 3, 4], pad: "sawtooth", bass: [4, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0], arp: [0, _, 4, _, 7, _, 4, _, 2, _, 4, _, 9, _, 7, _] },
  hub: { bpm: 80, root: 55, scale: MAJOR, prog: [0, 3, 5, 4], pad: "triangle", bass: BASS_A, arp: [0, _, _, 2, _, _, 4, _, 7, _, _, 4, _, 2, _, _], lead: "triangle" },
  crypt: { bpm: 104, root: 45, scale: MINOR, prog: [0, 0, 5, 4], pad: "sawtooth", bass: BASS_B, arp: [0, 2, 4, 7, 4, 2, 0, 2, 4, 7, 9, 7, 4, 2, 4, 7], kick: K4, snare: SN, hat: HAT },
  grotto: { bpm: 92, root: 47, scale: DORIAN, prog: [0, 3, 1, 4], pad: "triangle", bass: BASS_A, arp: [0, _, 4, _, 7, _, 11, _, 9, _, 7, _, 4, _, 2, _], kick: K2, hat: HAT, lead: "triangle" },
  frost: { bpm: 96, root: 52, scale: LYD, prog: [0, 1, 5, 4], pad: "sine", bass: BASS_A, arp: [7, _, 4, _, 0, _, 4, 7, 11, _, 7, _, 4, _, 2, _], kick: K2, hat: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], lead: "triangle" },
  foundry: { bpm: 124, root: 43, scale: PHRYG, prog: [0, 1, 0, 6], pad: "sawtooth", bass: [1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1], arp: [0, 7, 0, 7, 1, 7, 0, 4, 0, 7, 0, 7, 3, 4, 1, 0], kick: K4, snare: SN, hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  sanctum: { bpm: 88, root: 53, scale: MAJOR, prog: [0, 4, 5, 3], pad: "triangle", bass: BASS_A, arp: [0, 4, 7, 11, 14, 11, 7, 4, 0, 4, 7, 11, 14, 11, 7, 4], kick: K2, hat: HAT, lead: "triangle" },
  boss: { bpm: 140, root: 45, scale: PHRYG, prog: [0, 1, 0, 5], pad: "sawtooth", bass: [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1], arp: [0, 3, 7, 3, 0, 3, 8, 3, 0, 3, 7, 3, 1, 3, 8, 7], kick: [1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0], snare: SN, hat: [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1] },
  final: { bpm: 150, root: 50, scale: MINOR, prog: [0, 5, 6, 4], pad: "sawtooth", bass: [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1], arp: [0, 4, 7, 9, 7, 4, 0, 4, 2, 6, 9, 11, 9, 6, 2, 6], kick: K4, snare: SN, hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  victory: { bpm: 96, root: 55, scale: MAJOR, prog: [0, 4, 5, 3], pad: "triangle", bass: BASS_A, arp: [0, 4, 7, 4, 9, 7, 4, 7, 11, 7, 4, 7, 14, 11, 7, 4], kick: K2, hat: HAT, lead: "triangle" },
  gameover: { bpm: 60, root: 45, scale: MINOR, prog: [0, 5, 3, 4], pad: "sine", bass: [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], arp: [0, _, _, _, 4, _, _, _, 2, _, _, _, _, _, _, _], lead: "sine" },
};
void P;
