// 장식용 난수. docs/PLAN.md §5.8
//
// 부록 A 와 같은 mulberry32 여야 한다. 값이 달라지면 소행성 모양과 별 배치가
// 참조 구현과 어긋난다.
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/rng.js';

const SEED1 = [
  0.6270739406, 0.0027357212, 0.5274470400,
  0.9810509675, 0.9683778982, 0.2811035030,
];

describe('mulberry32 (§5.8)', () => {
  it('부록 A와 같은 값을 낸다', () => {
    const r = mulberry32(1);
    for (const want of SEED1) expect(r()).toBeCloseTo(want, 9);
  });

  it('같은 시드는 같은 수열을 낸다', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 20; i++) expect(b()).toBe(a());
  });

  it('결과가 0 이상 1 미만이다', () => {
    const r = mulberry32(12345);
    for (let i = 0; i < 500; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
