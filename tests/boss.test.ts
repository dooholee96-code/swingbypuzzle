// 보스전 (§22.6). 별개의 작은 시뮬레이션 — 결정론, 당근탄, 피격, 승패.
import { describe, expect, it } from 'vitest';
import { DT } from '../src/core/constants.js';
import {
  ARENA_H, ARENA_W, BOSS_INVULN, BOSS_LIVES, BossSim, CARROT_EVERY, DIE_T, ENTER_T, bossHp,
} from '../src/core/boss.js';

/** 우주선을 보스 바로 밑에 두고 가만히 — 당근탄이 다 맞는다 */
function underBoss(b: BossSim): [number, number] { return [b.x, ARENA_H - 90]; }

describe('결정론', () => {
  it('같은 시드·같은 입력이면 같은 상태', () => {
    const run = (): string => {
      const b = new BossSim(77, 2);
      for (let i = 0; i < 240 * 12; i++) {
        const [tx, ty] = i % 480 < 240 ? [60, ARENA_H - 120] : [ARENA_W - 60, ARENA_H - 60];
        b.step(tx, ty);
        if (!b.active) break;
      }
      return JSON.stringify([b.phase, b.hp, b.lives, b.ship, b.x, b.y, b.shots.length, b.carrots.length]);
    };
    expect(run()).toBe(run());
    const other = new BossSim(78, 2);
    for (let i = 0; i < 240 * 6; i++) other.step(60, ARENA_H - 120);
    const a = new BossSim(77, 2);
    for (let i = 0; i < 240 * 6; i++) a.step(60, ARENA_H - 120);
    expect([other.x, other.shots.length]).not.toEqual([a.x, a.shots.length]);
  });
});

describe('흐름', () => {
  it('내려온 뒤 싸움이 시작되고, 당근탄이 체력을 깎아 결국 터진다', () => {
    const b = new BossSim(1, 1, 99);
    expect(b.phase).toBe('enter');
    expect(b.hpMax).toBe(bossHp(1));
    let enteredAt = -1, dyingAt = -1;
    for (let i = 0; i < 240 * 60; i++) {
      const ph = b.step(...underBoss(b));
      if (enteredAt < 0 && ph === 'fight') enteredAt = b.t;
      if (dyingAt < 0 && ph === 'dying') dyingAt = b.t;
      if (ph === 'done') break;
    }
    expect(enteredAt).toBeCloseTo(ENTER_T, 1);
    expect(dyingAt).toBeGreaterThan(ENTER_T);
    // 초당 8발, 체력 110 → 다 맞히면 14초. 보스가 흔들려 빗나가는 몫을 더해 25초 안
    expect(dyingAt - ENTER_T).toBeGreaterThan(13);
    expect(dyingAt - ENTER_T).toBeLessThan(26);
    expect(b.phase).toBe('done');
    expect(b.t - dyingAt).toBeCloseTo(DIE_T, 1);
    expect(b.fired).toBeGreaterThan(100);
    expect(b.shots).toEqual([]);
  });

  it('회차가 오르면 체력·탄이 는다', () => {
    expect(bossHp(2)).toBeGreaterThan(bossHp(1));
    const count = (round: number): number => {
      const b = new BossSim(5, round, 99);
      let n = 0;
      for (let i = 0; i < 240 * 8; i++) { b.step(40, ARENA_H - 40); n = Math.max(n, b.shots.length); }
      return n;
    };
    expect(count(3)).toBeGreaterThan(count(1));
  });

  it('맞으면 목숨이 줄고 1.5초 무적, 다 잃으면 진다', () => {
    // 보스 몸통 안으로 들어가 부딪힌다
    const b = new BossSim(3, 1);
    expect(b.lives).toBe(BOSS_LIVES);
    let firstHitAt = -1;
    for (let i = 0; i < 240 * 30; i++) {
      const ph = b.step(b.x, b.y);
      if (firstHitAt < 0 && b.hitsTaken === 1) {
        firstHitAt = b.n;
        expect(b.lives).toBe(BOSS_LIVES - 1);
        expect(b.invuln).toBe(BOSS_INVULN);
      }
      if (ph === 'lost') break;
    }
    expect(b.phase).toBe('lost');
    expect(b.lives).toBe(0);
    // 두 번째 피격은 무적이 끝난 뒤
    expect(b.hitsTaken).toBe(BOSS_LIVES);
    expect(b.n - firstHitAt).toBeGreaterThanOrEqual(BOSS_INVULN * 2);
  });

  it('끝난 뒤의 step 은 아무것도 바꾸지 않는다', () => {
    const b = new BossSim(2, 1, 1);
    for (let i = 0; i < 240 * 30 && b.active; i++) b.step(b.x, b.y);
    const snap = JSON.stringify(b);
    b.step(0, 0);
    expect(JSON.stringify(b)).toBe(snap);
  });

  it('당근은 CARROT_EVERY 스텝마다, 우주선은 아레나 밖으로 못 간다', () => {
    const b = new BossSim(9, 1);
    for (let i = 0; i < CARROT_EVERY * 4; i++) b.step(-500, 5000);
    expect(b.fired).toBe(4);
    expect(b.ship.x).toBeGreaterThanOrEqual(16);
    expect(b.ship.y).toBeLessThanOrEqual(ARENA_H - 16);
    expect(DT).toBe(1 / 240);
  });
});
