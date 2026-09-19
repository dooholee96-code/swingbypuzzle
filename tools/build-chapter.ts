// 장 전체를 한 번에 만든다. docs/PLAN.md §8.2, §17 M10
//
//   npm run build-chapter -- --recipe recipes/ch1.json
//   npm run build-chapter -- --recipe recipes/ch1.json --slot 5 --seeds 4000
//
// 칸마다 후보를 생성해 **성공 폭이 레시피 범위 한가운데에 가장 가까운 것**을
// 채택하고 `src/levels/data/<ID>.json` 에 쓴다. 후보가 안 나오면 시드를 늘려
// 다시 시도하고, 그래도 없으면 그 칸을 건너뛰고 이유를 보고한다.
//
// 채택된 단계도 `npm run validate` 를 다시 통과해야 한다 — 검증기가 관문이다(§8.1).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Candidate } from '../src/tools-shared/generator.js';
import { checkLevel, computeMetrics, metaMetrics } from '../src/tools-shared/metrics.js';
import { type Recipe, checkRecipe, levelId, resolve as resolveSlot, slotOf } from '../src/tools-shared/recipe.js';
import type { Level } from '../src/core/types.js';
import { REJECT_LABEL, ROOT, bestOf, runSlot, spread } from './gen-run.js';
import { svgOf } from './svg.js';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

const DATA = join(ROOT, 'src', 'levels', 'data');
const CANDS = join(ROOT, 'candidates');

// 후보가 없으면 시드를 이만큼씩 늘려 다시 본다
const RETRY = [1, 3, 8];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface Outcome {
  id: string;
  name: string;
  ok: boolean;
  note: string;
  difficulty?: number;
  window?: number;
  clearance?: number;
  timing?: number;
  seconds: number;
}

async function buildSlot(recipe: Recipe, slotNo: number, baseSeeds: number): Promise<Outcome> {
  const slot = slotOf(recipe, slotNo)!;
  const id = levelId(recipe, slot);
  let spent = 0;
  let found: Candidate[] = [];
  let rejected: Record<string, number> = {};

  for (const mult of RETRY) {
    const seeds = baseSeeds * mult;
    process.stdout.write(`  ${id} ${slot.name} — 시드 ${seeds}… `);
    const r = await runSlot(recipe, slot, seeds);
    spent += r.seconds;
    found = r.candidates;
    rejected = r.rejected;
    console.log(`후보 ${found.length}개 (${r.seconds.toFixed(0)}초)`);
    if (found.length) break;
  }

  if (!found.length) {
    const why = Object.entries(rejected).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${REJECT_LABEL[k] ?? k} ${v}`).join(', ');
    return { id, name: slot.name, ok: false, note: why, seconds: spent };
  }

  const pick = bestOf(found, slot.window)!;
  const lv: Level = pick.level;

  // 채택한 것을 한 번 더 독립 검증한다. 생성기가 통과시켰다는 말만 믿지 않는다.
  const m = computeMetrics(lv);
  const rep = checkLevel(lv, m, { window: slot.window, timing: slot.timing });
  if (rep.failures.length) {
    return { id, name: slot.name, ok: false, note: `재검증 실패: ${rep.failures.join(' / ')}`, seconds: spent };
  }
  lv.meta = { ...lv.meta, metrics: metaMetrics(m) as unknown as Level["meta"]["metrics"] };

  writeFileSync(join(DATA, `${id}.json`), JSON.stringify(lv, null, 2) + '\n');

  // 고르지 않은 후보도 남겨 둔다 — 마음에 안 들면 에디터에서 바꿔 끼운다
  const dir = join(CANDS, id);
  mkdirSync(dir, { recursive: true });
  spread(found.sort((a, b) => a.difficulty - b.difficulty), 10).forEach((c, i) => {
    const n = String(i + 1).padStart(2, '0');
    writeFileSync(join(dir, `cand-${n}.json`), JSON.stringify(c.level, null, 2) + '\n');
    writeFileSync(join(dir, `cand-${n}.svg`), svgOf(c.level, c.solutionPath));
  });
  writeFileSync(join(dir, 'adopted.svg'), svgOf(lv, pick.solutionPath));

  return {
    id, name: slot.name, ok: true,
    note: `후보 ${found.length}개 중 채택`,
    difficulty: m.difficulty,
    window: m.main_window_at_solution,
    clearance: m.clearance,
    ...(m.timing_fraction === undefined ? {} : { timing: m.timing_fraction }),
    seconds: spent,
  };
}

async function main(): Promise<number> {
  const recipePath = arg('recipe');
  if (!recipePath) {
    console.error('사용법: npm run build-chapter -- --recipe <파일> [--slot N] [--seeds N]');
    return 2;
  }
  const raw: unknown = JSON.parse(readFileSync(resolvePath(ROOT, recipePath), 'utf8'));
  const errs = checkRecipe(raw);
  if (errs.length) { for (const e of errs) console.error(`  ✗ ${e}`); return 1; }

  const recipe = raw as Recipe;
  const only = arg('slot') ? Number(arg('slot')) : undefined;
  const slots = recipe.slots.filter((s) => only === undefined || s.slot === only);
  const baseSeeds = Number(arg('seeds') ?? 0) || undefined;

  console.log(`${recipe.chapter}장 — ${slots.length}칸`);
  const out: Outcome[] = [];
  for (const s of slots) {
    out.push(await buildSlot(recipe, s.slot, baseSeeds ?? resolveSlot(recipe, s).seeds / 4));
  }

  console.log('');
  console.log('  단계   이름               난이도  성공 폭  clearance  timing');
  console.log('  ' + '─'.repeat(62));
  for (const o of out) {
    if (!o.ok) { console.log(`  ✗ ${o.id}  ${o.name}  — ${o.note}`); continue; }
    console.log([
      `  ✓ ${o.id.padEnd(5)}`,
      o.name.padEnd(14),
      o.difficulty!.toFixed(2).padStart(6),
      o.window!.toFixed(2).padStart(7) + '°',
      o.clearance!.toFixed(2).padStart(9),
      (o.timing === undefined ? '—' : o.timing.toFixed(2)).padStart(7),
    ].join(' '));
  }
  const failed = out.filter((o) => !o.ok);
  const total = out.reduce((a, b) => a + b.seconds, 0);
  console.log('');
  console.log(`  ${out.length - failed.length}/${out.length}칸 완성 — ${total.toFixed(0)}초`);
  if (failed.length) console.log(`  못 만든 칸: ${failed.map((f) => f.id).join(', ')}`);
  console.log('  src/levels/chapters.ts 에 등록하고 npm run validate 를 돌리세요.');
  return failed.length ? 1 : 0;
}

main().then((c) => process.exit(c), (e: unknown) => { console.error(e); process.exit(1); });
