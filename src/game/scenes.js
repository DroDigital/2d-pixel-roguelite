// Scenes and the director that runs them: the title, the camp between climbs, the climb itself, and how it ends.
// Changes of scene and room go through pixelfx's screen transitions.

import { PAL, hex, painterFor, Target, seenCount, EFFECT_IDS } from "../engine/pfx.js";
import { FxManager } from "../engine/fxm.js";
import { still, blit, bake } from "../engine/bake.js";
import { G, sfx, rnd, pick, FLOOR_TOP } from "./ctx.js";
import { World } from "./world.js";
import { PAINTERS } from "./art.js";
import { Hud } from "./hud.js";
import { Player } from "./player.js";
import { CLASSES } from "./classes.js";
import { Run } from "./run.js";
import { Room, BIOMES, ROOMS_PER_BIOME } from "./rooms.js";
import { Ent } from "./entity.js";
import { Interactable, Door } from "./props.js";
import { C, text, para, panel } from "./ui.js";
import { ListMenu, BoonPick, BoonList, optionsMenu, Controls, ClassAltar, Shrine, Codex } from "./menus.js";
import { BOONS } from "./boons.js";
import { damage, kill, applyStatus } from "./combat.js";

Codex.prototype.fullscreen = true;

// ---------------------------------------------------------------- the director
const TRANSITIONS = ["transitions/iris", "transitions/star-iris", "transitions/diamond-wipe", "transitions/blinds", "transitions/pixel-dissolve", "transitions/slash-wipe", "transitions/shatter-wipe", "transitions/glitch-wipe", "transitions/burn-away"];
const director = {
  cur: null,
  fx: new FxManager(),
  pending: null,
  update(dt) {
    this.fx.update(dt);
    if (this.pending && (this.pending.t -= dt) <= 0) {
      const f = this.pending.fn;
      this.pending = null;
      f();
      G.input.flush();
    }
    if (!this.pending || this.pending.keepUpdating) this.cur?.update(dt);
    G.hud?.update(dt);
    // flashes fade on their own
    const S = G.screen;
    if (S.flash > 0) S.flash = Math.max(0, S.flash - dt * 2.5);
    if (S.flash <= 0) S.flashColor = [255, 255, 255];
  },
  draw() {
    this.cur?.draw();
    this.fx.drawLayer(G.screen.hud, "hud");
  },
  /** Cover the screen with a transition, swap at its darkest, uncover. */
  go(fn, id) {
    if (this.pending) return;
    id ??= pick(TRANSITIONS);
    const e = this.fx.spawn(id, 0, 0, {}, { layer: "hud", prio: 2, speed: 1.3 });
    const D = (e?.mod.meta.duration ?? 2) / 1.3;
    this.pending = { t: D * 0.42, fn, keepUpdating: true };
    sfx("door", 0.5, 0.7);
  },
  set(scene) {
    this.cur = scene;
    G.scene = scene;
    scene.enter?.();
  },
};
G.director = director;
G.dbg = { damage, kill, applyStatus };
G.dbgBlit = (f, d) => blit(f, d.b, d.x, d.y, 1, {});

export function boot(params) {
  G.hud = new Hud();
  if (params.has("sandbox")) return director.set(new GameScene(params.get("class") ?? "knight", { biome: +(params.get("biome") ?? 0), room: params.get("room") }));
  if (params.has("hub")) return director.set(new HubScene());
  director.set(new TitleScene());
}

/** Draw one still frame of an effect (a closed chest, an unhatched egg). */
function drawStill(frame, id, x, y, opts = {}) {
  blit(frame, still(id, opts, 0), x, y, 0);
}

// ---------------------------------------------------------------- title
class TitleScene {
  enter() {
    this.t = 0;
    this.w = new World();
    G.world = this.w;
    PAINTERS.title(G.screen.bg);
    this.w.addWeather("weather/shooting-stars", {});
    this.w.addDecor("fire/spirit-flame", 160, 84, { palette: PAL.fire }, { wall: true });
    this.w.addWeather("weather/fireflies", { palette: PAL.ember });
    this.menu = null;
    this.overlay = null;
    G.audio.music("title");
    G.hud.hidden = true;
  }
  openMenu() {
    const S = G.save;
    this.menu = new ListMenu("", [
      { label: S.stats.runs ? "RETURN TO CAMP" : "BEGIN THE CLIMB", act: () => director.go(() => director.set(new HubScene()), "transitions/iris") },
      { label: "HOW TO PLAY", act: () => (this.overlay = new Controls(() => (this.overlay = null))) },
      { label: "CODEX", act: () => (this.overlay = new Codex(() => { this.overlay = null; PAINTERS.title(G.screen.bg); })) },
      { label: "OPTIONS", act: () => (this.overlay = optionsMenu(() => (this.overlay = null))) },
    ], { w: 130 });
  }
  update(dt) {
    this.t += dt;
    this.w.update(dt);
    if (this.overlay) return this.overlay.update(dt);
    if (!this.menu) {
      if (G.input.take("confirm") || G.input.take("attack") || (this.t > 0.5 && G.input.any && G.input.take("pause"))) {
        sfx("ok");
        this.openMenu();
      }
      return;
    }
    this.menu.update(dt);
  }
  draw() {
    if (this.overlay?.fullscreen) return this.overlay.draw();
    this.w.draw(G.screen.frame);
    const k = Math.min(1, this.t / 1.5), p = painterFor(G.screen.hud);
    const grad = (gx, gy) => hex(["#fff4c0", "#ffd84a", "#ff9a3c", "#e0501c", "#a02414"][Math.min(4, Math.floor(gy / 1.6))]) >>> 0;
    p.text("EMBERSPIRE", 160, 18 - (1 - k) * 20, grad, { font: "big", scale: 3, align: "center", outline: hex("#14080a") >>> 0, a: k, shadow: hex("#4a1010") >>> 0 });
    for (let i = 0; i < 40; i++) p.light(60 + i * 5, 28, hex("#ff8a2a"), 0.12 * k);
    text("A PIXELFX ROGUELITE", 160, 46, C.dim, { align: "center", a: k });
    if (!this.menu && !this.overlay) {
      if (Math.floor(this.t * 2) & 1) text("PRESS ENTER", 160, 128, C.white, { align: "center" });
    } else if (this.menu && !this.overlay) this.menu.draw();
    if (this.overlay) this.overlay.draw();
    text("EFFECTS: PIXELFX BY PATCH AND HUGO DUPREZ (MIT)", 160, 172, C.dark, { align: "center" });
  }
}

// ---------------------------------------------------------------- the camp
class Dummy extends Ent {
  constructor(x, y) {
    super({ x, y, r: 9, h: 40, depthR: 6, team: "enemy", hittable: true, solid: true, hp: 1e9, maxhp: 1e9, shadow: 10, counts: false, kind: "dummy" });
    this.target = new Target(0, 7);
    this.armored = true;
  }
  get heavy() {
    return true;
  }
  update(dt) {
    this.age += dt;
    this.kbx = 0;
    this.stun = 0;
    this.st = {};
    this.target.step(dt);
    this.hp = 1e9;
  }
  onDamaged(d, info) {
    this.target.hit({ push: Math.min(4, 0.6 + d * 0.08) * (info.dir ?? 1), straw: 6, skin: info.elem === "fire" ? "char" : info.elem === "ice" ? "ice" : info.elem === "shock" ? "shock" : info.elem === "holy" ? "holy" : info.elem === "shadow" ? "shadow" : info.elem === "poison" ? "poison" : null });
  }
  draw(frame) {
    this.target.draw(frame.color, frame.w, frame.h, Math.round(this.x), Math.round(this.y), false);
    this.target.drawStraw(frame.color, frame.w, frame.h, Math.round(this.x), Math.round(this.y), false);
  }
  snapshot() {
    return null;
  }
}

class HubScene {
  enter() {
    G.run = null;
    G.room = null;
    this.overlay = null;
    this.build();
    G.audio.music("hub");
    G.hud.hidden = false;
    G.hud.boss = null;
    G.hud.title("THE LAST CAMP", "BELOW THE EMBERSPIRE", 2.6);
    if (!G.save.seenIntro) {
      G.save.seenIntro = true;
      G.persist();
      this.overlay = new Controls(() => (this.overlay = null));
    }
  }
  build(cls = G.save.lastClass, x = 160, y = 156) {
    const w = (this.w = G.world = new World());
    PAINTERS.hub(G.screen.bg);
    w.addWeather("weather/shooting-stars", {});
    w.addWeather("weather/fireflies", {});
    w.addDecor("fire/campfire", 160, 140, {}, { solid: 12 });
    w.addDecor("fire/torch", 24, FLOOR_TOP + 6, {}, {});
    w.addDecor("fire/torch", 296, FLOOR_TOP + 6, {}, {});
    // stations
    const portal = w.add(new Door(276, FLOOR_TOP + 16, { type: "climb", label: "THE CLIMB", palette: PAL.fire }, { fx: "pickups/power-star", opts: { palette: PAL.fire } }));
    portal.update = function (dt) { this.age += dt; this.open = 1; const p = G.world.player; if (p && Math.abs(p.x - this.x) < 12 && Math.abs(p.y - this.y) < 8 && !director.pending) startClimb(); };
    const st = (x, y, o, fn) => {
      const it = w.add(new Interactable(x, y, o));
      it.interact = fn;
      return it;
    };
    this.stations = [
      st(44, FLOOR_TOP + 12, { fx: "arcane/rune-circle", opts: { palette: PAL.fire }, prompt: "THE EMBER SHRINE (UPGRADES)", label: "SHRINE", labelY: -30 }, () => (this.overlay = new Shrine(() => (this.overlay = null)))),
      st(98, FLOOR_TOP + 10, { fx: "pickups/loot-beam", opts: { palette: PAL.arcane }, prompt: "THE ALTAR OF VESSELS", label: "VESSELS", labelY: -56 }, () => (this.overlay = new ClassAltar((id, preview) => this.swap(id), () => (this.overlay = null)))),
      st(214, FLOOR_TOP + 10, { fx: "scifi/hologram", opts: { palette: PAL.ember }, prompt: "THE CODEX OF EFFECTS", label: "CODEX", labelY: -44 }, () => (this.overlay = new Codex(() => { this.overlay = null; PAINTERS.hub(G.screen.bg); }))),
    ];
    w.add(new Dummy(232, 162));
    const p = new Player(CLASSES[cls] ?? CLASSES.knight, x, y);
    G.run = this.fakeRun();
    w.player = w.add(p);
  }
  fakeRun() {
    // the camp has no climb, but the vessel wants stats and hooks
    const r = new Run(G.save.lastClass);
    r.godMode = true;
    r.ult = 100;
    return r;
  }
  swap(id) {
    const p = this.w.player;
    this.w.spawnFx("spawn/poof", p.x, p.y, {}, { prio: 2 });
    p.gone = true;
    const np = new Player(CLASSES[id], p.x, p.y);
    np.facing = p.facing;
    G.run = new Run(id);
    G.run.godMode = true;
    G.run.ult = 100;
    this.w.player = this.w.add(np);
    this.w.spawnFx("arcane/blink-in", np.x, np.y, { actor: np.snapshot() }, { prio: 2 });
  }
  update(dt) {
    if (this.overlay) return this.overlay.update(dt);
    if (G.input.take("pause")) return (this.overlay = new ListMenu("CAMP", [
      { label: "RESUME", act: () => (this.overlay = null) },
      { label: "OPTIONS", act: () => (this.overlay = optionsMenu(() => (this.overlay = null))) },
      { label: "TITLE SCREEN", act: () => director.go(() => director.set(new TitleScene())) },
    ], { onBack: () => (this.overlay = null) }));
    this.w.update(dt);
    G.run.ult = Math.min(100, G.run.ult + dt * 10);
    G.run.hp = G.run.maxHp;
    const p = this.w.player;
    let best = null, bd = 30;
    for (const s of this.stations) {
      const d = Math.hypot(s.x - p.x, (s.y - p.y) * 0.7);
      if (d < bd) (bd = d), (best = s);
    }
    p.interactable = best;
    G.hud.prompt = best ? `[E] ${best.prompt}` : p.x > 240 ? "THE CLIMB AWAITS" : null;
  }
  draw() {
    if (this.overlay?.fullscreen) return this.overlay.draw();
    this.w.draw(G.screen.frame);
    const S = G.save;
    text(`EMBERS ${S.embers}`, 314, 5, C.ember, { align: "right" });
    text(`CLIMBS ${S.stats.runs}  ASCENSIONS ${S.stats.wins}`, 314, 12, C.dim, { align: "right" });
    text(`CODEX ${seenCount()}/${EFFECT_IDS.length}`, 314, 19, C.dim, { align: "right" });
    text(CLASSES[S.lastClass].name, 6, 6, C.gold);
    text("[J] ATTACK  [K] SPECIAL  [L] DASH  [I] ULT", 6, 172, C.dark);
    G.hud.draw();
    if (this.overlay) {
      G.screen.dim = 0;
      this.overlay.draw();
    }
  }
}

function startClimb() {
  const S = G.save;
  S.stats.runs++;
  G.persist();
  director.go(() => director.set(new GameScene(S.lastClass)), "transitions/burn-away");
}

// ---------------------------------------------------------------- the climb
class GameScene {
  constructor(clsId, o = {}) {
    this.clsId = clsId;
    this.o = o;
  }
  enter() {
    G.run = this.run = new Run(this.clsId);
    this.player = new Player(this.run.cls);
    this.run.biome = this.o.biome ?? 0;
    if (G.debug && this.o.room) this.run.room = +this.o.room;
    this.overlay = null;
    G.hud.hidden = false;
    G.hud.boss = null;
    this.drawStill = drawStill;
    this.startRoom(this.o.room === "boss" ? { type: "boss" } : { type: "combat", reward: { kind: "boon", elem: pick(["fire", "ice", "shock", "holy", "shadow"]) } });
  }
  startRoom(spec) {
    G.hud.boss = null;
    this.player.hidden = false;
    this.room = G.room = new Room(this.run, spec);
    this.world = this.room.build(this.player);
    this.player.iframe = 1;
    this.world.spawnFx("impacts/heavy-landing", this.player.x, this.player.y, {}, { prio: 2, delay: 0.25 });
  }
  /** Through a door: the next room, or up into the next realm. */
  nextRoom(spec) {
    const run = this.run;
    director.go(() => {
      if (spec.type === "ascend") {
        run.biome++;
        run.room = 0;
        this.startRoom({ type: "combat", reward: { kind: "boon", elem: pick(["fire", "ice", "shock", "holy", "shadow", "poison"]) } });
      } else {
        run.room++;
        this.startRoom(spec);
      }
    });
  }
  /** Offer boons (of one element if given), then call back. */
  openBoons(elem, minRarity = 0, then) {
    const run = this.run;
    const roll = () => {
      const pool = run.offer(14, minRarity);
      const pref = elem ? pool.filter((b) => b.elem === elem) : [];
      const rest = pool.filter((b) => !pref.includes(b));
      return [...pref.slice(0, 2), ...rest].slice(0, 3);
    };
    this.overlay = new BoonPick(roll(), (b) => {
      this.overlay = null;
      G.input.flush();
      if (b) {
        run.addBoon(b);
        const p = this.world.player;
        this.world.spawnFx("ui/level-up", p.x, p.y, { text: b.name.length <= 12 ? b.name : "BLESSED!", actor: p.snapshot() }, { follow: p, prio: 2 });
        sfx("powerup");
      }
      then?.();
    }, { reroll: roll, title: minRarity >= 2 ? "A RARE GIFT" : "CHOOSE A BOON" });
  }
  pause() {
    this.overlay = new ListMenu("PAUSED", [
      { label: "RESUME", act: () => (this.overlay = null) },
      { label: "BOONS", act: () => (this.overlay = new BoonList(() => this.pause())) },
      { label: "OPTIONS", act: () => (this.overlay = optionsMenu(() => this.pause())) },
      { label: "ABANDON CLIMB", act: () => { this.overlay = null; this.run.hp = 0; this.run.playerDown(); } },
    ], { onBack: () => (this.overlay = null), sub: `${BIOMES[this.run.biome].name} - ROOM ${this.run.room + 1}` });
  }
  update(dt) {
    if (this.overlay) {
      if (this.overlay.update(dt) === false) this.overlay = null;
      return;
    }
    if (G.input.take("pause") && !this.over) return this.pause();
    this.world.update(dt);
    this.room.update(dt);
    if (!this.over) this.run.update(dt);
    if (this.over) {
      this.overT += dt;
      if (this.overT > 2.6 && !this.left) {
        this.left = true;
        director.go(() => director.set(new EndScene(this.run, false)), "transitions/crt-off");
      }
    }
  }
  onPlayerDeath() {
    if (this.over) return;
    this.over = true;
    this.overT = 0;
    const p = this.world.player;
    this.world.slowmo(0.25, 1.5);
    G.screen.flash = 0.5;
    G.screen.flashColor = [255, 60, 60];
    sfx("gameover");
    this.world.spawnFx("spawn/dissolve-burn", p.x, p.y, { actor: p.snapshot() }, { prio: 2, delay: 0.6 });
    this.world.after(0.6, () => (p.hidden = true));
    G.hud.title("THE EMBER GOES OUT", "", 2.4);
    G.audio.music("gameover");
  }
  victory() {
    if (this.won) return;
    this.won = true;
    this.world.after(2.5, () => director.go(() => director.set(new EndScene(this.run, true)), "transitions/star-iris"));
  }
  draw() {
    this.world.draw(G.screen.frame);
    const [sx, sy] = this.world.shakeXY;
    G.screen.shake = [sx, sy];
    if (this.over) G.hud.prompt = null;
    G.hud.draw();
    if (this.overlay) {
      G.screen.dim = 0.55;
      this.overlay.draw();
    } else G.screen.dim = 0;
    if (G.debug) text(`${Math.round(G.fps)} FPS  FX ${this.world.fx.list.length}  ENTS ${this.world.ents.length}`, 4, 172, C.green);
  }
}

// ---------------------------------------------------------------- the end of a climb
class EndScene {
  constructor(run, won) {
    this.run = run;
    this.won = won;
  }
  enter() {
    const run = this.run, S = G.save;
    this.t = 0;
    G.hud.boss = null;
    G.hud.hidden = true;
    G.screen.dim = 0;
    G.screen.shake = [0, 0];
    this.bonus = this.won ? 50 : 0;
    this.earned = run.embers + this.bonus + run.stats_.bosses * 5;
    S.embers += this.earned;
    S.totalEmbers += this.earned;
    S.stats.deaths += this.won ? 0 : 1;
    if (this.won) S.stats.wins++;
    S.stats.bestDepth = Math.max(S.stats.bestDepth, run.biome * 10 + run.room);
    G.persist();
    const w = (this.w = G.world = new World());
    if (this.won) {
      PAINTERS.title(G.screen.bg);
      w.addWeather("weather/aurora", {});
      G.audio.music("victory");
      sfx("win");
      for (let i = 0; i < 10; i++) w.after(0.4 + i * 0.6, () => { w.spawnFx("explosions/firework-rocket", rnd(40, 280), 178, { tips: pick([PAL.candy, PAL.neon, PAL.gold, PAL.fire]) }, { prio: 1 }); sfx("boom", 0.3, 1.8); });
      w.after(1, () => w.spawnFx("ui/confetti", 160, 150, {}, { prio: 2 }));
      w.after(2.5, () => G.hud.toast("ASCENDED", "THE EMBER IS YOURS", PAL.gold));
    } else {
      PAINTERS.crypt(G.screen.bg, 3);
      w.addDecor("fire/candle", 160, 150, {}, {});
      w.addWeather("weather/fog", {});
    }
  }
  update(dt) {
    this.t += dt;
    this.w.update(dt);
    if (this.t > 1.5 && (G.input.take("confirm") || G.input.take("attack"))) director.go(() => director.set(new HubScene()), "transitions/iris");
  }
  draw() {
    this.w.draw(G.screen.frame);
    const r = this.run, k = Math.min(1, this.t);
    text(this.won ? "ASCENSION" : "THE EMBER FADES", 160, 22, this.won ? C.gold : C.red, { font: "big", scale: 2, align: "center", a: k });
    panel(80, 50, 160, 92, { glow: this.won ? C.gold : C.ember, a: 0.85 });
    const rows = [
      ["VESSEL", CLASSES[r.clsId].name], ["REACHED", `${BIOMES[r.biome].name}`], ["ROOMS CLEARED", r.stats_.rooms], ["FOES FELLED", r.kills],
      ["BEST COMBO", r.bestCombo], ["WARDENS SLAIN", r.stats_.bosses], ["PARRIES", r.stats_.parries ?? 0], ["TIME", `${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, "0")}`],
    ];
    rows.forEach(([a, b], i) => { text(a, 88, 56 + i * 8, C.dim); text(String(b), 232, 56 + i * 8, C.white, { align: "right" }); });
    text(`EMBERS CARRIED HOME: ${this.earned}`, 160, 124, C.ember, { align: "center" });
    text(`BOONS: ${r.boons.length}`, 160, 132, C.dim, { align: "center" });
    if (this.t > 1.5 && Math.floor(this.t * 2) & 1) text("PRESS ENTER TO RETURN TO CAMP", 160, 156, C.white, { align: "center" });
    G.hud.hidden = true;
    G.hud.draw();
  }
}

export { director, TitleScene, HubScene, GameScene, BOONS, ROOMS_PER_BIOME, para, bake, Interactable };
