// 물리 기본 성질. docs/PLAN.md §16.5
import { describe, expect, it } from 'vitest';
import { accel, bodyPos } from '../src/core/physics.js';
import type { Planet } from '../src/core/types.js';

const planet = (o: Partial<Planet> = {}): Planet =>
  ({ x: 0, y: 0, r: 24, g: 800, R: 170, sides: 11, ...o });

describe('중력 (§5.3)', () => {
  it('중력 범위 밖에서는 가속도가 0이다', () => {
    // r == R 경계도 "밖"이다 (r ≥ R 이면 0)
    expect(accel([planet()], 170, 0, 0)).toEqual([0, 0]);
    expect(accel([planet()], 300, 0, 0)).toEqual([0, 0]);
  });

  it('반경 절반에서 세기가 g의 4분의 1이다', () => {
    // 크기 = g × (1 − r/R)². r = R/2 이면 g × 0.25.
    const [ax, ay] = accel([planet()], 85, 0, 0);
    expect(Math.sqrt(ax * ax + ay * ay)).toBeCloseTo(800 * 0.25, 9);
    expect(ax).toBeLessThan(0);          // 방향은 중력원 중심 쪽
    expect(ay).toBeCloseTo(0, 12);
  });

  it('여러 중력원의 가속도는 단순 합산이다', () => {
    const a = planet();
    const b = planet({ y: 200 });
    const [ax1, ay1] = accel([a], 50, 100, 0);
    const [ax2, ay2] = accel([b], 50, 100, 0);
    const [ax, ay] = accel([a, b], 50, 100, 0);
    expect(ax).toBeCloseTo(ax1 + ax2, 9);
    expect(ay).toBeCloseTo(ay1 + ay2, 9);
  });
});

describe('공전 행성 (§5.6)', () => {
  const orbiting = planet({
    r: 22, g: 700, R: 110, sides: 7,
    orbit: { cx: 190, cy: 240, rad: 70, period: 8, phase: 0 },
  });

  it('한 주기 뒤 같은 자리로 돌아온다', () => {
    const [x0, y0] = bodyPos(orbiting, 0);
    const [x8, y8] = bodyPos(orbiting, 8);
    expect(x8).toBeCloseTo(x0, 9);
    expect(y8).toBeCloseTo(y0, 9);
  });

  it('고정 행성은 시각과 무관하게 같은 자리다', () => {
    const p = planet({ x: 275, y: 340 });
    expect(bodyPos(p, 0)).toEqual([275, 340]);
    expect(bodyPos(p, 5)).toEqual([275, 340]);
  });
});
