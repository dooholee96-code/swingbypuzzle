// 8비트 BGM 연주기 (§17 M18). 악보는 tracker.ts, 소리는 WebAudio 로 그 자리에서 합성한다.
//
// 파미컴처럼 네 채널만 쓴다 — 펄스 둘(듀티 12.5·25·50%, PeriodicWave), 삼각파, 노이즈.
// 미리 재는(look-ahead) 스케줄러: 50ms 마다 깨어나 0.2초 앞까지 음을 심는다.
// 효과음과 같은 AudioContext 를 쓰되 버스를 따로 둔다 — 비행 중 효과음이 묻히지 않게 낮게.

import { type Song, type SongName, SONGS, events, noteHz } from './tracker.js';

const LOOKAHEAD = 0.2;      // 초
const TICK_MS = 50;
const LEVEL = 0.5;          // BGM 버스 음량(전체 버스 0.22 아래에서)

export class Bgm {
  enabled = true;
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private waves = new Map<number, PeriodicWave>();
  private noiseBuf: AudioBuffer | null = null;
  private song: Song | null = null;
  private name: SongName | null = null;
  private wanted: SongName | null = null;
  private step = 0;
  private nextAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** sfx.unlock() 뒤에 한 번. 같은 컨텍스트, 따로 버스 */
  attach(ctx: AudioContext, dest: AudioNode): void {
    if (this.ctx) return;
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = this.enabled ? LEVEL : 0;
    this.bus.connect(dest);
    const n = Math.floor(ctx.sampleRate * 0.5);
    this.noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    if (this.wanted) this.play(this.wanted);
  }

  /** 설정의 배경음악 켬·끔. 끄면 바로 조용해지고, 켜면 하던 곡을 잇는다 */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.bus && this.ctx) this.bus.gain.setTargetAtTime(on ? LEVEL : 0, this.ctx.currentTime, 0.05);
    if (!on) this.stop();                       // 조용할 뿐 아니라 스케줄러도 멈춘다
    else if (this.wanted && !this.timer) this.play(this.wanted);
  }

  /** 곡을 고른다. 같은 곡이면 그대로, null 이면 멈춘다. 컨텍스트가 없으면 기억만 한다 */
  play(name: SongName | null): void {
    this.wanted = name;
    if (!this.ctx || !this.bus) return;
    if (name === this.name && this.timer) return;
    this.stop();
    if (!name || !this.enabled) return;
    this.name = name;
    this.song = SONGS[name];
    this.step = 0;
    this.nextAt = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  stop(): void {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    this.name = null;
    this.song = null;
  }

  private tick(): void {
    const ctx = this.ctx!, s = this.song!;
    const stepDur = 60 / s.bpm / 4;
    const n = s.p1.length;
    while (this.nextAt < ctx.currentTime + LOOKAHEAD) {
      const i = this.step % n;
      this.at(s.p1, i, this.nextAt, stepDur, s.duty1, s.decay1, 0.28);
      this.at(s.p2, i, this.nextAt, stepDur, s.duty2, s.decay2, 0.2);
      this.at(s.tri, i, this.nextAt, stepDur, null, 1, 0.5);
      this.drum(s.noise[i]!, this.nextAt);
      this.step++;
      this.nextAt += stepDur;
    }
  }

  /** i 칸에서 시작하는 음이 있으면 심는다 */
  private at(ch: string[], i: number, t: number, stepDur: number, duty: number | null, decay: number, vol: number): void {
    const tok = ch[i]!;
    if (tok === '.' || tok === '-') return;
    let len = 1;
    while (ch[(i + len) % ch.length] === '-' && len < ch.length) len++;
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    if (duty === null) o.type = 'triangle';
    else o.setPeriodicWave(this.wave(duty));
    o.frequency.value = noteHz(tok);
    const g = ctx.createGain();
    const dur = len * stepDur;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(Math.max(vol * decay, 0.001), t + dur - 0.01);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(this.bus!);
    o.start(t); o.stop(t + dur + 0.01);
  }

  private drum(tok: string, t: number): void {
    const ctx = this.ctx!;
    if (tok === 'k') {
      // 킥: 삼각파가 급히 내려간다 (파미컴 관습)
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(g); g.connect(this.bus!); o.start(t); o.stop(t + 0.11);
      return;
    }
    if (tok !== 's' && tok !== 'h') return;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = tok === 'h' ? 'highpass' : 'bandpass';
    f.frequency.value = tok === 'h' ? 7000 : 1800;
    const g = ctx.createGain();
    const dur = tok === 'h' ? 0.03 : 0.11, vol = tok === 'h' ? 0.12 : 0.3;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.bus!);
    src.start(t); src.stop(t + dur + 0.01);
  }

  /** 듀티 사이클 펄스파의 푸리에 계수. 12.5% 가 가장 얇고 쏘는 소리 */
  private wave(duty: number): PeriodicWave {
    let w = this.waves.get(duty);
    if (w) return w;
    const N = 32, real = new Float32Array(N), imag = new Float32Array(N);
    for (let k = 1; k < N; k++) {
      // 듀티 d 인 펄스의 k차 계수: (2/(kπ))·sin(kπd) (cos 항)
      real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    }
    w = this.ctx!.createPeriodicWave(real, imag, { disableNormalization: false });
    this.waves.set(duty, w);
    return w;
  }
}
