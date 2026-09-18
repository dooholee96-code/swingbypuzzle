// 각도 변환·양자화. docs/PLAN.md §4, §5.9
//
// θ 는 두 가지를 겸한다: 우주선이 발사대 행성 표면에 서 있는 **위치**이자,
// 그 자리에서 이륙하는 **방향**이다.

import { ARC } from './constants.js';
import type { Level } from './types.js';

/** 0.5° 단위 반올림. 같은 각도를 다시 재현할 수 있어야 퍼즐이 된다 (§4). */
export function quantize(deg: number): number {
  return Math.round(deg * 2) / 2;
}

/** 표시 각도 (§4). 0° = 위쪽, 시계 방향 증가, 0~360°. */
export function toUi(worldDeg: number): number {
  return ((worldDeg + 90) % 360 + 360) % 360;
}

/** [-180, 180) 로 정규화. */
export function norm(deg: number): number {
  return ((deg + 180) % 360 + 360) % 360 - 180;
}

/** 돔 중심 방향 = 출발점 → 목적지 (§5.9). */
export function padAngle(L: Level): number {
  return Math.atan2(L.goal.y - L.start.y, L.goal.x - L.start.x) * 180 / Math.PI;
}

/** θ 가 걸을 수 있는 범위 안인가. 검증기 규칙 9 가 이걸 본다 (§8.5). */
export function inArc(L: Level, theta: number): boolean {
  return Math.abs(norm(theta - padAngle(L))) <= ARC;
}

/** 걸을 수 있는 범위로 자른다. */
export function clampArc(L: Level, theta: number): number {
  const c = padAngle(L);
  return c + Math.max(-ARC, Math.min(ARC, norm(theta - c)));
}
