// 전체 검증. docs/PLAN.md §16.3
//
//   npm run validate            chapters.ts 에 등록된 전 단계
//   npm run validate 1-1        한 단계만
//   npm run validate 2          2장 전체
//   npm run validate -- --write 통과한 단계의 meta.metrics 를 파일에 기록
//
// 실패가 하나라도 있으면 종료 코드 1. 커밋 전에 반드시 실행한다 (§0.4).
// 공전 단계는 24번씩 스캔해야 해서 스레드에 나눠 돌린다.

import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

import { allIds, idsOf } from '../src/levels/chapters.js';
import { curveWarnings, metaMetrics } from '../src/tools-shared/metrics.js';
import { ROOT } from './gen-run.js';
import { DATA_DIR, loadLevel } from './levels-fs.js';
import type { VDone, VJob } from './validate-worker.js';

type Row = VDone | { id: string; error: string };

function row(r: VDone, ok: boolean): string {
  const m = r.metrics;
  const t = m.timing_fraction === undefined ? '    —' : m.timing_fraction.toFixed(2).padStart(5);
  return [
    (ok ? '  ✓' : '  ✗') + ' ' + r.id.padEnd(5),
    m.main_window_at_solution.toFixed(2).padStart(6) + '°',
    m.flight_time.toFixed(2).padStart(6) + '초',
    m.clearance.toFixed(2).padStart(7),
    t,
    m.difficulty.toFixed(2).padStart(6),
  ].join(' ');
}

async function run(ids: string[]): Promise<Row[]> {
  const threads = Math.max(1, Math.min(cpus().length, 8, ids.length));
  const per = Math.ceil(ids.length / threads);
  const chunks = Array.from({ length: threads }, (_, k) => ids.slice(k * per, (k + 1) * per))
    .filter((c) => c.length);

  const results = await Promise.all(chunks.map((chunk) => new Promise<Row[]>((ok, no) => {
    const w = new Worker(join(ROOT, 'tools/validate-worker-boot.mjs'),
      { workerData: { ids: chunk } satisfies VJob });
    let got: Row[] = [];
    w.on('message', (m: Row[]) => { got = m; });
    w.on('error', no);
    w.on('exit', () => ok(got));
  })));

  const byId = new Map<string, Row>();
  for (const list of results) for (const r of list) byId.set(r.id, r);
  return ids.map((id) => byId.get(id) ?? { id, error: '워커가 결과를 내지 않았습니다' });
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const picks = args.filter((a) => !a.startsWith('-'));

  const ids = !picks.length ? allIds()
    : picks.flatMap((p) => (/^\d+$/.test(p) ? idsOf(Number(p)) : [p]));

  if (!ids.length) { console.log('  검증할 단계가 없습니다.'); return 0; }

  const started = Date.now();
  const rows = await run(ids);

  console.log('  단계    성공 폭   비행시간   clearance  timing  난이도');
  console.log('  ' + '─'.repeat(58));

  let failed = 0;
  const notes: string[] = [];
  const curve: { id: string; slot: number; difficulty: number; chapter: number }[] = [];

  for (const r of rows) {
    if ('error' in r) { failed++; console.log(`  ✗ ${r.id}  ${r.error}`); continue; }
    const ok = r.failures.length === 0;
    if (!ok) failed++;
    console.log(row(r, ok));
    for (const f of r.failures) notes.push(`  ✗ ${r.id}: ${f}`);
    for (const w of r.warnings) notes.push(`  ! ${r.id}: ${w}`);
    curve.push({ id: r.id, slot: r.slot, chapter: r.chapter, difficulty: r.metrics.difficulty });

    if (write && ok) {
      const L = loadLevel(r.id);
      const next = { ...L, meta: { ...L.meta, metrics: metaMetrics(r.metrics) } };
      writeFileSync(`${DATA_DIR}/${r.id}.json`, JSON.stringify(next, null, 2) + '\n');
    }
  }

  // 장 안의 난이도 곡선 (§8.5 경고)
  for (const ch of [...new Set(curve.map((c) => c.chapter))].sort((a, b) => a - b)) {
    for (const w of curveWarnings(curve.filter((c) => c.chapter === ch))) notes.push(`  ! ${w}`);
  }

  if (notes.length) { console.log(''); for (const n of notes) console.log(n); }

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log('');
  if (failed) { console.log(`  ${ids.length}단계 중 ${failed}단계 실패. (${secs}초)`); return 1; }
  console.log(`  ${ids.length}단계 전부 통과.${write ? ' meta.metrics 기록함.' : ''} (${secs}초)`);
  return 0;
}

main().then((c) => process.exit(c), (e: unknown) => { console.error(e); process.exit(1); });
