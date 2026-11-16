// The cameras. A room is wider than the screen, so a camera follows the party along it. In co-op, when the party
// spreads too far for one screen, the screen splits: players who stand together share a view, and the views merge
// again when they regroup.
//
//   one group     one view over the whole screen
//   two groups    two halves side by side
//   three groups  two quarters on top, the widest group across the bottom
//   four groups   four quarters
//
// A new layout starts each view where the old screen already showed that spot, then glides to its group, so a split
// peels the picture apart rather than cutting it.

import { painterFor, hex } from "../engine/pfx.js";
import { G, VIEW_W, VIEW_H, FLOOR_TOP, FLOOR_BOT } from "./ctx.js";

const HALF_W = VIEW_W / 2, HALF_H = VIEW_H / 2;
// how far apart (in room pixels) a group may stand to fit a view of each width: a split happens past the loose
// limit, a merge only below the strict one, so the screen never flickers between the two
const FIT = { full: [240, 276], half: [100, 124] };
// how close to a view's edge a player may come before the camera pushes along
const EDGE = 18;
const DIVIDER = hex("#07060b") >>> 0;

/** The screen rectangles of each layout, in order. */
function rects(k) {
  if (k === 1) return [{ sx: 0, sy: 0, w: VIEW_W, h: VIEW_H }];
  if (k === 2) return [{ sx: 0, sy: 0, w: HALF_W, h: VIEW_H }, { sx: HALF_W, sy: 0, w: HALF_W, h: VIEW_H }];
  if (k === 3) return [{ sx: 0, sy: 0, w: HALF_W, h: HALF_H }, { sx: HALF_W, sy: 0, w: HALF_W, h: HALF_H }, { sx: 0, sy: HALF_H, w: VIEW_W, h: HALF_H }];
  return [{ sx: 0, sy: 0, w: HALF_W, h: HALF_H }, { sx: HALF_W, sy: 0, w: HALF_W, h: HALF_H }, { sx: 0, sy: HALF_H, w: HALF_W, h: HALF_H }, { sx: HALF_W, sy: HALF_H, w: HALF_W, h: HALF_H }];
}
const span = (g) => g[g.length - 1].x - g[0].x;
const mid = (g) => (g[0].x + g[g.length - 1].x) / 2;

export class Views {
  constructor(world) {
    this.w = world;
    this.k = 1;
    this.views = rects(1).map((r) => ({ ...r, x: 0, y: 0, ox: 0, oy: 0, group: [] }));
    this.snapped = false;
    this.calm = 0; // how long a smaller layout has fit (a merge waits a moment)
  }
  get mainX() {
    return this.views[0]?.ox ?? 0;
  }
  /** Who the cameras follow: every player still in the room. */
  people() {
    return this.w.players.filter((p) => !p.gone && !p.hidden).sort((a, b) => a.x - b.x);
  }
  /** Split a row of players (sorted by x) into k groups at the k - 1 widest gaps. */
  split(ps, k) {
    if (k <= 1) return [ps];
    const gaps = ps.slice(1).map((p, i) => ({ i: i + 1, d: p.x - ps[i].x })).sort((a, b) => b.d - a.d).slice(0, k - 1).map((g) => g.i).sort((a, b) => a - b);
    const out = [];
    let from = 0;
    for (const i of gaps) out.push(ps.slice(from, i)), (from = i);
    out.push(ps.slice(from));
    return out;
  }
  /** Do these groups fit layout k (loose or strict)? Returns the groups in screen order, or null. */
  fit(ps, k, loose) {
    const j = loose ? 1 : 0, gs = this.split(ps, k);
    if (gs.some((g) => !g.length)) return null;
    if (k === 1) return span(gs[0]) <= FIT.full[j] ? gs : null;
    if (k === 2 || k === 4) return gs.every((g) => span(g) <= FIT.half[j]) ? gs : null;
    // three: the widest group takes the full-width strip along the bottom, the others the quarters above
    const wide = gs.reduce((a, g) => (span(g) > span(a) ? g : a), gs[0]), rest = gs.filter((g) => g !== wide);
    return span(wide) <= FIT.full[j] && rest.every((g) => span(g) <= FIT.half[j]) ? [...rest, wide] : null;
  }
  update(dt) {
    const ps = this.people(), RW = this.w.roomW;
    if (!ps.length) return;
    // the fewest views that hold everyone. A layout that still loosely fits stays; a smaller one has to fit snugly
    // for half a second before the views merge
    const max = Math.min(4, ps.length), smallest = (loose) => {
      for (let k = 1; k <= max; k++) {
        const g = this.fit(ps, k, loose);
        if (g) return [k, g];
      }
      return [max, this.split(ps, max)];
    };
    const cur = this.k <= max ? this.fit(ps, this.k, true) : null;
    let k = this.k, groups = cur;
    if (!cur) ([k, groups] = smallest(true)), (this.calm = 0);
    else {
      const [sk, sg] = smallest(false);
      if (sk < this.k && (this.calm += dt) > 0.5) ([k, groups] = [sk, sg]), (this.calm = 0);
      else if (sk >= this.k) this.calm = 0;
    }
    if (k !== this.k || !this.snapped) this.relayout(k, groups);
    else this.views.forEach((v, i) => (v.group = groups[i]));
    // each camera glides toward its group and pushes along when a player nears its edge
    const boss = G.room?.boss, rate = 1 - Math.exp(-dt * 7);
    for (const v of this.views) {
      const g = v.group;
      if (!g.length) continue;
      let cx = mid(g);
      if (this.k === 1 && g.length === 1) cx += (g[0].facing ?? 1) * 22; // look ahead of a lone player
      if (this.k === 1 && boss && !boss.dead && !boss.gone && Math.abs(boss.x - cx) < 360) cx += (boss.x - cx) * 0.3; // keep the warden in frame
      let tx = cx - v.w / 2;
      const lo = g[g.length - 1].x - (v.w - EDGE), hi = g[0].x - EDGE;
      tx = lo <= hi ? Math.max(lo, Math.min(hi, tx)) : (lo + hi) / 2;
      tx = Math.max(0, Math.min(RW - v.w, tx));
      v.x += (tx - v.x) * rate;
      // and never lets one slip out of sight
      if (lo <= hi) v.x = Math.max(lo, Math.min(hi, v.x));
      v.x = Math.max(0, Math.min(RW - v.w, v.x));
      // a short view shows the floor band around its group (the wall above is cropped)
      if (v.h < VIEW_H) {
        const top = Math.min(...g.map((p) => p.y)) - 44, bot = Math.max(...g.map((p) => p.y)) + 6;
        const ty = Math.max(FLOOR_TOP - 54, Math.min(FLOOR_BOT + 6 - v.h, (top + bot) / 2 - v.h / 2));
        v.y += (ty - v.y) * rate;
      } else v.y = 0;
      v.ox = Math.round(v.x);
      v.oy = Math.round(v.y);
    }
  }
  /** Change layout: every new view starts on what the old screen showed where it now sits. */
  relayout(k, groups) {
    const old = this.views, first = !this.snapped;
    const at = (sx, sy) => {
      const o = old.find((v) => sx >= v.sx && sx < v.sx + v.w && sy >= v.sy && sy < v.sy + v.h) ?? old[0];
      return [o.x + (sx - o.sx), o.y + (sy - o.sy)];
    };
    this.views = rects(k).map((r, i) => {
      const g = groups[i] ?? [];
      let x, y;
      if (first) (x = mid(g) - r.w / 2), (y = r.h < VIEW_H ? FLOOR_TOP - 40 : 0);
      else {
        const [wx, wy] = at(r.sx + r.w / 2, r.sy + r.h / 2);
        (x = wx - r.w / 2), (y = r.h < VIEW_H ? Math.max(FLOOR_TOP - 54, wy - r.h / 2) : 0);
      }
      x = Math.max(0, Math.min(this.w.roomW - r.w, x));
      return { ...r, x, y, ox: Math.round(x), oy: Math.round(y), group: g };
    });
    this.k = k;
    if (!first && k > 1 && old.length < k) G.audio && G.audio.play?.("ui", 0.3, 0.6);
    this.snapped = true;
  }
  /** Jump straight to the party (a new room). */
  snap() {
    this.snapped = false;
    this.update(0);
  }
  layoutViews() {
    if (!this.snapped) this.update(0);
    return this.views;
  }
  /**
   * Over the composed screen: dividers between views (lit in the colours of who's on each side), and at each view's
   * side an arrow for every foe beyond it that no view shows.
   */
  drawOverlay(views) {
    const hud = painterFor(G.screen.hud), foes = this.w.enemies?.() ?? [];
    const shown = (e) => views.some((v) => e.x >= v.ox - 4 && e.x <= v.ox + v.w + 4 && e.y - 20 >= v.oy && e.y - 20 <= v.oy + v.h);
    const blink = Math.floor(G.time * 4) & 1;
    for (const v of views) {
      for (const e of foes) {
        if (e.hidden || e.spawnT > 0 || shown(e)) continue;
        const dx = e.x < v.ox ? v.ox - e.x : e.x - (v.ox + v.w);
        if (dx > 260 || e.y < v.oy || e.y - 30 > v.oy + v.h) continue;
        const left = e.x < v.ox, x = left ? v.sx + 2 : v.sx + v.w - 3, y = Math.max(v.sy + 4, Math.min(v.sy + v.h - 5, v.sy + Math.round(e.y - 14 - v.oy)));
        const c = e.boss || e.isBoss ? hex("#ffd84a") >>> 0 : hex(dx < 90 ? "#ff4a4a" : "#c0283a") >>> 0;
        for (let j = -2; j <= 2; j++) for (let i = 0; i <= 2 - Math.abs(j); i++) hud.px(left ? x + i : x - i, y + j, c);
        if (blink) hud.light(x, y, c, 0.4);
      }
    }
    if (views.length < 2) return;
    for (const v of views) {
      const c = v.group[0]?.color ?? DIVIDER;
      if (v.sx > 0) {
        hud.rect(v.sx - 1, v.sy, 2, v.h, DIVIDER);
        hud.rect(v.sx + 1, v.sy, 1, v.h, c);
      }
      if (v.sx + v.w < VIEW_W) hud.rect(v.sx + v.w - 2, v.sy, 1, v.h, c);
      if (v.sy > 0) {
        hud.rect(v.sx, v.sy - 1, v.w, 2, DIVIDER);
        hud.rect(v.sx, v.sy + 1, v.w, 1, c);
      }
      if (v.sy + v.h < VIEW_H) hud.rect(v.sx, v.sy + v.h - 2, v.w, 1, c);
    }
  }
}
