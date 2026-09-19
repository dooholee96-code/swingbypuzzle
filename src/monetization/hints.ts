// 힌트와 건너뛰기. docs/PLAN.md §14.3
//
// 순수 로직이다. DOM 도 광고 SDK 도 모른다 — 무엇이 열려 있고 무엇이 공짜인지만 판단한다.

import { DIRECTION_ARC_RATIO, HINT_GATE, LONG_PREVIEW } from './ad-policy-config.js';

export type HintKind = 'preview' | 'direction' | 'skip';

export interface HintState {
  /** 이 단계에서 실패한 횟수 */
  fails: number;
  /** 이 단계에 이미 적용된 힌트 */
  got: { preview: boolean; direction: boolean };
  /** 게임 전체에서 첫 힌트 무료를 이미 썼는가 */
  freeUsed: boolean;
}

export type HintStatus =
  /** 이미 받았다 */
  | { state: 'applied' }
  /** 광고를 봐야 받는다 */
  | { state: 'ready'; free: boolean }
  /** 아직 열리지 않았다 */
  | { state: 'locked'; needFails: number };

/**
 * 항목 하나의 상태.
 *
 * - 긴 예측선: 언제든 열려 있다
 * - 방향 표시: 이 단계에서 2회 이상 실패해야 열린다
 * - 건너뛰기: 5회 이상 실패해야 열린다. **첫 힌트 무료는 해당 없다**
 */
export function hintStatus(kind: HintKind, h: HintState): HintStatus {
  if (kind === 'skip') {
    const need = HINT_GATE.skipFails - h.fails;
    return need > 0 ? { state: 'locked', needFails: need } : { state: 'ready', free: false };
  }
  if (h.got[kind]) return { state: 'applied' };
  if (kind === 'direction') {
    const need = HINT_GATE.directionFails - h.fails;
    if (need > 0) return { state: 'locked', needFails: need };
  }
  return { state: 'ready', free: !h.freeUsed };
}

/** 지금 이 항목을 광고 없이 받을 수 있는가 (§14.3 첫 힌트 무료). */
export function isFree(kind: HintKind, h: HintState): boolean {
  const s = hintStatus(kind, h);
  return s.state === 'ready' && s.free;
}

/** 힌트를 받은 뒤의 상태. 보상을 못 받았으면 부르지 않는다. */
export function applyHint(kind: HintKind, h: HintState): HintState {
  if (kind === 'skip') return h;
  const free = isFree(kind, h);
  return {
    ...h,
    got: { ...h.got, [kind]: true },
    freeUsed: h.freeUsed || free,
  };
}

/** 긴 예측선을 받았을 때의 예측선 길이(초). 원래가 더 길면 그대로 둔다. */
export function previewSeconds(base: number, got: boolean): number {
  return got ? Math.max(base, LONG_PREVIEW) : base;
}

/**
 * 방향 표시의 호 (§14.3). `meta.solution.angle` 을 중심으로
 * `meta.metrics.main_window` 의 80% 폭. 구간 가장자리는 불안정해서 좁힌다.
 */
export function directionArc(solutionAngle: number, mainWindow: number): [number, number] {
  const half = mainWindow * DIRECTION_ARC_RATIO / 2;
  return [solutionAngle - half, solutionAngle + half];
}
