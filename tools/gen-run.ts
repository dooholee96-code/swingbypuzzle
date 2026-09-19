// 생성기 워커 풀. docs/PLAN.md §8.4 병렬화
//
// `npm run gen`(칸 하나)과 `npm run build-chapter`(장 전체)가 같이 쓴다.

import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import type { Candidate } from '../src/tools-shared/generator.js';
import type { Recipe, SlotRecipe } from '../src/tools-shared/recipe.js';
import type { Done, Job, Progress } from './gen-worker.js';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const REJECT_LABEL: Record<string, string> = {
  place: '배치 실패(제약을 못 맞춤)',
  goal: '쓸 만한 목적지 칸 없음',
  shortcut: '지름길을 막을 자리 없음',
  rocks: '소행성 한도 초과',
  timing: '공전 타이밍 비율이 범위 밖',
  nowin: '성공 각도 없음',
  rules: '검증 규칙(§8.5) 불통과',
};

export interface RunResult {
  candidates: Candidate[];
  rejected: Record<string, number>;
  seconds: number;
}

export function threadCount(): number {
  return Math.max(1, Math.min(cpus().length, 8));
}

/**
 * 시드 1..seeds 를 스레드에 나눠 돌린다.
 * `onTick` 이 있으면 10초마다 진행률을 알려 준다.
 */
export async function runSlot(
  recipe: Recipe, slot: SlotRecipe, seeds: number,
  onTick?: (tried: number, found: number, secs: number) => void,
): Promise<RunResult> {
  const threads = threadCount();
  const started = Date.now();
  const per = Math.ceil(seeds / threads);
  const tally = { tried: 0 };
  const rejected: Record<string, number> = {};
  const all: Candidate[] = [];

  const ticker = onTick
    ? setInterval(() => onTick(tally.tried, all.length, (Date.now() - started) / 1000), 10_000)
    : undefined;

  await Promise.all(Array.from({ length: threads }, (_, k) => new Promise<void>((ok, no) => {
    const from = k * per + 1;
    const to = Math.min((k + 1) * per, seeds) + 1;
    if (from >= to) { ok(); return; }
    const job: Job = { recipe, slot, from, to };
    // 워커는 부모의 tsx 로더를 물려받지 않는다. 부트스트랩이 걸어 준다.
    const w = new Worker(join(ROOT, 'tools/gen-worker-boot.mjs'), { workerData: job });
    let mine = 0;
    w.on('message', (m: Progress | Done) => {
      tally.tried += m.tried - mine;
      mine = m.tried;
      if (m.kind === 'done') {
        all.push(...m.candidates);
        for (const [k2, v] of Object.entries(m.rejected)) rejected[k2] = (rejected[k2] ?? 0) + v;
      }
    });
    w.on('error', no);
    w.on('exit', () => { ok(); });
  })));
  if (ticker) clearInterval(ticker);

  return { candidates: all, rejected, seconds: (Date.now() - started) / 1000 };
}

/** 정렬된 목록에서 고르게 n 개. 양 끝을 포함한다 (§8.4 8단계). */
export function spread<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  return Array.from({ length: n }, (_, i) =>
    list[Math.round(i * (list.length - 1) / (n - 1))]!);
}

/**
 * 한 칸에 채택할 후보를 고른다.
 *
 * **성공 폭이 레시피 범위 한가운데에 가장 가까운 것.** §8.4 4단계가 목적지
 * 칸을 고를 때 쓴 기준과 같다 — 범위 가장자리에 걸친 단계는 수치를 조금만
 * 건드려도 규칙 밖으로 나간다. 같으면 `clearance` 가 넉넉한 쪽.
 */
export function bestOf(list: Candidate[], window: { min: number; max: number }): Candidate | null {
  const mid = (window.min + window.max) / 2;
  let best: Candidate | null = null;
  let bestScore = Infinity;
  for (const c of list) {
    const score = Math.abs(c.main_window - mid);
    if (score < bestScore || (score === bestScore && best && c.clearance > best.clearance)) {
      best = c; bestScore = score;
    }
  }
  return best;
}
