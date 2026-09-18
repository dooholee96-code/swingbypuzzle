// 미니맵. docs/PLAN.md §12.5, §10.4
//
// 맵이 뷰포트보다 큰 단계에서만 나타난다. v4.1 에서 빈 곳 드래그 화면 이동을
// 없앴으므로(§10.3) 큰 맵을 살펴보는 유일한 수단이다.

import { bodyPos, gravs } from '../core/physics.js';
import type { Level } from '../core/types.js';
import type { Camera } from '../game/camera.js';
import type { Session } from '../game/session.js';
import { C } from './palette.js';

export const MAX_W = 96, MAX_H = 150;    // CSS px (§12.5)
const TOP = 68, RIGHT = 14, BLINK_MS = 300;

export interface MiniRect { x: number; y: number; w: number; h: number; k: number }

/** 화면 우상단에 놓을 자리와 배율. 맵이 다 보이면 null. */
export function miniRect(L: Level, cam: Camera, cssW: number): MiniRect | null {
  if (cam.fits(L)) return null;
  const k = Math.min(MAX_W / L.w, MAX_H / L.h);
  const w = L.w * k, h = L.h * k;
  return { x: cssW - w - RIGHT, y: TOP, w, h, k };
}

/** 화면 좌표계(CSS px)에 그린다. 카메라 변환을 걸지 않은 상태에서 부른다. */
export function drawMinimap(
  ctx: CanvasRenderingContext2D, r: MiniRect, cam: Camera, s: Session,
): void {
  const L = s.level;
  const t = s.simTime();
  const P = (x: number, y: number): [number, number] => [r.x + x * r.k, r.y + y * r.k];
  const dot = (x: number, y: number, col: string, rad: number): void => {
    const [px, py] = P(x, y);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill();
  };

  ctx.fillStyle = 'rgba(0,0,0,.62)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = C.line;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  ctx.globalAlpha = 1;

  for (const a of L.rocks ?? []) dot(a.x, a.y, 'rgba(230,237,245,.35)', 1.2);

  for (const b of gravs(L)) {
    const [bx, by] = bodyPos(b, t);
    const col = 'rH' in b ? C.hole : C.gravity;
    const [px, py] = P(bx, by);
    ctx.strokeStyle = col; ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(px, py, b.R * r.k, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    dot(bx, by, col, 2);
  }
  for (const u of L.ufos ?? []) dot(u.x, u.y, C.danger, 2);
  dot(L.goal.x, L.goal.y, C.goal, 2.5);

  // 우주선은 흰 점. 비행 중에는 깜빡인다.
  const flying = s.state === 'flying';
  if (!flying || Math.floor(performance.now() / BLINK_MS) % 2 === 0) {
    const [sx, sy] = s.shipPos();
    dot(sx, sy, C.line, 2);
  }

  ctx.strokeStyle = C.line; ctx.globalAlpha = 0.8;
  ctx.strokeRect(r.x + cam.x * r.k, r.y + cam.y * r.k, cam.viewW * r.k, cam.viewH * r.k);
  ctx.globalAlpha = 1;
}
