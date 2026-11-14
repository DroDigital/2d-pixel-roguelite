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
      for (let pi = 0; pi < pads.length; pi++) {
        const g = pads[pi];
        if (PADMAP[name]?.some((b) => g.buttons[b]?.pressed)) {
          on = true;
          this.lastDevice = "pad";
          this.lastPad = g.index;
        }
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
    for (const c of this.controllers ?? []) c.poll(dt);
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
    for (const c of this.controllers ?? []) c.flush();
  }
  /** The controller for one device: "kbA", "kbB" or "pad0".."pad3" (made on first use, polled with this input). */
  device(id) {
    this.controllers ??= [];
    let c = this.controllers.find((k) => k.id === id);
    if (!c) this.controllers.push((c = new Controller(this, id)));
    return c;
  }
  /** Every device a player could pick up right now. */
  devices() {
    const out = ["kbA", "kbB"];
    for (const g of navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []) out.push("pad" + g.index);
    return out;
  }
}

// ---- one device per player, for local co-op
const KB = {
  kbA: {
    left: ["KeyA"], right: ["KeyD"], up: ["KeyW"], down: ["KeyS"], attack: ["KeyJ", "KeyZ"], special: ["KeyK", "KeyX"],
    dash: ["KeyL", "KeyC", "Space", "ShiftLeft"], ult: ["KeyI", "KeyV"], interact: ["KeyE", "KeyF"], pause: ["Escape"],
  },
  kbB: {
    left: ["ArrowLeft"], right: ["ArrowRight"], up: ["ArrowUp"], down: ["ArrowDown"], attack: ["Numpad1", "Period"], special: ["Numpad2", "Slash"],
    dash: ["Numpad3", "ShiftRight"], ult: ["Numpad4", "Quote"], interact: ["Numpad0", "Semicolon"], pause: [],
  },
};
const MENU = ["mleft", "mright", "mup", "mdown"];
const ACTIONS = ["left", "right", "up", "down", "attack", "special", "dash", "ult", "interact", "pause", "mleft", "mright", "mup", "mdown"];
export const DEVICE_LABEL = { kbA: "KEYS WASD+JKL", kbB: "KEYS ARROWS+NUM", pad0: "PAD 1", pad1: "PAD 2", pad2: "PAD 3", pad3: "PAD 4" };

/** One player's device, with the same reading API as Input (pressed, take, isDown, axis). */
export class Controller {
  constructor(input, id) {
    Object.assign(this, { input, id, held: {}, prev: {}, stamp: {}, axis: [0, 0], time: 0 });
    this.padIndex = id.startsWith("pad") ? +id.slice(3) : -1;
  }
  poll(dt) {
    this.time = this.input.time;
    const keys = this.input.keys, map = KB[this.id];
    const gp = this.padIndex >= 0 && navigator.getGamepads ? navigator.getGamepads()[this.padIndex] : null;
    let ax = 0, ay = 0;
    if (gp && Math.hypot(gp.axes[0] ?? 0, gp.axes[1] ?? 0) > 0.25) [ax, ay] = [gp.axes[0], gp.axes[1]];
    for (const name of ACTIONS) {
      const base = MENU.includes(name) ? name.slice(1) : name;
      let on = false;
      if (map) on = (map[base] ?? []).some((k) => keys.has(k));
      if (gp) on = on || !!PADMAP[name]?.some((b) => gp.buttons[b]?.pressed) || (name === "mleft" && ax < -0.6) || (name === "mright" && ax > 0.6) || (name === "mup" && ay < -0.6) || (name === "mdown" && ay > 0.6);
      this.prev[name] = this.held[name];
      this.held[name] = on;
      if (on && !this.prev[name]) this.stamp[name] = this.time;
    }
    if (!ax && !ay) {
      ax = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
      ay = (this.held.down ? 1 : 0) - (this.held.up ? 1 : 0);
    }
    const l = Math.hypot(ax, ay);
    this.axis = l > 1 ? [ax / l, ay / l] : [ax, ay];
  }
  pressed(name, buffer = 0) {
    const s = this.stamp[name];
    return s !== undefined && this.time - s <= buffer + 1e-6;
  }
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
  flush() {
    this.stamp = {};
  }
}
