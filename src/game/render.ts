import { formatScore, formatTime } from "../lib/records";
import { progressToNext } from "../lib/scoring";
import { neonText } from "./neon-text";
import { ARENA_H, ARENA_W, COLOR, JP_FONT } from "./palette";
import { DASH_COOLDOWN, type Enemy, type World } from "./world";

/** 画面（CSS ピクセル）と、闘技場をどう重ねるか */
export interface View {
  W: number;
  H: number;
  dpr: number;
  scale: number;
  ox: number;
  oy: number;
  /** 画面の大きさの単位（1080 の高さで 1） */
  u: number;
}

export function makeView(W: number, H: number, dpr: number, focusX: number, focusY: number): View {
  const scale = Math.min(W / (ARENA_W + 140), H / (ARENA_H + 150));
  const leanX = (focusX - ARENA_W / 2) * 0.05;
  const leanY = (focusY - ARENA_H / 2) * 0.05;
  const ox = W / 2 - (ARENA_W / 2 + leanX) * scale;
  const oy = H / 2 + 8 * (H / 1080) - (ARENA_H / 2 + leanY) * scale;
  return { W, H, dpr, scale, ox, oy, u: Math.min(H / 1080, W / 1920) };
}

/** 光のにじみ（縮めてぼかし、加算で重ねる）と、周辺の暗さ */
export class Post {
  private small = document.createElement("canvas");
  private blurA = document.createElement("canvas");
  private blurB = document.createElement("canvas");
  private vig = document.createElement("canvas");
  private key = "";

  private ensure(cw: number, ch: number): void {
    const k = `${cw}x${ch}`;
    if (k === this.key) return;
    this.key = k;
    this.small.width = Math.max(1, Math.round(cw / 4));
    this.small.height = Math.max(1, Math.round(ch / 4));
    this.blurA.width = this.small.width;
    this.blurA.height = this.small.height;
    this.blurB.width = Math.max(1, Math.round(cw / 8));
    this.blurB.height = Math.max(1, Math.round(ch / 8));
    this.vig.width = 256;
    this.vig.height = 256;
    const v = this.vig.getContext("2d")!;
    const g = v.createRadialGradient(128, 128, 60, 128, 128, 182);
    g.addColorStop(0, "rgba(7,6,15,0)");
    g.addColorStop(1, "rgba(7,6,15,0.7)");
    v.fillStyle = g;
    v.fillRect(0, 0, 256, 256);
  }

  /** 周辺を暗くする（HUD より前に描く。HUD は暗くしない） */
  vignette(ctx: CanvasRenderingContext2D): void {
    const canvas = ctx.canvas;
    this.ensure(canvas.width, canvas.height);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.vig, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  apply(ctx: CanvasRenderingContext2D, strength: number): void {
    const canvas = ctx.canvas;
    this.ensure(canvas.width, canvas.height);
    const s = this.small.getContext("2d")!;
    const a = this.blurA.getContext("2d")!;
    const b = this.blurB.getContext("2d")!;
    s.globalCompositeOperation = "copy";
    s.drawImage(canvas, 0, 0, this.small.width, this.small.height);
    // 自分を掛け合わせて2乗にする＝暗い所はにじまず、明るい所だけが光る
    s.globalCompositeOperation = "multiply";
    s.drawImage(this.small, 0, 0);
    s.globalCompositeOperation = "copy";
    a.globalCompositeOperation = "copy";
    a.filter = "blur(2px)";
    a.drawImage(this.small, 0, 0);
    a.filter = "none";
    b.globalCompositeOperation = "copy";
    b.filter = "blur(4px)";
    b.drawImage(this.small, 0, 0, this.blurB.width, this.blurB.height);
    b.filter = "none";
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, 1.0 * strength);
    ctx.drawImage(this.blurA, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = Math.min(1, 0.9 * strength);
    ctx.drawImage(this.blurB, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

/** 画面いっぱいの背景（闘技場の外） */
export function drawBackdrop(ctx: CanvasRenderingContext2D, v: View): void {
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, v.W, v.H);
  const g = ctx.createRadialGradient(v.W / 2, v.H / 2, 0, v.W / 2, v.H / 2, Math.max(v.W, v.H) * 0.7);
  g.addColorStop(0, "rgba(40,28,110,0.35)");
  g.addColorStop(1, "rgba(7,6,15,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, v.W, v.H);
}

function poly(ctx: CanvasRenderingContext2D, n: number, r: number, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

/** 色の線＋白い芯の2層で描く（Nova Drift から学んだ「芯とにじみ」） */
function neonStroke(ctx: CanvasRenderingContext2D, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = Math.max(1, width * 0.35);
  ctx.stroke();
}

function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, color: string, core = true): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(size * 1.25, 0);
  ctx.lineTo(-size * 0.85, size * 0.85);
  ctx.lineTo(-size * 0.35, 0);
  ctx.lineTo(-size * 0.85, -size * 0.85);
  ctx.closePath();
  ctx.lineJoin = "round";
  if (core) neonStroke(ctx, color, 3);
  else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, t: number): void {
  if (e.spawnT > 0) {
    // 出てくる予告：縮む輪と十字
    const k = Math.max(0, Math.min(1, 1 - e.spawnT / (e.kind === "guardian" ? 1.6 : 0.9)));
    ctx.globalAlpha = 0.25 + 0.6 * k;
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * (3 - 2 * k), 0, Math.PI * 2);
    ctx.stroke();
    const c = e.r * 0.8;
    ctx.beginPath();
    ctx.moveTo(e.x - c, e.y);
    ctx.lineTo(e.x + c, e.y);
    ctx.moveTo(e.x, e.y - c);
    ctx.lineTo(e.x, e.y + c);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  const col = e.flash > 0 ? COLOR.white : e.color;
  ctx.save();
  ctx.translate(e.x, e.y);
  const pulse = 1 + Math.sin(t * 8 + e.id) * 0.04;
  switch (e.kind) {
    case "drifter":
    case "mini": {
      ctx.scale(pulse, pulse);
      poly(ctx, 4, e.r, e.angle);
      neonStroke(ctx, col, e.kind === "mini" ? 2.5 : 3);
      poly(ctx, 4, e.r * 0.45, -e.angle * 1.5);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case "darter": {
      if (e.state === 1) {
        // 突進の予告線
        const k = 1 - e.timer / 0.62;
        ctx.save();
        ctx.rotate(e.angle);
        ctx.globalAlpha = 0.2 + 0.6 * k;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2 + 3 * k;
        ctx.setLineDash([14, 12]);
        ctx.lineDashOffset = -t * 120;
        ctx.beginPath();
        ctx.moveTo(e.r + 6, 0);
        ctx.lineTo(420, 0);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
      ctx.rotate(e.angle);
      ctx.beginPath();
      ctx.moveTo(e.r * 1.4, 0);
      ctx.lineTo(-e.r, e.r * 0.95);
      ctx.lineTo(-e.r * 0.45, 0);
      ctx.lineTo(-e.r, -e.r * 0.95);
      ctx.closePath();
      ctx.lineJoin = "round";
      neonStroke(ctx, col, 3);
      break;
    }
    case "splitter": {
      ctx.rotate(e.angle);
      ctx.beginPath();
      ctx.rect(-e.r * 0.8, -e.r * 0.8, e.r * 1.6, e.r * 1.6);
      neonStroke(ctx, col, 3);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 - e.angle * 2;
        ctx.beginPath();
        ctx.rect(Math.cos(a) * e.r * 0.35 - 4, Math.sin(a) * e.r * 0.35 - 4, 8, 8);
        ctx.stroke();
      }
      break;
    }
    case "turret": {
      if (e.state === 1) {
        const k = 1 - e.timer / 0.55;
        ctx.globalAlpha = 0.3 + 0.7 * k;
        ctx.beginPath();
        ctx.arc(0, 0, e.r * (2.2 - k * 1.1), 0, Math.PI * 2);
        ctx.strokeStyle = COLOR.enemyBullet;
        ctx.lineWidth = 2 + 2 * k;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      poly(ctx, 6, e.r, e.angle);
      neonStroke(ctx, col, 3);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = e.angle + (i / 6) * Math.PI * 2 + Math.PI / 6;
        ctx.moveTo(Math.cos(a) * e.r * 0.3, Math.sin(a) * e.r * 0.3);
        ctx.lineTo(Math.cos(a) * e.r * 0.75, Math.sin(a) * e.r * 0.75);
      }
      ctx.stroke();
      break;
    }
    case "guardian": {
      const hpK = e.hp / e.maxHp;
      // 外の輪（回る8つの弧）
      ctx.lineCap = "round";
      for (let i = 0; i < 8; i++) {
        const a = e.angle + (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(0, 0, e.r * 1.25, a, a + 0.5);
        neonStroke(ctx, col, 4);
      }
      poly(ctx, 8, e.r * 0.92, -e.angle * 0.6);
      neonStroke(ctx, col, 4);
      poly(ctx, 4, e.r * 0.55, e.angle * 1.4);
      neonStroke(ctx, COLOR.shard, 3);
      // 芯（体力で小さくなる）
      const core = e.r * (0.18 + 0.14 * hpK) * (1 + Math.sin(t * 10) * 0.08);
      ctx.beginPath();
      ctx.arc(0, 0, core, 0, Math.PI * 2);
      ctx.fillStyle = e.flash > 0 ? COLOR.white : COLOR.guardian;
      ctx.fill();
      // 体力の弧
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 1.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpK);
      ctx.strokeStyle = COLOR.guardian;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
  }
  ctx.restore();
}

/** 闘技場の中を全部描く（ctx は闘技場の座標に合わせてある） */
export function drawWorld(ctx: CanvasRenderingContext2D, w: World, t: number, beat: number, showPlayer: boolean): void {
  const pulse = Math.pow(1 - beat, 3);
  // 床
  ctx.fillStyle = COLOR.floor;
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-40, -40, ARENA_W + 80, ARENA_H + 80);
  ctx.clip();
  w.grid.draw(ctx, pulse);
  ctx.restore();

  // 枠：線＋四隅の明るい鉤
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.rect(0, 0, ARENA_W, ARENA_H);
  ctx.globalAlpha = 0.75 + pulse * 0.25;
  neonStroke(ctx, w.hurtGlow > 0 ? COLOR.danger : COLOR.border, 3 + pulse * 1.5);
  ctx.globalAlpha = 1;
  const L = 70;
  ctx.beginPath();
  for (const [cx, cy, sx, sy] of [
    [0, 0, 1, 1],
    [ARENA_W, 0, -1, 1],
    [0, ARENA_H, 1, -1],
    [ARENA_W, ARENA_H, -1, -1],
  ] as const) {
    ctx.moveTo(cx - sx * 8, cy + sy * L);
    ctx.lineTo(cx - sx * 8, cy - sy * 8);
    ctx.lineTo(cx + sx * L, cy - sy * 8);
  }
  neonStroke(ctx, COLOR.player, 4);

  ctx.globalCompositeOperation = "lighter";
  // 欠片
  for (const s of w.shards) {
    if (s.life < 1.5 && Math.floor(s.life * 12) % 2 === 0) continue;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(t * 4 + s.x * 0.01);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 0);
    ctx.lineTo(0, 6);
    ctx.lineTo(-4, 0);
    ctx.closePath();
    ctx.strokeStyle = COLOR.shard;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalCompositeOperation = "source-over";

  for (const e of w.enemies) drawEnemy(ctx, e, t);

  ctx.globalCompositeOperation = "lighter";
  // 自分の弾：速さの向きに伸びた光
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const b of w.bullets) {
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
  }
  ctx.strokeStyle = COLOR.player;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = COLOR.playerCore;
  ctx.lineWidth = 2;
  ctx.stroke();

  // 敵の弾：色の玉＋白い芯
  for (const b of w.ebullets) {
    ctx.fillStyle = b.color;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLOR.enemyBulletCore;
  ctx.beginPath();
  for (const b of w.ebullets) {
    ctx.moveTo(b.x + b.r * 0.45, b.y);
    ctx.arc(b.x, b.y, b.r * 0.45, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  // 自機
  const p = w.player;
  if (showPlayer && w.state === "playing") {
    for (const tr of p.trail) {
      ctx.globalAlpha = (tr.life / 0.28) * 0.6;
      drawShip(ctx, tr.x, tr.y, tr.a, 15, COLOR.player, false);
    }
    ctx.globalAlpha = 1;
    const blink = p.inv > 0 && p.dashT <= 0 && Math.floor(t * 18) % 2 === 0;
    if (!blink) {
      drawShip(ctx, p.x, p.y, p.angle, 15, COLOR.player);
      // 炎
      if (p.thrust > 0.1) {
        const back = p.angle + Math.PI;
        const len = 10 + p.thrust * (8 + Math.sin(t * 50) * 4);
        ctx.globalCompositeOperation = "lighter";
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(back) * 5, p.y + Math.sin(back) * 5);
        ctx.lineTo(p.x + Math.cos(back) * (5 + len), p.y + Math.sin(back) * (5 + len));
        ctx.strokeStyle = COLOR.player;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
    }
    // ドリフトの溜まり（足元の弧）
    if (p.dashCd > 0) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - p.dashCd / DASH_COOLDOWN));
      ctx.strokeStyle = COLOR.player;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  w.fx.draw(ctx);

  if (w.shock >= 0) {
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    ctx.arc(w.shockX, w.shockY, w.shock, 0, Math.PI * 2);
    ctx.globalAlpha = Math.max(0, 1 - w.shock / 2200);
    neonStroke(ctx, COLOR.player, 16);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  for (const pp of w.fx.popups) {
    const k = pp.life / pp.max;
    neonText(ctx, pp.text, pp.x, pp.y, { size: pp.size * (k > 0.8 ? 1 + (k - 0.8) * 2 : 1), color: pp.color, align: "center", alpha: Math.min(1, k * 2), weight: 0.12 });
  }
}

function jp(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left", weight = 500): void {
  ctx.font = `${weight} ${Math.max(14, size)}px ${JP_FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number, color: string): void {
  ctx.fillStyle = "rgba(169,163,214,0.16)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, k)), h);
}

/** 遊んでいる最中の表示（にじみの前に描く物：線の字と枠） */
export function drawHudGlow(ctx: CanvasRenderingContext2D, w: World, v: View, t: number, best: number, paused: boolean): void {
  const u = v.u;
  // 闘技場の上下の余白に1列ずつ収める
  const top = Math.max(10 * u, v.oy - 62 * u);
  const left = v.ox;
  const right = v.ox + ARENA_W * v.scale;
  const bottom = v.oy + ARENA_H * v.scale + 22 * u;

  // 得点と倍率
  const sw = neonText(ctx, formatScore(w.score), left, top, { size: 36 * u, color: COLOR.text, spacing: 0.4, weight: 0.1 });
  const mult = w.multiplier;
  const mx = left + sw + 26 * u;
  const mw = neonText(ctx, `×${mult}`, mx, top + 8 * u, { size: 28 * u, color: COLOR.shard, spacing: 0.3, weight: 0.12 });
  bar(ctx, mx + mw + 14 * u, top + 26 * u, 110 * u, 5 * u, progressToNext(w.chain), COLOR.shard);
  if (best > 0) neonText(ctx, `HI ${formatScore(Math.max(best, w.score))}`, mx + mw + 14 * u, top + 6 * u, { size: 13 * u, color: COLOR.textSub, spacing: 0.45, core: false, weight: 0.12 });

  // 波と時間
  const ww = neonText(ctx, `WAVE ${w.wave}`, right, top, { size: 36 * u, color: COLOR.player, spacing: 0.45, align: "right", weight: 0.1 });
  neonText(ctx, formatTime(w.time), right - ww - 28 * u, top + 12 * u, { size: 22 * u, color: COLOR.textSub, spacing: 0.4, align: "right", core: false, weight: 0.12 });

  // 残機
  for (let i = 0; i < w.lives; i++) drawShip(ctx, left + 12 * u + i * 34 * u, bottom + 14 * u, -Math.PI / 2, 11 * u, COLOR.player);

  // オーバードライブ
  const full = w.overdrive >= 1;
  const bw = 260 * u;
  const bx = right - bw;
  const by = bottom + 16 * u;
  const glow = full ? 0.6 + 0.4 * Math.sin(t * 10) : 1;
  ctx.globalAlpha = glow;
  bar(ctx, bx, by, bw, 8 * u, w.overdrive, full ? COLOR.player : COLOR.border);
  ctx.globalAlpha = 1;
  neonText(ctx, "OVERDRIVE", bx - 20 * u, by - 5 * u, { size: 15 * u, color: full ? COLOR.player : COLOR.textSub, spacing: 0.5, align: "right", core: full, weight: 0.12 });

  // 大物の体力
  const g = w.guardian;
  if (g && g.spawnT <= 0) {
    const gw = 560 * u;
    bar(ctx, v.W / 2 - gw / 2, top + 30 * u, gw, 8 * u, g.hp / g.maxHp, COLOR.guardian);
  }

  // 波の見出し（一時停止の間は出さない）
  if (w.banner && !paused) {
    const b = w.banner;
    const k = 1 - b.t / b.max;
    const appear = Math.min(1, k * 6);
    const fade = Math.min(1, b.t * 2.5);
    const sc = 1 + (1 - appear) * 0.35;
    neonText(ctx, b.title, v.W / 2, v.H * 0.3 - 40 * u * sc, { size: 72 * u * sc, color: b.color, spacing: 0.55, align: "center", alpha: appear * fade, skew: 0.12 });
  }

  // 被弾の赤い縁
  if (w.hurtGlow > 0) {
    const gr = ctx.createRadialGradient(v.W / 2, v.H / 2, v.H * 0.35, v.W / 2, v.H / 2, v.H * 0.95);
    gr.addColorStop(0, "rgba(255,77,94,0)");
    gr.addColorStop(1, `rgba(255,77,94,${0.45 * w.hurtGlow})`);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, v.W, v.H);
  }
}

/** にじみの後に描く物（日本語の文字。くっきり読ませる） */
export function drawHudText(ctx: CanvasRenderingContext2D, w: World, v: View, padHint: boolean): void {
  const u = v.u;
  const top = Math.max(10 * u, v.oy - 62 * u);
  const right = v.ox + ARENA_W * v.scale;
  const bottom = v.oy + ARENA_H * v.scale + 22 * u;
  const g = w.guardian;
  if (g && g.spawnT <= 0) jp(ctx, "ガーディアン", v.W / 2, top + 20 * u, 16 * u, COLOR.text, "center", 700);
  if (w.overdrive >= 1) jp(ctx, padHint ? "RB で発動" : "E で発動", right - 260 * u - 200 * u, bottom + 26 * u, 16 * u, COLOR.player, "right", 700);
  if (w.banner && w.banner.sub) {
    const b = w.banner;
    const k = 1 - b.t / b.max;
    ctx.globalAlpha = Math.min(1, Math.max(0, (k - 0.08) * 6)) * Math.min(1, b.t * 2.5);
    jp(ctx, b.sub, v.W / 2, v.H * 0.3 + 64 * u, 24 * u, COLOR.text, "center", 700);
    ctx.globalAlpha = 1;
  }
}
