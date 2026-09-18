// core/ 와 tools-shared/ 가 DOM·브라우저 API 를 쓰지 않는지 검사한다.
// docs/PLAN.md §0.3 — 게임과 검증 도구가 같은 코드를 공유해야 한다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIRS = ['src/core', 'src/tools-shared', 'src/monetization'];

const NAMES = [
  'document', 'window', 'navigator', 'localStorage', 'sessionStorage',
  'HTMLCanvasElement', 'CanvasRenderingContext2D', 'requestAnimationFrame',
  'fetch', 'alert', 'importScripts',
];

// 전역으로 **쓰는** 것만 잡는다.
//   잡는다:   window.addEventListener / document.body / navigator.vibrate
//   안 잡는다: s.window.min (속성 접근), { window: … } (객체 키),
//              문자열·주석 안의 낱말
// §8.3 의 레시피에 `window: { min, max }` 필드가 실제로 있어서 이 구분이 필요하다.
const BANNED = new RegExp(`(?<![.\\w$])(${NAMES.join('|')})\\b(?!\\s*[?:])`);

/** 주석과 문자열·템플릿 리터럴의 **내용**을 지운다. 길이는 유지할 필요가 없다. */
function strip(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
    } else if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++; }
      i += 2;
    } else if (c === '"' || c === "'" || c === '`') {
      const q = c;
      i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') i++;
        else if (src[i] === '\n') out += '\n';
        i++;
      }
      i++;
      out += '""';
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

let bad = 0;
const walk = (d) => {
  let entries;
  try { entries = readdirSync(d); } catch { return; }
  for (const f of entries) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!p.endsWith('.ts')) continue;
    strip(readFileSync(p, 'utf8')).split('\n').forEach((line, i) => {
      const m = BANNED.exec(line);
      if (m) { console.error(`${p}:${i + 1}: '${m[1]}' — §0.3 위반`); bad++; }
    });
  }
};
DIRS.forEach(walk);
if (bad) { console.error(`\n§0.3 위반 ${bad}건. core/ 는 순수 로직이어야 한다.`); process.exit(1); }
console.log('§0.3 검사: 위반 없음');
