// 픽셀 격자. 1 아트 픽셀 = 1 월드 유닛 — 판정 반경과 그림 크기가 그대로 맞는다.
//
// 디자인 시안(Claude Design "달토끼 당근 로켓", sprites.js)을 TypeScript 로 옮겼다.
// 연산을 바꾸지 않았다 — tests/sprites.test.ts 가 시안의 아틀라스와 픽셀 단위로 맞춰 본다.
//
// 격자 칸에는 색이 아니라 **한 글자 키**가 들어간다. 키 → 색은 palette.ts 의 PIX 다(§12.6).

/** 한 글자 색 키. '.' 은 투명 */
export type Px = string;

export interface Grid {
  w: number;
  h: number;
  d: Px[];
  /** 중심점(회전·충돌 중심). 프레임 왼쪽 위 기준 */
  ax: number;
  ay: number;
}

export function grid(w: number, h: number): Grid {
  return { w, h, d: new Array<Px>(w * h).fill('.'), ax: 0, ay: 0 };
}

export function get(g: Grid, x: number, y: number): Px {
  return x < 0 || y < 0 || x >= g.w || y >= g.h ? '.' : g.d[y * g.w + x]!;
}

export function set(g: Grid, x: number, y: number, c: Px): void {
  if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.d[y * g.w + x] = c;
}

export function fromRows(rows: readonly string[]): Grid {
  const g = grid(rows[0]!.length, rows.length);
  rows.forEach((r, y) => [...r].forEach((c, x) => set(g, x, y, c)));
  return g;
}

export function fillCircle(g: Grid, cx: number, cy: number, r: number, c: Px): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) set(g, x, y, c);
    }
  }
}

/** 칠해진 칸에 붙은 빈 칸을 c 로 두른다 (1px 외곽선). */
export function outline(g: Grid, c: Px = 'K'): Grid {
  const src = g.d.slice();
  const at = (x: number, y: number): Px =>
    x < 0 || y < 0 || x >= g.w || y >= g.h ? '.' : src[y * g.w + x]!;
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (at(x, y) === '.'
        && (at(x - 1, y) !== '.' || at(x + 1, y) !== '.' || at(x, y - 1) !== '.' || at(x, y + 1) !== '.')) {
        set(g, x, y, c);
      }
    }
  }
  return g;
}

export function flipV(g: Grid): Grid {
  const o = grid(g.w, g.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) set(o, x, g.h - 1 - y, get(g, x, y));
  return o;
}

/** 최근접 회전. 출력은 정사각형이고 중심이 (ax, ay) 로 온다. */
export function rotate(g: Grid, a: number, ax: number, ay: number): Grid {
  const R = Math.ceil(Math.hypot(Math.max(ax, g.w - ax), Math.max(ay, g.h - ay))) + 1;
  const o = grid(R * 2, R * 2);
  o.ax = R; o.ay = R;
  const c = Math.cos(a), s = Math.sin(a);
  for (let y = 0; y < o.h; y++) {
    for (let x = 0; x < o.w; x++) {
      const dx = x + 0.5 - R, dy = y + 0.5 - R;
      const sx = Math.floor(ax + dx * c + dy * s), sy = Math.floor(ay - dx * s + dy * c);
      set(o, x, y, get(g, sx, sy));
    }
  }
  return o;
}

/** 시안의 시드 난수(파크–밀러). 장식 모양에만 쓴다 — 시뮬레이션과 무관하다(§5.8). */
export function rng(seed: number): () => number {
  return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
}
