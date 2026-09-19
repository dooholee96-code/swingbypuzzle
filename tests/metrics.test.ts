// 검증 지표와 난이도 점수. docs/PLAN.md §16.5 test_metrics
//
// 기준값은 §6.2 와 §8.5 에 **문서로 먼저 적힌** 값이다. 코드가 내는 값을
// 베껴 넣지 않는다 (§0.4). 어긋나면 코드를 고친다.

import { beforeAll, describe, expect, it } from 'vitest';

import { allIds } from '../src/levels/chapters.js';

/**
 * §6.2 의 사전 검증 6단계. **이 테스트가 지키는 것은 이 여섯 개다.**
 *
 * 등록된 전 단계(§8.5 통과 여부)는 `npm run validate` 가 본다. 여기서 전부
 * 돌리면 공전 단계마다 24번씩 스캔하느라 테스트가 몇 분씩 걸린다 —
 * 회귀 테스트는 빨라야 자주 돈다.
 */
const VERIFIED = ['1-1', '1-4', '2-1', '3-1', '4-1', '5-1'];
import { loadLevel } from '../tools/levels-fs.js';
import {
  type LevelMetrics, type Report,
  MAX_FLIGHT_TIME, MIN_CLEARANCE,
  checkDome, checkLevel, computeMetrics, curveWarnings, difficultyOf,
  gravEntries, launchAccel, roleOf, sizeTerm, splitRuns, windowAt,
} from '../src/tools-shared/metrics.js';
import type { Level } from '../src/core/types.js';
import { widthOf } from '../src/tools-shared/scan.js';

const L = (id: string): Level => loadLevel(id);

// 4-1 은 공전 단계라 24번 스캔한다. 한 번만 재고 나눠 쓴다.
const M = new Map<string, LevelMetrics>();
const R = new Map<string, Report>();
beforeAll(() => {
  for (const id of VERIFIED) {
    const m = computeMetrics(L(id));
    M.set(id, m);
    R.set(id, checkLevel(L(id), m));
  }
}, 120_000);
const met = (id: string): LevelMetrics => M.get(id)!;

describe('성공 폭 — §6.2 실측 표', () => {
  // 저장된 발사 스텝 기준. 4-1 은 launch_step=800 에서 9.50° 다.
  const WIDTH: Record<string, number> = {
    '1-1': 7.00, '1-4': 11.25, '2-1': 9.75, '3-1': 7.00, '4-1': 9.50, '5-1': 7.25,
  };
  for (const [id, w] of Object.entries(WIDTH)) {
    it(`${id} 의 주 구간은 ${w}°`, () => {
      const lv = L(id);
      expect(windowAt(lv, lv.meta.solution.launch_step).width).toBeCloseTo(w, 6);
    });
  }

  // §6.2: "위 구간 외에 폭 0.25~0.5° 수준의 우연한 성공 각도가 몇 개 존재한다"
  // 4-1 은 돔(PAD_R=22) 때문에 −123 이 −117 로 옮겨 간 단계다. §6.2 의 정정 참고.
  const FLUKES: Record<string, number[]> = {
    '1-1': [], '1-4': [-144.5], '2-1': [-65], '3-1': [], '4-1': [-117, -116.5], '5-1': [],
  };
  for (const [id, expected] of Object.entries(FLUKES)) {
    it(`${id} 의 주 구간 외 성공 각도`, () => {
      const lv = L(id);
      const { flukes } = windowAt(lv, lv.meta.solution.launch_step);
      expect(flukes.runs.map((r) => r[0])).toEqual(expected);
      for (const r of flukes.runs) expect(widthOf(r)).toBeLessThan(1);
    });
  }
});

describe('발사 지점 가속도 — §6.2 결론의 표', () => {
  it('1-1·2-1·3-1·5-1 은 돔 표면 전체가 중력 범위 밖이다', () => {
    for (const id of ['1-1', '2-1', '3-1', '5-1']) {
      const lv = L(id);
      expect(launchAccel(lv, lv.meta.solution.angle, lv.meta.solution.launch_step)).toBe(0);
      expect(checkDome(lv).accelMax).toBe(0);
    }
  });

  it('1-4 는 정답 2.45, 표면 최대 3.64 u/s²', () => {
    const lv = L('1-4');
    expect(launchAccel(lv, lv.meta.solution.angle, lv.meta.solution.launch_step)).toBeCloseTo(2.45, 2);
    expect(checkDome(lv).accelMax).toBeCloseTo(3.64, 2);
  });

  it('4-1 은 정답 13.35, 표면 최대 17.47 u/s²', () => {
    const lv = L('4-1');
    expect(launchAccel(lv, lv.meta.solution.angle, lv.meta.solution.launch_step)).toBeCloseTo(13.35, 2);
    expect(checkDome(lv).accelMax).toBeCloseTo(17.47, 2);
  });
});

describe('필수 규칙 — §8.5', () => {
  it('사전 검증 6단계가 전부 통과한다', () => {
    for (const id of VERIFIED) {
      const r = R.get(id)!;
      expect(r.failures, `${id}: ${r.failures.join(' / ')}`).toEqual([]);
    }
  });

  it('규칙 8 — 돔 표면이 어느 판정 안에도 들어가지 않는다', () => {
    for (const id of VERIFIED) expect(met(id).dome_blocked, id).toEqual([]);
  });

  it('고정 중력원은 모두 essential, 공전 행성은 관문이라 비필수 (§8.5)', () => {
    for (const id of VERIFIED) {
      for (const e of met(id).essential) {
        if (e.role === 'required') expect(e.essential, `${id} ${e.kind}[${e.index}]`).toBe(true);
      }
    }
  });

  it('4-1 의 공전 행성은 gate 이고 required 가 아니다', () => {
    const orbit = (L('4-1').planets ?? []).filter((p) => p.orbit);
    expect(orbit.length).toBe(1);
    expect(roleOf(orbit[0]!)).toBe('gate');
  });

  it('비행 시간과 clearance 가 규칙 4·5 안이다', () => {
    for (const id of VERIFIED) {
      expect(met(id).flight_time, id).toBeLessThanOrEqual(MAX_FLIGHT_TIME);
      expect(met(id).clearance, id).toBeGreaterThanOrEqual(MIN_CLEARANCE);
    }
  });

  it('규칙 7 — 저장된 정답이 없는 중력원을 빼면 실패한다(3 의 대우)', () => {
    // required 를 하나 빼면 정답이 깨져야 한다는 것이 규칙 3 이다.
    const lv = L('1-1');
    const without: Level = { ...lv, planets: [] };
    const r = checkLevel(without);
    expect(r.failures.some((f) => f.startsWith('규칙7'))).toBe(true);
  });
});

describe('등록 목록', () => {
  it('사전 검증 6단계가 모두 등록돼 있다', () => {
    for (const id of VERIFIED) expect(allIds(), id).toContain(id);
  });
});

describe('난이도 점수 — §8.6 공식', () => {
  const base = (over: Partial<Level>): Level => ({
    id: 'x', name: 'x', w: 400, h: 760, speed: 150, preview: 1.8,
    start: { x: 200, y: 700 }, goal: { x: 100, y: 100, r: 24 },
    meta: { chapter: 1, slot: 1, role: 'x', solution: { angle: 0, launch_step: 0 }, source: 'editor', updated: '' },
    ...over,
  });

  it('모든 항이 0 이면 0', () => {
    expect(difficultyOf(base({}), 8, undefined)).toBeCloseTo(0, 10);
  });

  it('모든 항이 최대면 10', () => {
    const lv = base({
      w: 680, h: 1100, preview: 0.5,
      planets: [
        { x: 0, y: 0, r: 10, g: 1, R: 10, sides: 6 },
        { x: 0, y: 0, r: 10, g: 1, R: 10, sides: 6 },
        { x: 0, y: 0, r: 10, g: 1, R: 10, sides: 6 },
        { x: 0, y: 0, r: 10, g: 1, R: 10, sides: 6 },
      ],
      ufos: [
        { x: 0, y: 0, range: 1, interval: 1, delay: 1, bs: 1 },
        { x: 0, y: 0, range: 1, interval: 1, delay: 1, bs: 1 },
        { x: 0, y: 0, range: 1, interval: 1, delay: 1, bs: 1 },
      ],
    });
    expect(difficultyOf(lv, 2.5, 0.2)).toBeCloseTo(10, 10);
  });

  it('중간값 — 각 항의 절반', () => {
    const lv = base({
      h: 1000, preview: 1.15,
      planets: [
        { x: 0, y: 0, r: 10, g: 1, R: 10, sides: 6 },
        { x: 0, y: 0, r: 10, g: 1, R: 10, sides: 6 },
      ],
      ufos: [{ x: 0, y: 0, range: 1, interval: 1, delay: 1, bs: 1 }],
    });
    // A 1.5 + B 0.6 + C 0.4 + E 0.75 + F 0.75 + G 0.5
    expect(difficultyOf(lv, 5.25, 0.35)).toBeCloseTo(4.5, 10);
  });

  it('맵 크기 항 G — 기준 뷰포트 400×760 을 넘는 축의 수', () => {
    expect(sizeTerm(base({}))).toBe(0);
    expect(sizeTerm(base({ h: 1000 }))).toBe(0.5);
    expect(sizeTerm(base({ w: 680, h: 1100 }))).toBe(1);
  });

  it('비필수 블랙홀만 위험 요소 C 에 든다', () => {
    const req = base({ holes: [{ x: 0, y: 0, rH: 10, g: 1, R: 10 }] });
    const opt = base({ holes: [{ x: 0, y: 0, rH: 10, g: 1, R: 10, role: 'optional' }] });
    expect(difficultyOf(req, 8, undefined)).toBeCloseTo(0, 10);      // required → B 도 C 도 0
    expect(difficultyOf(opt, 8, undefined)).toBeCloseTo(0.4, 10);    // optional → C 만
  });
});

describe('구간 나누기', () => {
  it('가장 넓은 구간이 주 구간, 나머지가 flukes', () => {
    const { main, flukes } = splitRuns([[-10, -9.75], [-5, 2], [30, 30]]);
    expect(main).toEqual([-5, 2]);
    expect(flukes.runs).toEqual([[-10, -9.75], [30, 30]]);
    expect(flukes.total).toBeCloseTo(0.5 + 0.25, 10);
  });

  it('성공 구간이 없으면 주 구간도 없다', () => {
    expect(splitRuns([]).main).toBeNull();
  });
});

describe('난이도 곡선 경고 — §8.5', () => {
  it('휴식 칸(4, 8)이 직전 칸보다 어려우면 경고', () => {
    const w = curveWarnings([
      { id: 'a', slot: 3, difficulty: 5 },
      { id: 'b', slot: 4, difficulty: 6 },
      { id: 'c', slot: 5, difficulty: 7 },
    ]);
    expect(w.length).toBe(1);
    expect(w[0]).toContain('b');
  });

  it('휴식 칸이 더 쉬우면 경고 없음', () => {
    expect(curveWarnings([
      { id: 'a', slot: 3, difficulty: 5 },
      { id: 'b', slot: 4, difficulty: 2 },
    ])).toEqual([]);
  });
});

describe('중력원 역할 (§6.1)', () => {
  it('생략하면 고정은 required, 공전은 gate', () => {
    const lv = L('4-1');
    for (const e of gravEntries(lv)) {
      const orbiting = 'orbit' in e.b && e.b.orbit !== undefined;
      expect(roleOf(e.b)).toBe(orbiting ? 'gate' : 'required');
    }
  });
});
