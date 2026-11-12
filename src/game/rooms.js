// The spire's five realms and the rooms you fight through: waves summoned in each realm's own way, rewards that
// rise when the room falls quiet, and doors that show what waits beyond them.

import { PAL } from "../engine/pfx.js";
import { G, sfx, rnd, rint, pick, chance, shuffle, weighted, FLOOR_TOP, FLOOR_BOT } from "./ctx.js";
import { World } from "./world.js";
import { PAINTERS } from "./art.js";
import { makeEnemy, summon, ENEMIES } from "./enemies.js";
import { Barrel, Hazard, Interactable, Door } from "./props.js";
import { Pickup } from "./entity.js";
import { coin, ember } from "./run.js";
import { ELEM_PAL, ELEM_NAME, BOONS } from "./boons.js";
import { makeBoss } from "./bosses.js";
import { applyStatus } from "./combat.js";
import { bake } from "../engine/bake.js";

const HOLY_FIRE = ["#2a1c08", "#5a3e10", "#9a6c18", "#d8a428", "#ffd84a", "#fff09a", "#fffbe6", "#ffffff"];
export const ROOMS_PER_BIOME = 5;

export const BIOMES = [
  {
    id: "crypt", name: "THE SUNKEN CRYPT", sub: "WHERE THE OLD VESSELS SLEEP", music: "crypt", paint: "crypt", spawn: "rise", door: PAL.arcane,
    a: ["slime", "slime", "bat", "skeleton"], b: ["skeleton", "skull", "cultist", "bat", "slime", "ghost", "ghoul"], elite: ["graveknight"], boss: "hollowking",
    weather: () => (chance(0.6) ? [["weather/fog", { palette: ["#0e0c14", "#1a1724", "#2a2638", "#3e3a52", "#565070", "#7a7494", "#a39cbb", "#d0cce0"] }]] : []),
    decor(w) {
      for (const x of [28, 160, 292]) w.addDecor("fire/torch", x, 78, {}, { wall: true });
      for (const x of [72, 88, 232, 248]) w.addDecor("fire/candle", x, FLOOR_TOP - 3, {}, { wall: true });
    },
    props: () => (chance(0.6) ? [["barrel", {}]] : []),
  },
  {
    id: "grotto", name: "THE DROWNED GROTTO", sub: "THE TIDE REMEMBERS", music: "grotto", paint: "grotto", spawn: "splash", door: PAL.water,
    a: ["frog", "snake", "slime"], b: ["frog", "snake", "jelly", "eye", "spearman", "cutthroat"], elite: ["tidecaller"], boss: "oracle",
    weather: () => (chance(0.3) ? [["weather/rain", { density: 0.7 }]] : [["weather/fireflies", { palette: ["#0a1f2e", "#0f3d52", "#14707e", "#1fa8a8", "#4fe0c8", "#a8fff0", "#ffffff"] }]]),
    decor(w) {
      w.addDecor("water/waterfall", 46, FLOOR_TOP + 2, { height: 74 }, { wall: true });
      w.addDecor("water/waterfall", 270, FLOOR_TOP + 2, { height: 74, width: 11 }, { wall: true, flip: true });
      for (const x of [120, 200]) w.addDecor("water/drip", x, FLOOR_TOP + 2, { height: 56 }, { wall: true });
      w.addDecor("critters/fish-school", 160, FLOOR_TOP + 4, { palette: PAL.cyber }, { wall: true, alpha: 0.6, light: 0.6 });
      w.addDecor("water/rain-splash", 230, FLOOR_TOP + 3, {}, { wall: true, alpha: 0.7, fps: 15 });
    },
    props: () => (chance(0.5) ? [chance(0.5) ? ["hazard", { fx: "nature/toxic-puddle", r: 22, dmg: 1, every: 1, elem: "poison", status: ["poison", 3] }] : ["hazard", { fx: "nature/poison-cloud", opts: { spread: 0.6 }, layer: "world", r: 36, dmg: 1, every: 1.2, elem: "poison", status: ["poison", 3] }]] : []),
  },
  {
    id: "frost", name: "THE RIME PEAK", sub: "BREATH TURNS TO GLASS", music: "frost", paint: "frost", spawn: "frost", door: PAL.ice,
    a: ["frostslime", "snowbat", "icewisp"], b: ["frostknight", "icewisp", "frostghost", "snowbat", "frostslime", "frostknight"], elite: ["yeti"], boss: "rimequeen",
    weather: (t) => (t === "boss" ? [["weather/blizzard", {}]] : chance(0.5) ? [["weather/aurora", {}], ["weather/snow", {}]] : [["weather/snow", {}]]),
    decor(w) {
      for (const [x, y] of [[22, 132], [298, 140], [18, 166]]) w.addDecor("ice/ice-crystal", x, y, { height: 24 }, { solid: 8 });
    },
    props: () => [],
  },
  {
    id: "foundry", name: "THE STORM FOUNDRY", sub: "THE ENGINES NEVER SLEEP", music: "foundry", paint: "foundry", spawn: "warp", door: PAL.cyber,
    a: ["voltslime", "drone", "gunner"], b: ["gunner", "rocketeer", "drone", "stormcaller", "voltslime", "flamer"], elite: ["mechbrute"], boss: "engine",
    weather: (t) => (t === "boss" || chance(0.3) ? [["weather/storm", {}]] : []),
    decor(w) {
      w.addDecor("lightning/tesla-coil", 30, FLOOR_TOP + 6, {}, { solid: 10 });
      w.addDecor("lightning/tesla-coil", 290, FLOOR_TOP + 6, {}, { solid: 10, flip: true });
      w.addDecor("scifi/energy-core", 160, FLOOR_TOP - 4, {}, { wall: true });
      for (const x of [96, 224]) w.addDecor("lightning/plasma-ball", x, FLOOR_TOP - 3, {}, { wall: true });
    },
    props: () => [chance(0.6) ? ["barrel", { barrel: ["#1c2230", "#2e3648", "#4a5468", "#e8a218", "#ffd23c"] }] : null, chance(0.4) ? ["hazard", { fx: "scifi/laser-grid", r: 24, dmg: 1, every: 0.6, elem: "fire", active: (t) => t % 3 < 1.8 }] : null].filter(Boolean),
  },
  {
    id: "sanctum", name: "THE LAST SANCTUM", sub: "THE EMBER AT THE TOP OF THE WORLD", music: "sanctum", paint: "sanctum", spawn: "holy", door: PAL.holy,
    a: ["holywisp", "butterfly", "seraph"], b: ["seraph", "archer", "priest", "holywisp", "butterfly", "lasher"], elite: ["paladin"], boss: "seraph",
    weather: () => [chance(0.5) ? ["weather/god-rays", {}] : ["weather/clouds", {}], chance(0.5) ? ["weather/cherry-blossoms", {}] : ["weather/falling-leaves", {}]],
    decor(w) {
      for (const x of [40, 280]) w.addDecor("fire/brazier", x, FLOOR_TOP + 10, { palette: HOLY_FIRE }, { solid: 9 });
      w.addDecor("holy/sunburst", 160, 46, {}, { wall: true, alpha: 0.8, light: 0.8 });
      w.addDecor("critters/butterfly", 70, 70, {}, { wall: true });
      w.addDecor("critters/bird", 250, 40, {}, { wall: true });
    },
    props: () => (chance(0.25) ? [["hazard", { fx: "nature/tornado", opts: { height: 78 }, layer: "world", r: 18, dmg: 1, every: 1, follow: 14, life: 9999 }]] : []),
  },
];

// ---- what a door can lead to
const REWARD_ICON = {
  boon: (e) => ({ fx: "pickups/power-star", opts: { palette: ELEM_PAL[e] } }),
  coins: () => ({ fx: "pickups/coin-spin" }),
  heart: () => ({ fx: "pickups/heart-pickup", opts: { palette: ["#2a1405", "#5c3008", "#9a5a0e", "#d48e18", "#f5b92c", "#ffde5e", "#fff4bc", "#ffffff"] } }),
  embers: () => ({ fx: "pickups/gem-spin", opts: { palette: PAL.fire } }),
  ult: () => ({ fx: "pickups/xp-orb", opts: {} }),
};
const ROOM_ICON = {
  shop: { fx: "pickups/potion", opts: {} },
  rest: { fx: "fire/candle", opts: {}, yoff: 14 },
  shrine: { fx: "pickups/crystal-shard", opts: { palette: PAL.arcane } },
  treasure: { fx: "pickups/key-glint", opts: {} },
  mystery: { fx: "pickups/crystal-shard", opts: { palette: PAL.neon } },
  elite: { fx: "pickups/power-star", opts: { palette: ["#2a0510", "#5c0a1c", "#a3142a", "#e0302c", "#ff7a2a", "#ffc23d", "#fff09a", "#ffffff"] } },
  boss: { fx: "critters/flying-skull", opts: { hover: 0 }, yoff: 30 },
};
const LABEL = { shop: "MERCHANT", rest: "REST", shrine: "SHRINE", treasure: "TREASURE", mystery: "???", elite: "CHAMPION", boss: "THE WARDEN" };
const REWARD_LABEL = { boon: (e) => ELEM_NAME[e] + " BOON", coins: () => "GOLD", heart: () => "HEART", embers: () => "EMBERS", ult: () => "FOCUS" };

function rewardRoll(run) {
  const r = weighted([{ k: "boon", w: 5 }, { k: "coins", w: 2.2 }, { k: "heart", w: 1.1 }, { k: "embers", w: 1.6 }, { k: "ult", w: 0.6 }]).k;
  const elem = pick(Object.keys(ELEM_NAME).filter((e) => BOONS.some((b) => b.elem === e && !run.has(b.id))));
  return { kind: r, elem: elem ?? "phys" };
}
function doorSpec(run, type) {
  if (type === "combat") {
    const reward = rewardRoll(run);
    return { type, reward, label: REWARD_LABEL[reward.kind](reward.elem), icon: REWARD_ICON[reward.kind](reward.elem) };
  }
  return { type, label: LABEL[type], icon: ROOM_ICON[type] };
}
/** The choices after room `i` of a realm. */
export function nextChoices(run) {
  const i = run.room;
  if (i >= ROOMS_PER_BIOME - 1) return [{ ...doorSpec(run, "boss"), palette: PAL.blood }];
  const n = chance(0.35) ? 3 : 2, out = [];
  const pool = i === ROOMS_PER_BIOME - 2 ? ["rest", "shop", "combat"] : ["combat", "combat", "combat", "elite", "shop", "treasure", "shrine", "mystery", "rest"];
  const types = shuffle(pool.slice());
  for (const t of types) {
    if (out.length >= n) break;
    if (t !== "combat" && out.some((o) => o.type === t)) continue;
    if ((t === "rest" || t === "shop") && i === 0) continue;
    out.push(doorSpec(run, t));
  }
  if (!out.some((o) => o.type === "combat")) out[0] = doorSpec(run, "combat");
  return out;
}

const COST = (id) => (ENEMIES[id].elite ? 6 : ENEMIES[id].type === "vessel" ? 2 : 1);

/** One room of a run: built, fought, cleared, left. */
export class Room {
  constructor(run, spec) {
    this.run = run;
    this.spec = spec;
    this.biome = BIOMES[run.biome];
    this.type = spec.type;
    this.waves = [];
    this.fighting = false;
    this.cleared = false;
    this.leaving = false;
    this.interactables = [];
    this.t = 0;
    this.label = this.biome.name;
    this.pips = [run.room, ROOMS_PER_BIOME + 1];
  }
  build(player) {
    const w = (G.world = new World()), B = this.biome, run = this.run;
    PAINTERS[B.paint](G.screen.bg, run.biome * 7 + run.room * 13 + 1);
    B.decor(w);
    // bake what this realm will need now, while the transition covers the screen
    for (const id of new Set([...B.a, ...B.b])) if (ENEMIES[id].type === "critter") bake(ENEMIES[id].fx, ENEMIES[id].opts ?? {}, 24);
    for (const [id, o] of [["pickups/coin-spin", {}], ["pickups/xp-orb", {}], ["pickups/gem-spin", { palette: PAL.fire }], ["pickups/heart-pickup", {}]]) bake(id, o, 20);
    for (const [id, o] of B.weather(this.type)) w.addWeather(id, o);
    w.player = w.add(player);
    player.x = 40;
    player.y = 150;
    player.facing = 1;
    player.z = 70;
    player.vz = -40;
    player.perf = null;
    player.dashT = -1;
    player.st = {};
    player.locked = false;
    const lvl = this.lvl = 1 + run.biome * 1.6 + run.room * 0.35;
    if (["combat", "elite"].includes(this.type)) {
      for (const [kind, o] of B.props()) {
        const x = rnd(110, 280), y = rnd(FLOOR_TOP + 10, FLOOR_BOT - 6);
        if (kind === "barrel") w.add(new Barrel(x, y, o));
        else w.add(new Hazard(x, y, o));
      }
      this.planWaves(lvl);
    }
    this.setupSpecial(w, player);
    for (const b of run.boons) b.room?.(run, player);
    for (const f of run.hooks.onRoomStart) f(run, player);
    sfx("door", 0.6);
    if (B.id === "foundry" && this.type !== "boss") w.after(0.8, () => w.spawnFx("scifi/scanner", player.x, player.y, { actor: player.snapshot() }, { follow: player, prio: 1, life: 2.4 }));
    G.audio.music(this.type === "boss" ? (run.biome === 4 ? "final" : "boss") : B.music);
    if (run.room === 0 && this.type !== "boss") G.hud.title(B.name, B.sub, 3);
    return w;
  }
  planWaves(lvl) {
    const B = this.biome, run = this.run;
    let budget = 4 + run.biome * 2.2 + run.room * 1.2;
    const nWaves = this.type === "elite" ? 2 : run.room === 0 && run.biome === 0 ? 2 : 2 + (chance(0.4) ? 1 : 0);
    for (let k = 0; k < nWaves; k++) {
      const wave = [];
      let b = budget * (k === 0 ? 0.8 : 1);
      if (this.type === "elite" && k === nWaves - 1) {
        wave.push({ id: pick(B.elite), elite: false });
        b -= 6;
      }
      const pool = run.room < 2 && run.biome === 0 ? B.a : [...B.a, ...B.b];
      let guard = 0;
      while (b > 0.5 && guard++ < 40) {
        const id = pick(pool), c = COST(id);
        if (c > b + 0.5) continue;
        wave.push({ id, elite: run.biome + run.room > 2 && chance(0.05 + run.biome * 0.03) });
        b -= c;
      }
      this.waves.push(wave);
    }
  }
  spawnWave() {
    const wave = this.waves.shift(), w = G.world, p = w.player;
    wave.forEach((o, i) => {
      let x, y, tries = 0;
      do {
        x = rnd(40, 290);
        y = rnd(FLOOR_TOP + 6, FLOOR_BOT - 4);
      } while (Math.hypot(x - p.x, (y - p.y) * 2) < 80 && tries++ < 20);
      const e = makeEnemy(o.id, x, y, this.lvl, o.elite);
      w.after(i * 0.18, () => summon(e, this.biome.spawn));
    });
    this.fighting = true;
  }
  update(dt) {
    this.t += dt;
    const w = G.world, p = w.player;
    // a fight: send in the next wave when this one thins out
    if (this.waves.length || this.fighting) {
      const alive = w.enemies().length;
      if (this.t > 0.9 && this.waves.length && (alive === 0 || (alive <= 1 && this.t - (this.lastWave ?? 0) > 3))) {
        this.spawnWave();
        this.lastWave = this.t;
      }
      if (!this.waves.length && alive === 0 && this.fighting && this.t > 1.5 && !w.ents.some((e) => e.spawnT > 0)) this.clear();
    }
    // the nearest thing you can use
    let best = null, bd = 22;
    for (const it of this.interactables) {
      if (it.used || it.gone) continue;
      const d = Math.hypot(it.x - p.x, (it.y - p.y) * 1.6);
      if (d < bd) (bd = d), (best = it);
    }
    p.interactable = best;
    G.hud.prompt = best ? `[E] ${best.prompt}` : null;
    this.boss?.updateRoom?.(dt);
  }
  /** The room falls quiet: a ribbon, the reward, then the way on. */
  clear() {
    if (this.cleared) return;
    this.cleared = true;
    this.fighting = false;
    const w = G.world, run = this.run, p = w.player;
    run.stat("rooms");
    for (const f of run.hooks.onRoomClear) f(run, p);
    w.slowmo(0.35, 0.5);
    sfx("clear");
    G.hud.ribbon(this.type === "boss" ? "WARDEN FALLEN" : "ROOM CLEARED");
    w.after(1.0, () => this.giveReward());
  }
  giveReward() {
    const w = G.world, run = this.run, s = this.spec, x = 160, y = 146;
    const kind = this.type === "elite" ? "boon+" : this.type === "combat" ? s.reward.kind : null;
    if (!kind) return this.openDoors();
    w.spawnFx("pickups/loot-beam", x, y, kind === "boon+" ? { palette: PAL.gold } : {}, { life: 2.2, prio: 1 });
    sfx("chest");
    const done = () => this.openDoors();
    if (kind === "boon" || kind === "boon+") {
      const elem = kind === "boon" ? s.reward.elem : null;
      w.add(new Pickup({ x, y, z: 30, vz: 60, fxId: "pickups/power-star", fxOpts: { palette: ELEM_PAL[elem ?? "holy"] }, magnet: 0, delay: 0.6, onTake: () => { sfx("powerup"); G.scene.openBoons(elem, kind === "boon+" ? 1 : 0, done); } }));
      if (kind === "boon+") for (let i = 0; i < 4; i++) w.add(new Pickup({ x, y, z: 20, vx: rnd(-80, 80), vy: rnd(-30, 30), vz: rnd(80, 130), ...ember() }));
    } else if (kind === "coins") {
      w.spawnFx("spawn/coin-drop", x, y, { coins: 10 }, { prio: 1 });
      for (let i = 0; i < 18 + run.biome * 4; i++) w.add(new Pickup({ x, y, z: 20, vx: rnd(-90, 90), vy: rnd(-35, 35), vz: rnd(90, 160), ...coin(2) }));
      done();
    } else if (kind === "heart") {
      w.add(new Pickup({ x, y, z: 30, vz: 60, fxId: "pickups/heart-pickup", fxOpts: REWARD_ICON.heart().opts, magnet: 0, delay: 0.6, onTake: (p) => { run.maxHp += 2; p.heal(2); G.world.spawnFx("ui/level-up", p.x, p.y, { text: "+1 HEART", actor: p.snapshot() }, { follow: p, prio: 2 }); sfx("powerup"); done(); } }));
    } else if (kind === "embers") {
      for (let i = 0; i < 5 + run.biome; i++) w.add(new Pickup({ x, y, z: 20, vx: rnd(-70, 70), vy: rnd(-30, 30), vz: rnd(90, 150), ...ember() }));
      done();
    } else if (kind === "ult") {
      w.add(new Pickup({ x, y, z: 30, vz: 60, fxId: "pickups/xp-orb", magnet: 0, delay: 0.6, onTake: (p) => { run.ult = 100; run.stats.ultGain *= 1.1; G.world.spawnFx("arcane/mana-burst", p.x, p.y, {}, { prio: 2 }); sfx("powerup"); done(); } }));
    }
  }
  openDoors() {
    if (this.doorsOpen) return;
    this.doorsOpen = true;
    const w = G.world, run = this.run;
    if (this.type === "boss") {
      // onward and upward
      const last = run.biome >= BIOMES.length - 1;
      if (last) return G.scene.victory();
      const d = new Door(270, FLOOR_TOP + 14, { type: "ascend", label: "ASCEND", palette: PAL.fire }, { fx: "pickups/power-star", opts: { palette: PAL.fire } });
      w.add(d);
      return;
    }
    const choices = nextChoices(run), n = choices.length, xs = n === 1 ? [160] : n === 2 ? [110, 210] : [80, 160, 240];
    choices.forEach((c, i) => w.add(new Door(xs[i], FLOOR_TOP + 14, { ...c, palette: c.palette ?? this.biome.door }, c.icon)));
    sfx("portal");
  }
  leave(spec, door) {
    this.leaving = true;
    const p = G.world.player;
    p.locked = true;
    G.world.spawnFx(this.biome.id === "foundry" ? "scifi/warp-out" : "arcane/blink-out", p.x, p.y, { actor: p.snapshot() }, { prio: 2, flip: p.facing < 0 });
    p.hidden = true;
    sfx("portal");
    G.world.after(0.5, () => G.scene.nextRoom(spec));
  }
  onEnemyDeath() {}

  // ---- the rooms that aren't fights
  setupSpecial(w, p) {
    const run = this.run, t = this.type;
    if (t === "combat" || t === "elite") return;
    if (t === "boss") {
      const boss = (this.boss = makeBoss(this.biome.boss, 240, 148, run));
      G.hud.boss = boss;
      p.locked = true;
      w.after(0.6, () => {
        boss.intro();
        G.hud.title(boss.title, boss.sub, 2.4);
      });
      w.after(2.2, () => G.hud.fx.spawn("ui/countdown", 160, 80, { word: "FIGHT!", from: 3 }, { layer: "hud", prio: 2, speed: 1.6 }));
      w.after(4.0, () => {
        p.locked = false;
        boss.awake = true;
        this.fighting = true;
      });
      return;
    }
    const later = () => w.after(0.6, () => this.openDoors());
    if (t === "treasure") {
      const chest = new Interactable(160, 146, { fx: null, prompt: "OPEN THE CHEST", shadow: 0 });
      chest.chestB = null;
      chest.interact = () => {
        chest.used = true;
        w.spawnFx("pickups/chest-open", 160, 146, { coins: 14 }, { prio: 2 });
        sfx("chest");
        w.after(0.9, () => {
          for (let i = 0; i < 20 + run.biome * 5; i++) w.add(new Pickup({ x: 160, y: 146, z: 16, vx: rnd(-100, 100), vy: rnd(-35, 35), vz: rnd(100, 170), ...coin(2) }));
          for (let i = 0; i < 2 + rint(0, 2); i++) w.add(new Pickup({ x: 160, y: 146, z: 16, vx: rnd(-80, 80), vy: rnd(-30, 30), vz: rnd(100, 160), ...ember() }));
          if (chance(0.5)) G.scene.openBoons(null, 0, later);
          else later();
        });
      };
      chest.drawExtra = (f) => !chest.used && G.scene.drawStill(f, "pickups/chest-open", 160, 146);
      this.interactables.push(w.add(chest));
      this.fighting = false;
    } else if (t === "rest") {
      w.addDecor("fire/campfire", 160, 146, {}, { solid: 10 });
      const fire = new Interactable(160, 150, { prompt: "REST BY THE FIRE (HEAL HALF)" });
      fire.interact = () => {
        fire.used = true;
        const n = Math.ceil(run.maxHp / 2);
        p.heal(n);
        w.spawnFx("nature/healing-bloom", p.x, p.y, {}, { prio: 2 });
        w.spawnFx("holy/heal-aoe", 160, 150, {}, { prio: 2 });
        G.hud.toast("RESTED", "THE EMBER BURNS BRIGHTER", PAL.fire);
        later();
      };
      this.interactables.push(w.add(fire));
      const train = new Interactable(100, 156, { fx: "pickups/power-star", opts: { palette: PAL.blood }, prompt: "TEMPER INSTEAD (+12% DAMAGE)", label: "TEMPER", labelY: 6 });
      train.interact = () => {
        train.used = fire.used = true;
        run.stats.dmg *= 1.12;
        w.spawnFx("ui/level-up", p.x, p.y, { text: "TEMPERED", actor: p.snapshot() }, { follow: p, prio: 2 });
        sfx("powerup");
        later();
      };
      this.interactables.push(w.add(train));
    } else if (t === "shop") {
      w.addDecor("scifi/hologram", 160, 132, { palette: PAL.ember }, {});
      const items = [
        { name: "VIAL OF EMBERS (HEAL 2 HEARTS)", price: 25, fx: "pickups/potion", opts: {}, buy: () => p.heal(4) },
        { name: "HEART VESSEL (+1 MAX HEART)", price: 55, fx: "pickups/heart-pickup", opts: REWARD_ICON.heart().opts, buy: () => { run.maxHp += 2; p.heal(2, true); } },
        { name: "A BOON OF YOUR CHOOSING", price: 70, fx: "pickups/power-star", opts: { palette: PAL.gold }, buy: (it) => G.scene.openBoons(null, 1) },
        { name: "FOCUS SHARD (FILL ULTIMATE)", price: 30, fx: "pickups/xp-orb", opts: {}, buy: () => (run.ult = 100) },
        { name: "AEGIS CHARM (+2 SHIELDS)", price: 40, fx: "pickups/crystal-shard", opts: { palette: PAL.ice }, buy: () => (run.shield += 2) },
      ];
      shuffle(items).slice(0, 4).forEach((it, i) => {
        const x = 70 + i * 60, price = Math.round(it.price * (1 + run.biome * 0.15));
        const o = new Interactable(x, 158, { fx: it.fx, opts: it.opts, prompt: `BUY ${it.name} - ${price}G`, price, yoff: -8 });
        o.interact = () => {
          if (run.coins < price) {
            sfx("nope");
            G.hud.prompt = "NOT ENOUGH GOLD";
            return;
          }
          run.coins -= price;
          o.used = true;
          w.spawnFx("ui/coin-collect", x, 150, { count: 6, from: 0 }, { prio: 1, layer: "over" });
          w.spawnFx("pickups/collect-burst", x, 150, {}, { prio: 1 });
          sfx("coin");
          sfx("powerup", 0.6);
          it.buy(it);
        };
        this.interactables.push(w.add(o));
      });
      this.openDoors();
    } else if (t === "shrine") {
      w.spawnFx("arcane/rune-circle", 160, 150, { palette: PAL.blood }, { layer: "floor", prio: 2 });
      const sh = new Interactable(160, 150, { fx: "pickups/crystal-shard", opts: { palette: PAL.blood }, yoff: -26, prompt: "OFFER A HEART FOR A RARE BOON" });
      sh.interact = () => {
        if (run.maxHp <= 2) return sfx("nope");
        sh.used = true;
        run.maxHp -= 2;
        run.hp = Math.min(run.hp, run.maxHp);
        w.spawnFx("shadow/curse", p.x, p.y, { actor: p.snapshot() }, { follow: p, prio: 2 });
        w.spawnFx("shadow/hex-sigil", 160, 150, {}, { layer: "floor", prio: 2 });
        sfx("dark");
        w.after(1.2, () => G.scene.openBoons(null, 2, later));
      };
      this.interactables.push(w.add(sh));
      const leave = new Interactable(250, 156, { prompt: "WALK AWAY", label: "LEAVE" });
      leave.interact = () => { leave.used = sh.used = true; later(); };
      this.interactables.push(w.add(leave));
    } else if (t === "mystery") {
      const roll = pick(["egg", "fountain", "fireworks", "ambush"]);
      w.addDecor("arcane/arcane-orb", 40, FLOOR_TOP + 10, { palette: PAL.neon }, {});
      w.addDecor("arcane/arcane-orb", 280, FLOOR_TOP + 10, { palette: PAL.neon }, { flip: true });
      if (roll === "egg") {
        const egg = new Interactable(160, 150, { prompt: "TOUCH THE EGG" });
        egg.drawExtra = (f) => !egg.used && G.scene.drawStill(f, "spawn/egg-hatch", 160, 150);
        egg.interact = () => {
          egg.used = true;
          w.spawnFx("spawn/egg-hatch", 160, 150, {}, { prio: 2 });
          w.after(1.6, () => {
            if (chance(0.5)) {
              for (let i = 0; i < 12; i++) w.add(new Pickup({ x: 160, y: 150, z: 10, vx: rnd(-90, 90), vy: rnd(-30, 30), vz: rnd(80, 140), ...ember() }));
              G.hud.toast("A GIFT", "EMBERS SPILL OUT", PAL.fire);
              later();
            } else {
              G.hud.toast("A TRICK", "SOMETHING HATCHED", PAL.poison);
              this.waves = [[{ id: pick(this.biome.b) }, { id: pick(this.biome.a) }, { id: pick(this.biome.a) }]];
              this.lvl = 1 + run.biome * 1.6;
              this.fighting = true;
              this.mysteryReward = true;
              this.spec = { ...this.spec, type: "combat", reward: { kind: "embers" } };
              this.type = "combat";
            }
          });
        };
        this.interactables.push(w.add(egg));
      } else if (roll === "fountain") {
        w.addDecor("water/fountain", 160, 146, {}, { solid: 12 });
        const f = new Interactable(160, 150, { prompt: "DRINK FROM THE FOUNTAIN" });
        f.interact = () => { f.used = true; p.heal(run.maxHp); run.ult = 100; w.spawnFx("water/splash", p.x, p.y, {}, { prio: 2 }); G.hud.toast("REFRESHED", "HEARTS AND FOCUS RESTORED", PAL.water); later(); };
        this.interactables.push(w.add(f));
      } else if (roll === "fireworks") {
        G.hud.toast("A CELEBRATION", "FOR NO REASON AT ALL", PAL.candy);
        for (let i = 0; i < 3; i++) w.after(1 + i * 0.9, () => w.spawnFx("explosions/firework-burst", rnd(70, 250), 60, { palette: pick([PAL.candy, PAL.neon, PAL.gold]) }, { prio: 1, layer: "over" }));
        for (let i = 0; i < 4; i++) w.after(0.6 + i * 0.7, () => { w.spawnFx("explosions/firework-rocket", rnd(60, 260), 170, { tips: pick([PAL.candy, PAL.neon, PAL.gold]) }, { prio: 1 }); sfx("boom", 0.4, 1.8); });
        w.after(3.4, () => { w.spawnFx("ui/confetti", 160, 140, {}, { prio: 2, layer: "over" }); for (let i = 0; i < 24; i++) w.add(new Pickup({ x: rnd(80, 240), y: rnd(130, 165), z: 60, vz: 0, ...coin(2) })); later(); });
      } else {
        G.hud.toast("AMBUSH", "A CHAMPION BARS THE WAY", PAL.blood);
        w.spawnFx("projectiles/flare", 260, 160, {}, { prio: 2 });
        this.type = "elite";
        this.planWaves(1 + run.biome * 1.6 + run.room * 0.35);
        this.waves = this.waves.slice(-1);
        this.spec = { ...this.spec, type: "elite" };
      }
    }
  }
}
export { Hazard, applyStatus };
