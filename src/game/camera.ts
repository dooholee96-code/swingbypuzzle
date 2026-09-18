// 카메라와 뷰포트. docs/PLAN.md §11
//
// 배율은 400×760 을 기준으로 잡는다. 1~4장은 대부분의 폰에서 한 화면에 들어오고
// 5·6장은 스크롤된다. 맵이 뷰포트보다 작은 축은 가운데 정렬한다.

import type { Level } from '../core/types.js';

export const REF_W = 400;
export const REF_H = 760;
export const HUD_RESERVE = 96;    // 상단 HUD 와 안전 영역 몫 (CSS px)
export const FOLLOW_SPEED = 6;    // §11 추적 감쇠
export const LOOK_AHEAD = 0.35;   // 속도 × 이 값만큼 앞을 본다

export class Camera {
  x = 0;
  y = 0;
  scale = 1;
  viewW = REF_W;
  viewH = REF_H;

  layout(cssW: number, cssH: number): void {
    const availH = Math.max(cssH - HUD_RESERVE, 120);
    this.scale = Math.min(cssW / REF_W, availH / REF_H);
    this.viewW = cssW / this.scale;
    this.viewH = cssH / this.scale;
  }

  /** 맵이 뷰보다 작은 축은 가운데, 큰 축은 [0, 맵 − 뷰] 로 제한 (§11). */
  clamp(L: Level): void {
    this.x = L.w <= this.viewW
      ? (L.w - this.viewW) / 2
      : Math.max(0, Math.min(L.w - this.viewW, this.x));
    this.y = L.h <= this.viewH
      ? (L.h - this.viewH) / 2
      : Math.max(0, Math.min(L.h - this.viewH, this.y));
  }

  centerOn(L: Level, wx: number, wy: number): void {
    this.x = wx - this.viewW / 2;
    this.y = wy - this.viewH / 2;
    this.clamp(L);
  }

  /** 비행 중 추적. 목표점은 우주선 위치 + 속도 × LOOK_AHEAD (§11). */
  follow(L: Level, sx: number, sy: number, vx: number, vy: number, dt: number): void {
    const tx = sx + vx * LOOK_AHEAD - this.viewW / 2;
    const ty = sy + vy * LOOK_AHEAD - this.viewH / 2;
    const k = 1 - Math.exp(-FOLLOW_SPEED * dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.clamp(L);
  }

  /** 맵 전체가 화면에 들어오는가. 미니맵 표시 여부를 정한다 (§12.5). */
  fits(L: Level): boolean {
    return this.viewW >= L.w - 0.5 && this.viewH >= L.h - 0.5;
  }

  toScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x) * this.scale, (wy - this.y) * this.scale];
  }
}
