import type { Rng } from "./rng";

/** 敵の種類 */
export type EnemyKind = "drifter" | "darter" | "splitter" | "mini" | "turret" | "guardian";

/** 出し方：闘技場の端から列で／自機を囲む輪で／一か所に固まって */
export type SpawnPattern = "edge" | "ring" | "cluster";

/** 波の中で、何秒目に何をどれだけ出すか */
export interface SpawnEvent {
  at: number;
  kind: EnemyKind;
  count: number;
  pattern: SpawnPattern;
}

/** 敵1体ぶんの「重さ」（波の予算から引く） */
export const ENEMY_COST: Record<EnemyKind, number> = {
  drifter: 1,
  darter: 2,
  splitter: 3,
  mini: 1,
  turret: 4,
  guardian: 0,
};

/** その波から出始める敵（新しい敵の紹介に使う） */
export const UNLOCK_WAVE: Record<Exclude<EnemyKind, "mini" | "guardian">, number> = {
  drifter: 1,
  darter: 2,
  splitter: 3,
  turret: 4,
};

/** 大物（ガーディアン）が出る波か */
export function isGuardianWave(wave: number): boolean {
  return wave > 0 && wave % 5 === 0;
}

/** 波の予算（大物の波は控えめ） */
export function waveBudget(wave: number): number {
  const base = 6 + Math.floor(wave * 3.4 + Math.pow(Math.max(0, wave - 1), 1.5));
  return isGuardianWave(wave) ? Math.floor(base * 0.45) : base;
}

/** 敵の速さの倍率（波が進むほど少しずつ速く） */
export function speedScale(wave: number): number {
  return 1 + Math.min(1.1, Math.max(0, wave - 1) * 0.08);
}

/** 波の長さの上限（秒）。倒し切れなくても次の波が来る */
export function waveTimeLimit(wave: number): number {
  return Math.max(9, 20 - wave * 0.9);
}

/** その波で出られる敵 */
export function kindsFor(wave: number): Exclude<EnemyKind, "mini" | "guardian">[] {
  return (Object.keys(UNLOCK_WAVE) as Exclude<EnemyKind, "mini" | "guardian">[]).filter((k) => UNLOCK_WAVE[k] <= wave);
}

/** その波で初めて出る敵（無ければ null） */
export function newKindAt(wave: number): Exclude<EnemyKind, "mini" | "guardian"> | null {
  const found = (Object.keys(UNLOCK_WAVE) as Exclude<EnemyKind, "mini" | "guardian">[]).find((k) => UNLOCK_WAVE[k] === wave);
  return found ?? null;
}

/** 波の出し方の予定を作る（同じ乱数の種なら同じ予定） */
export function planWave(wave: number, rng: Rng): SpawnEvent[] {
  const events: SpawnEvent[] = [];
  const kinds = kindsFor(wave);
  const fresh = newKindAt(wave);
  let budget = waveBudget(wave);
  let t = 0.4;
  const gap = Math.max(0.5, 2.1 - wave * 0.13);

  if (isGuardianWave(wave)) {
    events.push({ at: 0.6, kind: "guardian", count: 1, pattern: "cluster" });
    t = 4;
  }

  // 新しい敵は、最初に単独で紹介する
  if (fresh && fresh !== "drifter") {
    const count = Math.max(1, Math.min(3, Math.floor(budget / (ENEMY_COST[fresh] * 2))));
    events.push({ at: t, kind: fresh, count, pattern: "cluster" });
    budget -= count * ENEMY_COST[fresh];
    t += gap * 1.6;
  }

  while (budget > 0) {
    const kind = rng.pick(kinds);
    const cost = ENEMY_COST[kind];
    const maxCount = Math.max(1, Math.min(kind === "drifter" ? 8 : kind === "turret" ? 2 : 4, Math.floor(budget / cost)));
    const count = rng.int(Math.max(1, Math.ceil(maxCount / 2)), maxCount);
    const pattern: SpawnPattern = kind === "drifter" && count >= 5 ? (rng.next() < 0.5 ? "ring" : "edge") : rng.pick(["edge", "cluster"] as const);
    events.push({ at: t, kind, count, pattern });
    budget -= count * cost;
    t += gap * rng.range(0.8, 1.25);
  }
  return events;
}
