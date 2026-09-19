// 잠금 해제. docs/PLAN.md §13.2
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isChapterLast, isChapterUnlocked, isUnlocked, nextLevel, resumeLevel,
} from '../src/levels/progress.js';
import { CHAPTERS, allIds } from '../src/levels/chapters.js';
import type { Progress } from '../src/levels/progress.js';
import { Save } from '../src/save/save.js';

const P = (cleared: string[] = [], skipped: string[] = []): Progress => ({
  cleared: (id) => cleared.includes(id),
  skipped: (id) => skipped.includes(id),
});

// 단계 목록은 장이 채워질 때마다 늘어난다. "1-4" 같은 상수를 적으면
// 단계를 더할 때마다 테스트를 고치게 된다 — 규칙을 chapters.ts 에서 끌어온다.
const CH1 = CHAPTERS[0]!.levels;
const CH2 = CHAPTERS[1]!.levels;
const FIRST = CH1[0]!;
const CH1_LAST = CH1[CH1.length - 1]!;

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
    expect(isChapterUnlocked(2, P([FIRST]))).toBe(false);      // 1장이 아직 안 끝났다
    expect(isChapterUnlocked(2, P([...CH1]))).toBe(true);
  });
});

describe('다음 단계와 이어 하기', () => {
  it('마지막 단계 다음은 없다', () => {
    const ids = allIds();
    expect(nextLevel(ids[ids.length - 1]!, P(ids))).toBeNull();
  });

  it('다음 단계는 열려 있는 것만 준다', () => {
    expect(nextLevel(FIRST, P([FIRST]))).toBe(CH1[1]!);
    expect(nextLevel(FIRST, P())).toBeNull();                  // 다음 단계가 아직 잠김
  });

  it('이어 하기는 아직 안 깬 첫 단계', () => {
    expect(resumeLevel(P())).toBe(FIRST);
    expect(resumeLevel(P([FIRST]))).toBe(CH1[1]!);
  });

  it('전부 깼으면 마지막 단계로', () => {
    const ids = allIds();
    expect(resumeLevel(P(ids))).toBe(ids[ids.length - 1]);
  });

  it('장의 마지막 단계를 알아본다 — §13.4 의 "다음 장"', () => {
    expect(isChapterLast(CH1_LAST)).toBe(true);
    expect(isChapterLast(FIRST)).toBe(false);
    expect(isChapterLast(CH2[CH2.length - 1]!)).toBe(true);
    expect(isChapterLast(CH2[0]!)).toBe(false);
  });
});

describe('저장 데이터 합치기 (§15.3)', () => {
  // 테스트는 node 환경이라 localStorage 가 없다. Save 가 쓰는 두 함수만 흉내 낸다.
  const store = new Map<string, string>();
  beforeAll(() => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    };
  });
  afterAll(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

  it('배열은 통째로 갈아 끼운다 — 객체로 바뀌면 안 된다', () => {
    // M9 에서 발견한 버그. seen_intros 가 {0:'planet'} 이 되어 .includes 가 사라졌다.
    const s = new Save();
    localStorage.setItem('swingby.save.v1', JSON.stringify({
      version: 1, levels: {}, seen_intros: ['planet', 'hole'],
      settings: {}, ads: {},
    }));
    s.load();
    expect(Array.isArray(s.data.seen_intros)).toBe(true);
    expect(s.data.seen_intros).toEqual(['planet', 'hole']);
    expect(s.data.seen_intros.includes('planet')).toBe(true);
  });

  it('없던 키는 기본값이 남는다', () => {
    const s = new Save();
    localStorage.setItem('swingby.save.v1', JSON.stringify({
      version: 1, levels: {}, seen_intros: [], settings: { sfx: false }, ads: {},
    }));
    s.load();
    expect(s.data.settings.sfx).toBe(false);
    expect(s.data.settings.glow).toBe('normal');       // 기본값 유지
    expect(s.data.ads.free_hint_used).toBe(false);
  });
});
