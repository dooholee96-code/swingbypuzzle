// 전면 광고 판단. docs/PLAN.md §14.4
//
// **순수 함수다.** 시각을 직접 읽지 않고 호출자가 넘긴 값으로만 판단한다(§2.1).
// 그래야 경계값을 테스트할 수 있다 — 179초 거부, 180초 허용 같은 것.
//
// 전면 광고는 **성공 후 [다음 단계]로 넘어갈 때만** 검토한다. 실패 후 재시도,
// 단계 선택 이동, 앱 복귀, 앱 시작에서는 이 함수를 아예 부르지 않는다.

import { AD_POLICY } from './ad-policy-config.js';

export interface AdState {
  /** 마지막 전면 광고 이후 클리어 횟수 */
  clearsSinceInterstitial: number;
  /** 마지막 전면 광고 시각(초). 아직 없으면 null */
  lastInterstitialAt: number | null;
  /** 마지막 보상형 광고 시각(초). 아직 없으면 null */
  lastRewardedAt: number | null;
  /** 마지막 전면 광고 이후 끝난 인피니티 판 수 (§14.7). 옛 저장에는 없어 0 으로 본다 */
  runsSinceInterstitial?: number;
}

export interface InterstitialInput {
  /** 넘어가는 단계의 장 번호 */
  chapter: number;
  /** 넘어가는 단계에 새 요소 소개 카드가 뜨는가 (§7.4) */
  showsIntro: boolean;
  /** 지금 시각(초). 앱 실행 시점이 0 */
  now: number;
  ads: AdState;
}

/** 거부 이유. 판단을 눈으로 따라갈 수 있게 남긴다 */
export type AdVeto =
  | 'chapter' | 'clears' | 'since-interstitial' | 'since-start' | 'after-rewarded' | 'intro';

export interface AdDecision { show: boolean; veto?: AdVeto }

/**
 * §14.4 의 여섯 조건을 **모두** 만족할 때만 참.
 * 하나라도 걸리면 어느 조건인지 함께 돌려준다.
 */
export function shouldShowInterstitial(i: InterstitialInput): AdDecision {
  const { chapter, showsIntro, now, ads } = i;

  // 1. 1장 전체는 광고 없음
  if (chapter < AD_POLICY.firstChapter) return { show: false, veto: 'chapter' };

  // 2. 마지막 전면 광고 이후 클리어 3회 이상
  if (ads.clearsSinceInterstitial < AD_POLICY.clearsBetween) {
    return { show: false, veto: 'clears' };
  }

  // 3. 마지막 전면 광고 이후 180초 이상
  if (ads.lastInterstitialAt !== null
    && now - ads.lastInterstitialAt < AD_POLICY.secondsBetween) {
    return { show: false, veto: 'since-interstitial' };
  }

  // 4. 앱 실행 후 120초 이상
  if (now < AD_POLICY.secondsAfterStart) return { show: false, veto: 'since-start' };

  // 5. 최근 90초 안에 보상형 광고를 보지 않았다
  if (ads.lastRewardedAt !== null
    && now - ads.lastRewardedAt < AD_POLICY.quietAfterRewarded) {
    return { show: false, veto: 'after-rewarded' };
  }

  // 6. 넘어가는 단계에 새 요소 소개 카드가 뜨지 않는다
  if (showsIntro) return { show: false, veto: 'intro' };

  return { show: true };
}

/** 전면 광고를 보여준 뒤의 상태. 클리어 수와 판 수를 함께 비운다 */
export function afterInterstitial(ads: AdState, now: number): AdState {
  return { ...ads, clearsSinceInterstitial: 0, runsSinceInterstitial: 0, lastInterstitialAt: now };
}

/** 인피니티 한 판이 끝난 뒤의 상태 (§14.7). 이어하기로 이어진 판은 끝날 때 한 번만 센다 */
export function afterInfinityRun(ads: AdState): AdState {
  return { ...ads, runsSinceInterstitial: (ads.runsSinceInterstitial ?? 0) + 1 };
}

export interface InfinityInterstitialInput {
  /** 지금 시각(초). 앱 실행 시점이 0 */
  now: number;
  ads: AdState;
  /** 이번 판에 이어하기를 썼는가. 썼으면(광고를 봤든 광고 없는 빌드든) 띄우지 않는다 */
  revived: boolean;
}

export type InfAdVeto = 'runs' | 'since-interstitial' | 'since-start' | 'after-rewarded' | 'revived';

/**
 * 인피니티 결과 화면에서 [다시] 로 새 판을 열 때만 검토한다 (§14.7).
 * 시간 조건 셋은 스테이지(§14.4)와 같고, 클리어 수 대신 끝난 판 수를 본다.
 */
export function shouldShowInfinityInterstitial(
  i: InfinityInterstitialInput,
): { show: boolean; veto?: InfAdVeto } {
  const { now, ads, revived } = i;
  if ((ads.runsSinceInterstitial ?? 0) < AD_POLICY.infRunsBetween) return { show: false, veto: 'runs' };
  if (ads.lastInterstitialAt !== null
    && now - ads.lastInterstitialAt < AD_POLICY.secondsBetween) {
    return { show: false, veto: 'since-interstitial' };
  }
  if (now < AD_POLICY.secondsAfterStart) return { show: false, veto: 'since-start' };
  if (ads.lastRewardedAt !== null
    && now - ads.lastRewardedAt < AD_POLICY.quietAfterRewarded) {
    return { show: false, veto: 'after-rewarded' };
  }
  if (revived) return { show: false, veto: 'revived' };
  return { show: true };
}

/** 보상형 광고를 본 뒤의 상태. */
export function afterRewarded(ads: AdState, now: number): AdState {
  return { ...ads, lastRewardedAt: now };
}

/** 단계를 클리어한 뒤의 상태. */
export function afterClear(ads: AdState): AdState {
  return { ...ads, clearsSinceInterstitial: ads.clearsSinceInterstitial + 1 };
}

/**
 * 앱을 새로 켰을 때의 상태. **두 시각을 버린다.**
 *
 * 시각은 "앱 실행 후 흐른 초"라서 실행이 바뀌면 비교할 수 없다. 저장된 채로 두면
 * 지난번에 15분 놀다 광고를 본 사람(last = 900)은 이번 실행의 첫 18분 동안
 * 조건 3 에 계속 걸린다 — 지난번에 오래 놀수록 이번에 광고가 늦게 나온다.
 * 실행 직후는 조건 4(120초)가 따로 지킨다.
 *
 * 클리어 수는 횟수라 실행을 넘어도 뜻이 같으므로 남긴다.
 */
export function forNewSession(ads: AdState): AdState {
  return { ...ads, lastInterstitialAt: null, lastRewardedAt: null };
}
