// 중력과 한 스텝. docs/PLAN.md §5.3, §5.4
//
// 부록 A 의 연산을 순서까지 그대로 옮겼다. 거리는 Math.hypot 이 아니라
// Math.sqrt(dx*dx + dy*dy) 를 쓴다(엔진 간 결과 차이 최소화, §5.4).
//
// 이 파일은 DOM·Canvas·브라우저 API 를 절대 import 하지 않는다 (§0.3).

import { DT, SHIP_R } from './constants.js';
import type { Grav, Level, Outcome, ShipState } from './types.js';

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 공전 행성의 시각 t 에서의 위치 (§5.6). 고정 중력원은 x, y 그대로. */
export function bodyPos(b: Grav, t: number): [number, number] {
  const o = (b as { orbit?: { cx: number; cy: number; rad: number; period: number; phase: number } }).orbit;
  if (!o) return [b.x, b.y];
  const a = o.phase + 2 * Math.PI * t / o.period;
  return [o.cx + o.rad * Math.cos(a), o.cy + o.rad * Math.sin(a)];
}

/** 행성과 블랙홀을 한 배열로. 호출자가 한 번 만들어 재사용하면 빠르다. */
export function gravs(L: Level): Grav[] {
  return ([] as Grav[]).concat(L.planets ?? [], L.holes ?? []);
}

/**
 * 합산 가속도 (§5.3).
 *   r ≥ R 이면 0, r < R 이면 크기 = g × (1 − r/R)², 방향은 중력원 중심 쪽.
 *   r < 1 이면 0 으로 처리(0 나눗셈 방지).
 */
export function accel(G: Grav[], x: number, y: number, t: number): [number, number] {
  let ax = 0, ay = 0;
  for (const b of G) {
    const [bx, by] = bodyPos(b, t);
    const dx = bx - x, dy = by - y, r2 = dx * dx + dy * dy, R2 = b.R * b.R;
    if (r2 >= R2 || r2 < 1) continue;
    const r = Math.sqrt(r2), f = 1 - r / b.R, m = b.g * f * f;
    ax += m * dx / r;
    ay += m * dy / r;
  }
  return [ax, ay];
}

/**
 * 우주선 한 스텝 + 충돌 판정 (총알 제외). §5.4 의 순서를 반드시 지킨다.
 * 반환 '' = 계속.
 */
export function stepShip(L: Level, G: Grav[], s: ShipState, t: number): Outcome | '' {
  const [ax, ay] = accel(G, s.x, s.y, t);
  s.vx += ax * DT; s.vy += ay * DT; s.x += s.vx * DT; s.y += s.vy * DT;
  const tt = t + DT;
  for (const p of L.planets ?? []) {
    const [px, py] = bodyPos(p, tt);
    if (dist(px, py, s.x, s.y) < p.r + SHIP_R) return 'planet';
  }
  for (const h of L.holes ?? []) {
    if (dist(h.x, h.y, s.x, s.y) < h.rH + 2) return 'hole';
  }
  for (const a of L.rocks ?? []) {
    if (dist(a.x, a.y, s.x, s.y) < a.r * 0.85 + SHIP_R) return 'rock';
  }
  for (const u of L.ufos ?? []) {
    if (dist(u.x, u.y, s.x, s.y) < 13 + SHIP_R) return 'ufo';
  }
  if (s.x < SHIP_R || s.y < SHIP_R || s.x > L.w - SHIP_R || s.y > L.h - SHIP_R) return 'wall';
  if (dist(L.goal.x, L.goal.y, s.x, s.y) < L.goal.r) return 'win';
  return '';
}
