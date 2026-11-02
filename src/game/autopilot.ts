import { ARENA_H, ARENA_W } from "./palette";
import type { Control, World } from "./world";

/**
 * タイトルの裏で遊ぶ見本の操作（敵と弾から離れ、近い敵を撃つ）。
 * skill を下げると、狙いがぶれ、弾の見切りが遅く、ドリフトを使わない（難しさの確かめに使う）
 */
export function autopilot(w: World, t: number, skill = 1): Control {
  const p = w.player;
  let fx = 0;
  let fy = 0;
  let nearest = Infinity;
  let aim: number | null = null;
  for (const e of w.enemies) {
    if (e.spawnT > 0) continue;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < nearest) {
      nearest = d;
      aim = Math.atan2(-dy, -dx);
    }
    const reach = 260 + e.r * 2;
    if (d < reach) {
      const f = Math.pow(1 - d / reach, 1.5) * (e.kind === "guardian" ? 3 : 1.6);
      fx += (dx / d) * f;
      fy += (dy / d) * f;
    }
  }
  let dashNeeded = false;
  for (const b of w.ebullets) {
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    const sight = 70 + 100 * skill;
    if (d < sight) {
      const f = Math.pow(1 - d / sight, 2) * 2.2;
      fx += (dx / d) * f;
      fy += (dy / d) * f;
      const toward = (b.vx * dx + b.vy * dy) / (Math.hypot(b.vx, b.vy) * d || 1);
      if (d < 70 && toward > 0.85) dashNeeded = true;
    }
  }
  // 中央へ戻る力と、ゆっくり回る力
  const cx = ARENA_W / 2 - p.x;
  const cy = ARENA_H / 2 - p.y;
  fx += cx / 900 + Math.cos(t * 0.4) * 0.25;
  fy += cy / 520 + Math.sin(t * 0.4) * 0.25;
  const len = Math.hypot(fx, fy);
  const moveX = len > 0.05 ? fx / Math.max(1, len) : 0;
  const moveY = len > 0.05 ? fy / Math.max(1, len) : 0;
  const crowd = w.enemies.length + w.ebullets.length / 4;
  const wobble = (1 - skill) * 0.5 * Math.sin(t * 2.3 + Math.sin(t * 0.7) * 3);
  return {
    moveX,
    moveY,
    aim: aim === null ? null : aim + wobble,
    dash: skill >= 1 && (dashNeeded || (nearest < 60 && p.dashCd <= 0)),
    overdrive: w.overdrive >= 1 && crowd > 14,
  };
}
