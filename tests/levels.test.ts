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
import { INTRO, introFor, seenKey } from '../src/ui/intro.js';
import type { IntroKey } from '../src/ui/intro.js';

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

// ── §7.4 · §13.2.1 새 요소 소개 카드 ────────────────────────────────────
describe('소개 카드 (§7.4, §13.2.1)', () => {
  it('요소마다 처음 나오는 단계에 붙고, 빠진 요소가 없다', () => {
    const pairs = allIds()
      .map((id) => [id, loadLevel(id).meta.intro] as const)
      .filter((p): p is readonly [string, IntroKey] => p[1] !== undefined);
    const keys = pairs.map((p) => p[1]);
    expect(new Set(keys)).toEqual(new Set(Object.keys(INTRO)));   // 빠진 요소가 없다

    // 넓은 맵만 두 번이다 — §7.3 이 1-8 을 "미니맵 첫 등장" 으로 적었고,
    // 5-1 에서 가로로도 넓어진다(§7.4). 나머지 요소는 한 번뿐이다.
    const at = (k: IntroKey): string[] => pairs.filter((p) => p[1] === k).map((p) => p[0]);
    expect(at('wide')).toEqual(['1-8', '5-1']);
    for (const k of Object.keys(INTRO) as IntroKey[]) {
      if (k !== 'wide') expect(at(k)).toHaveLength(1);
    }
  });

  it('넓은 맵 카드는 1-8 과 5-1 에서 따로 센다', () => {
    // 같은 키로 세면 1-8 을 본 사람에게 5-1 의 덧붙인 한 줄이 영영 안 뜬다.
    expect(seenKey('1-8', 'wide')).toBe('wide');
    expect(seenKey('5-1', 'wide')).not.toBe(seenKey('1-8', 'wide'));
    expect(introFor('5-1', 'wide').body).toContain('이제 가로로도 넓어요.');
    expect(introFor('1-8', 'wide').body).toBe(INTRO.wide.body);
  });
});
