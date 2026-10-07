// 패시브·경험치 (§22.5)
import { describe, expect, it } from 'vitest';
import { INF_TURN, MAX_TURNS, START_TURNS, makeChunk } from '../src/tools-shared/infinity.js';
import {
  CARROT_XP, PERK_KINDS, PERK_MAX, levelOf, noPerks, offerPerks, perkValueText, perkValues,
  raise, threatOf, xpForLevel,
} from '../src/tools-shared/perks.js';

describe('경험치', () => {
  it('문턱은 8·11·14… 씩 길어진다', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(8);
    expect(xpForLevel(3)).toBe(19);
    expect(xpForLevel(4)).toBe(33);
    expect(levelOf(0)).toBe(1);
    expect(levelOf(7.9)).toBe(1);
    expect(levelOf(8)).toBe(2);
    expect(levelOf(33)).toBe(4);
    expect(CARROT_XP).toBe(4);
  });

  it('시간 위협은 1분마다 하나', () => {
    expect(threatOf(0)).toBe(0);
    expect(threatOf(59.9)).toBe(0);
    expect(threatOf(60)).toBe(1);
    expect(threatOf(185)).toBe(3);
  });
});

describe('패시브 값', () => {
  it('없으면 인피니티 기본값 — 60°, 재충전 15초, 자석 26, 방패 하나', () => {
    const v = perkValues(noPerks());
    expect(v.maxTurns).toBe(START_TURNS);
    expect(v.turnMax).toBe(INF_TURN);
    expect(v.rechargeSteps).toBe(15 * 240);
    expect(v.magnetR).toBe(26);
    expect(noPerks().shield).toBe(1);
    expect(v.bulletScale).toBe(1);
    expect(v.foresight).toBe(0);
    expect(v.dockScale).toBe(1);
  });

  it('다 올리면 분사 6, 90°, 5초, 100, 50%, 2.0초, 2.0배', () => {
    let p = noPerks();
    for (const k of PERK_KINDS) for (let i = 0; i < PERK_MAX; i++) p = raise(k, p);
    const v = perkValues(p);
    expect(v.maxTurns).toBe(MAX_TURNS);
    expect(v.turnMax).toBe(90);
    expect(v.rechargeSteps).toBe(5 * 240);
    expect(v.magnetR).toBe(100);
    expect(v.bulletScale).toBe(0.5);
    expect(v.foresight).toBe(2);
    expect(v.dockScale).toBe(2);
    expect(raise('boost', p).boost).toBe(PERK_MAX);        // 더 안 오른다
    expect(raise('refill', p)).toEqual(p);
  });

  it('카드 문구의 값은 다음 단계 것', () => {
    expect(perkValueText('turn', 1)).toBe('70');
    expect(perkValueText('slowshot', 2)).toBe('65');
    expect(perkValueText('boost', 1)).toBe('4');
    expect(perkValueText('foresight', 3)).toBe('2.0');
  });
});

describe('레벨업 카드', () => {
  it('같은 시드·레벨·패시브면 같은 셋, 다른 시드면 대체로 다르다', () => {
    const p = noPerks();
    expect(offerPerks(42, 2, p)).toEqual(offerPerks(42, 2, p));
    const a = offerPerks(42, 2, p), b = offerPerks(43, 2, p), c = offerPerks(42, 3, p);
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    expect([b, c].some((x) => x.join() !== a.join())).toBe(true);
  });

  it('다 찬 패시브는 안 나오고, 셋이 안 되면 당근 한 입으로 채운다', () => {
    let p = noPerks();
    for (const k of PERK_KINDS) if (k !== 'shield' && k !== 'turn') for (let i = 0; i < PERK_MAX; i++) p = raise(k, p);
    const o = offerPerks(7, 5, p);
    expect(o.sort()).toEqual(['refill', 'shield', 'turn']);      // 방패는 시작 1 이라 아직 올릴 수 있다
    for (const k of PERK_KINDS) for (let i = 0; i < PERK_MAX; i++) p = raise(k, p);
    expect(offerPerks(7, 6, p)).toEqual(['refill']);
  });
});

describe('칸 보정 (§22.5)', () => {
  const count = (opts: { threat?: number; dockScale?: number }) => {
    let ufos = 0, holes = 0, rocks = 0;
    for (let cy = -8; cy <= 8; cy++) for (let cx = -8; cx <= 8; cx++) {
      const c = makeChunk(3, cx, cy, opts);
      ufos += c.ufos.length; holes += c.holes.length; rocks += c.rocks.length;
    }
    return { ufos, holes, rocks };
  };

  it('기본 보정이면 옵션 없이 만든 칸과 같다', () => {
    expect(makeChunk(3, 4, -5, {})).toEqual(makeChunk(3, 4, -5));
    expect(makeChunk(3, 4, -5, { threat: 0, dockScale: 1 })).toEqual(makeChunk(3, 4, -5));
  });

  it('시간 위협이 오르면 외계인·블랙홀·파편이 는다', () => {
    const a = count({}), b = count({ threat: 4 });
    expect(b.ufos).toBeGreaterThan(a.ufos);
    expect(b.holes).toBeGreaterThan(a.holes);
    expect(b.rocks).toBeGreaterThan(a.rocks);
  });

  it('위협이 오르면 외계인이 빨리 쏜다', () => {
    const slow: number[] = [], fast: number[] = [];
    for (let cy = -8; cy <= 8; cy++) for (let cx = -8; cx <= 8; cx++) {
      slow.push(...makeChunk(3, cx, cy).ufos.map((u) => u.interval));
      fast.push(...makeChunk(3, cx, cy, { threat: 5 }).ufos.map((u) => u.interval));
    }
    const avg = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(avg(fast)).toBeLessThan(avg(slow) * 0.7);
  });

  it('포획 링 배율은 링만 키운다', () => {
    let found = false;
    for (let cy = -6; cy <= 6 && !found; cy++) for (let cx = -6; cx <= 6 && !found; cx++) {
      const a = makeChunk(3, cx, cy), b = makeChunk(3, cx, cy, { dockScale: 2 });
      if (!a.docks.length) continue;
      found = true;
      expect(b.docks[0]!.cr).toBe(Math.round(a.docks[0]!.cr * 2));
      expect(b.docks[0]!.r).toBe(a.docks[0]!.r);
      expect(b.planets).toEqual(a.planets);
    }
    expect(found).toBe(true);
  });
});
