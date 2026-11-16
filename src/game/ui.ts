import { formatScore, formatTime, type BestRecord, type RunResult } from "../lib/records";
import { ACTIONS, ACTION_LABELS, DEFAULT_KEYMAP, keyLabel, type KeyMap } from "../lib/keymap";
import { neonText } from "./neon-text";
import { COLOR, JP_FONT } from "./palette";
import type { View } from "./render";

function jp(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left", weight = 500): number {
  ctx.font = `${weight} ${Math.max(14, size)}px ${JP_FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  return ctx.measureText(text).width;
}

function dim(ctx: CanvasRenderingContext2D, v: View, a: number): void {
  ctx.fillStyle = `rgba(7,6,15,${a})`;
  ctx.fillRect(0, 0, v.W, v.H);
}

/** キーの形（角丸の枠＋文字） */
function keycap(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, u: number): number {
  ctx.font = `700 ${Math.max(14, 15 * u)}px ${JP_FONT}`;
  const w = Math.max(30 * u, ctx.measureText(label).width + 18 * u);
  const h = Math.max(26, 30 * u);
  ctx.beginPath();
  ctx.roundRect(x, y - h / 2, w, h, 6 * u);
  ctx.strokeStyle = COLOR.textSub;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.8;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLOR.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + 1);
  ctx.textBaseline = "alphabetic";
  return w;
}

// ───────── タイトル ─────────

export function drawTitleGlow(ctx: CanvasRenderingContext2D, v: View, t: number, best: BestRecord, reduced: boolean, sel = 0): void {
  const u = v.u;
  dim(ctx, v, 0.5);
  const cy = v.H * 0.34;
  const flicker = reduced ? 1 : t < 1.2 ? (Math.sin(t * 60) > 0 ? 1 : 0.3) * Math.min(1, t) : 0.94 + 0.06 * Math.sin(t * 3);
  neonText(ctx, "NEON DRIFT", v.W / 2, cy - 70 * u, { size: 132 * u, color: COLOR.player, spacing: 0.5, align: "center", weight: 0.075, skew: 0.14, alpha: flicker });
  // ARENA と左右の線
  const aw = neonText(ctx, "ARENA", v.W / 2, cy + 96 * u, { size: 40 * u, color: COLOR.drifter, spacing: 1.7, align: "center", weight: 0.1 });
  ctx.strokeStyle = COLOR.drifter;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const ly = cy + 116 * u;
  ctx.moveTo(v.W / 2 - aw / 2 - 40 * u, ly);
  ctx.lineTo(v.W / 2 - aw / 2 - 220 * u, ly);
  ctx.moveTo(v.W / 2 + aw / 2 + 40 * u, ly);
  ctx.lineTo(v.W / 2 + aw / 2 + 220 * u, ly);
  ctx.stroke();

  if (best.score > 0) {
    neonText(ctx, `BEST ${formatScore(best.score)}`, v.W - 40 * u, 40 * u, { size: 20 * u, color: COLOR.shard, spacing: 0.45, align: "right", weight: 0.1 });
  }
  // 始める合図の下線（脈打つ）
  const k = reduced ? 1 : 0.55 + 0.45 * Math.sin(t * 4);
  if (sel === 0) {
    ctx.globalAlpha = k;
    ctx.fillStyle = COLOR.player;
    ctx.fillRect(v.W / 2 - 120 * u, v.H * 0.64 + 16 * u, 240 * u, 3 * u);
    ctx.globalAlpha = 1;
  } else {
    drawBand(ctx, v.W / 2, v.H * 0.64 + SETTINGS_OFFSET * u, 280 * u, u);
  }
}

/** タイトルの「せってい」の、始める合図からの距離（×u） */
const SETTINGS_OFFSET = 72;

/** 選択中の帯（player の薄い帯＋左の縦線）。y は文字の基準線 */
function drawBand(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number, u: number): void {
  ctx.fillStyle = "rgba(62,242,255,0.12)";
  ctx.fillRect(cx - w / 2, y - 36 * u, w, 52 * u);
  ctx.fillStyle = COLOR.player;
  ctx.fillRect(cx - w / 2, y - 36 * u, 4 * u, 52 * u);
}

export function drawTitleText(ctx: CanvasRenderingContext2D, v: View, t: number, best: BestRecord, pad: boolean, muted: boolean, sel = 0, keymap: KeyMap = DEFAULT_KEYMAP): void {
  const u = v.u;
  const cy = v.H * 0.34;
  jp(ctx, "光る闘技場で、弾をすり抜け、群れを撃ち抜け。", v.W / 2, cy + 176 * u, 24 * u, COLOR.textSub, "center", 500);
  const blink = 0.75 + 0.25 * Math.sin(t * 4);
  ctx.globalAlpha = blink;
  jp(ctx, pad ? "A ボタンで はじめる" : "Enter か Space で はじめる", v.W / 2, v.H * 0.64, 30 * u, sel === 0 ? COLOR.text : COLOR.textSub, "center", sel === 0 ? 700 : 500);
  ctx.globalAlpha = 1;
  jp(ctx, "せってい", v.W / 2, v.H * 0.64 + SETTINGS_OFFSET * u, 28 * u, sel === 1 ? COLOR.player : COLOR.textSub, "center", sel === 1 ? 700 : 500);
  if (best.score > 0) jp(ctx, `最高到達 ウェーブ ${best.wave}`, v.W - 40 * u, 92 * u, 16 * u, COLOR.textSub, "right", 500);

  // 操作の案内
  const rows: [string, string[]][] = pad
    ? [
        ["移動", ["左スティック"]],
        ["射撃", ["右スティック"]],
        ["ドリフト", ["LB"]],
        ["オーバードライブ", ["RB"]],
      ]
    : [
        ["移動", [keymap.moveUp, keymap.moveLeft, keymap.moveDown, keymap.moveRight].map(keyLabel)],
        ["射撃", [keymap.aimLeft, keymap.aimUp, keymap.aimDown, keymap.aimRight].map(keyLabel).concat("マウス左")],
        ["ドリフト", [keyLabel(keymap.dash)]],
        ["オーバードライブ", [keyLabel(keymap.overdrive)]],
      ];
  const y = v.H - 92 * u;
  // 幅を測って、中央に並べる
  const gap = 44 * u;
  const measure = (label: string, keys: string[]): number => {
    ctx.font = `500 ${Math.max(14, 16 * u)}px ${JP_FONT}`;
    let w = ctx.measureText(label).width + 12 * u;
    ctx.font = `700 ${Math.max(14, 15 * u)}px ${JP_FONT}`;
    for (const k of keys) w += Math.max(30 * u, ctx.measureText(k).width + 18 * u) + 6 * u;
    return w;
  };
  const total = rows.reduce((s, [l, k]) => s + measure(l, k), 0) + gap * (rows.length - 1);
  let x = v.W / 2 - total / 2;
  for (const [label, keys] of rows) {
    const lw = jp(ctx, label, x, y + 6 * u, 16 * u, COLOR.textSub, "left", 500);
    let kx = x + lw + 12 * u;
    for (const key of keys) kx += keycap(ctx, key, kx, y, u) + 6 * u;
    x += measure(label, keys) + gap;
  }
  jp(ctx, "ドリフト中は無敵。触れた敵の弾は金の欠片に変わる。欠片を集めると倍率が上がる。", v.W / 2, v.H - 36 * u, 16 * u, COLOR.textSub, "center", 500);
  jp(ctx, muted ? "M：音を出す" : "M：音を消す", 40 * u, 52 * u, 15 * u, COLOR.textSub, "left", 500);
}

// ───────── 一時停止 ─────────

export const PAUSE_ITEMS = ["つづける", "せってい", "やりなおす", "タイトルへ"] as const;

export function drawPause(ctx: CanvasRenderingContext2D, v: View, sel: number): void {
  const u = v.u;
  dim(ctx, v, 0.72);
  jp(ctx, "一時停止", v.W / 2, v.H * 0.36, 52 * u, COLOR.text, "center", 700);
  PAUSE_ITEMS.forEach((item, i) => {
    const y = v.H * 0.48 + i * 64 * u;
    const on = i === sel;
    if (on) {
      ctx.fillStyle = "rgba(62,242,255,0.12)";
      ctx.fillRect(v.W / 2 - 180 * u, y - 36 * u, 360 * u, 52 * u);
      ctx.fillStyle = COLOR.player;
      ctx.fillRect(v.W / 2 - 180 * u, y - 36 * u, 4 * u, 52 * u);
    }
    jp(ctx, item, v.W / 2, y, 28 * u, on ? COLOR.player : COLOR.textSub, "center", on ? 700 : 500);
  });
  jp(ctx, "↑↓ で選んで Enter", v.W / 2, v.H * 0.48 + PAUSE_ITEMS.length * 64 * u + 10 * u, 16 * u, COLOR.textSub, "center", 500);
}

// ───────── せってい ─────────

export const SETTINGS_ITEMS = ["効果音", "伴奏", "キーのわりあて"] as const;

export function drawSettings(ctx: CanvasRenderingContext2D, v: View, sel: number, levels: readonly number[]): void {
  const u = v.u;
  dim(ctx, v, 0.72);
  jp(ctx, "せってい", v.W / 2, v.H * 0.3, 52 * u, COLOR.text, "center", 700);
  const bw = 600 * u;
  SETTINGS_ITEMS.forEach((item, i) => {
    const y = v.H * 0.46 + i * 72 * u;
    const on = i === sel;
    if (on) drawBand(ctx, v.W / 2, y, bw, u);
    jp(ctx, item, v.W / 2 - bw / 2 + 32 * u, y, 28 * u, on ? COLOR.player : COLOR.textSub, "left", on ? 700 : 500);
    if (i >= levels.length) {
      jp(ctx, "Enter", v.W / 2 + bw / 2 - 20 * u, y, 22 * u, on ? COLOR.player : COLOR.textSub, "right", on ? 700 : 500);
      return;
    }
    // 10マスの棒（地は薄い紫、埋まった所は player）
    const level = levels[i] ?? 0;
    const cell = 20 * u;
    const gap = 6 * u;
    const x0 = v.W / 2 - 40 * u;
    for (let k = 0; k < 10; k++) {
      ctx.fillStyle = k < level ? COLOR.player : "rgba(169,163,214,0.16)";
      ctx.fillRect(x0 + k * (cell + gap), y - 22 * u, cell, 24 * u);
    }
    jp(ctx, String(level), v.W / 2 + bw / 2 - 20 * u, y, 28 * u, on ? COLOR.player : COLOR.textSub, "right", on ? 700 : 500);
  });
  jp(ctx, "↑↓ で選んで ←→ で変える。キーのわりあては Enter", v.W / 2, v.H * 0.46 + SETTINGS_ITEMS.length * 72 * u + 10 * u, 16 * u, COLOR.textSub, "center", 500);
  jp(ctx, "Esc でもどる", v.W / 2, v.H * 0.46 + SETTINGS_ITEMS.length * 72 * u + 38 * u, 16 * u, COLOR.textSub, "center", 500);
}

// ───────── キーのわりあて ─────────

/** 並びは操作10個＋「もとにもどす」 */
export const KEYS_RESET_INDEX = ACTIONS.length;

export function drawKeys(ctx: CanvasRenderingContext2D, v: View, sel: number, keymap: KeyMap, waiting: boolean, message: string): void {
  const u = v.u;
  dim(ctx, v, 0.72);
  jp(ctx, "キーのわりあて", v.W / 2, v.H * 0.15, 52 * u, COLOR.text, "center", 700);
  const bw = 600 * u;
  const rowH = 44 * u;
  const top = v.H * 0.25;
  for (let i = 0; i <= KEYS_RESET_INDEX; i++) {
    const y = top + i * rowH;
    const on = i === sel;
    if (on) {
      ctx.fillStyle = "rgba(62,242,255,0.12)";
      ctx.fillRect(v.W / 2 - bw / 2, y - 28 * u, bw, 40 * u);
      ctx.fillStyle = COLOR.player;
      ctx.fillRect(v.W / 2 - bw / 2, y - 28 * u, 4 * u, 40 * u);
    }
    const color = on ? COLOR.player : COLOR.textSub;
    const weight = on ? 700 : 500;
    const action = ACTIONS[i];
    if (action) {
      jp(ctx, ACTION_LABELS[action], v.W / 2 - bw / 2 + 32 * u, y, 22 * u, color, "left", weight);
      const text = on && waiting ? "押すキーを待つ" : keyLabel(keymap[action]);
      jp(ctx, text, v.W / 2 + bw / 2 - 20 * u, y, 22 * u, color, "right", weight);
    } else {
      jp(ctx, "もとにもどす", v.W / 2 - bw / 2 + 32 * u, y, 22 * u, color, "left", weight);
    }
  }
  const hy = top + (KEYS_RESET_INDEX + 1) * rowH + 12 * u;
  jp(ctx, waiting ? "割り当てたいキーを押す" : "↑↓ で選んで Enter で変える", v.W / 2, hy, 16 * u, COLOR.textSub, "center", 500);
  jp(ctx, waiting ? "Esc でやめる" : "Esc でもどる", v.W / 2, hy + 26 * u, 16 * u, COLOR.textSub, "center", 500);
  if (message) jp(ctx, message, v.W / 2, hy + 52 * u, 16 * u, COLOR.shard, "center", 700);
}

// ───────── 結果 ─────────

export const OVER_ITEMS = ["もう一度", "タイトルへ"] as const;

export interface OverState {
  result: RunResult;
  best: BestRecord;
  isNew: boolean;
  t: number;
  sel: number;
}

const ease = (x: number): number => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);

export function drawOverGlow(ctx: CanvasRenderingContext2D, v: View, o: OverState): void {
  const u = v.u;
  dim(ctx, v, 0.74 * ease(o.t * 2));
  const a = ease(o.t * 2.5);
  neonText(ctx, "GAME OVER", v.W / 2, v.H * 0.13, { size: 64 * u, color: COLOR.drifter, spacing: 0.6, align: "center", alpha: a, skew: 0.12, weight: 0.09 });
  const shown = Math.floor(o.result.score * ease((o.t - 0.3) / 1.2));
  neonText(ctx, formatScore(shown), v.W / 2, v.H * 0.33, { size: 104 * u, color: o.isNew ? COLOR.shard : COLOR.text, spacing: 0.38, align: "center", alpha: ease((o.t - 0.2) * 3), weight: 0.085 });

  // 4つの数字
  const stats: [string, string][] = [
    ["W", String(o.result.wave)],
    ["T", formatTime(o.result.time)],
    ["K", String(o.result.kills)],
    ["M", `×${o.result.maxMultiplier}`],
  ];
  const cw = 230 * u;
  const x0 = v.W / 2 - (cw * stats.length) / 2;
  stats.forEach(([, val], i) => {
    const k = ease((o.t - 0.9 - i * 0.1) * 4);
    const cx = x0 + cw * i + cw / 2;
    neonText(ctx, val, cx, v.H * 0.56, { size: 38 * u, color: i === 3 ? COLOR.shard : COLOR.player, spacing: 0.35, align: "center", alpha: k, weight: 0.1 });
    if (i > 0) {
      ctx.fillStyle = "rgba(169,163,214,0.25)";
      ctx.fillRect(x0 + cw * i, v.H * 0.53, 1, 74 * u);
    }
  });
  // 選択肢の枠
  const ia = ease((o.t - 1.4) * 4);
  OVER_ITEMS.forEach((_, i) => {
    const y = v.H * 0.76 + i * 62 * u;
    if (i === o.sel) {
      ctx.globalAlpha = ia;
      ctx.fillStyle = "rgba(62,242,255,0.12)";
      ctx.fillRect(v.W / 2 - 170 * u, y - 36 * u, 340 * u, 52 * u);
      ctx.fillStyle = COLOR.player;
      ctx.fillRect(v.W / 2 - 170 * u, y - 36 * u, 4 * u, 52 * u);
      ctx.globalAlpha = 1;
    }
  });
}

export function drawOverText(ctx: CanvasRenderingContext2D, v: View, o: OverState): void {
  const u = v.u;
  ctx.globalAlpha = ease((o.t - 0.2) * 3);
  jp(ctx, "スコア", v.W / 2, v.H * 0.3 - 8 * u, 20 * u, COLOR.textSub, "center", 700);
  if (o.isNew && o.t > 1.5) {
    const pulse = 0.8 + 0.2 * Math.sin(o.t * 8);
    ctx.globalAlpha = pulse;
    jp(ctx, "新記録！", v.W / 2, v.H * 0.33 + 146 * u, 26 * u, COLOR.shard, "center", 700);
  } else if (!o.isNew && o.best.score > 0) {
    jp(ctx, `最高 ${formatScore(o.best.score)}`, v.W / 2, v.H * 0.33 + 146 * u, 20 * u, COLOR.textSub, "center", 500);
  }
  ctx.globalAlpha = 1;
  const labels = ["到達ウェーブ", "生存時間", "撃破数", "最高倍率"];
  const cw = 230 * u;
  const x0 = v.W / 2 - (cw * labels.length) / 2;
  labels.forEach((l, i) => {
    ctx.globalAlpha = ease((o.t - 0.9 - i * 0.1) * 4);
    jp(ctx, l, x0 + cw * i + cw / 2, v.H * 0.53 + 8 * u, 16 * u, COLOR.textSub, "center", 500);
  });
  ctx.globalAlpha = ease((o.t - 1.4) * 4);
  OVER_ITEMS.forEach((item, i) => {
    const y = v.H * 0.76 + i * 62 * u;
    const on = i === o.sel;
    jp(ctx, item, v.W / 2, y, 28 * u, on ? COLOR.player : COLOR.textSub, "center", on ? 700 : 500);
  });
  jp(ctx, "R ですぐにもう一度", v.W / 2, v.H * 0.76 + 2 * 62 * u + 6 * u, 16 * u, COLOR.textSub, "center", 500);
  ctx.globalAlpha = 1;
}
