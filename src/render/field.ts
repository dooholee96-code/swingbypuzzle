// 필드 그리기. docs/PLAN.md §12.2 의 순서를 따른다.
//
// 카메라 변환을 걸고 나면 좌표와 굵기가 모두 월드 유닛이다.

import { ARC, PAD_R } from '../core/constants.js';
import { padAngle } from '../core/angle.js';
import { bodyPos, gravs } from '../core/physics.js';
import { mulberry32 } from '../core/rng.js';
import type { Grav, Level } from '../core/types.js';
import type { Camera } from '../game/camera.js';
import type { Session } from '../game/session.js';
import { C } from './palette.js';
import { arc, circle, dashedCircle, ellipse, line, ngon, polyline, stroke } from './draw.js';

export const DOME_DRAW_R = 18;     // 그려지는 표면 반경. PAD_R(22) 보다 작다 (§12.3)
const BRACKET = 28, HATCH_STEP = 26, HATCH_LEN = 15;
const STAR_DENSITY = 0.2 / 1000, STAR_PARALLAX = 0.3, STAR_SPREAD = 1.4;

type Pt = [number, number];

export class FieldRenderer {
  reduceMotion = false;
  /** 방향 표시 힌트의 호 (§14.3). 월드각 [시작, 끝]. 없으면 null */
  directionArc: [number, number] | null = null;

  private levelId = '';
  private stars: number[] = [];          // x, y, 크기
  private rockShapes: Pt[][] = [];

  /** 장식은 시드 난수로 한 번만 만든다 (§5.8). */
  rebuild(L: Level): void {
    this.levelId = L.id;
    const r = mulberry32(hashId(L.id));
    const sw = L.w * STAR_SPREAD, sh = L.h * STAR_SPREAD;
    const ox = (sw - L.w) / 2, oy = (sh - L.h) / 2;
    this.stars = [];
    const n = Math.round(sw * sh * STAR_DENSITY);
    for (let i = 0; i < n; i++) {
      this.stars.push(r() * sw - ox, r() * sh - oy, 1 + r() * 0.5);
    }
    // §12.3 소행성: seed 로 만든 9~12꼭짓점, 반경 r×0.75~1.15
    this.rockShapes = (L.rocks ?? []).map((a) => {
      const rr = mulberry32(a.seed);
      const m = 9 + Math.floor(rr() * 4);
      const pts: Pt[] = [];
      for (let k = 0; k < m; k++) {
        const ang = Math.PI * 2 * k / m;
        const rad = a.r * (0.75 + rr() * 0.4);
        pts.push([Math.cos(ang) * rad, Math.sin(ang) * rad]);
      }
      return pts;
    });
  }

  draw(
    ctx: CanvasRenderingContext2D, cam: Camera, s: Session,
    t: number, preview: { points: number[]; outcome: string } | null,
  ): void {
    const L = s.level;
    if (L.id !== this.levelId) this.rebuild(L);
    const st = s.simTime();
    const k = cam.scale;

    this.stars_(ctx, cam);
    this.bounds(ctx, k, L);
    this.gravity(ctx, k, L, st, t);
    this.ufoRanges(ctx, k, L, s);
    this.trail(ctx, k, s.prevTrail, 0.2);
    this.trail(ctx, k, s.trail, 0.75);
    this.rocks(ctx, k, L, t);
    this.planets(ctx, k, L, st, t);
    this.holes(ctx, k, L, t);
    this.ufos(ctx, k, L, s);
    this.goal(ctx, k, L, t);
    this.bullets(ctx, k, s);
    this.pad(ctx, k, s);
    if (preview) this.preview(ctx, k, preview, t);
    this.ship(ctx, k, s);
  }

  // 카메라 이동의 30%만 따라간다. 나머지 70%를 더해 주면 그만큼 덜 움직인다.
  private stars_(ctx: CanvasRenderingContext2D, cam: Camera): void {
    const ox = (cam.x + cam.viewW / 2) * (1 - STAR_PARALLAX);
    const oy = (cam.y + cam.viewH / 2) * (1 - STAR_PARALLAX);
    ctx.fillStyle = C.line;
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < this.stars.length; i += 3) {
      ctx.fillRect(this.stars[i]! + ox, this.stars[i + 1]! + oy,
        this.stars[i + 2]!, this.stars[i + 2]!);
    }
    ctx.globalAlpha = 1;
  }

  // §11 맵 경계: 옅은 사각형 + 모서리 꺾쇠 + 바깥쪽 사선 해칭
  private bounds(ctx: CanvasRenderingContext2D, k: number, L: Level): void {
    const { w, h } = L;
    stroke(ctx, k, polyline([[0, 0], [w, 0], [w, h], [0, h]]), C.line,
      { alpha: 0.28, glow: false, close: true });
    for (const [p, sx, sy] of [
      [[0, 0], 1, 1], [[w, 0], -1, 1], [[w, h], -1, -1], [[0, h], 1, -1],
    ] as [Pt, number, number][]) {
      stroke(ctx, k, polyline([[p[0] + BRACKET * sx, p[1]], p, [p[0], p[1] + BRACKET * sy]]),
        C.line, { alpha: 0.6 });
    }
    for (let x = HATCH_STEP; x < w; x += HATCH_STEP) {
      stroke(ctx, k, line([x, 0], [x - HATCH_LEN, -HATCH_LEN]), C.line, { alpha: 0.16, glow: false });
      stroke(ctx, k, line([x, h], [x - HATCH_LEN, h + HATCH_LEN]), C.line, { alpha: 0.16, glow: false });
    }
    for (let y = HATCH_STEP; y < h; y += HATCH_STEP) {
      stroke(ctx, k, line([0, y], [-HATCH_LEN, y - HATCH_LEN]), C.line, { alpha: 0.16, glow: false });
      stroke(ctx, k, line([w, y], [w + HATCH_LEN, y - HATCH_LEN]), C.line, { alpha: 0.16, glow: false });
    }
  }

  private gravity(
    ctx: CanvasRenderingContext2D, k: number, L: Level, st: number, t: number,
  ): void {
    for (const b of gravs(L)) {
      const [bx, by] = bodyPos(b, st);
      const isHole = 'rH' in b;
      const col = isHole ? C.hole : C.gravity;
      dashedCircle(ctx, k, bx, by, b.R, col, 0.35);
      if (this.reduceMotion) continue;    // §12.4: 범위는 남기고 움직임만 끈다
      const period = isHole ? 1.2 : 2.4;
      const inner = isHole ? (b as { rH: number }).rH : (b as { r: number }).r;
      for (let i = 0; i < 3; i++) {
        const u = ((t / period + i / 3) % 1 + 1) % 1;
        stroke(ctx, k, circle(bx, by, b.R + (inner - b.R) * u), col,
          { alpha: Math.sin(u * Math.PI) * 0.4, glow: false });
      }
    }
  }

  private ufoRanges(ctx: CanvasRenderingContext2D, k: number, L: Level, s: Session): void {
    const [sx, sy] = s.shipPos();
    const flying = s.state === 'flying';
    for (const u of L.ufos ?? []) {
      let a = 0.2;
      if (flying && Math.hypot(sx - u.x, sy - u.y) < u.range) {
        a = this.reduceMotion ? 0.6 : 0.6 * (0.7 + 0.3 * Math.sin(performance.now() / 1000 * 7));
      }
      dashedCircle(ctx, k, u.x, u.y, u.range, C.danger, a);
    }
  }

  private trail(ctx: CanvasRenderingContext2D, k: number, tr: number[], alpha: number): void {
    if (tr.length < 4) return;
    const pts: Pt[] = [];
    for (let i = 0; i < tr.length; i += 2) pts.push([tr[i]!, tr[i + 1]!]);
    stroke(ctx, k, polyline(pts), C.line, { alpha, glow: false });
  }

  private rocks(ctx: CanvasRenderingContext2D, k: number, L: Level, t: number): void {
    (L.rocks ?? []).forEach((a, i) => {
      const shape = this.rockShapes[i];
      if (!shape) return;
      const rot = t * 0.18 + i;                 // 느리게 회전
      const c = Math.cos(rot), s2 = Math.sin(rot);
      stroke(ctx, k, polyline(shape.map(([px, py]): Pt =>
        [a.x + px * c - py * s2, a.y + px * s2 + py * c])), C.line,
        { alpha: 0.85, close: true });
    });
  }

  private planets(
    ctx: CanvasRenderingContext2D, k: number, L: Level, st: number, t: number,
  ): void {
    for (const p of L.planets ?? []) {
      const [x, y] = bodyPos(p as Grav, st);
      stroke(ctx, k, ngon(x, y, p.r, p.sides, t * 0.105), C.line, { close: true });
      if (p.ring) {
        // 기울어진 타원 고리. 행성 뒤쪽 절반은 가려진 듯 생략 (§12.3).
        stroke(ctx, k, ellipse(x, y, p.r * 1.85, p.r * 0.52, -0.42, 0, Math.PI),
          C.line, { alpha: 0.65 });
      }
    }
  }

  private holes(ctx: CanvasRenderingContext2D, k: number, L: Level, t: number): void {
    for (const h of L.holes ?? []) {
      ctx.fillStyle = C.bg;                     // 지평선만 검정 채움
      ctx.beginPath(); ctx.arc(h.x, h.y, h.rH, 0, Math.PI * 2); ctx.fill();
      stroke(ctx, k, circle(h.x, h.y, h.rH), C.hole);
      for (let i = 0; i < 3; i++) {             // 회전하는 나선 호 3개
        const a0 = (this.reduceMotion ? 0 : t * 1.6) + i * 2.094;
        stroke(ctx, k, arc(h.x, h.y, h.rH + 9 + i * 7, a0, a0 + 1.7), C.hole,
          { alpha: 0.5, glow: false });
      }
    }
  }

  // 고전 비행접시 실루엣, 너비 26유닛 (§12.3). 판정 반경 13 과 같다.
  private ufos(ctx: CanvasRenderingContext2D, k: number, L: Level, s: Session): void {
    for (const u of L.ufos ?? []) {
      stroke(ctx, k, ellipse(u.x, u.y, 13, 4.4, 0, 0, Math.PI * 2), C.danger);
      stroke(ctx, k, ellipse(u.x, u.y - 2, 6, 5.6, 0, Math.PI, Math.PI * 2), C.danger);
      stroke(ctx, k, line([u.x - 13, u.y], [u.x + 13, u.y]), C.danger, { alpha: 0.5, glow: false });
      // 총알은 외계인 위치에서 생겨난다. 아주 가까운 총알이 있으면 방금 쏜 것이다.
      if (!this.reduceMotion) {
        for (const b of s.sim.state.bullets) {
          if (Math.hypot(b.x - u.x, b.y - u.y) < 18) {
            stroke(ctx, k, circle(u.x, u.y, 20), C.danger, { alpha: 0.8, glow: false });
            break;
          }
        }
      }
    }
  }

  private goal(ctx: CanvasRenderingContext2D, k: number, L: Level, t: number): void {
    const { x, y, r } = L.goal;
    for (const dir of [1, -1]) {                // 반대로 도는 두 겹 마름모
      const a = this.reduceMotion ? 0 : t * 0.7 * dir;
      const pts: Pt[] = [];
      for (let i = 0; i < 4; i++) {
        const q = a + Math.PI * 2 * i / 4;
        pts.push([x + Math.cos(q) * r * 0.62, y + Math.sin(q) * r * 0.62]);
      }
      stroke(ctx, k, polyline(pts), C.goal, { alpha: 0.95, close: true });
    }
    if (this.reduceMotion) {
      stroke(ctx, k, circle(x, y, r), C.goal, { alpha: 0.35, glow: false });
      return;
    }
    const u = (t / 1.5) % 1;                    // 바깥으로 퍼지는 원
    stroke(ctx, k, circle(x, y, r * (0.6 + u * 0.75)), C.goal,
      { alpha: (1 - u) * 0.55, glow: false });
  }

  private bullets(ctx: CanvasRenderingContext2D, k: number, s: Session): void {
    for (const b of s.sim.state.bullets) {      // 진행 방향 4유닛 짧은 선
      const d = Math.hypot(b.vx, b.vy);
      if (d < 0.01) continue;
      stroke(ctx, k, line([b.x, b.y], [b.x - b.vx / d * 4, b.y - b.vy / d * 4]), C.danger);
    }
  }

  // 발사대 행성 (§5.9, §12.3). 표면 눈금이 곧 각도 눈금이다.
  private pad(ctx: CanvasRenderingContext2D, k: number, s: Session): void {
    const L = s.level;
    const flying = s.state === 'flying' || s.state === 'ending';
    const aiming = s.state === 'aiming';
    const { x, y } = L.start;
    const pa = padAngle(L) * Math.PI / 180;
    const half = ARC * Math.PI / 180;

    stroke(ctx, k, arc(x, y, DOME_DRAW_R, pa - half, pa + half), C.line,
      { alpha: flying ? 0.35 : 0.85 });
    stroke(ctx, k, arc(x, y, DOME_DRAW_R, pa + half, pa - half + Math.PI * 2), C.line,
      { alpha: flying ? 0.12 : 0.22, glow: false });
    if (flying) return;                         // 비행 중엔 눈금을 빼서 궤적을 가리지 않는다

    for (let d = -90; d <= 90; d += 5) {        // 5° · 15° 눈금
      const a = pa + d * Math.PI / 180;
      const major = d % 15 === 0;
      const out = DOME_DRAW_R + (major ? 6 : 3);
      stroke(ctx, k, line(
        [x + Math.cos(a) * DOME_DRAW_R, y + Math.sin(a) * DOME_DRAW_R],
        [x + Math.cos(a) * out, y + Math.sin(a) * out]), C.gravity,
        { alpha: (aiming ? 0.75 : 0.34) * (major ? 1 : 0.45), glow: false });
    }
    for (const a of [pa - half, pa + half]) {   // 걸을 수 있는 끝
      stroke(ctx, k, line(
        [x + Math.cos(a) * (DOME_DRAW_R - 4), y + Math.sin(a) * (DOME_DRAW_R - 4)],
        [x + Math.cos(a) * (DOME_DRAW_R + 9), y + Math.sin(a) * (DOME_DRAW_R + 9)]),
        C.gravity, { alpha: aiming ? 0.8 : 0.4, glow: false });
    }

    // 방향 표시 힌트 (§14.3). 성공하는 발사 방향을 표면 바깥에 쐐기로 얹는다.
    //
    // 호만 그리면 안 보인다 — 성공 폭이 6~9° 라 반경 31 에서 길이가 3유닛쯤이다.
    // 바깥으로 벌어지는 쐐기로 그려야 "이쪽으로 쏘라"가 읽힌다.
    if (this.directionArc) {
      const a0 = this.directionArc[0] * Math.PI / 180;
      const a1 = this.directionArc[1] * Math.PI / 180;
      const r0 = DOME_DRAW_R + 4, r1 = DOME_DRAW_R + 30;
      const al = aiming ? 0.95 : 0.55;
      stroke(ctx, k, arc(x, y, r1, a0, a1), C.win, { alpha: al });
      for (const a of [a0, a1]) {
        stroke(ctx, k, line(
          [x + Math.cos(a) * r0, y + Math.sin(a) * r0],
          [x + Math.cos(a) * r1, y + Math.sin(a) * r1]), C.win, { alpha: al });
      }
    }
  }

  // 0.05초 간격 점. 바깥으로 흐르게 위상을 민다 (§12.3).
  private preview(
    ctx: CanvasRenderingContext2D, k: number,
    pr: { points: number[]; outcome: string }, t: number,
  ): void {
    const pts = pr.points;
    const n = pts.length / 2;
    if (n < 1) return;
    const spacing = 12;
    const phase = this.reduceMotion ? 0 : Math.floor((t * 34) % spacing);
    const size = Math.max(1.2 / k, 1.4);
    ctx.fillStyle = C.goal;
    for (let i = phase; i < n; i += spacing) {
      ctx.globalAlpha = 0.9 * (1 - i / n * 0.75);
      ctx.beginPath(); ctx.arc(pts[i * 2]!, pts[i * 2 + 1]!, size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (pr.outcome) {                           // 충돌 예측 지점에 ×
      const ex = pts[(n - 1) * 2]!, ey = pts[(n - 1) * 2 + 1]!;
      stroke(ctx, k, line([ex - 5, ey - 5], [ex + 5, ey + 5]), C.danger);
      stroke(ctx, k, line([ex - 5, ey + 5], [ex + 5, ey - 5]), C.danger);
    }
  }

  // 길이 14 · 폭 10, 뒷변이 안쪽으로 파인 아스테로이드식 삼각형 (§12.3)
  private static HULL: readonly Pt[] = [[9, 0], [-6, -5], [-3, 0], [-6, 5]];

  private ship(ctx: CanvasRenderingContext2D, k: number, s: Session): void {
    const [x, y] = s.shipPos();
    const a = s.shipHeading();
    if (s.state === 'ending') {
      const u = s.endProgress();
      if (s.outcome === 'win') this.arrival(ctx, k, s, x, y, a, u);
      else this.burst(ctx, k, x, y, a, u);
      return;
    }
    this.hull(ctx, k, x, y, a, 1, 1);
  }

  private hull(
    ctx: CanvasRenderingContext2D, k: number,
    x: number, y: number, a: number, scale: number, alpha: number,
  ): void {
    const c = Math.cos(a), s = Math.sin(a);
    stroke(ctx, k, polyline(FieldRenderer.HULL.map(([vx, vy]): Pt =>
      [x + (vx * scale * c - vy * scale * s), y + (vx * scale * s + vy * scale * c)])),
      C.line, { alpha, close: true });
  }

  // §12.3 도착: 목적지 중심으로 빨려 들어가며 작아지고, 목적지 원이 크게 퍼짐
  private arrival(
    ctx: CanvasRenderingContext2D, k: number, s: Session,
    x: number, y: number, a: number, u: number,
  ): void {
    const g = s.level.goal;
    const e = u * u;                            // 뒤로 갈수록 빠르게
    this.hull(ctx, k, x + (g.x - x) * e, y + (g.y - y) * e, a + u * 2, 1 - u, 1 - u * 0.5);
    stroke(ctx, k, circle(g.x, g.y, g.r * (1 + u * 2.4)), C.goal,
      { alpha: 1 - u, glow: false });
  }

  // §12.3 폭발: 우주선을 이루던 선분과 파편 선 7개가 회전하며 흩어짐
  private burst(
    ctx: CanvasRenderingContext2D, k: number,
    x: number, y: number, a: number, u: number,
  ): void {
    const H = FieldRenderer.HULL;
    const rot = (p: Pt, ang: number): Pt =>
      [p[0] * Math.cos(ang) - p[1] * Math.sin(ang), p[0] * Math.sin(ang) + p[1] * Math.cos(ang)];
    for (let i = 0; i < H.length; i++) {
      const p0 = rot(H[i]!, a), p1 = rot(H[(i + 1) % H.length]!, a);
      const mid: Pt = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      const len = Math.hypot(mid[0], mid[1]) || 1;
      const ox = x + mid[0] + mid[0] / len * u * 26;
      const oy = y + mid[1] + mid[1] / len * u * 26;
      const d0 = rot([p0[0] - mid[0], p0[1] - mid[1]], u * 2.4);
      const d1 = rot([p1[0] - mid[0], p1[1] - mid[1]], u * 2.4);
      stroke(ctx, k, line([ox + d0[0], oy + d0[1]], [ox + d1[0], oy + d1[1]]),
        C.line, { alpha: 1 - u });
    }
    const r = mulberry32(hashId(this.levelId) ^ 0x5f5f);
    for (let i = 0; i < 7; i++) {
      const ang = r() * Math.PI * 2;
      const d = u * (16 + r() * 28);
      const len = 4 + r() * 7;
      const px = x + Math.cos(ang) * d, py = y + Math.sin(ang) * d;
      const a2 = ang + u * 3;
      stroke(ctx, k, line([px, py], [px + Math.cos(a2) * len, py + Math.sin(a2) * len]),
        C.line, { alpha: (1 - u) * 0.8, glow: false });
    }
  }
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
