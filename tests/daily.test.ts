// 오늘의 우주 (§22.3)
import { describe, expect, it } from 'vitest';
import { dailySeed, dayKey, shortDate } from '../src/tools-shared/daily.js';
import { makeChunk } from '../src/tools-shared/infinity.js';

describe('오늘의 우주', () => {
  it('날짜 키는 현지 날짜를 두 자리로', () => {
    expect(dayKey(new Date(2026, 9, 6))).toBe('2026-10-06');
    expect(dayKey(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01');
  });

  it('같은 날은 같은 시드, 다른 날은 다른 시드', () => {
    expect(dailySeed('2026-10-06')).toBe(dailySeed('2026-10-06'));
    expect(dailySeed('2026-10-06')).not.toBe(dailySeed('2026-10-07'));
    expect(Number.isInteger(dailySeed('2026-10-06'))).toBe(true);
  });

  it('같은 시드는 같은 우주 — 서버 없이도 모두 같은 판을 탄다', () => {
    const s = dailySeed('2026-10-06');
    expect(makeChunk(s, 1, -2)).toEqual(makeChunk(s, 1, -2));
    expect(makeChunk(s, 1, -2)).not.toEqual(makeChunk(dailySeed('2026-10-07'), 1, -2));
  });

  it('짧은 날짜', () => {
    expect(shortDate('2026-10-06')).toBe('10/6');
  });
});
