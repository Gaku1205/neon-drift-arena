/** キーの割り当て（操作→キー）。キーは KeyboardEvent.code の文字列で持つ */
export const ACTIONS = ["moveUp", "moveDown", "moveLeft", "moveRight", "aimUp", "aimDown", "aimLeft", "aimRight", "dash", "overdrive"] as const;
export type Action = (typeof ACTIONS)[number];
export type KeyMap = Record<Action, string>;

export const DEFAULT_KEYMAP: KeyMap = {
  moveUp: "KeyW",
  moveDown: "KeyS",
  moveLeft: "KeyA",
  moveRight: "KeyD",
  aimUp: "ArrowUp",
  aimDown: "ArrowDown",
  aimLeft: "ArrowLeft",
  aimRight: "ArrowRight",
  dash: "Space",
  overdrive: "KeyE",
};

/** 設定画面に出す名前 */
export const ACTION_LABELS: Record<Action, string> = {
  moveUp: "移動 上",
  moveDown: "移動 下",
  moveLeft: "移動 左",
  moveRight: "移動 右",
  aimUp: "射撃 上",
  aimDown: "射撃 下",
  aimLeft: "射撃 左",
  aimRight: "射撃 右",
  dash: "ドリフト",
  overdrive: "オーバードライブ",
};

/** 割り当てられないキー（メニュー・ミュート・もう一度・一時停止・全画面） */
const RESERVED = new Set(["Enter", "NumpadEnter", "Escape", "Backspace", "KeyM", "KeyR", "KeyP", "F11", "Tab"]);

/** そのキーを、その操作に割り当てられるか。↑↓ は射撃の上・下だけ可（メニューの ↑↓ は別に生きる） */
export function canAssign(action: Action, code: string): boolean {
  if (!code || RESERVED.has(code)) return false;
  if ((code === "ArrowUp" || code === "ArrowDown") && action !== "aimUp" && action !== "aimDown") return false;
  return true;
}

export interface AssignResult {
  ok: boolean;
  map: KeyMap;
  /** 入れ替えた相手の操作（無ければ null） */
  swapped: Action | null;
}

/** action に code を割り当てる。他の操作が使っていれば、その操作と入れ替える。入れ替え先で使えないキーなら受け付けない */
export function assignKey(map: KeyMap, action: Action, code: string): AssignResult {
  const rejected: AssignResult = { ok: false, map, swapped: null };
  if (!canAssign(action, code)) return rejected;
  const old = map[action];
  if (old === code) return { ok: true, map, swapped: null };
  const other = ACTIONS.find((a) => a !== action && map[a] === code) ?? null;
  if (other && !canAssign(other, old)) return rejected;
  const next: KeyMap = { ...map, [action]: code };
  if (other) next[other] = old;
  return { ok: true, map: next, swapped: other };
}

/** 同じキーが2つの操作に付いていないか */
export function hasDuplicate(map: KeyMap): boolean {
  return new Set(ACTIONS.map((a) => map[a])).size !== ACTIONS.length;
}

/** 保存された文字列から読む（壊れていたら既定値。使えないキーの項目は既定値。重複したら全部既定値） */
export function parseKeymap(raw: string | null): KeyMap {
  if (!raw) return DEFAULT_KEYMAP;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return DEFAULT_KEYMAP;
    const o = v as Record<string, unknown>;
    const map = { ...DEFAULT_KEYMAP };
    for (const a of ACTIONS) {
      const c = o[a];
      if (typeof c === "string" && canAssign(a, c)) map[a] = c;
    }
    return hasDuplicate(map) ? DEFAULT_KEYMAP : map;
  } catch {
    return DEFAULT_KEYMAP;
  }
}

export function serializeKeymap(map: KeyMap): string {
  return JSON.stringify(map);
}

const SPECIAL_LABELS: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Space: "Space",
  ShiftLeft: "左Shift",
  ShiftRight: "右Shift",
  ControlLeft: "左Ctrl",
  ControlRight: "右Ctrl",
  AltLeft: "左Alt",
  AltRight: "右Alt",
  CapsLock: "CapsLock",
  Minus: "-",
  Equal: "=",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Backquote: "`",
};

/** キーの表示名（KeyW→W、ArrowUp→↑、Digit1→1、Numpad1→テンキー1） */
export function keyLabel(code: string): string {
  const special = SPECIAL_LABELS[code];
  if (special) return special;
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1] ?? code;
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1] ?? code;
  const pad = /^Numpad(\d)$/.exec(code);
  if (pad) return `テンキー${pad[1]}`;
  return code;
}
