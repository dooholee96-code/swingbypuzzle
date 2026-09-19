// 후보 생성. docs/PLAN.md §8.4, §16.4
//
//   npm run gen -- --recipe recipes/ch1.json --slot 2 --count 10
//   npm run gen -- --recipe recipes/ch1.json --slot 2 --count 10 --seeds 4000
//
// 결과는 candidates/<단계ID>/ 에 cand-XX.json + cand-XX.svg + summary.md 로
// 나온다. 에디터(§8.7)의 후보 목록이 그 폴더를 읽는다.
//
// 오래 걸리는 배치 작업이다. 10초마다 진행률을 한 줄 낸다 (§8.4).

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { Candidate } from '../src/tools-shared/generator.js';
import { type Recipe, checkRecipe, levelId, resolve as resolveSlot, slotOf } from '../src/tools-shared/recipe.js';
import { REJECT_LABEL, ROOT, runSlot, spread, threadCount } from './gen-run.js';
import { svgOf } from './svg.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const recipePath = arg('recipe');
  const slotNo = Number(arg('slot'));
  const count = Number(arg('count') ?? 10);
  if (!recipePath || !Number.isFinite(slotNo)) {
    console.error('사용법: npm run gen -- --recipe <파일> --slot <칸> [--count N] [--seeds N]');
    return 2;
  }

  const raw: unknown = JSON.parse(readFileSync(resolve(ROOT, recipePath), 'utf8'));
  const errs = checkRecipe(raw);
  if (errs.length) {
    for (const e of errs) console.error(`  ✗ ${e}`);
    return 1;
  }
  const recipe = raw as Recipe;
  const slot = slotOf(recipe, slotNo);
  if (!slot) { console.error(`${recipePath} 에 ${slotNo}번 칸이 없습니다`); return 1; }

  const seeds = Number(arg('seeds') ?? resolveSlot(recipe, slot).seeds);
  const id = levelId(recipe, slot);
  const threads = threadCount();

  console.log(`${id} ${slot.name} — 시드 ${seeds}개, 스레드 ${threads}개`);
  console.log(`  목표 성공 폭 ${slot.window.min}~${slot.window.max}°` +
    (slot.timing ? `, 타이밍 ${slot.timing.minFraction}~${slot.timing.maxFraction}` : ''));

  const { candidates: all, rejected, seconds: secs } = await runSlot(
    recipe, slot, seeds,
    (tried, found, el) => console.log(`  … ${el.toFixed(0)}초  시도 ${tried}/${seeds}  후보 ${found}개`),
  );

  // 난이도 순으로 정렬한 뒤 **고르게 솎아** count 개 (§8.4 8단계)
  //
  // 문서는 "상위 count개"라고 적혀 있지만, 실제로 돌려 보니 한 칸의 후보들이
  // 난이도 점수가 같은 경우가 흔하다(레시피의 window 범위가 이미 난이도를
  // 묶어 두기 때문이다). 그때 앞에서 10개를 자르면 53개 중 아무 10개가 된다.
  // 고르게 뽑으면 찾은 것의 전 범위를 보고 고를 수 있다.
  all.sort((a, b) => a.difficulty - b.difficulty || a.main_window - b.main_window);
  const top = spread(all, count);

  const dir = join(ROOT, 'candidates', id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  top.forEach((c, i) => {
    const n = String(i + 1).padStart(2, '0');
    writeFileSync(join(dir, `cand-${n}.json`), JSON.stringify(c.level, null, 2) + '\n');
    writeFileSync(join(dir, `cand-${n}.svg`), svgOf(c.level, c.solutionPath));
  });
  writeFileSync(join(dir, 'summary.md'), summary(id, slot.name, top, secs, seeds, rejected));

  console.log('');
  console.log(`  ${seeds}시드 중 후보 ${all.length}개, 상위 ${top.length}개 저장 — ${secs.toFixed(1)}초`);
  if (top.length) {
    console.log('');
    console.log('  후보  난이도  성공 폭  비행시간  clearance  timing  시드');
    console.log('  ' + '─'.repeat(58));
    top.forEach((c, i) => {
      console.log([
        `  ${String(i + 1).padStart(2, '0')}  `,
        c.difficulty.toFixed(2).padStart(6),
        c.main_window.toFixed(2).padStart(7) + '°',
        c.flight_time.toFixed(2).padStart(7) + '초',
        c.clearance.toFixed(2).padStart(9),
        (c.timing_fraction === undefined ? '—' : c.timing_fraction.toFixed(2)).padStart(7),
        String(c.seed).padStart(7),
      ].join(' '));
    });
  }
  if (Object.keys(rejected).length) {
    console.log('');
    console.log('  떨어진 이유:');
    for (const [k, v] of Object.entries(rejected).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(v).padStart(6)}  ${REJECT_LABEL[k] ?? k}`);
    }
  }
  console.log('');
  console.log(`  candidates/${id}/ 에 있습니다. npm run editor 의 후보 목록에서 열립니다.`);
  return top.length ? 0 : 1;
}

function summary(
  id: string, name: string, top: Candidate[], secs: number,
  seeds: number, rejected: Record<string, number>,
): string {
  const rows = top.map((c, i) => `| ${String(i + 1).padStart(2, '0')} | ${c.difficulty.toFixed(2)} | ${c.main_window.toFixed(2)}° | ${c.flight_time.toFixed(2)}초 | ${c.clearance.toFixed(2)} | ${c.timing_fraction === undefined ? '—' : c.timing_fraction.toFixed(2)} | ${c.seed} |`);
  const why = Object.entries(rejected).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- ${REJECT_LABEL[k] ?? k}: ${v}`);
  return [
    `# ${id} ${name} — 후보`,
    '',
    `시드 ${seeds}개, ${secs.toFixed(1)}초. 검증(§8.5)을 통과한 것만 있습니다.`,
    '',
    '| 후보 | 난이도 | 성공 폭 | 비행 시간 | clearance | timing | 시드 |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '## 떨어진 이유',
    '',
    ...why,
    '',
    '## 고르는 법',
    '',
    '`npm run editor` 의 후보 목록에서 열어 궤적을 보고 고릅니다.',
    '채택하면 `src/levels/data/` 에 저장되고, `npm run validate` 를 통과하면 커밋합니다.',
    '',
  ].join('\n');
}

main().then((c) => process.exit(c), (e: unknown) => { console.error(e); process.exit(1); });
