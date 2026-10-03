// 카메라와 뷰포트. docs/PLAN.md §11
//
// 배율은 400×760 을 기준으로 잡는다. 폰에서는 **맵 폭을 화면 폭에 맞춘다** — 맵 전체를
// 한 화면에 넣으면 브라우저 주소창이 세로를 먹어 맵이 화면 폭의 80% 아래로 줄었다.
// HUD 는 맵 위에 겹치고, 대신 위(HUD)·아래(각도 판) 가림 띠를 비켜 볼 수 있게
// 그만큼 더 스크롤된다. 맵이 뷰포트보다 작은 축은 가림 띠 사이 가운데에 둔다.

import { PAD_R, REF_H, REF_W } from '../core/constants.js';
import type { Level } from '../core/types.js';

export { REF_H, REF_W };
export const FOLLOW_SPEED = 6;    // §11 추적 감쇠
export const LOOK_AHEAD = 0.35;   // 속도 × 이 값만큼 앞을 본다
/** 맵 전체가 가림 띠 사이에 이 배율 이상으로 들어가면 전체를 보여 준다(태블릿·데스크톱) */
export const FULL_VIEW_MIN_SCALE = 0.85;
/** 폭에 맞출 때도 세로로 이만큼(유닛)은 보인다 — 가로 화면에서 지나치게 확대되지 않게 */
export const MIN_VIEW_H = 640;
/** 시작 화면에 함께 담는 발사대 둘레(유닛). 서 있는 로켓 끝까지 */
const PAD_FRAME = PAD_R + 30;

export class Camera {
  x = 0;
  y = 0;
  scale = 1;
  viewW = REF_W;
  viewH = REF_H;
  /** 위·아래 가림 띠(월드 유닛). HUD 와 각도 판 몫 */
  top = 0;
  bottom = 0;

  /** insetTop·insetBottom 은 CSS px — HUD 아래 끝, 각도 판 위 끝까지의 거리 */
  layout(cssW: number, cssH: number, insetTop = 0, insetBottom = 0): void {
    const clearH = Math.max(cssH - insetTop - insetBottom, 120);
    const full = Math.min(cssW / REF_W, clearH / REF_H);
    this.scale = full >= FULL_VIEW_MIN_SCALE
      ? full
      : Math.min(cssW / REF_W, cssH / MIN_VIEW_H);
    this.viewW = cssW / this.scale;
    this.viewH = cssH / this.scale;
    this.top = insetTop / this.scale;
    this.bottom = insetBottom / this.scale;
  }

  /** 가림 띠를 뺀 세로 길이 */
  get clearH(): number { return this.viewH - this.top - this.bottom; }

  /**
   * 가로: 맵이 뷰보다 작으면 가운데, 크면 [0, 맵 − 뷰].
   * 세로: 가림 띠만큼 맵 바깥으로 더 갈 수 있다 — 맵 맨 위·아래가 HUD 밑에 갇히지 않게.
   * 띠 사이에 맵이 다 들어가면 그 사이 가운데에 둔다 (§11).
   */
  clamp(L: Level): void {
    this.x = L.w <= this.viewW
      ? (L.w - this.viewW) / 2
      : Math.max(0, Math.min(L.w - this.viewW, this.x));
    const lo = -this.top, hi = L.h - this.viewH + this.bottom;
    this.y = lo >= hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, this.y));
  }

  /** 월드 점을 가림 띠 사이 가운데로 */
  centerOn(L: Level, wx: number, wy: number): void {
    this.x = wx - this.viewW / 2;
    this.y = wy - this.top - this.clearH / 2;
    this.clamp(L);
  }

  /**
   * 단계를 열 때(§11 `ready`). 들어가는 만큼 넓게 담는다 —
   * ① 단계의 물체 전부 ② 발사대와 목적지 ③ 발사대만. 조준할 때 목적지가 보여야 퍼즐이 읽힌다.
   */
  frameStart(L: Level): void {
    const { start: s, goal: g } = L;
    const all = contentBox(L);
    const pair: [number, number, number, number] = [
      Math.min(s.x - PAD_FRAME, g.x - g.r), Math.min(s.y - PAD_FRAME, g.y - g.r),
      Math.max(s.x + PAD_FRAME, g.x + g.r), Math.max(s.y + PAD_FRAME, g.y + g.r),
    ];
    const ok = (b: number[], i: 0 | 1): boolean =>
      b[i + 2]! - b[i]! <= (i === 0 ? this.viewW : this.clearH);
    // 둘 다 안 들어가면 발사대를 목적지 반대쪽 가장자리에 붙여 목적지 쪽을 최대한 보인다
    const span = (i: 0 | 1): number => (i === 0 ? this.viewW : this.clearH);
    const toward = (i: 0 | 1): number => {
      const [sp, gp] = i === 0 ? [s.x, g.x] : [s.y, g.y];
      const half = span(i) / 2;
      return gp < sp ? sp + PAD_FRAME - half : sp - PAD_FRAME + half;
    };
    const pick = (i: 0 | 1): number =>
      ok(all, i) ? (all[i] + all[i + 2]!) / 2 : ok(pair, i) ? (pair[i] + pair[i + 2]!) / 2 : toward(i);
    this.centerOn(L, pick(0), pick(1));
  }

  /** 비행 중 추적. 목표점은 우주선 위치 + 속도 × LOOK_AHEAD (§11). */
  follow(L: Level, sx: number, sy: number, vx: number, vy: number, dt: number): void {
    const tx = sx + vx * LOOK_AHEAD - this.viewW / 2;
    const ty = sy + vy * LOOK_AHEAD - this.top - this.clearH / 2;
    const k = 1 - Math.exp(-FOLLOW_SPEED * dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.clamp(L);
  }

  /** 월드 사각형이 지금 가림 띠 사이에 다 보이는가 */
  sees(x0: number, y0: number, x1: number, y1: number): boolean {
    return x0 >= this.x && x1 <= this.x + this.viewW
      && y0 >= this.y + this.top && y1 <= this.y + this.viewH - this.bottom;
  }

  /** 맵 전체가 가림 띠 사이에 들어오는가. 미니맵 표시 여부를 정한다 (§12.5). */
  fits(L: Level): boolean {
    return this.viewW >= L.w - 0.5 && this.clearH >= L.h - 0.5;
  }

  /**
   * 단계의 물체(발사대·목적지·천체·소행성·외계인)가 가림 띠 사이에 한꺼번에 들어갈 수 있는가.
   * 들어가면 빈 가장자리만 가려진 것이라 미니맵을 띄우지 않는다 (§12.5).
   */
  contentFits(L: Level): boolean {
    const b = contentBox(L);
    return b[2] - b[0] <= this.viewW + 0.5 && b[3] - b[1] <= this.clearH + 0.5;
  }

  toScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x) * this.scale, (wy - this.y) * this.scale];
  }
}

/** 단계 물체를 감싸는 상자 [x0, y0, x1, y1]. 중력 범위는 넣지 않는다 */
const boxes = new WeakMap<Level, [number, number, number, number]>();
export function contentBox(L: Level): [number, number, number, number] {
  const hit = boxes.get(L);
  if (hit) return hit;
  const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (x: number, y: number, r: number): void => {
    b[0] = Math.min(b[0], x - r); b[1] = Math.min(b[1], y - r);
    b[2] = Math.max(b[2], x + r); b[3] = Math.max(b[3], y + r);
  };
  add(L.start.x, L.start.y, PAD_FRAME);
  add(L.goal.x, L.goal.y, L.goal.r);
  for (const p of L.planets ?? []) {
    if (p.orbit) add(p.orbit.cx, p.orbit.cy, p.orbit.rad + p.r);
    else add(p.x, p.y, p.r);
  }
  for (const h of L.holes ?? []) add(h.x, h.y, h.rH + 8);
  for (const r of L.rocks ?? []) add(r.x, r.y, r.r);
  for (const u of L.ufos ?? []) add(u.x, u.y, 14);
  for (const d of L.docks ?? []) add(d.x, d.y, d.cr);
  boxes.set(L, b);
  return b;
}
