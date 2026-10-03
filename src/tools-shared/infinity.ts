// 인피니티의 끝없는 우주. docs/PLAN.md §22.3
//
// 400×400 칸 단위로, 판의 시드와 칸 좌표만으로 내용을 정한다 — 어느 순서로 불러도
// 같은 칸은 같은 모양이다. 우주선 둘레 5×5 칸만 "창"(Level)에 올리고, 우주선이
// 칸을 넘으면 창을 갈아 끼운다. 물리는 스테이지와 같은 core/ 스테퍼다.
//
// 배치는 생성이지 시뮬레이션이 아니다. 시드 난수는 칸을 만들 때만 쓰고, 한번 만든
// 칸으로 도는 비행은 스테이지처럼 결정론적이다(§5.8).
//
// DOM·브라우저·Node API 를 import 하지 않는다 (§0.3).

import { dist } from '../core/physics.js';
import { mulberry32 } from '../core/rng.js';
import type { Hole, Level, Planet, Rock, Ufo } from '../core/types.js';

/** 칸 한 변 */
export const CHUNK = 400;
/** 창 반지름(칸). 5×5. 가장 먼 중력 범위(190)도 창 밖에서는 우주선에 닿지 않는다 */
export const WINDOW = 2;
/**
 * 월드 원점. core 의 벽 판정(0..w)을 쓰지 않으려고 출발점을 아주 멀리 둔다.
 * 150u/s 로 6000초 넘게 한쪽으로만 날아야 벽에 닿는다.
 */
export const ORIGIN = 1_000_000;
/** 출발점 둘레는 비워 둔다 — 발사대 돔과 조준할 자리 */
export const START_CLEAR = 260;
/** 아이템을 먹는 거리 (우주선 중심에서) */
export const ITEM_R = 16;
export const START_TURNS = 2;
export const MAX_TURNS = 5;
/**
 * 경계 격자점에 파편을 둘 확률. 출발 둘레(ring 0~1)는 "숨 고르는 구간"이라 성기게 둔다 —
 * 처음 시험에서 위로 곧게 쏘자 2초 만에 파편에 부딪혔다. 곧은 길 금지(§22.3)는 ring 2 부터다.
 */
const debrisP = (ring: number): number => (ring <= 1 ? 0.3 : ring === 2 ? 0.7 : 0.9);
const rockP = (ring: number): number => (ring <= 1 ? 0.55 : 0.85);

/** 분사 아이템 (§22.3). 먹으면 분사 +1 */
export interface Item { id: string; x: number; y: number }

export interface Chunk {
  cx: number; cy: number;
  planets: Planet[]; holes: Hole[]; rocks: Rock[]; ufos: Ufo[]; items: Item[];
}

/** 칸 좌표 → 시드. 판 시드와 섞는다 */
function chunkSeed(seed: number, cx: number, cy: number): number {
  let h = seed | 0;
  h = Math.imul(h ^ (cx * 73856093), 0x9e3779b1);
  h = Math.imul(h ^ (cy * 19349663), 0x85ebca6b);
  return (h ^ (h >>> 13)) | 0;
}

export function chunkOf(x: number, y: number): [number, number] {
  return [Math.floor((x - ORIGIN + CHUNK / 2) / CHUNK), Math.floor((y - ORIGIN + CHUNK / 2) / CHUNK)];
}

/**
 * 칸 하나를 만든다. 칸을 2×2 작은 칸(200)으로 나눠 작은 칸마다 하나씩 놓는다 —
 * 중력원 1~2, 나머지에 소행성·외계인·아이템. 작은 칸 가운데 ±50 으로 흔들어
 * 격자 줄이 곧은 통로가 되지 않게 한다(§22.3 직선 통로 금지, tests/infinity.test.ts).
 *
 * 멀어질수록(ring) 블랙홀·공전 행성·외계인이 차례로 섞인다.
 */
export function makeChunk(seed: number, cx: number, cy: number): Chunk {
  const rnd = mulberry32(chunkSeed(seed, cx, cy));
  const pick = (lo: number, hi: number): number => lo + rnd() * (hi - lo);
  const ring = Math.max(Math.abs(cx), Math.abs(cy));
  const x0 = ORIGIN + cx * CHUNK - CHUNK / 2, y0 = ORIGIN + cy * CHUNK - CHUNK / 2;
  const out: Chunk = { cx, cy, planets: [], holes: [], rocks: [], ufos: [], items: [] };

  // 작은 칸 넷의 순서를 섞는다
  const subs = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [subs[i], subs[j]] = [subs[j]!, subs[i]!];
  }
  const gravN = rnd() < 0.55 ? 2 : 1;
  const holeP = ring >= 2 ? Math.min(0.12 + 0.03 * ring, 0.3) : 0;
  const orbitP = ring >= 2 ? Math.min(0.08 + 0.02 * ring, 0.2) : 0;
  const ufoP = ring >= 3 ? Math.min(0.12 + 0.03 * ring, 0.35) : 0;
  const itemP = Math.max(0.42 - 0.02 * ring, 0.22);
  let itemN = 0;

  subs.forEach((sub, k) => {
    const scx = x0 + (sub % 2) * 200 + 100, scy = y0 + Math.floor(sub / 2) * 200 + 100;
    const x = Math.round(scx + pick(-50, 50)), y = Math.round(scy + pick(-50, 50));
    const clear = (r: number): boolean => dist(x, y, ORIGIN, ORIGIN) > START_CLEAR + r;
    const roll = rnd();

    if (k < gravN) {
      if (!clear(40)) return;
      if (rnd() < holeP) {
        out.holes.push({ x, y, rH: Math.round(pick(13, 17)), g: Math.round(pick(820, 920)), R: Math.round(pick(150, 180)) });
      } else if (rnd() < orbitP) {
        const rad = Math.round(pick(55, 75));
        out.planets.push({
          x: 0, y: 0, r: Math.round(pick(16, 22)), g: Math.round(pick(550, 680)),
          R: Math.round(pick(110, 135)), sides: Math.floor(pick(0, 6)),
          orbit: { cx: scx, cy: scy, rad, period: Math.round(pick(7, 12)), phase: rnd() * Math.PI * 2 },
        });
      } else {
        out.planets.push({
          x, y, r: Math.round(pick(18, 28)), g: Math.round(pick(650, 880)),
          R: Math.round(pick(130, 175)), sides: Math.floor(pick(0, 6)), ...(rnd() < 0.2 ? { ring: true } : {}),
        });
      }
      return;
    }
    if (roll < ufoP && clear(60)) {
      out.ufos.push({
        x, y, range: Math.round(pick(140, 180)), interval: Math.round(pick(9, 13)) / 10,
        delay: Math.round(pick(2, 8)) / 10, bs: Math.round(pick(220, 250)),
      });
      return;
    }
    if (itemN === 0 && rnd() < itemP && clear(0)) {
      out.items.push({ id: `${cx},${cy}`, x, y });
      itemN++;
      return;
    }
    if (rnd() < rockP(ring) && clear(30)) {
      out.rocks.push({ x, y, r: Math.round(pick(13, 22)), seed: (chunkSeed(seed, cx, cy) >>> 0) % 9973 + k });
    }
  });

  // 작은 칸 경계의 격자점 넷(작은 칸들의 모서리)에 작은 파편. 작은 칸 가운데만
  // 쓰면 그 사이 경계선이 곧은 통로로 남는다 — 재 보니 3000 유닛 넘게 아무것도 안 걸리는
  // 직선이 나왔다(tests/infinity.test.ts)
  for (const [px, py] of [[x0, y0], [x0 + 200, y0], [x0, y0 + 200], [x0 + 200, y0 + 200]] as const) {
    if (rnd() > debrisP(ring)) continue;
    // 흔들기는 ±15 까지. 이웃 칸(내용을 모른다)의 물체와도 겹치지 않는 한도다 —
    // 작은 칸 가운데(±50)에서 모서리까지 141 − 71 − 21 = 49 ≥ 행성 28 + 파편 14 + 6
    const x = Math.round(px + pick(-15, 15)), y = Math.round(py + pick(-15, 15));
    if (dist(x, y, ORIGIN, ORIGIN) <= START_CLEAR + 20) continue;
    out.rocks.push({ x, y, r: Math.round(pick(9, 14)), seed: (chunkSeed(seed, cx, cy) >>> 0) % 9973 + 7 });
  }
  return out;
}

/**
 * 판 하나의 우주. `level` 이 시뮬레이션과 그림이 함께 보는 창이다 — 배열을 제자리에서
 * 갈아 끼우므로 같은 객체를 계속 쥐고 있으면 된다.
 */
export class InfinityWorld {
  readonly level: Level;
  /** 창에 올라와 있는 아이템. 먹은 것은 빠진다 */
  items: Item[] = [];
  private eaten = new Set<string>();
  private cache = new Map<string, Chunk>();
  private at: [number, number] | null = null;

  constructor(readonly seed: number) {
    this.level = {
      id: 'infinity', name: '', w: ORIGIN * 2, h: ORIGIN * 2, speed: 150, preview: 1.8,
      start: { x: ORIGIN, y: ORIGIN },
      // 목적지는 없다. 돔 방향(위쪽)만 정하려고 아주 먼 곳에 둔다
      goal: { x: ORIGIN, y: ORIGIN - 1e5, r: 1 },
      planets: [], holes: [], rocks: [], ufos: [],
      turns: START_TURNS,
      meta: {
        chapter: 0, slot: 0, role: 'infinity', intro: 'infinity',
        solution: { angle: -90, launch_step: 0 }, source: 'generated', updated: '',
      },
    };
    this.sync(ORIGIN, ORIGIN);
  }

  chunk(cx: number, cy: number): Chunk {
    const k = `${cx},${cy}`;
    let c = this.cache.get(k);
    if (!c) {
      c = makeChunk(this.seed, cx, cy);
      this.cache.set(k, c);
      // 아주 먼 칸은 잊는다. 다시 오면 같은 모양으로 다시 만든다(먹은 아이템은 기억한다)
      if (this.cache.size > 200) {
        for (const key of this.cache.keys()) {
          const [ax, ay] = key.split(',').map(Number) as [number, number];
          if (Math.max(Math.abs(ax - cx), Math.abs(ay - cy)) > WINDOW + 3) this.cache.delete(key);
        }
      }
    }
    return c;
  }

  /**
   * 우주선이 칸을 넘었으면 창을 갈아 끼운다. 갈아 끼웠으면 true —
   * 부른 쪽이 Sim.refreshBodies 와 외계인 사격 시각을 맞춘다.
   */
  sync(x: number, y: number): boolean {
    const [cx, cy] = chunkOf(x, y);
    if (this.at && this.at[0] === cx && this.at[1] === cy) return false;
    this.at = [cx, cy];
    const L = this.level;
    const planets: Planet[] = [], holes: Hole[] = [], rocks: Rock[] = [], ufos: Ufo[] = [];
    const items: Item[] = [];
    for (let dy = -WINDOW; dy <= WINDOW; dy++) {
      for (let dx = -WINDOW; dx <= WINDOW; dx++) {
        const c = this.chunk(cx + dx, cy + dy);
        planets.push(...c.planets); holes.push(...c.holes);
        rocks.push(...c.rocks); ufos.push(...c.ufos);
        for (const it of c.items) if (!this.eaten.has(it.id)) items.push(it);
      }
    }
    L.planets = planets; L.holes = holes; L.rocks = rocks; L.ufos = ufos;
    this.items = items;
    return true;
  }

  /** 우주선 자리에서 먹을 수 있는 아이템을 먹는다. 먹은 개수 */
  eat(x: number, y: number): number {
    let n = 0;
    this.items = this.items.filter((it) => {
      if (dist(it.x, it.y, x, y) >= ITEM_R) return true;
      this.eaten.add(it.id);
      n++;
      return false;
    });
    return n;
  }

}
