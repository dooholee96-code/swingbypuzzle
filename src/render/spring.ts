// 탄성 (§12.7). 그림에만 쓴다 — 물리·판정은 이 값을 읽지 않는다.
//
// 감쇠 용수철 하나. 0 을 향해 돌아오며 살짝 넘쳤다 돌아온다. kick 으로 속도를 준다.

export class Spring {
  x = 0;
  v = 0;
  /** k: 단단함(클수록 빨리 떤다), c: 감쇠(작을수록 오래 떤다) */
  constructor(private readonly k = 260, private readonly c = 11) {}

  kick(v: number): void { this.v += v; }

  step(dt: number): void {
    if (this.x === 0 && this.v === 0) return;
    // 큰 dt 에서도 터지지 않게 잘게 나눈다 (반암시 오일러)
    const n = Math.min(8, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (-this.k * this.x - this.c * this.v) * h;
      this.x += this.v * h;
    }
    if (Math.abs(this.x) < 1e-3 && Math.abs(this.v) < 1e-2) { this.x = 0; this.v = 0; }
  }

  reset(): void { this.x = 0; this.v = 0; }
}
