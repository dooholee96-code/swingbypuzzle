// 생성기 워커. docs/PLAN.md §8.4 병렬화
//
// 시드 구간 하나를 받아 후보를 만든다. 레벨 객체를 공유하지 않으므로
// (§5.5 의 nextFire 분리 덕분에) 스레드끼리 간섭하지 않는다.

import { parentPort, workerData } from 'node:worker_threads';

import { type Candidate, type Reject, generateOne } from '../src/tools-shared/generator.js';
import type { Recipe, SlotRecipe } from '../src/tools-shared/recipe.js';

export interface Job {
  recipe: Recipe;
  slot: SlotRecipe;
  from: number;
  to: number;
}
export interface Progress { kind: 'progress'; tried: number; found: number }
export interface Done {
  kind: 'done';
  candidates: Candidate[];
  tried: number;
  rejected: Record<string, number>;
}

const job = workerData as Job;
const found: Candidate[] = [];
const rejected: Record<string, number> = {};
let tried = 0;
let lastReport = Date.now();

for (let seed = job.from; seed < job.to; seed++) {
  tried++;
  const r = generateOne(job.recipe, job.slot, seed);
  if ('ok' in r) found.push(r.ok);
  else rejected[r.reject as Reject] = (rejected[r.reject as Reject] ?? 0) + 1;

  if (Date.now() - lastReport > 2000) {
    lastReport = Date.now();
    parentPort?.postMessage({ kind: 'progress', tried, found: found.length } satisfies Progress);
  }
}

parentPort?.postMessage({ kind: 'done', candidates: found, tried, rejected } satisfies Done);
