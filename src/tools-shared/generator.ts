// 후보 생성 알고리즘. docs/PLAN.md §8.4
//
// 사전 검증에서 손으로 했던 절차를 그대로 자동화한다. 좌표를 짐작해서 쓰지
// 않고, 무작위로 뿌린 뒤 **전 각도를 실제로 시뮬레이션해서** 쓸 만한 것만
// 남긴다 (§0.7). 남은 후보는 §8.5 검증기가 한 번 더 거른다.
//
// 게임·CLI·에디터와 같은 core/ 스테퍼를 쓴다. DOM·Node API 는 쓰지 않는다 (§0.3).

import { ARC, PAD_R, TURN_MAX } from '../core/constants.js';
import { inArc, quantize } from '../core/angle.js';
import { bodyPos, dist, gravs } from '../core/physics.js';
import { mulberry32 } from '../core/rng.js';
import { Sim } from '../core/simulate.js';
import type { Grav, Hole, Level, Planet, Rock, Ufo } from '../core/types.js';
import { FROM, STEP, TO, launchSteps, widthOf } from './scan.js';
import { type RelTurn, arcRuns, flyRel, turnAngleRuns } from './turns.js';
import {
  DIVISIONS, MIN_WINDOW, checkLevel, computeMetrics, roleOf,
} from './metrics.js';
import { type Recipe, type SlotRecipe, type Zone, levelId, resolve } from './recipe.js';

// ── 생성 상수 ────────────────────────────────────────────────────────

export const GRID = 10;              // 목적지 격자 (§8.4 3단계)
export const GOAL_R = 24;            // 검증된 단계가 24~26 이다
export const START_MARGIN = PAD_R + 30;   // = 52. 돔 표면 전체가 중력 범위 밖 (§8.4 1단계)
export const FIRST_REACH = 350;      // 첫 필수 중력원 범위까지 (§6.3)
export const OVERLAP = 60;           // 중력원 중심 간격 = R1 + R2 − 60
export const GOAL_MIN_FRACTION = 0.40;    // 출발점에서 맵 대각선의 40% 이상
export const BLOCK_GAP = 35;         // 지름길 차단 소행성이 주 구간에서 떨어질 거리
export const DECOR_GAP = 30;         // 장식 소행성
export const PATH_SUBSAMPLE = 4;     // 궤적 기록 간격(스텝). 4스텝 = 2.5유닛쯤

/** 요소 수치 범위. 검증된 6단계의 값에서 뽑았다 (부록 B). */
const RANGE = {
  planet: { r: [20, 28], g: [700, 900], R: [130, 180], sides: [8, 13] },
  hole: { rH: [14, 18], g: [850, 950], R: [160, 190] },
  orbit: { r: [18, 24], g: [550, 700], R: [110, 140], rad: [60, 100], period: [6, 12] },
  ufo: { range: [140, 190], interval: [0.9, 1.3], delay: [0.2, 0.8], bs: [230, 260] },
  rock: { r: [14, 24] },
} as const;

export interface Candidate {
  level: Level;
  seed: number;
  difficulty: number;
  main_window: number;
  flight_time: number;
  clearance: number;
  timing_fraction?: number;
  /** 주 구간 궤적(그림용). x, y 쌍 배열의 배열 */
  solutionPath: number[];
}

export interface GenStats {
  tried: number;
  rejected: Record<string, number>;
}

// ── 난수 도우미 ──────────────────────────────────────────────────────

type Rand = () => number;
const pick = (rnd: Rand, [lo, hi]: readonly [number, number]): number => lo + rnd() * (hi - lo);
const pickInt = (rnd: Rand, [lo, hi]: readonly [number, number]): number =>
  Math.round(pick(rnd, [lo, hi]));
const snap = (v: number): number => Math.round(v / 5) * 5;

/** 공전 행성이면 궤도 중심, 아니면 제자리. Grav 는 Hole 을 포함해 orbit 이 없다. */
function centerOf(b: Grav): [number, number] {
  const o = (b as Planet).orbit;
  return o ? [o.cx, o.cy] : [b.x, b.y];
}
/** 충돌 판정 반경. 행성은 r, 블랙홀은 rH. */
function bodyRadius(b: Grav): number {
  return (b as Planet).r ?? (b as Hole).rH;
}

function zoneBox(z: Zone, w: number, h: number): [number, number, number, number] {
  switch (z) {
    case 'bottom': return [0.15 * w, 0.80 * h, 0.85 * w, 0.93 * h];
    case 'top': return [0.15 * w, 0.07 * h, 0.85 * w, 0.20 * h];
    case 'left': return [0.07 * w, 0.15 * h, 0.20 * w, 0.85 * h];
    case 'right': return [0.80 * w, 0.15 * h, 0.93 * w, 0.85 * h];
    case 'center': return [0.35 * w, 0.35 * h, 0.65 * w, 0.65 * h];
    default: return [0.10 * w, 0.10 * h, 0.90 * w, 0.90 * h];
  }
}
function inZone(z: Zone, w: number, h: number, x: number, y: number): boolean {
  const [x0, y0, x1, y1] = zoneBox(z, w, h);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

// ── 1단계. 배치 샘플링 ───────────────────────────────────────────────

interface Placed { planets: Planet[]; holes: Hole[]; ufos: Ufo[] }

function placeBodies(rnd: Rand, s: SlotRecipe, sx: number, sy: number): Placed | null {
  const { w, h } = s.map;
  const planets: Planet[] = [];
  const holes: Hole[] = [];
  const specs = [
    ...s.required.map((b) => ({ ...b, required: true })),
    ...(s.optional ?? []).map((b) => ({ ...b, required: false })),
  ];

  let first = true;
  for (const spec of specs) {
    for (let n = 0; n < spec.count; n++) {
      let ok = false;
      for (let attempt = 0; attempt < 200 && !ok; attempt++) {
        const body = makeBody(rnd, spec.type, spec.role, w, h);
        const [cx, cy] = spec.type === 'orbit'
          ? [body.orbit!.cx, body.orbit!.cy] : [body.x, body.y];
        const reach = spec.type === 'orbit' ? body.R + body.orbit!.rad : body.R;

        // 출발점은 모든 중력 범위 밖 START_MARGIN 이상
        const d = dist(cx, cy, sx, sy);
        if (d - reach < START_MARGIN) continue;
        // 첫 필수 중력원은 출발점에서 FIRST_REACH 안에
        if (first && spec.required && d - reach > FIRST_REACH) continue;
        // 맵 경계에서 r + 20 이상
        const edge = body.r + 20 + (spec.type === 'orbit' ? body.orbit!.rad : 0);
        if (cx < edge || cy < edge || cx > w - edge || cy > h - edge) continue;
        // 중력원끼리 R1 + R2 − OVERLAP 이상
        const others: Grav[] = [...planets, ...holes];
        if (others.some((o) => {
          const [ox, oy] = centerOf(o);
          return dist(cx, cy, ox, oy) < body.R + o.R - OVERLAP;
        })) continue;

        if (spec.type === 'hole') holes.push(body as unknown as Hole);
        else planets.push(body as Planet);
        if (spec.required) first = false;
        ok = true;
      }
      if (!ok) return null;
    }
  }

  // 외계인은 중력원과 겹치지 않는 곳에
  const ufos: Ufo[] = [];
  for (let n = 0; n < s.hazards.ufos; n++) {
    let ok = false;
    for (let attempt = 0; attempt < 200 && !ok; attempt++) {
      const x = snap(pick(rnd, [0.12 * w, 0.88 * w]));
      const y = snap(pick(rnd, [0.12 * h, 0.88 * h]));
      if (dist(x, y, sx, sy) < 200) continue;
      if (([...planets, ...holes] as Grav[]).some((o) => {
        const [ox, oy] = centerOf(o);
        return dist(x, y, ox, oy) < o.R * 0.7;
      })) continue;
      if (ufos.some((u) => dist(x, y, u.x, u.y) < 150)) continue;
      ufos.push({
        x, y,
        range: snap(pick(rnd, RANGE.ufo.range)),
        interval: Math.round(pick(rnd, RANGE.ufo.interval) * 10) / 10,
        delay: Math.round(pick(rnd, RANGE.ufo.delay) * 10) / 10,
        bs: snap(pick(rnd, RANGE.ufo.bs)),
      });
      ok = true;
    }
    if (!ok) return null;
  }

  return { planets, holes, ufos };
}

function makeBody(
  rnd: Rand, type: 'planet' | 'hole' | 'orbit', role: string | undefined, w: number, h: number,
): Planet & { orbit?: NonNullable<Planet['orbit']> } {
  const x = snap(pick(rnd, [0.10 * w, 0.90 * w]));
  const y = snap(pick(rnd, [0.10 * h, 0.90 * h]));
  if (type === 'hole') {
    return {
      x, y, r: pickInt(rnd, RANGE.hole.rH), g: snap(pick(rnd, RANGE.hole.g)),
      R: snap(pick(rnd, RANGE.hole.R)), sides: 0,
      ...(role ? { role } : {}),
    } as unknown as Planet;
  }
  if (type === 'orbit') {
    const rad = snap(pick(rnd, RANGE.orbit.rad));
    return {
      x: 0, y: 0,
      r: pickInt(rnd, RANGE.orbit.r), g: snap(pick(rnd, RANGE.orbit.g)),
      R: snap(pick(rnd, RANGE.orbit.R)), sides: pickInt(rnd, [7, 9]),
      role: (role ?? 'gate') as Planet['role'],
      orbit: {
        cx: x, cy: y, rad,
        period: Math.round(pick(rnd, RANGE.orbit.period)),
        phase: Math.round(rnd() * 8) / 8 * 2 * Math.PI,
      },
    };
  }
  return {
    x, y, r: pickInt(rnd, RANGE.planet.r), g: snap(pick(rnd, RANGE.planet.g)),
    R: snap(pick(rnd, RANGE.planet.R)), sides: pickInt(rnd, RANGE.planet.sides),
    ...(role ? { role: role as Planet['role'] } : {}),
  };
}

/** 블랙홀은 rH 로 저장한다. makeBody 가 r 에 담아 온 것을 옮긴다. */
function asHole(p: Planet): Hole {
  const { x, y, r, g, R, role } = p;
  return { x, y, rH: r, g, R, ...(role ? { role } : {}) };
}

// ── 2단계. 각도 전수 스캔 + 중력 범위 마스크 ─────────────────────────

/** 목적지가 아직 없으므로 절대 닿지 않는 자리에 둔다. */
const NO_GOAL = { x: -1e6, y: -1e6, r: 1 };

export interface Traced {
  angle: number;
  /** 필수 범위를 **전부** 거친 뒤의 궤적만. x, y 쌍 */
  after: number[];
  /** 전체 궤적 (소행성 배치용). x, y 쌍 */
  all: number[];
}

/**
 * 궤적마다 "지금까지 들어간 중력 범위" 비트마스크를 기록하며 훑는다 (§8.4 2단계).
 * 게임과 같은 Sim 을 쓴다 — 여기서 스테퍼를 다시 짜면 생성기가 통과시킨 단계가
 * 게임에서 다르게 날아간다.
 */
export function trace(base: Level, requiredIdx: number[]): Traced[] {
  const G = gravs(base);
  const full = requiredIdx.reduce((m, i) => m | (1 << i), 0);
  const sim = new Sim();
  sim.recordPath = false;
  const out: Traced[] = [];

  for (let a = FROM; a < TO; a += STEP) {
    sim.begin(base, a, 0, G);
    let mask = 0;
    const after: number[] = [];
    const all: number[] = [];
    let n = 0;
    let r: string = '';
    while (!r) {
      r = sim.step();
      n++;
      const t = sim.time;
      for (let i = 0; i < G.length; i++) {
        const b = G[i]!;
        const [bx, by] = bodyPos(b, t);
        if (dist(bx, by, sim.ship.x, sim.ship.y) < b.R) mask |= 1 << i;
      }
      if (n % PATH_SUBSAMPLE === 0) {
        all.push(sim.ship.x, sim.ship.y);
        if ((mask & full) === full) after.push(sim.ship.x, sim.ship.y);
      }
    }
    out.push({ angle: a, after, all });
  }
  return out;
}

// ── 3·4단계. 목적지 격자 평가와 선택 ─────────────────────────────────

export interface GoalPick { x: number; y: number; width: number }

/**
 * 궤적이 GOAL_R 안으로 지나간 격자 칸마다 연속 성공 각도의 최대 폭을 구하고,
 * 레시피 조건을 만족하는 칸 중 하나를 고른다 (§8.4 3·4단계).
 *
 * "최선의 칸"을 폭이 레시피 범위 **한가운데**에 가장 가까운 칸으로 정했다.
 * 범위의 가장자리에 걸친 단계는 수치를 조금만 건드려도 규칙 밖으로 나간다.
 */
export function chooseGoal(
  traced: Traced[], s: SlotRecipe, sx: number, sy: number, bodies: Grav[], goalZone: Zone,
): GoalPick | null {
  const { w, h } = s.map;
  const cols = Math.ceil(w / GRID), rows = Math.ceil(h / GRID);
  const cells = new Map<number, number[]>();     // 칸 → 각도 목록

  const reach = Math.ceil(GOAL_R / GRID);
  for (const tr of traced) {
    const seen = new Set<number>();
    for (let i = 0; i < tr.after.length; i += 2) {
      const cx = Math.floor(tr.after[i]! / GRID), cy = Math.floor(tr.after[i + 1]! / GRID);
      for (let dx = -reach; dx <= reach; dx++) {
        for (let dy = -reach; dy <= reach; dy++) {
          const gx = cx + dx, gy = cy + dy;
          if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
          const px = gx * GRID + GRID / 2, py = gy * GRID + GRID / 2;
          if (dist(px, py, tr.after[i]!, tr.after[i + 1]!) > GOAL_R) continue;
          seen.add(gy * cols + gx);
        }
      }
    }
    for (const k of seen) (cells.get(k) ?? cells.set(k, []).get(k)!).push(tr.angle);
  }

  const diag = Math.sqrt(w * w + h * h);
  const mid = (s.window.min + s.window.max) / 2;
  let best: (GoalPick & { score: number }) | null = null;

  for (const [k, list] of cells) {
    const gx = k % cols, gy = Math.floor(k / cols);
    const x = gx * GRID + GRID / 2, y = gy * GRID + GRID / 2;

    if (!inZone(goalZone, w, h, x, y)) continue;
    if (dist(x, y, sx, sy) < diag * GOAL_MIN_FRACTION) continue;
    if (bodies.some((b) => {
      const [bx, by] = centerOf(b);
      return dist(x, y, bx, by) < b.R * 0.5;
    })) continue;

    list.sort((p, q) => p - q);
    let wide: [number, number] | null = null;
    let run: [number, number] = [list[0]!, list[0]!];
    for (let i = 1; i < list.length; i++) {
      if (Math.abs(list[i]! - run[1] - STEP) < 1e-6) run[1] = list[i]!;
      else { if (!wide || widthOf(run) > widthOf(wide)) wide = [...run]; run = [list[i]!, list[i]!]; }
    }
    if (!wide || widthOf(run) > widthOf(wide)) wide = [...run];
    const width = widthOf(wide);
    if (width < s.window.min || width > s.window.max) continue;

    // 주 구간이 돔 중심 방향 ±ARC 안이어야 한다 (§5.9, §8.4 4단계).
    // 목적지를 정해야 돔 중심 방향이 정해지므로 칸마다 다시 본다.
    const center = quantize((wide[0] + wide[1]) / 2);
    const probe = { start: { x: sx, y: sy }, goal: { x, y, r: GOAL_R } } as Level;
    if (!inArc(probe, center)) continue;

    const score = -Math.abs(width - mid);
    if (!best || score > best.score) best = { x, y, width, score };
  }
  return best;
}

// ── 5·7단계. 소행성 ──────────────────────────────────────────────────

function nearPath(pts: number[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    const d = dist(pts[i]!, pts[i + 1]!, x, y);
    if (d < best) best = d;
  }
  return best;
}

/** 여러 궤적 중 가장 가까운 거리. */
function nearPaths(paths: number[][], x: number, y: number): number {
  let best = Infinity;
  for (const p of paths) best = Math.min(best, nearPath(p, x, y));
  return best;
}

// ── 후보 하나 만들기 ─────────────────────────────────────────────────

export type Reject =
  | 'place' | 'goal' | 'shortcut' | 'rocks' | 'timing' | 'rules' | 'nowin' | 'turn';

/**
 * 시드를 장·칸과 섞는다.
 *
 * 그냥 `mulberry32(seed)` 를 쓰면 **레시피가 같은 두 칸이 글자까지 같은 단계를
 * 낸다.** M10 에서 3-6 과 3-7 이 실제로 그랬다 — 둘은 `rocksMax` 만 달랐고,
 * 그 값은 지름길이 없으면 아무 데도 쓰이지 않아 결과가 완전히 일치했다.
 * 칸마다 다른 난수열을 쓰면 레시피가 비슷해도 다른 배치를 탐색한다.
 */
export function seedOf(chapter: number, slot: number, seed: number): number {
  return ((chapter * 100 + slot) * 1000003 + seed) | 0;
}

export function generateOne(
  r: Recipe, s: SlotRecipe, seed: number,
): { ok: Candidate } | { reject: Reject } {
  if ((s.turns ?? 0) > 0) return generateTurnOne(r, s, seed);
  const rnd = mulberry32(seedOf(r.chapter, s.slot, seed));
  const { speed, startZone, goalZone } = resolve(r, s);
  const { w, h } = s.map;

  // 1. 배치
  const [zx0, zy0, zx1, zy1] = zoneBox(startZone, w, h);
  const sx = snap(pick(rnd, [zx0, zx1])), sy = snap(pick(rnd, [zy0, zy1]));
  const placed = placeBodies(rnd, s, sx, sy);
  if (!placed) return { reject: 'place' };

  const planets = placed.planets;
  const holes = placed.holes.map((p) => asHole(p as unknown as Planet));
  const base: Level = {
    id: levelId(r, s), name: s.name, w, h, speed, preview: s.preview,
    start: { x: sx, y: sy }, goal: { ...NO_GOAL },
    ...(planets.length ? { planets } : {}),
    ...(holes.length ? { holes } : {}),
    ...(placed.ufos.length ? { ufos: placed.ufos } : {}),
    meta: {
      chapter: r.chapter, slot: s.slot, role: s.role,
      ...(s.intro ? { intro: s.intro } : {}),
      solution: { angle: 0, launch_step: 0 },
      source: 'generated', updated: '',
    },
  };

  // 필수 중력원의 인덱스 (gravs 순서 = planets 다음 holes)
  const all = gravs(base);
  const requiredIdx = all.map((b, i) => (roleOf(b) === 'required' ? i : -1)).filter((i) => i >= 0);
  if (!requiredIdx.length) return { reject: 'place' };

  // 2·3·4. 훑고 목적지 고르기
  const traced = trace(base, requiredIdx);
  const goal = chooseGoal(traced, s, sx, sy, all, goalZone);
  if (!goal) return { reject: 'goal' };

  const lv: Level = { ...base, goal: { x: goal.x, y: goal.y, r: GOAL_R } };

  // 5. 지름길 차단
  const rocks: Rock[] = [];
  let seedN = 1;
  for (let round = 0; round < s.hazards.rocksMax; round++) {
    const cur: Level = { ...lv, ...(rocks.length ? { rocks } : {}) };
    const runs = scanRuns(cur);
    if (!runs.length) return { reject: 'nowin' };
    const main = runs.reduce((a, b) => (widthOf(b) >= widthOf(a) ? b : a));
    const bad = runs.filter((x) => x !== main && widthOf(x) >= 1);
    if (!bad.length) break;

    const mainPaths = pathsOf(cur, [main[0], main[1]], 4);
    const spot = blockSpot(cur, bad[0]!, mainPaths, rnd);
    if (!spot) return { reject: 'shortcut' };
    rocks.push({ x: snap(spot[0]), y: snap(spot[1]), r: pickInt(rnd, RANGE.rock.r), seed: seedN++ });
    if (rocks.length >= s.hazards.rocksMax) return { reject: 'rocks' };
  }

  // 주 구간과 정답 확정
  const withRocks: Level = { ...lv, ...(rocks.length ? { rocks } : {}) };
  const runs0 = scanRuns(withRocks);
  if (!runs0.length) return { reject: 'nowin' };
  const main0 = runs0.reduce((a, b) => (widthOf(b) >= widthOf(a) ? b : a));
  withRocks.meta = {
    ...withRocks.meta,
    solution: { angle: quantize((main0[0] + main0[1]) / 2), launch_step: 0 },
  };

  // 6. 공전 타이밍
  const orbiting = (withRocks.planets ?? []).some((p) => p.orbit);
  if (orbiting) {
    const steps = launchSteps(withRocks, DIVISIONS);
    let good = 0;
    let bestStep = 0, bestWidth = 0;
    for (const ls of steps) {
      const rs = scanRuns(withRocks, ls);
      const wmax = rs.length ? Math.max(...rs.map((x) => widthOf(x))) : 0;
      // **문턱은 MIN_WINDOW 다.** metrics 의 timing_fraction 과 같은 정의여야
      // 생성기가 통과시킨 값과 기록되는 값이 어긋나지 않는다 (§8.5).
      if (wmax >= MIN_WINDOW) good++;
      if (wmax > bestWidth) { bestWidth = wmax; bestStep = ls; }
    }
    const frac = good / steps.length;
    const t = s.timing!;
    // 여기서 먼저 걸러 비싼 검증을 아낀다. 최종 판정은 checkLevel 의 규칙 6 이다.
    if (frac < t.minFraction || frac > t.maxFraction) return { reject: 'timing' };

    const rs = scanRuns(withRocks, bestStep);
    const m = rs.reduce((a, b) => (widthOf(b) >= widthOf(a) ? b : a));
    withRocks.meta = {
      ...withRocks.meta,
      solution: { angle: quantize((m[0] + m[1]) / 2), launch_step: bestStep },
    };
  }

  // 7. 장식 소행성
  const sol = withRocks.meta.solution;
  const mainPaths = pathsOf(withRocks, main0, 4);
  const decor = Math.round(pick(rnd, [2, 4]));
  for (let i = 0; i < decor; i++) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = snap(pick(rnd, [0.08 * w, 0.92 * w]));
      const y = snap(pick(rnd, [0.08 * h, 0.92 * h]));
      const rr = pickInt(rnd, RANGE.rock.r);
      if (nearPaths(mainPaths, x, y) < DECOR_GAP + rr) continue;
      if (dist(x, y, sx, sy) < 80 || dist(x, y, goal.x, goal.y) < 80) continue;
      if (rocks.some((a) => dist(a.x, a.y, x, y) < a.r + rr + 10)) continue;
      rocks.push({ x, y, r: rr, seed: seedN++ });
      break;
    }
  }
  const final: Level = {
    ...withRocks,
    ...(rocks.length ? { rocks } : {}),
    ...(s.hint ? { hint: s.hint } : {}),
  };
  final.meta = { ...final.meta, solution: sol, updated: today() };

  // 8. 검증 (§8.5). 여기를 통과한 것만 후보다.
  // 레시피 제약(규칙 1 최소 폭, 규칙 6, 너무 쉬움)도 함께 켠다.
  const metrics = computeMetrics(final);
  const report = checkLevel(final, metrics, { window: s.window, timing: s.timing });
  if (report.failures.length) return { reject: 'rules' };
  if (metrics.main_window > s.window.max) return { reject: 'rules' };

  final.meta = {
    ...final.meta,
    metrics: {
      main_window: r2(metrics.main_window_at_solution),
      flight_time: r2(metrics.flight_time),
      clearance: r2(metrics.clearance),
      difficulty: r2(metrics.difficulty),
      ...(metrics.timing_fraction === undefined
        ? {} : { timing_fraction: r2(metrics.timing_fraction) }),
    },
  };

  const sim = new Sim();
  sim.recordPath = true;
  sim.simulate(final, sol.angle, sol.launch_step);

  return {
    ok: {
      level: final, seed,
      difficulty: metrics.difficulty,
      main_window: metrics.main_window_at_solution,
      flight_time: metrics.flight_time,
      clearance: metrics.clearance,
      ...(metrics.timing_fraction === undefined
        ? {} : { timing_fraction: metrics.timing_fraction }),
      solutionPath: sim.path.filter((_, i) => Math.floor(i / 2) % 6 === 0),
    },
  };
}

// ── 도우미 ──────────────────────────────────────────────────────────

function r2(v: number): number { return Math.round(v * 100) / 100; }

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 성공 연속 구간만 (counts 는 버린다). */
function scanRuns(L: Level, launchStep = 0): [number, number][] {
  const G = gravs(L);
  const sim = new Sim();
  const wins: number[] = [];
  for (let a = FROM; a < TO; a += STEP) {
    if (sim.simulate(L, a, launchStep, G) === 'win') wins.push(a);
  }
  const runs: [number, number][] = [];
  for (const a of wins) {
    const last = runs[runs.length - 1];
    if (last && Math.abs(a - last[1] - STEP) < 1e-6) last[1] = a;
    else runs.push([a, a]);
  }
  return runs;
}

/** 구간 안에서 고르게 뽑은 몇 개 각도의 궤적. */
function pathsOf(L: Level, run: [number, number], n: number, launchStep = 0): number[][] {
  const G = gravs(L);
  const sim = new Sim();
  sim.recordPath = true;
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = run[0] + (run[1] - run[0]) * (n === 1 ? 0.5 : i / (n - 1));
    sim.simulate(L, a, launchStep, G);
    out.push(sim.path.slice());
  }
  return out;
}

/**
 * 지름길 구간의 궤적 위에서 주 구간 궤적들과 BLOCK_GAP 이상 떨어진 지점.
 * 거기 소행성을 놓으면 지름길만 막힌다 (§8.4 5단계).
 */
function blockSpot(
  L: Level, bad: [number, number], mainPaths: number[][], rnd: Rand,
): [number, number] | null {
  const mid = (bad[0] + bad[1]) / 2;
  const G = gravs(L);
  const sim = new Sim();
  sim.recordPath = true;
  sim.simulate(L, mid, 0, G);
  const p = sim.path;

  // 출발점에서 먼 쪽부터 본다 — 출발 직후를 막으면 주 구간도 함께 막힌다
  const order: number[] = [];
  for (let i = 0; i < p.length; i += 2) order.push(i);
  order.sort((a, b) => dist(p[b]!, p[b + 1]!, L.start.x, L.start.y)
    - dist(p[a]!, p[a + 1]!, L.start.x, L.start.y));

  for (const i of order) {
    const x = p[i]!, y = p[i + 1]!;
    if (dist(x, y, L.start.x, L.start.y) < PAD_R + 60) continue;
    if (dist(x, y, L.goal.x, L.goal.y) < L.goal.r + 40) continue;
    if (x < 30 || y < 30 || x > L.w - 30 || y > L.h - 30) continue;
    if (nearPaths(mainPaths, x, y) < BLOCK_GAP) continue;
    // 중력원 안에 소행성을 박지 않는다
    if (G.some((b) => {
      const [bx, by] = centerOf(b);
      return dist(x, y, bx, by) < bodyRadius(b) + 30;
    })) continue;
    // 살짝 흔들어 격자에 붙인다
    return [x + (rnd() - 0.5) * 6, y + (rnd() - 0.5) * 6];
  }
  return null;
}



// ── 분사 단계 (§22.2) ────────────────────────────────────────────────
//
// 분사 없이는 못 가는 자리에 목적지를 둔다. 순서:
//   1. 배치는 보통 단계와 같다.
//   2. 분사 없이 걸을 수 있는 각도(1°)를 날려, 칸마다 "분사 없이 닿는 각도 수"를 센다.
//      행성만으로는 그늘이 생기지 않는다 — 인력은 행성 뒤로 궤적을 모은다. 그래서
//      0 인 칸을 찾지 않고, 적은 칸을 고른 뒤 그 몇 갈래를 소행성으로 막는다(6단계).
//   3. 걸을 수 있는 각도(2°)마다, 0.1초 간격의 순간마다, 왼쪽·오른쪽 최대 분사로
//      갈래를 날려 분사 뒤 궤적이 지나간 칸을 모은다.
//   4. 각도 폭과 타이밍 폭이 넉넉하고, 분사 없이 닿는 갈래가 적은 칸을 목적지로.
//   5. 정답을 다듬는다(타이밍 가운데 → 각도 가운데).
//   6. 분사 없이 가는 길을 소행성으로 막는다. 정답 궤적에서는 BLOCK_GAP 떨어진 곳에만.
//   마지막은 언제나 §8.5 + 규칙 10·11 검증이다.

/** 생성 진단 (개발용) */
export const DEBUG_TURN = { on: false, log: (_m: string): void => {} };

const TURN_EVERY = 24;          // 분사 순간 후보 간격(스텝) = 0.1초
// 0.6초 전에 꺾는 정답은 "걸을 수 있는 범위 밖으로 쏘기"와 다르지 않다 — 분사가
// 퍼즐이 되려면 날아가며 상황을 본 뒤에 꺾어야 한다
const TURN_FROM = 144;
const TURN_UNTIL = 960;         // 4초까지만 — 늦은 분사는 사람이 노리기 어렵다
const BRANCH_STEP = 2;          // 갈래를 날리는 발사 각도 간격(°)
const MAX_NO_TURN_HITS = 24;    // 분사 없이 닿는 갈래(1°)가 이보다 많은 칸은 막기 어렵다

function generateTurnOne(
  r: Recipe, s: SlotRecipe, seed: number,
): { ok: Candidate } | { reject: Reject } {
  const rnd = mulberry32(seedOf(r.chapter, s.slot, seed));
  const { speed, startZone, goalZone } = resolve(r, s);
  const { w, h } = s.map;

  // 1. 배치
  const [zx0, zy0, zx1, zy1] = zoneBox(startZone, w, h);
  const sx = snap(pick(rnd, [zx0, zx1])), sy = snap(pick(rnd, [zy0, zy1]));
  const placed = placeBodies(rnd, s, sx, sy);
  if (!placed) return { reject: 'place' };
  const planets = placed.planets;
  const holes = placed.holes.map((p) => asHole(p as unknown as Planet));
  const base: Level = {
    id: levelId(r, s), name: s.name, w, h, speed, preview: s.preview,
    start: { x: sx, y: sy }, goal: { ...NO_GOAL },
    ...(planets.length ? { planets } : {}),
    ...(holes.length ? { holes } : {}),
    ...(placed.ufos.length ? { ufos: placed.ufos } : {}),
    turns: s.turns!,
    meta: {
      chapter: r.chapter, slot: s.slot, role: s.role,
      ...(s.intro ? { intro: s.intro } : {}),
      solution: { angle: 0, launch_step: 0 },
      source: 'generated', updated: '',
    },
  };
  const G = gravs(base);
  const cols = Math.ceil(w / GRID), rows = Math.ceil(h / GRID);
  const cellOf = (x: number, y: number): number => Math.floor(y / GRID) * cols + Math.floor(x / GRID);
  const mark = (pts: number[], from: number, radius: number, into: (k: number) => void): void => {
    const reach = Math.ceil(radius / GRID);
    for (let i = from; i < pts.length; i += 2 * PATH_SUBSAMPLE) {
      const px = pts[i]!, py = pts[i + 1]!;
      const cx = Math.floor(px / GRID), cy = Math.floor(py / GRID);
      for (let dx = -reach; dx <= reach; dx++) {
        for (let dy = -reach; dy <= reach; dy++) {
          const gx = cx + dx, gy = cy + dy;
          if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
          if (dist(gx * GRID + GRID / 2, gy * GRID + GRID / 2, px, py) > radius) continue;
          into(gy * cols + gx);
        }
      }
    }
  };

  // 2. 분사 없이 닿는 갈래 수. 목적지 영역 쪽 ±ARC(조금 넉넉히)
  const [gx0, gy0, gx1, gy1] = zoneBox(goalZone, w, h);
  const toward = Math.round(Math.atan2((gy0 + gy1) / 2 - sy, (gx0 + gx1) / 2 - sx) * 180 / Math.PI);
  const sim = new Sim();
  sim.recordPath = true;
  const noTurn = new Map<number, number>();
  const flightLen = new Map<number, number>();
  for (let a = toward - ARC - 10; a <= toward + ARC + 10; a += 1) {
    const aa = ((a + 540) % 360) - 180;
    sim.simulate(base, aa, 0, G);
    flightLen.set(aa, sim.flightStep);
    const seen = new Set<number>();
    mark(sim.path, 0, GOAL_R, (k) => seen.add(k));
    for (const k of seen) noTurn.set(k, (noTurn.get(k) ?? 0) + 1);
  }

  // 3. 갈래. 정답은 걸을 수 있는 범위 안이어야 한다(규칙 9)
  type Hit = { a: number; k: number; sign: number };
  const cells = new Map<number, Hit[]>();
  for (let a = toward - ARC; a <= toward + ARC; a += BRANCH_STEP) {
    const aa = ((a + 540) % 360) - 180;
    const n0 = flightLen.get(aa) ?? 0;
    for (let k = TURN_FROM; k < Math.min(n0 - 12, TURN_UNTIL); k += TURN_EVERY) {
      for (const sign of [1, -1]) {
        flyRel(sim, base, aa, 0, G, [{ step: k, delta: sign * TURN_MAX }]);
        const seen = new Set<number>();
        mark(sim.path, 2 * k, GOAL_R - 4, (c) => {
          if ((noTurn.get(c) ?? 0) <= MAX_NO_TURN_HITS) seen.add(c);
        });
        for (const c of seen) (cells.get(c) ?? cells.set(c, []).get(c)!).push({ a: aa, k, sign });
      }
    }
  }
  if (DEBUG_TURN.on) {
    let free = 0, freeZone = 0, hitZone = 0;
    for (let c = 0; c < cols * rows; c++) {
      if ((noTurn.get(c) ?? 0) > MAX_NO_TURN_HITS) continue;
      free++;
      const x = (c % cols) * GRID + GRID / 2, y = Math.floor(c / cols) * GRID + GRID / 2;
      if (inZone(goalZone, w, h, x, y)) { freeZone++; if (cells.has(c)) hitZone++; }
    }
    DEBUG_TURN.log(`free ${free}/${cols * rows} zone ${freeZone} hit ${hitZone} cells ${cells.size}`);
  }
  if (!cells.size) return { reject: 'goal' };

  // 4. 목적지 칸. 같은 (순간, 방향) 안에서 연속한 각도 폭이 레시피 범위에 들고,
  //    같은 각도·방향에서 연속한 순간이 2개(0.2초) 이상인 칸
  const diag = Math.sqrt(w * w + h * h);
  const mid = (s.window.min + s.window.max) / 2;
  let best: { x: number; y: number; a: number; k: number; sign: number; score: number } | null = null;
  for (const [c, hits] of cells) {
    const x = (c % cols) * GRID + GRID / 2, y = Math.floor(c / cols) * GRID + GRID / 2;
    if (!inZone(goalZone, w, h, x, y)) continue;
    if (dist(x, y, sx, sy) < diag * GOAL_MIN_FRACTION) continue;
    if (x < GOAL_R + 6 || y < GOAL_R + 6 || x > w - GOAL_R - 6 || y > h - GOAL_R - 6) continue;
    if (G.some((b) => {
      const [bx, by] = centerOf(b);
      return dist(x, y, bx, by) < Math.max(b.R * 0.5, bodyRadius(b) + GOAL_R + 8);
    })) continue;

    const groups = new Map<string, number[]>();
    for (const hh of hits) {
      const key = `${hh.k}:${hh.sign}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(hh.a);
    }
    for (const [key, list] of groups) {
      list.sort((p, q) => p - q);
      let run: [number, number] = [list[0]!, list[0]!], wide = run;
      for (let i = 1; i < list.length; i++) {
        if (Math.abs(list[i]! - run[1] - BRANCH_STEP) < 1e-6) run = [run[0], list[i]!];
        else run = [list[i]!, list[i]!];
        if (run[1] - run[0] > wide[1] - wide[0]) wide = run;
      }
      const width = wide[1] - wide[0] + BRANCH_STEP;
      if (width < Math.max(MIN_WINDOW, s.window.min) || width > s.window.max + BRANCH_STEP) continue;
      const [kk, sg] = key.split(':').map(Number) as [number, number];
      const center = quantize((wide[0] + wide[1]) / 2);
      const probe = { start: { x: sx, y: sy }, goal: { x, y, r: GOAL_R } } as Level;
      if (!inArc(probe, center)) continue;
      // 이웃한 순간(±0.1초)도 같은 각도 근처로 닿는가
      const near = (dk: number): boolean => hits.some((hh) =>
        hh.k === kk + dk && hh.sign === sg && Math.abs(hh.a - center) <= BRANCH_STEP);
      const timing = (near(-TURN_EVERY) ? 1 : 0) + (near(TURN_EVERY) ? 1 : 0);
      if (timing < 1) continue;
      const score = -Math.abs(width - mid) + timing * 1.5 - (noTurn.get(c) ?? 0) * 0.25 + rnd() * 0.5;
      if (!best || score > best.score) best = { x, y, a: center, k: kk, sign: sg, score };
    }
  }
  if (!best) return { reject: 'goal' };
  const lv: Level = { ...base, goal: { x: best.x, y: best.y, r: GOAL_R } };

  // 5. 정답 다듬기: 타이밍 가운데 → 각도 가운데 → 타이밍 가운데
  const tsim = new Sim();
  const wins = (a: number, k: number): boolean =>
    flyRel(tsim, lv, a, 0, G, [{ step: k, delta: best!.sign * TURN_MAX }]) === 'win';
  const centerK = (a: number, k0: number): number | null => {
    if (!wins(a, k0)) {
      // 거친 격자의 칸이라 정확한 각도에서는 한두 스텝 어긋날 수 있다
      let found: number | null = null;
      for (let d = 2; d <= TURN_EVERY && found === null; d += 2) {
        if (wins(a, k0 - d)) found = k0 - d; else if (wins(a, k0 + d)) found = k0 + d;
      }
      if (found === null) return null;
      k0 = found;
    }
    let lo = k0, hi = k0;
    while (lo - 2 >= TURN_FROM - TURN_EVERY && wins(a, lo - 2)) lo -= 2;
    while (hi + 2 < TURN_UNTIL && wins(a, hi + 2)) hi += 2;
    return Math.round((lo + hi) / 4) * 2;
  };
  const centerA = (a0: number, k: number): number | null => {
    const rel: RelTurn[] = [{ step: k, delta: best!.sign * TURN_MAX }];
    const runs = turnAngleRuns(lv, 0, rel, G);
    const hit = runs.find((rr) => a0 >= rr[0] - 1 && a0 <= rr[1] + 1)
      ?? runs.reduce<[number, number] | null>((m, rr) =>
        (!m || Math.abs((rr[0] + rr[1]) / 2 - a0) < Math.abs((m[0] + m[1]) / 2 - a0) ? rr : m), null);
    return hit ? quantize((hit[0] + hit[1]) / 2) : null;
  };
  let k = centerK(best.a, best.k);
  if (k === null) return { reject: 'turn' };
  let a = centerA(best.a, k);
  if (a === null) return { reject: 'turn' };
  k = centerK(a, k);
  if (k === null) return { reject: 'turn' };

  // 절대 방향으로 기록한다 — 게임과 같은 형식(§22.1)
  const absTurn = (L: Level): { step: number; dir: number } => {
    tsim.begin(L, a!, 0, G);
    while (tsim.flightStep < k! && !tsim.step()) { /* 분사 순간까지 */ }
    const hd = Math.atan2(tsim.ship.vy, tsim.ship.vx) * 180 / Math.PI;
    return { step: k!, dir: Math.round((hd + best!.sign * TURN_MAX) * 100) / 100 };
  };
  const solPath = (L: Level): number[] => {
    const ps = new Sim();
    ps.recordPath = true;
    ps.simulate(L, a!, 0, G, [absTurn(L)]);
    return ps.path.slice();
  };

  // 6. 분사 없이 가는 지름길을 소행성으로 막는다 (보통 단계의 5단계와 같은 방법)
  const rocks: Rock[] = [];
  let seedN = 1;
  for (let round = 0; round <= s.hazards.rocksMax; round++) {
    const cur: Level = { ...lv, ...(rocks.length ? { rocks } : {}) };
    const bad = arcRuns(cur, scanRuns(cur));
    if (!bad.length) break;
    if (rocks.length >= s.hazards.rocksMax) return { reject: 'rocks' };
    const spot = blockSpot(cur, bad[0]!, [solPath(cur)], rnd);
    if (!spot) return { reject: 'shortcut' };
    rocks.push({ x: snap(spot[0]), y: snap(spot[1]), r: pickInt(rnd, RANGE.rock.r), seed: seedN++ });
  }
  const blocked: Level = { ...lv, ...(rocks.length ? { rocks } : {}) };

  // 7. 장식 소행성 — 정답 궤적과 출발·목적지에서 떨어진 곳에
  const mainPaths = [solPath(blocked)];
  const decor = Math.round(pick(rnd, [2, 4]));
  for (let i = 0; i < decor; i++) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = snap(pick(rnd, [0.08 * w, 0.92 * w]));
      const y = snap(pick(rnd, [0.08 * h, 0.92 * h]));
      const rr = pickInt(rnd, RANGE.rock.r);
      if (nearPaths(mainPaths, x, y) < DECOR_GAP + rr) continue;
      if (dist(x, y, sx, sy) < 80 || dist(x, y, best.x, best.y) < 80) continue;
      if (rocks.some((q) => dist(q.x, q.y, x, y) < q.r + rr + 10)) continue;
      if (G.some((b) => {
        const [bx, by] = centerOf(b);
        return dist(x, y, bx, by) < bodyRadius(b) + rr + 20;
      })) continue;
      rocks.push({ x, y, r: rr, seed: seedN++ });
      break;
    }
  }

  const final: Level = {
    ...blocked,
    ...(rocks.length ? { rocks } : {}),
    ...(s.hint ? { hint: s.hint } : {}),
  };
  final.meta = {
    ...final.meta,
    solution: { angle: a, launch_step: 0, turns: [absTurn(final)] },
    updated: today(),
  };

  // 8. 검증 (§8.5 + 규칙 10·11)
  const metrics = computeMetrics(final);
  const report = checkLevel(final, metrics, { window: s.window, timing: null });
  if (DEBUG_TURN.on && report.failures.length) DEBUG_TURN.log(report.failures.join(' | '));
  if (report.failures.length) return { reject: 'rules' };
  if (metrics.main_window > s.window.max) return { reject: 'rules' };

  final.meta = {
    ...final.meta,
    metrics: {
      main_window: r2(metrics.main_window_at_solution),
      flight_time: r2(metrics.flight_time),
      clearance: r2(metrics.clearance),
      difficulty: r2(metrics.difficulty),
      ...(metrics.turn ? { turn_timing: r2(metrics.turn.timing), turn_delta: metrics.turn.delta } : {}),
    },
  };
  const ps = new Sim();
  ps.recordPath = true;
  ps.simulate(final, a, 0, G, final.meta.solution.turns);
  return {
    ok: {
      level: final, seed,
      difficulty: metrics.difficulty,
      main_window: metrics.main_window_at_solution,
      flight_time: metrics.flight_time,
      clearance: metrics.clearance,
      solutionPath: ps.path.filter((_, i) => Math.floor(i / 2) % 6 === 0),
    },
  };
}
