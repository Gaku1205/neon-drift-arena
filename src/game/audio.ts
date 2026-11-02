/**
 * 音は全部 Web Audio で作る（外の音のファイルは使わない）。
 * 効果音と、拍に乗る伴奏（124 BPM・Aマイナー）。
 */

const BPM = 124;
const STEP = 60 / BPM / 4; // 16分音符
// Am - F - C - G（各1小節）の根音（MIDI）
const ROOTS = [45, 41, 48, 43];
const CHORDS: number[][] = [
  [57, 60, 64],
  [53, 57, 60],
  [55, 60, 64],
  [55, 59, 62],
];
const PENTA = [0, 3, 5, 7, 10];

const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private nextStepTime = 0;
  private step = 0;
  private timer: number | null = null;
  private lastShot = 0;
  private lastHit = 0;
  private startTime = 0;
  /** 伴奏の厚さ：0=タイトル、1〜4=遊んでいる（波で上がる） */
  intensity = 0;
  muted = false;

  /** 最初の操作で呼ぶ（ブラウザは操作の前に音を鳴らせない） */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(comp);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = "lowpass";
    this.musicFilter.frequency.value = 18000;
    this.musicFilter.Q.value = 0.8;
    this.musicFilter.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0.42;
    this.music.connect(this.musicFilter);

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.startTime = ctx.currentTime + 0.05;
    this.nextStepTime = this.startTime;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /** 一時停止や被弾で、伴奏をこもらせる（0=こもる 1=開く） */
  setMusicOpen(open: number, time = 0.15): void {
    if (!this.ctx) return;
    const f = 300 + Math.pow(open, 2) * 17700;
    this.musicFilter.frequency.setTargetAtTime(f, this.ctx.currentTime, time);
  }

  /** 拍の位置（0〜1、1拍ごとに回る）。画面の脈打ちに使う */
  beatPhase(): number {
    if (!this.ctx) return (performance.now() / 1000 / (60 / BPM)) % 1;
    const t = this.ctx.currentTime - this.startTime - 0.02;
    return (((t / (60 / BPM)) % 1) + 1) % 1;
  }

  stopAll(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
  }

  // ───────── 伴奏 ─────────

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    while (this.nextStepTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextStepTime);
      this.nextStepTime += STEP;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, t: number): void {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const lvl = this.intensity;
    const root = ROOTS[bar] ?? 45;
    const chord = CHORDS[bar] ?? [57, 60, 64];

    // パッド（いつも）：小節の頭で和音
    if (s === 0) this.pad(chord, t, STEP * 16);

    if (lvl >= 1) {
      if (s % 4 === 0) this.kick(t);
      // ベース：8分で裏を強く
      if (s % 2 === 0) this.bass(midi(root + (s % 4 === 2 ? 12 : 0)), t, s % 4 === 2 ? 0.16 : 0.1);
      this.hat(t, s % 4 === 2 ? 0.05 : 0.022);
    } else if (s % 8 === 0) {
      this.bass(midi(root), t, 0.06);
    }
    if (lvl >= 2 && (s === 4 || s === 12)) this.clap(t);
    if (lvl >= 3) {
      const order = [0, 2, 1, 2, 0, 1, 2, 1];
      const note = (chord[order[s % 8] ?? 0] ?? 60) + (s >= 8 ? 12 : 0);
      this.pluck(midi(note), t, 0.05);
    }
    if (lvl >= 4 && s % 2 === 1) this.hat(t, 0.03, 9000);
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(g, t, 0.9, 0.002, 0.28);
    o.connect(g).connect(this.music);
    o.start(t);
    o.stop(t + 0.32);
  }

  private bass(freq: number, t: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 6;
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.14);
    const g = ctx.createGain();
    this.env(g, t, vol, 0.004, 0.16);
    o.connect(f).connect(g).connect(this.music);
    o.start(t);
    o.stop(t + 0.22);
  }

  private hat(t: number, vol: number, hp = 7000): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hp;
    const g = ctx.createGain();
    this.env(g, t, vol, 0.001, 0.04);
    src.connect(f).connect(g).connect(this.music);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.06);
  }

  private clap(t: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1600;
    f.Q.value = 0.9;
    const g = ctx.createGain();
    this.env(g, t, 0.28, 0.002, 0.16);
    src.connect(f).connect(g).connect(this.music);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.2);
  }

  private pluck(freq: number, t: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(4200, t);
    f.frequency.exponentialRampToValueAtTime(600, t + 0.12);
    const g = ctx.createGain();
    this.env(g, t, vol, 0.003, 0.13);
    o.connect(f).connect(g).connect(this.music);
    o.start(t);
    o.stop(t + 0.18);
  }

  private pad(chord: number[], t: number, dur: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.6);
    g.gain.setValueAtTime(0.05, t + dur - 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1100;
    g.connect(f).connect(this.music);
    for (const n of chord) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = midi(n);
        o.detune.value = det;
        o.connect(g);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  // ───────── 効果音 ─────────

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, vol, 0.003, dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, vol: number, f0: number, f1: number, type: BiquadFilterType = "lowpass", delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = type === "bandpass" ? 2 : 0.7;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, vol, 0.002, dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur + 0.02);
  }

  shoot(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.currentTime - this.lastShot < 0.06) return;
    this.lastShot = ctx.currentTime;
    const p = 1 + (Math.random() - 0.5) * 0.12;
    this.tone("square", 1250 * p, 420 * p, 0.05, 0.035);
    this.tone("sine", 2400 * p, 900, 0.03, 0.025);
  }

  hit(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.currentTime - this.lastHit < 0.03) return;
    this.lastHit = ctx.currentTime;
    this.tone("triangle", 520 + Math.random() * 80, 180, 0.05, 0.08);
  }

  explode(size: number): void {
    const s = Math.min(3, size);
    this.burst(0.18 + 0.14 * s, 0.22 + 0.08 * s, 5000, 160);
    this.tone("sine", 160 + Math.random() * 30, 38, 0.18 + 0.1 * s, 0.35 + 0.1 * s);
    if (s >= 2) this.tone("sawtooth", 90, 30, 0.6, 0.18);
  }

  pickup(chain: number): void {
    const n = chain % 15;
    const note = 72 + (PENTA[n % 5] ?? 0) + Math.floor(n / 5) * 12;
    this.tone("sine", midi(note), midi(note) * 1.01, 0.09, 0.07);
  }

  multiplierUp(mult: number): void {
    const base = 72 + Math.min(12, mult);
    [0, 4, 7, 12].forEach((d, i) => this.tone("square", midi(base + d), midi(base + d), 0.08, 0.05, i * 0.045));
  }

  dash(): void {
    this.burst(0.22, 0.22, 500, 3200, "bandpass");
    this.tone("sine", 300, 900, 0.12, 0.08);
  }

  spawn(): void {
    this.tone("triangle", 220, 660, 0.25, 0.03);
  }

  enemyShoot(): void {
    this.tone("square", 340, 200, 0.08, 0.03);
  }

  charge(): void {
    this.tone("sawtooth", 180, 520, 0.4, 0.04);
  }

  playerHit(): void {
    this.burst(0.7, 0.5, 2400, 80);
    this.tone("sawtooth", 220, 30, 0.7, 0.35);
    this.tone("square", 110, 40, 0.5, 0.2);
    if (this.ctx) {
      this.setMusicOpen(0.15, 0.02);
      window.setTimeout(() => this.setMusicOpen(1, 0.4), 700);
    }
  }

  overdrive(): void {
    this.burst(1.4, 0.55, 200, 9000, "bandpass");
    this.tone("sawtooth", 60, 30, 1.2, 0.35);
    [0, 7, 12, 19, 24].forEach((d, i) => this.tone("square", midi(57 + d), midi(57 + d), 0.18, 0.06, 0.05 + i * 0.05));
  }

  overdriveReady(): void {
    [0, 5, 12].forEach((d, i) => this.tone("triangle", midi(69 + d), midi(69 + d), 0.14, 0.07, i * 0.07));
  }

  waveStart(guardian: boolean): void {
    const base = guardian ? 45 : 57;
    [0, 3, 7].forEach((d) => this.tone("sawtooth", midi(base + d), midi(base + d), 0.6, 0.05));
    this.tone("sine", 880, 1760, 0.3, 0.04, 0.1);
  }

  extend(): void {
    [0, 4, 7, 12, 16].forEach((d, i) => this.tone("triangle", midi(76 + d), midi(76 + d), 0.12, 0.08, i * 0.06));
  }

  uiMove(): void {
    this.tone("square", 900, 900, 0.03, 0.03);
  }

  uiConfirm(): void {
    this.tone("square", 660, 1320, 0.12, 0.06);
    this.tone("sine", 1320, 2640, 0.18, 0.04, 0.04);
  }

  gameOver(): void {
    [12, 7, 3, 0].forEach((d, i) => this.tone("triangle", midi(57 + d), midi(57 + d) * 0.98, 0.4, 0.09, i * 0.18));
  }
}
