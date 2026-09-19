# 앱 빌드 절차 (PLAN §15.2, §17 M12)

이 저장소에서 할 수 없는 일이다 — Android SDK 와 서명 키가 필요하다.
아래 순서대로 사용자 환경에서 한다.

## 처음 한 번

```bash
npm i -D @capacitor/cli
npm i @capacitor/core @capacitor/android
npx cap add android          # android/ 가 생긴다 (git 제외)
```

`capacitor.config.ts` 의 `appId` 를 확정한 값으로 바꾼다.

## 매번

```bash
npm run build                # dist/ 를 만든다
npx cap sync                 # dist/ 를 android/ 로 옮긴다
npx cap open android         # Android Studio 에서 실행·서명
```

## 손으로 확인·설정할 것

1. **세로 고정** — `android/app/src/main/AndroidManifest.xml` 의
   `<activity ... android:screenOrientation="portrait">`
2. **디버그 전용 WebView 디버깅** — 릴리스 빌드에서 꺼져 있는지
3. **AdMob** — `@capacitor-community/admob` 을 붙이고
   `src/platform/ads-admob.ts` 를 채운다. 지금은 `NoAdProvider` 로 둔다
   (`src/platform/capabilities.ts` 의 `cap.isApp` 분기)
4. **업로드 키** — 저장소 밖에 보관하고 별도 백업 (§19)

## 출시 전 점검표 (§17 M12)

- [ ] 테스트 광고 ID 가 출시 빌드에 없다
- [ ] 번들에 `src/editor/`·`tests/`·`tools/` 가 없다 (`npm run build` 후 직접 확인)
- [ ] 오프라인 실행
- [ ] 저장 유지 (껐다 켜도 클리어 기록이 남는다)
- [ ] `npm run validate` 통과
- [ ] 개인정보처리방침 URL 접속
- [ ] 뒤로 버튼 흐름
- [ ] **구형 WebView 기기 확인**
- [ ] 오픈소스 고지 표시
