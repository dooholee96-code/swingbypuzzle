// 그리기 기본 도형. docs/PLAN.md §12.1
//
// 좌표는 **월드 유닛**이다. 카메라 변환이 이미 걸려 있으므로 굵기도 유닛으로 준다.
// 발광은 선을 두 번 그려 만든다 — 굵고 옅은 선 위에 가는 원색 선.
// shadowBlur 는 웹뷰에서 무거워 쓰지 않는다 (§12.1, §15.3).

import { GLOW_ALPHA, GLOW_WIDTH, WIDTH } from './palette.js';

export interface DrawOpts { alpha?: number; glow?: boolean; close?: boolean }

/** 설정의 발광 효과가 "낮음"이면 바깥 선을 생략한다 (§13.6). */
export let glowEnabled = true;
export function setGlow(v: boolean): void { glowEnabled = v; }

/** 화면에서 최소 1 CSS px 이 되도록 한 굵기(유닛). */
function widthOf(scale: number, units: number): number {
  return Math.max(1 / Math.max(scale, 0.0001), units);
}

type Path = (c: CanvasRenderingContext2D) => void;

export function stroke(
  ctx: CanvasRenderingContext2D, scale: number, path: Path,
  color: string, o: DrawOpts = {},
): void {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0.002) return;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  if (o.glow !== false && glowEnabled) {
    ctx.globalAlpha = alpha * GLOW_ALPHA;
    ctx.lineWidth = widthOf(scale, GLOW_WIDTH);
    ctx.beginPath(); path(ctx); if (o.close) ctx.closePath(); ctx.stroke();
  }
  ctx.globalAlpha = alpha;
  ctx.lineWidth = widthOf(scale, WIDTH);
  ctx.beginPath(); path(ctx); if (o.close) ctx.closePath(); ctx.stroke();
  ctx.globalAlpha = 1;
}

export function polyline(pts: readonly (readonly [number, number])[]): Path {
  return (c) => {
    if (!pts.length) return;
    c.moveTo(pts[0]![0], pts[0]![1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i]![0], pts[i]![1]);
  };
}

export function line(a: readonly [number, number], b: readonly [number, number]): Path {
  return (c) => { c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); };
}

export function circle(x: number, y: number, r: number): Path {
  return (c) => c.arc(x, y, Math.max(r, 0.01), 0, Math.PI * 2);
}

export function arc(x: number, y: number, r: number, from: number, to: number): Path {
  return (c) => c.arc(x, y, Math.max(r, 0.01), from, to);
}

export function ngon(x: number, y: number, r: number, sides: number, rot = 0): Path {
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + Math.PI * 2 * i / sides;
    pts.push([x + r * Math.cos(a), y + r * Math.sin(a)]);
  }
  return polyline(pts);
}

/** 기울어진 타원 호. §12.3 의 행성 고리와 외계인 실루엣. */
export function ellipse(
  x: number, y: number, rx: number, ry: number, rot: number, from: number, to: number,
): Path {
  return (c) => c.ellipse(x, y, Math.max(rx, 0.01), Math.max(ry, 0.01), rot, from, to);
}

/** 점선 원. §12.3 의 중력 범위 (대시 4 · 간격 6 유닛). */
export function dashedCircle(
  ctx: CanvasRenderingContext2D, scale: number,
  x: number, y: number, r: number, color: string, alpha: number,
  dash = 4, gap = 6,
): void {
  ctx.setLineDash([dash, gap]);
  stroke(ctx, scale, circle(x, y, r), color, { alpha, glow: false });
  ctx.setLineDash([]);
}
