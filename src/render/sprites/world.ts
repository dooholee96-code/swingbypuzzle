// 천체 스프라이트 — 반경(유닛)을 받아 그 크기로 찍는다. 시안 sprites-world.js 를 옮겼다.

import { type Grid, fillCircle, get, grid, outline, rng, rotate, set } from './pixel.js';

/** 행성 색 묶음 [밝은 곳, 바탕, 그림자]. 딸기·민트·레몬·하늘·복숭아·라벤더 */
export const PLANET_SETS: readonly (readonly [string, string, string])[] = [
  ['P', 'p', 'X'], ['M', 'm', 'l'], ['Y', 'y', 'T'], ['B', 'b', 'U'], ['c', 'R', 'r'], ['V', 'x', 'X'],
];

export function sphere(g: Grid, cx: number, cy: number, r: number, [hi, base, sh]: readonly [string, string, string]): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r * r) continue;
      const lit = (dx + dy) / (r * 1.414), hd = Math.hypot(dx + r * 0.4, dy + r * 0.4) / r, chk = (x + y) & 1;
      let c = base;
      if (lit > 0.45 || (lit > 0.3 && chk)) c = sh;
      if (hd < 0.2 || (hd < 0.28 && chk)) c = hi;
      set(g, x, y, c);
    }
  }
}

function box(r: number, pad = 2): Grid {
  const n = Math.ceil(r) * 2 + pad * 2;
  const g = grid(n, n);
  g.ax = n / 2; g.ay = n / 2;
  return g;
}

export interface PlanetOpt { ring?: boolean; face?: boolean }

/** 행성. kind 는 색 묶음(레벨의 sides % 6). 반경 r 이 그대로 판정 반경이다 */
export function planet(r: number, kind = 0, opt: PlanetOpt = {}): Grid {
  const g = box(r, opt.ring ? Math.ceil(r * 0.5) + 2 : 2), cx = g.ax, cy = g.ay;
  const pal = PLANET_SETS[kind % PLANET_SETS.length]!;
  sphere(g, cx, cy, r, pal);
  if (r >= 10) {
    for (let i = 0; i < 3; i++) {             // 줄무늬
      const yy = Math.round(cy - r * 0.5 + i * r * 0.45);
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if ((x + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2 < r * r * 0.8 && ((x + i) % 5) < 3) set(g, x, yy, pal[2]);
      }
    }
  }
  if (opt.ring) {
    for (let x = 0; x < g.w; x++) {
      for (let y = 0; y < g.h; y++) {
        const dx = (x + 0.5 - cx) / (r * 1.5), dy = (y + 0.5 - cy) / (r * 0.34);
        const d = dx * dx + dy * dy;
        const front = y + 0.5 > cy || (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r;
        if (d <= 1 && d >= 0.55 && front) set(g, x, y, d > 0.8 ? 'C' : 'W');
      }
    }
  }
  outline(g);
  if (opt.face !== false && r >= 6) {         // 표정
    const e = Math.max(1, Math.round(r * 0.12)), ey = Math.round(cy), ex = Math.round(r * 0.32);
    for (let i = 0; i < e; i++) {
      for (let j = 0; j < e + 1; j++) {
        set(g, Math.round(cx - ex) + i - 1, ey - j, 'K'); set(g, Math.round(cx + ex) + i - 1, ey - j, 'K');
      }
    }
    set(g, Math.round(cx - ex) - 3, ey + 2, 'P'); set(g, Math.round(cx + ex) + 2, ey + 2, 'P');
    set(g, Math.round(cx) - 1, ey + 2, 'K'); set(g, Math.round(cx), ey + 3, 'K'); set(g, Math.round(cx) + 1, ey + 2, 'K');
  }
  return g;
}

/** 출발지 달: 크림색 구 + 크레이터 + 작은 깃발 */
export function moon(r = 14): Grid {
  const g = box(r, 4), cx = g.ax, cy = g.ay;
  sphere(g, cx, cy, r, ['W', 'C', 'S']);
  const rand = rng(7);
  for (let i = 0; i < 6; i++) {
    const a = rand() * 6.28, d = rand() * r * 0.65, cr = 1 + rand() * r * 0.16;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    fillCircle(g, x, y, cr, 'S'); fillCircle(g, x - 0.6, y - 0.6, Math.max(0.6, cr - 1), 'c');
  }
  outline(g);
  const fx = Math.round(cx + r * 0.2), fy = Math.round(cy - r) - 1;   // 깃발
  for (let y = 0; y < 5; y++) set(g, fx, fy - y, 'K');
  ['PPP', 'PW.', 'P..'].forEach((row, j) => [...row].forEach((c, i) => {
    if (c !== '.') set(g, fx + 1 + i, fy - 4 + j, c);
  }));
  return g;
}

/** 소행성: 울퉁불퉁한 돌 */
export function asteroid(r: number, seed = 1): Grid {
  const g = box(r, 2), cx = g.ax, cy = g.ay, rand = rng(seed * 31 + 5), n = 9, rad: number[] = [];
  for (let i = 0; i < n; i++) rad.push(r * (0.78 + rand() * 0.22));
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, a = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
      const t = a / (Math.PI * 2) * n, i = Math.floor(t), f = t - i;
      const rr = rad[i]! * (1 - f) + rad[(i + 1) % n]! * f;
      if (dx * dx + dy * dy <= rr * rr) {
        const lit = (dx + dy) / (r * 1.414);
        set(g, x, y, lit > 0.35 || (lit > 0.2 && (x + y) & 1) ? 't' : lit < -0.4 ? 'c' : 'T');
      }
    }
  }
  for (let i = 0; i < Math.max(1, Math.round(r / 4)); i++) {
    const x = cx + (rand() - 0.5) * r, y = cy + (rand() - 0.5) * r;
    set(g, Math.round(x), Math.round(y), 't'); set(g, Math.round(x) + 1, Math.round(y), 't');
  }
  outline(g);
  return g;
}

/** 블랙홀: 남색 소용돌이. 검은 핵은 반경 0.6r, 짙은 띠는 0.75r 까지 */
export function blackhole(r: number, frame = 0): Grid {
  const g = box(r * 1.6, 1), cx = g.ax, cy = g.ay, R = r * 1.6;
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
      if (d > R) continue;
      const a = Math.atan2(dy, dx) + d * 0.35 - frame * 0.8;
      const arm = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2) < 0.7;
      if (d <= r * 0.6) set(g, x, y, 'K');
      else if (d <= r * 0.75) set(g, x, y, 'u');
      else if (arm) set(g, x, y, d < r * 1.1 ? 'v' : d < r * 1.35 ? 'U' : ((x + y) & 1 ? 'u' : '.'));
    }
  }
  return g;
}

/** 목적지: 토끼굴 포털. 반경 r 전체가 도착 판정이다 */
export function portal(r = 10, frame = 0): Grid {
  const g = box(r, 4), cx = g.ax, cy = g.ay;
  fillCircle(g, cx, cy, r, 'l');
  fillCircle(g, cx, cy, r - 1, 'L');
  fillCircle(g, cx, cy, r * 0.72, 't');
  fillCircle(g, cx, cy, r * 0.58, 'K');
  for (let i = 0; i < 12; i++) {              // 풀잎 테두리
    const a = i / 12 * Math.PI * 2 + (i & 1) * 0.2;
    set(g, Math.round(cx + Math.cos(a) * (r + 1)), Math.round(cy + Math.sin(a) * (r + 1)), i & 1 ? 'L' : 'l');
  }
  const sp = [[-0.25, -0.2], [0.2, 0.1], [-0.05, 0.3], [0.28, -0.28]] as const;
  sp.forEach(([sx, sy], i) => {
    if ((i + frame) % 2) return;
    const x = Math.round(cx + sx * r), y = Math.round(cy + sy * r);
    set(g, x, y, 'W'); set(g, x - 1, y, 'Y'); set(g, x + 1, y, 'Y'); set(g, x, y - 1, 'Y'); set(g, x, y + 1, 'Y');
  });
  outline(g);
  return g;
}

/** 배경 별 타일 (반복해서 깐다). 시안은 64×64 에 26개 — 넓게 깔면 그 밀도를 유지한다 */
export function starTile(seed = 3, w = 64, h = 64, count = Math.round(26 * w * h / (64 * 64))): Grid {
  const g = grid(w, h), rand = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rand() * w), y = Math.floor(rand() * h), k = rand();
    if (k < 0.7) set(g, x, y, k < 0.35 ? 'S' : 'V');
    else if (k < 0.92) set(g, x, y, 'W');
    else { set(g, x, y, 'W'); set(g, x - 1, y, 'Y'); set(g, x + 1, y, 'Y'); set(g, x, y - 1, 'Y'); set(g, x, y + 1, 'Y'); }
  }
  return g;
}

/** 회전하는 소행성(16프레임) */
export function rock(r: number, seed = 1, frame = 0): Grid {
  const g = asteroid(r, seed);
  return frame ? rotate(g, frame * Math.PI / 8, g.ax, g.ay) : g;
}

/**
 * 궤도 행성의 포획 링 (§22.4). 2px 점선에 검은 테두리 — 1px 초록 점선은 파란 하늘에서
 * 거의 안 보였다. 시안에 없는 그림이라 같은 팔레트로 새로 그렸다.
 */
export function dockRing(R: number, key = 'L', on = 5, off = 4): Grid {
  const n = Math.ceil(R) * 2 + 7;
  const g = grid(n, n);
  g.ax = n / 2; g.ay = n / 2;
  const steps = Math.floor(2 * Math.PI * R);
  for (let i = 0; i < steps; i++) {
    if (i % (on + off) >= on) continue;
    const a = i / R, c = Math.cos(a), sn = Math.sin(a);
    for (const rr of [R, R - 1]) set(g, Math.floor(g.ax + c * rr), Math.floor(g.ay + sn * rr), key);
  }
  return outline(g);
}

/** 소개 카드의 궤도 행성 그림: 행성 + 포획 링 */
export function dockArt(r = 14, kind = 4): Grid {
  const ring = dockRing(r + 9);
  const body = planet(r, kind, { face: true });
  const ox = Math.round(ring.ax - body.ax), oy = Math.round(ring.ay - body.ay);
  for (let y = 0; y < body.h; y++) {
    for (let x = 0; x < body.w; x++) {
      const c = get(body, x, y);
      if (c) set(ring, x + ox, y + oy, c);
    }
  }
  return ring;
}

/**
 * 보스 모선 (§22.6). 100×44, 중심 (50, 28). 몸통 타원이 판정(BOSS_RX 48 × BOSS_RY 18)과 맞는다.
 * 작은 비행접시(rocket.ts ufo)와 같은 빨강 계열에 큰 돔과 외계인 둘. flash 면 맞은 순간의 흰색.
 */
export function mothership(frame = 0, flash = false): Grid {
  const g = grid(100, 44), cx = 50, cy = 28;
  // 돔(조종석)
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const dx = (x + 0.5 - cx) / 20, dy = (y + 0.5 - (cy - 6)) / 16;
      if (dx * dx + dy * dy <= 1 && y < cy - 2) set(g, x, y, 'B');
    }
  }
  for (const ex of [cx - 8, cx + 8]) {
    fillCircle(g, ex, cy - 11, 3.4, 'm');
    set(g, ex - 2, cy - 12, 'K'); set(g, ex + 1, cy - 12, 'K');
  }
  set(g, cx - 12, cy - 17, 'W'); set(g, cx - 13, cy - 16, 'W'); set(g, cx - 14, cy - 15, 'W');
  // 몸통 타원
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const dx = (x + 0.5 - cx) / 48, dy = (y + 0.5 - cy) / 13;
      if (dx * dx + dy * dy <= 1) set(g, x, y, y >= cy + 3 ? 'r' : y >= cy ? 'R' : 'R');
    }
  }
  // 아랫단 그림자와 포문 둘
  for (let x = 8; x < 92; x++) if ((x + cy) % 2 === 0) set(g, x, cy + 9, 'K');
  for (const px of [cx - 22, cx + 22]) {
    for (let y = cy + 8; y <= cy + 13; y++) for (let x = px - 3; x <= px + 3; x++) set(g, x, y, y > cy + 11 ? 'K' : 'g');
    set(g, px, cy + 12, (frame % 2) ? 'Y' : 'R');
  }
  // 테두리 불빛 12개
  for (let i = 0; i < 12; i++) {
    const a = Math.PI + Math.PI * (i + 0.5) / 12;
    const x = Math.round(cx + Math.cos(a) * 42), y = Math.round(cy + Math.sin(a) * 9 + 2);
    set(g, x, y, (i + frame) % 2 ? 'Y' : 'W');
    set(g, x + 1, y, (i + frame) % 2 ? 'Y' : 'W');
  }
  outline(g);
  if (flash) for (let i = 0; i < g.d.length; i++) if (g.d[i] !== '.' && g.d[i] !== 'K') g.d[i] = 'W';
  g.ax = cx; g.ay = cy;
  return g;
}
