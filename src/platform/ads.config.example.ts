// 광고 설정의 **형식 예시**. docs/PLAN.md §14.2, §19
//
// 실제 값이 든 src/platform/ads.config.ts 는 .gitignore 에 있다.
// 이 파일을 복사해 이름을 바꾸고 값을 채운다.
//
//   cp src/platform/ads.config.example.ts src/platform/ads.config.ts
//
// **실제 광고 단위 ID 를 이 파일에 적지 않는다.** 저장소에 들어간다.
// 웹 퍼블리셔 ID 는 결국 스크립트 태그로 공개되지만, 그래도 저장소에는 두지
// 않고 빌드 시 환경 변수로 넣는다.

// **웹은 이 파일을 읽지 않는다.** H5 퍼블리셔 ID 는 빌드 시 환경 변수
// VITE_H5_CLIENT 로만 들어간다(src/platform/capabilities.ts). 이 파일은
// M12 의 앱 빌드에서 AdMob 값을 적어 두는 자리다.

export interface AdsConfig {
  /** H5 Games Ads 의 AdSense 클라이언트 ID. 웹 빌드는 환경 변수를 쓴다 */
  h5Client: string;
  /** AdMob 앱 ID (앱 빌드 전용) */
  admobAppId: string;
  /** AdMob 광고 단위 */
  admobRewarded: string;
  admobInterstitial: string;
}

export const ADS: AdsConfig = {
  h5Client: '',
  admobAppId: '',
  admobRewarded: '',
  admobInterstitial: '',
};
