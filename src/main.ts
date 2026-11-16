import { EMPTY_BEST, mergeBest, parseBest, type BestRecord } from "./lib/records";
import { Audio } from "./game/audio";
import { autopilot } from "./game/autopilot";
import { codeOf, Input, type Frame } from "./game/input";
import { COLOR } from "./game/palette";
import { drawBackdrop, drawHudGlow, drawHudText, drawWorld, makeView, Post, type View } from "./game/render";
import { drawKeys, drawOverGlow, drawOverText, drawPause, drawSettings, drawTitleGlow, drawTitleText, KEYS_RESET_INDEX, OVER_ITEMS, PAUSE_ITEMS, SETTINGS_ITEMS, type OverState } from "./game/ui";
import { ACTIONS, ACTION_LABELS, DEFAULT_KEYMAP, assignKey, keyLabel, parseKeymap, serializeKeymap, type KeyMap } from "./lib/keymap";
import { parseSettings, serializeSettings, stepVolume, type Settings } from "./lib/settings";
import { SILENT, World, type Control } from "./game/world";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("canvas がありません");
const ctxOrNull = canvas.getContext("2d", { alpha: false });
if (!ctxOrNull) throw new Error("2D の描画が使えません");
const ctx: CanvasRenderingContext2D = ctxOrNull;

const BEST_KEY = "neon-drift-arena.best";
const MUTE_KEY = "neon-drift-arena.muted";
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const input = new Input(canvas);
const audio = new Audio();
const post = new Post();

function loadBest(): BestRecord {
  try {
    return parseBest(localStorage.getItem(BEST_KEY));
  } catch {
    return EMPTY_BEST;
  }
}
function saveBest(b: BestRecord): void {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(b));
  } catch {
    // 保存できない環境では、記録を残さない
  }
}

let best = loadBest();
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {
  muted = false;
}

const SETTINGS_KEY = "neon-drift-arena.settings";
let settings: Settings;
try {
  settings = parseSettings(localStorage.getItem(SETTINGS_KEY));
} catch {
  settings = parseSettings(null);
}
audio.setSfxVolume(settings.sfx);
audio.setMusicVolume(settings.music);
/** 設定画面が開いているか（どこから開いたか）と、選んでいる項目 */
let settingsFrom: "title" | "pause" | null = null;
let settingsSel = 0;
let titleSel = 0;

function saveSettings(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, serializeSettings(settings));
  } catch {
    // 保存できなくても続ける
  }
}

const KEYMAP_KEY = "neon-drift-arena.keymap";
let keymap: KeyMap;
try {
  keymap = parseKeymap(localStorage.getItem(KEYMAP_KEY));
} catch {
  keymap = DEFAULT_KEYMAP;
}
input.setKeymap(keymap);
/** キーのわりあての画面が開いているか、選んでいる行、押すキーを待っているか、出しているひとこと */
let keysOpen = false;
let keysSel = 0;
let keysWaiting = false;
let keysMsg = "";

function setKeymap(map: KeyMap): void {
  keymap = map;
  input.setKeymap(map);
  try {
    localStorage.setItem(KEYMAP_KEY, serializeKeymap(map));
  } catch {
    // 保存できなくても続ける
  }
}

function openSettings(from: "title" | "pause"): void {
  settingsFrom = from;
  settingsSel = 0;
  keysOpen = false;
}

/** キーのわりあての操作 */
function updateKeys(f: Frame): void {
  if (keysWaiting) {
    if (f.pressedKey) {
      if (f.pressedKey === "Escape") {
        keysWaiting = false;
        keysMsg = "";
        return;
      }
      const action = ACTIONS[keysSel];
      if (!action) return;
      const r = assignKey(keymap, action, f.pressedKey);
      if (r.ok) {
        setKeymap(r.map);
        keysWaiting = false;
        keysMsg = r.swapped ? `${ACTION_LABELS[r.swapped]} と入れ替えました` : "";
        audio.uiConfirm();
      } else {
        keysMsg = "そのキーは使えません";
      }
    } else if (f.back) {
      keysWaiting = false;
      keysMsg = "";
    }
    return;
  }
  const n = KEYS_RESET_INDEX + 1;
  if (f.up) {
    keysSel = (keysSel + n - 1) % n;
    keysMsg = "";
    audio.uiMove();
  }
  if (f.down) {
    keysSel = (keysSel + 1) % n;
    keysMsg = "";
    audio.uiMove();
  }
  if (f.confirm) {
    audio.uiConfirm();
    if (keysSel === KEYS_RESET_INDEX) {
      setKeymap(DEFAULT_KEYMAP);
      keysMsg = "もとにもどしました";
    } else {
      keysWaiting = true;
      keysMsg = "";
    }
  } else if (f.back || f.pause) {
    keysOpen = false;
    keysMsg = "";
  }
}

/** 設定画面の操作。開いている間は他の操作を止めるので、処理したら true */
function updateSettings(f: Frame): boolean {
  if (!settingsFrom) return false;
  if (keysOpen) {
    updateKeys(f);
    return true;
  }
  if (f.up || f.down) {
    settingsSel = (settingsSel + (f.up ? SETTINGS_ITEMS.length - 1 : 1)) % SETTINGS_ITEMS.length;
    audio.uiMove();
  }
  if (f.confirm && settingsSel === 2) {
    audio.uiConfirm();
    keysOpen = true;
    keysSel = 0;
    keysWaiting = false;
    keysMsg = "";
    return true;
  }
  const d = settingsSel < 2 ? (f.right ? 1 : 0) - (f.left ? 1 : 0) : 0;
  if (d !== 0) {
    const key = settingsSel === 0 ? "sfx" : "music";
    const next = stepVolume(settings[key], d);
    if (next !== settings[key]) {
      settings = { ...settings, [key]: next };
      if (key === "sfx") audio.setSfxVolume(next);
      else audio.setMusicVolume(next);
      saveSettings();
      if (key === "sfx") audio.uiMove();
    }
  }
  if (f.back || f.pause) settingsFrom = null;
  return true;
}

type Scene = "title" | "play" | "over";
let scene: Scene = "title";
let paused = false;
let pauseSel = 0;
let over: OverState | null = null;
let world: World;
/** URL で開いた場面は、何か押すまでオートパイロットで動かす（撮るため） */
let autoUntilInput = false;
let sceneT = 0;
let clock = 0;

function calm(w: World): World {
  if (reduced) {
    w.fx.calm = true;
    w.grid.enabled = false;
  }
  return w;
}

function makeDemo(): World {
  const w = calm(new World((Math.random() * 1e9) | 0, SILENT));
  w.startWave(3);
  w.banner = null;
  w.lives = 99;
  return w;
}

function startGame(): void {
  audio.start();
  audio.setMuted(muted);
  audio.uiConfirm();
  audio.intensity = 1;
  audio.setMusicOpen(1);
  world = calm(new World((Math.random() * 1e9) | 0, audio));
  scene = "play";
  paused = false;
  autoUntilInput = false;
  sceneT = 0;
}

function toTitle(): void {
  world = makeDemo();
  scene = "title";
  paused = false;
  audio.intensity = 0;
  audio.setMusicOpen(1);
  sceneT = 0;
}

function finishRun(): void {
  const result = { score: world.score, wave: world.wave, time: world.time, kills: world.kills, maxMultiplier: world.maxMult };
  const merged = mergeBest(best, result);
  best = merged.best;
  saveBest(best);
  over = { result, best, isNew: merged.isNew, t: 0, sel: 0 };
  scene = "over";
  audio.intensity = 0;
  audio.setMusicOpen(0.45, 0.6);
}

/** 先に何秒か進めておく（URL で途中の場面を開く時） */
function warmUp(w: World, seconds: number, holdFire = 0): void {
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) {
    const c = autopilot(w, i * dt);
    // 撮るとき：最初は撃たずに群れを溜め、最後にまとめて撃ち抜く
    if (i * dt < holdFire) {
      c.aim = null;
      c.overdrive = false;
    }
    w.update(dt, c);
  }
}

// URL で場面を直接開く：?scene=play（&wave=N）／?scene=boss／?scene=over
const params = new URLSearchParams(location.search);
const startScene = params.get("scene");
if (startScene === "play" || startScene === "boss") {
  const wave = startScene === "boss" ? 5 : Math.max(1, Math.min(30, Number(params.get("wave")) || 8));
  world = calm(new World(20261102, SILENT));
  world.startWave(wave);
  world.chain = startScene === "boss" ? 60 : 44;
  world.maxMult = world.multiplier;
  world.score = startScene === "boss" ? 38420 : 96310;
  world.overdrive = 0.7;
  world.lives = 99;
  if (startScene === "boss") warmUp(world, 6.5);
  else warmUp(world, 7.4, 6.6);
  world.lives = 3;
  world.sound = audio;
  scene = "play";
  autoUntilInput = true;
} else if (startScene === "over") {
  world = makeDemo();
  warmUp(world, 4);
  world.state = "over";
  over = { result: { score: 184250, wave: 9, time: 222, kills: 341, maxMultiplier: 14 }, best: { score: 184250, wave: 9 }, isNew: true, t: 3, sel: 0 };
  scene = "over";
} else {
  world = makeDemo();
  warmUp(world, 3);
  if (startScene === "settings" || startScene === "keys") openSettings("title");
  if (startScene === "keys") keysOpen = true;
}

input.onFirstGesture = () => {
  audio.start();
  audio.setMuted(muted);
};
window.addEventListener("keydown", (e) => {
  const code = codeOf(e);
  if (code === "KeyM") {
    muted = !muted;
    audio.setMuted(muted);
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      // 保存できなくても続ける
    }
  }
  if (code === "F11") {
    e.preventDefault();
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }
});
window.addEventListener("blur", () => {
  if (scene === "play" && !autoUntilInput && world.state === "playing") {
    paused = true;
    pauseSel = 0;
    audio.setMusicOpen(0.2);
  }
});

// 画面の大きさ
let dpr = 1;
function resize(): void {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas!.width = Math.floor(window.innerWidth * dpr);
  canvas!.height = Math.floor(window.innerHeight * dpr);
}
window.addEventListener("resize", resize);
resize();

function controlFromInput(f: Frame, v: View): Control {
  let aim: number | null = null;
  if (f.aiming) {
    if (f.mouseAim) {
      const wx = (f.mouseX - v.ox) / v.scale;
      const wy = (f.mouseY - v.oy) / v.scale;
      aim = Math.atan2(wy - world.player.y, wx - world.player.x);
    } else {
      aim = Math.atan2(f.aimY, f.aimX);
    }
  }
  return { moveX: f.moveX, moveY: f.moveY, aim, dash: f.dash, overdrive: f.overdrive };
}

function update(dt: number, f: Frame, v: View): void {
  sceneT += dt;
  if (scene === "title") {
    world.update(dt, autopilot(world, clock));
    if (world.state !== "playing" || world.time > 70) {
      world = makeDemo();
    }
    if (updateSettings(f)) return;
    if (f.up || f.down) {
      titleSel = 1 - titleSel;
      audio.uiMove();
    }
    if (f.confirm) {
      if (titleSel === 1) {
        audio.start();
        audio.setMuted(muted);
        audio.uiConfirm();
        openSettings("title");
      } else startGame();
    }
    return;
  }

  if (scene === "play") {
    if (autoUntilInput && (f.anyInput || f.moveX !== 0 || f.moveY !== 0 || f.aiming)) {
      autoUntilInput = false;
      audio.start();
    }
    if (paused) {
      if (updateSettings(f)) return;
      if (f.up) {
        pauseSel = (pauseSel + PAUSE_ITEMS.length - 1) % PAUSE_ITEMS.length;
        audio.uiMove();
      }
      if (f.down) {
        pauseSel = (pauseSel + 1) % PAUSE_ITEMS.length;
        audio.uiMove();
      }
      if (f.pause || f.back) {
        paused = false;
        audio.setMusicOpen(1);
      } else if (f.confirm) {
        const item = PAUSE_ITEMS[pauseSel];
        if (item === "つづける") {
          paused = false;
          audio.setMusicOpen(1);
        } else if (item === "せってい") {
          audio.uiConfirm();
          openSettings("pause");
        } else if (item === "やりなおす") startGame();
        else toTitle();
      }
      return;
    }
    if (f.pause && !autoUntilInput) {
      paused = true;
      pauseSel = 0;
      audio.setMusicOpen(0.2);
      audio.uiMove();
      return;
    }
    const c = autoUntilInput ? autopilot(world, clock) : controlFromInput(f, v);
    world.update(dt, c);
    audio.intensity = Math.min(4, 1 + Math.floor((world.wave - 1) / 2));
    if (world.state === "over") finishRun();
    return;
  }

  // 結果
  world.update(dt, { moveX: 0, moveY: 0, aim: null, dash: false, overdrive: false });
  if (!over) return;
  over.t += dt;
  if (over.t < 0.6) return;
  if (f.up || f.down) {
    over.sel = (over.sel + 1) % OVER_ITEMS.length;
    audio.uiMove();
  }
  if (f.restart) startGame();
  else if (f.confirm) {
    if (OVER_ITEMS[over.sel] === "もう一度") startGame();
    else toTitle();
  } else if (f.back) toTitle();
}

function drawSettingsOrKeys(v: View): void {
  if (keysOpen) drawKeys(ctx, v, keysSel, keymap, keysWaiting, keysMsg);
  else drawSettings(ctx, v, settingsSel, [settings.sfx, settings.music]);
}

function draw(v: View, f: Frame): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  drawBackdrop(ctx, v);

  const shake = world.fx.shakeOffset(clock);
  ctx.save();
  ctx.translate(v.W / 2, v.H / 2);
  ctx.rotate(shake.rot);
  ctx.translate(-v.W / 2 + v.ox + shake.x, -v.H / 2 + v.oy + shake.y);
  ctx.scale(v.scale, v.scale);
  drawWorld(ctx, world, clock, audio.beatPhase(), true);
  ctx.restore();
  post.vignette(ctx);

  const padHint = f.device === "pad";
  if (scene === "play") drawHudGlow(ctx, world, v, clock, best.score, paused);
  else if (scene === "title" && !settingsFrom) drawTitleGlow(ctx, v, sceneT, best, reduced, titleSel);
  else if (over) drawOverGlow(ctx, v, over);

  if (world.fx.flash > 0) {
    ctx.globalAlpha = world.fx.flash * 0.6;
    ctx.fillStyle = world.fx.flashColor;
    ctx.fillRect(0, 0, v.W, v.H);
    ctx.globalAlpha = 1;
  }

  post.apply(ctx, 1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (scene === "play") {
    if (!paused) drawHudText(ctx, world, v, padHint, keyLabel(keymap.overdrive));
    if (paused && settingsFrom) drawSettingsOrKeys(v);
    else if (paused) drawPause(ctx, v, pauseSel);
    else if (input.mouseActive(performance.now()) && !autoUntilInput) {
      // 照準
      ctx.strokeStyle = COLOR.player;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.mouseX, f.mouseY, 10, 0, Math.PI * 2);
      ctx.moveTo(f.mouseX - 18, f.mouseY);
      ctx.lineTo(f.mouseX - 13, f.mouseY);
      ctx.moveTo(f.mouseX + 13, f.mouseY);
      ctx.lineTo(f.mouseX + 18, f.mouseY);
      ctx.moveTo(f.mouseX, f.mouseY - 18);
      ctx.lineTo(f.mouseX, f.mouseY - 13);
      ctx.moveTo(f.mouseX, f.mouseY + 13);
      ctx.lineTo(f.mouseX, f.mouseY + 18);
      ctx.stroke();
    }
  } else if (scene === "title") {
    if (settingsFrom) drawSettingsOrKeys(v);
    else drawTitleText(ctx, v, sceneT, best, padHint, muted, titleSel, keymap);
  }
  else if (over) drawOverText(ctx, v, over);

  canvas!.style.cursor = scene === "play" && !paused ? "none" : "default";
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  clock += dt;
  const f = input.read();
  const W = window.innerWidth;
  const H = window.innerHeight;
  const v = makeView(W, H, dpr, world.player.x, world.player.y);
  update(dt, f, v);
  draw(v, f);
  requestAnimationFrame(frame);
}
// 日本語の書体（同梱の M PLUS 1）の読み込みを待ってから描き始める。失敗しても予備の書体で始める
async function loadFonts(): Promise<void> {
  try {
    await Promise.all([document.fonts.load('500 16px "MPLUS1Game"'), document.fonts.load('700 16px "MPLUS1Game"')]);
  } catch {
    // 読めなくても、予備の書体で始める
  }
}
void loadFonts().then(() => {
  last = performance.now();
  requestAnimationFrame(frame);
});
