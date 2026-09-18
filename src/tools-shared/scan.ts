// 각도 전수 스캔. docs/PLAN.md §8.4 2단계, §16.1
//
// DOM 을 import 하지 않는다. CLI 와 에디터가 공용으로 쓴다 (§0.3).

import { DT } from '../core/constants.js';
import { Sim } from '../core/simulate.js';
import { gravs } from '../core/physics.js';
import type { Grav, Level, Outcome } from '../core/types.js';

export const STEP = 0.25;
export const FROM = -180;
export const TO = 180;

export type Run = [number, number];

export interface ScanResult {
  counts: Partial<Record<Outcome, number>>;
  runs: Run[];
}

/** 공전 행성이 있으면 그 행성, 없으면 undefined. 여러 개면 첫 번째. */
export function orbiter(L: Level) {
  return (L.planets ?? []).find((p) => p.orbit);
}

/**
 * 훑어 볼 발사 시점(스텝 단위). 고정 단계는 [0] 하나.
 * 공전 단계는 주기를 `divisions` 등분한다 — solve 는 12(§16.1),
 * 검증기와 생성기는 24(§8.4, §8.9.1)를 쓴다.
 */
export function launchSteps(L: Level, divisions: number): number[] {
  const o = orbiter(L)?.orbit;
  if (!o) return [0];
  const period = Math.abs(o.period);
  return Array.from({ length: divisions }, (_, k) =>
    Math.round(k * period / divisions / DT));
}

/**
 * 전 각도 스캔. `step` 은 검증용 0.25° 가 기본이고, 에디터의 1차 대략 스캔만
 * 1° 를 넘긴다(§8.7). **기준값(§6.2)은 언제나 0.25° 다** — 대략 스캔의 결과를
 * 기록하거나 규칙 판정에 쓰지 않는다.
 */
export function angles(L: Level, launchStep: number, Gin?: Grav[], step = STEP): ScanResult {
  const sim = new Sim();
  const G = Gin ?? gravs(L);
  const counts: Partial<Record<Outcome, number>> = {};
  const wins: number[] = [];

  for (let a = FROM; a < TO; a += step) {
    const r = sim.simulate(L, a, launchStep, G);
    counts[r] = (counts[r] ?? 0) + 1;
    if (r === 'win') wins.push(a);
  }
  return { counts, runs: runsOf(wins, step) };
}

/** 연속한 성공 각도를 구간으로 묶는다. 부록 C 와 같은 판정. */
export function runsOf(wins: number[], step = STEP): Run[] {
  const runs: Run[] = [];
  for (const a of wins) {
    const last = runs[runs.length - 1];
    if (last && Math.abs(a - last[1] - step) < 1e-6) last[1] = a;
    else runs.push([a, a]);
  }
  return runs;
}

/** 구간 폭 (끝 − 시작 + step). §6.2 의 "폭"과 같은 정의. */
export function widthOf(r: Run, step = STEP): number {
  return r[1] - r[0] + step;
}

/** 폭 1° 이상인 구간만. 그보다 좁은 것은 §8.5 규칙 2 가 허용하는 우연이다. */
export function mainRuns(runs: Run[]): Run[] {
  return runs.filter((r) => widthOf(r) >= 1);
}
