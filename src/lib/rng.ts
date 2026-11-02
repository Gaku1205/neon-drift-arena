/** 種から決まる乱数（mulberry32）。同じ種なら同じ並びになる */
export interface Rng {
  /** 0 以上 1 未満 */
  next(): number;
  /** min 以上 max 未満 */
  range(min: number, max: number): number;
  /** min 以上 max 以下の整数 */
  int(min: number, max: number): number;
  /** 配列から1つ選ぶ */
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => {
      if (items.length === 0) throw new Error("空の配列からは選べません");
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
  };
}
