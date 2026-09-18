// 각도 전수 스캔. docs/PLAN.md §8.4 2단계, §16.1
//
// DOM 을 import 하지 않는다. CLI 와 에디터가 공용으로 쓴다 (§0.3).

import { Sim } from '../core/simulate.js';
import { gravs } from '../core/physics.js';
import type { Level, Outcome } from '../core/types.js';

export const STEP = 0.25;
export const FROM = -180;
export const TO = 180;

export type Run = [number, number];

export interface ScanResult {
  counts: Partial<Record<Outcome, number>>;
  runs: Run[];
}

export function angles(L: Level, launchStep: number): ScanResult {
  const sim = new Sim();
  const G = gravs(L);
  const counts: Partial<Record<Outcome, number>> = {};
  const wins: number[] = [];

  for (let a = FROM; a < TO; a += STEP) {
    const r = sim.simulate(L, a, launchStep, G);
    counts[r] = (counts[r] ?? 0) + 1;
    if (r === 'win') wins.push(a);
  }
  return { counts, runs: runsOf(wins) };
}

/** 연속한 성공 각도를 구간으로 묶는다. 부록 C 와 같은 판정. */
export function runsOf(wins: number[]): Run[] {
  const runs: Run[] = [];
  for (const a of wins) {
    const last = runs[runs.length - 1];
    if (last && Math.abs(a - last[1] - STEP) < 1e-6) last[1] = a;
    else runs.push([a, a]);
  }
  return runs;
}

/** 구간 폭 (끝 − 시작 + STEP). §6.2 의 "폭"과 같은 정의. */
export function widthOf(r: Run): number {
  return r[1] - r[0] + STEP;
}

/** 폭 1° 이상인 구간만. 그보다 좁은 것은 §8.5 규칙 2 가 허용하는 우연이다. */
export function mainRuns(runs: Run[]): Run[] {
  return runs.filter((r) => widthOf(r) >= 1);
}
