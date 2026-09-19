// 웹 광고 — Google H5 Games Ads. docs/PLAN.md §14.2
//
// AdSense/Ad Manager 계정과 **게임 도메인 승인**이 필요하다. 승인 전이거나
// 광고 차단기가 있으면 스크립트가 아예 뜨지 않는다 — 그때는 Mock 으로
// 넘어가지 말고 "광고 없음" 으로 동작한다(§14.1). 힌트 버튼은 §13.5 의
// "지금은 광고를 불러올 수 없어요" 를 보이고, 게임은 완전히 동작한다.
//
// 광고가 뜨기 전에 게임 루프와 소리를 멈춘다. 고정 스텝이라 멈췄다 이어도
// 결과가 달라지지 않는다(§5.8).

import { type AdProvider, type RewardPlacement, type RewardResult, withTimeout } from './ads.js';

type BreakType = 'reward' | 'next';
interface AdBreak {
  type: BreakType;
  name?: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  beforeReward?: (show: () => void) => void;
  adDismissed?: () => void;
  adViewed?: () => void;
  adBreakDone?: (info: { breakStatus: string }) => void;
}
type AdBreakFn = (o: AdBreak) => void;
type AdConfigFn = (o: {
  preloadAdBreaks?: 'on' | 'auto';
  sound?: 'on' | 'off';
  onReady?: () => void;
}) => void;

interface AdWindow {
  adsbygoogle?: unknown[];
  adBreak?: AdBreakFn;
  adConfig?: AdConfigFn;
}

const SCRIPT = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
const LOAD_TIMEOUT = 5000;

export interface H5Hooks {
  /** 광고 직전 — 게임 루프와 소리를 멈춘다 */
  pause(): void;
  /** 광고 뒤 — 이어서 진행한다 */
  resume(): void;
}

export class H5AdProvider implements AdProvider {
  private ready = false;

  constructor(
    private readonly client: string,
    private readonly hooks: H5Hooks,
    /** 승인 전 테스트용. 켜면 구글이 가짜 광고를 준다 */
    private readonly test = false,
  ) {}

  private get w(): AdWindow {
    return window as unknown as AdWindow;
  }

  async init(): Promise<void> {
    if (!this.client) return;              // 설정이 없으면 광고 없음으로 둔다
    const loaded = await loadScript(this.client, this.test);
    if (!loaded || typeof this.w.adConfig !== 'function') return;

    await new Promise<void>((done) => {
      const t = setTimeout(done, LOAD_TIMEOUT);
      this.w.adConfig!({
        preloadAdBreaks: 'on',
        sound: 'on',
        onReady: () => { this.ready = true; clearTimeout(t); done(); },
      });
    });
  }

  // H5 는 "지금 재고가 있는가"를 묻는 API 가 없다. 스크립트가 떴고 onReady 가
  // 왔는지로만 판단하고, 실제 가부는 adBreakDone 의 breakStatus 가 알려 준다.
  isRewardedReady(): boolean { return this.ready; }
  isInterstitialReady(): boolean { return this.ready; }
  canOpenPrivacyOptions(): boolean { return false; }
  async openPrivacyOptions(): Promise<void> { /* AdSense 쪽에서 처리한다 */ }

  async showRewarded(placement: RewardPlacement): Promise<RewardResult> {
    if (!this.ready || typeof this.w.adBreak !== 'function') return 'failed';
    this.hooks.pause();
    const result = await withTimeout(new Promise<RewardResult>((done) => {
      let earned = false;
      this.w.adBreak!({
        type: 'reward',
        name: placement,
        beforeReward: (show) => { show(); },
        adViewed: () => { earned = true; },
        adDismissed: () => { earned = false; },
        adBreakDone: (info) => {
          done(earned ? 'rewarded'
            : info.breakStatus === 'dismissed' ? 'dismissed' : 'failed');
        },
      });
    }), 'failed');
    this.hooks.resume();
    return result;
  }

  async showInterstitial(): Promise<'shown' | 'failed'> {
    if (!this.ready || typeof this.w.adBreak !== 'function') return 'failed';
    this.hooks.pause();
    const result = await withTimeout(new Promise<'shown' | 'failed'>((done) => {
      this.w.adBreak!({
        type: 'next',
        name: 'next_level',
        adBreakDone: (info) => done(info.breakStatus === 'viewed' ? 'shown' : 'failed'),
      });
    }), 'failed');
    this.hooks.resume();
    return result;
  }
}

/** 스크립트를 한 번만 넣는다. 차단기가 막으면 false. */
function loadScript(client: string, test: boolean): Promise<boolean> {
  return new Promise((done) => {
    if (document.querySelector(`script[src^="${SCRIPT}"]`)) { done(true); return; }
    const el = document.createElement('script');
    el.async = true;
    el.src = `${SCRIPT}?client=${encodeURIComponent(client)}`;
    el.crossOrigin = 'anonymous';
    el.dataset['adbreakTest'] = test ? 'on' : 'off';
    const t = setTimeout(() => done(false), LOAD_TIMEOUT);
    el.onload = () => { clearTimeout(t); done(true); };
    el.onerror = () => { clearTimeout(t); done(false); };
    document.head.append(el);
  });
}
