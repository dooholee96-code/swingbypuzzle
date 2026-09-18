// 레벨 회귀. docs/PLAN.md §16.5
//
// 기준값은 부록 A(검증 완료 참조 구현)로 확인된 값이고 §6.2 의 실측 표에 있다.
// **테스트 기준값을 코드에 맞춰 고치지 않는다 (§0.4).**
import { describe, expect, it } from 'vitest';
import { allIds } from '../src/levels/chapters.js';
import { loadAll, loadLevel } from '../tools/levels-fs.js';
import { Sim } from '../src/core/simulate.js';
import { accel, gravs } from '../src/core/physics.js';
import { inArc } from '../src/core/angle.js';
import { angles, mainRuns, widthOf } from '../src/tools-shared/scan.js';
import { PAD_R, SHIP_R } from '../src/core/constants.js';

const CASES = [
  { id: '1-1', angle: -66, step: 0, want: 'win' },
  { id: '1-4', angle: -134, step: 0, want: 'win' },
  { id: '2-1', angle: -75.5, step: 0, want: 'win' },
  { id: '3-1', angle: -30, step: 0, want: 'win' },
  { id: '4-1', angle: -44, step: 800, want: 'win' },
  // 4-1은 t=0에 쏘면 공전 행성에 충돌한다. 기다렸다 쏘는 것이 의도다 (§6.2).
  { id: '4-1', angle: -44, step: 0, want: 'planet' },
  { id: '5-1', angle: -12, step: 0, want: 'win' },
] as const;

// §6.2 실측 표 (발사대 행성 PAD_R=22 기준)
const WINDOWS = [
  { id: '1-1', step: 0, from: -69.25, to: -62.5, width: 7.0 },
  { id: '1-4', step: 0, from: -139.25, to: -128.25, width: 11.25 },
  { id: '2-1', step: 0, from: -80.25, to: -70.75, width: 9.75 },
  { id: '3-1', step: 0, from: -33.25, to: -26.5, width: 7.0 },
  { id: '4-1', step: 800, from: -48.5, to: -39.25, width: 9.5 },
  { id: '5-1', step: 0, from: -15.5, to: -8.5, width: 7.25 },
] as const;

describe('회귀 (§16.5)', () => {
  const sim = new Sim();

  it.each(CASES)('$id 각도 $angle launch_step $step → $want', ({ id, angle, step, want }) => {
    expect(sim.simulate(loadLevel(id), angle, step)).toBe(want);
  });

  it.each(WINDOWS)('$id 성공 구간이 $from..$to ($width°)', ({ id, step, from, to, width }) => {
    const main = mainRuns(angles(loadLevel(id), step).runs);
    expect(main).toHaveLength(1);
    expect(main[0]![0]).toBe(from);
    expect(main[0]![1]).toBe(to);
    expect(widthOf(main[0]!)).toBeCloseTo(width, 10);
  });
});

describe('등록된 단계 (§19)', () => {
  it('모두 스키마를 통과한다', () => {
    expect(loadAll(allIds()).size).toBe(allIds().length);
  });

  it('meta.solution이 모두 win이다', () => {
    const sim = new Sim();
    for (const id of allIds()) {
      const L = loadLevel(id);
      const { angle, launch_step } = L.meta.solution;
      expect(sim.simulate(L, angle, launch_step), `${id}`).toBe('win');
    }
  });

  it('정답 θ가 돔 중심 ±90° 안이다 — §8.5 규칙 9', () => {
    for (const id of allIds()) {
      const L = loadLevel(id);
      expect(inArc(L, L.meta.solution.angle), `${id}`).toBe(true);
    }
  });

  it('돔 표면이 어떤 충돌 판정 안에도 없다 — §8.5 규칙 8', () => {
    for (const id of allIds()) {
      const L = loadLevel(id);
      let worst = Infinity;
      for (let d = -180; d < 180; d += 1) {
        const a = d * Math.PI / 180;
        const px = L.start.x + PAD_R * Math.cos(a);
        const py = L.start.y + PAD_R * Math.sin(a);
        const near = (bx: number, by: number, rr: number): void => {
          worst = Math.min(worst, Math.hypot(bx - px, by - py) - rr);
        };
        for (const p of L.planets ?? []) near(p.x, p.y, p.r + SHIP_R);
        for (const h of L.holes ?? []) near(h.x, h.y, h.rH + 2);
        for (const r of L.rocks ?? []) near(r.x, r.y, r.r * 0.85 + SHIP_R);
      }
      expect(worst, `${id} 여유`).toBeGreaterThan(0);
    }
  });

  it('발사 지점 가속도를 기록한다 — §8.5 경고 (1 u/s² 이상이면 보고)', () => {
    // 1-4(2.45)와 4-1(13.35)이 여기 걸린다. 의도된 기록이다 (§6.2).
    const seen: Record<string, number> = {};
    for (const id of allIds()) {
      const L = loadLevel(id);
      const a = L.meta.solution.angle * Math.PI / 180;
      const [ax, ay] = accel(
        gravs(L),
        L.start.x + PAD_R * Math.cos(a),
        L.start.y + PAD_R * Math.sin(a),
        L.meta.solution.launch_step / 240,
      );
      seen[id] = Math.hypot(ax, ay);
    }
    expect(seen['1-1']).toBeCloseTo(0, 9);
    expect(seen['1-4']).toBeCloseTo(2.448, 2);
    expect(seen['4-1']).toBeCloseTo(13.346, 2);
  });
});
