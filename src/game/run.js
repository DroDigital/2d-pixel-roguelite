// One climb of the spire: your vessel, hearts, coins, embers, the ultimate meter, boons and the hooks they hang on
// the fight, and where you are.

import { PAL } from "../engine/pfx.js";
import { CLASSES } from "./classes.js";
import { G, sfx, rnd, rint, chance } from "./ctx.js";
import { Pickup } from "./entity.js";
import { BOONS } from "./boons.js";
import { UPGRADES } from "./meta.js";

const HOOKS = ["onHit", "onKill", "onDash", "onDashEnd", "onHurt", "onRoomStart", "onRoomClear", "onAttack", "onSpecial", "onUlt", "onParry", "onBlock", "tick", "preHit", "onPickup"];

export class Run {
  constructor(clsId) {
    const S = G.save, up = (k) => S.upgrades[k] ?? 0;
    this.clsId = clsId;
    this.cls = CLASSES[clsId];
    this.stats = {
      dmg: 1 + up("might") * 0.06, crit: 0.05 + (this.cls.crit ?? 0) + up("precision") * 0.03, critMul: 2, speed: 1, atkSpeed: 1, cdr: 1, dashCd: 1, dashLen: 1,
      kb: 1, magnet: 1 + up("magnet") * 0.25, dmgTaken: 1, ultGain: (this.cls.ultGain ?? 1) * (1 + up("focus") * 0.15), coinMul: 1 + up("greed") * 0.15, luck: up("luck"),
    };
    this.maxHp = this.cls.hp + up("vitality") * 2;
    this.hp = this.maxHp;
    this.lives = up("phoenix");
    this.coins = 20 * up("purse");
    this.embers = 0;
    this.ult = up("focus") ? 25 : 0;
    this.shield = 0;
    this.boons = [];
    this.hooks = Object.fromEntries(HOOKS.map((h) => [h, []]));
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
    this.rerolls = up("reroll");
    this.over = false;
  }
  stat(k) {
    this.stats_[k] = (this.stats_[k] ?? 0) + 1;
  }
  hook(name, fn) {
    this.hooks[name].push(fn);
  }
  has(id) {
    return this.boons.some((b) => b.id === id);
  }
  addBoon(b) {
    this.boons.push(b);
    b.apply?.(this);
    if (G.world?.player) b.room?.(this, G.world.player);
  }
  /** Boons on offer: not owned, weighted by rarity, the luckier the rarer. */
  offer(n = 3, minRarity = 0) {
    const W = { common: 10, rare: 5 + this.stats.luck, epic: 1.6 + this.stats.luck * 0.6, legendary: 0.5 + this.stats.luck * 0.3 };
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
  update(dt) {
    this.time += dt;
    if (this.comboT > 0 && (this.comboT -= dt) <= 0) this.combo = 0;
    for (const f of this.hooks.tick) f(this, dt);
  }
  onPlayerHit(t, dmg, info) {
    if (info.dot) return;
    this.ult = Math.min(100, this.ult + Math.min(6, dmg * 0.22) * this.stats.ultGain);
    this.hits++;
    if (info.crit) this.stat("crits");
    this.combo++;
    this.comboT = 2.2;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    if ([10, 20, 30, 50, 75, 100, 150, 200].includes(this.combo)) G.hud?.comboPop(this.combo);
    for (const f of this.hooks.onHit) f(t, dmg, info, this);
  }
  onKill(e, info) {
    if (e.isProp) return;
    this.kills++;
    G.save.stats.kills++;
    this.ult = Math.min(100, this.ult + 4 * this.stats.ultGain * (this.clsId === "reaper" ? 2 : 1));
    if (!G.save.bestiary.includes(e.kind)) G.save.bestiary.push(e.kind);
    for (const f of this.hooks.onKill) f(e, info, this);
  }
  heartLost(n) {
    G.hud?.heartLost(this.hp, n);
  }
  /** Out of hearts: a spare life brings you back, otherwise the run ends. */
  playerDown() {
    const p = G.world.player;
    if (this.lives > 0) {
      this.lives--;
      this.hp = Math.ceil(this.maxHp / 2);
      p.iframe = 3;
      G.world.spawnFx(this.lives % 2 ? "spawn/respawn-beam" : "holy/resurrection", p.x, p.y, { actor: p.snapshot() }, { follow: p, prio: 2 });
      G.world.slowmo(0.3, 1);
      sfx("holy", 1.2, 0.8);
      G.hud?.toast("REKINDLED", "AN EMBER BURNS ON", PAL.fire);
      return;
    }
    p.dead = true;
    p.perf = null;
    this.over = true;
    G.scene?.onPlayerDeath?.();
  }
  /** What a fallen enemy leaves behind. */
  dropLoot(e) {
    const w = G.world, d = e.def, [a, b] = d.coins ?? [0, 1];
    let coins = Math.round(rint(a, b) * this.stats.coinMul * (e.def.elite ? 1 : 1));
    const toss = (o) => w.add(new Pickup({ x: e.x, y: e.y, z: Math.max(4, e.z), vx: rnd(-60, 60), vy: rnd(-25, 25), vz: rnd(80, 140), ...o }));
    for (let i = 0; i < coins; i++) toss(coin());
    if (chance(0.5)) toss(xpOrb());
    if (chance(0.035 + this.stats.luck * 0.01) && this.hp < this.maxHp) toss(heart());
    if (d.elite || e.isElite) {
      w.spawnFx("spawn/coin-drop", e.x, e.y, { coins: 8 }, { prio: 1 });
      for (let i = 0; i < 2 + rint(0, 2); i++) toss(ember());
    }
  }
}

export function coin(v = 1) {
  return { fxId: "pickups/coin-spin", lightK: 0.6, yoff: 6, onTake: () => { G.run.coins += v; sfx("coin", 0.7); G.hud?.bump("coins"); for (const f of G.run.hooks.onPickup) f("coin"); } };
}
export function xpOrb() {
  return { fxId: "pickups/xp-orb", lightK: 0.8, yoff: 6, magnet: 70, onTake: () => { const r = G.run; r.ult = Math.min(100, r.ult + 3 * r.stats.ultGain); sfx("gem", 0.4, 1.5); } };
}
export function heart() {
  return {
    fxId: "pickups/heart-pickup", yoff: 6, magnet: 30, delay: 0.8, canTake: () => G.run.hp < G.run.maxHp,
    onTake: (p) => { p.heal(2 + (G.run.has("bloom") ? 1 : 0)); G.world.spawnFx("pickups/collect-burst", p.x, p.y - 20, { palette: PAL.blood }, { prio: 1 }); },
  };
}
export function ember(n = 1) {
  return {
    fxId: "pickups/gem-spin", fxOpts: { palette: PAL.fire }, yoff: 6, magnet: 60,
    onTake: (p) => { G.run.embers += n; sfx("gem", 0.8); G.world.spawnFx("pickups/collect-burst", p.x, p.y - 20, { palette: PAL.fire }, { prio: 1 }); G.hud?.bump("embers"); },
  };
}
