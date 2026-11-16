/** 音量の設定（効果音・伴奏）。0〜10 の段階で持つ */
export interface Settings {
  sfx: number;
  music: number;
}

export const VOLUME_MAX = 10;
export const DEFAULT_SETTINGS: Settings = { sfx: VOLUME_MAX, music: VOLUME_MAX };

/** 段階を 0〜10 の整数にそろえる（数でなければ null） */
export function clampVolume(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(VOLUME_MAX, Math.round(v)));
}

/** 段階を delta だけ増減する（0〜10 で止まる） */
export function stepVolume(level: number, delta: number): number {
  return clampVolume(level + delta) ?? level;
}

/** 段階 n は、既定の音量 base に n/10 を掛けた音量 */
export function volumeGain(level: number, base: number): number {
  return base * ((clampVolume(level) ?? VOLUME_MAX) / VOLUME_MAX);
}

/** 保存された文字列から設定を読む（壊れていたら既定値。足りない項目も既定値） */
export function parseSettings(raw: string | null): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return DEFAULT_SETTINGS;
    const o = v as Record<string, unknown>;
    return {
      sfx: clampVolume(o.sfx) ?? DEFAULT_SETTINGS.sfx,
      music: clampVolume(o.music) ?? DEFAULT_SETTINGS.music,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** 保存する文字列にする */
export function serializeSettings(s: Settings): string {
  return JSON.stringify({ sfx: clampVolume(s.sfx) ?? VOLUME_MAX, music: clampVolume(s.music) ?? VOLUME_MAX });
}
