// core/ 와 tools-shared/ 가 DOM·브라우저 API 를 쓰지 않는지 검사한다.
// docs/PLAN.md §0.3 — 게임과 검증 도구가 같은 코드를 공유해야 한다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIRS = ['src/core', 'src/tools-shared', 'src/monetization'];
const BANNED = /\b(document|window|navigator|localStorage|HTMLCanvasElement|CanvasRenderingContext2D|requestAnimationFrame)\b/;

let bad = 0;
const walk = (d) => {
  let entries;
  try { entries = readdirSync(d); } catch { return; }
  for (const f of entries) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!p.endsWith('.ts')) continue;
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      if (line.trimStart().startsWith('//')) return;
      const m = BANNED.exec(line);
      if (m) { console.error(`${p}:${i + 1}: '${m[1]}' — §0.3 위반`); bad++; }
    });
  }
};
DIRS.forEach(walk);
if (bad) { console.error(`\n§0.3 위반 ${bad}건. core/ 는 순수 로직이어야 한다.`); process.exit(1); }
console.log('§0.3 검사: 위반 없음');
