// 분사 (§22.1). 꺾기는 속력을 지키고, 기록(step, dir)으로 똑같이 되풀이된다.
import { describe, expect, it } from 'vitest';
import { TURN_MAX } from '../src/core/constants.js';
import { Sim, applyTurn } from '../src/core/simulate.js';
import type { Level } from '../src/core/types.js';
import { validateSchema } from '../src/levels/loader.js';
import { checkLevel } from '../src/tools-shared/metrics.js';
import { loadLevel } from '../tools/levels-fs.js';

const heading = (vx: number, vy: number): number => Math.atan2(vy, vx) * 180 / Math.PI;

describe('applyTurn', () => {
  it('속력은 그대로, 차이가 TURN_MAX 안이면 정확히 그 방향', () => {
    const s = { x: 0, y: 0, vx: 150, vy: 0 };
    applyTurn(s, 25);
    expect(Math.sqrt(s.vx * s.vx + s.vy * s.vy)).toBeCloseTo(150, 9);
    expect(heading(s.vx, s.vy)).toBeCloseTo(25, 9);
  });

  it('TURN_MAX 를 넘으면 그만큼만 — 양쪽 모두', () => {
    const a = { x: 0, y: 0, vx: 150, vy: 0 };
    applyTurn(a, 120);
    expect(heading(a.vx, a.vy)).toBeCloseTo(TURN_MAX, 9);
    const b = { x: 0, y: 0, vx: 150, vy: 0 };
    applyTurn(b, -120);
    expect(heading(b.vx, b.vy)).toBeCloseTo(-TURN_MAX, 9);
  });

  it('±180° 를 넘는 쪽은 가까운 쪽으로 돈다', () => {
    const s = { x: 0, y: 0, vx: -150, vy: 1e-9 };   // 거의 180°
    applyTurn(s, -170);                               // 10° 만 돌면 된다
    expect(heading(s.vx, s.vy)).toBeCloseTo(-170, 6);
  });
});

describe('Sim 분사 기록과 되풀이', () => {
  it('비행 중 꺾은 기록을 simulate 에 주면 결과·스텝·위치가 같다', () => {
    const L = loadLevel('1-1');
    const { angle, launch_step } = L.meta.solution;
    const live = new Sim();
    live.begin(L, angle, launch_step);
    let r = '';
    for (let n = 0; !r; n++) {
      if (n === 60) live.queueTurn(angle + 30);
      if (n === 200) live.queueTurn(angle - 90);
      r = live.step();
    }
    expect(live.turns.map((t) => t.step)).toEqual([60, 200]);

    const replay = new Sim();
    expect(replay.simulate(L, angle, launch_step, undefined, live.turns)).toBe(r);
    expect(replay.flightStep).toBe(live.flightStep);
    expect(replay.ship).toEqual(live.ship);
    expect(replay.turns).toEqual(live.turns);
  });

  it('분사가 없으면 예전과 한 비트도 다르지 않다 (1~5장 회귀)', () => {
    for (const id of ['1-1', '3-5', '5-1']) {
      const L = loadLevel(id);
      const { angle, launch_step } = L.meta.solution;
      const a = new Sim(), b = new Sim();
      expect(a.simulate(L, angle, launch_step)).toBe(b.simulate(L, angle, launch_step, undefined, []));
      expect(a.ship).toEqual(b.ship);
    }
  });
});

describe('단계 데이터와 검증기', () => {
  it('스키마가 turns 와 solution.turns 를 받는다', () => {
    const L = structuredClone(loadLevel('1-1')) as Level;
    L.turns = 2;
    L.meta.solution.turns = [{ step: 10, dir: 0 }];
    expect(validateSchema(L, L.id)).toEqual([]);
    expect(validateSchema({ ...L, turns: -1 }, L.id).length).toBeGreaterThan(0);
  });

  it('정답이 단계가 준 횟수보다 많이 쓰면 규칙 7 에 걸린다', () => {
    const L = structuredClone(loadLevel('1-1')) as Level;
    L.meta.solution.turns = [{ step: 100000, dir: 0 }];     // 비행이 끝난 뒤라 궤도에는 영향 없음
    const fails = checkLevel(L).failures;
    expect(fails.some((f) => f.includes('분사'))).toBe(true);
    L.turns = 1;
    expect(checkLevel(L).failures.some((f) => f.includes('분사'))).toBe(false);
  });
});
