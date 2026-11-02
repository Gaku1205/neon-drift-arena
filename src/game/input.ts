import { applyDeadzone } from "../lib/math";

/** 1フレームぶんの入力（キーボード・マウス・ゲームパッドをまとめた物） */
export interface Frame {
  moveX: number;
  moveY: number;
  /** 狙う向き（無ければ null）。マウスのときは画面の座標 mouse を使う */
  aimX: number;
  aimY: number;
  aiming: boolean;
  /** マウスで狙っている（画面の座標で向きを決める） */
  mouseAim: boolean;
  mouseX: number;
  mouseY: number;
  dash: boolean;
  overdrive: boolean;
  pause: boolean;
  confirm: boolean;
  back: boolean;
  restart: boolean;
  up: boolean;
  down: boolean;
  /** 何か押された（オートパイロットを止める・音を起こす） */
  anyInput: boolean;
  /** 最後に使った物（操作の案内の出し分け） */
  device: "keyboard" | "pad";
}

const DEADZONE = 0.22;

/** code が空のキー入力（一部の自動操作など）では、key から code を作る */
export function codeOf(e: KeyboardEvent): string {
  if (e.code) return e.code;
  const k = e.key;
  if (k === " ") return "Space";
  if (/^[a-z]$/i.test(k)) return "Key" + k.toUpperCase();
  return k;
}

export class Input {
  private held = new Set<string>();
  private pressed = new Set<string>();
  private mouseDown = false;
  private mouseMovedAt = -1;
  private mx = 0;
  private my = 0;
  private prevPad: boolean[] = [];
  private device: "keyboard" | "pad" = "keyboard";
  private padAxisWasNeutral = true;
  onFirstGesture: (() => void) | null = null;

  constructor(target: HTMLElement) {
    window.addEventListener("keydown", (e) => {
      const code = codeOf(e);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Tab"].includes(code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(code);
      this.held.add(code);
      this.device = "keyboard";
      this.gesture();
    });
    window.addEventListener("keyup", (e) => this.held.delete(codeOf(e)));
    window.addEventListener("blur", () => {
      this.held.clear();
      this.mouseDown = false;
    });
    target.addEventListener("mousemove", (e) => {
      this.mx = e.clientX;
      this.my = e.clientY;
      this.mouseMovedAt = performance.now();
      this.device = "keyboard";
    });
    target.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.pressed.add("Mouse0");
      }
      this.mx = e.clientX;
      this.my = e.clientY;
      this.mouseMovedAt = performance.now();
      this.device = "keyboard";
      this.gesture();
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    target.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private gesture(): void {
    if (this.onFirstGesture) {
      const f = this.onFirstGesture;
      this.onFirstGesture = null;
      f();
    }
  }

  private key(...codes: string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }
  private hit(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }

  /** 今のフレームの入力を読む（読んだら「押した瞬間」は消える） */
  read(): Frame {
    let moveX = (this.key("KeyD") ? 1 : 0) - (this.key("KeyA") ? 1 : 0);
    let moveY = (this.key("KeyS") ? 1 : 0) - (this.key("KeyW") ? 1 : 0);
    let aimX = (this.key("ArrowRight") ? 1 : 0) - (this.key("ArrowLeft") ? 1 : 0);
    let aimY = (this.key("ArrowDown") ? 1 : 0) - (this.key("ArrowUp") ? 1 : 0);
    let aiming = aimX !== 0 || aimY !== 0;
    let mouseAim = false;
    if (!aiming && this.mouseDown) {
      mouseAim = true;
      aiming = true;
    }
    let dash = this.hit("Space", "ShiftLeft", "ShiftRight");
    let overdrive = this.hit("KeyE", "KeyQ");
    let pause = this.hit("Escape", "KeyP");
    let confirm = this.hit("Enter", "Space", "NumpadEnter");
    let back = this.hit("Escape", "Backspace");
    let restart = this.hit("KeyR");
    let up = this.hit("ArrowUp", "KeyW");
    let down = this.hit("ArrowDown", "KeyS");
    let anyInput = this.pressed.size > 0;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const b = (i: number): boolean => pad.buttons[i]?.pressed ?? false;
      const was = (i: number): boolean => this.prevPad[i] ?? false;
      const tap = (i: number): boolean => b(i) && !was(i);
      const l = applyDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0, DEADZONE);
      const r = applyDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, DEADZONE);
      const dpadX = (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
      const dpadY = (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
      if (l.x !== 0 || l.y !== 0) {
        moveX = l.x;
        moveY = l.y;
      } else if (dpadX !== 0 || dpadY !== 0) {
        moveX = dpadX;
        moveY = dpadY;
      }
      if (Math.hypot(r.x, r.y) > 0.35) {
        aimX = r.x;
        aimY = r.y;
        aiming = true;
        mouseAim = false;
      }
      const usedPad = l.x !== 0 || l.y !== 0 || Math.hypot(r.x, r.y) > 0.35 || pad.buttons.some((x) => x.pressed);
      if (usedPad) {
        this.device = "pad";
        anyInput = anyInput || pad.buttons.some((x) => x.pressed);
      }
      dash = dash || tap(4) || tap(6) || tap(0);
      overdrive = overdrive || tap(5) || tap(7) || tap(3);
      pause = pause || tap(9);
      confirm = confirm || tap(0) || tap(9);
      back = back || tap(1) || tap(8);
      restart = restart || tap(2);
      const neutral = Math.abs(l.y) < 0.5;
      up = up || tap(12) || (this.padAxisWasNeutral && l.y < -0.5);
      down = down || tap(13) || (this.padAxisWasNeutral && l.y > 0.5);
      this.padAxisWasNeutral = neutral;
      if (pad.buttons.some((x) => x.pressed)) this.gesture();
      this.prevPad = pad.buttons.map((x) => x.pressed);
      break;
    }

    const len = Math.hypot(moveX, moveY);
    if (len > 1) {
      moveX /= len;
      moveY /= len;
    }
    this.pressed.clear();
    return {
      moveX,
      moveY,
      aimX,
      aimY,
      aiming,
      mouseAim,
      mouseX: this.mx,
      mouseY: this.my,
      dash,
      overdrive,
      pause,
      confirm,
      back,
      restart,
      up,
      down,
      anyInput,
      device: this.device,
    };
  }

  /** マウスが最近動いたか（照準を出すため） */
  mouseActive(now: number): boolean {
    return this.mouseMovedAt > 0 && now - this.mouseMovedAt < 2500;
  }
}
