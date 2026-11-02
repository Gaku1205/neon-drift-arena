import { describe, expect, it } from "vitest";
import { autopilot } from "./autopilot";
import { ARENA_H, ARENA_W } from "./palette";
import { World } from "./world";

/** オートパイロットで最後まで遊ばせる（音なし・1/60 秒刻み） */
function run(seed: number, maxSeconds: number, skill: number): World {
  const w = new World(seed);
  const dt = 1 / 60;
  for (let i = 0; i < maxSeconds * 60 && w.state !== "over"; i++) w.update(dt, autopilot(w, i * dt, skill));
  return w;
}

const avgTime = (ws: World[]): number => ws.reduce((s, w) => s + w.time, 0) / ws.length;

describe("ゲームの1回", () => {
  it("波が進み、得点が入り、自機は闘技場の外に出ない", () => {
    const w = new World(1);
    const dt = 1 / 60;
    for (let i = 0; i < 40 * 60 && w.state === "playing"; i++) {
      w.update(dt, autopilot(w, i * dt));
      expect(w.player.x).toBeGreaterThanOrEqual(0);
      expect(w.player.x).toBeLessThanOrEqual(ARENA_W);
      expect(w.player.y).toBeGreaterThanOrEqual(0);
      expect(w.player.y).toBeLessThanOrEqual(ARENA_H);
    }
    expect(w.wave).toBeGreaterThanOrEqual(2);
    expect(w.score).toBeGreaterThan(0);
    expect(w.kills).toBeGreaterThan(0);
  });

  it("何もしないと、そのうち終わる", () => {
    const w = new World(2);
    const dt = 1 / 60;
    for (let i = 0; i < 600 * 60 && w.state !== "over"; i++) w.update(dt, { moveX: 0, moveY: 0, aim: null, dash: false, overdrive: false });
    expect(w.state).toBe("over");
    expect(w.lives).toBe(0);
  });

  it("ぎこちない操作（初めての人の代わり）は、1〜5 分くらいで終わる", () => {
    const runs = [21, 22, 23, 24].map((s) => run(s, 900, 0.4));
    expect(avgTime(runs)).toBeGreaterThan(60);
    expect(avgTime(runs)).toBeLessThan(330);
  });

  it("反応が完璧な見本でも、いつかは終わる", () => {
    const runs = [11, 12].map((s) => run(s, 1500, 1));
    for (const r of runs) expect(r.state).toBe("over");
  });
});
