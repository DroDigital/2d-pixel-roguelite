// Overlays drawn over a paused world: boon cards, the pause menu, options, the vessel altar, the ember shrine, and the
// Codex of every pixelfx effect you've witnessed.

import { PAL, hex, categories, effects, isSeen, seenCount, EFFECT_IDS, createFx, createAct, clearFrame, painterFor, backdrop, fxMod } from "../engine/pfx.js";
import { bake, blit } from "../engine/bake.js";
import { G, sfx } from "./ctx.js";
import { C, text, para, panel, bar, icon, wrap, width } from "./ui.js";
import { ELEM_PAL, ELEM_NAME, RARITY_COLOR } from "./boons.js";
import { CLASSES, CLASS_ORDER } from "./classes.js";
import { UPGRADES } from "./meta.js";

const nav = () => {
  const I = G.input;
  return { up: I.take("mup"), down: I.take("mdown"), left: I.take("mleft"), right: I.take("mright"), ok: I.take("confirm"), back: I.take("back") || I.take("pause"), alt: I.take("interact") };
};
const persist = () => G.persist?.();

/** A vertical list menu. items: [{ label, act, value?() , left?(), right?() }] */
export class ListMenu {
  constructor(title, items, o = {}) {
    Object.assign(this, { title, items, i: 0, t: 0, onBack: o.onBack, w: o.w ?? 150, sub: o.sub });
  }
  update(dt) {
    this.t += dt;
    const n = nav();
    if (n.up) (this.i = (this.i + this.items.length - 1) % this.items.length), sfx("ui");
    if (n.down) (this.i = (this.i + 1) % this.items.length), sfx("ui");
    const it = this.items[this.i];
    if (n.left && it.left) (it.left(), sfx("ui"));
    if (n.right && it.right) (it.right(), sfx("ui"));
    if (n.ok && it.act) (sfx("ok"), it.act());
    if (n.back) this.onBack?.();
    return true;
  }
  draw() {
    const h = 26 + this.items.length * 11 + (this.sub ? 8 : 0), x = 160 - this.w / 2, y = 90 - h / 2;
    panel(x, y, this.w, h, { glow: C.ember });
    text(this.title, 160, y + 7, C.gold, { align: "center", font: "big" });
    if (this.sub) text(this.sub, 160, y + 18, C.dim, { align: "center" });
    this.items.forEach((it, k) => {
      const yy = y + 22 + (this.sub ? 8 : 0) + k * 11, sel = k === this.i;
      const label = it.value ? `${it.label}: ${it.value()}` : it.label;
      if (sel) {
        painterFor(G.screen.hud).rect(x + 6, yy - 2, this.w - 12, 9, hex("#2a2040") >>> 0);
        text(">", x + 10 + Math.floor(Math.sin(this.t * 8)), yy, C.ember);
      }
      text(label, 160, yy, sel ? C.white : it.disabled ? C.dark : C.text, { align: "center" });
    });
  }
}

/** Three boon cards; pick one. */
export class BoonPick {
  constructor(choices, onPick, o = {}) {
    this.choices = choices;
    this.onPick = onPick;
    this.i = 1 % choices.length;
    this.t = 0;
    this.reroll = o.reroll;
    this.title = o.title ?? "CHOOSE A BOON";
    sfx("powerup", 0.6, 0.8);
  }
  update(dt) {
    this.t += dt;
    if (this.t < 0.35) return true;
    const n = nav();
    if (n.left) (this.i = (this.i + this.choices.length - 1) % this.choices.length), sfx("ui");
    if (n.right) (this.i = (this.i + 1) % this.choices.length), sfx("ui");
    if (n.alt && this.reroll && G.run.rerolls > 0) {
      G.run.rerolls--;
      this.choices = this.reroll();
      sfx("magic");
      this.t = 0.2;
    }
    if (n.ok && this.choices.length) {
      sfx("ok");
      this.onPick(this.choices[this.i]);
      return false;
    }
    if (!this.choices.length && (n.ok || n.back)) {
      this.onPick(null);
      return false;
    }
    return true;
  }
  draw() {
    const n = this.choices.length, cw = 94, gap = 8, x0 = 160 - (n * cw + (n - 1) * gap) / 2, k = Math.min(1, this.t * 4);
    text(this.title, 160, 12, C.gold, { align: "center", font: "big" });
    if (!n) return text("NOTHING LEFT TO GIVE. PRESS ANY KEY.", 160, 90, C.text, { align: "center" });
    this.choices.forEach((b, i) => {
      const sel = i === this.i, x = Math.round(x0 + i * (cw + gap)), y = Math.round(30 + (1 - k) * 40 - (sel ? 3 : 0)), pal = ELEM_PAL[b.elem] ?? PAL.metal;
      const rc = hex(RARITY_COLOR[b.rarity]) >>> 0;
      panel(x, y, cw, 128, { edge: sel ? rc : C.edge, hi: sel ? C.white : C.edgeHi, glow: sel ? rc : undefined, a: 0.95 });
      icon("pickups/crystal-shard", x + cw / 2, y + 42, this.t + i, { palette: pal }, { light: sel ? 1 : 0.5 });
      text(b.rarity, x + cw / 2, y + 48, rc, { align: "center" });
      const nl = wrap(b.name, cw - 8, "mini");
      nl.forEach((l, j) => text(l, x + cw / 2, y + 56 + j * 7, C.white, { align: "center" }));
      text(ELEM_NAME[b.elem] ?? "", x + cw / 2, y + 4, hex(pal[Math.floor(pal.length * 0.7)]) >>> 0, { align: "center" });
      para(b.desc, x + 5, y + 60 + nl.length * 7, cw - 10, sel ? C.text : C.dim, { align: "center" });
    });
    const hint = `[ARROWS] CHOOSE   [ENTER] TAKE${this.reroll && G.run.rerolls > 0 ? `   [E] REROLL (${G.run.rerolls})` : ""}`;
    text(hint, 160, 166, C.dim, { align: "center" });
  }
}

/** Your boons, listed. */
export class BoonList {
  constructor(onBack) {
    this.onBack = onBack;
  }
  update() {
    const n = nav();
    if (n.back || n.ok) this.onBack();
    return true;
  }
  draw() {
    const run = G.run;
    panel(20, 14, 280, 152, { glow: C.ember });
    text("BOONS", 160, 20, C.gold, { align: "center", font: "big" });
    if (!run.boons.length) text("NONE YET", 160, 80, C.dim, { align: "center" });
    run.boons.forEach((b, i) => {
      const col = i % 2, row = Math.floor(i / 2), x = 28 + col * 138, y = 34 + row * 13;
      if (y > 156) return;
      const pal = ELEM_PAL[b.elem] ?? PAL.metal;
      text(b.name, x, y, hex(RARITY_COLOR[b.rarity]) >>> 0);
      text(ELEM_NAME[b.elem], x, y + 6, hex(pal[5]) >>> 0, { outline: false });
    });
    const s = run.stats;
    text(`DMG ${Math.round(s.dmg * 100)}%  CRIT ${Math.round(s.crit * 100)}%  SPEED ${Math.round(s.speed * 100)}%`, 160, 158, C.dim, { align: "center" });
  }
}

export function optionsMenu(onBack) {
  const S = G.save.settings, A = G.audio;
  const vol = (k) => ({ label: k.toUpperCase(), value: () => Math.round(S[k] * 10), left: () => set(k, -0.1), right: () => set(k, 0.1), act: () => set(k, 0.1) });
  const set = (k, d) => {
    S[k] = Math.max(0, Math.min(1, Math.round((S[k] + d) * 10) / 10));
    A.vol[k] = S[k];
    A.applyVolume();
    persist();
  };
  const tog = (label, k, after) => ({ label, value: () => (S[k] ? "ON" : "OFF"), act: () => { S[k] = !S[k]; after?.(); persist(); }, left: () => { S[k] = !S[k]; after?.(); persist(); }, right: () => { S[k] = !S[k]; after?.(); persist(); } });
  const m = new ListMenu("OPTIONS", [
    vol("master"), vol("music"), vol("sfx"),
    { label: "SCREEN SHAKE", value: () => Math.round(S.shake * 100) + "%", left: () => (S.shake = Math.max(0, S.shake - 0.25), persist()), right: () => (S.shake = Math.min(1.5, S.shake + 0.25), persist()), act: () => (S.shake = S.shake >= 1.5 ? 0 : S.shake + 0.25, persist()) },
    tog("LOW EFFECTS", "lowfx"),
    tog("PIXEL PERFECT", "pixelPerfect", () => { G.screen.pixelPerfect = S.pixelPerfect; G.screen.fit(); }),
    { label: "FULLSCREEN", act: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()) },
    { label: "BACK", act: onBack },
  ], { onBack, w: 170 });
  return m;
}

/** Controls, for the title screen. */
export class Controls {
  constructor(onBack) {
    this.onBack = onBack;
  }
  update() {
    const n = nav();
    if (n.back || n.ok) this.onBack();
    return true;
  }
  draw() {
    panel(40, 20, 240, 140, { glow: C.ember });
    text("HOW TO PLAY", 160, 27, C.gold, { align: "center", font: "big" });
    const rows = [["MOVE", "WASD / ARROWS / LEFT STICK"], ["ATTACK (COMBO)", "J / Z / A"], ["SPECIAL", "K / X / X"], ["DASH (I-FRAMES)", "L / C / SPACE / SHIFT / B"], ["ULTIMATE", "I / V / Y"], ["USE", "E / F / LB"], ["PAUSE", "ESC / P / START"]];
    rows.forEach(([a, b], i) => { text(a, 56, 44 + i * 10, C.ember); text(b, 150, 44 + i * 10, C.text); });
    para("DASH JUST BEFORE A BLOW LANDS TO PARRY IT. FOES GLOW RED AS THEY WIND UP. CLEAR ROOMS, PICK BOONS, CLIMB FIVE REALMS. EMBERS YOU CARRY HOME BUY POWER FOR THE NEXT CLIMB.", 56, 118, 208, C.dim);
  }
}

/** The altar of vessels: choose who climbs. */
export class ClassAltar {
  constructor(onChange, onBack) {
    this.i = Math.max(0, CLASS_ORDER.indexOf(G.save.lastClass));
    this.onChange = onChange;
    this.onBack = onBack;
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const n = nav(), S = G.save;
    const prev = this.i;
    if (n.left) this.i = (this.i + CLASS_ORDER.length - 1) % CLASS_ORDER.length;
    if (n.right) this.i = (this.i + 1) % CLASS_ORDER.length;
    if (prev !== this.i) (sfx("ui"), this.onChange(CLASS_ORDER[this.i], true));
    const id = CLASS_ORDER[this.i], cls = CLASSES[id];
    if (n.ok) {
      if (S.unlocked[id]) {
        S.lastClass = id;
        persist();
        sfx("ok");
        this.onChange(id, false);
        this.onBack();
      } else if (S.embers >= cls.cost) {
        S.embers -= cls.cost;
        S.unlocked[id] = true;
        S.lastClass = id;
        persist();
        sfx("powerup");
        G.hud.toast("VESSEL AWAKENED", cls.name, PAL.fire);
        this.onChange(id, false);
      } else sfx("nope");
    }
    if (n.back) {
      this.onChange(S.lastClass, false);
      this.onBack();
    }
    return true;
  }
  draw() {
    const id = CLASS_ORDER[this.i], cls = CLASSES[id], S = G.save, own = S.unlocked[id];
    panel(150, 18, 160, 132, { glow: C.ember });
    text("< " + cls.name + " >", 230, 25, C.gold, { align: "center", font: "big" });
    text(cls.title, 230, 36, C.dim, { align: "center" });
    para(cls.desc, 158, 46, 144, C.text);
    text(`HEARTS ${cls.hp / 2}   SPEED ${cls.speed}`, 158, 88, C.blue);
    text(`SPECIAL: ${cls.special.name}`, 158, 96, C.text);
    text(`ULTIMATE: ${cls.ult.name}`, 158, 104, C.text);
    if (own) text(S.lastClass === id ? "CHOSEN" : "[ENTER] CHOOSE", 230, 132, S.lastClass === id ? C.green : C.white, { align: "center" });
    else text(`[ENTER] AWAKEN FOR ${cls.cost} EMBERS`, 230, 132, S.embers >= cls.cost ? C.ember : C.red, { align: "center" });
    CLASS_ORDER.forEach((c, k) => painterFor(G.screen.hud).rect(200 + k * 10, 142, 6, 2, k === this.i ? C.white : S.unlocked[c] ? C.ember : C.dark));
  }
}

/** The ember shrine: permanent upgrades. */
export class Shrine {
  constructor(onBack) {
    this.i = 0;
    this.onBack = onBack;
  }
  update() {
    const n = nav(), S = G.save;
    if (n.up) (this.i = (this.i + UPGRADES.length - 1) % UPGRADES.length), sfx("ui");
    if (n.down) (this.i = (this.i + 1) % UPGRADES.length), sfx("ui");
    if (n.ok) {
      const u = UPGRADES[this.i], lv = S.upgrades[u.id] ?? 0, cost = u.cost(lv);
      if (lv < u.max && S.embers >= cost) {
        S.embers -= cost;
        S.upgrades[u.id] = lv + 1;
        persist();
        sfx("powerup");
        G.world.spawnFx("ui/level-up", G.world.player.x, G.world.player.y, { text: u.name, actor: G.world.player.snapshot() }, { follow: G.world.player, prio: 2 });
      } else sfx("nope");
    }
    if (n.back) this.onBack();
    return true;
  }
  draw() {
    const S = G.save;
    panel(40, 10, 240, 160, { glow: C.ember });
    text("THE EMBER SHRINE", 160, 16, C.gold, { align: "center", font: "big" });
    text(`EMBERS: ${S.embers}`, 160, 27, C.ember, { align: "center" });
    UPGRADES.forEach((u, k) => {
      const y = 38 + k * 11, lv = S.upgrades[u.id] ?? 0, sel = k === this.i, maxed = lv >= u.max, cost = u.cost(lv);
      if (sel) painterFor(G.screen.hud).rect(46, y - 2, 228, 9, hex("#2a2040") >>> 0);
      text(u.name, 52, y, sel ? C.white : C.text);
      for (let j = 0; j < u.max; j++) painterFor(G.screen.hud).rect(150 + j * 6, y + 1, 4, 3, j < lv ? C.ember : C.dark);
      text(maxed ? "MAX" : String(cost), 266, y, maxed ? C.green : S.embers >= cost ? C.gold : C.red, { align: "right" });
    });
    para(UPGRADES[this.i].desc, 52, 152, 216, C.dim);
  }
}

/** The Codex: every pixelfx effect, unlocked by seeing it in the climb. */
export class Codex {
  constructor(onBack) {
    this.onBack = onBack;
    this.cat = 0;
    this.i = 0;
    this.t = 0;
    this.live = null;
    this.focus = 0;
    this.pick();
  }
  ids() {
    return EFFECT_IDS.filter((id) => id.startsWith(categories[this.cat].id + "/"));
  }
  pick() {
    const id = this.ids()[this.i];
    this.id = id;
    this.t = 0;
    this.live = null;
    if (!id || !isSeen(id)) return;
    const mod = effects[id], meta = mod.meta, act = mod.act;
    // play it the way the gallery would: acted out with the stock character when it has a body
    const [w, h] = meta.size, [ox, oy] = meta.origin;
    const x = 200 + Math.round(-w / 2 + ox), y = Math.min(170, 94 + Math.round(-h / 2 + oy));
    const X = meta.size[0] >= 320 ? ox : x, Y = meta.size[0] >= 320 ? oy : act || meta.actor ? 150 : y;
    this.live = act || meta.actor ? createAct(mod, { x: act ? Math.min(X, 170) : X, y: Y }) : createFx(mod, { x: X, y: Y });
    this.isAct = !!(act || meta.actor);
  }
  update(dt) {
    this.t += dt;
    const n = nav(), L = this.ids();
    if (n.up) (this.i = (this.i + L.length - 1) % L.length), sfx("ui"), this.pick();
    if (n.down) (this.i = (this.i + 1) % L.length), sfx("ui"), this.pick();
    if (n.left) (this.cat = (this.cat + categories.length - 1) % categories.length), (this.i = 0), sfx("ui"), this.pick();
    if (n.right) (this.cat = (this.cat + 1) % categories.length), (this.i = 0), sfx("ui"), this.pick();
    if (n.back) this.onBack();
    if (this.live) {
      this.live.update(dt);
      if (this.live.done?.() || (this.live.fx?.done?.() && !this.isAct)) this.pick();
      if (this.isAct && this.live.done()) this.pick();
    }
    return true;
  }
  draw() {
    const f = G.screen.frame;
    clearFrame(f);
    G.screen.bg.set(this.bg ??= backdrop("ground", 320, 180, 150));
    if (this.live) {
      if (this.isAct) this.live.draw(f);
      else {
        this.live.draw(f, "back");
        this.live.draw(f, "front");
      }
    }
    const cat = categories[this.cat], L = this.ids();
    panel(2, 2, 104, 176, { a: 0.9 });
    text("< " + cat.name + " >", 54, 6, C.gold, { align: "center" });
    text(`${L.filter(isSeen).length}/${L.length}`, 54, 13, C.dim, { align: "center" });
    const start = Math.max(0, Math.min(this.i - 9, L.length - 20));
    L.slice(start, start + 20).forEach((id, k) => {
      const j = start + k, seen = isSeen(id), sel = j === this.i;
      if (sel) painterFor(G.screen.hud).rect(5, 21 + k * 7.6, 98, 7, hex("#2a2040") >>> 0);
      text(seen ? effects[id].meta.name : "? ? ?", 8, 22 + k * 7.6, sel ? C.white : seen ? C.text : C.dark);
    });
    text("THE CODEX", 212, 6, C.gold, { align: "center", font: "big" });
    text(`${seenCount()} OF ${EFFECT_IDS.length} WITNESSED`, 212, 16, C.ember, { align: "center" });
    if (this.id && isSeen(this.id)) para(effects[this.id].meta.desc, 112, 156, 204, C.dim, { lh: 6 });
    else text("NOT YET WITNESSED ON THE CLIMB", 212, 90, C.dark, { align: "center" });
    text("[LEFT/RIGHT] CATEGORY  [UP/DOWN] EFFECT  [ESC] BACK", 212, 26, C.dim, { align: "center" });
  }
}
export { bar, width, bake, blit, fxMod };
