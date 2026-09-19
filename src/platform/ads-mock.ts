// 개발용 가짜 광고. docs/PLAN.md §14.2
//
// 화면에 "테스트 광고" 오버레이를 2초 띄운 뒤 결과를 돌려준다.
// 예외 흐름을 손으로 확인할 수 있게 쿼리로 모드를 바꾼다:
//
//   ?ads=fail      항상 실패
//   ?ads=dismiss   항상 중간에 닫힘 (보상 없음)
//   ?ads=slow      5초 지연 (호출 측 타임아웃 확인용)
//   ?ads=none      광고 없음 — NoAdProvider 처럼 동작
//
// **실제 광고 단위 ID 는 이 파일 어디에도 없다** (§0.8, §19).

import type { AdProvider, RewardPlacement, RewardResult } from './ads.js';

export type MockMode = 'normal' | 'fail' | 'dismiss' | 'slow';

const SHOW_MS = 2000;
const SLOW_MS = 5000;

export function mockModeFromQuery(search: string): MockMode | 'none' {
  const v = new URLSearchParams(search).get('ads');
  if (v === 'fail' || v === 'dismiss' || v === 'slow' || v === 'none') return v;
  return 'normal';
}

export class MockAdProvider implements AdProvider {
  constructor(private readonly mode: MockMode = 'normal') {}

  async init(): Promise<void> { /* 즉시 준비된다 */ }
  isRewardedReady(): boolean { return this.mode !== 'fail'; }
  isInterstitialReady(): boolean { return this.mode !== 'fail'; }
  canOpenPrivacyOptions(): boolean { return true; }

  async openPrivacyOptions(): Promise<void> {
    await overlay('개인정보 옵션 (테스트)', 1200);
  }

  async showRewarded(placement: RewardPlacement): Promise<RewardResult> {
    if (this.mode === 'fail') return 'failed';
    await overlay(`테스트 광고 — ${placement}`, this.mode === 'slow' ? SLOW_MS : SHOW_MS);
    return this.mode === 'dismiss' ? 'dismissed' : 'rewarded';
  }

  async showInterstitial(): Promise<'shown' | 'failed'> {
    if (this.mode === 'fail') return 'failed';
    await overlay('테스트 전면 광고', this.mode === 'slow' ? SLOW_MS : SHOW_MS);
    return 'shown';
  }
}

/** 가짜 광고 판. 실제 광고가 아님을 화면에 분명히 적는다. */
function overlay(label: string, ms: number): Promise<void> {
  return new Promise((done) => {
    const box = document.createElement('div');
    box.id = 'mockad';
    box.innerHTML = `<div><p>${label}</p><p class="dim">실제 광고가 아닙니다</p></div>`;
    document.body.append(box);
    setTimeout(() => { box.remove(); done(); }, ms);
  });
}
