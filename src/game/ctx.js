// Shared game state and the arena's measurements.

export const G = {
  screen: null, input: null, audio: null, save: null,
  scene: null, run: null, world: null,
  time: 0, frame: 0, fps: 60, debug: false,
};

// the arena: a back wall above, a floor band the characters walk on
export const FLOOR_TOP = 118, FLOOR_BOT = 172, X_MIN = 14, X_MAX = 306;
export const clampX = (x) => Math.max(X_MIN, Math.min(X_MAX, x));
export const clampY = (y) => Math.max(FLOOR_TOP + 2, Math.min(FLOOR_BOT, y));

/** How many are climbing together (1 to 4). */
export const partySize = () => G.run?.size ?? 1;
/** Health multiplier for foes facing the party: +0.6 per extra player for foes, or k4 in total at four players (bosses use 3.1). */
export function partyHp(k4 = 0) {
  const n = partySize();
  return k4 ? 1 + ((k4 - 1) * (n - 1)) / 3 : 1 + 0.6 * (n - 1);
}

export function sfx(name, k = 1, p = 1) {
  G.audio?.play(name, k, p);
}

export const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const rint = (a, b) => Math.floor(rnd(a, b + 1));
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const chance = (p) => Math.random() < p;
export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function weighted(list, w = (x) => x.w ?? 1) {
  const tot = list.reduce((s, x) => s + w(x), 0);
  let r = Math.random() * tot;
  for (const x of list) if ((r -= w(x)) <= 0) return x;
  return list[list.length - 1];
}
