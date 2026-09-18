// 전체 검증. docs/PLAN.md §16.3
//
//   npm run validate           chapters.ts 에 등록된 전 단계
//   npm run validate 1-1       한 단계만
//   npm run validate 2         2장 전체
//   npm run validate -- --write   통과한 단계의 meta.metrics 를 파일에 기록
//
// 실패가 하나라도 있으면 종료 코드 1. 커밋 전에 반드시 실행한다 (§0.4).

import { writeFileSync } from 'node:fs';

import { allIds, idsOf } from '../src/levels/chapters.js';
import { LevelError } from '../src/levels/loader.js';
import { checkLevel, computeMetrics, curveWarnings, metaMetrics } from '../src/tools-shared/metrics.js';
import type { Level } from '../src/core/types.js';
import { DATA_DIR, loadLevel } from './levels-fs.js';

function row(id: string, m: ReturnType<typeof computeMetrics>, ok: boolean): string {
  const t = m.timing_fraction === undefined ? '    —' : m.timing_fraction.toFixed(2).padStart(5);
  return [
    (ok ? '  ✓' : '  ✗') + ' ' + id.padEnd(5),
    m.main_window.toFixed(2).padStart(6) + '°',
    m.flight_time.toFixed(2).padStart(6) + '초',
    m.clearance.toFixed(2).padStart(7),
    t,
    m.difficulty.toFixed(2).padStart(6),
  ].join(' ');
}

function main(): number {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const picks = args.filter((a) => !a.startsWith('-'));

  let ids: string[];
  if (!picks.length) ids = allIds();
  else ids = picks.flatMap((p) => (/^\d+$/.test(p) ? idsOf(Number(p)) : [p]));

  console.log('  단계    성공 폭   비행시간   clearance  timing  난이도');
  console.log('  ' + '─'.repeat(58));

  let failed = 0;
  const curve: { id: string; slot: number; difficulty: number; chapter: number }[] = [];
  const notes: string[] = [];

  for (const id of ids) {
    let L: Level;
    try {
      L = loadLevel(id);
    } catch (e) {
      failed++;
      for (const m of (e as LevelError).errors ?? [String(e)]) console.log(`  ✗ ${id}  ${m}`);
      continue;
    }

    const r = checkLevel(L);
    const ok = r.failures.length === 0;
    if (!ok) failed++;
    console.log(row(id, r.metrics, ok));
    for (const f of r.failures) notes.push(`  ✗ ${id}: ${f}`);
    for (const w of r.warnings) notes.push(`  ! ${id}: ${w}`);

    curve.push({ id, slot: L.meta.slot, chapter: L.meta.chapter, difficulty: r.metrics.difficulty });

    if (write && ok) {
      const next = { ...L, meta: { ...L.meta, metrics: metaMetrics(r.metrics) } };
      writeFileSync(`${DATA_DIR}/${id}.json`, JSON.stringify(next, null, 2) + '\n');
    }
  }

  // 장 안의 난이도 곡선 (§8.5 경고)
  for (const ch of [...new Set(curve.map((c) => c.chapter))].sort((a, b) => a - b)) {
    for (const w of curveWarnings(curve.filter((c) => c.chapter === ch))) notes.push(`  ! ${w}`);
  }

  if (notes.length) {
    console.log('');
    for (const n of notes) console.log(n);
  }

  console.log('');
  if (failed) {
    console.log(`  ${ids.length}단계 중 ${failed}단계 실패.`);
    return 1;
  }
  console.log(`  ${ids.length}단계 전부 통과.${write ? ' meta.metrics 기록함.' : ''}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
