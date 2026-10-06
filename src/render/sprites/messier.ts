// 메시에 천체 그림 (§22.7). 사진을 쓰지 않는다 — 종류마다 틀 하나 + 번호가 시드인 생성기.
// 팔레트 키만 쓴다(§12.6). 필드는 20, 도감은 32 로 굽는다.

import type { MessierType } from '../../tools-shared/messier.js';
import { type Grid, fillCircle, grid, rng, set } from './pixel.js';

/** 틀에 쓰는 색 묶음 */
const STAR = ['W', 'Y', 'C'] as const;

function dot(g: Grid, x: number, y: number, c: string, big = false): void {
  set(g, x, y, c);
  if (big) { set(g, x + 1, y, c); set(g, x, y + 1, c); set(g, x + 1, y + 1, c); }
}

/** 구상 성단: 가운데로 갈수록 빽빽한 점. 가운데 흰색, 바깥 노랑·크림 */
function globular(g: Grid, r: number, rnd: () => number): void {
  const cx = g.ax, cy = g.ay;
  const n = Math.round(r * r * 2.2);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = Math.pow(rnd(), 1.6) * r;
    const x = Math.floor(cx + Math.cos(a) * d), y = Math.floor(cy + Math.sin(a) * d);
    set(g, x, y, d < r * 0.3 ? 'W' : d < r * 0.65 ? 'Y' : 'C');
  }
  fillCircle(g, cx, cy, Math.max(1.2, r * 0.18), 'W');
}

/** 산개 성단: 성긴 별 몇 개, 밝은 것은 2×2 */
function open(g: Grid, r: number, rnd: () => number): void {
  const cx = g.ax, cy = g.ay;
  const n = 9 + Math.floor(rnd() * 6);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r;
    const x = Math.floor(cx + Math.cos(a) * d), y = Math.floor(cy + Math.sin(a) * d);
    const big = rnd() < 0.3;
    dot(g, x, y, big ? 'W' : rnd() < 0.5 ? 'B' : STAR[Math.floor(rnd() * 3)]!, big);
  }
}

/** 성운: 겹친 원을 디더로 — 발광은 분홍, 반사는 하늘색. 안에 별 셋 */
function nebula(g: Grid, r: number, rnd: () => number, pal: readonly [string, string, string]): void {
  const cx = g.ax, cy = g.ay;
  const blobs = Array.from({ length: 5 }, () => ({
    x: cx + (rnd() - 0.5) * r * 1.1, y: cy + (rnd() - 0.5) * r * 1.1, r: r * (0.35 + rnd() * 0.4),
  }));
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      let v = 0;
      for (const b of blobs) {
        const d = Math.hypot(x + 0.5 - b.x, y + 0.5 - b.y) / b.r;
        if (d < 1) v += 1 - d;
      }
      if (v <= 0.12) continue;
      const chk = (x + y) & 1;
      const c = v > 0.9 ? pal[0] : v > 0.5 ? (chk ? pal[0] : pal[1]) : v > 0.3 ? pal[1] : (chk ? pal[1] : pal[2]);
      if (v > 0.3 || chk) set(g, x, y, c);
    }
  }
  for (let i = 0; i < 3; i++) {
    const b = blobs[i]!;
    dot(g, Math.floor(b.x), Math.floor(b.y), 'W', i === 0);
  }
}

/** 행성상 성운: 고리 + 가운데 별 */
function planetary(g: Grid, r: number, rnd: () => number): void {
  const cx = g.ax, cy = g.ay;
  const rx = r * 0.9, ry = r * (0.7 + rnd() * 0.25);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
      const chk = (x + y) & 1;
      if (d > 0.55 && d <= 1) set(g, x, y, d > 0.85 ? (chk ? 'M' : 'm') : 'M');
      else if (d <= 0.55 && chk) set(g, x, y, 'b');
    }
  }
  dot(g, Math.floor(cx) - 1, Math.floor(cy) - 1, 'W', true);
}

/** 초신성 잔해: 가운데서 뻗는 꼬인 실 + 가운데 펄서 */
function remnant(g: Grid, r: number, rnd: () => number): void {
  const cx = g.ax, cy = g.ay;
  for (let k = 0; k < 9; k++) {
    let a = rnd() * Math.PI * 2, x = cx, y = cy;
    const len = r * (0.6 + rnd() * 0.4);
    for (let s = 0; s < len; s++) {
      a += (rnd() - 0.5) * 0.9;
      x += Math.cos(a); y += Math.sin(a);
      set(g, Math.floor(x), Math.floor(y), s < len * 0.4 ? 'Y' : s < len * 0.75 ? 'O' : 'R');
    }
  }
  dot(g, Math.floor(cx) - 1, Math.floor(cy) - 1, 'W', true);
}

/** 나선 은하: 두 팔. 기울여 본다 */
function spiral(g: Grid, r: number, rnd: () => number): void {
  const cx = g.ax, cy = g.ay;
  const tilt = 0.55 + rnd() * 0.4, rot = rnd() * Math.PI;
  const turns = 2.2 + rnd() * 0.8;
  for (let arm = 0; arm < 2; arm++) {
    for (let t = 0; t < 1; t += 0.012) {
      const a = t * turns + arm * Math.PI + rot, d = r * (0.12 + 0.88 * t);
      const px = Math.cos(a) * d, py = Math.sin(a) * d * tilt;
      const x = Math.floor(cx + px), y = Math.floor(cy + py);
      const c = t < 0.35 ? 'W' : rnd() < 0.25 ? 'W' : 'B';
      set(g, x, y, c);
      if (rnd() < 0.5) set(g, x + (rnd() < 0.5 ? 1 : -1), y, t > 0.6 ? 'b' : 'B');
    }
  }
  fillCircle(g, cx, cy, Math.max(1.5, r * 0.22), 'Y');
  fillCircle(g, cx, cy, Math.max(1, r * 0.1), 'W');
}

/** 타원 은하: 가운데가 밝은 타원. 바깥은 디더 */
function elliptical(g: Grid, r: number, rnd: () => number): void {
  const cx = g.ax, cy = g.ay;
  const e = 0.55 + rnd() * 0.4, rot = rnd() * Math.PI;
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const u = (dx * c + dy * s) / r, v = (-dx * s + dy * c) / (r * e);
      const d = Math.sqrt(u * u + v * v);
      const chk = (x + y) & 1;
      if (d < 0.25) set(g, x, y, 'W');
      else if (d < 0.5) set(g, x, y, chk ? 'W' : 'C');
      else if (d < 0.75) set(g, x, y, 'C');
      else if (d < 1 && chk) set(g, x, y, 'c');
    }
  }
}

/** 렌즈형 은하: 옆에서 본 얇은 원반 + 중심 부풀음 + 어두운 띠 */
function lenticular(g: Grid, r: number, rnd: () => number): void {
  const cx = g.ax, cy = g.ay;
  const rot = (rnd() - 0.5) * 0.9;
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const u = (dx * c + dy * s) / r, v = (-dx * s + dy * c) / (r * 0.28);
      const d = Math.sqrt(u * u + v * v);
      if (d > 1) continue;
      const bulge = Math.sqrt(u * u + v * v * 0.35);
      if (Math.abs(v) < 0.18 && Math.abs(u) > 0.2) set(g, x, y, 'u');          // 먼지 띠
      else set(g, x, y, bulge < 0.3 ? 'W' : d < 0.7 ? 'C' : ((x + y) & 1 ? 'c' : 'C'));
    }
  }
}

/** 불규칙 은하: 덩어리 몇 개와 붉은 별 생성 지역 */
function irregular(g: Grid, r: number, rnd: () => number): void {
  const cx = g.ax, cy = g.ay;
  for (let k = 0; k < 6; k++) {
    const bx = cx + (rnd() - 0.5) * r * 1.4, by = cy + (rnd() - 0.5) * r * 1.0, br = r * (0.25 + rnd() * 0.3);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by) / br;
      if (d < 1 && (d < 0.6 || (x + y) & 1)) set(g, x, y, d < 0.4 ? 'W' : 'B');
    }
  }
  for (let i = 0; i < 4; i++) dot(g, Math.floor(cx + (rnd() - 0.5) * r), Math.floor(cy + (rnd() - 0.5) * r * 0.8), 'R');
}

/** 이중성·성군·별구름 */
function stars(g: Grid, r: number, rnd: () => number, n: number, big: boolean): void {
  const cx = g.ax, cy = g.ay;
  for (let i = 0; i < n; i++) {
    const x = Math.floor(cx + (rnd() - 0.5) * r * 1.6), y = Math.floor(cy + (rnd() - 0.5) * r * 1.6);
    dot(g, x, y, i === 0 ? 'W' : STAR[i % 3]!, big && i < 2);
  }
}

/**
 * 번호 n 의 그림. size 는 한 변(픽셀). 중심이 가운데.
 * 모양은 번호만으로 정해진다 — 같은 천체는 어디서나 같은 모양이다.
 */
export function messierArt(n: number, type: MessierType, size = 20): Grid {
  const g = grid(size, size);
  g.ax = size / 2; g.ay = size / 2;
  const rnd = rng(n * 7919 + 13);
  const r = size / 2 - 1;
  switch (type) {
    case 'gc': globular(g, r, rnd); break;
    case 'oc': open(g, r, rnd); break;
    case 'neb': nebula(g, r, rnd, ['P', 'p', 'X']); break;
    case 'rneb': nebula(g, r, rnd, ['B', 'b', 'U']); break;
    case 'pn': planetary(g, r, rnd); break;
    case 'snr': remnant(g, r, rnd); break;
    case 'sg': spiral(g, r, rnd); break;
    case 'eg': elliptical(g, r, rnd); break;
    case 'lg': lenticular(g, r, rnd); break;
    case 'ig': irregular(g, r, rnd); break;
    case 'dbl': stars(g, r, rnd, 2, true); break;
    case 'ast': stars(g, r, rnd, 5, true); break;
    case 'sc': globular(g, r * 1.1, rnd); break;
  }
  return g;
}
