// Boot: the screen, input, sound and save, then a fixed-step loop that runs the current scene at 60 Hz.

import { Screen } from "./engine/screen.js";
import { Input } from "./engine/input.js";
import { Audio } from "./engine/audio.js";
import { loadSave, writeSave } from "./engine/save.js";
import { markSeen, onSeen } from "./engine/pfx.js";
import { G } from "./game/ctx.js";
import { boot as bootScenes } from "./game/scenes.js";
import { setupTouch } from "./game/touch.js";

const canvas = document.getElementById("game");
G.screen = new Screen(canvas);
G.input = new Input();
G.audio = new Audio();
G.save = loadSave();
G.screen.pixelPerfect = G.save.settings.pixelPerfect;
G.screen.fit();
Object.assign(G.audio.vol, { master: G.save.settings.master, sfx: G.save.settings.sfx, music: G.save.settings.music });
markSeen(G.save.codex);
let dirty = false;
onSeen((id) => {
  G.save.codex.push(id);
  dirty = true;
});
setInterval(() => {
  if (dirty) {
    writeSave(G.save);
    dirty = false;
  }
}, 3000);
G.persist = () => writeSave(G.save);

const unlock = () => G.audio.unlock();
addEventListener("keydown", unlock);
addEventListener("pointerdown", unlock);
addEventListener("touchstart", unlock);
setupTouch(canvas);
// a click on the game confirms, for mouse players in menus
canvas.addEventListener("mousedown", () => {
  G.input.touch.confirm = true;
  setTimeout(() => (G.input.touch.confirm = false), 60);
});

const params = new URLSearchParams(location.search);
G.debug = params.has("debug");
bootScenes(params);

const STEP = 1 / 60;
let last = performance.now(), acc = 0, fpsT = 0, fpsN = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  fpsT += dt;
  fpsN++;
  if (fpsT >= 1) {
    G.fps = fpsN / fpsT;
    fpsT = 0;
    fpsN = 0;
  }
  let steps = 0;
  while (acc >= STEP && steps < 4) {
    G.input.poll(STEP);
    G.time += STEP;
    G.director.update(STEP);
    acc -= STEP;
    steps++;
  }
  if (steps === 4) acc = 0;
  G.screen.begin();
  G.director.draw();
  G.screen.present();
  G.frame++;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.getElementById("boot")?.remove();
window.G = G;
