// 분사 단계의 지표 (§22.2). 6장부터.
//
// 분사 단계의 정답은 "θ 로 쏘고, n 스텝째에 이쪽으로 꺾는다"이다. 사람은 같은 순간에
// 같은 곳을 탭하지 못하므로, 정답 하나가 풀린다는 것만으로는 부족하다 — 각도·타이밍·
// 꺾는 각도 셋 다 여유가 있어야 한다. 여유를 잴 때 분사는 **진행 방향 기준**(왼쪽으로
// 40°)으로 다시 건다. 발사 각도를 조금 틀면 그 순간의 진행 방향도 바뀌는데, 사람은
// "그때 왼쪽을 탭"하지 "화면의 같은 점을 탭"하지 않는다.
//
// DOM·브라우저·Node API 를 import 하지 않는다 (§0.3).

import { DT, TURN_MAX } from '../core/constants.js';
import { inArc } from '../core/angle.js';
import { gravs } from '../core/physics.js';
import { Sim } from '../core/simulate.js';
import type { Grav, Level, Outcome, Turn } from '../core/types.js';
import { FROM, type Run, STEP, TO, runsOf } from './scan.js';

/** 규칙 11 — 분사 타이밍의 연속 성공 폭(초). 사람의 탭은 ±0.1초쯤 흔들린다 */
export const MIN_TURN_TIMING = 0.15;
/**
 * 규칙 11 — **탭 방향**의 연속 성공 폭(°). 진행 방향에서 40° 넘게 벗어난 곳을 탭하면
 * 모두 40° 꺾이므로(TURN_MAX), 최대로 꺾는 정답은 "옆쪽 아무 데나"가 다 통한다.
 * 덜 꺾어야 하는 정답일수록 이 폭이 좁아진다.
 */
export const MIN_TURN_DELTA = 20;
/** 타이밍을 훑는 범위(스텝, ±). 0.4초 */
const TIMING_SPAN = 96;
const TIMING_STEP = 2;

/**
 * 성공 구간 중 **걸을 수 있는 범위(±ARC) 안** 부분만 (§5.9). 게임은 조준을 그 범위로
 * 자르므로(clampArc) 범위 밖 성공은 사람이 쏠 수 없다. 규칙 10 이 이걸 본다.
 */
export function arcRuns(L: Level, runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const [a0, a1] of runs) {
    let cur: Run | null = null;
    for (let a = a0; a <= a1 + 1e-9; a += STEP) {
      if (inArc(L, a)) { if (cur) cur[1] = a; else { cur = [a, a]; out.push(cur); } }
      else cur = null;
    }
  }
  return out;
}

/** 진행 방향 기준 분사. delta 는 ±TURN_MAX 안 (°) */
export interface RelTurn { step: number; delta: number }

const heading = (vx: number, vy: number): number => Math.atan2(vy, vx) * 180 / Math.PI;
const wrap = (d: number): number => d - 360 * Math.round(d / 360);
const clampTurn = (d: number): number => Math.max(-TURN_MAX, Math.min(TURN_MAX, d));

/** 저장된 정답 분사(절대 방향)를 진행 방향 기준으로 바꾼다. 정답 비행을 한 번 날려 잰다 */
export function relTurns(
  L: Level, angle: number, launchStep: number, turns: Turn[], G?: Grav[],
): RelTurn[] {
  const sim = new Sim();
  sim.begin(L, angle, launchStep, G);
  const plan = [...turns].sort((a, b) => a.step - b.step);
  const out: RelTurn[] = [];
  let i = 0;
  let r: Outcome | '' = '';
  while (!r && i < plan.length) {
    if (plan[i]!.step === sim.flightStep) {
      const t = plan[i++]!;
      out.push({ step: t.step, delta: clampTurn(wrap(t.dir - heading(sim.ship.vx, sim.ship.vy))) });
      sim.queueTurn(t.dir);
    }
    r = sim.step();
  }
  return out;
}

/** 진행 방향 기준 분사로 한 번 날린다. 같은 Sim 을 되쓴다 */
export function flyRel(
  sim: Sim, L: Level, angle: number, launchStep: number, G: Grav[], rel: RelTurn[],
): Outcome {
  sim.begin(L, angle, launchStep, G);
  let i = 0;
  let r: Outcome | '' = '';
  while (!r) {
    while (i < rel.length && rel[i]!.step < sim.flightStep) i++;   // 지나간 것은 버린다
    if (i < rel.length && rel[i]!.step === sim.flightStep) {
      sim.queueTurn(heading(sim.ship.vx, sim.ship.vy) + rel[i++]!.delta);
    }
    r = sim.step();
  }
  return r;
}

/** 분사를 진행 방향 기준으로 건 채 전 각도를 훑는다 (규칙 1 의 폭) */
export function turnAngleRuns(L: Level, launchStep: number, rel: RelTurn[], G?: Grav[]): Run[] {
  const g = G ?? gravs(L);
  const sim = new Sim();
  const wins: number[] = [];
  for (let a = FROM; a < TO; a += STEP) {
    if (flyRel(sim, L, a, launchStep, g, rel) === 'win') wins.push(a);
  }
  return runsOf(wins);
}

/** 정답을 포함하는 연속 성공 구간의 폭. 성공 목록은 step 간격으로 훑은 오프셋 */
function spanAround(ok: (off: number) => boolean, lo: number, hi: number, step: number): number {
  if (!ok(0)) return 0;
  let a = 0, b = 0;
  while (a - step >= lo && ok(a - step)) a -= step;
  while (b + step <= hi && ok(b + step)) b += step;
  return b - a + step;
}

/**
 * 분사마다 타이밍(초)과 꺾는 각도(°)의 연속 성공 폭. 여럿이면 가장 좁은 것 —
 * 사람은 가장 까다로운 한 번에서 실패한다.
 */
export function turnTolerance(
  L: Level, angle: number, launchStep: number, rel: RelTurn[], G?: Grav[],
): { timing: number; delta: number } {
  const g = G ?? gravs(L);
  const sim = new Sim();
  let timing = Infinity, delta = Infinity;
  rel.forEach((t, j) => {
    const prevStep = j > 0 ? rel[j - 1]!.step : 0;
    const nextStep = j + 1 < rel.length ? rel[j + 1]!.step : Infinity;
    const shifted = (off: number): boolean => {
      const s = t.step + off;
      if (s < 0 || s <= (j > 0 ? prevStep : -1) || s >= nextStep) return false;
      const r2 = rel.map((x, k) => (k === j ? { step: s, delta: x.delta } : x));
      return flyRel(sim, L, angle, launchStep, g, r2) === 'win';
    };
    timing = Math.min(timing,
      spanAround(shifted, -TIMING_SPAN, TIMING_SPAN, TIMING_STEP) * DT);

    // 탭 방향: 진행 방향 기준 0~180° 를 같은 쪽으로 1° 씩. 최대로 꺾는 정답은
    // "옆으로 90°" 를 대표로 잡는다 — 사람은 대개 옆쪽을 탭한다
    const sign = t.delta >= 0 ? 1 : -1;
    const q0 = Math.abs(t.delta) >= TURN_MAX - 1e-9 ? 90 : Math.abs(t.delta);
    const tapped = (off: number): boolean => {
      const q = q0 + off;
      if (q < 0 || q > 179) return false;   // 180° 는 반대쪽으로 감긴다
      const r2 = rel.map((x, k) => (k === j ? { step: x.step, delta: sign * q } : x));
      return flyRel(sim, L, angle, launchStep, g, r2) === 'win';
    };
    delta = Math.min(delta, spanAround(tapped, -180, 180, 1));
  });
  return { timing: Number.isFinite(timing) ? timing : 0, delta: Number.isFinite(delta) ? delta : 0 };
}
