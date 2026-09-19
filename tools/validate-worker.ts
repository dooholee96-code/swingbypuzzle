// 검증 워커. docs/PLAN.md §16.3
//
// 단계 목록을 받아 지표와 규칙 판정을 돌려준다. 공전 단계는 24번씩 스캔해야
// 해서 한 스레드로 돌리면 40단계에 몇 분이 걸린다 — 배포마다 도는 관문이다.

import { parentPort, workerData } from 'node:worker_threads';

import { checkLevel, computeMetrics } from '../src/tools-shared/metrics.js';
import { loadLevel } from './levels-fs.js';

export interface VJob { ids: string[] }
export interface VDone {
  id: string;
  failures: string[];
  warnings: string[];
  chapter: number;
  slot: number;
  metrics: ReturnType<typeof computeMetrics>;
}

const { ids } = workerData as VJob;
const out: (VDone | { id: string; error: string })[] = [];

for (const id of ids) {
  try {
    const lv = loadLevel(id);
    const m = computeMetrics(lv);
    const r = checkLevel(lv, m);
    out.push({
      id, failures: r.failures, warnings: r.warnings,
      chapter: lv.meta.chapter, slot: lv.meta.slot, metrics: m,
    });
  } catch (e) {
    out.push({ id, error: e instanceof Error ? e.message : String(e) });
  }
}

parentPort?.postMessage(out);
