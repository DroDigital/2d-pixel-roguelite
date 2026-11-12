// The one door into pixelfx. Every effect the game plays goes through fx(), which also records it in the Codex.

export * from "../../vendor/pixelfx/core/index.js";
import { effects, categories } from "../../vendor/pixelfx/fx/index.js";

export { effects, categories };
export const EFFECT_IDS = Object.keys(effects);

const seen = new Set();
let hook = null;
/** Called with an id the first time an effect is played (the Codex listens). */
export function onSeen(f) {
  hook = f;
}
export function markSeen(list) {
  for (const id of list) seen.add(id);
}
export const isSeen = (id) => seen.has(id);
export const seenCount = () => seen.size;

/** The effect module for an id, e.g. "fire/torch". */
export function fxMod(id) {
  const m = effects[id];
  if (!m) throw new Error(`unknown effect ${id}`);
  if (!seen.has(id)) {
    seen.add(id);
    hook?.(id);
  }
  return m;
}
