/** 得点と倍率（欠片を拾うと倍率が上がり、被弾で半分になる） */

/** 倍率を1つ上げるのに要る欠片の数 */
export const SHARDS_PER_STEP = 8;
/** 倍率の上限 */
export const MAX_MULTIPLIER = 20;
/** 残機が増える得点（この順に） */
export const EXTEND_SCORES: readonly number[] = [60000, 300000, 1000000];

/** 集めた欠片の数（chain）から倍率を出す */
export function multiplierFor(chain: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(Math.max(0, chain) / SHARDS_PER_STEP));
}

/** 次の倍率までの進み具合（0〜1）。上限なら 1 */
export function progressToNext(chain: number): number {
  if (multiplierFor(chain) >= MAX_MULTIPLIER) return 1;
  return (Math.max(0, chain) % SHARDS_PER_STEP) / SHARDS_PER_STEP;
}

/** 被弾した後の chain（半分に。倍率は1段は必ず下がる） */
export function chainAfterHit(chain: number): number {
  const half = Math.floor(chain / 2);
  const mult = multiplierFor(chain);
  if (mult <= 1) return 0;
  const capped = (mult - 2) * SHARDS_PER_STEP + (SHARDS_PER_STEP - 1);
  return Math.max(0, Math.min(half, capped));
}

/** 敵を倒した時の得点 */
export function killScore(base: number, multiplier: number): number {
  return Math.round(base * multiplier);
}

/** 武器の強さ（倍率で上がる）：1〜3 */
export function weaponLevel(multiplier: number): number {
  if (multiplier >= 10) return 3;
  if (multiplier >= 5) return 2;
  return 1;
}

/** prev から next へ得点が増えた時に、越えた残機増加の数 */
export function extendsCrossed(prev: number, next: number): number {
  return EXTEND_SCORES.filter((s) => prev < s && next >= s).length;
}
