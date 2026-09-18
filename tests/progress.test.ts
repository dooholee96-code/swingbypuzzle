// 잠금 해제. docs/PLAN.md §13.2
import { describe, expect, it } from 'vitest';
import {
  isChapterLast, isChapterUnlocked, isUnlocked, nextLevel, resumeLevel,
} from '../src/levels/progress.js';
import { allIds } from '../src/levels/chapters.js';
import type { Progress } from '../src/levels/progress.js';

const P = (cleared: string[] = [], skipped: string[] = []): Progress => ({
  cleared: (id) => cleared.includes(id),
  skipped: (id) => skipped.includes(id),
});

describe('단계 잠금 (§13.2)', () => {
  it('첫 단계는 언제나 열려 있다', () => {
    expect(isUnlocked(allIds()[0]!, P())).toBe(true);
  });

  it('이전 단계를 깨야 다음이 열린다', () => {
    const [a, b] = allIds();
    expect(isUnlocked(b!, P())).toBe(false);
    expect(isUnlocked(b!, P([a!]))).toBe(true);
  });

  it('건너뛴 단계도 다음을 연다 — §14.3', () => {
    const [a, b] = allIds();
    expect(isUnlocked(b!, P([], [a!]))).toBe(true);
  });
});

describe('장 잠금 (§13.2)', () => {
  it('1장은 언제나 열려 있다', () => {
    expect(isChapterUnlocked(1, P())).toBe(true);
  });

  it('이전 장을 다 끝내야 다음 장이 열린다', () => {
    expect(isChapterUnlocked(2, P())).toBe(false);
    expect(isChapterUnlocked(2, P(['1-1']))).toBe(false);      // 1장에 1-4 가 남았다
    expect(isChapterUnlocked(2, P(['1-1', '1-4']))).toBe(true);
  });
});

describe('다음 단계와 이어 하기', () => {
  it('마지막 단계 다음은 없다', () => {
    const ids = allIds();
    expect(nextLevel(ids[ids.length - 1]!, P(ids))).toBeNull();
  });

  it('다음 단계는 열려 있는 것만 준다', () => {
    expect(nextLevel('1-1', P(['1-1']))).toBe('1-4');
    expect(nextLevel('1-1', P())).toBeNull();                  // 1-4 가 아직 잠김
  });

  it('이어 하기는 아직 안 깬 첫 단계', () => {
    expect(resumeLevel(P())).toBe('1-1');
    expect(resumeLevel(P(['1-1']))).toBe('1-4');
  });

  it('전부 깼으면 마지막 단계로', () => {
    const ids = allIds();
    expect(resumeLevel(P(ids))).toBe(ids[ids.length - 1]);
  });

  it('장의 마지막 단계를 알아본다 — §13.4 의 "다음 장"', () => {
    expect(isChapterLast('1-4')).toBe(true);
    expect(isChapterLast('1-1')).toBe(false);
    expect(isChapterLast('2-1')).toBe(true);
  });
});
