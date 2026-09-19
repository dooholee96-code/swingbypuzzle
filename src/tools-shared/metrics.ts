// 검증 지표·규칙·난이도 점수. docs/PLAN.md §8.5, §8.6
//
// CLI(tools/validate.ts)와 에디터가 **같은 코드**를 쓴다. 검증기가 통과시킨
// 단계와 에디터가 통과시킨 단계가 다르면 §8.1 의 "검증기가 모든 단계의
// 관문"이라는 원칙이 무너진다.
//
// DOM·브라우저·Node API 를 import 하지 않는다 (§0.3).

import { ARC, DT, PAD_R, REF_H, REF_W, SHIP_R } from '../core/constants.js';
import { inArc, padAngle, quantize } from '../core/angle.js';
import { bodyPos, dist, gravs } from '../core/physics.js';
import { Sim } from '../core/simulate.js';
import type { Grav, Hole, Level, Planet, Role } from '../core/types.js';
import { type Run, angles, launchSteps, orbiter, widthOf } from './scan.js';

/** 검증기와 생성기의 발사 시점 등분 수 (§8.4 6단계, §8.9.1). */
export const DIVISIONS = 24;

// §8.5 필수 규칙의 임계값
export const MIN_WINDOW = 2.5;          // 규칙 1
export const FLUKE_EACH = 1;            // 규칙 2 — 주 구간 외 각 구간
export const FLUKE_TOTAL = 2;           // 규칙 2 — 합계
export const MAX_FLIGHT_TIME = 15;      // 규칙 4
export const MIN_CLEARANCE = 6;         // 규칙 5

// §8.5 경고의 임계값
export const WARN_CLEARANCE = 10;
export const WARN_LAUNCH_ACCEL = 1;     // u/s². 1-4(2.45)와 4-1(13.35)이 여기 걸린다

/** 돔 표면을 훑는 간격(°). 규칙 8 과 발사 지점 가속도 경고가 쓴다. */
const DOME_STEP = 0.5;

export interface Flukes { runs: Run[]; total: number }

export interface LevelMetrics {
  /**
   * 가장 넓은 연속 성공 구간 폭. 공전 단계는 §8.5 대로 **최적 발사 시점** 기준이다.
   * 규칙 1 과 난이도 점수가 이 값을 본다 — "가장 잘 쳤을 때 이 단계가 얼마나 너그러운가".
   */
  main_window: number;
  /**
   * 저장된 `solution.launch_step` 에서의 폭. 고정 단계는 main_window 와 같다.
   * **힌트의 방향 표시(§14.3)가 쓰는 값은 이쪽이다** — 그 호는 저장된 정답 각도를
   * 중심으로 그리므로, 최적 시점의 폭을 쓰면 호가 실제보다 넓게 그려진다.
   */
  main_window_at_solution: number;
  /** main_window 를 낸 발사 스텝. 고정 단계는 0. */
  best_launch_step: number;
  /** 주 구간 중앙 각도(0.5° 반올림). 저장된 solution 과 다를 수 있다 */
  center_angle: number | null;
  main_run: Run | null;
  flukes: Flukes;
  essential: { index: number; kind: 'planet' | 'hole'; role: Role; essential: boolean }[];
  timing_fraction?: number;
  flight_time: number;
  clearance: number;
  /** 정답 θ 의 발사 지점 합산 가속도 (u/s²). §6.2 의 표와 같은 값 */
  launch_accel: number;
  /** 돔 표면 전체의 최댓값 */
  dome_accel_max: number;
  /** 충돌 판정 안에 들어간 돔 표면 각도(°). 비어 있으면 규칙 8 통과 */
  dome_blocked: number[];
  difficulty: number;
}

// ── 역할 ────────────────────────────────────────────────────────────

/** 생략하면 고정 중력원은 required, 공전 행성은 gate (§6.1). */
export function roleOf(b: Grav): Role {
  if (b.role) return b.role;
  return (b as Planet).orbit ? 'gate' : 'required';
}

/** 중력원을 (종류, 원본 배열 안 번호)와 함께 훑는다. */
export function gravEntries(L: Level): { b: Grav; kind: 'planet' | 'hole'; index: number }[] {
  return [
    ...(L.planets ?? []).map((b, index) => ({ b: b as Grav, kind: 'planet' as const, index })),
    ...(L.holes ?? []).map((b, index) => ({ b: b as Grav, kind: 'hole' as const, index })),
  ];
}

// ── 여유 거리 ────────────────────────────────────────────────────────

/**
 * (x, y)에서 가장 가까운 충돌 판정 경계까지의 거리. 음수면 판정 안이다.
 * 판정 반경은 §5.4 의 값을 그대로 쓴다 — 여기서 다른 값을 쓰면 검증기가
 * 통과시킨 단계가 게임에서 부딪힌다.
 */
export function marginAt(L: Level, x: number, y: number, t: number): number {
  let best = Infinity;
  for (const p of L.planets ?? []) {
    const [px, py] = bodyPos(p, t);
    best = Math.min(best, dist(px, py, x, y) - (p.r + SHIP_R));
  }
  for (const h of L.holes ?? []) best = Math.min(best, dist(h.x, h.y, x, y) - (h.rH + 2));
  for (const a of L.rocks ?? []) best = Math.min(best, dist(a.x, a.y, x, y) - (a.r * 0.85 + SHIP_R));
  return best;
}

export interface FlightMeasure { clearance: number; flight_time: number; outcome: string }

/** 정답 경로를 한 번 날려 `clearance` 와 비행 시간을 잰다 (§8.5). */
export function measureFlight(L: Level, angle: number, launchStep: number, G?: Grav[]): FlightMeasure {
  const sim = new Sim();
  sim.begin(L, angle, launchStep, G);
  // 출발점도 경로의 일부다
  let best = marginAt(L, sim.ship.x, sim.ship.y, sim.time);
  let r: '' | string = '';
  while (!r) {
    r = sim.step();
    // step() 이 돌아온 시점의 sim.time 은 지금 우주선이 있는 자리의 시각이다
    best = Math.min(best, marginAt(L, sim.ship.x, sim.ship.y, sim.time));
  }
  return { clearance: best, flight_time: sim.flightStep * DT, outcome: r };
}

// ── 돔 (§5.9, 규칙 8·9) ──────────────────────────────────────────────

/** 합산 가속도의 크기. accel() 은 성분을 주므로 여기서 길이를 낸다. */
function accelMag(G: Grav[], x: number, y: number, t: number): number {
  let ax = 0, ay = 0;
  for (const b of G) {
    const [bx, by] = bodyPos(b, t);
    const dx = bx - x, dy = by - y, r2 = dx * dx + dy * dy, R2 = b.R * b.R;
    if (r2 >= R2 || r2 < 1) continue;
    const r = Math.sqrt(r2), f = 1 - r / b.R, m = b.g * f * f;
    ax += m * dx / r;
    ay += m * dy / r;
  }
  return Math.sqrt(ax * ax + ay * ay);
}

export function launchAccel(L: Level, theta: number, launchStep: number, G?: Grav[]): number {
  const g = G ?? gravs(L);
  const a = theta * Math.PI / 180;
  return accelMag(g, L.start.x + PAD_R * Math.cos(a), L.start.y + PAD_R * Math.sin(a), launchStep * DT);
}

export interface DomeCheck {
  /** 판정 안에 들어간 표면 각도(°). 비어 있으면 규칙 8 통과 */
  blocked: number[];
  accelMax: number;
}

/**
 * 돔 표면(반경 PAD_R)을 훑는다. 규칙 8 은 물리적 유효성만 본다 — 표면의
 * 어느 지점도 행성·블랙홀·소행성의 충돌 판정 안에 들어가면 안 된다.
 * 무언가의 **안에서** 출발할 수는 없기 때문이다 (§6.2 결론).
 *
 * 공전 행성이 있으면 훑어 볼 발사 시점마다 반복한다. 표면이 시각에 따라
 * 막힐 수 있기 때문이다.
 */
export function checkDome(L: Level): DomeCheck {
  const G = gravs(L);
  const steps = launchSteps(L, DIVISIONS);
  const blocked: number[] = [];
  let accelMax = 0;
  for (const ls of steps) {
    const t = ls * DT;
    for (let d = 0; d < 360; d += DOME_STEP) {
      const a = d * Math.PI / 180;
      const x = L.start.x + PAD_R * Math.cos(a), y = L.start.y + PAD_R * Math.sin(a);
      if (marginAt(L, x, y, t) < 0 && !blocked.includes(d)) blocked.push(d);
      accelMax = Math.max(accelMax, accelMag(G, x, y, t));
    }
  }
  return { blocked, accelMax };
}

// ── 지표 ────────────────────────────────────────────────────────────

/** 주 구간(가장 넓은 성공 구간)과 그 밖의 우연한 성공 구간. */
export function splitRuns(runs: Run[]): { main: Run | null; flukes: Flukes } {
  let main: Run | null = null;
  for (const r of runs) if (!main || widthOf(r) > widthOf(main)) main = r;
  const rest = runs.filter((r) => r !== main);
  return { main, flukes: { runs: rest, total: rest.reduce((s, r) => s + widthOf(r), 0) } };
}

export interface WindowScan {
  launchStep: number;
  main: Run | null;
  width: number;
  flukes: Flukes;
}

/** 발사 시점 하나에서의 성공 구간. */
export function windowAt(L: Level, launchStep: number, G?: Grav[]): WindowScan {
  const { runs } = angles(L, launchStep, G);
  const { main, flukes } = splitRuns(runs);
  return { launchStep, main, width: main ? widthOf(main) : 0, flukes };
}

/**
 * 모든 발사 시점을 훑는다. 고정 단계는 한 번뿐이라 비용이 없고, 공전
 * 단계는 24번 스캔한다(§8.4). 여기가 검증기에서 가장 비싼 부분이다.
 */
export function scanWindows(L: Level, G?: Grav[]): WindowScan[] {
  const g = G ?? gravs(L);
  return launchSteps(L, DIVISIONS).map((ls) => windowAt(L, ls, g));
}

// ── 난이도 (§8.6) ────────────────────────────────────────────────────

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** 맵이 기준 뷰포트(§11)를 넘는 축의 수로 정해지는 G 항. */
export function sizeTerm(L: Level): number {
  const over = (L.w > REF_W ? 1 : 0) + (L.h > REF_H ? 1 : 0);
  return over === 2 ? 1 : over === 1 ? 0.5 : 0;
}

export function difficultyOf(
  L: Level,
  mainWindow: number,
  timingFraction: number | undefined,
): number {
  const required = gravEntries(L).filter((e) => roleOf(e.b) === 'required').length;
  const optionalHoles = (L.holes ?? []).filter((h) => roleOf(h as Hole) !== 'required').length;

  const A = clamp01((8 - mainWindow) / 5.5) * 3.0;
  const B = Math.min(Math.max(required - 1, 0) * 0.6, 1.8);
  const C = Math.min(((L.ufos ?? []).length + optionalHoles) * 0.4, 1.2);
  const E = clamp01((1.8 - L.preview) / 1.3) * 1.5;
  const F = timingFraction === undefined ? 0 : clamp01((0.5 - timingFraction) / 0.3) * 1.5;
  return A + B + C + E + F + sizeTerm(L);
}

// ── 전체 계산 ────────────────────────────────────────────────────────

/**
 * 한 단계의 지표 전부. 공전 단계는 24번 스캔하므로 몇 초 걸릴 수 있다.
 * `main_window` 는 §8.5 대로 **최적 발사 시점** 기준이다.
 */
export function computeMetrics(L: Level): LevelMetrics {
  const G = gravs(L);
  const scans = scanWindows(L, G);

  let best = scans[0]!;
  for (const s of scans) if (s.width > best.width) best = s;

  const orbiting = orbiter(L) !== undefined;
  // timing_fraction 의 정의: **규칙 1 의 하한(MIN_WINDOW)을 넘는 발사 시점의 비율.**
  // 생성기도 반드시 같은 문턱을 써야 한다 — 문턱이 다르면 생성기가 통과시킨
  // 값과 여기 기록되는 값이 어긋난다(M8 에서 실제로 겪었다).
  const timing_fraction = orbiting
    ? scans.filter((s) => s.width >= MIN_WINDOW).length / scans.length
    : undefined;

  const sol = L.meta.solution;
  const flight = measureFlight(L, sol.angle, sol.launch_step, G);
  const dome = checkDome(L);

  const essential = gravEntries(L).map((e) => ({
    index: e.index,
    kind: e.kind,
    role: roleOf(e.b),
    essential: isEssential(L, e),
  }));

  const atSolution = sol.launch_step === best.launchStep
    ? best
    : windowAt(L, sol.launch_step, G);

  const main_window = best.width;
  return {
    main_window,
    main_window_at_solution: atSolution.width,
    best_launch_step: best.launchStep,
    center_angle: best.main ? quantize((best.main[0] + best.main[1]) / 2) : null,
    main_run: best.main,
    flukes: best.flukes,
    essential,
    ...(timing_fraction === undefined ? {} : { timing_fraction }),
    flight_time: flight.flight_time,
    clearance: flight.clearance,
    launch_accel: launchAccel(L, sol.angle, sol.launch_step, G),
    dome_accel_max: dome.accelMax,
    dome_blocked: dome.blocked,
    difficulty: difficultyOf(L, main_window, timing_fraction),
  };
}

/** 그 중력원을 빼면 정답이 실패하는가 (§8.5 지표 `essential`). */
export function isEssential(L: Level, e: { kind: 'planet' | 'hole'; index: number }): boolean {
  const without: Level = e.kind === 'planet'
    ? { ...L, planets: (L.planets ?? []).filter((_, i) => i !== e.index) }
    : { ...L, holes: (L.holes ?? []).filter((_, i) => i !== e.index) };
  const sol = L.meta.solution;
  return new Sim().simulate(without, sol.angle, sol.launch_step) !== 'win';
}

// ── 규칙 (§8.5) ──────────────────────────────────────────────────────

export interface Report {
  id: string;
  metrics: LevelMetrics;
  failures: string[];
  warnings: string[];
}

/** 레시피가 정한 제약. 넘기면 규칙 1 의 최소 폭·규칙 6·"너무 쉬움" 경고가 켜진다. */
export interface RecipeLimits {
  window: { min: number; max: number };
  timing?: { minFraction: number; maxFraction: number } | null;
}

/**
 * 필수 규칙과 경고를 검사한다.
 *
 * `limits` 를 넘기지 않으면(등록된 단계를 그냥 검증할 때) 레시피에 기대는
 * 세 가지는 건너뛴다. 생성기는 언제나 넘긴다.
 */
export function checkLevel(L: Level, m = computeMetrics(L), limits?: RecipeLimits): Report {
  const failures: string[] = [];
  const warnings: string[] = [];
  const sol = L.meta.solution;

  // 1. 성공 폭 — 고정 하한과 레시피 최소 폭 중 큰 쪽
  const floor = Math.max(MIN_WINDOW, limits?.window.min ?? 0);
  if (m.main_window < floor) {
    failures.push(`규칙1 성공 폭 ${m.main_window.toFixed(2)}° < ${floor}°`);
  }

  // 2. 우연한 성공
  for (const r of m.flukes.runs) {
    if (widthOf(r) >= FLUKE_EACH) {
      failures.push(`규칙2 주 구간 외 ${r[0]}..${r[1]} 이 ${widthOf(r).toFixed(2)}° (1° 이상)`);
    }
  }
  if (m.flukes.total >= FLUKE_TOTAL) {
    failures.push(`규칙2 주 구간 외 합계 ${m.flukes.total.toFixed(2)}° (2° 이상)`);
  }

  // 3. required 는 모두 essential
  for (const e of m.essential) {
    if (e.role === 'required' && !e.essential) {
      failures.push(`규칙3 ${e.kind}[${e.index}] 가 required 인데 없어도 정답이 성공한다`);
    }
  }

  // 4. 비행 시간
  if (m.flight_time > MAX_FLIGHT_TIME) {
    failures.push(`규칙4 비행 시간 ${m.flight_time.toFixed(2)}초 > ${MAX_FLIGHT_TIME}초`);
  }

  // 5. 여유 거리
  if (m.clearance < MIN_CLEARANCE) {
    failures.push(`규칙5 clearance ${m.clearance.toFixed(2)} < ${MIN_CLEARANCE}유닛`);
  }

  // 7. 저장된 정답이 실제로 성공하는가
  const got = new Sim().simulate(L, sol.angle, sol.launch_step);
  if (got !== 'win') {
    failures.push(`규칙7 저장된 정답(${sol.angle}°, step ${sol.launch_step})의 결과가 ${got}`);
  }

  // 8. 돔 표면이 무언가의 판정 안에 있는가
  if (m.dome_blocked.length) {
    const n = m.dome_blocked.length;
    const head = m.dome_blocked.slice(0, 4).map((d) => `${d}°`).join(', ');
    failures.push(`규칙8 돔 표면 ${n}곳이 충돌 판정 안에 있다 (${head}${n > 4 ? ' …' : ''})`);
  }

  // 6. 공전 단계의 발사 가능 시점 비율이 레시피 범위 안인가
  if (limits?.timing) {
    if (m.timing_fraction === undefined) {
      failures.push('규칙6 레시피는 공전 단계를 기대하는데 공전 행성이 없다');
    } else if (m.timing_fraction < limits.timing.minFraction
      || m.timing_fraction > limits.timing.maxFraction) {
      failures.push(
        `규칙6 timing_fraction ${m.timing_fraction.toFixed(2)} 가 레시피 범위`
        + ` ${limits.timing.minFraction}~${limits.timing.maxFraction} 밖이다`);
    }
  }

  // 9. 정답 θ 가 걸을 수 있는 범위 안인가
  if (!inArc(L, sol.angle)) {
    failures.push(
      `규칙9 정답 ${sol.angle}° 가 돔 중심 ${padAngle(L).toFixed(1)}° ±${ARC}° 밖이다`);
  }

  // 경고
  if (limits && m.main_window > limits.window.max) {
    warnings.push(
      `성공 폭 ${m.main_window.toFixed(2)}° 가 레시피 최대 ${limits.window.max}° 초과 — 너무 쉽다`);
  }
  if (m.clearance < WARN_CLEARANCE) {
    warnings.push(`clearance ${m.clearance.toFixed(2)} < ${WARN_CLEARANCE} — 아슬아슬하다`);
  }
  if (m.launch_accel >= WARN_LAUNCH_ACCEL) {
    warnings.push(
      `발사 지점 가속도 ${m.launch_accel.toFixed(2)} u/s² — 돔이 중력 범위에 걸쳐 있다` +
      ` (표면 최대 ${m.dome_accel_max.toFixed(2)})`);
  }
  if (m.main_run && (sol.angle < m.main_run[0] || sol.angle > m.main_run[1])) {
    warnings.push(
      `저장된 정답 ${sol.angle}° 가 주 구간 ${m.main_run[0]}..${m.main_run[1]} 밖이다`);
  }
  if (m.best_launch_step !== sol.launch_step && m.main_window_at_solution + 1e-9 < m.main_window) {
    warnings.push(
      `저장된 발사 스텝 ${sol.launch_step} 의 폭 ${m.main_window_at_solution.toFixed(2)}° 보다` +
      ` 스텝 ${m.best_launch_step} 가 ${m.main_window.toFixed(2)}° 로 넓다`);
  }

  return { id: L.id, metrics: m, failures, warnings };
}

/**
 * 저장할 `meta.metrics` (§6.1 의 형식). 지표 전체가 아니라 요약만 넣는다.
 *
 * `main_window` 는 **저장된 발사 스텝 기준**이다. 이 값을 읽는 쪽이 힌트의
 * 방향 표시(§14.3)이기 때문이다. 최적 시점의 폭이 다르면 `main_window_best`
 * 로 따로 남긴다 — 규칙 1 과 난이도가 본 값이 무엇인지 남아야 한다.
 */
export function metaMetrics(m: LevelMetrics): Record<string, number> {
  const out: Record<string, number> = {
    main_window: round2(m.main_window_at_solution),
    flight_time: round2(m.flight_time),
    clearance: round2(m.clearance),
    difficulty: round2(m.difficulty),
  };
  if (round2(m.main_window) !== round2(m.main_window_at_solution)) {
    out['main_window_best'] = round2(m.main_window);
    out['best_launch_step'] = m.best_launch_step;
  }
  if (m.timing_fraction !== undefined) out['timing_fraction'] = round2(m.timing_fraction);
  return out;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * 장 안의 곡선 경고 (§8.5, §7.2).
 *
 * 4번과 8번 칸은 **기준이 다르다.** §7.2 가 그렇게 적어 두었다:
 *   · 4 휴식  — "직전 단계보다 **난이도 점수**가 낮아야 함"
 *   · 8 마무리 — "도전(7번)보다 **폭**은 넓게"
 *
 * 둘 다 난이도로 비교하면 8번이 늘 걸린다. 마무리는 긴 맵을 쓰므로 §8.6 의
 * G 항 때문에 점수가 올라가는데, 그건 어려워서가 아니라 맵이 커서다.
 */
export function curveWarnings(
  levels: { id: string; slot: number; difficulty: number; window?: number }[],
): string[] {
  const out: string[] = [];
  const bySlot = new Map(levels.map((l) => [l.slot, l]));

  // 4번: 직전 칸보다 난이도가 낮아야 한다
  const rest = bySlot.get(4), before = bySlot.get(3);
  if (rest && before && rest.difficulty > before.difficulty) {
    out.push(`${rest.id}: 휴식 칸인데 난이도 ${rest.difficulty.toFixed(1)} 가`
      + ` 직전 칸 ${before.difficulty.toFixed(1)} 보다 높다`);
  }

  // 8번: 도전(7번)보다 성공 폭이 넓어야 한다
  const last = bySlot.get(8), hard = bySlot.get(7);
  if (last?.window !== undefined && hard?.window !== undefined && last.window < hard.window) {
    out.push(`${last.id}: 마무리 칸인데 성공 폭 ${last.window.toFixed(2)}° 가`
      + ` 도전 칸 ${hard.window.toFixed(2)}° 보다 좁다 (§7.2)`);
  }

  return out;
}
