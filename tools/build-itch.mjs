// itch.io 업로드용 빌드. docs/PLAN.md §15.6
//
//   npm run build:itch   →   build/itch/swingby-itch.zip
//
// 우리 웹 빌드와 다른 점은 둘이다(VITE_TARGET=itch):
//   · 힌트를 광고 없이 준다 — itch 는 자기 도메인의 iframe 에서 돌려 H5 광고가 뜨지 않는다
//   · 서비스 워커를 쓰지 않는다(sw.js 도 빼고 묶는다)
// itch 는 zip 맨 위의 index.html 을 연다. vite 의 base './' 덕에 경로는 그대로 맞는다.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build', 'itch');
const DIST = join(OUT, 'site');
const ZIP = join(OUT, 'swingby-itch.zip');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const run = (cmd, args, env = {}) =>
  execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });

run('npx', ['tsc', '--noEmit']);
run('npx', ['vite', 'build', '--outDir', DIST, '--emptyOutDir'], { VITE_TARGET: 'itch' });
rmSync(join(DIST, 'sw.js'), { force: true });
if (!existsSync(join(DIST, 'index.html'))) throw new Error('index.html 이 없다');

// zip 맨 위에 index.html 이 와야 한다 — site 폴더 안에서 묶는다
execFileSync('zip', ['-r', '-q', '-X', ZIP, '.'], { cwd: DIST, stdio: 'inherit' });
console.log(`\n  itch.io 업로드 파일: ${ZIP} (${(statSync(ZIP).size / 1024).toFixed(0)}KB)`);
