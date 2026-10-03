// 인피니티의 우주 (§22.3). 칸은 시드로만 정해지고, 곧은 빈 길이 길게 이어지지 않으며,
// 창을 갈아 끼워도 비행은 결정론적이다.
import { describe, expect, it } from 'vitest';
import { PAD_R } from '../src/core/constants.js';
import { mulberry32 } from '../src/core/rng.js';
import { Sim } from '../src/core/simulate.js';
import type { Level } from '../src/core/types.js';
import {
  CHUNK, ITEM_R, InfinityWorld, ORIGIN, START_CLEAR, chunkOf, makeChunk,
} from '../src/tools-shared/infinity.js';

const near = (ax: number, ay: number, bx: number, by: number): number =>
  Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);

function region(seed: number, n: number) {
  const planets = [], holes = [], rocks = [], ufos = [], items = [];
  for (let cy = -n; cy <= n; cy++) for (let cx = -n; cx <= n; cx++) {
    const c = makeChunk(seed, cx, cy);
    planets.push(...c.planets); holes.push(...c.holes); rocks.push(...c.rocks);
    ufos.push(...c.ufos); items.push(...c.items);
  }
  return { planets, holes, rocks, ufos, items };
}

describe('칸 만들기', () => {
  it('같은 시드·칸은 언제나 같은 칸이다', () => {
    expect(makeChunk(7, 3, -2)).toEqual(makeChunk(7, 3, -2));
    expect(makeChunk(7, 3, -2)).not.toEqual(makeChunk(8, 3, -2));
  });

  it('chunkOf 는 칸 가운데를 그 칸으로 돌려준다', () => {
    expect(chunkOf(ORIGIN, ORIGIN)).toEqual([0, 0]);
    expect(chunkOf(ORIGIN + CHUNK, ORIGIN - CHUNK)).toEqual([1, -1]);
  });

  it('출발점 둘레는 비어 있고, 중력 범위가 발사대에 닿지 않는다', () => {
    for (const seed of [1, 2, 3]) {
      const r = region(seed, 1);
      for (const p of r.planets) {
        const [x, y] = p.orbit ? [p.orbit.cx, p.orbit.cy] : [p.x, p.y];
        expect(near(x, y, ORIGIN, ORIGIN) - (p.orbit?.rad ?? 0)).toBeGreaterThan(p.R + PAD_R + 20);
      }
      for (const h of r.holes) expect(near(h.x, h.y, ORIGIN, ORIGIN)).toBeGreaterThan(h.R + PAD_R + 20);
      for (const q of r.rocks) expect(near(q.x, q.y, ORIGIN, ORIGIN)).toBeGreaterThan(START_CLEAR);
      for (const u of r.ufos) expect(near(u.x, u.y, ORIGIN, ORIGIN)).toBeGreaterThan(START_CLEAR);
    }
  });

  it('천체·소행성끼리 겹치지 않는다 (칸 경계를 넘어서도)', () => {
    const r = region(5, 4);
    const solids = [
      ...r.planets.filter((p) => !p.orbit).map((p) => ({ x: p.x, y: p.y, r: p.r })),
      ...r.planets.filter((p) => p.orbit).map((p) => ({ x: p.orbit!.cx, y: p.orbit!.cy, r: p.orbit!.rad + p.r })),
      ...r.holes.map((h) => ({ x: h.x, y: h.y, r: h.rH + 4 })),
      ...r.rocks.map((q) => ({ x: q.x, y: q.y, r: q.r })),
    ];
    for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i]!, b = solids[j]!;
      expect(near(a.x, a.y, b.x, b.y), `${i}-${j}`).toBeGreaterThan(a.r + b.r + 6);
    }
  });

  it('멀어질수록 블랙홀·외계인이 나온다 — 출발 칸 둘레에는 없다', () => {
    const inner = region(9, 1), all = region(9, 6);
    expect(inner.holes.length + inner.ufos.length).toBe(0);
    expect(all.holes.length).toBeGreaterThan(0);
    expect(all.ufos.length).toBeGreaterThan(0);
    expect(all.items.length).toBeGreaterThan(0);
  });
});

describe('곧은 빈 길 (§22.3)', () => {
  // 직선을 무작위로 쏴 중력 범위나 소행성에 처음 걸리기까지의 거리를 잰다.
  // 99% 가 900 유닛(6초) 안에, 가장 긴 것도 2000 유닛 안에 끊겨야 한다.
  // 출발 둘레(ring 0~1, ±600)는 숨 고르는 구간이라 거기서 출발하는 직선은 빼고 잰다.
  it.each([1, 2, 3])('시드 %i', (seed) => {
    const r = region(seed, 8);
    const obs = [
      ...r.planets.map((p) => (p.orbit ? { x: p.orbit.cx, y: p.orbit.cy, r: p.R } : { x: p.x, y: p.y, r: p.R })),
      ...r.holes.map((h) => ({ x: h.x, y: h.y, r: h.R })),
      ...r.rocks.map((q) => ({ x: q.x, y: q.y, r: q.r + 5 })),
    ];
    const rnd = mulberry32(seed * 7);
    const free: number[] = [];
    for (let i = 0; i < 6000; i++) {
      const x = ORIGIN + (rnd() - 0.5) * CHUNK * 10, y = ORIGIN + (rnd() - 0.5) * CHUNK * 10;
      const a = rnd() * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a);
      if (Math.max(Math.abs(x - ORIGIN), Math.abs(y - ORIGIN)) < CHUNK * 1.5) continue;
      if (obs.some((o) => near(o.x, o.y, x, y) < o.r)) continue;
      let best = 3000;
      for (const o of obs) {
        const t = (o.x - x) * ux + (o.y - y) * uy;
        if (t < 0 || t > best) continue;
        const d2 = (o.x - x) ** 2 + (o.y - y) ** 2 - t * t;
        if (d2 < o.r * o.r) best = Math.min(best, Math.max(0, t - Math.sqrt(o.r * o.r - d2)));
      }
      free.push(best);
    }
    free.sort((p, q) => p - q);
    expect(free[Math.floor(0.99 * (free.length - 1))]!).toBeLessThan(900);
    expect(free[free.length - 1]!).toBeLessThan(2000);
  });
});

describe('창 갈아 끼우기와 비행', () => {
  it('끝없는 비행은 30초가 지나도 표류로 끝나지 않는다', () => {
    const L: Level = {
      id: 'x', name: '', w: 1e6, h: 1e6, speed: 150, preview: 1, start: { x: 5e5, y: 5e5 },
      goal: { x: -1e6, y: -1e6, r: 1 }, meta: {
        chapter: 0, slot: 0, role: '', solution: { angle: 0, launch_step: 0 }, source: 'generated', updated: '',
      },
    };
    const sim = new Sim();
    sim.endless = true;
    sim.begin(L, 0, 0);
    let r = '';
    for (let i = 0; i < 40 * 240 && !r; i++) r = sim.step();
    expect(r).toBe('');
  });

  it('같은 시드·같은 발사면 창을 갈아 끼우며 날아도 결과가 같다', () => {
    const fly = (): [string, number, number, number] => {
      const w = new InfinityWorld(42);
      const sim = new Sim();
      sim.endless = true;
      sim.begin(w.level, -70, 0);
      let r = '';
      let swaps = 0;
      while (!r && sim.flightStep < 240 * 60) {
        r = sim.step();
        if (w.sync(sim.ship.x, sim.ship.y)) { sim.refreshBodies(); swaps++; }
      }
      return [r, sim.flightStep, sim.ship.x, swaps];
    };
    const a = fly(), b = fly();
    expect(a).toEqual(b);
    expect(a[3]).toBeGreaterThan(0);                     // 실제로 칸을 넘었다
  });

  it('창을 갈아 끼워도 남아 있는 외계인의 사격 시각은 이어진다', () => {
    const w = new InfinityWorld(3);
    // 멀리 가서 외계인이 있는 창을 연다
    let found = false;
    for (let k = 4; k < 12 && !found; k++) {
      w.sync(ORIGIN + k * CHUNK, ORIGIN);
      if ((w.level.ufos ?? []).length) found = true;
    }
    expect(found).toBe(true);
    const sim = new Sim();
    sim.endless = true;
    sim.begin(w.level, 0, 0);
    const u0 = w.level.ufos![0]!;
    sim.state.nextFire[0] = 123.5;
    const [cx, cy] = chunkOf(u0.x, u0.y);
    w.sync(ORIGIN + cx * CHUNK + CHUNK, ORIGIN + cy * CHUNK);   // 한 칸 옆으로 — u0 는 창에 남는다
    sim.refreshBodies();
    const i = w.level.ufos!.indexOf(u0);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(sim.state.nextFire[i]).toBe(123.5);
  });

  it('아이템은 한 번만 먹힌다 — 창을 다시 열어도 돌아오지 않는다', () => {
    const w = new InfinityWorld(11);
    let it = w.items[0];
    for (let k = 1; !it && k < 10; k++) { w.sync(ORIGIN + k * CHUNK, ORIGIN); it = w.items[0]; }
    expect(it).toBeDefined();
    expect(w.eat(it!.x + ITEM_R - 1, it!.y)).toBe(1);
    expect(w.eat(it!.x, it!.y)).toBe(0);
    w.sync(ORIGIN + 40 * CHUNK, ORIGIN);
    w.sync(it!.x, it!.y);
    expect(w.items.some((x) => x.id === it!.id)).toBe(false);
  });
});
