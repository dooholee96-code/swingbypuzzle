// 전면 광고 빈도 수치. docs/PLAN.md §14.4
//
// 수치를 한곳에 모은다. 여기 말고 다른 곳에 숫자를 적지 않는다.

export const AD_POLICY = {
  /** 1장 전체는 광고 없음. 이 장 번호부터 검토한다 */
  firstChapter: 2,
  /** 마지막 전면 광고 이후 필요한 클리어 횟수 */
  clearsBetween: 3,
  /** 마지막 전면 광고 이후 필요한 시간(초) */
  secondsBetween: 180,
  /** 앱 실행 후 이만큼 지나야 첫 전면 광고를 검토한다(초) */
  secondsAfterStart: 120,
  /** 보상형 광고를 본 직후 이만큼은 전면 광고를 띄우지 않는다(초) */
  quietAfterRewarded: 90,
} as const;

/** 힌트가 열리는 조건 (§14.3) */
export const HINT_GATE = {
  /** 방향 표시: 이 단계에서 이만큼 실패해야 열린다 */
  directionFails: 2,
  /** 건너뛰기: 이만큼 실패해야 열린다 */
  skipFails: 5,
} as const;

/** 긴 예측선이 늘려 주는 길이(초). §14.3 */
export const LONG_PREVIEW = 2.5;

/** 방향 표시 호의 폭 = main_window 의 이 비율. 구간 가장자리는 불안정하다 */
export const DIRECTION_ARC_RATIO = 0.8;
