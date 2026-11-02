/** 粒・光の輪・得点の文字・画面の揺れ */

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  drag: number;
  /** spark=速さの向きに伸びる線、dot=点、shard=回る四角 */
  kind: "spark" | "dot" | "shard";
  rot: number;
}

export interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  max: number;
  color: string;
  width: number;
}

export interface Popup {
  x: number;
  y: number;
  text: string;
  life: number;
  max: number;
  color: string;
  size: number;
}

const MAX_PARTICLES = 2600;

export class Fx {
  particles: Particle[] = [];
  rings: Ring[] = [];
  popups: Popup[] = [];
  trauma = 0;
  flash = 0;
  flashColor = "#ffffff";
  /** 揺れを止める（動きを減らす設定） */
  calm = false;

  addTrauma(t: number): void {
    if (this.calm) return;
    this.trauma = Math.min(1, this.trauma + t);
  }

  doFlash(alpha: number, color: string): void {
    if (alpha * (this.calm ? 0.4 : 1) > this.flash) {
      this.flash = alpha * (this.calm ? 0.4 : 1);
      this.flashColor = color;
    }
  }

  spark(x: number, y: number, angle: number, speed: number, life: number, color: string, size = 2, kind: Particle["kind"] = "spark"): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      max: life,
      color,
      size,
      drag: kind === "dot" ? 2.5 : 3.8,
      kind,
      rot: Math.random() * Math.PI * 2,
    });
  }

  /** 爆発：放射状の火花＋破片＋光の輪 */
  explode(x: number, y: number, color: string, scale: number): void {
    const n = Math.floor(18 + 22 * scale);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (220 + Math.random() * 620) * (0.7 + scale * 0.4);
      this.spark(x, y, a, sp, 0.35 + Math.random() * 0.5, Math.random() < 0.25 ? "#ffffff" : color, 2 + Math.random() * 1.5);
    }
    for (let i = 0; i < 6 + scale * 4; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spark(x, y, a, 80 + Math.random() * 260, 0.7 + Math.random() * 0.6, color, 5 + Math.random() * 5 * scale, "shard");
    }
    this.ring(x, y, 8, 70 + 60 * scale, 0.35, color, 4);
    this.ring(x, y, 4, 40 + 30 * scale, 0.2, "#ffffff", 3);
  }

  ring(x: number, y: number, r0: number, r1: number, life: number, color: string, width: number): void {
    this.rings.push({ x, y, r0, r1, life, max: life, color, width });
  }

  popup(x: number, y: number, text: string, color: string, size = 14): void {
    if (this.popups.length > 60) this.popups.shift();
    this.popups.push({ x: x + (Math.random() - 0.5) * 24, y: y + (Math.random() - 0.5) * 16, text, life: 0.9, max: 0.9, color, size });
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += dt * 6;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const p of this.popups) {
      p.life -= dt;
      p.y -= 40 * dt;
    }
    this.popups = this.popups.filter((p) => p.life > 0);
  }

  /** 揺れと光は実時間で減らす（スローの間も同じ速さで収まる） */
  updateReal(dt: number): void {
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.flash = Math.max(0, this.flash - dt * 3.2);
  }

  shakeOffset(t: number): { x: number; y: number; rot: number } {
    const s = this.trauma * this.trauma;
    if (s <= 0) return { x: 0, y: 0, rot: 0 };
    return {
      x: 26 * s * Math.sin(t * 47.1 + 1.3) * Math.cos(t * 13.7),
      y: 26 * s * Math.sin(t * 39.3 + 4.1) * Math.cos(t * 17.9),
      rot: 0.03 * s * Math.sin(t * 29.7),
    };
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const p of this.particles) {
      const a = Math.min(1, (p.life / p.max) * 1.6);
      ctx.globalAlpha = a;
      if (p.kind === "spark") {
        const len = Math.min(40, Math.hypot(p.vx, p.vy) * 0.035) + 1;
        const sp = Math.hypot(p.vx, p.vy) || 1;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len);
        ctx.stroke();
      } else if (p.kind === "shard") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        const s = p.size * (0.4 + 0.6 * (p.life / p.max));
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.strokeRect(-s / 2, -s / 2, s, s * 0.5);
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      const e = 1 - Math.pow(1 - t, 3);
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - t * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}
