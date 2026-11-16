import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, clampVolume, parseSettings, serializeSettings, stepVolume, volumeGain } from "./settings";

describe("音量の設定", () => {
  it("段階を 0〜10 の整数にそろえる", () => {
    expect(clampVolume(-3)).toBe(0);
    expect(clampVolume(99)).toBe(10);
    expect(clampVolume(4.6)).toBe(5);
    expect(clampVolume(NaN)).toBeNull();
    expect(clampVolume("5")).toBeNull();
  });

  it("増減は 0 と 10 で止まる", () => {
    expect(stepVolume(5, 1)).toBe(6);
    expect(stepVolume(5, -1)).toBe(4);
    expect(stepVolume(10, 1)).toBe(10);
    expect(stepVolume(0, -1)).toBe(0);
  });

  it("段階 10 は今の音量、0 は無音", () => {
    expect(volumeGain(10, 0.9)).toBeCloseTo(0.9);
    expect(volumeGain(10, 0.42)).toBeCloseTo(0.42);
    expect(volumeGain(5, 0.42)).toBeCloseTo(0.21);
    expect(volumeGain(0, 0.9)).toBe(0);
  });

  it("保存して読み直すと同じ", () => {
    const s = { sfx: 3, music: 7 };
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });

  it("壊れた保存は既定値", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("{bad")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("123")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("null")).toEqual(DEFAULT_SETTINGS);
  });

  it("足りない・おかしい項目だけ既定値になり、範囲外は丸める", () => {
    expect(parseSettings('{"sfx":4}')).toEqual({ sfx: 4, music: 10 });
    expect(parseSettings('{"sfx":"x","music":-5}')).toEqual({ sfx: 10, music: 0 });
    expect(parseSettings('{"sfx":50,"music":2}')).toEqual({ sfx: 10, music: 2 });
  });
});
