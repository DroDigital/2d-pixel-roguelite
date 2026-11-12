// What embers buy at the camp's shrine, forever: small permanent edges for every future climb.

export const UPGRADES = [
  { id: "vitality", name: "VITALITY", desc: "+1 HEART AT THE START OF EVERY CLIMB.", max: 3, cost: (n) => 20 + n * 25, icon: "pickups/heart-pickup" },
  { id: "might", name: "MIGHT", desc: "+6% DAMAGE.", max: 5, cost: (n) => 15 + n * 15, icon: "pickups/power-star", opts: { palette: ["#2a0510", "#5c0a1c", "#a3142a", "#e0302c", "#ff7a2a", "#ffc23d", "#fff09a", "#ffffff"] } },
  { id: "precision", name: "PRECISION", desc: "+3% CRITICAL HIT CHANCE.", max: 4, cost: (n) => 15 + n * 15, icon: "pickups/crystal-shard", opts: { palette: ["#1a0508", "#4a0b12", "#8c1420", "#d42a2e", "#ff5a4a", "#ff9a86", "#ffd8cc", "#ffffff"] } },
  { id: "focus", name: "FOCUS", desc: "THE ULTIMATE FILLS 15% FASTER AND STARTS A QUARTER FULL.", max: 3, cost: (n) => 20 + n * 20, icon: "pickups/xp-orb" },
  { id: "purse", name: "PURSE", desc: "START EACH CLIMB WITH 20 MORE COINS.", max: 3, cost: (n) => 10 + n * 10, icon: "pickups/coin-spin" },
  { id: "greed", name: "GREED", desc: "+15% COINS FROM FOES.", max: 3, cost: (n) => 15 + n * 15, icon: "pickups/coin-spin" },
  { id: "magnet", name: "LODESTONE", desc: "PICKUPS ARE PULLED TO YOU FROM 25% FARTHER.", max: 2, cost: (n) => 10 + n * 15, icon: "pickups/gem-spin" },
  { id: "luck", name: "FORTUNE", desc: "RARER BOONS ARE OFFERED MORE OFTEN.", max: 3, cost: (n) => 30 + n * 30, icon: "pickups/power-star" },
  { id: "reroll", name: "SECOND THOUGHTS", desc: "REROLL A BOON OFFER ONCE MORE PER CLIMB.", max: 2, cost: (n) => 25 + n * 25, icon: "pickups/key-glint" },
  { id: "phoenix", name: "PHOENIX EMBER", desc: "AN EXTRA LIFE EACH CLIMB.", max: 1, cost: () => 120, icon: "pickups/potion", opts: { palette: ["#1f0b10", "#4a1118", "#8c1d1c", "#cc3a1a", "#f2701f", "#ffae35", "#ffe27a", "#fff8d6"] } },
];
