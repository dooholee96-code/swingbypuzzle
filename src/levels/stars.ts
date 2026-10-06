// 별 3개. docs/PLAN.md §13.2, §13.4
//
// 단계를 깨면 ★ 하나는 기본이고, **이번 방문에서 3회 안에** 깼으면 하나, **힌트 없이**
// 깼으면 하나 더. 별은 단계마다 최고치를 남긴다 — 다시 와서 더 잘 깨면 오른다.
// 힌트는 단계에 영영 남으므로(§14.3) 한 번 받으면 그 단계의 셋째 별은 닫힌다 —
// 힌트의 값이다. 순수 로직이라 테스트할 수 있다.

/** 이 횟수 안에 깨면 둘째 별 */
export const QUICK_ATTEMPTS = 3;
export const MAX_STARS = 3;

export interface StarInput {
  /** 이번 방문에서 발사한 횟수(깬 발사 포함) */
  attempts: number;
  /** 이 단계에 긴 예측선·방향 표시 힌트가 적용돼 있는가 */
  usedHint: boolean;
}

/** [클리어, 3회 안에, 힌트 없이] */
export function starFlags(i: StarInput): [boolean, boolean, boolean] {
  return [true, i.attempts <= QUICK_ATTEMPTS, !i.usedHint];
}

export function starsEarned(i: StarInput): number {
  return starFlags(i).filter(Boolean).length;
}

/** 저장된 단계의 별. 깬 단계는 별 기록이 없어도(옛 저장) 하나로 친다 */
export function starsOf(l: { cleared: boolean; stars?: number }): number {
  return l.cleared ? Math.max(1, l.stars ?? 0) : 0;
}

/** ★★☆ 같은 글자 */
export function starText(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(MAX_STARS - n);
}
