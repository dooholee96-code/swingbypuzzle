// 스프라이트. docs/design/rabbit-rocket, docs/PLAN.md §12
//
// 1) 우리 생성기가 시안의 아틀라스(디자이너가 넘긴 PNG)와 픽셀 단위로 같은가.
//    기준은 tests/fixtures/atlas-frames.json — 시안 PNG 에서 뽑은 해시다. 코드에서 만든 값이 아니다.
// 2) 그림 크기가 판정 크기와 맞는가 (§5.4). 1 아트 픽셀 = 1 월드 유닛.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { PIX } from '../src/render/palette.js';
import type { Grid } from '../src/render/sprites/pixel.js';
import { type Face, type SmallName, rocketDir, small, ufo } from '../src/render/sprites/rocket.js';
import { blackhole, moon, planet, portal } from '../src/render/sprites/world.js';
import { HOLE_CORE, holeArtRadius } from '../src/render/field.js';
import { SHIP_R } from '../src/core/constants.js';

const ATLAS = JSON.parse(readFileSync(new URL('./fixtures/atlas-frames.json', import.meta.url), 'utf8')) as
  Record<string, { w: number; h: number; sha1: string }>;

function hash(g: Grid): string {
  const px = g.d.map((c) => (c === '.' ? '.' : PIX[c]!));
  return createHash('sha1').update(px.join(',')).digest('hex');
}

/** 아틀라스 이름 → 생성기 호출 */
function make(name: string): Grid {
  const p = name.split('/');
  const dir = (i: string): number => Number(i) * Math.PI / 8;
  if (p[0] === 'rocket') {
    const m = p[1]!.match(/^fly_flame(\d)$/);
    return m ? rocketDir('fly', dir(p[2]!), { flame: Number(m[1]), ears: 'back' })
      : rocketDir(p[1] as Face, dir(p[2]!));
  }
  if (p[0] === 'ufo') return ufo(Number(p[1]));
  if (p[0] === 'portal_r24') return portal(24, Number(p[1]));
  if (p[0] === 'hole_r12') return blackhole(12, Number(p[1]));
  if (p[0] === 'moon_r18') return moon(18);
  if (p[0] === 'planet_r22') return planet(22, Number(p[1]));
  if (p[0] === 'planet_r26_ring') return planet(26, 0, { ring: true });
  if (p[0] === 'fx') return small(p[1] as SmallName);
  throw new Error(`모르는 프레임 ${name}`);
}

describe('시안 아틀라스와 같다', () => {
  it(`프레임 ${Object.keys(ATLAS).length}개가 픽셀 단위로 같다`, () => {
    const bad: string[] = [];
    for (const [name, f] of Object.entries(ATLAS)) {
      const g = make(name);
      if (g.w !== f.w || g.h !== f.h) bad.push(`${name}: 크기 ${g.w}×${g.h} ≠ ${f.w}×${f.h}`);
      else if (hash(g) !== f.sha1) bad.push(`${name}: 픽셀이 다르다`);
    }
    expect(bad).toEqual([]);
  });
});

/** 가운데 줄에서 칠해진 폭 */
function rowWidth(g: Grid, y: number): number {
  let lo = Infinity, hi = -Infinity;
  for (let x = 0; x < g.w; x++) if (g.d[y * g.w + x] !== '.') { lo = Math.min(lo, x); hi = Math.max(hi, x); }
  return hi - lo + 1;
}

describe('그림 크기 = 판정 크기 (§5.4)', () => {
  it('행성: 반경 r 의 구 + 외곽선 1px', () => {
    for (const r of [14, 18, 22, 26, 30]) {
      const g = planet(r, 2, { face: false });
      expect(rowWidth(g, g.ay), `r=${r}`).toBe(2 * r + 2);
    }
  });

  it('비행접시: 폭이 판정 반경 13 의 지름을 덮는다', () => {
    const g = ufo(0);
    expect(rowWidth(g, g.ay)).toBeGreaterThanOrEqual(2 * 13);
  });

  it('토끼굴: 풀색 원판의 반경이 도착 반경 r', () => {
    for (const r of [24, 26]) {
      const g = portal(r, 0);
      const at = (x: number): string => g.d[g.ay * g.w + x]!;
      const grass = (c: string): boolean => c === 'l' || c === 'L';
      expect(grass(at(g.ax + r - 1)), `r=${r} 안쪽 끝`).toBe(true);    // 원판의 마지막 칸
      expect(grass(at(g.ax - r)), `r=${r} 왼쪽 끝`).toBe(true);
      // 그 바깥은 외곽선과 풀잎뿐 — 그림이 판정보다 2px 넘게 크지 않다
      expect(rowWidth(g, g.ay), `r=${r}`).toBeLessThanOrEqual(2 * r + 5);
    }
  });

  it('블랙홀: 검은 핵이 지평선 판정(rH + 2)을 다 덮는다', () => {
    // 시안은 hole(rH) 였지만 그러면 검은 핵이 0.6·rH 라 판정보다 작다 —
    // 닿지도 않았는데 빨려 들어간다. 그림을 키워 핵을 판정에 맞췄다.
    for (const rH of [12, 14, 15, 16, 17, 18]) {
      const r = holeArtRadius(rH);
      expect(r * HOLE_CORE, `rH=${rH}`).toBeGreaterThanOrEqual(rH + 2);
      expect(r * HOLE_CORE, `rH=${rH}`).toBeLessThan(rH + 3);    // 너무 크지도 않게
    }
  });

  it('우주선 판정(SHIP_R)은 로켓 그림 안에 있다 — 그림이 판정보다 작아 보이지 않게', () => {
    const g = rocketDir('idle', 0);
    expect(rowWidth(g, Math.round(g.ay))).toBeGreaterThan(2 * SHIP_R);
  });
});
