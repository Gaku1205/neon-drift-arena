import { describe, expect, it } from "vitest";
import { ACTIONS, DEFAULT_KEYMAP, assignKey, canAssign, hasDuplicate, keyLabel, parseKeymap, serializeKeymap } from "./keymap";

describe("キーの割り当て", () => {
  it("既定値は今のキーで、重複しない", () => {
    expect(DEFAULT_KEYMAP.moveUp).toBe("KeyW");
    expect(DEFAULT_KEYMAP.dash).toBe("Space");
    expect(DEFAULT_KEYMAP.overdrive).toBe("KeyE");
    expect(hasDuplicate(DEFAULT_KEYMAP)).toBe(false);
  });

  it("予約キーは割り当てられない", () => {
    for (const c of ["Enter", "NumpadEnter", "Escape", "Backspace", "KeyM", "KeyR", "KeyP"]) {
      expect(canAssign("dash", c)).toBe(false);
      expect(assignKey(DEFAULT_KEYMAP, "dash", c).ok).toBe(false);
    }
  });

  it("↑↓ は射撃の上下だけ", () => {
    expect(canAssign("aimUp", "ArrowDown")).toBe(true);
    expect(canAssign("moveUp", "ArrowUp")).toBe(false);
    expect(canAssign("dash", "ArrowDown")).toBe(false);
  });

  it("空いているキーに変えられる", () => {
    const r = assignKey(DEFAULT_KEYMAP, "dash", "KeyF");
    expect(r.ok).toBe(true);
    expect(r.swapped).toBeNull();
    expect(r.map.dash).toBe("KeyF");
  });

  it("使われているキーは入れ替える", () => {
    const r = assignKey(DEFAULT_KEYMAP, "dash", "KeyE");
    expect(r.ok).toBe(true);
    expect(r.swapped).toBe("overdrive");
    expect(r.map.dash).toBe("KeyE");
    expect(r.map.overdrive).toBe("Space");
    expect(hasDuplicate(r.map)).toBe(false);
  });

  it("入れ替え先で使えないキーになるなら受け付けない", () => {
    // moveUp(KeyW) に ArrowUp は付けられない／aimUp に KeyW を付けると moveUp が ArrowUp になってしまう
    const r = assignKey(DEFAULT_KEYMAP, "aimUp", "KeyW");
    expect(r.ok).toBe(false);
    expect(r.map).toBe(DEFAULT_KEYMAP);
  });

  it("同じキーのままなら変わらない", () => {
    const r = assignKey(DEFAULT_KEYMAP, "dash", "Space");
    expect(r.ok).toBe(true);
    expect(r.map).toBe(DEFAULT_KEYMAP);
  });

  it("どんな順で割り当てても重複しない", () => {
    let map = DEFAULT_KEYMAP;
    const codes = ["KeyE", "KeyW", "KeyA", "Space", "KeyD", "KeyS", "KeyJ", "KeyK", "ShiftLeft"];
    for (const [i, c] of codes.entries()) {
      const a = ACTIONS[i % ACTIONS.length];
      if (!a) continue;
      map = assignKey(map, a, c).map;
      expect(hasDuplicate(map)).toBe(false);
    }
  });
});

describe("割り当ての保存", () => {
  it("保存して読み直すと同じ", () => {
    const map = assignKey(DEFAULT_KEYMAP, "dash", "KeyF").map;
    expect(parseKeymap(serializeKeymap(map))).toEqual(map);
  });

  it("壊れた保存は既定値", () => {
    expect(parseKeymap(null)).toEqual(DEFAULT_KEYMAP);
    expect(parseKeymap("")).toEqual(DEFAULT_KEYMAP);
    expect(parseKeymap("{bad")).toEqual(DEFAULT_KEYMAP);
    expect(parseKeymap("123")).toEqual(DEFAULT_KEYMAP);
    expect(parseKeymap("null")).toEqual(DEFAULT_KEYMAP);
  });

  it("おかしい項目だけ既定値になる", () => {
    const m = parseKeymap('{"dash":"KeyF","overdrive":"Enter","moveUp":5}');
    expect(m.dash).toBe("KeyF");
    expect(m.overdrive).toBe("KeyE");
    expect(m.moveUp).toBe("KeyW");
  });

  it("重複した保存は全部既定値", () => {
    expect(parseKeymap('{"dash":"KeyE"}')).toEqual(DEFAULT_KEYMAP);
  });
});

describe("キーの表示名", () => {
  it("読みやすい名前にする", () => {
    expect(keyLabel("KeyW")).toBe("W");
    expect(keyLabel("ArrowUp")).toBe("↑");
    expect(keyLabel("Space")).toBe("Space");
    expect(keyLabel("Digit1")).toBe("1");
    expect(keyLabel("Numpad4")).toBe("テンキー4");
    expect(keyLabel("ShiftLeft")).toBe("左Shift");
    expect(keyLabel("F5")).toBe("F5");
  });
});
