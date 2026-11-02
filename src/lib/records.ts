/** 1回の結果と、いちばん良かった記録 */
export interface RunResult {
  score: number;
  wave: number;
  time: number;
  kills: number;
  maxMultiplier: number;
}

export interface BestRecord {
  score: number;
  wave: number;
}

export const EMPTY_BEST: BestRecord = { score: 0, wave: 0 };

/** 保存された文字列から記録を読む（壊れていたら空の記録） */
export function parseBest(raw: string | null): BestRecord {
  if (!raw) return EMPTY_BEST;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return EMPTY_BEST;
    const o = v as Record<string, unknown>;
    const score = typeof o.score === "number" && Number.isFinite(o.score) && o.score >= 0 ? Math.floor(o.score) : 0;
    const wave = typeof o.wave === "number" && Number.isFinite(o.wave) && o.wave >= 0 ? Math.floor(o.wave) : 0;
    return { score, wave };
  } catch {
    return EMPTY_BEST;
  }
}

/** 結果を記録に混ぜる。新記録なら isNew が true */
export function mergeBest(best: BestRecord, run: RunResult): { best: BestRecord; isNew: boolean } {
  const isNew = run.score > best.score;
  return {
    best: { score: Math.max(best.score, run.score), wave: Math.max(best.wave, run.wave) },
    isNew,
  };
}

/** 秒を「分:秒」に（例 125.4 → "2:05"） */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 得点を3桁区切りに（例 1234567 → "1,234,567"） */
export function formatScore(score: number): string {
  return Math.max(0, Math.floor(score)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
