// 결정론과 예측선 일치. docs/PLAN.md §16.5, §5.7, §5.8
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/core/simulate.js';
import { loadLevel } from '../tools/levels-fs.js';
import { DT } from '../src/core/constants.js';

const IDS = ['1-1', '4-1', '5-1'] as const;

describe('결정론 (§5.8)', () => {
  it.each(IDS)('%s 두 번 돌리면 결과와 스텝 수가 같다', (id) => {
    const L = loadLevel(id);
    const { angle, launch_step } = L.meta.solution;
    const sim = new Sim();
    const first = sim.simulate(L, angle, launch_step);
    const firstSteps = sim.flightStep;
    expect(sim.simulate(L, angle, launch_step)).toBe(first);
    expect(sim.flightStep).toBe(firstSteps);
  });

  it('레벨 객체를 공유해도 결과가 변하지 않는다', () => {
    // §5.5: 부록 A 는 외계인에 _next 를 얹지만 우리는 SimState 에 둔다.
    // 레벨이 불변이어야 같은 레벨로 여러 번·여러 워커에서 스캔할 수 있다.
    const L = loadLevel('5-1');          // 외계인 2기
    const sim = new Sim();
    const base = sim.simulate(L, -12, 0);
    for (const a of [-90, 0, 45, 170]) sim.simulate(L, a, 0);
    expect(sim.simulate(L, -12, 0)).toBe(base);
    expect(new Sim().simulate(L, -12, 0)).toBe(base);
  });
});

describe('예측선 (§5.7)', () => {
  it.each(IDS)('%s 예측선이 실제 비행 경로 앞부분과 정확히 일치한다', (id) => {
    // "보이는 대로 날아간다"가 이 게임의 신뢰 기반이다.
    const L = loadLevel(id);
    const { angle, launch_step } = L.meta.solution;
    const sim = new Sim();
    sim.recordPath = true;
    sim.simulate(L, angle, launch_step);
    const actual = sim.path;

    const { points } = new Sim().predict(L, angle, launch_step);
    const n = Math.min(points.length, actual.length);
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      expect(points[i], `${id} ${i}번째 좌표`).toBe(actual[i]);
    }
  });

  it('예측선 길이가 단계의 preview 초에 맞는다', () => {
    const L = loadLevel('1-1');
    const pr = new Sim().predict(L, -66, 0);
    const expected = Math.round(L.preview / DT);
    if (!pr.outcome) expect(pr.points.length / 2).toBe(expected);
    else expect(pr.points.length / 2).toBeLessThanOrEqual(expected);
  });
});
