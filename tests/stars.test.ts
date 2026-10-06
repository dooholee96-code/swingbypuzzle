// 별 3개 (§13.2, §13.4)
import { describe, expect, it } from 'vitest';
import { QUICK_ATTEMPTS, starFlags, starText, starsEarned, starsOf } from '../src/levels/stars.js';

describe('별', () => {
  it('깨면 하나, 3회 안에 하나, 힌트 없이 하나', () => {
    expect(starFlags({ attempts: 1, usedHint: false })).toEqual([true, true, true]);
    expect(starsEarned({ attempts: QUICK_ATTEMPTS, usedHint: false })).toBe(3);
    expect(starsEarned({ attempts: QUICK_ATTEMPTS + 1, usedHint: false })).toBe(2);
    expect(starsEarned({ attempts: 1, usedHint: true })).toBe(2);
    expect(starsEarned({ attempts: 9, usedHint: true })).toBe(1);
  });

  it('옛 저장(별 기록 없음)의 깬 단계는 별 하나로 친다', () => {
    expect(starsOf({ cleared: true })).toBe(1);
    expect(starsOf({ cleared: true, stars: 0 })).toBe(1);
    expect(starsOf({ cleared: true, stars: 3 })).toBe(3);
    expect(starsOf({ cleared: false, stars: 3 })).toBe(0);
  });

  it('글자', () => {
    expect(starText(0)).toBe('☆☆☆');
    expect(starText(2)).toBe('★★☆');
  });
});
