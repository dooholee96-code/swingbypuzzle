// 프레임 박자 맞추기. 렉처럼 보이던 두 원인을 고친다 (2026-10-13, PLAN §18).
//
// 1) 물리는 240Hz 고정 스텝이라 60Hz 화면이면 한 프레임에 정확히 4스텝이어야 한다. 그런데
//    rAF 시각은 조금씩 흔들려서(16.5·16.9ms …) 누산기가 경계에 걸리면 3·5스텝이 섞였다.
//    헤드리스 측정에서 그려진 프레임의 35% 가 3 이나 5 — 우주선이 프레임마다 ±25% 다른
//    거리를 가서 미세하게 덜컥였다. 프레임 간격을 화면 주사율의 정수배로 맞춰 넘긴다.
// 2) 30fps 는 "rAF 두 번에 한 번" 이었다. 프레임 하나가 빠지면 짝이 어긋나 50ms 구멍이
//    생기고, 120Hz 폰에서는 30 이 아니라 60 으로 돌았다. 지난 그림에서 흐른 시간으로 정한다.
//
// DOM·브라우저 API 를 모른다 — 시각(ms)만 받는다.

/** 흔한 화면 주사율(Hz). 측정값이 이 근처면 이 값으로 본다 */
const RATES = [30, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];

export class FramePacer {
  /** 화면 한 프레임 간격(ms) 추정 */
  private est = 1000 / 60;
  private avg = 1000 / 60;
  private lastRaf = -1;
  private lastDraw = -1;

  /** 지금 화면 주사율로 본 한 프레임 간격(ms) */
  get interval(): number { return this.est; }

  /**
   * 이번 rAF 에서 그릴지 정하고, 그린다면 물리에 넘길 시간(초)을 돌려준다. 건너뛰면 null.
   * targetFps 보다 빠른 화면에서는 그 간격이 찰 때까지 건너뛴다.
   */
  tick(now: number, targetFps: number): number | null {
    if (this.lastRaf >= 0) {
      const raw = now - this.lastRaf;
      // 탭이 숨었다 돌아온 것 같은 큰 간격은 추정에 넣지 않는다
      if (raw > 2 && raw < 50) { this.avg += (raw - this.avg) * 0.05; this.est = snapRate(this.avg); }
    }
    this.lastRaf = now;
    if (this.lastDraw < 0) { this.lastDraw = now; return this.est / 1000; }
    const since = now - this.lastDraw;
    // 목표 간격에서 반 프레임 모자라도 그린다 — 흔들림 때문에 한 프레임 늦게 그리지 않게
    if (since < 1000 / targetFps - this.est / 2) return null;
    this.lastDraw = now;
    return snapDelta(since, this.est) / 1000;
  }

  /** 백그라운드에서 돌아왔을 때. 다음 프레임을 첫 프레임처럼 */
  reset(): void { this.lastRaf = -1; this.lastDraw = -1; }
}

/** 측정한 평균 간격을 가까운 흔한 주사율의 간격으로. 3% 안이 아니면 그대로 */
export function snapRate(ms: number): number {
  for (const hz of RATES) {
    const iv = 1000 / hz;
    if (Math.abs(ms - iv) < iv * 0.03) return iv;
  }
  return ms;
}

/** 흐른 시간을 화면 간격의 정수배로. 정수배에서 25% 넘게 벗어나면 실제 값을 쓴다 */
export function snapDelta(ms: number, interval: number): number {
  const n = Math.max(1, Math.round(ms / interval));
  return Math.abs(ms - n * interval) < interval * 0.25 ? n * interval : ms;
}
