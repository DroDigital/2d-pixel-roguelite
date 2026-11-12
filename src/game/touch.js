// On phones and tablets: a thumbstick on the left half of the screen, four buttons on the right.

import { G } from "./ctx.js";

export function setupTouch(canvas) {
  if (!("ontouchstart" in window) && !navigator.maxTouchPoints) return;
  const ui = document.createElement("div");
  ui.id = "touch";
  ui.innerHTML = `
    <div class="stick"><div class="knob"></div></div>
    <div class="btns">
      <button data-a="ult">ULT</button><button data-a="special">SKL</button>
      <button data-a="dash">DASH</button><button data-a="attack">ATK</button>
      <button data-a="interact" class="small">USE</button><button data-a="pause" class="small">II</button>
    </div>`;
  document.body.appendChild(ui);
  const stick = ui.querySelector(".stick"), knob = ui.querySelector(".knob");
  let sid = null, cx = 0, cy = 0;
  const T = G.input.touch;
  stick.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    sid = t.identifier;
    const r = stick.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    e.preventDefault();
  }, { passive: false });
  const move = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== sid) continue;
      let dx = (t.clientX - cx) / 40, dy = (t.clientY - cy) / 40;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      T.ax = dx; T.ay = dy;
      T.mleft = dx < -0.6; T.mright = dx > 0.6; T.mup = dy < -0.6; T.mdown = dy > 0.6;
      knob.style.transform = `translate(${dx * 28}px, ${dy * 28}px)`;
      e.preventDefault();
    }
  };
  const end = (e) => {
    for (const t of e.changedTouches) if (t.identifier === sid) {
      sid = null;
      T.ax = T.ay = 0;
      T.mleft = T.mright = T.mup = T.mdown = false;
      knob.style.transform = "";
    }
  };
  stick.addEventListener("touchmove", move, { passive: false });
  stick.addEventListener("touchend", end);
  stick.addEventListener("touchcancel", end);
  for (const b of ui.querySelectorAll("button")) {
    const a = b.dataset.a;
    b.addEventListener("touchstart", (e) => { T[a] = true; if (a === "attack" || a === "interact") T.confirm = true; if (a === "pause") T.back = true; e.preventDefault(); }, { passive: false });
    b.addEventListener("touchend", () => { T[a] = false; T.confirm = false; T.back = false; });
  }
  canvas.addEventListener("touchstart", () => { T.confirm = true; setTimeout(() => (T.confirm = false), 80); });
}
