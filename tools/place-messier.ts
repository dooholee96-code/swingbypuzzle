// 메시에 천체 배치 (§22.7). 좌표는 손으로 쓰지 않는다(§0.7) — 이 도구가 정답 길 옆에 놓고
// 규칙 14(src/tools-shared/collect.ts)로 거른다.
//
//   npm run messier -- --all          1~7장, 장마다 가장 좋은 네 칸에 STAGE_MESSIER 순서대로
//   npm run messier -- --chapter 3    한 장만
//   npm run messier -- 2-5 31         한 단계에 M31 을 놓는다 (이미 있으면 바꾼다)
//
// 후보는 **도착하는 비행의 경로 위 점**이다. 그중 ① 정답 경로에서 COLLECT_R + COLLECT_DETOUR
// 보다 멀고 ② 천체·소행성·외계인·링·목적지·발사대에서 떨어져 있고 ③ 그 점을 스치며 도착하는
// 각도가 연속 2° 이상인 것만 남겨, 폭이 넓고 정답에서 먼 것을 고른다. 난수는 없다 — 같은
// 단계면 같은 자리다. 놓은 뒤 `npm run validate -- --write` 로 지표를 기록한다.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PAD_R } from '../src/core/constants.js';
import { gravs } from '../src/core/physics.js';
import { Sim } from '../src/core/simulate.js';
import type { Level } from '../src/core/types.js';
import { CHAPTERS, idsOf } from '../src/levels/chapters.js';
import { SAVE_KEYS } from '../src/levels/loader.js';
import {
  COLLECT_DETOUR, MIN_COLLECT_WINDOW, collectMetrics, flyPlanned, pathMinDist, planOf,
} from '../src/tools-shared/collect.js';
import { COLLECT_R, STAGE_MESSIER } from '../src/tools-shared/messier.js';
import { checkLevel, marginAt } from '../src/tools-shared/metrics.js';
import { FROM, STEP, TO, runsOf, widthOf } from '../src/tools-shared/scan.js';
import { DATA_DIR, loadLevel } from './levels-fs.js';

/** 경로 표본 간격(스텝). 2 스텝 = 1.25 유닛 */
const SAMPLE = 2;
const CELL = 32;
/** 후보로 삼는 점의 간격(표본 수). 12 표본 = 0.1초 */
const CAND_EVERY = 12;
const WANT_WINDOW = MIN_COLLECT_WINDOW;   // 규칙과 같은 코드로 재므로 여유를 둘 필요가 없다
const PER_CHAPTER = 4;

interface Flight { a: number; win: boolean; path: Float32Array }
export interface Placement { x: number; y: number; width: number; solDist: number; score: number }

function sample(path: number[]): Float32Array {
  const n = Math.floor(path.length / 2 / SAMPLE);
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { out[i * 2] = path[i * SAMPLE * 2]!; out[i * 2 + 1] = path[i * SAMPLE * 2 + 1]!; }
  return out;
}

/** 천체·소행성·외계인·링·목적지·발사대에서 충분히 떨어진 빈 자리인가 */
function clearAt(L: Level, x: number, y: number): boolean {
  if (x < 30 || y < 30 || x > L.w - 30 || y > L.h - 30) return false;
  if (Math.hypot(x - L.start.x, y - L.start.y) < PAD_R + 60) return false;
  if (Math.hypot(x - L.goal.x, y - L.goal.y) < L.goal.r + 30) return false;
  for (const p of L.planets ?? []) {
    if (p.orbit) {
      const d = Math.hypot(x - p.orbit.cx, y - p.orbit.cy);
      if (Math.abs(d - p.orbit.rad) < p.r + 18) return false;
    }
  }
  if (marginAt(L, x, y, 0) < 18) return false;
  for (const u of L.ufos ?? []) if (Math.hypot(x - u.x, y - u.y) < 13 + 18) return false;
  for (const d of L.docks ?? []) if (Math.hypot(x - d.x, y - d.y) < d.cr + 10) return false;
  return true;
}

/** 한 단계에서 가장 좋은 자리. 없으면 null */
export function place(L: Level): Placement | null {
  const G = gravs(L);
  const plan = planOf(L, G);
  const sim = new Sim();
  const sol = L.meta.solution;
  flyPlanned(sim, L, sol.angle, sol.launch_step, G, plan);
  const solPath = sample(sim.path);

  const flights: Flight[] = [];
  for (let a = FROM; a < TO; a += STEP) {
    const r = flyPlanned(sim, L, a, sol.launch_step, G, plan);
    flights.push({ a, win: r === 'win', path: sample(sim.path) });
  }

  // 격자 색인: 셀 → 그 셀을 지나는 비행 번호(도착하는 것만)
  const cells = new Map<string, Set<number>>();
  const key = (x: number, y: number): string => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
  flights.forEach((f, i) => {
    if (!f.win) return;
    for (let k = 0; k + 1 < f.path.length; k += 2) {
      const kk = key(f.path[k]!, f.path[k + 1]!);
      let s = cells.get(kk);
      if (!s) { s = new Set(); cells.set(kk, s); }
      s.add(i);
    }
  });

  const seen = new Set<string>();
  let best: Placement | null = null;
  const need = COLLECT_R + COLLECT_DETOUR + 2;
  for (const f of flights) {
    if (!f.win) continue;
    const n = f.path.length / 2;
    // 출발 뒤 0.3초, 도착 전 0.2초는 뺀다
    for (let i = Math.round(0.3 * 240 / SAMPLE); i < n - Math.round(0.2 * 240 / SAMPLE); i += CAND_EVERY) {
      const x = Math.round(f.path[i * 2]! / 4) * 4, y = Math.round(f.path[i * 2 + 1]! / 4) * 4;
      const kk = `${x},${y}`;
      if (seen.has(kk)) continue;
      seen.add(kk);
      if (!clearAt(L, x, y)) continue;
      const solDist = pathMinDist(solPath as unknown as number[], x, y);
      if (solDist < need) continue;
      // 이 점을 스치며 도착하는 각도들
      const near = new Set<number>();
      const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        for (const fi of cells.get(`${cx + dx},${cy + dy}`) ?? []) near.add(fi);
      }
      const wins: number[] = [];
      for (const fi of [...near].sort((p, q) => p - q)) {
        if (pathMinDist(flights[fi]!.path as unknown as number[], x, y) < COLLECT_R - 1) wins.push(flights[fi]!.a);
      }
      let width = 0;
      for (const r of runsOf(wins)) width = Math.max(width, widthOf(r));
      if (width < WANT_WINDOW) continue;
      // 폭(최대 4°)과 정답에서 먼 정도(최대 40 유닛)를 같이 본다
      const score = Math.min(width, 4) + Math.min(solDist, 40) / 10;
      if (!best || score > best.score) best = { x, y, width, solDist, score };
    }
  }
  return best;
}

function writeLevel(L: Level, n: number, p: Placement): void {
  const next = { ...L, messier: { n, x: p.x, y: p.y } } as Level;
  next.meta = { ...next.meta, updated: new Date().toISOString().slice(0, 10) };
  const out: Record<string, unknown> = {};
  for (const k of SAVE_KEYS) {
    const v = (next as unknown as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  // 놓은 뒤 규칙 전부를 한 번 더 본다 — 통과하지 않으면 쓰지 않는다
  const rep = checkLevel(next);
  if (rep.failures.length) {
    console.log(`  ✗ ${L.id}: 놓았지만 검증에 걸린다\n    ${rep.failures.join('\n    ')}`);
    return;
  }
  writeFileSync(join(DATA_DIR, `${L.id}.json`), JSON.stringify(out, null, 2) + '\n');
  const cm = collectMetrics(next);
  console.log(`  ✓ ${L.id}: M${n} → (${p.x}, ${p.y})  폭 ${cm.width.toFixed(2)}°  정답에서 ${p.solDist.toFixed(0)}`);
}

function chapter(ch: number): void {
  const ids = idsOf(ch);
  const scored = ids.map((id) => {
    const L = loadLevel(id);
    const started = Date.now();
    const p = place(L);
    console.log(`  ${id}: ${p ? `후보 폭 ${p.width.toFixed(2)}° 정답에서 ${p.solDist.toFixed(0)} (점수 ${p.score.toFixed(2)})` : '자리 없음'}  ${((Date.now() - started) / 1000).toFixed(1)}초`);
    return { L, p };
  });
  const picks = scored.filter((s) => s.p).sort((a, b) => b.p!.score - a.p!.score).slice(0, PER_CHAPTER)
    .sort((a, b) => a.L.meta.slot - b.L.meta.slot);
  const nums = STAGE_MESSIER.slice((ch - 1) * PER_CHAPTER, ch * PER_CHAPTER);
  picks.forEach((s, i) => writeLevel(s.L, nums[i]!, s.p!));
  // 고르지 않은 칸에 전에 놓인 것이 있으면 뺀다 — 장마다 넷을 지킨다
  for (const s of scored) {
    if (picks.includes(s) || !s.L.messier) continue;
    const { messier: _m, ...rest } = s.L;
    const out: Record<string, unknown> = {};
    for (const k of SAVE_KEYS) {
      const v = (rest as unknown as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = v;
    }
    writeFileSync(join(DATA_DIR, `${s.L.id}.json`), JSON.stringify(out, null, 2) + '\n');
    console.log(`  − ${s.L.id}: 뺐다`);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--all')) {
    for (const c of CHAPTERS) { console.log(`${c.chapter}장`); chapter(c.chapter); }
    return;
  }
  const ci = args.indexOf('--chapter');
  if (ci >= 0) { chapter(Number(args[ci + 1])); return; }
  const [id, n] = args;
  if (!id || !n) { console.log('사용법: npm run messier -- --all | --chapter N | <id> <n>'); return; }
  const L = loadLevel(id);
  const p = place(L);
  if (!p) { console.log(`  ${id}: 자리가 없다`); process.exitCode = 1; return; }
  writeLevel(L, Number(n), p);
}

main();
