// 격자 → 캔버스. 한 번 굽고 이름으로 캐시한다.
//
// 시안의 아틀라스 PNG(rabbit-rocket-atlas.png)는 싣지 않는다. 같은 생성기로 런타임에
// 굽는다 — 시안과 픽셀 단위로 같다는 것을 tests/sprites.test.ts 가 확인했다(프레임 166개).
// 그림의 원본이 코드 하나뿐이라 고칠 곳도 하나다.

import { PIX } from '../palette.js';
import type { Grid } from './pixel.js';

export type Img = HTMLCanvasElement | OffscreenCanvas;

export interface Baked {
  img: Img;
  w: number;
  h: number;
  /** 중심점 (프레임 왼쪽 위 기준) */
  ax: number;
  ay: number;
}

function canvas(w: number, h: number): Img {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** 격자를 1배 크기 캔버스로. 같은 색이 이어지는 가로 줄은 한 번에 칠한다 */
export function bake(g: Grid): Baked {
  const img = canvas(Math.max(1, g.w), Math.max(1, g.h));
  const ctx = img.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  for (let y = 0; y < g.h; y++) {
    let x = 0;
    while (x < g.w) {
      const c = g.d[y * g.w + x]!;
      let e = x + 1;
      while (e < g.w && g.d[y * g.w + e] === c) e++;
      if (c !== '.') { ctx.fillStyle = PIX[c]!; ctx.fillRect(x, y, e - x, 1); }
      x = e;
    }
  }
  return { img, w: g.w, h: g.h, ax: g.ax, ay: g.ay };
}

/** 이름으로 캐시하는 굽기 */
export class SpriteCache {
  private m = new Map<string, Baked>();
  get(key: string, make: () => Grid): Baked {
    let b = this.m.get(key);
    if (!b) { b = bake(make()); this.m.set(key, b); }
    return b;
  }
  /** 단계가 바뀌면 그 단계 전용(크기가 다른 행성 등)만 버린다 */
  dropPrefix(prefix: string): void {
    for (const k of this.m.keys()) if (k.startsWith(prefix)) this.m.delete(k);
  }
  get size(): number { return this.m.size; }
}

/** 중심이 (x, y) 에 오도록 찍는다. 좌표는 정수로 맞춘다 — 픽셀이 반 칸씩 번지지 않게 */
export function put(ctx: CanvasRenderingContext2D, b: Baked, x: number, y: number): void {
  ctx.drawImage(b.img as CanvasImageSource, Math.round(x - b.ax), Math.round(y - b.ay));
}

/** DOM 에 넣을 그림(소개 카드·결과 시트의 아이콘). CSS 로 키운다 */
export function toDataUrl(g: Grid): string {
  const c = document.createElement('canvas');
  c.width = g.w; c.height = g.h;
  const b = bake(g);
  c.getContext('2d')!.drawImage(b.img as CanvasImageSource, 0, 0);
  return c.toDataURL();
}
