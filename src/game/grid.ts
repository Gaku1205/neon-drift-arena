import { ARENA_H, ARENA_W, COLOR } from "./palette";

/** 爆発で押し広がり、ばねで戻る格子（闘技場の床） */
export class WarpGrid {
  readonly spacing = 50;
  readonly cols: number;
  readonly rows: number;
  private dx: Float32Array;
  private dy: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  enabled = true;

  constructor() {
    this.cols = Math.round(ARENA_W / this.spacing) + 1;
    this.rows = Math.round(ARENA_H / this.spacing) + 1;
    const n = this.cols * this.rows;
    this.dx = new Float32Array(n);
    this.dy = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
  }

  /** (x,y) から外へ押す。strength が負なら吸い込む */
  impulse(x: number, y: number, radius: number, strength: number): void {
    if (!this.enabled) return;
    const s = this.spacing;
    const c0 = Math.max(1, Math.floor((x - radius) / s));
    const c1 = Math.min(this.cols - 2, Math.ceil((x + radius) / s));
    const r0 = Math.max(1, Math.floor((y - radius) / s));
    const r1 = Math.min(this.rows - 2, Math.ceil((y + radius) / s));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * this.cols + c;
        const px = c * s + (this.dx[i] ?? 0);
        const py = r * s + (this.dy[i] ?? 0);
        const ddx = px - x;
        const ddy = py - y;
        const d = Math.hypot(ddx, ddy);
        if (d >= radius || d < 0.001) continue;
        const f = strength * (1 - d / radius) * (1 - d / radius);
        this.vx[i] = (this.vx[i] ?? 0) + (ddx / d) * f;
        this.vy[i] = (this.vy[i] ?? 0) + (ddy / d) * f;
      }
    }
  }

  update(dt: number): void {
    const { cols, rows, dx, dy, vx, vy } = this;
    const k = 60;
    const couple = 90;
    const damping = Math.exp(-5.5 * dt);
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const i = r * cols + c;
        const ax = (dx[i - 1]! + dx[i + 1]! + dx[i - cols]! + dx[i + cols]!) * 0.25 - dx[i]!;
        const ay = (dy[i - 1]! + dy[i + 1]! + dy[i - cols]! + dy[i + cols]!) * 0.25 - dy[i]!;
        vx[i] = (vx[i]! + (-k * dx[i]! + couple * ax) * dt) * damping;
        vy[i] = (vy[i]! + (-k * dy[i]! + couple * ay) * dt) * damping;
      }
    }
    for (let i = 0; i < dx.length; i++) {
      dx[i] = Math.max(-40, Math.min(40, dx[i]! + vx[i]! * dt));
      dy[i] = Math.max(-40, Math.min(40, dy[i]! + vy[i]! * dt));
    }
  }

  draw(ctx: CanvasRenderingContext2D, pulse: number): void {
    const { cols, rows, dx, dy, spacing: s } = this;
    const px = (i: number, c: number): number => c * s + dx[i]!;
    const py = (i: number, r: number): number => r * s + dy[i]!;

    // 1段目：薄い格子（全部）
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLOR.grid;
    ctx.globalAlpha = 0.32 + pulse * 0.14;
    ctx.beginPath();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (c === 0) ctx.moveTo(px(i, c), py(i, r));
        else ctx.lineTo(px(i, c), py(i, r));
      }
    }
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const i = r * cols + c;
        if (r === 0) ctx.moveTo(px(i, c), py(i, r));
        else ctx.lineTo(px(i, c), py(i, r));
      }
    }
    ctx.stroke();

    // 2段目：大きく歪んだ所だけ明るく
    ctx.strokeStyle = COLOR.gridHot;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const m = Math.abs(dx[i]!) + Math.abs(dy[i]!);
        if (m < 4) continue;
        if (c + 1 < cols) {
          ctx.moveTo(px(i, c), py(i, r));
          ctx.lineTo(px(i + 1, c + 1), py(i + 1, r));
        }
        if (r + 1 < rows) {
          ctx.moveTo(px(i, c), py(i, r));
          ctx.lineTo(px(i + cols, c), py(i + cols, r + 1));
        }
      }
    }
    ctx.stroke();

    // 交点の小さな光（4つおき）
    ctx.fillStyle = COLOR.gridHot;
    ctx.globalAlpha = 0.22 + pulse * 0.45;
    for (let r = 0; r < rows; r += 4) {
      for (let c = 0; c < cols; c += 4) {
        const i = r * cols + c;
        ctx.fillRect(px(i, c) - 1.5, py(i, r) - 1.5, 3, 3);
      }
    }
    ctx.globalAlpha = 1;
  }
}
