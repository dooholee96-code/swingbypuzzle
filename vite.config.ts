import { readFileSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';

import { editorPlugin } from './tools/editor-plugin.js';
import type { Plugin } from 'vite';

/**
 * 서비스 워커의 캐시 이름에 빌드 도장을 찍는다 (§15.1).
 * 이름이 바뀌어야 새 판이 옛 캐시를 통째로 버린다.
 */
function stampServiceWorker(stamp: string): Plugin {
  return {
    name: 'swingby-sw-stamp',
    apply: 'build',
    // public/ 의 파일은 번들을 거치지 않고 그대로 복사된다. 나온 뒤에 고친다.
    closeBundle() {
      const out = new URL('./dist/sw.js', import.meta.url);
      try {
        const src = readFileSync(out, 'utf8');
        writeFileSync(out, src.replace('__BUILD__', stamp));
      } catch { /* sw.js 가 없으면 넘어간다 */ }
    },
  };
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// docs/PLAN.md §2. 프레임워크 없이 Canvas 2D + 순수 DOM 오버레이.
export default defineConfig({
  // 상대 경로로 뽑는다. 정적 호스팅의 하위 경로에 올려도 그대로 동작한다.
  base: './',
  // 스테이지 에디터의 저장 엔드포인트 (§8.7). apply:'serve' 라 빌드에는 붙지 않는다.
  plugins: [editorPlugin(), stampServiceWorker(`${pkg.version}-${Date.now()}`)],
  // §13.6 버전 정보
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { host: true },        // --host: 같은 Wi-Fi 의 폰에서 바로 접속
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,        // 레벨 JSON 을 인라인하지 않는다(디버깅이 어려워진다)
    // 입력은 index.html 하나뿐이다. editor.html 은 여기 없으므로 dist/ 에
    // 들어가지 않는다 — 에디터가 배포 번들에서 빠지는 근거다 (§8.7, §19).
    rollupOptions: { input: 'index.html' },
  },
});
