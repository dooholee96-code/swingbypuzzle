// 프레임 박자 (src/game/pace.ts). 흔들리는 rAF 시각에서도 물리 스텝 수가 프레임마다 같아야 한다.
import { describe, expect, it } from 'vitest';

import { Clock } from '../src/game/clock.js';
import { FramePacer, snapDelta, snapRate } from '../src/game/pace.js';

/** hz 화면의 rAF 시각. ±jitter ms 로 흔들린다(결정론적인 의사 난수) */
function times(hz: number, n: number, jitter: number, drop: number[] = []): number[] {
  const out: number[] = [];
  let seed = 7;
  for (let i = 0; i < n; i++) {
    if (drop.includes(i)) continue;
    seed = (seed * 1103515245 + 12345) % 2147483648;
    out.push(1000 + i * 1000 / hz + ((seed / 2147483648) * 2 - 1) * jitter);
  }
  return out;
}

function run(ts: number[], fps: number): { steps: number[]; gaps: number[] } {
  const p = new FramePacer(), c = new Clock();
  const steps: number[] = [], gaps: number[] = [];
  let lastDraw = -1;
  for (const t of ts) {
    const dt = p.tick(t, fps);
    if (dt === null) continue;
    if (lastDraw >= 0) gaps.push(t - lastDraw);
    lastDraw = t;
    steps.push(c.steps(dt));
  }
  return { steps: steps.slice(30), gaps: gaps.slice(30) };   // 추정이 자리 잡은 뒤
}

describe('FramePacer', () => {
  it('60Hz·60fps: rAF 가 ±1ms 흔들려도 언제나 4스텝', () => {
    const { steps } = run(times(60, 600, 1), 60);
    expect(new Set(steps)).toEqual(new Set([4]));
  });

  it('60Hz·30fps: 두 프레임에 한 번, 언제나 8스텝', () => {
    const { steps, gaps } = run(times(60, 600, 1), 30);
    expect(new Set(steps)).toEqual(new Set([8]));
    expect(Math.max(...gaps)).toBeLessThan(36);
  });

  it('30fps 에서 프레임 하나가 빠져도 50ms 구멍이 생기지 않는다', () => {
    const { gaps } = run(times(60, 600, 0.5, [101, 233, 377]), 30);
    expect(Math.max(...gaps)).toBeLessThan(36);
  });

  it('120Hz 화면: 30fps 는 30번, 60fps 는 60번 그린다', () => {
    expect(run(times(120, 1200, 0.5), 30).steps.length).toBeGreaterThan(260);
    expect(run(times(120, 1200, 0.5), 30).steps.length).toBeLessThan(310);
    expect(new Set(run(times(120, 1200, 0.5), 60).steps)).toEqual(new Set([4]));
  });

  it('긴 멈춤은 실제 시간을 쓴다', () => {
    expect(snapDelta(16.7, 1000 / 60)).toBeCloseTo(1000 / 60, 9);
    expect(snapDelta(33.0, 1000 / 60)).toBeCloseTo(2000 / 60, 9);
    expect(snapDelta(25, 1000 / 60)).toBe(25);
    expect(snapRate(16.9)).toBeCloseTo(1000 / 60, 9);
    expect(snapRate(8.4)).toBeCloseTo(1000 / 120, 9);
  });
});
