// Keyboard, gamepad and touch, folded into named actions. pressed() is buffered for a moment so an attack tapped a
// little early still lands when the current one can be cancelled.

const KEYMAP = {
  left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"], up: ["ArrowUp", "KeyW"], down: ["ArrowDown", "KeyS"],
  attack: ["KeyJ", "KeyZ"], special: ["KeyK", "KeyX"], dash: ["KeyL", "KeyC", "Space", "ShiftLeft", "ShiftRight"],
  ult: ["KeyI", "KeyV"], interact: ["KeyE", "KeyF"], pause: ["Escape", "KeyP"],
  confirm: ["Enter", "Space", "KeyJ", "KeyZ", "KeyE"], back: ["Escape", "Backspace", "KeyX", "KeyK"],
  mleft: ["ArrowLeft", "KeyA"], mright: ["ArrowRight", "KeyD"], mup: ["ArrowUp", "KeyW"], mdown: ["ArrowDown", "KeyS"],
};
// standard gamepad layout
const PADMAP = {
  attack: [0], special: [2], dash: [1, 5, 7], ult: [3, 6], interact: [4, 0], pause: [9],
  confirm: [0], back: [1], left: [14], right: [15], up: [12], down: [13], mleft: [14], mright: [15], mup: [12], mdown: [13],
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.held = {};
    this.prev = {};
    this.stamp = {};
    this.time = 0;
    this.axis = [0, 0];
    this.pad = false;
    this.touch = {};
    this.any = false;
    this.lastDevice = "keys";
    addEventListener("keydown", (e) => {
      if (e.code === "Tab" || e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.any = true;
      this.lastDevice = "keys";
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
  }
  poll(dt) {
    this.time += dt;
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const gp = pads[0];
    let ax = 0, ay = 0;
    for (const name of Object.keys(KEYMAP)) {
      let on = KEYMAP[name].some((k) => this.keys.has(k)) || !!this.touch[name];
      if (gp && PADMAP[name]?.some((b) => gp.buttons[b]?.pressed)) {
        on = true;
        this.lastDevice = "pad";
      }
      this.prev[name] = this.held[name];
      this.held[name] = on;
      if (on && !this.prev[name]) {
        this.stamp[name] = this.time;
        this.any = true;
      }
    }
    if (gp) {
      const [sx, sy] = [gp.axes[0] ?? 0, gp.axes[1] ?? 0];
      if (Math.hypot(sx, sy) > 0.25) {
        ax = sx; ay = sy;
        this.lastDevice = "pad";
      }
      // the stick also steers menus
      for (const [name, v] of [["mleft", sx < -0.6], ["mright", sx > 0.6], ["mup", sy < -0.6], ["mdown", sy > 0.6]]) {
        if (v && !this.held[name]) {
          this.held[name] = true;
          if (!this.prev[name]) this.stamp[name] = this.time;
        }
      }
    }
    if (this.touch.ax !== undefined && (this.touch.ax || this.touch.ay)) {
      ax = this.touch.ax;
      ay = this.touch.ay;
    }
    if (!ax && !ay) {
      ax = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
      ay = (this.held.down ? 1 : 0) - (this.held.up ? 1 : 0);
    }
    const l = Math.hypot(ax, ay);
    this.axis = l > 1 ? [ax / l, ay / l] : [ax, ay];
  }
  /** Was it pressed in the last `buffer` seconds (and not yet consumed)? */
  pressed(name, buffer = 0) {
    const s = this.stamp[name];
    return s !== undefined && this.time - s <= buffer + 1e-6;
  }
  /** Pressed this tick or within the buffer; consumes it. */
  take(name, buffer = 0.001) {
    if (this.pressed(name, buffer)) {
      this.stamp[name] = undefined;
      return true;
    }
    return false;
  }
  isDown(name) {
    return !!this.held[name];
  }
  /** Forget every pending press (scene changes). */
  flush() {
    this.stamp = {};
  }
}
