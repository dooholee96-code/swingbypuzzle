// 메시에 천체를 지나는 길 (§22.7, 규칙 14). 배치 도구와 검증기가 같은 코드를 쓴다.
//
// "모을 수 있다"는 것은 **그 천체를 COLLECT_R 안으로 스치면서 도착하는** 발사 각도가
// 연속으로 MIN_COLLECT_WINDOW 이상 있다는 뜻이다. 실패한 비행에서 스쳐도 모이지만
// (사용자 결정), 규칙은 도착하는 길로 잰다 — 도착 못 할 길로만 모을 수 있으면 덫이다.
// 분사·궤도 행성 단계는 정답의 분사·나가기를 건 채 잰다(turns.ts, docks.ts 와 같은 방식).
//
// DOM·브라우저 API 를 import 하지 않는다 (§0.3).

import { gravs } from '../core/physics.js';
import { Sim } from '../core/simulate.js';
import type { Grav, Level, Outcome } from '../core/types.js';
import { releasePhis, flyDock } from './docks.js';
import { COLLECT_R } from './messier.js';
import { FROM, type Run, STEP, TO, runsOf, widthOf } from './scan.js';
import { type RelTurn, flyRel, relTurns } from './turns.js';

/** 규칙 14 — 천체를 지나며 도착하는 각도의 연속 폭(°) */
export const MIN_COLLECT_WINDOW = 1.5;
/**
 * 규칙 14 — 정답 경로는 천체에서 COLLECT_R + 이만큼 더 떨어져 있어야 한다. 정답 각도로는
 * 못 모으고, 성공 구간의 **가장자리** 각도(가운데에서 2~3°)로 지나야 모인다 — "조금 비켜난 곳".
 * 더 멀리 두면 스테이지 크기(400×740)에서는 지나며 도착하는 길이 1.5° 가 안 나온다(재 봤다).
 */
export const COLLECT_DETOUR = 4;

export interface CollectMetrics {
  /** 지나며 도착하는 가장 넓은 연속 폭(°) */
  width: number;
  /** 저장된 정답 경로가 천체에 가장 가까이 간 거리 */
  solution_dist: number;
  runs: Run[];
}

/** 정답이 분사·나가기를 쓰면 그 계획. 전 각도 스캔에 같은 계획을 건다 */
export interface FlightPlan { rel?: RelTurn[]; phis?: number[] }

export function planOf(L: Level, G: Grav[]): FlightPlan {
  const sol = L.meta.solution;
  if ((L.turns ?? 0) > 0 && sol.turns?.length) {
    return { rel: relTurns(L, sol.angle, sol.launch_step, sol.turns, G) };
  }
  if (L.docks?.length && sol.releases?.length) {
    return { phis: releasePhis(L, sol.angle, sol.launch_step, sol.releases, G) };
  }
  return {};
}

/** 한 번 날린다. 경로를 기록해 둔다(sim.path) */
export function flyPlanned(
  sim: Sim, L: Level, angle: number, launchStep: number, G: Grav[], plan: FlightPlan,
): Outcome {
  sim.recordPath = true;
  if (plan.rel) return flyRel(sim, L, angle, launchStep, G, plan.rel);
  if (plan.phis) return flyDock(sim, L, angle, launchStep, G, plan.phis);
  return sim.simulate(L, angle, launchStep, G);
}

/** 기록된 경로가 (px, py)에 가장 가까이 간 거리 */
export function pathMinDist(path: readonly number[], px: number, py: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < path.length; i += 2) {
    const dx = path[i]! - px, dy = path[i + 1]! - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

/**
 * 규칙 14 의 지표. 전 각도를 정답의 계획대로 날려, 천체를 COLLECT_R 안으로 스치며 도착하는
 * 각도를 묶는다. 분사 단계는 scan.ts 의 angles() 처럼 한 번 더 전수 스캔이라 비용이 그만큼이다.
 */
export function collectMetrics(L: Level, Gin?: Grav[]): CollectMetrics {
  const m = L.messier;
  if (!m) return { width: 0, solution_dist: Infinity, runs: [] };
  const G = Gin ?? gravs(L);
  const plan = planOf(L, G);
  const sim = new Sim();
  const sol = L.meta.solution;
  flyPlanned(sim, L, sol.angle, sol.launch_step, G, plan);
  const solution_dist = pathMinDist(sim.path, m.x, m.y);

  const wins: number[] = [];
  for (let a = FROM; a < TO; a += STEP) {
    if (flyPlanned(sim, L, a, sol.launch_step, G, plan) !== 'win') continue;
    if (pathMinDist(sim.path, m.x, m.y) < COLLECT_R) wins.push(a);
  }
  const runs = runsOf(wins);
  let width = 0;
  for (const r of runs) width = Math.max(width, widthOf(r));
  return { width, solution_dist, runs };
}
