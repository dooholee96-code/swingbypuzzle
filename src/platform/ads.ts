// 광고 제공자 인터페이스. docs/PLAN.md §14.2
//
// 웹(H5 Games Ads)과 앱(AdMob)의 SDK 가 다르므로 이 인터페이스 뒤에 갈아 끼운다.
// **게임 코드는 어느 쪽인지 모른다.**
//
// 광고를 못 불러와도 게임은 완전히 동작해야 한다(§14.1). 그래서 "광고 없음"
// 상태가 오류가 아니라 정상 상태다 — NoAdProvider 가 그 자리다.

export type RewardPlacement = 'hint_preview' | 'hint_direction' | 'skip';
export type RewardResult = 'rewarded' | 'dismissed' | 'failed';

export interface AdProvider {
  /** 동의 절차 포함. 실패해도 던지지 않는다 */
  init(): Promise<void>;
  isRewardedReady(): boolean;
  showRewarded(placement: RewardPlacement): Promise<RewardResult>;
  isInterstitialReady(): boolean;
  showInterstitial(): Promise<'shown' | 'failed'>;
  canOpenPrivacyOptions(): boolean;
  openPrivacyOptions(): Promise<void>;
}

/** 호출 측이 반드시 거는 타임아웃(ms). §14.2 */
export const AD_TIMEOUT = 10_000;

/** 광고가 없는 환경. 승인 전, 차단기, 오프라인, 개발 기본값이 모두 여기로 온다. */
export class NoAdProvider implements AdProvider {
  async init(): Promise<void> { /* 할 일 없음 */ }
  isRewardedReady(): boolean { return false; }
  async showRewarded(): Promise<RewardResult> { return 'failed'; }
  isInterstitialReady(): boolean { return false; }
  async showInterstitial(): Promise<'shown' | 'failed'> { return 'failed'; }
  canOpenPrivacyOptions(): boolean { return false; }
  async openPrivacyOptions(): Promise<void> { /* 할 일 없음 */ }
}

/** 10초를 넘기면 'failed' 로 본다. SDK 가 영영 답하지 않는 경우가 있다. */
export async function withTimeout<T>(p: Promise<T>, fallback: T, ms = AD_TIMEOUT): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<T>((ok) => { timer = setTimeout(() => ok(fallback), ms); });
  try {
    return await Promise.race([p, guard]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
