// 당근 로켓(토끼 우주선)·비행접시·작은 효과. 시안 sprites.js 를 옮겼다.

import { type Grid, fillCircle, flipV, fromRows, grid, outline, rotate, set } from './pixel.js';

/** 표정. 상태와 결과로 고른다 (field.ts) */
export type Face = 'idle' | 'aim' | 'fly' | 'win' | 'bump' | 'sad' | 'sleep';
export const FACES: readonly Face[] = ['idle', 'aim', 'fly', 'win', 'bump', 'sad', 'sleep'];

const FACE_ROWS: Readonly<Record<Face, readonly string[]>> = {
  idle: ['.......', '.K...K.', 'P..p..P', '.......'],
  aim: ['KK...KK', '.K...K.', '...p...', '.......'],
  fly: ['.......', '.K...K.', 'P.....P', '..KKK..'],
  win: ['.K...K.', 'K.K.K.K', 'P.....P', '..KKK..'],
  bump: ['K.....K', '.K...K.', 'K.....K', '...K...'],
  sad: ['.......', '.K...K.', '.BKKKB.', 'K.....K'],
  sleep: ['.......', 'KK...KK', '...p...', '.......'],
};

export interface RocketOpt {
  /** 불꽃 프레임. -1 이면 없음 */
  flame?: number;
  /** 비행 중에는 귀를 뒤로 젖힌다 */
  ears?: 'up' | 'back';
}

/** 당근 로켓, 기수가 +x. 26×21, 회전 중심 (13, 10.5) */
export function rocket(face: Face = 'idle', opt: RocketOpt = {}): Grid {
  const { flame = -1, ears = 'up' } = opt;
  const g = grid(26, 21), X = 1, Y = 1, cy = 9;
  const P = (x: number, y: number, c: string): void => set(g, X + x, Y + y, c);
  // 몸통
  for (let x = 5; x <= 22; x++) {
    const h = x <= 11 ? 5 : Math.max(0, Math.round(5 - (x - 11) * 0.48));
    for (let y = cy - h; y <= cy + h; y++) {
      let c = 'O';
      if (y <= cy - h + 1 && x >= 6 && x <= 18) c = 'C';
      if (y >= cy + h - 1) c = 'o';
      if ((x === 15 || x === 18) && y > cy - h + 1 && y < cy + h - 1 && Math.abs(y - cy) <= 2 && y !== cy) c = 'o';
      P(x, y, c);
    }
  }
  // 잎
  for (let i = 0; i < 4; i++) {
    P(4 - i, cy - 2 - i, 'L'); P(5 - i, cy - 2 - i, 'l');
    P(4 - i, cy + 2 + i, 'L'); P(5 - i, cy + 2 + i, 'l');
  }
  P(4, cy - 1, 'l'); P(4, cy + 1, 'l'); P(3, cy, 'L'); P(4, cy, 'l');
  // 불꽃
  if (flame >= 0) {
    const f = flame % 2 === 0 ? ['..yY', 'yYWY', '..yY'] : ['.yyY', 'RYWY', '.yyY'];
    f.forEach((r, j) => [...r].forEach((c, i) => { if (c !== '.') P(i - 1, cy - 1 + j, c); }));
  }
  // 창
  fillCircle(g, X + 10.5, Y + cy + 0.5, 5.3, 'K');
  fillCircle(g, X + 10.5, Y + cy + 0.5, 4.3, 'B');
  P(8, cy - 3, 'W'); P(7, cy - 2, 'W');
  // 머리
  fillCircle(g, X + 10.5, Y + cy + 2.2, 3.6, 'W');
  // 귀 (창 밖으로)
  const ear = (x0: number, inner: boolean): void => {
    for (let y = 0; y <= cy - 2; y++) {
      const lean = ears === 'back' && y < 3 ? -(3 - y) : 0;
      P(x0 + lean, y + 1, inner ? 'W' : 'P'); P(x0 + 1 + lean, y + 1, inner ? 'P' : 'W');
    }
  };
  ear(8, true); ear(11, false);
  outline(g);
  // 얼굴
  FACE_ROWS[face].forEach((r, j) => [...r].forEach((c, i) => { if (c !== '.') P(7 + i, cy + j, c); }));
  g.ax = X + 12; g.ay = Y + cy + 0.5;
  return g;
}

/** 방향 a(라디안)로 돌린 로켓. 기수가 왼쪽이면 위아래를 뒤집어 조종석이 늘 위에 오게 한다. */
export function rocketDir(face: Face, a: number, opt: RocketOpt = {}): Grid {
  let g = rocket(face, opt);
  if (Math.cos(a) < -1e-6) {
    const ay = g.ay;
    g = Object.assign(flipV(g), { ax: g.ax, ay: g.h - ay });
  }
  return rotate(g, a, g.ax, g.ay);
}

/** 16방향 중 가장 가까운 칸의 각도 */
export function dir16(a: number): number {
  return Math.round(a / (Math.PI / 8)) * (Math.PI / 8);
}

// ── 작은 스프라이트 ──
export const SMALL = {
  bullet: ['.rr.', 'rYYr', 'rYYr', '.rr.'],
  star1: ['W'],
  star2: ['.Y.', 'YWY', '.Y.'],
  sparkle0: ['..Y..', '..Y..', 'YYWYY', '..Y..', '..Y..'],
  sparkle1: ['.....', '..Y..', '.YWY.', '..Y..', '.....'],
  dizzy: ['..K..', '.KYK.', 'KYYYK', '.KYK.', 'K.K.K'],
  dust0: ['.WW.', 'WwwW', 'WwwW', '.WW.'],
  dust1: ['.W..W.', 'W.ww.W', '.w..w.', 'W.ww.W', '.W..W.'],
  dot: ['YY', 'YY'],
  trail: ['W'],
  xmark: ['R...R', '.R.R.', '..R..', '.R.R.', 'R...R'],
  zz: ['KKK.', '..K.', '.K..', 'KKK.'],
} as const;
export type SmallName = keyof typeof SMALL;

/** 작은 스프라이트. 중심은 가운데 */
export function small(n: SmallName): Grid {
  const g = fromRows(SMALL[n]);
  g.ax = g.w / 2; g.ay = g.h / 2;
  return g;
}

/** 외계인 비행접시 28×15. 판정 반경 13 과 폭이 맞는다 */
export function ufo(frame = 0): Grid {
  const g = grid(28, 15), cx = 14, cy = 9;
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const dx = (x + 0.5 - cx) / 6.2, dy = (y + 0.5 - (cy - 1.5)) / 5.6;
      if (dx * dx + dy * dy <= 1 && y < cy) set(g, x, y, 'B');
    }
  }
  fillCircle(g, cx, cy - 3, 2.6, 'm'); set(g, cx - 2, cy - 4, 'K'); set(g, cx + 1, cy - 4, 'K');
  set(g, cx - 4, cy - 6, 'W'); set(g, cx - 5, cy - 5, 'W');
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const dx = (x + 0.5 - cx) / 12.8, dy = (y + 0.5 - cy) / 3.4;
      if (dx * dx + dy * dy <= 1) set(g, x, y, y >= cy ? 'r' : 'R');
    }
  }
  for (let i = 0; i < 6; i++) set(g, 4 + i * 4, cy, (i + frame) % 2 ? 'Y' : 'W');
  outline(g);
  g.ax = cx; g.ay = cy;
  return g;
}
