import { createRng, type Rng } from "../lib/rng";
import { circlesOverlap, damp, wrapAngle } from "../lib/math";
import { chainAfterHit, extendsCrossed, killScore, multiplierFor, weaponLevel } from "../lib/scoring";
import { isGuardianWave, newKindAt, planWave, speedScale, waveTimeLimit, type EnemyKind, type SpawnEvent } from "../lib/waves";
import { Fx } from "./fx";
import { WarpGrid } from "./grid";
import { ARENA_H, ARENA_W, COLOR } from "./palette";

/** world が鳴らす音（音を出さない見本のゲームでは空の物を渡す） */
export interface Sound {
  shoot(): void;
  hit(): void;
  explode(size: number): void;
  pickup(chain: number): void;
  multiplierUp(mult: number): void;
  dash(): void;
  spawn(): void;
  enemyShoot(): void;
  charge(): void;
  playerHit(): void;
  overdrive(): void;
  overdriveReady(): void;
  waveStart(guardian: boolean): void;
  extend(): void;
  gameOver(): void;
}

export const SILENT: Sound = {
  shoot() {},
  hit() {},
  explode() {},
  pickup() {},
  multiplierUp() {},
  dash() {},
  spawn() {},
  enemyShoot() {},
  charge() {},
  playerHit() {},
  overdrive() {},
  overdriveReady() {},
  waveStart() {},
  extend() {},
  gameOver() {},
};

/** 1フレームの操作（入力やオートパイロットから作る） */
export interface Control {
  moveX: number;
  moveY: number;
  /** 撃つ向き（撃たないなら null） */
  aim: number | null;
  dash: boolean;
  overdrive: boolean;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  angle: number;
  fireCd: number;
  dashCd: number;
  dashT: number;
  dashDir: number;
  inv: number;
  trail: { x: number; y: number; a: number; life: number }[];
  thrust: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
}

export interface EnemyBullet extends Bullet {
  color: string;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxHp: number;
  age: number;
  spawnT: number;
  flash: number;
  state: number;
  timer: number;
  angle: number;
  tx: number;
  ty: number;
  base: number;
  color: string;
  dead: boolean;
  odHit: boolean;
}

export interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface Banner {
  title: string;
  sub: string;
  t: number;
  max: number;
  color: string;
}

const ENEMY_INFO: Record<EnemyKind, { r: number; hp: number; base: number; color: string; name: string; desc: string }> = {
  drifter: { r: 17, hp: 2, base: 50, color: COLOR.drifter, name: "ドリフター", desc: "まっすぐ追ってくる" },
  darter: { r: 15, hp: 3, base: 100, color: COLOR.darter, name: "ダーター", desc: "狙いを定めて突進する" },
  splitter: { r: 23, hp: 6, base: 150, color: COLOR.splitter, name: "スプリッター", desc: "壊すと3つに分かれる" },
  mini: { r: 11, hp: 1, base: 40, color: COLOR.splitter, name: "かけら", desc: "" },
  turret: { r: 21, hp: 10, base: 250, color: COLOR.turret, name: "タレット", desc: "弾の輪を撃ってくる" },
  guardian: { r: 62, hp: 220, base: 5000, color: COLOR.guardian, name: "ガーディアン", desc: "大物。弾の渦を撒く" },
};

export function enemyName(kind: EnemyKind): string {
  return ENEMY_INFO[kind].name;
}

const PLAYER_SPEED = 440;
const DASH_SPEED = 1250;
export const DASH_COOLDOWN = 0.9;
const BULLET_SPEED = 1400;
const FIRE_INTERVAL = 0.082;
const START_LIVES = 3;

export type WorldState = "playing" | "dying" | "over";

export class World {
  readonly rng: Rng;
  readonly fx = new Fx();
  readonly grid = new WarpGrid();
  sound: Sound;
  player: Player;
  bullets: Bullet[] = [];
  ebullets: EnemyBullet[] = [];
  enemies: Enemy[] = [];
  shards: Shard[] = [];
  banner: Banner | null = null;
  state: WorldState = "playing";
  wave = 0;
  waveT = 0;
  plan: SpawnEvent[] = [];
  planIdx = 0;
  breather = 0;
  score = 0;
  chain = 0;
  maxMult = 1;
  lives = START_LIVES;
  kills = 0;
  time = 0;
  overdrive = 0;
  /** オーバードライブの衝撃波の半径（-1 なら出ていない） */
  shock = -1;
  shockX = 0;
  shockY = 0;
  hitstop = 0;
  slowmo = 0;
  timeScale = 1;
  dyingT = 0;
  /** 被弾した瞬間の赤い枠の強さ */
  hurtGlow = 0;
  private nextId = 1;
  private odReadyPlayed = false;

  constructor(seed: number, sound: Sound = SILENT) {
    this.rng = createRng(seed);
    this.sound = sound;
    this.player = {
      x: ARENA_W / 2,
      y: ARENA_H / 2 + 120,
      vx: 0,
      vy: 0,
      r: 13,
      angle: -Math.PI / 2,
      fireCd: 0,
      dashCd: 0,
      dashT: 0,
      dashDir: 0,
      inv: 1.2,
      trail: [],
      thrust: 0,
    };
  }

  get multiplier(): number {
    return multiplierFor(this.chain);
  }

  get guardian(): Enemy | undefined {
    return this.enemies.find((e) => e.kind === "guardian" && !e.dead);
  }

  /** 波を n から始める（URL で途中の場面を開く時にも使う） */
  startWave(n: number): void {
    this.wave = n;
    this.waveT = 0;
    this.planIdx = 0;
    this.plan = planWave(n, this.rng);
    const fresh = newKindAt(n);
    const guardian = isGuardianWave(n);
    let sub = "";
    if (guardian) sub = "ガーディアン接近 — 弾の渦に気をつけて";
    else if (fresh && n > 1) sub = `新しい敵：${ENEMY_INFO[fresh].name} — ${ENEMY_INFO[fresh].desc}`;
    else if (n === 1) sub = "群れを撃ち抜け";
    this.banner = { title: `WAVE ${n}`, sub, t: 2.6, max: 2.6, color: guardian ? COLOR.guardian : COLOR.player };
    this.sound.waveStart(guardian);
  }

  update(realDt: number, c: Control): void {
    this.fx.updateReal(realDt);
    this.hurtGlow = Math.max(0, this.hurtGlow - realDt * 1.5);
    if (this.banner) {
      this.banner.t -= realDt;
      if (this.banner.t <= 0) this.banner = null;
    }
    if (this.hitstop > 0) {
      this.hitstop -= realDt;
      return;
    }
    if (this.slowmo > 0) this.slowmo -= realDt;
    const target = this.slowmo > 0 ? 0.28 : 1;
    this.timeScale += (target - this.timeScale) * damp(this.slowmo > 0 ? 30 : 4, realDt);
    const dt = realDt * this.timeScale;

    // 速い弾がすり抜けないよう、細かく刻んで進める
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.step(h, c, i === 0);
    this.grid.update(Math.min(dt, 1 / 30));
    this.fx.update(dt);
  }

  private step(dt: number, c: Control, first: boolean): void {
    if (this.state === "playing") {
      this.time += dt;
      this.updateWaves(dt);
      this.updatePlayer(dt, first ? c : { ...c, dash: false, overdrive: false });
    } else if (this.state === "dying") {
      this.dyingT -= dt;
      if (this.dyingT <= 0) this.state = "over";
    }
    this.updateBullets(dt);
    this.updateEnemies(dt);
    this.updateShards(dt);
    this.updateShock(dt);
    this.collide();
  }

  // ───────── 波 ─────────

  private updateWaves(dt: number): void {
    if (this.wave === 0) {
      this.startWave(1);
      return;
    }
    this.waveT += dt;
    while (this.planIdx < this.plan.length && (this.plan[this.planIdx]?.at ?? 0) <= this.waveT) {
      this.spawnEvent(this.plan[this.planIdx]!);
      this.planIdx++;
    }
    if (this.planIdx < this.plan.length) return;
    const alive = this.enemies.filter((e) => !e.dead).length;
    const lastAt = this.plan[this.plan.length - 1]?.at ?? 0;
    const guardianAlive = this.guardian !== undefined;
    if (alive === 0) {
      this.breather += dt;
      if (this.breather > 1.1) {
        this.breather = 0;
        this.startWave(this.wave + 1);
      }
    } else if (!guardianAlive && this.waveT > Math.max(waveTimeLimit(this.wave), lastAt + 6)) {
      this.startWave(this.wave + 1);
    }
  }

  private spawnEvent(ev: SpawnEvent): void {
    const p = this.player;
    const pts: { x: number; y: number }[] = [];
    const m = 70;
    if (ev.kind === "guardian") {
      pts.push({ x: ARENA_W / 2, y: p.y > ARENA_H / 2 ? 200 : ARENA_H - 200 });
    } else if (ev.pattern === "ring") {
      const rad = 340;
      const a0 = this.rng.range(0, Math.PI * 2);
      for (let i = 0; i < ev.count; i++) {
        const a = a0 + (i / ev.count) * Math.PI * 2;
        pts.push({ x: p.x + Math.cos(a) * rad, y: p.y + Math.sin(a) * rad });
      }
    } else if (ev.pattern === "edge") {
      // 自機から遠い辺
      const sides = [
        { d: p.y, side: 0 },
        { d: ARENA_H - p.y, side: 1 },
        { d: p.x, side: 2 },
        { d: ARENA_W - p.x, side: 3 },
      ].sort((a, b) => b.d - a.d);
      const side = sides[this.rng.int(0, 1)]!.side;
      for (let i = 0; i < ev.count; i++) {
        const t = (i + 1) / (ev.count + 1);
        if (side === 0) pts.push({ x: m + t * (ARENA_W - 2 * m), y: m });
        else if (side === 1) pts.push({ x: m + t * (ARENA_W - 2 * m), y: ARENA_H - m });
        else if (side === 2) pts.push({ x: m, y: m + t * (ARENA_H - 2 * m) });
        else pts.push({ x: ARENA_W - m, y: m + t * (ARENA_H - 2 * m) });
      }
    } else {
      let cx = 0;
      let cy = 0;
      for (let tries = 0; tries < 20; tries++) {
        cx = this.rng.range(m + 60, ARENA_W - m - 60);
        cy = this.rng.range(m + 60, ARENA_H - m - 60);
        if (Math.hypot(cx - p.x, cy - p.y) > 420) break;
      }
      for (let i = 0; i < ev.count; i++) {
        const a = (i / ev.count) * Math.PI * 2;
        const rr = ev.count > 1 ? 50 : 0;
        pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
      }
    }
    for (const pt of pts) {
      let x = Math.max(m, Math.min(ARENA_W - m, pt.x));
      let y = Math.max(m, Math.min(ARENA_H - m, pt.y));
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < 240 && ev.kind !== "guardian") {
        const a = Math.atan2(y - p.y, x - p.x);
        x = Math.max(m, Math.min(ARENA_W - m, p.x + Math.cos(a) * 260));
        y = Math.max(m, Math.min(ARENA_H - m, p.y + Math.sin(a) * 260));
      }
      this.addEnemy(ev.kind, x, y);
    }
    this.sound.spawn();
  }

  addEnemy(kind: EnemyKind, x: number, y: number, spawnT = 0.9): Enemy {
    const info = ENEMY_INFO[kind];
    const hpScale = kind === "guardian" ? 1 + (this.wave / 5 - 1) * 0.6 : 1 + Math.max(0, this.wave - 4) * 0.12;
    const hp = Math.round(info.hp * hpScale);
    const e: Enemy = {
      id: this.nextId++,
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      r: info.r,
      hp,
      maxHp: hp,
      age: 0,
      spawnT: kind === "guardian" ? 1.6 : spawnT,
      flash: 0,
      state: 0,
      timer: kind === "darter" ? this.rng.range(0.6, 1.4) : kind === "turret" ? this.rng.range(1.2, 2) : 2.5,
      angle: this.rng.range(0, Math.PI * 2),
      tx: x,
      ty: y,
      base: info.base,
      color: info.color,
      dead: false,
      odHit: false,
    };
    this.enemies.push(e);
    return e;
  }

  // ───────── 自機 ─────────

  private updatePlayer(dt: number, c: Control): void {
    const p = this.player;
    p.fireCd -= dt;
    p.dashCd -= dt;
    p.inv -= dt;
    const moving = c.moveX !== 0 || c.moveY !== 0;

    if (c.dash && p.dashCd <= 0) {
      const dir = moving ? Math.atan2(c.moveY, c.moveX) : p.angle;
      p.dashDir = dir;
      p.vx = Math.cos(dir) * DASH_SPEED;
      p.vy = Math.sin(dir) * DASH_SPEED;
      p.dashT = 0.17;
      p.dashCd = DASH_COOLDOWN;
      p.inv = Math.max(p.inv, 0.2);
      this.sound.dash();
      this.grid.impulse(p.x, p.y, 160, -260);
      this.fx.ring(p.x, p.y, 10, 60, 0.25, COLOR.player, 3);
      for (let i = 0; i < 14; i++) this.fx.spark(p.x, p.y, dir + Math.PI + this.rng.range(-0.6, 0.6), this.rng.range(200, 600), 0.3, COLOR.player, 2);
    }

    if (p.dashT > 0) {
      p.dashT -= dt;
      p.trail.push({ x: p.x, y: p.y, a: p.angle, life: 0.28 });
    } else {
      const rate = moving ? 16 : 4.2; // 離すと少し滑る（ドリフト）
      const k = damp(rate, dt);
      p.vx += (c.moveX * PLAYER_SPEED - p.vx) * k;
      p.vy += (c.moveY * PLAYER_SPEED - p.vy) * k;
    }
    p.thrust += ((moving ? 1 : 0) - p.thrust) * damp(10, dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const m = p.r + 4;
    if (p.x < m) {
      p.x = m;
      p.vx = Math.abs(p.vx) * 0.3;
    }
    if (p.x > ARENA_W - m) {
      p.x = ARENA_W - m;
      p.vx = -Math.abs(p.vx) * 0.3;
    }
    if (p.y < m) {
      p.y = m;
      p.vy = Math.abs(p.vy) * 0.3;
    }
    if (p.y > ARENA_H - m) {
      p.y = ARENA_H - m;
      p.vy = -Math.abs(p.vy) * 0.3;
    }

    // 向き：撃っていれば狙う向き、でなければ進む向き
    const want = c.aim ?? (moving ? Math.atan2(c.moveY, c.moveX) : p.angle);
    p.angle += wrapAngle(want - p.angle) * damp(c.aim !== null ? 40 : 12, dt);

    for (const t of p.trail) t.life -= dt;
    p.trail = p.trail.filter((t) => t.life > 0);

    // エンジンの火
    if (moving && this.rng.next() < 0.6) {
      const back = Math.atan2(-p.vy, -p.vx);
      this.fx.spark(p.x + Math.cos(back) * 12, p.y + Math.sin(back) * 12, back + this.rng.range(-0.35, 0.35), this.rng.range(60, 180), 0.22, COLOR.player, 1.6);
    }

    if (c.aim !== null && p.fireCd <= 0) this.fire(c.aim);

    if (this.overdrive >= 1 && !this.odReadyPlayed) {
      this.odReadyPlayed = true;
      this.sound.overdriveReady();
      this.fx.popup(p.x, p.y - 30, "OVERDRIVE", COLOR.player, 16);
    }
    if (c.overdrive && this.overdrive >= 1) this.triggerOverdrive();
  }

  private fire(aim: number): void {
    const p = this.player;
    p.fireCd = FIRE_INTERVAL;
    const lvl = weaponLevel(this.multiplier);
    const cos = Math.cos(aim);
    const sin = Math.sin(aim);
    const nx = -sin;
    const ny = cos;
    const spawn = (offset: number, angle: number): void => {
      const bx = p.x + cos * 16 + nx * offset;
      const by = p.y + sin * 16 + ny * offset;
      const jitter = this.rng.range(-0.02, 0.02);
      this.bullets.push({ x: bx, y: by, vx: Math.cos(angle + jitter) * BULLET_SPEED, vy: Math.sin(angle + jitter) * BULLET_SPEED, r: 5, life: 0.85 });
    };
    spawn(-6, aim);
    spawn(6, aim);
    if (lvl >= 2) {
      spawn(0, aim - 0.11);
      spawn(0, aim + 0.11);
    }
    if (lvl >= 3) {
      spawn(0, aim - 0.24);
      spawn(0, aim + 0.24);
    }
    // 反動と銃口の光
    p.vx -= cos * 14;
    p.vy -= sin * 14;
    this.fx.spark(p.x + cos * 20, p.y + sin * 20, aim + this.rng.range(-0.5, 0.5), this.rng.range(100, 300), 0.08, COLOR.playerCore, 2);
    this.sound.shoot();
  }

  private triggerOverdrive(): void {
    const p = this.player;
    this.overdrive = 0;
    this.odReadyPlayed = false;
    this.shock = 0;
    this.shockX = p.x;
    this.shockY = p.y;
    for (const e of this.enemies) e.odHit = false;
    p.inv = Math.max(p.inv, 1.2);
    this.fx.addTrauma(0.75);
    this.fx.doFlash(0.65, COLOR.player);
    this.slowmo = 0.45;
    this.grid.impulse(p.x, p.y, 900, 1400);
    this.fx.ring(p.x, p.y, 20, 600, 0.6, COLOR.player, 10);
    this.fx.ring(p.x, p.y, 10, 380, 0.45, COLOR.white, 6);
    this.sound.overdrive();
    this.banner = { title: "OVERDRIVE", sub: "", t: 1.2, max: 1.2, color: COLOR.player };
  }

  private updateShock(dt: number): void {
    if (this.shock < 0) return;
    this.shock += dt * 2600;
    const r = this.shock;
    for (const b of this.ebullets) {
      if (b.life > 0 && Math.hypot(b.x - this.shockX, b.y - this.shockY) < r) {
        b.life = 0;
        this.fx.spark(b.x, b.y, this.rng.range(0, Math.PI * 2), 120, 0.4, COLOR.shard, 2, "dot");
        this.score += 10 * this.multiplier;
      }
    }
    for (const e of this.enemies) {
      if (e.dead || e.odHit || e.spawnT > 0) continue;
      if (Math.hypot(e.x - this.shockX, e.y - this.shockY) < r) {
        e.odHit = true;
        if (e.kind === "guardian") this.damage(e, Math.ceil(e.maxHp * 0.3), Math.atan2(e.y - this.shockY, e.x - this.shockX));
        else this.kill(e, true);
      }
    }
    if (r > 2200) this.shock = -1;
  }

  // ───────── 弾 ─────────

  private updateBullets(dt: number): void {
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.x < 0 || b.y < 0 || b.x > ARENA_W || b.y > ARENA_H) {
        if (b.life > 0) {
          const a = Math.atan2(-b.vy, -b.vx);
          for (let i = 0; i < 2; i++) this.fx.spark(Math.max(0, Math.min(ARENA_W, b.x)), Math.max(0, Math.min(ARENA_H, b.y)), a + this.rng.range(-0.8, 0.8), this.rng.range(80, 220), 0.18, COLOR.player, 1.5);
        }
        b.life = 0;
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
    for (const b of this.ebullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.x < -20 || b.y < -20 || b.x > ARENA_W + 20 || b.y > ARENA_H + 20) b.life = 0;
    }
    this.ebullets = this.ebullets.filter((b) => b.life > 0);
  }

  private shootAt(x: number, y: number, angle: number, speed: number, color: string = COLOR.enemyBullet): void {
    this.ebullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 7, life: 7, color });
  }

  // ───────── 敵 ─────────

  private updateEnemies(dt: number): void {
    const p = this.player;
    const ss = speedScale(this.wave);
    const alivePlayer = this.state === "playing";
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.age += dt;
      e.flash = Math.max(0, e.flash - dt);
      if (e.spawnT > 0) {
        e.spawnT -= dt;
        if (e.spawnT <= 0) {
          this.fx.ring(e.x, e.y, e.r * 0.5, e.r * 2.6, 0.3, e.color, 3);
          this.grid.impulse(e.x, e.y, 120, 120);
        }
        continue;
      }
      // 自機が居ない間は、外へ散る
      const tx = alivePlayer ? p.x : e.x + (e.x - ARENA_W / 2);
      const ty = alivePlayer ? p.y : e.y + (e.y - ARENA_H / 2);
      const toP = Math.atan2(ty - e.y, tx - e.x);
      switch (e.kind) {
        case "drifter":
        case "mini": {
          const sp = (e.kind === "mini" ? 250 : 165) * ss;
          const wob = Math.sin(e.age * 3.1 + e.id) * 0.5;
          const a = toP + wob;
          const k = damp(e.kind === "mini" ? 4 : 2.4, dt);
          e.vx += (Math.cos(a) * sp - e.vx) * k;
          e.vy += (Math.sin(a) * sp - e.vy) * k;
          e.angle += dt * 2.5;
          break;
        }
        case "darter": {
          e.timer -= dt;
          if (e.state === 0) {
            const k = damp(2, dt);
            e.vx += (Math.cos(toP) * 90 * ss - e.vx) * k;
            e.vy += (Math.sin(toP) * 90 * ss - e.vy) * k;
            e.angle += wrapAngle(toP - e.angle) * damp(6, dt);
            if (e.timer <= 0) {
              e.state = 1;
              e.timer = 0.62;
              this.sound.charge();
            }
          } else if (e.state === 1) {
            e.vx *= Math.exp(-8 * dt);
            e.vy *= Math.exp(-8 * dt);
            if (e.timer > 0.15) e.angle += wrapAngle(toP - e.angle) * damp(14, dt);
            if (e.timer <= 0) {
              e.state = 2;
              e.timer = 0.5;
              e.vx = Math.cos(e.angle) * 780 * ss;
              e.vy = Math.sin(e.angle) * 780 * ss;
              this.fx.ring(e.x, e.y, 6, 40, 0.2, e.color, 3);
            }
          } else {
            if (this.rng.next() < 0.7) this.fx.spark(e.x, e.y, e.angle + Math.PI + this.rng.range(-0.3, 0.3), 200, 0.25, e.color, 2);
            if (e.timer <= 0) {
              e.state = 0;
              e.timer = this.rng.range(1.0, 1.8) / ss;
            }
          }
          break;
        }
        case "splitter": {
          const k = damp(1.5, dt);
          e.vx += (Math.cos(toP) * 95 * ss - e.vx) * k;
          e.vy += (Math.sin(toP) * 95 * ss - e.vy) * k;
          e.angle += dt * 1.2;
          break;
        }
        case "turret": {
          e.timer -= dt;
          const dx = e.tx - e.x;
          const dy = e.ty - e.y;
          if (Math.hypot(dx, dy) < 20 || e.age < dt * 2) {
            for (let tries = 0; tries < 10; tries++) {
              e.tx = this.rng.range(140, ARENA_W - 140);
              e.ty = this.rng.range(140, ARENA_H - 140);
              if (Math.hypot(e.tx - p.x, e.ty - p.y) > 340) break;
            }
          }
          const ma = Math.atan2(e.ty - e.y, e.tx - e.x);
          const k = damp(1.2, dt);
          const sp = e.state === 1 ? 0 : 70;
          e.vx += (Math.cos(ma) * sp - e.vx) * k;
          e.vy += (Math.sin(ma) * sp - e.vy) * k;
          e.angle += dt * (e.state === 1 ? 6 : 0.8);
          if (e.state === 0 && e.timer <= 0) {
            e.state = 1;
            e.timer = 0.55;
          } else if (e.state === 1 && e.timer <= 0) {
            e.state = 0;
            e.timer = Math.max(1.5, 2.8 - this.wave * 0.08);
            if (alivePlayer) {
              const n = Math.min(18, 9 + Math.floor(this.wave / 2));
              const a0 = e.angle;
              for (let i = 0; i < n; i++) this.shootAt(e.x, e.y, a0 + (i / n) * Math.PI * 2, 190 * ss);
              if (this.wave >= 7) for (const off of [-0.18, 0, 0.18]) this.shootAt(e.x, e.y, toP + off, 300 * ss);
              this.sound.enemyShoot();
              this.fx.ring(e.x, e.y, e.r, e.r * 2.4, 0.25, COLOR.enemyBullet, 3);
            }
          }
          break;
        }
        case "guardian":
          this.updateGuardian(e, dt, toP, alivePlayer);
          break;
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      const m = e.r;
      if (e.x < m) {
        e.x = m;
        e.vx = Math.abs(e.vx);
      }
      if (e.x > ARENA_W - m) {
        e.x = ARENA_W - m;
        e.vx = -Math.abs(e.vx);
      }
      if (e.y < m) {
        e.y = m;
        e.vy = Math.abs(e.vy);
      }
      if (e.y > ARENA_H - m) {
        e.y = ARENA_H - m;
        e.vy = -Math.abs(e.vy);
      }
      if (e.kind === "darter" && e.state === 2) e.angle = Math.atan2(e.vy, e.vx);
    }
    // 敵どうしが重なりすぎないよう押し合う
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      if (a.dead || a.spawnT > 0) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        if (b.dead || b.spawnT > 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = (a.r + b.r) * 0.85;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = ((rr - d) / d) * 0.5;
          const wa = a.kind === "guardian" ? 0 : b.kind === "guardian" ? 1 : 0.5;
          a.x -= dx * push * wa;
          a.y -= dy * push * wa;
          b.x += dx * push * (1 - wa);
          b.y += dy * push * (1 - wa);
        }
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  private updateGuardian(e: Enemy, dt: number, toP: number, alivePlayer: boolean): void {
    const cx = ARENA_W / 2;
    const cy = ARENA_H / 2;
    const rage = e.hp < e.maxHp * 0.5 ? 1.35 : 1;
    const tx = cx + Math.cos(e.age * 0.33) * 420;
    const ty = cy + Math.sin(e.age * 0.52) * 200;
    const k = damp(0.9, dt);
    e.vx += ((tx - e.x) * 0.9 - e.vx) * k;
    e.vy += ((ty - e.y) * 0.9 - e.vy) * k;
    e.angle += dt * 0.7 * rage;
    e.timer -= dt;
    if (!alivePlayer) return;
    // 攻撃の順番：0=渦 1=輪 2=呼び出し
    const phase = Math.floor(e.age / 4.5) % 3;
    if (phase === 0) {
      if (e.timer <= 0) {
        e.timer = 0.1 / rage;
        for (const arm of [0, Math.PI * 0.667, Math.PI * 1.333]) this.shootAt(e.x, e.y, e.age * 1.9 + arm, 210, COLOR.enemyBullet);
        if (this.rng.next() < 0.3) this.sound.enemyShoot();
      }
    } else if (phase === 1) {
      if (e.timer <= 0) {
        e.timer = 0.85 / rage;
        const n = 22;
        const a0 = this.rng.range(0, 1);
        for (let i = 0; i < n; i++) this.shootAt(e.x, e.y, a0 + (i / n) * Math.PI * 2, 240, COLOR.guardian);
        for (const off of [-0.1, 0.1]) this.shootAt(e.x, e.y, toP + off, 360, COLOR.enemyBullet);
        this.sound.enemyShoot();
        this.fx.ring(e.x, e.y, e.r, e.r * 2, 0.3, COLOR.guardian, 4);
        this.grid.impulse(e.x, e.y, 260, 300);
      }
    } else if (e.timer <= 0) {
      e.timer = 1.6 / rage;
      for (let i = 0; i < 3; i++) {
        const a = e.angle + (i / 3) * Math.PI * 2;
        this.addEnemy("drifter", e.x + Math.cos(a) * 100, e.y + Math.sin(a) * 100, 0.5);
      }
      this.sound.spawn();
    }
  }

  // ───────── 欠片 ─────────

  private updateShards(dt: number): void {
    const p = this.player;
    const playing = this.state === "playing";
    for (const s of this.shards) {
      s.life -= dt;
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      const d = Math.hypot(dx, dy);
      const magnet = this.shock >= 0 ? 4000 : 190;
      if (playing && d < magnet) {
        const pull = 2600 * (1 - Math.min(1, d / magnet)) + 400;
        s.vx += (dx / (d || 1)) * pull * dt;
        s.vy += (dy / (d || 1)) * pull * dt;
      }
      const drag = Math.exp(-3 * dt);
      s.vx *= drag;
      s.vy *= drag;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.x = Math.max(6, Math.min(ARENA_W - 6, s.x));
      s.y = Math.max(6, Math.min(ARENA_H - 6, s.y));
      if (playing && d < p.r + 16) {
        s.life = 0;
        this.collectShard();
      }
    }
    this.shards = this.shards.filter((s) => s.life > 0);
  }

  private collectShard(): void {
    const before = this.multiplier;
    this.chain++;
    const after = this.multiplier;
    this.addScore(10 * after);
    this.overdrive = Math.min(1, this.overdrive + 0.004);
    this.sound.pickup(this.chain);
    if (after > before) {
      this.maxMult = Math.max(this.maxMult, after);
      this.sound.multiplierUp(after);
      const p = this.player;
      this.fx.popup(p.x, p.y - 34, `×${after}`, COLOR.shard, 22);
      this.fx.ring(p.x, p.y, 14, 90, 0.35, COLOR.shard, 3);
      if (after === 5 || after === 10) {
        this.banner = { title: `POWER ${after === 5 ? 2 : 3}`, sub: "射撃が広がった", t: 1.4, max: 1.4, color: COLOR.shard };
      }
    }
  }

  private addScore(n: number): void {
    const prev = this.score;
    this.score += n;
    const ext = extendsCrossed(prev, this.score);
    if (ext > 0 && this.state === "playing") {
      this.lives = Math.min(6, this.lives + ext);
      this.sound.extend();
      this.banner = { title: "EXTEND", sub: "残機が1つ増えた", t: 1.8, max: 1.8, color: COLOR.shard };
    }
  }

  // ───────── 当たり ─────────

  private collide(): void {
    const p = this.player;
    for (const b of this.bullets) {
      if (b.life <= 0) continue;
      for (const e of this.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        if (circlesOverlap(b.x, b.y, b.r, e.x, e.y, e.r)) {
          b.life = 0;
          this.damage(e, 1, Math.atan2(b.vy, b.vx));
          break;
        }
      }
    }
    if (this.state !== "playing") return;
    const dashing = p.dashT > 0;
    for (const b of this.ebullets) {
      if (b.life <= 0) continue;
      // ドリフト中は、触れた弾を吸い込んで欠片にする
      if (dashing && circlesOverlap(p.x, p.y, p.r + 22, b.x, b.y, b.r)) {
        b.life = 0;
        this.fx.spark(b.x, b.y, this.rng.range(0, Math.PI * 2), 160, 0.3, COLOR.shard, 2, "dot");
        this.collectShard();
        continue;
      }
      if (p.inv <= 0 && circlesOverlap(p.x, p.y, p.r * 0.55, b.x, b.y, b.r * 0.8)) {
        b.life = 0;
        this.hurt();
        return;
      }
    }
    if (p.inv > 0) return;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      if (circlesOverlap(p.x, p.y, p.r * 0.6, e.x, e.y, e.r * 0.8)) {
        this.hurt();
        return;
      }
    }
  }

  private damage(e: Enemy, amount: number, dir: number): void {
    e.hp -= amount;
    e.flash = 0.07;
    const kb = e.kind === "guardian" ? 4 : 55 / (e.r / 16);
    e.vx += Math.cos(dir) * kb;
    e.vy += Math.sin(dir) * kb;
    for (let i = 0; i < 2; i++) this.fx.spark(e.x - Math.cos(dir) * e.r, e.y - Math.sin(dir) * e.r, dir + Math.PI + this.rng.range(-0.7, 0.7), this.rng.range(150, 420), 0.2, i === 0 ? COLOR.white : e.color, 1.8);
    this.sound.hit();
    if (e.hp <= 0) this.kill(e, false);
  }

  private kill(e: Enemy, byShock: boolean): void {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    const mult = this.multiplier;
    const pts = killScore(e.base, mult);
    this.addScore(pts);
    const big = e.kind === "guardian";
    if (!byShock || big) this.fx.popup(e.x, e.y - e.r, String(pts), e.color, big ? 30 : 13);
    const scale = big ? 3 : e.kind === "turret" || e.kind === "splitter" ? 1.4 : e.kind === "mini" ? 0.6 : 1;
    this.fx.explode(e.x, e.y, e.color, scale);
    this.grid.impulse(e.x, e.y, big ? 520 : 150 + 40 * scale, big ? 900 : 260 + 80 * scale);
    this.fx.addTrauma(big ? 0.9 : byShock ? 0.04 : 0.1 + 0.05 * scale);
    if (!byShock) this.hitstop = Math.max(this.hitstop, big ? 0.22 : e.kind === "turret" || e.kind === "splitter" ? 0.045 : 0.022);
    if (big) {
      this.slowmo = 0.9;
      this.fx.doFlash(0.7, COLOR.white);
      for (let i = 0; i < 5; i++) this.fx.ring(e.x, e.y, 20, 200 + i * 120, 0.5 + i * 0.15, i % 2 ? COLOR.guardian : COLOR.shard, 6);
      // 残りの弾を欠片に変える
      for (const b of this.ebullets) {
        b.life = 0;
        this.shards.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 6 });
      }
      this.banner = { title: "GUARDIAN DOWN", sub: `+${pts}`, t: 2.2, max: 2.2, color: COLOR.shard };
    }
    this.sound.explode(scale);
    this.overdrive = Math.min(1, this.overdrive + (big ? 0.5 : 0.022));
    const n = big ? 40 : Math.max(1, Math.round(e.base / 50));
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(60, big ? 520 : 220);
      this.shards.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 7 });
    }
    if (e.kind === "splitter") {
      for (let i = 0; i < 3; i++) {
        const a = e.angle + (i / 3) * Math.PI * 2;
        const m = this.addEnemy("mini", e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14, 0);
        m.vx = Math.cos(a) * 340;
        m.vy = Math.sin(a) * 340;
      }
    }
  }

  private hurt(): void {
    const p = this.player;
    this.lives--;
    this.chain = chainAfterHit(this.chain);
    this.sound.playerHit();
    this.fx.addTrauma(1);
    this.fx.doFlash(0.55, COLOR.danger);
    this.hurtGlow = 1;
    this.hitstop = 0.16;
    this.slowmo = 0.75;
    this.fx.explode(p.x, p.y, COLOR.player, 2);
    this.grid.impulse(p.x, p.y, 480, 1000);
    // 周りの弾を消し、敵を押し返す（理不尽な連続被弾を防ぐ）
    for (const b of this.ebullets) {
      if (Math.hypot(b.x - p.x, b.y - p.y) < 380) {
        b.life = 0;
        this.fx.spark(b.x, b.y, this.rng.range(0, Math.PI * 2), 100, 0.35, COLOR.enemyBullet, 2, "dot");
      }
    }
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < 300 && e.kind !== "guardian") {
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        e.vx += Math.cos(a) * 700;
        e.vy += Math.sin(a) * 700;
      }
    }
    if (this.lives <= 0) {
      this.state = "dying";
      this.dyingT = 1.4;
      this.slowmo = 1.6;
      this.fx.explode(p.x, p.y, COLOR.white, 3);
      for (let i = 0; i < 4; i++) this.fx.ring(p.x, p.y, 10, 260 + i * 160, 0.6 + i * 0.2, COLOR.player, 6);
      this.sound.gameOver();
    } else {
      p.inv = 2.2;
      this.fx.ring(p.x, p.y, 20, 380, 0.5, COLOR.danger, 6);
    }
  }
}
