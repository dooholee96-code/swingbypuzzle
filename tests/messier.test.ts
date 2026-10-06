// 메시에 도감 (§22.7): 데이터·그림·문구·배치·인피니티.
import { describe, expect, it } from 'vitest';
import { allIds } from '../src/levels/chapters.js';
import { LANGS } from '../src/i18n/index.js';
import { CON_NAME, MESSIER_NAME, TYPE_NAME, distText, messierLabel, messierLine } from '../src/i18n/messier.js';
import { PIX } from '../src/render/palette.js';
import { messierArt } from '../src/render/sprites/messier.js';
import { COLLECT_DETOUR, MIN_COLLECT_WINDOW, collectMetrics } from '../src/tools-shared/collect.js';
import { CHUNK, InfinityWorld, ORIGIN, makeChunk } from '../src/tools-shared/infinity.js';
import {
  COLLECT_R, CONS, INFINITY_POOL, MESSIER, MESSIER_COUNT, MESSIER_TYPES, STAGE_MESSIER, messierOf,
} from '../src/tools-shared/messier.js';
import { loadLevel } from '../tools/levels-fs.js';

describe('데이터', () => {
  it('110개가 1번부터 차례로, 종류·별자리가 목록 안, 거리는 양수', () => {
    expect(MESSIER).toHaveLength(MESSIER_COUNT);
    MESSIER.forEach((m, i) => {
      expect(m.n).toBe(i + 1);
      expect(MESSIER_TYPES).toContain(m.type);
      expect(CONS).toContain(m.con);
      expect(m.ly).toBeGreaterThan(0);
    });
    expect(messierOf(31).con).toBe('And');
    expect(() => messierOf(111)).toThrow();
  });

  it('스테이지 몫과 인피니티 몫이 겹치지 않고 합치면 전부', () => {
    const all = new Set([...STAGE_MESSIER, ...INFINITY_POOL]);
    expect(all.size).toBe(MESSIER_COUNT);
    expect(STAGE_MESSIER.length + INFINITY_POOL.length).toBe(MESSIER_COUNT);
  });
});

describe('문구', () => {
  it('종류·별자리 이름이 네 언어에 다 있고, 고유명의 번호는 목록 안', () => {
    for (const l of LANGS) {
      for (const ty of MESSIER_TYPES) expect(TYPE_NAME[l][ty].length, `${l} ${ty}`).toBeGreaterThan(0);
      for (const c of CONS) expect(CON_NAME[l][c].length, `${l} ${c}`).toBeGreaterThan(0);
      for (const n of Object.keys(MESSIER_NAME[l])) expect(Number(n)).toBeLessThanOrEqual(MESSIER_COUNT);
    }
    expect(messierLabel(31, 'ko')).toBe('M31 안드로메다 은하');
    expect(messierLabel(3, 'ko')).toBe('M3');
  });

  it('거리 문구는 유효숫자 두세 자리', () => {
    expect(distText(6500, 'ko')).toBe('6,500 광년');
    expect(distText(37500, 'ko')).toBe('3.8만 광년');
    expect(distText(2540000, 'ko')).toBe('254만 광년');
    expect(distText(56000000, 'ko')).toBe('5,600만 광년');
    expect(distText(6500, 'en')).toBe('6,500 ly');
    expect(distText(2540000, 'en')).toBe('2.5 million ly');
    expect(distText(56000000, 'en')).toBe('56 million ly');
    expect(distText(2540000, 'ja')).toBe('254万光年');
    expect(messierLine(messierOf(31), 'ko')).toBe('나선 은하 · 안드로메다자리 · 254만 광년');
  });
});

describe('그림', () => {
  it('110개 모두 팔레트 키만 쓰고 비어 있지 않다, 같은 번호는 같은 그림', () => {
    for (const m of MESSIER) {
      const g = messierArt(m.n, m.type, 20);
      expect(g.w).toBe(20);
      const used = g.d.filter((c) => c !== '.');
      expect(used.length, `M${m.n}`).toBeGreaterThanOrEqual(8);
      for (const c of used) expect(PIX[c], `M${m.n} '${c}'`).toBeDefined();
      expect(messierArt(m.n, m.type, 20)).toEqual(g);
    }
  });
});

describe('스테이지 배치 (규칙 14)', () => {
  it('스테이지 몫이 저마다 한 단계에 놓여 있고, 그 밖의 번호는 단계에 없다', () => {
    const placed = new Map<number, string>();
    for (const id of allIds()) {
      const m = loadLevel(id).messier;
      if (!m) continue;
      expect(placed.has(m.n), `M${m.n} 이 ${placed.get(m.n)} 과 ${id} 에 둘 다`).toBe(false);
      placed.set(m.n, id);
      expect(STAGE_MESSIER).toContain(m.n);
    }
    for (const n of STAGE_MESSIER) expect(placed.has(n), `M${n} 이 어느 단계에도 없다`).toBe(true);
  });

  it('놓인 단계마다 정답 길에서 비켜나 있고, 지나며 도착하는 폭이 있다', { timeout: 120_000 }, () => {
    for (const id of allIds()) {
      const L = loadLevel(id);
      if (!L.messier) continue;
      const c = collectMetrics(L);
      expect(c.solution_dist, id).toBeGreaterThanOrEqual(COLLECT_R + COLLECT_DETOUR);
      expect(c.width, id).toBeGreaterThanOrEqual(MIN_COLLECT_WINDOW);
    }
  });
});

describe('인피니티', () => {
  it('바깥 링에만 나오고, 번호는 인피니티 몫, 다른 물체와 겹치지 않는다', () => {
    let count = 0;
    for (let cy = -7; cy <= 7; cy++) for (let cx = -7; cx <= 7; cx++) {
      const c = makeChunk(21, cx, cy);
      if (!c.messier) continue;
      count++;
      expect(Math.max(Math.abs(cx), Math.abs(cy))).toBeGreaterThanOrEqual(2);
      expect(INFINITY_POOL).toContain(c.messier.n);
      const near = (x: number, y: number): number => Math.hypot(x - c.messier!.x, y - c.messier!.y);
      for (const p of c.planets) if (!p.orbit) expect(near(p.x, p.y)).toBeGreaterThan(p.r + COLLECT_R);
      for (const q of c.rocks) expect(near(q.x, q.y)).toBeGreaterThan(q.r + COLLECT_R);
    }
    expect(count).toBeGreaterThan(5);
  });

  it('한 판에 한 번만 모인다 — 창을 다시 열어도 돌아오지 않는다', () => {
    const w = new InfinityWorld(21);
    let spot = w.messiers[0];
    for (let k = 2; !spot && k < 30; k++) { w.sync(ORIGIN + k * CHUNK, ORIGIN); spot = w.messiers[0]; }
    expect(spot).toBeDefined();
    expect(w.collect(spot!.x + COLLECT_R - 1, spot!.y)).toEqual([spot!.n]);
    expect(w.collect(spot!.x, spot!.y)).toEqual([]);
    w.sync(ORIGIN + 60 * CHUNK, ORIGIN);
    w.sync(spot!.x, spot!.y);
    expect(w.messiers.some((m) => m.id === spot!.id)).toBe(false);
  });
});
