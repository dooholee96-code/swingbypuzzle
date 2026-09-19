// 전면 광고 규칙. docs/PLAN.md §14.6
//
// 조건 1~6 각각의 **경계값**을 본다 — 179초 거부, 180초 허용 같은 것.
// 이 규칙이 느슨해지면 플레이어가 광고에 치이므로 숫자를 눈으로 지킨다.

import { describe, expect, it } from 'vitest';

import { AD_POLICY } from '../src/monetization/ad-policy-config.js';
import {
  type AdState, type InterstitialInput,
  afterClear, afterInterstitial, afterRewarded, shouldShowInterstitial,
} from '../src/monetization/ad-policy.js';

/** 여섯 조건을 모두 만족하는 기준 입력. 테스트마다 한 가지만 어긋뜨린다. */
const ok = (): InterstitialInput => ({
  chapter: 2,
  showsIntro: false,
  now: 1000,
  ads: { clearsSinceInterstitial: 3, lastInterstitialAt: 800, lastRewardedAt: null },
});

describe('기준 입력', () => {
  it('여섯 조건을 다 만족하면 보여준다', () => {
    expect(shouldShowInterstitial(ok())).toEqual({ show: true });
  });
});

describe('조건 1 — 1장은 광고 없음', () => {
  it('1장이면 거부', () => {
    expect(shouldShowInterstitial({ ...ok(), chapter: 1 }))
      .toEqual({ show: false, veto: 'chapter' });
  });
  it('2장이면 통과', () => {
    expect(shouldShowInterstitial({ ...ok(), chapter: 2 }).show).toBe(true);
  });
  it('5장도 통과', () => {
    expect(shouldShowInterstitial({ ...ok(), chapter: 5 }).show).toBe(true);
  });
});

describe('조건 2 — 마지막 광고 이후 클리어 3회', () => {
  const withClears = (n: number): InterstitialInput => ({
    ...ok(), ads: { ...ok().ads, clearsSinceInterstitial: n },
  });
  it('2회면 거부', () => {
    expect(shouldShowInterstitial(withClears(2))).toEqual({ show: false, veto: 'clears' });
  });
  it('3회면 허용', () => {
    expect(shouldShowInterstitial(withClears(3)).show).toBe(true);
  });
  it('설정값과 같은 수를 쓴다', () => {
    expect(AD_POLICY.clearsBetween).toBe(3);
  });
});

describe('조건 3 — 마지막 광고 이후 180초', () => {
  const at = (now: number): InterstitialInput => ({ ...ok(), now });
  it('179초면 거부', () => {
    expect(shouldShowInterstitial(at(800 + 179)))
      .toEqual({ show: false, veto: 'since-interstitial' });
  });
  it('180초면 허용', () => {
    expect(shouldShowInterstitial(at(800 + 180)).show).toBe(true);
  });
  it('전면 광고를 본 적이 없으면 이 조건은 건너뛴다', () => {
    const i: InterstitialInput = {
      ...ok(), now: 200,
      ads: { clearsSinceInterstitial: 3, lastInterstitialAt: null, lastRewardedAt: null },
    };
    expect(shouldShowInterstitial(i).show).toBe(true);
  });
});

describe('조건 4 — 앱 실행 후 120초', () => {
  const fresh = (now: number): InterstitialInput => ({
    ...ok(), now,
    ads: { clearsSinceInterstitial: 3, lastInterstitialAt: null, lastRewardedAt: null },
  });
  it('119초면 거부', () => {
    expect(shouldShowInterstitial(fresh(119)))
      .toEqual({ show: false, veto: 'since-start' });
  });
  it('120초면 허용', () => {
    expect(shouldShowInterstitial(fresh(120)).show).toBe(true);
  });
});

describe('조건 5 — 보상형 광고 후 90초', () => {
  const rewardedAt = (t: number): InterstitialInput => ({
    ...ok(), ads: { ...ok().ads, lastRewardedAt: t },
  });
  it('89초 전에 봤으면 거부', () => {
    expect(shouldShowInterstitial(rewardedAt(1000 - 89)))
      .toEqual({ show: false, veto: 'after-rewarded' });
  });
  it('90초 전이면 허용', () => {
    expect(shouldShowInterstitial(rewardedAt(1000 - 90)).show).toBe(true);
  });
});

describe('조건 6 — 소개 카드가 뜨는 단계', () => {
  it('소개 카드가 뜨면 거부', () => {
    expect(shouldShowInterstitial({ ...ok(), showsIntro: true }))
      .toEqual({ show: false, veto: 'intro' });
  });
});

describe('상태 갱신', () => {
  const base: AdState = {
    clearsSinceInterstitial: 2, lastInterstitialAt: 100, lastRewardedAt: null,
  };

  it('전면 광고를 보여주면 클리어 수가 0 이 되고 시각이 기록된다', () => {
    expect(afterInterstitial(base, 500))
      .toEqual({ clearsSinceInterstitial: 0, lastInterstitialAt: 500, lastRewardedAt: null });
  });

  it('보상형 광고는 클리어 수를 건드리지 않는다', () => {
    const a = afterRewarded(base, 500);
    expect(a.lastRewardedAt).toBe(500);
    expect(a.clearsSinceInterstitial).toBe(2);
  });

  it('클리어하면 하나 오른다', () => {
    expect(afterClear(base).clearsSinceInterstitial).toBe(3);
  });

  it('보상형 직후에는 전면 광고가 막힌다', () => {
    const ads = afterRewarded({ ...base, clearsSinceInterstitial: 5 }, 1000);
    const d = shouldShowInterstitial({ chapter: 3, showsIntro: false, now: 1010, ads });
    expect(d).toEqual({ show: false, veto: 'after-rewarded' });
  });
});
