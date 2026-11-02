/** 2つの円が重なっているか（境目で触れているだけは重なりに含めない） */
export function circlesOverlap(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy < r * r;
}

/** a から b へ t の割合だけ進む */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** フレームの長さに左右されない「追いかけ」の割合。rate が大きいほど速く追いつく */
export function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/** 角度を -π〜π に収める */
export function wrapAngle(a: number): number {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/** 角度 from を to へ、最大 maxStep だけ回す（近い向きで） */
export function turnToward(from: number, to: number, maxStep: number): number {
  const d = wrapAngle(to - from);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}

/** スティックの遊び（デッドゾーン）を取り除き、長さを 0〜1 に揃える */
export function applyDeadzone(x: number, y: number, deadzone: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len <= deadzone) return { x: 0, y: 0 };
  const scaled = Math.min(1, (len - deadzone) / (1 - deadzone));
  return { x: (x / len) * scaled, y: (y / len) * scaled };
}
