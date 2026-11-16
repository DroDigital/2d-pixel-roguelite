// Overlays drawn over a paused world: boon cards, the pause menu, options, the vessel altar, the ember shrine, and the
// Codex of every pixelfx effect you've witnessed.

import { PAL, hex, categories, effects, isSeen, seenCount, EFFECT_IDS, createFx, createAct, clearFrame, painterFor, backdrop, fxMod } from "../engine/pfx.js";
import { bake, blit } from "../engine/bake.js";
import { G, sfx } from "./ctx.js";
import { t, L, LANGS, lang_, setLang, isCJK } from "./i18n.js";
import { C, text, para, panel, bar, icon, wrap, width } from "./ui.js";
import { ELEM_PAL, ELEM_NAME, RARITY_COLOR } from "./boons.js";
import { RELIC_SLOTS, equip, unequip, drawRelic } from "./relics.js";
import { CLASSES, CLASS_ORDER } from "./classes.js";
import { UPGRADES } from "./meta.js";
import { DEVICE_LABEL } from "../engine/input.js";
import { PLAYER_COLORS } from "./player.js";

const nav = () => {
  const I = G.input;
  return { up: I.take("mup"), down: I.take("mdown"), left: I.take("mleft"), right: I.take("mright"), ok: I.take("confirm"), back: I.take("back") || I.take("pause"), alt: I.take("interact") };
};
const persist = () => G.persist?.();
/** Menu controls from one co-op player's own device (attack takes, interact rerolls). */
const navOf = (p) => {
  if (!p?.device) return nav();
  const c = p.ctrl;
  return { up: c.take("mup") || c.take("up"), down: c.take("mdown") || c.take("down"), left: c.take("mleft") || c.take("left"), right: c.take("mright") || c.take("right"), ok: c.take("attack"), back: false, alt: c.take("interact") };
};

/** A vertical list menu. items: [{ label, act, value?() , left?(), right?() }] */
const RARITY_NAME = { common: "COMMON", rare: "RARE", epic: "EPIC", legendary: "LEGENDARY" };

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
      const label = it.value ? `${L(it.label)}: ${L(String(it.value()))}` : it.label;
      if (sel) {
        painterFor(G.screen.hud).rect(x + 6, yy - 2, this.w - 12, 9, hex("#2a2040") >>> 0);
        text(">", x + 10 + Math.floor(Math.sin(this.t * 8)), yy, C.ember);
      }
      text(label, 160, yy, sel ? C.white : it.disabled ? C.dark : C.text, { align: "center" });
    });
  }
}

/**
 * Three boon cards; pick one. o.build: whose boons these become (their rerolls); o.player: in co-op, the player who
 * picks, with their own device, under their own colour.
 */
export class BoonPick {
  /** The cards need the top of the screen: the HUD steps aside while they're up. */
  hideHud = true;
  constructor(choices, onPick, o = {}) {
    this.choices = choices;
    this.onPick = onPick;
    this.i = 1 % choices.length;
    this.t = 0;
    this.reroll = o.reroll;
    this.title = o.title ?? "CHOOSE A BOON";
    this.build = o.build ?? null;
    this.player = o.player ?? null;
    sfx("powerup", 0.6, 0.8);
  }
  get rerolls() {
    return this.build?.rerolls ?? 0;
  }
  update(dt) {
    this.t += dt;
    if (this.t < 0.35) return true;
    const n = navOf(this.player);
    if (n.left) (this.i = (this.i + this.choices.length - 1) % this.choices.length), sfx("ui");
    if (n.right) (this.i = (this.i + 1) % this.choices.length), sfx("ui");
    if (n.alt && this.reroll && this.rerolls > 0) {
      this.build.rerolls--;
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
    const who = this.player;
    if (who) {
      // co-op: whose pick this is, in their colour, with what they already hold
      text(`P${who.slot + 1} - ${L(this.title)}`, 160, 12, who.color, { align: "center", font: "big" });
      painterFor(G.screen.hud).rect(110, 23, 100, 1, who.color);
    } else text(this.title, 160, 12, C.gold, { align: "center", font: "big" });
    if (!n) return text("NOTHING LEFT TO GIVE. PRESS ANY KEY.", 160, 90, C.text, { align: "center" });
    this.choices.forEach((b, i) => {
      const sel = i === this.i, x = Math.round(x0 + i * (cw + gap)), y = Math.round(30 + (1 - k) * 40 - (sel ? 3 : 0)), pal = ELEM_PAL[b.elem] ?? PAL.metal;
      const rc = hex(RARITY_COLOR[b.rarity]) >>> 0;
      panel(x, y, cw, 128, { edge: sel ? rc : C.edge, hi: sel ? C.white : C.edgeHi, glow: sel ? rc : undefined, a: 0.95 });
      icon("pickups/crystal-shard", x + cw / 2, y + 42, this.t + i, { palette: pal }, { light: sel ? 1 : 0.5 });
      text(RARITY_NAME[b.rarity], x + cw / 2, y + 48, rc, { align: "center" });
      const nl = wrap(b.name, cw - 8, "mini");
      nl.forEach((l, j) => text(l, x + cw / 2, y + 56 + j * 7, C.white, { align: "center" }));
      text(ELEM_NAME[b.elem] ?? "", x + cw / 2, y + 4, hex(pal[Math.floor(pal.length * 0.7)]) >>> 0, { align: "center" });
      para(b.desc, x + 5, y + 60 + nl.length * 7, cw - 10, sel ? C.text : C.dim, { align: "center" });
    });
    const hint = (who?.device ? t("P{0}: LEFT/RIGHT CHOOSE   ATTACK TAKE", who.slot + 1) : t("[ARROWS] CHOOSE   [ENTER] TAKE")) + (this.reroll && this.rerolls > 0 ? "   " + t("[E] REROLL ({0})", this.rerolls) : "");
    text(hint, 160, 166, C.dim, { align: "center" });
  }
}

/**
 * The legend of what everyone holds: each player's boons (LEFT/RIGHT switches player in co-op), UP/DOWN reads one,
 * their numbers, and the camp's permanent upgrades below.
 */
export class BoonList {
  constructor(onBack) {
    this.onBack = onBack;
    this.p = 0;
    this.i = 0;
  }
  get players() {
    return G.run?.players ?? [];
  }
  update() {
    const n = nav(), P = this.players, bd = P[this.p]?.bd, cnt = bd?.boons.length ?? 0;
    if (P.length > 1 && n.left) (this.p = (this.p + P.length - 1) % P.length), (this.i = 0), sfx("ui");
    if (P.length > 1 && n.right) (this.p = (this.p + 1) % P.length), (this.i = 0), sfx("ui");
    if (cnt && n.up) (this.i = (this.i + cnt - 1) % cnt), sfx("ui");
    if (cnt && n.down) (this.i = (this.i + 1) % cnt), sfx("ui");
    if (n.back || n.ok) this.onBack();
    return true;
  }
  draw() {
    const P = this.players, pl = P[this.p], hp = painterFor(G.screen.hud);
    panel(14, 10, 292, 160, { glow: pl && P.length > 1 ? pl.color : C.ember });
    text("BOONS", 160, 15, C.gold, { align: "center", font: "big" });
    if (!pl) return;
    const bd = pl.bd, list = bd.boons;
    // the tabs: one per player, theirs lit
    if (P.length > 1) {
      P.forEach((q, k) => {
        const x = 160 + (k - (P.length - 1) / 2) * 70, sel = k === this.p, s = `P${q.slot + 1} ${L(q.cls.name)}`;
        if (sel) hp.rect(x - 32, 33, 64, 1, q.color);
        text(s, x, 26, sel ? q.color : C.dark, { align: "center", max: 66 });
      });
      text("< >", 300, 26, C.dim, { align: "right" });
    } else text(`${L(pl.cls.name)} - ${L(pl.cls.title)}`, 160, 26, C.dim, { align: "center" });
    if (!list.length) text("NONE YET", 160, 70, C.dim, { align: "center" });
    this.i = Math.min(this.i, Math.max(0, list.length - 1));
    list.forEach((b, i) => {
      const col = i % 2, row = Math.floor(i / 2), x = 26 + col * 140, y = 38 + row * 9, sel = i === this.i;
      if (y > 112) return;
      const pal = ELEM_PAL[b.elem] ?? PAL.metal, ec = hex(pal[Math.floor(pal.length * 0.65)]) >>> 0;
      if (sel) hp.rect(x - 7, y - 1, 136, 8, hex("#2a2040") >>> 0);
      // the same pip the HUD shows, so the two read together
      hp.px(x - 4, y + 1, ec); hp.px(x - 5, y + 2, ec); hp.px(x - 4, y + 2, hex(pal[pal.length - 1]) >>> 0); hp.px(x - 3, y + 2, ec); hp.px(x - 4, y + 3, ec);
      text(b.name, x, y, sel ? C.white : hex(RARITY_COLOR[b.rarity]) >>> 0, { max: 92 });
      text(ELEM_NAME[b.elem], x + 132, y, ec, { align: "right", outline: false, max: 38 });
    });
    const cur = list[this.i];
    if (cur) {
      hp.rect(22, 118, 276, 1, C.edge);
      text(`${L(cur.name)} - ${L(RARITY_NAME[cur.rarity])}`, 26, 121, hex(RARITY_COLOR[cur.rarity]) >>> 0, { max: 268 });
      para(cur.desc, 26, 129, 268, C.text);
    }
    const s = bd.stats;
    text(t("DMG {0}%  CRIT {1}%  SPEED {2}%", Math.round(s.dmg * 100), Math.round(s.crit * 100), Math.round(s.speed * 100)), 160, 145, C.blue, { align: "center" });
    // the camp's upgrades, which every climb carries
    const ups = UPGRADES.filter((u) => (G.save.upgrades[u.id] ?? 0) > 0).map((u) => `${L(u.name)} ${G.save.upgrades[u.id]}`);
    text(ups.length ? t("CAMP: {0}", ups.join("  ")) : t("CAMP: NO UPGRADES YET"), 160, 153, C.dim, { align: "center", max: 284 });
    text(P.length > 1 ? "LEFT/RIGHT: PLAYER   UP/DOWN: READ   ESC: BACK" : "UP/DOWN: READ   ESC: BACK", 160, 162, C.dark, { align: "center", max: 284 });
  }
}

/**
 * A fallen warden's relics: three cards, take one. With three already worn, choose which to set aside for it (or
 * keep the new one in the satchel); nothing is ever lost, Pause > Relics swaps them any time.
 */
export class RelicPick {
  hideHud = true;
  constructor(choices, onDone, o = {}) {
    Object.assign(this, { choices, onDone, i: Math.min(1, choices.length - 1), t: 0, build: o.build, player: o.player ?? null, boss: o.boss, stage: "pick", j: 0, taken: null });
    sfx("chest", 0.8);
  }
  finish() {
    G.input.flush();
    this.onDone(this.taken);
    return false;
  }
  update(dt) {
    this.t += dt;
    if (this.t < 0.4) return true;
    const n = navOf(this.player), bd = this.build;
    if (this.stage === "pick") {
      if (!this.choices.length) return n.ok || n.back ? this.finish() : true;
      if (n.left) (this.i = (this.i + this.choices.length - 1) % this.choices.length), sfx("ui");
      if (n.right) (this.i = (this.i + 1) % this.choices.length), sfx("ui");
      if (n.ok) {
        const r = (this.taken = this.choices[this.i]);
        bd.satchel.push(r);
        sfx("powerup");
        if (bd.relics.length < RELIC_SLOTS) return equip(bd, r), this.finish();
        this.stage = "replace";
        this.j = 0;
        this.t = 0.2;
      }
      return true;
    }
    // full: which worn relic makes room (the last row keeps the new one in the satchel instead)
    const rows = bd.relics.length + 1;
    if (n.up) (this.j = (this.j + rows - 1) % rows), sfx("ui");
    if (n.down) (this.j = (this.j + 1) % rows), sfx("ui");
    if (n.ok) {
      if (this.j < bd.relics.length) {
        unequip(bd, bd.relics[this.j]);
        equip(bd, this.taken);
        sfx("ok");
      }
      return this.finish();
    }
    return true;
  }
  draw() {
    const who = this.player, hp = painterFor(G.screen.hud), bd = this.build;
    const title = who ? `P${who.slot + 1} - ${L("A WARDEN'S RELIC")}` : "A WARDEN'S RELIC";
    text(title, 160, 10, who ? who.color : C.gold, { align: "center", font: "big" });
    if (this.stage === "pick") {
      const n = this.choices.length, cw = 94, gap = 8, x0 = 160 - (n * cw + (n - 1) * gap) / 2, k = Math.min(1, this.t * 3);
      if (!n) return text("NOTHING LEFT TO GIVE. PRESS ANY KEY.", 160, 90, C.text, { align: "center" });
      this.choices.forEach((r, i) => {
        const sel = i === this.i, x = Math.round(x0 + i * (cw + gap)), y = Math.round(28 + (1 - k) * 40 - (sel ? 3 : 0)), rc = hex(r.color) >>> 0;
        panel(x, y, cw, 124, { edge: sel ? rc : C.edge, hi: sel ? C.white : C.edgeHi, glow: sel ? rc : undefined, a: 0.95 });
        // the relic itself, three times its size, on a little plinth of light
        const bob = Math.round(Math.sin(this.t * 3 + i) * 1.5);
        hp.rect(x + cw / 2 - 14, y + 40, 28, 1, sel ? rc : C.edge);
        drawRelic(r, x + cw / 2 - 10, y + 12 + bob, 3, { glow: sel ? 0.5 : 0.2 });
        if (r.boss === this.boss) text("THE WARDEN'S OWN", x + cw / 2, y + 45, C.gold, { align: "center", max: cw - 6 });
        const nl = wrap(r.name, cw - 8, "mini");
        nl.forEach((l, j) => text(l, x + cw / 2, y + 54 + j * 7, sel ? C.white : rc, { align: "center" }));
        para(r.desc, x + 5, y + 58 + nl.length * 7, cw - 10, sel ? C.text : C.dim, { align: "center" });
      });
      this.slots(160, 158);
      text(who?.device ? t("P{0}: LEFT/RIGHT CHOOSE   ATTACK TAKE", who.slot + 1) : t("[ARROWS] CHOOSE   [ENTER] TAKE"), 160, 168, C.dim, { align: "center" });
      return;
    }
    // full: the swap
    panel(70, 30, 180, 120, { glow: hex(this.taken.color) >>> 0, a: 0.95 });
    drawRelic(this.taken, 150, 36, 3, { glow: 0.5 });
    text(this.taken.name, 160, 60, hex(this.taken.color) >>> 0, { align: "center" });
    text("YOUR RELIC SLOTS ARE FULL. SET ONE ASIDE?", 160, 70, C.text, { align: "center", max: 172 });
    bd.relics.forEach((r, j) => {
      const y = 84 + j * 14, sel = j === this.j;
      if (sel) hp.rect(80, y - 3, 160, 13, hex("#2a2040") >>> 0);
      drawRelic(r, 86, y - 1, 1, { glow: 0 });
      text(t("SET ASIDE {0}", L(r.name)), 98, y + 1, sel ? C.white : C.dim, { max: 138 });
    });
    const y = 84 + bd.relics.length * 14, sel = this.j === bd.relics.length;
    if (sel) hp.rect(80, y - 3, 160, 13, hex("#2a2040") >>> 0);
    text("KEEP THE NEW ONE IN THE SATCHEL", 160, y + 1, sel ? C.white : C.dim, { align: "center", max: 156 });
    text("SWAP RELICS ANY TIME: PAUSE > RELICS", 160, 140, C.dark, { align: "center", max: 172 });
  }
  /** The three slots, worn relics in them. */
  slots(cx, y) {
    const bd = this.build, hp = painterFor(G.screen.hud);
    for (let i = 0; i < RELIC_SLOTS; i++) {
      const x = cx - 16 + i * 11 - 15;
      hp.rect(x, y - 1, 9, 9, C.edge);
      hp.rect(x + 1, y, 7, 7, C.panel);
      if (bd.relics[i]) drawRelic(bd.relics[i], x + 1, y, 1, { glow: 0.15 });
    }
    text(t("WORN {0}/{1}", bd.relics.length, RELIC_SLOTS), cx + 14, y + 1, C.dim);
  }
}

/** Pause > Relics: every relic each player found, the worn ones first. Wear, set aside, or swap, any time. */
export class RelicMenu {
  constructor(onBack) {
    this.onBack = onBack;
    this.p = 0;
    this.i = 0;
    this.swap = -1; // choosing which worn relic to set aside, for the selected one
  }
  get players() {
    return G.run?.players ?? [];
  }
  list(bd) {
    return [...bd.relics, ...bd.satchel.filter((r) => !bd.relics.includes(r))];
  }
  update() {
    const n = nav(), P = this.players, bd = P[this.p]?.bd;
    if (!bd) return n.back && this.onBack(), true;
    const L_ = this.list(bd);
    if (this.swap >= 0) {
      if (n.up) (this.swap = (this.swap + bd.relics.length - 1) % bd.relics.length), sfx("ui");
      if (n.down) (this.swap = (this.swap + 1) % bd.relics.length), sfx("ui");
      if (n.ok) {
        const r = L_[this.i];
        unequip(bd, bd.relics[this.swap]);
        equip(bd, r);
        sfx("powerup", 0.6);
        this.swap = -1;
        this.i = bd.relics.indexOf(r);
      }
      if (n.back) (this.swap = -1), sfx("ui");
      return true;
    }
    if (P.length > 1 && n.left) (this.p = (this.p + P.length - 1) % P.length), (this.i = 0), sfx("ui");
    if (P.length > 1 && n.right) (this.p = (this.p + 1) % P.length), (this.i = 0), sfx("ui");
    if (L_.length && n.up) (this.i = (this.i + L_.length - 1) % L_.length), sfx("ui");
    if (L_.length && n.down) (this.i = (this.i + 1) % L_.length), sfx("ui");
    if (L_.length && n.ok) {
      const r = L_[this.i];
      if (bd.relics.includes(r)) (unequip(bd, r), sfx("nope", 0.6), (this.i = this.list(bd).indexOf(r)));
      else if (bd.relics.length < RELIC_SLOTS) (equip(bd, r), sfx("powerup", 0.6), (this.i = bd.relics.indexOf(r)));
      else (this.swap = 0), sfx("ui");
    } else if (n.back) this.onBack();
    return true;
  }
  draw() {
    const P = this.players, pl = P[this.p], hp = painterFor(G.screen.hud);
    panel(14, 10, 292, 160, { glow: pl && P.length > 1 ? pl.color : C.gold });
    text("RELICS", 160, 15, C.gold, { align: "center", font: "big" });
    if (!pl) return;
    const bd = pl.bd, L_ = this.list(bd);
    if (P.length > 1) {
      P.forEach((q, k) => {
        const x = 160 + (k - (P.length - 1) / 2) * 70, sel = k === this.p, s = `P${q.slot + 1} ${L(q.cls.name)}`;
        if (sel) hp.rect(x - 32, 33, 64, 1, q.color);
        text(s, x, 26, sel ? q.color : C.dark, { align: "center", max: 66 });
      });
    } else text(t("WORN {0}/{1}", bd.relics.length, RELIC_SLOTS), 160, 26, C.dim, { align: "center" });
    if (!L_.length) {
      text("NO RELICS YET", 160, 70, C.dim, { align: "center" });
      text("ONLY A FALLEN WARDEN GIVES ONE", 160, 80, C.dark, { align: "center" });
    }
    L_.forEach((r, i) => {
      const y = 38 + i * 12, sel = i === this.i, worn = bd.relics.includes(r), marked = this.swap >= 0 && bd.relics[this.swap] === r;
      if (sel || marked) hp.rect(22, y - 2, 276, 11, hex(marked ? "#4a1c28" : "#2a2040") >>> 0);
      drawRelic(r, 26, y - 1, 1, { dim: worn ? 0 : 0.45, glow: worn ? 0.2 : 0 });
      text(r.name, 38, y, worn ? hex(r.color) >>> 0 : C.dim, { max: 150 });
      text(worn ? "WORN" : "IN THE SATCHEL", 292, y, worn ? C.green : C.dark, { align: "right", max: 96 });
    });
    const cur = L_[this.i];
    if (cur) {
      hp.rect(22, 126, 276, 1, C.edge);
      para(cur.desc, 26, 130, 268, C.text);
    }
    const hint = this.swap >= 0 ? "UP/DOWN: WHICH TO SET ASIDE   ENTER: SWAP   ESC: CANCEL" : P.length > 1 ? "LEFT/RIGHT: PLAYER   ENTER: WEAR / SET ASIDE   ESC: BACK" : "ENTER: WEAR / SET ASIDE   ESC: BACK";
    text(hint, 160, 162, this.swap >= 0 ? C.gold : C.dark, { align: "center", max: 284 });
  }
}

export function optionsMenu(onBack) {
  const S = G.save.settings, A = G.audio;
  const VOL = { master: "VOLUME", music: "MUSIC", sfx: "SOUND EFFECTS" };
  const vol = (k) => ({ label: VOL[k], value: () => Math.round(S[k] * 10), left: () => set(k, -0.1), right: () => set(k, 0.1), act: () => set(k, 0.1) });
  const set = (k, d) => {
    S[k] = Math.max(0, Math.min(1, Math.round((S[k] + d) * 10) / 10));
    A.vol[k] = S[k];
    A.applyVolume();
    persist();
  };
  S.glow ??= true;
  const tog = (label, k, after) => ({ label, value: () => (S[k] ? "ON" : "OFF"), act: () => { S[k] = !S[k]; after?.(); persist(); }, left: () => { S[k] = !S[k]; after?.(); persist(); }, right: () => { S[k] = !S[k]; after?.(); persist(); } });
  const cycle = (d) => {
    const i = LANGS.findIndex((l) => l.id === lang_()), next = LANGS[(i + d + LANGS.length) % LANGS.length].id;
    S.lang = next;
    setLang(next);
    persist();
  };
  const m = new ListMenu("OPTIONS", [
    { label: "LANGUAGE", value: () => LANGS.find((l) => l.id === lang_()).name, left: () => cycle(-1), right: () => cycle(1), act: () => cycle(1) },
    vol("master"), vol("music"), vol("sfx"),
    { label: "SCREEN SHAKE", value: () => Math.round(S.shake * 100) + "%", left: () => (S.shake = Math.max(0, S.shake - 0.25), persist()), right: () => (S.shake = Math.min(1.5, S.shake + 0.25), persist()), act: () => (S.shake = S.shake >= 1.5 ? 0 : S.shake + 0.25, persist()) },
    tog("LOW EFFECTS", "lowfx"),
    tog("PIXEL PERFECT", "pixelPerfect", () => { G.screen.pixelPerfect = S.pixelPerfect; G.screen.fit(); }),
    ...(G.screen.gl ? [tog("GLOW", "glow", () => (G.screen.glow = S.glow)), tog("SCANLINES", "scanlines", () => (G.screen.scanlines = S.scanlines))] : []),
    { label: "RENDERER", value: () => `${G.screen.kind.toUpperCase()}${G.workers ? " + " + t("{0} CORES", G.workers.size + 1) : ""}` },
    ...(G.gpuName ? [{ label: "GPU", value: () => G.gpuName.slice(0, 26).toUpperCase() }] : []),
    { label: "FULLSCREEN", act: () => (window.desktop ? window.desktop.toggleFullscreen() : document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()) },
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
    panel(24, 8, 272, 166, { glow: C.ember });
    text("HOW TO PLAY", 160, 15, C.gold, { align: "center", font: "big" });
    const rows = [["MOVE", "WASD / ARROWS / LEFT STICK"], ["ATTACK (COMBO)", "J / Z / A"], ["SPECIAL", "K / X / X"], ["DASH (I-FRAMES)", "L / C / SPACE / SHIFT / B"], ["ULTIMATE", "I / V / Y"], ["USE", "E / F / LB"], ["PAUSE", "ESC / P / START"]];
    const lh = isCJK() ? 11 : 9;
    rows.forEach(([a, b], i) => { text(a, 40, 32 + i * lh, C.ember); text(b, 150, 32 + i * lh, C.text); });
    // the two paragraphs stack, however long a language makes them
    let y = 36 + rows.length * lh;
    y += para("DASH JUST BEFORE A BLOW LANDS TO PARRY IT. FOES GLOW RED AS THEY WIND UP. CLEAR ROOMS, PICK BOONS, CLIMB FIVE REALMS. EMBERS YOU CARRY HOME BUY POWER FOR THE NEXT CLIMB.", 40, y, 240, C.dim) + 3;
    para("CO-OP 1-4: AT THE CAMP, PRESS A ON ANOTHER PAD OR [.] (ARROWS PLAYER) TO JOIN. HOLD USE BESIDE A DOWNED FRIEND TO REVIVE THEM.", 40, y, 240, C.ember);
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
      // every vessel is free to choose
      S.lastClass = id;
      persist();
      sfx("ok");
      this.onChange(id, false);
      this.onBack();
    }
    if (n.back) {
      this.onChange(S.lastClass, false);
      this.onBack();
    }
    return true;
  }
  draw() {
    const id = CLASS_ORDER[this.i], cls = CLASSES[id], S = G.save;
    panel(150, 18, 160, 132, { glow: C.ember });
    text("< " + L(cls.name) + " >", 230, 25, C.gold, { align: "center", font: "big" });
    text(cls.title, 230, 36, C.dim, { align: "center" });
    para(cls.desc, 158, 46, 144, C.text);
    text(t("HEARTS {0}   SPEED {1}", cls.hp / 2, cls.speed), 158, 88, C.blue);
    text(t("SPECIAL: {0}", cls.special.name), 158, 96, C.text);
    text(t("ULTIMATE: {0}", cls.ult.name), 158, 104, C.text);
    text(S.lastClass === id ? "CHOSEN" : "[ENTER] CHOOSE", 230, 132, S.lastClass === id ? C.green : C.white, { align: "center" });
    CLASS_ORDER.forEach((c, k) => painterFor(G.screen.hud).rect(200 + k * 10, 142, 6, 2, k === this.i ? C.white : C.ember));
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
    text(t("EMBERS: {0}", S.embers), 160, 27, C.ember, { align: "center" });
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
    text(t("{0} OF {1} WITNESSED", seenCount(), EFFECT_IDS.length), 212, 16, C.ember, { align: "center" });
    if (this.id && isSeen(this.id)) para(effects[this.id].meta.desc, 112, 156, 204, C.dim, { lh: 6 });
    else text("NOT YET WITNESSED ON THE CLIMB", 212, 90, C.dark, { align: "center" });
    text("[LEFT/RIGHT] CATEGORY  [UP/DOWN] EFFECT  [ESC] BACK", 212, 26, C.dim, { align: "center" });
  }
}
export { bar, width, bake, blit, fxMod };

// ---------------------------------------------------------------- the party

/**
 * The party altar: up to four players, each on their own device, each choosing their own vessel. A new device joins by
 * pressing ATTACK; LEFT and RIGHT change vessel; SPECIAL leaves (not the host); ATTACK on a sleeping vessel awakens it
 * with embers; the host's ATTACK (or ESC) closes the altar. Solo again, the host goes back to using any device.
 */
export class PartyMenu {
  constructor(onChange, onClose, joining) {
    this.onChange = onChange;
    this.onClose = onClose;
    this.t = 0;
    const I = G.input, P = G.party;
    // the host gets a device of their own so others can join without fighting over the keyboard
    if (P.length === 1 && !P[0].device) P[0].device = I.lastDevice === "pad" ? "pad" + (I.lastPad ?? 0) : "kbA";
    if (joining && !P.some((s) => s.device === joining)) this.join(joining);
    for (const d of I.devices()) I.device(d).flush();
  }
  join(device) {
    const P = G.party;
    if (P.length >= 4) return;
    const taken = new Set(P.map((s) => s.cls)), S = G.save;
    const cls = CLASS_ORDER.find((c) => S.unlocked[c] && !taken.has(c)) ?? CLASS_ORDER.find((c) => S.unlocked[c]);
    P.push({ cls, device });
    sfx("powerup", 0.7);
    this.onChange();
  }
  close() {
    const S = G.save;
    // nobody climbs as a vessel that's still asleep
    for (const s of G.party) if (!S.unlocked[s.cls]) s.cls = CLASS_ORDER.find((c) => S.unlocked[c]);
    S.lastClass = G.party[0].cls;
    if (G.party.length === 1) G.party[0].device = null;
    persist();
    this.onChange();
    this.onClose();
    G.input.flush();
  }
  update(dt) {
    this.t += dt;
    const I = G.input, P = G.party, S = G.save;
    if (this.t < 0.2) return true;
    const used = new Set(P.map((s) => s.device));
    for (const d of I.devices()) {
      const c = I.device(d);
      if (!used.has(d) && c.take("attack")) return this.join(d), true;
    }
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i], c = I.device(s.device), k = CLASS_ORDER.indexOf(s.cls);
      if (c.take("mleft") || c.take("left")) (s.cls = CLASS_ORDER[(k + CLASS_ORDER.length - 1) % CLASS_ORDER.length]), sfx("ui"), this.onChange();
      if (c.take("mright") || c.take("right")) (s.cls = CLASS_ORDER[(k + 1) % CLASS_ORDER.length]), sfx("ui"), this.onChange();
      if (i > 0 && c.take("special")) {
        P.splice(i, 1);
        sfx("nope");
        this.onChange();
        continue;
      }
      if (c.take("attack")) {
        if (i === 0) return this.close(), false;
        else (s.ready = !s.ready), sfx("ok");
      }
    }
    if (I.take("pause")) return this.close(), false;
    return true;
  }
  draw() {
    const P = G.party, S = G.save;
    panel(4, 14, 312, 152, { glow: C.ember, a: 0.94 });
    text("THE PARTY", 160, 19, C.gold, { align: "center", font: "big" });
    text(t("1 TO 4 PLAYERS. EACH PICKS THEIR OWN VESSEL.  EMBERS {0}", S.embers), 160, 29, C.dim, { align: "center" });
    for (let i = 0; i < 4; i++) {
      const x = 8 + i * 77, s = P[i], col = hex(PLAYER_COLORS[i]) >>> 0;
      panel(x, 38, 73, 112, { edge: s ? col : C.edge, a: 0.9 });
      text(`P${i + 1}${i === 0 ? " " + t("HOST") : ""}`, x + 36, 42, s ? col : C.dark, { align: "center" });
      if (!s) {
        const blink = Math.floor(this.t * 2) & 1;
        text("PRESS ATTACK", x + 36, 80, blink ? C.text : C.dim, { align: "center" });
        text("TO JOIN", x + 36, 87, blink ? C.text : C.dim, { align: "center" });
        para("PAD: A   KEYS: [.] OR NUM 1 (ARROWS MOVE)", x + 4, 104, 65, C.dark, { align: "center" });
        continue;
      }
      const cls = CLASSES[s.cls];
      text("< " + L(cls.name) + " >", x + 36, 52, C.white, { align: "center", max: 70 });
      text(cls.title, x + 36, 59, C.dim, { align: "center", max: 70 });
      text(t("HEARTS {0}  SPD {1}", cls.hp / 2, cls.speed), x + 36, 68, C.blue, { align: "center", max: 70 });
      text(cls.special.name, x + 36, 76, C.text, { align: "center", max: 70 });
      text(cls.ult.name, x + 36, 83, C.ember, { align: "center", max: 70 });
      if (i > 0) text(s.ready ? "READY" : "", x + 36, 96, C.green, { align: "center" });
      text(DEVICE_LABEL[s.device] ?? "ANY DEVICE", x + 36, 132, C.dark, { align: "center", max: 70 });
      text(i === 0 ? "ATTACK: DONE" : "SPECIAL: LEAVE", x + 36, 140, C.dim, { align: "center", max: 70 });
    }
    text("LEFT/RIGHT: CHANGE VESSEL   ESC: DONE", 160, 156, C.dim, { align: "center", max: 312 });
  }
}
