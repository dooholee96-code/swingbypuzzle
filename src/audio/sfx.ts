// 합성 효과음. docs/PLAN.md §17 M11
//
// 파일을 싣지 않고 WebAudio 로 만든다 — 선화와 같은 태도이고, 설치 크기도
// 늘지 않는다(§18).
//
// **첫 사용자 입력 전에는 AudioContext 를 만들지 않는다.** 브라우저 자동재생
// 정책 때문이고, 만들어도 suspended 로 시작해 경고만 남는다.
// 화면이 숨겨지면 음소거한다(§15.3).

export type Sfx = 'launch' | 'enterField' | 'shoot' | 'explode' | 'arrive' | 'tick' | 'boost' | 'dock'
  | 'shield' | 'levelup' | 'pick' | 'alarm' | 'hurt' | 'bossdown' | 'found' | 'dud';

export class Audio {
  enabled = true;
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  /** 같은 소리가 한 프레임에 겹쳐 터지는 것을 막는다 */
  private lastAt = new Map<Sfx, number>();

  /** 첫 사용자 입력에서 부른다. 두 번째부터는 아무 일도 하지 않는다. */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;                       // 지원하지 않으면 조용히 넘어간다
    try {
      this.ctx = new Ctor();
      this.bus = this.ctx.createGain();
      this.bus.gain.value = 0.22;            // 전체 음량. 선화 게임이라 조용한 편이 어울린다
      this.bus.connect(this.ctx.destination);
    } catch { this.ctx = null; }
  }

  setMuted(on: boolean): void {
    if (!this.bus || !this.ctx) return;
    this.bus.gain.setTargetAtTime(on ? 0 : 0.22, this.ctx.currentTime, 0.02);
  }

  play(kind: Sfx): void {
    if (!this.enabled || !this.ctx || !this.bus) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastAt.get(kind) ?? -1) < 0.04) return;
    this.lastAt.set(kind, now);

    switch (kind) {
      // 발사: 짧은 상승음
      case 'launch': return this.tone(180, 520, 0.18, 'triangle');
      // 중력 범위 진입: 저음 험
      case 'enterField': return this.tone(70, 58, 0.5, 'sine', 0.5);
      // 사격: 짧은 삑
      case 'shoot': return this.tone(880, 660, 0.07, 'square', 0.35);
      // 폭발: 노이즈
      case 'explode': return this.noise(0.45);
      // 도착: 화음
      case 'arrive': return this.chord([523.25, 659.25, 783.99], 0.6);
      // 조준 눈금: 아주 짧은 딸깍
      case 'tick': return this.tone(1200, 1200, 0.02, 'square', 0.15);
      // 분사: 짧게 쉭 올라가는 소리 (§22.1)
      case 'boost': return this.tone(320, 760, 0.12, 'sawtooth', 0.4);
      // 궤도 행성에 붙잡힘: 부드럽게 내려앉는 소리 (§22.4)
      case 'dock': return this.tone(660, 330, 0.22, 'triangle', 0.6);
      // 방패로 튕김 (§22.5): 둔탁하게 울리는 소리
      case 'shield': return this.tone(220, 110, 0.25, 'square', 0.5);
      // 레벨업: 올라가는 세 음
      case 'levelup': return this.chord([523.25, 659.25, 1046.5], 0.35);
      // 카드 고름: 짧은 확인음
      case 'pick': return this.tone(880, 1320, 0.09, 'square', 0.3);
      // 분사가 없을 때 탭 (§22.1): 둔탁한 "안 돼" 소리
      case 'dud': return this.tone(160, 110, 0.12, 'square', 0.35);
      // 메시에 천체 발견 (§22.7): 반짝이는 상행 아르페지오
      case 'found': return this.chord([659.25, 880, 1174.66, 1567.98], 0.4);
      // 보스 경보 (§22.6): 두 음이 오르내리는 사이렌
      case 'alarm': this.tone(440, 660, 0.18, 'square', 0.35);
        return void setTimeout(() => this.tone(660, 440, 0.18, 'square', 0.35), 190);
      // 보스전에서 맞음: 낮게 꺾이는 소리
      case 'hurt': return this.tone(300, 90, 0.3, 'sawtooth', 0.5);
      // 보스 격파: 긴 폭발 뒤 화음
      case 'bossdown': this.noise(0.9);
        return void setTimeout(() => this.chord([392, 523.25, 659.25, 783.99], 0.7), 500);
    }
  }

  private tone(
    from: number, to: number, dur: number,
    type: OscillatorType = 'sine', level = 1,
  ): void {
    const ctx = this.ctx!, t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.bus!);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private chord(freqs: number[], dur: number): void {
    freqs.forEach((f, i) => setTimeout(() => this.tone(f, f, dur, 'sine', 0.5), i * 60));
  }

  private noise(dur: number): void {
    const ctx = this.ctx!, t = ctx.currentTime;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(160, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.bus!);
    src.start(t);
  }
}
