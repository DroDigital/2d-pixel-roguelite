// The heads-up display, drawn on its own frame over the world: hearts, the ultimate, the special's recharge, coins,
// embers, boons, the combo, the boss's life, and pixelfx UI effects (heart lost, combo, toasts) on top.

import { PAL, hex, painterFor } from "../engine/pfx.js";
import { FxManager } from "../engine/fxm.js";
import { G } from "./ctx.js";
import { C, text, bar, panel, icon, HEART, HEART_HALF, HEART_EMPTY, HEART_PAL, SHIELD_PAL, width } from "./ui.js";
import { ELEM_PAL } from "./boons.js";

const COIN = [".kkk.", "kGGgk", "kGgGk", "kgGGk", ".kkk."], COIN_PAL = { k: "#2a1405", G: "#f5b92c", g: "#fff4bc" };
const GEM = ["..k..", ".kOk.", "kOoOk", "kOOOk", ".kOk.", "..k.."], GEM_PAL = { k: "#2a0a08", O: "#ff8a2a", o: "#fff0a0" };

export class Hud {
  constructor() {
    this.fx = new FxManager();
    this.bumps = {};
    this.boss = null;
    this.bossTrail = 1;
    this.prompt = null;
    this.banner = null;
    this.t = 0;
    this.hidden = false;
  }
  update(dt) {
    this.t += dt;
    this.fx.update(dt);
    for (const k in this.bumps) this.bumps[k] = Math.max(0, this.bumps[k] - dt * 4);
    if (this.boss) this.bossTrail = Math.max(this.boss.hp / this.boss.maxhp, this.bossTrail - dt * 0.35);
    if (this.banner && (this.banner.t += dt) > this.banner.dur) this.banner = null;
  }
  bump(k) {
    this.bumps[k] = 1;
  }
  heartPos(i) {
    return [6 + i * 9, 5];
  }
  heartLost(hpNow, n) {
    const i = Math.floor(Math.max(0, hpNow) / 2);
    const [x, y] = this.heartPos(i);
    this.fx.spawn("ui/heart-lost", x + 4, y + 4, {}, { layer: "hud", prio: 2 });
  }
  comboPop(n) {
    this.fx.spawn("ui/combo-counter", 262, 60, { count: n, label: "COMBO" }, { layer: "hud", prio: 2 });
  }
  toast(title, txt, pal) {
    this.fx.spawn("ui/achievement", 160, 34, { title, text: txt, ...(pal ? { palette: pal } : {}) }, { layer: "hud", prio: 2 });
  }
  ribbon(txt) {
    this.fx.spawn("ui/quest-complete", 160, 44, { text: txt }, { layer: "hud", prio: 2 });
  }
  /** A title card: big text that fades in and out. */
  title(big, small, dur = 2.6) {
    this.banner = { big, small, t: 0, dur };
  }
  draw() {
    const run = G.run, hud = G.screen.hud, p = painterFor(hud);
    if (!this.hidden && run) {
      // hearts, then shield charges
      const n = Math.ceil(run.maxHp / 2);
      for (let i = 0; i < n; i++) {
        const v = run.hp - i * 2, [x, y] = this.heartPos(i);
        p.sprite(v >= 2 ? HEART : v === 1 ? HEART_HALF : HEART_EMPTY, HEART_PAL, x, y);
        if (v >= 1) p.light(x + 2, y + 2, hex("#ff3050"), 0.25);
      }
      for (let i = 0; i < run.shield; i++) p.sprite(HEART, SHIELD_PAL, ...this.heartPos(n + i));
      for (let i = 0; i < run.lives; i++) icon("pickups/potion", 10 + (n + run.shield + i) * 9, 18, this.t, { palette: PAL.fire }, { alpha: 1, light: 0.4 });
      // the ultimate meter
      const full = run.ult >= 100, pulse = full ? 0.5 + 0.5 * Math.sin(this.t * 8) : 0;
      bar(7, 16, 52, 3, run.ult / 100, full ? hex("#ffd84a") >>> 0 : hex("#ff8a2a") >>> 0, { glow: full ? 0.3 + pulse * 0.4 : 0.12 });
      text(full ? "ULT READY [I]" : "ULT", 62, 15, full ? (Math.floor(this.t * 6) & 1 ? C.gold : C.white) : C.dim);
      // the special's recharge
      const pl = G.world?.player;
      if (pl?.cls) {
        const cd = pl.cd.special, max = pl.cls.special.cd * run.stats.cdr, ready = cd <= 0;
        bar(7, 22, 30, 2, ready ? 1 : 1 - cd / max, ready ? C.blue : hex("#3a5a7a") >>> 0);
        text(pl.cls.special.name, 40, 21, ready ? C.text : C.dark);
      }
      // boons as little gems
      run.boons.forEach((b, i) => {
        const pal = ELEM_PAL[b.elem] ?? PAL.metal, x = 7 + (i % 14) * 5, y = 29 + Math.floor(i / 14) * 5, c = hex(pal[Math.floor(pal.length * 0.65)]) >>> 0;
        p.px(x + 1, y, c); p.px(x, y + 1, c); p.px(x + 1, y + 1, hex(pal[pal.length - 1]) >>> 0); p.px(x + 2, y + 1, c); p.px(x + 1, y + 2, c);
      });
      // coins and embers
      if (!run.godMode) {
      const cb = this.bumps.coins ?? 0, eb = this.bumps.embers ?? 0;
      p.sprite(COIN, COIN_PAL, 308, 5 - Math.round(cb * 2));
      text(run.coins, 305, 5 - Math.round(cb * 2), cb > 0.3 ? C.white : C.gold, { align: "right" });
      p.sprite(GEM, GEM_PAL, 308, 13 - Math.round(eb * 2));
      p.light(310, 16, hex("#ff8a2a"), 0.3);
      text(run.embers, 305, 14 - Math.round(eb * 2), eb > 0.3 ? C.white : C.ember, { align: "right" });
      }
      // the combo while it's going
      if (run.combo >= 5) {
        const k = Math.min(1, run.comboT / 2.2);
        text("X" + run.combo, 312, 26, run.combo >= 30 ? C.gold : C.text, { align: "right", font: "big" });
        bar(284, 36, 28, 1, k, C.violet);
      }
      // where you are
      const room = G.room;
      if (room?.label) text(room.label, 160, 4, C.dim, { align: "center" });
      if (room?.pips) {
        const [i, n] = room.pips;
        for (let k = 0; k < n; k++) p.rect(160 - n * 3 + k * 6, 11, 4, 2, k < i ? C.ember : k === i ? C.white : C.dark);
      }
      // the boss's life
      if (this.boss && !this.boss.gone) {
        const b = this.boss, w = 200, x = 60, y = 170;
        text(b.title ?? b.name, 160, y - 8, C.white, { align: "center" });
        bar(x, y, w, 4, b.hp / b.maxhp, b.enraged ? hex("#ff3a3a") >>> 0 : hex("#c0283a") >>> 0, { trail: this.bossTrail, glow: 0.12 });
        for (const ph of b.phases ?? []) p.px(x + Math.round(w * ph), y - 1, C.gold);
      }
      if (this.prompt) {
        const w = width(this.prompt) + 8;
        panel(160 - w / 2, 148, w, 11, { a: 0.85 });
        text(this.prompt, 160, 151, C.white, { align: "center", outline: false });
      }
    }
    if (this.banner) {
      const b = this.banner, a = Math.min(1, b.t * 3, (b.dur - b.t) * 2);
      text(b.big, 160, 64, C.white, { font: "big", scale: 2, align: "center", a });
      if (b.small) text(b.small, 160, 84, C.ember, { align: "center", a });
    }
    this.fx.drawLayer(hud, "hud");
  }
}
void panel;
