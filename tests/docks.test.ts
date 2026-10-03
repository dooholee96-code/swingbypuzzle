// 궤도 행성 (§22.4). 붙잡히면 속력을 지킨 채 정해진 주기로 돌고, 탭(기록된 스텝)이나
// 두 바퀴 뒤에 접선으로 나간다. 기록으로 똑같이 되풀이되고, 도는 시간은 30초 시계에서 빠진다.
//
// 아래 레벨은 시험용 고정물이다(스테이지가 아니다). 궤도 행성 하나가 출발점 바로 위에 있다.
import { describe, expect, it } from 'vitest';
import { DOCK_LAP, DT } from '../src/core/constants.js';
import { DOCK_HOLD_STEPS, Sim } from '../src/core/simulate.js';
import type { Level } from '../src/core/types.js';
import { validateSchema } from '../src/levels/loader.js';

// 30초를 날아도 벽에 닿지 않게 맵을 크게, 출발점을 가운데에
const O = 20000;
const DOCK = { x: O, y: O - 400, r: 18, cr: 50, sides: 4 };
const level = (extra: Partial<Level> = {}): Level => ({
  id: 'x', name: '', w: 2 * O, h: 2 * O, speed: 150, preview: 1.8,
  start: { x: O, y: O }, goal: { x: -1e5, y: -1e5, r: 1 },
  docks: [DOCK],
  meta: { chapter: 0, slot: 0, role: '', solution: { angle: -90, launch_step: 0 }, source: 'generated', updated: '' },
  ...extra,
});
const speed = (s: { vx: number; vy: number }): number => Math.sqrt(s.vx * s.vx + s.vy * s.vy);
const r = (s: { x: number; y: number }): number => Math.sqrt((s.x - DOCK.x) ** 2 + (s.y - DOCK.y) ** 2);

/** 붙잡힐 때까지 날린다 */
function flyToDock(sim: Sim, L: Level, angle = -88): void {
  sim.begin(L, angle, 0);
  for (let i = 0; i < 240 * 10 && !sim.docked; i++) expect(sim.step()).toBe('');
  expect(sim.docked).not.toBeNull();
}

describe('붙잡기와 돌기', () => {
  it('링에 닿으면 붙잡혀 링 위를 같은 속력으로 돈다', () => {
    const sim = new Sim();
    flyToDock(sim, level());
    expect(r(sim.ship)).toBeCloseTo(DOCK.cr, 9);
    expect(speed(sim.ship)).toBeCloseTo(150, 6);
    const a0 = Math.atan2(sim.ship.y - DOCK.y, sim.ship.x - DOCK.x);
    for (let i = 0; i < 240; i++) sim.step();                       // 1초
    const a1 = Math.atan2(sim.ship.y - DOCK.y, sim.ship.x - DOCK.x);
    let d = Math.abs(a1 - a0); if (d > Math.PI) d = 2 * Math.PI - d;
    expect(d).toBeCloseTo(2 * Math.PI / DOCK_LAP, 6);              // 한 바퀴 6초 → 1초에 60°
    expect(r(sim.ship)).toBeCloseTo(DOCK.cr, 9);
  });

  it('두 바퀴가 지나면 저절로 나가고, 바로 다시 붙잡히지 않는다', () => {
    const sim = new Sim();
    flyToDock(sim, level());
    for (let i = 0; i < DOCK_HOLD_STEPS + 1; i++) sim.step();
    expect(sim.docked).toBeNull();
    expect(sim.releases).toEqual([]);                                // 탭이 아니라 기록하지 않는다
    for (let i = 0; i < 240; i++) sim.step();
    expect(sim.docked).toBeNull();
    expect(r(sim.ship)).toBeGreaterThan(DOCK.cr + 50);
  });

  it('예측선은 링에서 끝난다', () => {
    const p = new Sim().predict(level({ preview: 6 }), -90, 0);
    const [x, y] = p.points.slice(-2) as [number, number];
    expect(Math.sqrt((x - DOCK.x) ** 2 + (y - DOCK.y) ** 2)).toBeLessThan(DOCK.cr + 1);
  });
});

describe('탭으로 나가기와 되풀이', () => {
  it('나간 스텝을 기록하고, 그 기록으로 똑같이 되풀이한다', () => {
    const L = level();
    const live = new Sim();
    flyToDock(live, L);
    for (let i = 0; i < 200; i++) live.step();
    live.queueRelease();
    let res = '';
    for (let i = 0; i < 240 * 20 && !res; i++) res = live.step();
    expect(live.releases).toHaveLength(1);

    const replay = new Sim();
    replay.begin(L, -88, 0, undefined, undefined, live.releases);
    let res2 = '';
    while (replay.flightStep < live.flightStep && !res2) res2 = replay.step();
    expect(res2).toBe(res);
    expect(replay.ship).toEqual(live.ship);
    expect(replay.releases).toEqual(live.releases);
  });

  it('나가는 방향은 그 순간의 접선이다', () => {
    const sim = new Sim();
    flyToDock(sim, level());
    for (let i = 0; i < 100; i++) sim.step();
    const before = { ...sim.ship };
    sim.queueRelease();
    sim.step();
    expect(sim.docked).toBeNull();
    // 반지름 방향과 수직(접선)이고 속력은 그대로
    const rx = before.x - DOCK.x, ry = before.y - DOCK.y;
    expect((rx * before.vx + ry * before.vy) / (DOCK.cr * 150)).toBeCloseTo(0, 9);
    expect(speed(sim.ship)).toBeCloseTo(150, 6);
  });

  it('도는 시간은 30초 표류 시계에서 빠진다', () => {
    const sim = new Sim();
    flyToDock(sim, level());
    const docked0 = sim.flightStep;
    for (let i = 0; i < DOCK_HOLD_STEPS; i++) sim.step();       // 12초 돌기
    let res = '';
    while (!res) res = sim.step();
    expect(res).toBe('drift');
    // 표류는 "돌지 않은 시간"이 30초가 될 때 난다
    expect((sim.flightStep - sim.dockedSteps) * DT).toBeCloseTo(30, 6);
    expect(sim.flightStep).toBeGreaterThan(docked0 + DOCK_HOLD_STEPS);
  });
});

describe('기록 되풀이의 가장자리 (코드 검토에서 찾은 것)', () => {
  it('붙잡혀 있지 않을 때 걸린 나가기 기록은 버린다 — 다음 포획에서 바로 나가지 않는다', () => {
    const L = level();
    const probe = new Sim();
    flyToDock(probe, L);
    const caughtAt = probe.flightStep;
    const sim = new Sim();
    sim.begin(L, -88, 0, undefined, undefined, [10]);        // 10 스텝째에는 아직 날고 있다
    for (let i = 0; i < caughtAt + 240; i++) sim.step();
    expect(sim.docked).not.toBeNull();                       // 붙잡힌 뒤 1초가 지나도 그대로 돈다
    expect(sim.releases).toEqual([]);
  });

  it('도는 동안 걸린 분사 기록은 건너뛰고, 그 뒤의 분사는 그대로 쓴다', () => {
    const L = level();
    const probe = new Sim();
    flyToDock(probe, L);
    const caughtAt = probe.flightStep;
    const out = caughtAt + 300, later = out + 120;
    const sim = new Sim();
    sim.begin(L, -88, 0, undefined,
      [{ step: caughtAt + 50, dir: 0 }, { step: later, dir: 180 }], [out]);
    for (let i = 0; i < later + 10; i++) sim.step();
    expect(sim.releases).toEqual([out]);
    expect(sim.turns.map((t) => t.step)).toEqual([later]);
  });
});

describe('단계 데이터', () => {
  it('스키마가 docks 와 solution.releases 를 받는다', () => {
    const L = level();
    L.meta.solution.releases = [300];
    expect(validateSchema(L, 'x')).toEqual([]);
    expect(validateSchema({ ...L, docks: [{ ...DOCK, extra: 1 }] }, 'x').length).toBeGreaterThan(0);
    L.meta.solution.releases = [-1];
    expect(validateSchema(L, 'x').length).toBeGreaterThan(0);
  });
});
