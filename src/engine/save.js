// What outlives a run: embers, unlocks, upgrades, the Codex and settings, in localStorage.

const KEY = "emberspire.save.v1";

const DEFAULT = () => ({
  embers: 0,
  totalEmbers: 0,
  unlocked: { knight: true },
  upgrades: {},
  codex: [],
  bestiary: [],
  stats: { runs: 0, wins: 0, deaths: 0, kills: 0, bestDepth: 0, bestTime: 0 },
  settings: { master: 0.8, sfx: 0.8, music: 0.55, shake: 1, lowfx: false, pixelPerfect: true },
  lastClass: "knight",
  seenIntro: false,
});

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw), base = DEFAULT();
      return { ...base, ...d, stats: { ...base.stats, ...d.stats }, settings: { ...base.settings, ...d.settings }, unlocked: { ...base.unlocked, ...d.unlocked } };
    }
  } catch {}
  return DEFAULT();
}
export function writeSave(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
export function wipeSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  return DEFAULT();
}
