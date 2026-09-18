// 조준 입력 해석. docs/PLAN.md §10
//
// 조준 기준점은 우주선이 아니라 **돔 중심**이다 (§5.9, v4.1).
// 화면 어디를 눌러도 조준되고, 돔에서 멀수록 미세 조정이 쉬워진다.

import { clampArc, quantize } from '../core/angle.js';
import type { Level } from '../core/types.js';

export const DEAD = 26;        // 돔 표면에서 이만큼(CSS px) 안쪽은 취소 영역
export const TAP_MOVE = 8;     // 발사로 치기 위한 최소 이동
export const TAP_HOLD = 250;   // 또는 최소 누름 시간(ms)

export class AimInput {
  active = false;
  far = false;                 // 취소 영역 밖인가 (= 각도가 정해졌는가)
  angle = 0;

  private fromX = 0;
  private fromY = 0;
  private moved = 0;
  private t0 = 0;

  begin(x: number, y: number, angle: number): void {
    this.active = true;
    this.far = false;
    this.angle = angle;
    this.fromX = x; this.fromY = y;
    this.moved = 0;
    this.t0 = performance.now();
  }

  /** cx, cy 는 돔 중심의 화면 좌표. domePx 는 그려지는 표면 반경(화면 px). */
  update(L: Level, x: number, y: number, cx: number, cy: number, domePx: number): boolean {
    if (!this.active) return false;
    this.moved = Math.max(this.moved, Math.hypot(x - this.fromX, y - this.fromY));
    const dx = x - cx, dy = y - cy;
    this.far = Math.hypot(dx, dy) >= DEAD + domePx;
    if (this.far) {
      this.angle = clampArc(L, quantize(Math.atan2(dy, dx) * 180 / Math.PI));
    }
    return this.far;
  }

  /** 손을 뗄 때 발사인가. 툭 친 것은 발사하지 않는다 (§10.2). */
  shouldLaunch(): boolean {
    if (!this.active || !this.far) return false;
    return this.moved >= TAP_MOVE || performance.now() - this.t0 >= TAP_HOLD;
  }

  finish(): void { this.active = false; this.far = false; }
}
