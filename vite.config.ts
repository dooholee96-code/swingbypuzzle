import { defineConfig } from 'vite';

// docs/PLAN.md §2. 프레임워크 없이 Canvas 2D + 순수 DOM 오버레이.
export default defineConfig({
  // 상대 경로로 뽑는다. 정적 호스팅의 하위 경로에 올려도 그대로 동작한다.
  base: './',
  server: { host: true },        // --host: 같은 Wi-Fi 의 폰에서 바로 접속
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,        // 레벨 JSON 을 인라인하지 않는다(디버깅이 어려워진다)
  },
});
