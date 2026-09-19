// 색 리터럴이 팔레트 밖에 있는지 검사한다.
// docs/PLAN.md §12.6 — 캔버스는 palette.ts 토큰, DOM 은 styles.css 의 :root 변수만.
//
// 이 검사가 있어야 "나중에 테마를 바꿀 수 있다"가 말로만 남지 않는다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const COLOR = /#[0-9A-Fa-f]{3,8}\b|\brgba?\s*\(/;

// 색을 정의해도 되는 곳
const ALLOW_FILES = new Set(['src/render/palette.ts']);
// 실패 원인별 색은 팔레트에 없는 의미(초록 성공, 회색 벽)라 예외로 둔다.
// 개발자용 에디터 전용이고 배포 번들에 들어가지 않는다 (§8.7).
const ALLOW_DIRS = ['src/editor'];

let bad = 0;

function scanTs(p) {
  if (ALLOW_FILES.has(p) || ALLOW_DIRS.some((d) => p.startsWith(d))) return;
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
    if (COLOR.test(line)) {
      console.error(`${p}:${i + 1}: 색 리터럴 — §12.6 위반 (palette.ts 토큰이나 alpha() 를 쓰세요)`);
      bad++;
    }
  });
}

/** CSS 는 :root 블록 안에서만 색을 정의할 수 있다. */
function scanCss(p) {
  const src = readFileSync(p, 'utf8');
  const lines = src.split('\n');
  let inRoot = false;
  lines.forEach((line, i) => {
    if (/:root\s*\{/.test(line)) inRoot = true;
    if (inRoot) { if (line.includes('}')) inRoot = false; return; }
    const t = line.trim();
    if (t.startsWith('/*') || t.startsWith('*')) return;
    if (COLOR.test(line)) {
      console.error(`${p}:${i + 1}: 색 리터럴 — §12.6 위반 (:root 변수를 쓰세요)`);
      bad++;
    }
  });
}

const walk = (d) => {
  let entries;
  try { entries = readdirSync(d); } catch { return; }
  for (const f of entries) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (p.endsWith('.ts')) scanTs(p);
    else if (p.endsWith('.css')) scanCss(p);
  }
};
walk('src');

if (bad) { console.error(`\n§12.6 위반 ${bad}건. 색은 팔레트 밖에서 쓰지 않는다.`); process.exit(1); }
console.log('§12.6 색 검사: 위반 없음');
