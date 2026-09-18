// 고정 스텝 누산기. docs/PLAN.md §5.8
//
//   acc += min(frameDelta, 0.1); while (acc ≥ DT && steps < 48) { step(); acc −= DT }
//
// 앱이 백그라운드로 가면 누산기를 0으로 리셋한다.

import { DT } from '../core/constants.js';

export const MAX_STEPS = 48;      // 한 프레임 물리 스텝 상한 (§18)
export const MAX_DELTA = 0.1;

export class Clock {
  private acc = 0;

  reset(): void { this.acc = 0; }

  /** 이번 프레임에 돌려야 할 스텝 수. */
  steps(delta: number): number {
    this.acc += Math.min(delta, MAX_DELTA);
    let n = 0;
    while (this.acc >= DT && n < MAX_STEPS) { this.acc -= DT; n++; }
    return n;
  }
}
