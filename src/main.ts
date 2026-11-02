import { EMPTY_BEST, mergeBest, parseBest, type BestRecord } from "./lib/records";
import { Audio } from "./game/audio";
import { autopilot } from "./game/autopilot";
import { codeOf, Input, type Frame } from "./game/input";
import { COLOR } from "./game/palette";
import { drawBackdrop, drawHudGlow, drawHudText, drawWorld, makeView, Post, type View } from "./game/render";
import { drawOverGlow, drawOverText, drawPause, drawTitleGlow, drawTitleText, OVER_ITEMS, PAUSE_ITEMS, type OverState } from "./game/ui";
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
    if (f.confirm) startGame();
    return;
  }

  if (scene === "play") {
    if (autoUntilInput && (f.anyInput || f.moveX !== 0 || f.moveY !== 0 || f.aiming)) {
      autoUntilInput = false;
      audio.start();
    }
    if (paused) {
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
  else if (scene === "title") drawTitleGlow(ctx, v, sceneT, best, reduced);
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
    if (!paused) drawHudText(ctx, world, v, padHint);
    if (paused) drawPause(ctx, v, pauseSel);
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
  } else if (scene === "title") drawTitleText(ctx, v, sceneT, best, padHint, muted);
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
requestAnimationFrame(frame);
