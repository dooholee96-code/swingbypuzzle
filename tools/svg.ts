// 궤적 썸네일 SVG. docs/PLAN.md §8.4 8단계, §16.2
//
// 렌더링 없이 문자열로 직접 쓴다. 후보를 목록에서 눈으로 훑는 용도다.

import { PAD_R } from '../src/core/constants.js';
import { C } from '../src/render/palette.js';
import type { Level } from '../src/core/types.js';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function svgOf(L: Level, solutionPath: number[]): string {
  const o: string[] = [];
  const circle = (x: number, y: number, r: number, stroke: string, dash = ''): void => {
    o.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${stroke}"`
      + ` stroke-width="2"${dash ? ` stroke-dasharray="${dash}"` : ''} opacity="0.9"/>`);
  };

  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.w} ${L.h}"`
    + ` width="${Math.round(L.w / 2)}" height="${Math.round(L.h / 2)}">`);
  o.push(`<rect width="${L.w}" height="${L.h}" fill="${C.bg}"/>`);

  for (const a of L.rocks ?? []) circle(a.x, a.y, a.r, C.line);
  for (const h of L.holes ?? []) {
    circle(h.x, h.y, h.R, C.hole, '6 8');
    circle(h.x, h.y, h.rH, C.hole);
  }
  for (const p of L.planets ?? []) {
    const cx = p.orbit ? p.orbit.cx : p.x, cy = p.orbit ? p.orbit.cy : p.y;
    if (p.orbit) circle(p.orbit.cx, p.orbit.cy, p.orbit.rad, C.gravity, '3 10');
    circle(cx, cy, p.R, C.gravity, '6 8');
    circle(cx, cy, p.r, C.line);
  }
  for (const u of L.ufos ?? []) {
    circle(u.x, u.y, u.range, C.danger, '6 8');
    circle(u.x, u.y, 13, C.danger);
  }
  circle(L.goal.x, L.goal.y, L.goal.r, C.goal);
  circle(L.start.x, L.start.y, PAD_R, C.line);

  if (solutionPath.length >= 4) {
    const pts: string[] = [];
    for (let i = 0; i < solutionPath.length; i += 2) {
      pts.push(`${solutionPath[i]!.toFixed(1)},${solutionPath[i + 1]!.toFixed(1)}`);
    }
    o.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${C.goal}"`
      + ' stroke-width="3" opacity="0.95"/>');
  }

  const m = L.meta.metrics;
  if (m) {
    o.push(`<text x="10" y="${L.h - 12}" fill="${C.line}" font-size="20" opacity="0.75">`
      + esc(`${L.id} 폭 ${m.main_window}° · 난이도 ${m.difficulty}`) + '</text>');
  }
  o.push('</svg>');
  return o.join('\n');
}
