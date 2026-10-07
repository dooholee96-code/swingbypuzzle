// 보정값 (§22.5). 기본값이면 전과 같고, 패시브 값이면 꺾는 각·총알·방패가 달라진다.
import { describe, expect, it } from 'vitest';
import { DT, SHIP_R, TURN_MAX } from '../src/core/constants.js';
import { INVULN_STEPS, defaultMods } from '../src/core/mods.js';
import { Sim, applyTurn, sameDock } from '../src/core/simulate.js';
import type { Level } from '../src/core/types.js';
import { loadLevel } from '../tools/levels-fs.js';

const O = 20000;
const level = (extra: Partial<Level> = {}): Level => ({
  id: 'x', name: '', w: 2 * O, h: 2 * O, speed: 150, preview: 1.8,
  start: { x: O, y: O }, goal: { x: -1e5, y: -1e5, r: 1 },
  meta: { chapter: 0, slot: 0, role: '', solution: { angle: -90, launch_step: 0 }, source: 'generated', updated: '' },
  ...extra,
});
const speed = (s: { vx: number; vy: number }): number => Math.sqrt(s.vx * s.vx + s.vy * s.vy);

describe('꺾는 각', () => {
  it('기본값은 TURN_MAX, 보정값이면 그만큼', () => {
    const s = { x: 0, y: 0, vx: 150, vy: 0 };
    applyTurn(s, 90);
    expect(Math.atan2(s.vy, s.vx) * 180 / Math.PI).toBeCloseTo(TURN_MAX, 9);
    const s2 = { x: 0, y: 0, vx: 150, vy: 0 };
    applyTurn(s2, 90, 64);
    expect(Math.atan2(s2.vy, s2.vx) * 180 / Math.PI).toBeCloseTo(64, 9);
    expect(speed(s2)).toBeCloseTo(150, 9);
  });

  it('Sim.mods.turnMax 를 따른다', () => {
    const L = level();
    const sim = new Sim();
    sim.mods.turnMax = 64;
    sim.begin(L, -90, 0);
    sim.queueTurn(0);                                   // 위로 날다 오른쪽(0°)으로 — 90° 차이
    sim.step();
    expect(Math.atan2(sim.ship.vy, sim.ship.vx) * 180 / Math.PI).toBeCloseTo(-90 + 64, 6);
  });
});

describe('총알 속도', () => {
  const withUfo = (): Level => level({ ufos: [{ x: O, y: O - 300, range: 400, interval: 10, delay: 0.1, bs: 240 }] });
  const firstBullet = (scale: number): { vx: number; vy: number } => {
    const sim = new Sim();
    sim.mods.bulletScale = scale;
    sim.begin(withUfo(), -90, 0);
    while (!sim.state.bullets.length) sim.step();
    return sim.state.bullets[0]!;
  };
  it('기본 1 이면 레벨의 bs 그대로, 0.5 면 반', () => {
    expect(speed(firstBullet(1))).toBeCloseTo(240, 6);
    expect(speed(firstBullet(0.5))).toBeCloseTo(120, 6);
  });
});

describe('방패', () => {
  // 바로 위에 소행성. 그대로 쏘면 부딪힌다
  const rockAhead = (): Level => level({ rocks: [{ x: O, y: O - 200, r: 20, seed: 1 }] });

  it('방패가 없으면 부딪혀 끝난다', () => {
    const sim = new Sim();
    expect(sim.simulate(rockAhead(), -90, 0)).toBe('rock');
  });

  it('방패가 있으면 튕겨 나오고 횟수가 준다 — 속력은 그대로, 무적 1.5초', () => {
    const sim = new Sim();
    sim.mods.shield = 1;
    sim.begin(rockAhead(), -90, 0);
    let r = '';
    for (let i = 0; i < 240 * 3 && !r; i++) r = sim.step();
    expect(r).toBe('');
    expect(sim.mods.shield).toBe(0);
    expect(sim.absorbs).toBe(1);
    expect(speed(sim.ship)).toBeCloseTo(150, 6);
    expect(sim.ship.vy).toBeGreaterThan(0);               // 아래쪽(돌아오는 방향)으로 반사
    expect(sim.ship.y).toBeGreaterThan(O - 200 + 20 * 0.85 + SHIP_R);
  });

  it('무적 중의 충돌은 횟수를 쓰지 않고, 무적이 끝나면 다시 쓴다', () => {
    // 중력이 끌어당겨 바로 되돌아오는 행성 — 무적 동안 여러 번 튕긴다
    const L = level({ planets: [{ x: O, y: O - 120, r: 24, g: 900, R: 300, sides: 0 }] });
    const sim = new Sim();
    sim.mods.shield = 2;
    sim.begin(L, -90, 0);
    let r = '';
    let firstAbsorbAt = -1;
    for (let i = 0; i < 240 * 20 && !r; i++) {
      r = sim.step();
      if (firstAbsorbAt < 0 && sim.absorbs === 1) firstAbsorbAt = sim.flightStep;
    }
    expect(firstAbsorbAt).toBeGreaterThan(0);
    // 두 번째 횟수는 무적(INVULN_STEPS)이 끝난 뒤에야 쓰인다
    expect(sim.absorbs).toBeGreaterThanOrEqual(1);
    expect(sim.mods.shield).toBeLessThanOrEqual(2);
    expect(INVULN_STEPS).toBe(360);
  });

  it('총알도 튕긴다 — 맞은 총알이 사라진다', () => {
    const L = level({ ufos: [{ x: O, y: O - 300, range: 400, interval: 0.3, delay: 0.05, bs: 300 }] });
    const sim = new Sim();
    sim.mods.shield = 1;
    sim.begin(L, -90, 0);
    let r = '';
    for (let i = 0; i < 240 * 2 && !r; i++) r = sim.step();
    expect(sim.absorbs).toBeGreaterThanOrEqual(1);
  });

  it('벽·표류는 방패로 막지 못한다', () => {
    const L = level({ w: 2 * O, h: O + 100 });            // 아래가 가깝다
    const sim = new Sim();
    sim.mods.shield = 3;
    expect(sim.simulate(L, 90, 0)).toBe('wall');
  });

  it('기본 보정값으로는 §6.2 기준 단계가 전과 같다', () => {
    const sim = new Sim();
    expect(sim.mods).toEqual(defaultMods());
    expect(sim.simulate(loadLevel('1-1'), -66, 0)).toBe('win');
    expect(sim.simulate(loadLevel('3-1'), -30, 0)).toBe('win');
    expect(sim.simulate(loadLevel('1-1'), -66 + 20, 0)).not.toBe('win');
    expect(sim.invuln).toBe(0);
    expect(DT).toBe(1 / 240);
  });
});

describe('궤도 행성은 자리로 알아본다', () => {
  it('같은 자리의 다른 객체는 같은 행성이다', () => {
    const a = { x: 1, y: 2, r: 10, cr: 40, sides: 0 };
    expect(sameDock(a, { ...a })).toBe(true);
    expect(sameDock(a, { ...a, x: 3 })).toBe(false);
    expect(sameDock(a, null)).toBe(false);
  });
});

describe('이어하기 (§14.7)', () => {
  const rockAhead = (): Level => level({ rocks: [{ x: O, y: O - 200, r: 20, seed: 1 }] });

  it('소행성에 부딪혀 끝난 뒤 revive 하면 바깥에서 반사돼 이어 난다 — 무적 3초, 방패는 안 쓴다', () => {
    const sim = new Sim();
    sim.begin(rockAhead(), -90, 0);
    let r = '';
    for (let i = 0; i < 240 * 3 && !r; i++) r = sim.step();
    expect(r).toBe('rock');
    expect(sim.lastOutcome).toBe('rock');
    expect(sim.revive()).toBe(true);
    expect(sim.invuln).toBe(720);
    expect(sim.mods.shield).toBe(0);
    expect(sim.ship.vy).toBeGreaterThan(0);
    expect(speed(sim.ship)).toBeCloseTo(150, 6);
    let r2 = '';
    for (let i = 0; i < 240 * 2 && !r2; i++) r2 = sim.step();
    expect(r2).toBe('');
  });

  it('블랙홀은 중력 범위 밖으로 내보낸다', () => {
    const L = level({ holes: [{ x: O, y: O - 200, rH: 14, g: 900, R: 160 }] });
    const sim = new Sim();
    sim.begin(L, -90, 0);
    let r = '';
    for (let i = 0; i < 240 * 5 && !r; i++) r = sim.step();
    expect(r).toBe('hole');
    expect(sim.revive()).toBe(true);
    expect(Math.sqrt((sim.ship.x - O) ** 2 + (sim.ship.y - (O - 200)) ** 2)).toBeGreaterThan(160);
  });

  it('끝나지 않았거나 벽·표류·도착이면 거짓', () => {
    const sim = new Sim();
    sim.begin(rockAhead(), -90, 0);
    expect(sim.revive()).toBe(false);
    const wall = new Sim();
    const L = level({});
    L.w = 2 * O; L.h = 2 * O;
    wall.begin({ ...L, w: 400, h: 400, start: { x: 200, y: 200 } }, -90, 0);
    let r = '';
    for (let i = 0; i < 240 * 5 && !r; i++) r = wall.step();
    expect(r).toBe('wall');
    expect(wall.revive()).toBe(false);
  });
});
