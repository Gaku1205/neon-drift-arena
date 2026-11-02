import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import { applyDeadzone, circlesOverlap, turnToward, wrapAngle } from "./math";
import { chainAfterHit, extendsCrossed, killScore, MAX_MULTIPLIER, multiplierFor, progressToNext, SHARDS_PER_STEP, weaponLevel } from "./scoring";
import { ENEMY_COST, isGuardianWave, kindsFor, newKindAt, planWave, speedScale, waveBudget, waveTimeLimit } from "./waves";
import { formatScore, formatTime, mergeBest, parseBest } from "./records";
import { GLYPHS, glyphFor, textUnits } from "./glyphs";

describe("乱数", () => {
  it("同じ種なら同じ並び", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
  });
  it("0 以上 1 未満、int は両端を含む範囲", () => {
    const r = createRng(7);
    for (let i = 0; i < 500; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = r.int(2, 4);
      expect([2, 3, 4]).toContain(n);
    }
  });
  it("空の配列からは選べない", () => expect(() => createRng(1).pick([])).toThrow());
});

describe("当たり判定と角度", () => {
  it("重なっていれば当たり、離れていれば外れ", () => {
    expect(circlesOverlap(0, 0, 10, 15, 0, 10)).toBe(true);
    expect(circlesOverlap(0, 0, 10, 25, 0, 10)).toBe(false);
    expect(circlesOverlap(0, 0, 10, 20, 0, 10)).toBe(false);
  });
  it("角度は -π〜π に収まる", () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2);
  });
  it("近い向きへ、決まった量だけ回る", () => {
    expect(turnToward(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(turnToward(3, -3, 0.1)).toBeCloseTo(3.1);
    expect(turnToward(0, 0.05, 0.25)).toBe(0.05);
  });
  it("スティックの遊びの中は 0、外は長さ 1 まで", () => {
    expect(applyDeadzone(0.1, 0.1, 0.2)).toEqual({ x: 0, y: 0 });
    const v = applyDeadzone(1, 0, 0.2);
    expect(v.x).toBeCloseTo(1);
    expect(Math.hypot(applyDeadzone(0.9, 0.9, 0.2).x, applyDeadzone(0.9, 0.9, 0.2).y)).toBeLessThanOrEqual(1);
  });
});

describe("得点と倍率", () => {
  it("欠片 8 個ごとに倍率が 1 上がり、上限で止まる", () => {
    expect(multiplierFor(0)).toBe(1);
    expect(multiplierFor(SHARDS_PER_STEP - 1)).toBe(1);
    expect(multiplierFor(SHARDS_PER_STEP)).toBe(2);
    expect(multiplierFor(10000)).toBe(MAX_MULTIPLIER);
  });
  it("次の倍率までの進み具合", () => {
    expect(progressToNext(SHARDS_PER_STEP + SHARDS_PER_STEP / 2)).toBeCloseTo(0.5);
    expect(progressToNext(10000)).toBe(1);
  });
  it("被弾すると chain は半分、倍率は必ず1段は下がる", () => {
    for (const chain of [0, 3, 8, 9, 15, 16, 40, 100, 400]) {
      const after = chainAfterHit(chain);
      expect(after).toBeLessThanOrEqual(Math.floor(chain / 2));
      if (multiplierFor(chain) > 1) expect(multiplierFor(after)).toBeLessThan(multiplierFor(chain));
      else expect(after).toBe(0);
    }
  });
  it("倒した得点は基本点 × 倍率", () => expect(killScore(150, 4)).toBe(600));
  it("武器は倍率 5 と 10 で強くなる", () => {
    expect(weaponLevel(1)).toBe(1);
    expect(weaponLevel(5)).toBe(2);
    expect(weaponLevel(12)).toBe(3);
  });
  it("越えた残機増加を数える", () => {
    expect(extendsCrossed(0, 59999)).toBe(0);
    expect(extendsCrossed(59999, 60000)).toBe(1);
    expect(extendsCrossed(0, 1000000)).toBe(3);
  });
});

describe("波", () => {
  it("5 の倍数の波は大物", () => {
    expect(isGuardianWave(5)).toBe(true);
    expect(isGuardianWave(10)).toBe(true);
    expect(isGuardianWave(4)).toBe(false);
    expect(isGuardianWave(0)).toBe(false);
  });
  it("予算は（大物の波を除いて）波が進むほど増える", () => {
    const normal = [1, 2, 3, 4, 6, 7, 8, 9, 11];
    for (let i = 1; i < normal.length; i++) {
      expect(waveBudget(normal[i] as number)).toBeGreaterThan(waveBudget(normal[i - 1] as number));
    }
  });
  it("敵は 1→2→3→4 の波で順に出始める", () => {
    expect(kindsFor(1)).toEqual(["drifter"]);
    expect(kindsFor(4)).toEqual(["drifter", "darter", "splitter", "turret"]);
    expect(newKindAt(2)).toBe("darter");
    expect(newKindAt(6)).toBeNull();
  });
  it("予定の合計の重さは予算どおり（大物を除く）", () => {
    for (let wave = 1; wave <= 14; wave++) {
      const plan = planWave(wave, createRng(wave * 31));
      const cost = plan.reduce((s, e) => s + ENEMY_COST[e.kind] * e.count, 0);
      expect(cost).toBeGreaterThanOrEqual(waveBudget(wave));
      expect(cost).toBeLessThanOrEqual(waveBudget(wave) + 4);
      expect(plan.some((e) => e.kind === "guardian")).toBe(isGuardianWave(wave));
      for (let i = 1; i < plan.length; i++) expect((plan[i] as { at: number }).at).toBeGreaterThanOrEqual((plan[i - 1] as { at: number }).at);
    }
  });
  it("新しい敵は、その波の最初の方で紹介される", () => {
    const plan = planWave(3, createRng(9));
    expect(plan[0]?.kind).toBe("splitter");
  });
  it("速さは上がるが上限がある。波の長さは短くなるが下限がある", () => {
    expect(speedScale(1)).toBe(1);
    expect(speedScale(100)).toBeCloseTo(2.1);
    expect(waveTimeLimit(1)).toBeGreaterThan(waveTimeLimit(8));
    expect(waveTimeLimit(100)).toBe(9);
  });
});

describe("記録", () => {
  it("壊れた保存は空の記録", () => {
    expect(parseBest(null)).toEqual({ score: 0, wave: 0 });
    expect(parseBest("{oops")).toEqual({ score: 0, wave: 0 });
    expect(parseBest('{"score":-5,"wave":"x"}')).toEqual({ score: 0, wave: 0 });
    expect(parseBest('{"score":1234.7,"wave":6}')).toEqual({ score: 1234, wave: 6 });
  });
  it("高い方を残し、超えたら新記録", () => {
    const r = mergeBest({ score: 1000, wave: 9 }, { score: 2000, wave: 4, time: 60, kills: 10, maxMultiplier: 3 });
    expect(r.best).toEqual({ score: 2000, wave: 9 });
    expect(r.isNew).toBe(true);
    expect(mergeBest({ score: 5000, wave: 2 }, { score: 5000, wave: 1, time: 1, kills: 1, maxMultiplier: 1 }).isNew).toBe(false);
  });
  it("時間と得点の書き方", () => {
    expect(formatTime(125.4)).toBe("2:05");
    expect(formatTime(0)).toBe("0:00");
    expect(formatScore(1234567)).toBe("1,234,567");
    expect(formatScore(12)).toBe("12");
  });
});

describe("線の字", () => {
  it("英大文字と数字が全部ある", () => {
    for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") expect(GLYPHS[ch]).toBeDefined();
  });
  it("折れ線は x,y の組で、升目の中に収まる", () => {
    for (const [ch, glyph] of Object.entries(GLYPHS)) {
      for (const line of glyph) {
        expect(line.length % 2, ch).toBe(0);
        for (let i = 0; i < line.length; i += 2) {
          expect(line[i]).toBeGreaterThanOrEqual(-0.5);
          expect(line[i]).toBeLessThanOrEqual(4.5);
          expect(line[i + 1]).toBeGreaterThanOrEqual(-0.5);
          expect(line[i + 1]).toBeLessThanOrEqual(7);
        }
      }
    }
  });
  it("小文字は大文字で描き、知らない文字は空白", () => {
    expect(glyphFor("a")).toBe(GLYPHS.A);
    expect(glyphFor("あ")).toEqual([]);
  });
  it("文字列の幅", () => {
    expect(textUnits("AB", 2)).toBe(10);
    expect(textUnits("", 2)).toBe(0);
  });
});
