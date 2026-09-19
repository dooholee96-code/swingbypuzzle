// 실행 환경 판별과 광고 제공자 선택. docs/PLAN.md §15.3, §14.2
//
// 게임 코드는 "웹인가 앱인가"를 직접 묻지 않는다. 여기가 알려 주는 것만 본다.

import { type AdProvider, NoAdProvider } from './ads.js';
import { MockAdProvider, mockModeFromQuery } from './ads-mock.js';
import { H5AdProvider, type H5Hooks } from './ads-h5.js';

export interface Capabilities {
  /** Capacitor WebView 안인가 */
  isApp: boolean;
  /** navigator.vibrate 가 있는가. iOS 사파리는 없다 */
  canVibrate: boolean;
  /** OS 가 모션 줄이기를 켰는가 (§12.4) */
  prefersReducedMotion: boolean;
}

export function detect(): Capabilities {
  const isApp = typeof (window as { Capacitor?: unknown }).Capacitor !== 'undefined';
  let reduced = false;
  try {
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { /* 지원 안 하면 끈 것으로 본다 */ }
  return {
    isApp,
    canVibrate: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',
    prefersReducedMotion: reduced,
  };
}

/**
 * 광고 제공자를 고른다.
 *
 * - 개발 빌드는 **언제나 Mock** 이다. 실제 광고를 개발 중에 부르지 않는다(§19).
 * - 앱은 AdMob (M12 에서 Capacitor 플러그인을 붙인다. 그전까지는 광고 없음).
 * - 웹은 H5 Games Ads. 설정이 없거나 스크립트가 안 뜨면 **광고 없음**으로 둔다.
 *   Mock 으로 넘어가지 않는다 — 출시된 웹에서 가짜 광고를 보여주면 안 된다.
 */
export async function pickAdProvider(cap: Capabilities, hooks: H5Hooks): Promise<AdProvider> {
  const mode = mockModeFromQuery(location.search);
  if (mode === 'none') return new NoAdProvider();

  if (import.meta.env.DEV) {
    const p = new MockAdProvider(mode);
    await p.init();
    return p;
  }

  if (cap.isApp) return new NoAdProvider();     // AdMob 은 M12

  const client = h5Client();
  if (!client) return new NoAdProvider();
  const p = new H5AdProvider(client, hooks);
  await p.init();
  return p.isRewardedReady() ? p : new NoAdProvider();
}

/**
 * 퍼블리셔 ID 는 **빌드 시 환경 변수 `VITE_H5_CLIENT` 로만** 들어온다(§19).
 *
 * 저장소 안의 파일에서 읽지 않는다. 그 파일은 .gitignore 에 있어서 CI 에
 * 존재하지 않고, 정적 import 로 두면 빌드가 깨진다. 값이 없으면 광고 없음으로
 * 동작한다 — 그게 정상 상태다(§14.1).
 */
function h5Client(): string {
  return (import.meta.env as Record<string, string | undefined>)['VITE_H5_CLIENT'] ?? '';
}
