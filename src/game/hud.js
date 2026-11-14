// The heads-up display, drawn on its own frame over the world: hearts, the ultimate, the special's recharge, coins,
// embers, boons, the combo, the boss's life, and pixelfx UI effects (heart lost, combo, toasts) on top.

import { PAL, hex, painterFor } from "../engine/pfx.js";
import { FxManager } from "../engine/fxm.js";
import { G } from "./ctx.js";
import { t, L, isCJK } from "./i18n.js";
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
    if (this.notes) this.notes = this.notes.filter((n) => (n.t += dt) < n.dur);
    for (const k in this.bumps) this.bumps[k] = Math.max(0, this.bumps[k] - dt * 4);
    if (this.boss) this.bossTrail = Math.max(this.boss.hp / this.boss.maxhp, this.bossTrail - dt * 0.35);
    if (this.banner && (this.banner.t += dt) > this.banner.dur) this.banner = null;
  }
  bump(k) {
    this.bumps[k] = 1;
  }
  heartPos(i, slot = 0) {
    if (!this.coop) return [6 + i * 9, 5];
    return [3 + slot * 80 + i * 8, 9];
  }
  heartLost(p, n) {
    const i = Math.floor(Math.max(0, p.hp) / 2);
    const [x, y] = this.heartPos(i, p.slot);
    this.fx.spawn("ui/heart-lost", x + 4, y + 4, {}, { layer: "hud", prio: 2 });
  }
  comboPop(n) {
    this.fx.spawn("ui/combo-counter", 262, 60, { count: n, label: "COMBO" }, { layer: "hud", prio: 2 });
  }
  /** A medal toast. pixelfx's own when the words fit its plate (2x text, ~46 font px a line); otherwise a plate sized to them. */
  toast(title, txt, pal) {
    title = L(title);
    txt = L(txt ?? "");
    if (!isCJK() && width(title) <= 46 && width(txt) <= 46) return this.fx.spawn("ui/achievement", 160, 34, { title, text: txt, ...(pal ? { palette: pal } : {}) }, { layer: "hud", prio: 2 });
    this.notes = (this.notes ?? []).filter((n) => n.kind !== "toast");
    this.notes.push({ kind: "toast", title, txt, c: pal ? hex(pal[Math.floor(pal.length * 0.7)]) >>> 0 : C.gold, t: 0, dur: 2.4 });
  }
  /** The room's ribbon ("ROOM CLEARED"): pixelfx's when it fits, else a plain banner. */
  ribbon(txt) {
    txt = L(txt);
    if (!isCJK() && width(txt) <= 70) return this.fx.spawn("ui/quest-complete", 160, 44, { text: txt }, { layer: "hud", prio: 2 });
    this.notes = (this.notes ?? []).filter((n) => n.kind !== "ribbon");
    this.notes.push({ kind: "ribbon", title: txt, c: C.gold, t: 0, dur: 1.8 });
  }
  /** Toasts and ribbons too long (or too tall) for the pixelfx plates. */
  drawNotes(p) {
    for (const n of this.notes ?? []) {
      const k = Math.min(1, n.t / 0.18), out = Math.max(0, (n.t - n.dur + 0.25) / 0.25), slide = Math.round((1 - k) ** 3 * 30 + out * out * 30);
      if (n.kind === "toast") {
        const w = Math.min(300, Math.max(width(n.title, "big"), width(n.txt)) + 32), x = 160 - w / 2 + slide, cj = isCJK() ? 4 : 0, h = 26 + cj * 2;
        panel(x, 21, w, h, { a: 0.92 * (1 - out), glow: n.c });
        p.sprite(GEM, GEM_PAL, x + 9, 29 + cj);
        p.light(x + 11, 32 + cj, n.c, 0.5);
        text(n.title, x + 24, 25 + cj, n.c, { font: "big" });
        text(n.txt, x + 24, 36 + cj * 2, C.white);
      } else {
        const w = width(n.title, "big") * 2 + 24, x = 160 - w / 2;
        panel(x, 36 - (isCJK() ? 4 : 0), w, 22 + (isCJK() ? 6 : 0), { a: 0.85 * (1 - out), glow: n.c });
        text(n.title, 160, 41, n.c, { font: "big", scale: 2, align: "center", a: k * (1 - out) });
      }
    }
  }
  /** A title card: big text that fades in and out. */
  title(big, small, dur = 2.6) {
    this.banner = { big, small, t: 0, dur };
  }
  /** One player, the classic layout: hearts, ultimate, special, boons, top left. */
  solo(p, run, pl) {
    const n = Math.ceil(pl.maxHp / 2);
    for (let i = 0; i < n; i++) {
      const v = pl.hp - i * 2, [x, y] = this.heartPos(i);
      p.sprite(v >= 2 ? HEART : v === 1 ? HEART_HALF : HEART_EMPTY, HEART_PAL, x, y);
      if (v >= 1) p.light(x + 2, y + 2, hex("#ff3050"), 0.25);
    }
    for (let i = 0; i < pl.shield; i++) p.sprite(HEART, SHIELD_PAL, ...this.heartPos(n + i));
    for (let i = 0; i < run.lives; i++) icon("pickups/potion", 10 + (n + pl.shield + i) * 9, 18, this.t, { palette: PAL.fire }, { alpha: 1, light: 0.4 });
    const full = pl.ult >= 100, pulse = full ? 0.5 + 0.5 * Math.sin(this.t * 8) : 0;
    bar(7, 16, 52, 3, pl.ult / 100, full ? hex("#ffd84a") >>> 0 : hex("#ff8a2a") >>> 0, { glow: full ? 0.3 + pulse * 0.4 : 0.12 });
    text(full ? "ULT READY [I]" : "ULT", 62, 15, full ? (Math.floor(this.t * 6) & 1 ? C.gold : C.white) : C.dim);
    if (pl.cls) {
      const cd = pl.cd.special, max = pl.cls.special.cd * run.stats.cdr, ready = cd <= 0;
      bar(7, 22, 30, 2, ready ? 1 : 1 - cd / max, ready ? C.blue : hex("#3a5a7a") >>> 0);
      text(pl.cls.special.name, 40, 21, ready ? C.text : C.dark);
    }
    run.boons.forEach((b, i) => {
      const pal = ELEM_PAL[b.elem] ?? PAL.metal, x = 7 + (i % 14) * 5, y = 29 + Math.floor(i / 14) * 5, c = hex(pal[Math.floor(pal.length * 0.65)]) >>> 0;
      p.px(x + 1, y, c); p.px(x, y + 1, c); p.px(x + 1, y + 1, hex(pal[pal.length - 1]) >>> 0); p.px(x + 2, y + 1, c); p.px(x + 1, y + 2, c);
    });
  }
  /** A co-op player's panel across the top: their tag and class, hearts, shields, ultimate and special. */
  panel(p, run, pl) {
    const x0 = 2 + pl.slot * 80, col = pl.color;
    p.rect(x0, 1, 76, 1, col);
    text(`P${pl.slot + 1} ${L(pl.cls.name)}`, x0 + 1, 2, col, { outline: false, max: 75 });
    const n = Math.ceil(pl.maxHp / 2), step = n > 9 ? Math.floor(74 / n) : 8;
    for (let i = 0; i < n; i++) {
      const v = pl.hp - i * 2, x = x0 + 1 + i * step, y = 9;
      p.sprite(v >= 2 ? HEART : v === 1 ? HEART_HALF : HEART_EMPTY, HEART_PAL, x, y);
    }
    for (let i = 0; i < pl.shield && n + i < 9; i++) p.sprite(HEART, SHIELD_PAL, x0 + 1 + (n + i) * step, 9);
    const full = pl.ult >= 100;
    bar(x0 + 2, 19, 40, 2, pl.ult / 100, full ? hex("#ffd84a") >>> 0 : hex("#ff8a2a") >>> 0, { glow: full ? 0.4 : 0.1 });
    if (full) text("ULT", x0 + 45, 18, Math.floor(this.t * 6) & 1 ? C.gold : C.white, { outline: false });
    const cd = pl.cd.special, max = pl.cls.special.cd * run.stats.cdr;
    bar(x0 + 2, 24, 24, 1, cd <= 0 ? 1 : 1 - cd / max, cd <= 0 ? C.blue : hex("#3a5a7a") >>> 0);
    if (pl.down && Math.floor(this.t * 3) & 1) text(pl.fallen ? t("FALLEN") : t("DOWN"), x0 + 38, 10, pl.fallen ? C.dim : C.red, { align: "center", font: "big" });
  }
  draw() {
    const run = G.run, hud = G.screen.hud, p = painterFor(hud);
    if (!this.hidden && run) {
      const party = run.players?.length ? run.players : G.world?.player ? [G.world.player] : [];
      this.coop = party.length > 1;
      if (this.coop) party.forEach((pl) => this.panel(p, run, pl));
      else if (party[0]) this.solo(p, run, party[0]);
      // coins and embers (bottom right in co-op, where the panels aren't)
      if (!run.godMode) {
        const cb = this.bumps.coins ?? 0, eb = this.bumps.embers ?? 0, oy = this.coop ? 150 : 0;
        p.sprite(COIN, COIN_PAL, 308, oy + 5 - Math.round(cb * 2));
        text(run.coins, 305, oy + 5 - Math.round(cb * 2), cb > 0.3 ? C.white : C.gold, { align: "right" });
        p.sprite(GEM, GEM_PAL, 308, oy + 13 - Math.round(eb * 2));
        p.light(310, oy + 16, hex("#ff8a2a"), 0.3);
        text(run.embers, 305, oy + 14 - Math.round(eb * 2), eb > 0.3 ? C.white : C.ember, { align: "right" });
        if (this.coop) for (let i = 0; i < run.lives; i++) icon("pickups/potion", 290 - i * 9, oy + 34, this.t, { palette: PAL.fire }, { light: 0.4 });
      }
      // the combo while it's going
      if (run.combo >= 5) {
        const k = Math.min(1, run.comboT / 2.2), cy = this.coop ? 124 : 26;
        text("X" + run.combo, 312, cy, run.combo >= 30 ? C.gold : C.text, { align: "right", font: "big" });
        bar(284, cy + 10, 28, 1, k, C.violet);
      }
      // where you are
      const room = G.room;
      if (room?.label && !this.coop) text(room.label, 160, 4, C.dim, { align: "center" });
      if (room?.pips && !this.coop) {
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
    this.drawNotes(painterFor(hud));
  }
}
void panel;
