// 고정 스텝 누산기. docs/PLAN.md §5.8
//
//   acc += min(frameDelta, 0.1); while (acc ≥ DT && steps < 48) { step(); acc −= DT }
//
// 앱이 백그라운드로 가면 누산기를 0으로 리셋한다.

import { DT } from '../core/constants.js';

export const MAX_STEPS = 48;      // 한 프레임 물리 스텝 상한 (§18)
export const MAX_DELTA = 0.1;
const EPS = 1e-9;

export class Clock {
  private acc = 0;

  reset(): void { this.acc = 0; }

  /** 이번 프레임에 돌려야 할 스텝 수. */
  steps(delta: number): number {
    this.acc += Math.min(delta, MAX_DELTA);
    let n = 0;
    // 아주 작은 여유: 1/60 초를 넘기면 부동소수 오차로 4스텝이 3·5스텝으로 갈리지 않게 (pace.ts)
    while (this.acc >= DT - EPS && n < MAX_STEPS) { this.acc -= DT; n++; }
    return n;
  }
}
