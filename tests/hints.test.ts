// 힌트와 건너뛰기. docs/PLAN.md §14.6
//
// 열림 조건(실패 2회·5회), 첫 힌트 무료 1회, 보상 실패 시 적용 안 됨.

import { describe, expect, it } from 'vitest';

import { HINT_GATE, LONG_PREVIEW } from '../src/monetization/ad-policy-config.js';
import {
  type HintState, applyHint, directionArc, hintStatus, isFree, previewSeconds,
} from '../src/monetization/hints.js';

const fresh = (over: Partial<HintState> = {}): HintState => ({
  fails: 0, got: { preview: false, direction: false }, freeUsed: false, ...over,
});

describe('긴 예측선 — 언제든 열린다', () => {
  it('실패 0회에도 받을 수 있다', () => {
    expect(hintStatus('preview', fresh())).toEqual({ state: 'ready', free: true });
  });
  it('받은 뒤에는 applied', () => {
    const h = applyHint('preview', fresh());
    expect(hintStatus('preview', h)).toEqual({ state: 'applied' });
  });
});

describe('방향 표시 — 2회 실패해야 열린다', () => {
  it('1회 실패면 잠김, 한 번 더 필요', () => {
    expect(hintStatus('direction', fresh({ fails: 1 })))
      .toEqual({ state: 'locked', needFails: 1 });
  });
  it('2회 실패면 열린다', () => {
    expect(hintStatus('direction', fresh({ fails: 2 })))
      .toEqual({ state: 'ready', free: true });
  });
  it('설정값과 같다', () => {
    expect(HINT_GATE.directionFails).toBe(2);
  });
});

describe('건너뛰기 — 5회 실패해야 열리고 무료가 없다', () => {
  it('4회면 잠김', () => {
    expect(hintStatus('skip', fresh({ fails: 4 })))
      .toEqual({ state: 'locked', needFails: 1 });
  });
  it('5회면 열리지만 무료가 아니다', () => {
    expect(hintStatus('skip', fresh({ fails: 5 })))
      .toEqual({ state: 'ready', free: false });
  });
  it('첫 힌트를 안 썼어도 건너뛰기는 유료다 (§14.3)', () => {
    expect(isFree('skip', fresh({ fails: 9 }))).toBe(false);
  });
  it('건너뛰기는 힌트 상태를 바꾸지 않는다', () => {
    const h = fresh({ fails: 9 });
    expect(applyHint('skip', h)).toEqual(h);
  });
});

describe('첫 힌트 무료 — 게임 전체에서 1회', () => {
  it('처음 받는 힌트는 무료', () => {
    expect(isFree('preview', fresh())).toBe(true);
  });

  it('한 번 쓰면 그 뒤는 유료', () => {
    const after = applyHint('preview', fresh({ fails: 2 }));
    expect(after.freeUsed).toBe(true);
    expect(hintStatus('direction', after)).toEqual({ state: 'ready', free: false });
  });

  it('무료는 긴 예측선과 방향 표시 중 먼저 받는 쪽에 쓰인다', () => {
    const after = applyHint('direction', fresh({ fails: 2 }));
    expect(after.freeUsed).toBe(true);
    expect(isFree('preview', after)).toBe(false);
  });

  it('건너뛰기를 먼저 해도 무료가 소모되지 않는다', () => {
    const after = applyHint('skip', fresh({ fails: 5 }));
    expect(after.freeUsed).toBe(false);
    expect(isFree('preview', after)).toBe(true);
  });
});

describe('보상을 못 받으면 적용되지 않는다', () => {
  it('applyHint 를 부르지 않으면 상태가 그대로다', () => {
    // 'dismissed' 나 'failed' 면 호출 측이 applyHint 를 부르지 않는다.
    const h = fresh({ fails: 3 });
    expect(hintStatus('direction', h)).toEqual({ state: 'ready', free: true });
    expect(h.got.direction).toBe(false);
  });
});

describe('효과', () => {
  it('긴 예측선은 2.5초로 늘린다', () => {
    expect(previewSeconds(0.9, true)).toBe(LONG_PREVIEW);
    expect(previewSeconds(0.9, false)).toBe(0.9);
  });

  it('원래가 더 길면 줄이지 않는다', () => {
    expect(previewSeconds(3.0, true)).toBe(3.0);
  });

  it('방향 표시 호는 정답 각도 중심, 주 구간의 80% 폭', () => {
    const [a, b] = directionArc(-66, 10);
    expect(a).toBeCloseTo(-70, 10);
    expect(b).toBeCloseTo(-62, 10);
    expect(b - a).toBeCloseTo(8, 10);
  });
});
