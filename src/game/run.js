// One climb of the spire: your vessel, hearts, coins, embers, the ultimate meter, boons and the hooks they hang on
// the fight, and where you are.

import { PAL } from "../engine/pfx.js";
import { CLASSES } from "./classes.js";
import { G, sfx, rnd, rint, chance } from "./ctx.js";
import { Pickup } from "./entity.js";
import { BOONS } from "./boons.js";
import { UPGRADES } from "./meta.js";
import { t } from "./i18n.js";

/** The share of coins and embers a solo second chance burns. */
export const SECOND_CHANCE_COST = 0.3;
/** In co-op, raising a teammate who bled out costs this share of the purse (at least RAISE_MIN coins). */
export const RAISE_COST = 0.15, RAISE_MIN = 20;

const HOOKS = ["onHit", "onKill", "onDash", "onDashEnd", "onHurt", "onRoomStart", "onRoomClear", "onAttack", "onSpecial", "onUlt", "onParry", "onBlock", "tick", "preHit", "onPickup"];

export class Run {
  /** party: a class id (one player) or [{ cls, device }] for local co-op, host first. */
  constructor(party) {
    const S = G.save, up = (k) => S.upgrades[k] ?? 0;
    this.partySpec = typeof party === "string" ? [{ cls: party, device: null }] : party;
    this.size = this.partySpec.length;
    this.clsId = this.partySpec[0].cls;
    this.cls = CLASSES[this.clsId];
    this.up = up;
    this.players = [];
    this.lives = up("phoenix");
    this.coins = 20 * up("purse");
    this.embers = 0;
    // a party shares its purse; every player has a build of their own (see Build)
    this.coinK = 1 + 0.35 * (this.size - 1);
    this.biome = 0;
    this.room = 0;
    this.kills = 0;
    this.time = 0;
    this.combo = 0;
    this.comboT = 0;
    this.bestCombo = 0;
    this.damageTaken = 0;
    this.stats_ = { parries: 0, rooms: 0, bosses: 0, crits: 0 };
    this.hits = 0;
    this.secondChance = true; // solo: once per realm, a lethal blow costs part of the haul instead of the climb
    this.over = false;
  }
  /** Make the party's vessels (once per climb; they walk from room to room). */
  makePlayers(Player) {
    this.players = this.partySpec.map((s, i) => {
      const p = new Player(CLASSES[s.cls], 40, 150 + i * 6, i, this.size > 1 ? s.device : null);
      p.build = new Build(this, p);
      p.maxHp = p.hp = CLASSES[s.cls].hp + this.up("vitality") * 2;
      p.ult = this.up("focus") ? 25 : 0;
      return p;
    });
    return this.players;
  }
  /** The party members still standing. */
  alive() {
    return this.players.filter((p) => !p.down && !p.dead);
  }
  /** Something for every living player (hearts, focus, shields). */
  each(fn) {
    for (const p of this.alive()) fn(p);
  }
  stat(k) {
    this.stats_[k] = (this.stats_[k] ?? 0) + 1;
  }
  /** Every player's build (host first). */
  get builds() {
    return this.players.map((p) => buildOf(p));
  }
  /** Every boon anyone in the party holds. */
  get boons() {
    return this.builds.flatMap((b) => b.boons);
  }
  /** Does everyone hold this boon already? (Nobody can be offered it again then.) */
  has(id) {
    const B = this.builds;
    return B.length > 0 && B.every((b) => b.has(id));
  }
  /** Run a hook on every build. */
  fire(name, ...args) {
    for (const b of this.builds) for (const f of b.hooks[name]) f(...args);
  }
  /** The best of a stat across the party (luck, coins: things that land in the shared purse). */
  best(k) {
    return Math.max(...this.builds.map((b) => b.stats[k]));
  }
  update(dt) {
    this.time += dt;
    if (this.comboT > 0 && (this.comboT -= dt) <= 0) this.combo = 0;
    for (const b of this.builds) for (const f of b.hooks.tick) f(b, dt);
  }
  onPlayerHit(t, dmg, info) {
    if (info.dot) return;
    const p = who(info), b = p && buildOf(p);
    if (p) p.ult = Math.min(100, p.ult + Math.min(6, dmg * 0.22) * b.stats.ultGain * (p.cls.ultGain ?? 1));
    this.hits++;
    if (info.crit) this.stat("crits");
    this.combo++;
    this.comboT = 2.2;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    if ([10, 20, 30, 50, 75, 100, 150, 200].includes(this.combo)) G.hud?.comboPop(this.combo);
    if (b) for (const f of b.hooks.onHit) f(t, dmg, info, b);
  }
  onKill(e, info) {
    if (e.isProp) return;
    this.kills++;
    G.save.stats.kills++;
    const p = who(info), b = p && buildOf(p);
    if (p) p.ult = Math.min(100, p.ult + 4 * b.stats.ultGain * (p.cls.ultGain ?? 1) * (p.cls.id === "reaper" ? 2 : 1));
    if (!G.save.bestiary.includes(e.kind)) G.save.bestiary.push(e.kind);
    if (b) for (const f of b.hooks.onKill) f(e, info, b);
  }
  heartLost(p, n) {
    G.hud?.heartLost(p, n);
  }
  /**
   * Out of hearts: a spare life (shared by the party) brings you back. Alone, the run ends; in co-op you go down and
   * a friend can rekindle you, and the run ends only when nobody is left standing.
   */
  playerDown(p) {
    if (this.lives > 0) {
      this.lives--;
      p.hp = Math.ceil(p.maxHp / 2);
      p.iframe = 3;
      G.world.spawnFx(this.lives % 2 ? "spawn/respawn-beam" : "holy/resurrection", p.x, p.y, { actor: p.snapshot() }, { follow: p, prio: 2 });
      G.world.slowmo(0.3, 1);
      sfx("holy", 1.2, 0.8);
      G.hud?.toast("REKINDLED", "AN EMBER BURNS ON", PAL.fire);
      return;
    }
    if (this.size === 1 && this.secondChance) return this.useSecondChance(p);
    if (this.size > 1) {
      p.hp = 0;
      p.goDown();
      if (this.alive().length) return;
    }
    for (const q of this.players) {
      q.dead = true;
      q.perf = null;
    }
    this.over = true;
    G.scene?.onPlayerDeath?.();
  }
  /** Solo, once per realm: rise from a lethal blow at half your hearts, paying with a share of the coins and embers. */
  useSecondChance(p) {
    this.secondChance = false;
    const coins = Math.ceil(this.coins * SECOND_CHANCE_COST), embers = Math.ceil(this.embers * SECOND_CHANCE_COST);
    this.coins -= coins;
    this.embers -= embers;
    p.hp = Math.ceil(p.maxHp / 2);
    p.iframe = 2.5;
    p.perf = null;
    p.stun = 0;
    const w = G.world;
    // a burst of embers throws back everything close
    for (const e of w.enemies()) {
      const dx = e.x - p.x, d = Math.hypot(dx, (e.y - p.y) * 1.6);
      if (d > 70 || e.heavy) continue;
      e.kbx = Math.sign(dx || 1) * (260 - d * 2);
      e.stun = Math.max(e.stun ?? 0, 0.8);
    }
    w.spawnFx("holy/resurrection", p.x, p.y, { actor: p.snapshot(), palette: PAL.fire }, { follow: p, prio: 2 });
    w.spawnFx("impacts/ground-slam", p.x, p.y, { palette: PAL.fire }, { prio: 2 });
    w.slowmo(0.25, 1.2);
    w.shake?.(4, 0.4);
    sfx("holy", 1.2, 0.7);
    G.hud?.title(t("SECOND CHANCE"), coins || embers ? t("THE FLAME TAKES {0}G AND {1} EMBERS", coins, embers) : t("ONCE PER REALM"), 3);
    G.hud?.bump("coins");
    G.hud?.bump("embers");
  }
  /** A new realm: the solo second chance comes back. */
  newRealm() {
    this.secondChance = true;
  }
  /** What a fallen enemy leaves behind. */
  dropLoot(e) {
    const w = G.world, d = e.def, [a, b] = d.coins ?? [0, 1];
    let coins = Math.round(rint(a, b) * this.best("coinMul") * this.coinK);
    const toss = (o) => w.add(new Pickup({ x: e.x, y: e.y, z: Math.max(4, e.z), vx: rnd(-60, 60), vy: rnd(-25, 25), vz: rnd(80, 140), ...o }));
    for (let i = 0; i < coins; i++) toss(coin());
    if (chance(0.5)) toss(xpOrb());
    if (chance((0.035 + this.best("luck") * 0.01) * (1 + 0.3 * (this.size - 1))) && this.players.some((p) => p.hp < p.maxHp)) toss(heart());
    if (d.elite || e.isElite) {
      w.spawnFx("spawn/coin-drop", e.x, e.y, { coins: 8 }, { prio: 1 });
      for (let i = 0; i < 2 + rint(0, 2); i++) toss(ember());
    }
  }
}

export function coin(v = 1) {
  return { fxId: "pickups/coin-spin", lightK: 0.6, yoff: 6, onTake: () => { G.run.coins += v; sfx("coin", 0.7); G.hud?.bump("coins"); G.run.fire("onPickup", "coin"); } };
}
export function xpOrb() {
  return { fxId: "pickups/xp-orb", lightK: 0.8, yoff: 6, magnet: 70, onTake: (p) => { p.ult = Math.min(100, p.ult + 3 * buildOf(p).stats.ultGain); sfx("gem", 0.4, 1.5); } };
}
export function heart() {
  return {
    fxId: "pickups/heart-pickup", yoff: 6, magnet: 30, delay: 0.8, canTake: (p) => p.hp < p.maxHp,
    onTake: (p) => { p.heal(2 + (buildOf(p).has("bloom") ? 1 : 0)); G.world.spawnFx("pickups/collect-burst", p.x, p.y - 20, { palette: PAL.blood }, { prio: 1 }); },
  };
}
export function ember(n = 1) {
  return {
    fxId: "pickups/gem-spin", fxOpts: { palette: PAL.fire }, yoff: 6, magnet: 60,
    onTake: (p) => { G.run.embers += n; sfx("gem", 0.8); G.world.spawnFx("pickups/collect-burst", p.x, p.y - 20, { palette: PAL.fire }, { prio: 1 }); G.hud?.bump("embers"); },
  };
}

/** The player behind a hit (directly, or through a projectile they fired); the host if it can't tell. */
export function who(info = {}) {
  const s = info.src;
  if (s?.isPlayer) return s;
  if (s?.owner?.isPlayer) return s.owner;
  return G.run?.players?.[0] ?? G.world?.player ?? null;
}

/**
 * One player's build: their boons, the stats those boons shape and the hooks they hang on the fight. Solo, it is the
 * whole run's; in co-op, every player picks their own boons and only they feel them. A boon's apply(r) gets the
 * build, which answers like the run did (stats, hooks, has, alive, each, players, lives, coins, combo).
 */
export class Build {
  constructor(run, owner) {
    const up = run.up;
    this.run = run;
    this.owner = owner;
    this.stats = {
      dmg: 1 + up("might") * 0.06, crit: 0.05 + up("precision") * 0.03, critMul: 2, speed: 1, atkSpeed: 1, cdr: 1, dashCd: 1, dashLen: 1,
      kb: 1, magnet: 1 + up("magnet") * 0.25, dmgTaken: 1, ultGain: 1 + up("focus") * 0.15, coinMul: 1 + up("greed") * 0.15, luck: up("luck"),
    };
    this.boons = [];
    this.hooks = Object.fromEntries(HOOKS.map((h) => [h, []]));
    this.rerolls = up("reroll");
    // the wardens' relics: up to three worn, every one found kept in the satchel for the climb
    this.relics = [];
    this.satchel = [];
  }
  get clsId() {
    return this.owner.cls.id;
  }
  get size() {
    return this.run.size;
  }
  get players() {
    return [this.owner];
  }
  alive() {
    const p = this.owner;
    return p && !p.down && !p.dead ? [p] : [];
  }
  each(fn) {
    for (const p of this.alive()) fn(p);
  }
  // the party's shared things pass through to the run
  get lives() { return this.run.lives; }
  set lives(v) { this.run.lives = v; }
  get coins() { return this.run.coins; }
  set coins(v) { this.run.coins = v; }
  get combo() { return this.run.combo; }
  hook(name, fn) {
    this.hooks[name].push(fn);
  }
  has(id) {
    return this.boons.some((b) => b.id === id);
  }
  addBoon(b) {
    this.boons.push(b);
    b.apply?.(this);
    for (const p of this.alive()) b.room?.(this, p);
  }
  /** Boons on offer to this player: not owned, weighted by rarity, the luckier the rarer. */
  offer(n = 3, minRarity = 0) {
    const L = this.stats.luck, W = { common: 10, rare: 5 + L, epic: 1.6 + L * 0.6, legendary: 0.5 + L * 0.3 };
    const R = ["common", "rare", "epic", "legendary"];
    const pool = BOONS.filter((b) => !this.has(b.id) && (b.need ? b.need(this) : true) && R.indexOf(b.rarity) >= minRarity);
    const out = [];
    while (out.length < n && pool.length) {
      const tot = pool.reduce((s, b) => s + W[b.rarity], 0);
      let r = Math.random() * tot, i = 0;
      for (; i < pool.length; i++) if ((r -= W[pool[i].rarity]) <= 0) break;
      out.push(pool.splice(Math.min(i, pool.length - 1), 1)[0]);
    }
    return out;
  }
}

/** A player's build (made on first use, for vessels made outside makePlayers, like the camp's). */
export function buildOf(p) {
  if (!p.build || p.build.run !== G.run) p.build = new Build(G.run, p);
  return p.build;
}
