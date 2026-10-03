// 궤도 행성 단계의 지표 (§22.4). 7장부터.
//
// 정답은 "θ 로 쏘고, 붙잡히면 링 위 φ 자리에서 탭한다"이다. 사람은 시각이 아니라
// **자리**를 보고 탭한다 — 로켓이 굴 쪽을 향하는 순간. 그래서 여유를 잴 때 나가기는
// 링 위의 각도 φ 로 다시 건다. 발사 각도를 조금 틀어도 붙잡히는 자리와 시각만 바뀔 뿐
// φ 에서 나가면 같은 길을 간다.
//
// DOM·브라우저·Node API 를 import 하지 않는다 (§0.3).

import { DOCK_LAP } from '../core/constants.js';
import { gravs } from '../core/physics.js';
import { Sim } from '../core/simulate.js';
import type { Grav, Level, Outcome } from '../core/types.js';
import { FROM, type Run, STEP, TO, runsOf } from './scan.js';

/** 규칙 13 — 나가기 타이밍의 연속 성공 폭(초). 분사(규칙 11)와 같은 기준 */
export const MIN_RELEASE_TIMING = 0.15;
/** 링을 도는 각속도(°/초) */
export const DOCK_DEG_PER_S = 360 / DOCK_LAP;

const wrap = (d: number): number => d - 360 * Math.round(d / 360);
const ringAngle = (sim: Sim): number => {
  const o = sim.docked!;
  return Math.atan2(sim.ship.y - o.dock.y, sim.ship.x - o.dock.x) * 180 / Math.PI;
};

/** 저장된 정답의 나가기(스텝)를 링 위 각도(°)로 바꾼다. 정답 비행을 한 번 날려 잰다 */
export function releasePhis(
  L: Level, angle: number, launchStep: number, releases: number[], G?: Grav[],
): number[] {
  const sim = new Sim();
  sim.begin(L, angle, launchStep, G);
  const plan = [...releases].sort((a, b) => a - b);
  const out: number[] = [];
  let i = 0;
  let r: Outcome | '' = '';
  while (!r && i < plan.length) {
    if (plan[i] === sim.flightStep) {
      if (sim.docked) { out.push(ringAngle(sim)); sim.queueRelease(); }
      i++;
    }
    r = sim.step();
  }
  return out;
}

/**
 * 붙잡힐 때마다 링 위 φ_k 를 지나는 순간 나간다. 그 자리를 지나기 전에 두 바퀴가
 * 차면(붙잡힌 자리가 φ 바로 뒤라 한 바퀴를 기다리는 것까지는 된다) 저절로 나간다.
 */
export function flyDock(
  sim: Sim, L: Level, angle: number, launchStep: number, G: Grav[], phis: number[],
): Outcome {
  sim.begin(L, angle, launchStep, G);
  let k = 0;
  let prev: number | null = null;
  let r: Outcome | '' = '';
  while (!r) {
    if (sim.docked && k < phis.length) {
      const d = wrap(ringAngle(sim) - phis[k]!);
      // 부호가 바뀌고 차이가 작으면 φ 를 지난 것이다(도는 쪽과 상관없이)
      if (prev !== null && Math.sign(d) !== Math.sign(prev) && Math.abs(d) < 10) {
        sim.queueRelease();
        k++;
        prev = null;
      } else prev = d;
    } else prev = null;
    r = sim.step();
  }
  return r;
}

/** 나가기를 링 위 각도로 건 채 전 각도를 훑는다 (규칙 1 의 폭) */
export function dockAngleRuns(L: Level, launchStep: number, phis: number[], G?: Grav[]): Run[] {
  const g = G ?? gravs(L);
  const sim = new Sim();
  const wins: number[] = [];
  for (let a = FROM; a < TO; a += STEP) {
    if (flyDock(sim, L, a, launchStep, g, phis) === 'win') wins.push(a);
  }
  return runsOf(wins);
}

/** 나가기마다 링 위 각도의 연속 성공 폭을 초로. 여럿이면 가장 좁은 것 */
export function releaseTolerance(
  L: Level, angle: number, launchStep: number, phis: number[], G?: Grav[],
): number {
  const g = G ?? gravs(L);
  const sim = new Sim();
  let worst = Infinity;
  phis.forEach((phi, j) => {
    const ok = (off: number): boolean => {
      const p2 = phis.map((x, k) => (k === j ? phi + off : x));
      return flyDock(sim, L, angle, launchStep, g, p2) === 'win';
    };
    if (!ok(0)) { worst = 0; return; }
    let a = 0, b = 0;
    while (a - 1 >= -90 && ok(a - 1)) a -= 1;
    while (b + 1 <= 90 && ok(b + 1)) b += 1;
    worst = Math.min(worst, (b - a + 1) / DOCK_DEG_PER_S);
  });
  return Number.isFinite(worst) ? worst : 0;
}
