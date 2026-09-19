// 단계 등록. docs/PLAN.md §8.2 ⑤
//
//   npm run register           src/levels/data/ 를 훑어 chapters.ts 를 다시 쓴다
//   npm run register -- --check  바뀔 것이 있으면 종료 코드 1 (CI 용)
//
// **검증기를 통과한 단계만 등록한다** (§19). 여기서 한 번 더 확인하므로
// 실수로 깨진 단계를 등록할 수 없다.
//
// 손으로 목록을 고치지 않는 이유: 40단계를 손으로 적으면 오타가 난다.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkLevel } from '../src/tools-shared/metrics.js';
import { ROOT } from './gen-run.js';
import { DATA_DIR, loadLevel } from './levels-fs.js';

/** 장 이름은 §7.3 의 커리큘럼 제목이다. 새 장을 열 때 여기에 더한다. */
const NAMES: Record<number, string> = {
  1: '행성', 2: '블랙홀', 3: '외계인', 4: '공전 행성', 5: '넓은 항로',
};

const OUT = join(ROOT, 'src', 'levels', 'chapters.ts');

function ids(): string[] {
  return readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .sort((a, b) => {
      const [ca, sa] = a.split('-').map(Number) as [number, number];
      const [cb, sb] = b.split('-').map(Number) as [number, number];
      return ca - cb || sa - sb;
    });
}

function render(byChapter: Map<number, string[]>): string {
  const rows = [...byChapter.entries()].sort((a, b) => a[0] - b[0]).map(
    ([ch, list]) => `  { chapter: ${ch}, name: '${NAMES[ch] ?? ''}', levels: [`
      + list.map((id) => `'${id}'`).join(', ') + '] },',
  );
  return `// 장 구성과 단계 순서. docs/PLAN.md §7.1, §13.2
//
// 여기 등록된 단계만 게임에 나온다.
// **검증기(§8.5)를 통과하지 않은 단계를 등록하지 않는다(§19).**
//
// 이 파일은 \`npm run register\` 가 src/levels/data/ 를 훑어 다시 쓴다.
// 손으로 고치지 않는다 — 장 이름만 tools/register.ts 에서 바꾼다.

export interface Chapter { chapter: number; name: string; levels: string[] }

/** 장 이름은 §7.3 의 커리큘럼 제목. 탭에 "1장 행성" 형태로 표시된다 (§13.2). */
export const CHAPTERS: readonly Chapter[] = [
${rows.join('\n')}
];

export function allIds(): string[] {
  return CHAPTERS.flatMap((c) => c.levels);
}

export function idsOf(chapter: number): string[] {
  return CHAPTERS.find((c) => c.chapter === chapter)?.levels ?? [];
}

export function nameOf(chapter: number): string {
  return CHAPTERS.find((c) => c.chapter === chapter)?.name ?? '';
}

/** 탭 표기 "1장 행성" (§13.2) */
export function labelOf(chapter: number): string {
  const n = nameOf(chapter);
  return n ? \`\${chapter}장 \${n}\` : '';
}
`;
}

function main(): number {
  const check = process.argv.includes('--check');
  const byChapter = new Map<number, string[]>();
  const bad: string[] = [];

  for (const id of ids()) {
    const lv = loadLevel(id);
    const r = checkLevel(lv);
    if (r.failures.length) { bad.push(`${id}: ${r.failures.join(' / ')}`); continue; }
    const ch = lv.meta.chapter;
    (byChapter.get(ch) ?? byChapter.set(ch, []).get(ch)!).push(id);
  }

  if (bad.length) {
    console.error('검증을 통과하지 못해 등록하지 않는 단계:');
    for (const b of bad) console.error(`  ✗ ${b}`);
  }

  const next = render(byChapter);
  const cur = (() => { try { return readFileSync(OUT, 'utf8'); } catch { return ''; } })();

  if (check) {
    if (cur === next) { console.log('등록 목록이 최신입니다.'); return bad.length ? 1 : 0; }
    console.error('chapters.ts 가 src/levels/data/ 와 다릅니다. npm run register 를 돌리세요.');
    return 1;
  }

  if (cur !== next) writeFileSync(OUT, next);
  for (const [ch, list] of [...byChapter.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${ch}장 ${NAMES[ch] ?? ''} — ${list.length}단계: ${list.join(' ')}`);
  }
  console.log(`\n  전체 ${[...byChapter.values()].reduce((a, b) => a + b.length, 0)}단계 등록${cur === next ? ' (변화 없음)' : ''}.`);
  return bad.length ? 1 : 0;
}

process.exit(main());
