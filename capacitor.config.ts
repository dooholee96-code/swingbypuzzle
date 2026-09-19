// Capacitor 앱 셸 설정. docs/PLAN.md §15.2
//
// 웹 자산을 그대로 WebView 로 감싼다. **게임 코드는 바뀌지 않는다.**
//
// android/ 는 `npx cap add android` 가 만드는 생성물이라 git 에서 제외한다.
// 손으로 고친 설정은 여기와 scripts/ 의 패치로 재현 가능하게 둔다.
//
// 앱 ID 는 출시 전에 사용자와 확정한다 (§15.2).

// @capacitor/cli 는 아직 설치돼 있지 않다(M12 에서 사용자가 넣는다). 타입을
// import 하면 지금 tsc 와 CI 가 깨지므로 구조만 적는다 — Capacitor CLI 는
// 이 파일의 기본 내보내기를 그대로 읽는다.
const config = {
  appId: 'com.example.swingby',      // ← 출시 전 확정
  appName: '스윙바이',
  webDir: 'dist',
  android: {
    // 구형 WebView 가 유일한 호환성 위험이다. 빌드 타깃도 ES2020 으로 낮춰 뒀다
    // (vite.config.ts). M12 점검표에 구형 기기 확인이 들어 있다.
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
