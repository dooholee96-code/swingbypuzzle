// 필드 그리기 — 테마 "달토끼 당근 로켓"(8비트). docs/PLAN.md §12, docs/design/rabbit-rocket/INTEGRATION.md
//
// 카메라 변환을 걸고 나면 좌표가 월드 유닛이고, 스프라이트의 1 픽셀 = 1 유닛이다.
// 그래서 그림 크기가 판정 크기와 그대로 맞는다(§5.4). 행성은 반경 r 로 찍고,
// 블랙홀은 검은 핵이 지평선 판정(rH + 2)을 덮도록 키운다 — holeArtRadius.
//
// 투명도 페이드와 발광은 쓰지 않는다. 깜빡임과 디더로 대신한다(시안의 규칙).
// 그림은 물리를 읽기만 한다. 시뮬레이션 값은 하나도 바꾸지 않는다.

import { ARC, PAD_R } from '../core/constants.js';
import { padAngle } from '../core/angle.js';
import { bodyPos, gravs } from '../core/physics.js';
import type { Grav, Level, Outcome } from '../core/types.js';
import type { Camera } from '../game/camera.js';
import { END_SECONDS, type Session } from '../game/session.js';
import { C } from './palette.js';
import { type Baked, SpriteCache, put, putScaled } from './sprites/bake.js';
import { Spring } from './spring.js';
import { type Grid, grid, set } from './sprites/pixel.js';
import { type Face, type SmallName, dir16, rocketDir, small, ufo } from './sprites/rocket.js';
import { blackhole, dockRing, moon, planet, portal, rock, starTile } from './sprites/world.js';

/** 달(발사대)의 그림 반경. PAD_R(22) 보다 작다 — 우주선이 표면 바깥에 선다 (§12.3) */
export const DOME_DRAW_R = 18;
/** 발사 전 로켓이 서는 반경. 시안의 조준 장면 값. 발사 직후 PAD_R 로 부드럽게 붙는다 */
const STAND_R = PAD_R + 4;
// 별 타일은 시안의 64 보다 크게 깐다 — 64 면 같은 무늬가 벽지처럼 되풀이되어 보였다
const STAR_PARALLAX = 0.3, STAR_TILE = 192;
const BRACKET = 24;

/** 블랙홀 그림에서 검은 핵 + 짙은 띠가 차지하는 비율 (world.ts blackhole 의 0.75) */
export const HOLE_CORE = 0.75;
/** 블랙홀을 이 반경으로 찍으면 검은 부분이 지평선 판정(rH + 2)을 덮는다 */
export function holeArtRadius(rH: number): number {
  return (rH + 2) / HOLE_CORE;
}

/** 충돌 뒤 떨림 (시안: 75ms 간격) */
const SHAKE = [2, -2, 2, -1, 1, -1, 0];
const SHAKE_STEP = 0.075;

/** 결과마다 끝 연출의 표정 (INTEGRATION.md "표정") */
function endFace(o: Outcome | '', u: number): Face {
  if (o === 'win') return 'win';
  if (o === 'drift') return 'sleep';
  return u >= 0.9 ? 'sad' : 'bump';
}

/** 반경 R 의 점선 원 (on 개 찍고 off 개 건너뛴다). 1 유닛 = 1 픽셀 */
function dottedRing(R: number, key: string, on = 4, off = 6): Grid {
  const n = Math.ceil(R) * 2 + 3;
  const g = grid(n, n);
  g.ax = n / 2; g.ay = n / 2;
  const steps = Math.floor(2 * Math.PI * R);
  for (let i = 0; i < steps; i++) {
    if (i % (on + off) >= on) continue;
    const a = i / R;
    set(g, Math.floor(g.ax + Math.cos(a) * R), Math.floor(g.ay + Math.sin(a) * R), key);
  }
  return g;
}

export class FieldRenderer {
  reduceMotion = false;
  /** 방향 표시 힌트의 호 (§14.3). 월드각 [시작, 끝]. 없으면 null */
  directionArc: [number, number] | null = null;

  private levelId = '';
  private cache = new SpriteCache();

  // 탄성 (§12.7). 상태가 바뀌는 순간 용수철을 튕기고, 그림을 늘이고 줄인다.
  // 값은 "늘어난 비율"(0.1 = 10%) 이다. 물리는 이 값을 읽지 않는다.
  private lastT = -1;
  private prevState = '';
  private shipS = new Spring(300, 12);
  private moonS = new Spring(320, 10);
  private goalS = new Spring(220, 9);
  // 천체별 용수철은 **객체로** 찾는다. 인피니티(§22.3)는 창을 갈아 끼울 때마다 배열
  // 순서가 바뀌므로 순번으로 찾으면 엉뚱한 행성이 출렁인다. 멈춘 것은 버린다.
  private bodyS = new Map<Grav, Spring>();
  private inside = new Set<Grav>();
  /** 화면에 보이는 월드 사각형(여유 포함). 밖의 물체는 그리지 않는다 */
  private view = { x0: 0, y0: 0, x1: 0, y1: 0 };

  // 분사 연출 (§22.1). 꺾은 자리에 연기, 탭한 곳에 반짝임
  private turnReq: [number, number] | null = null;
  private puff: { t: number; x: number; y: number; tx: number; ty: number; a: number } | null = null;

  /** 분사를 쓴 순간. 탭한 월드 좌표를 받는다 */
  onTurn(tx: number, ty: number): void { this.turnReq = [tx, ty]; }

  // 궤도 행성 (§22.4)
  private dockS = new Map<object, Spring>();
  private wasDocked = false;
  /** 궤도 행성에서 나간 순간 */
  onRelease(): void { if (!this.reduceMotion) this.shipS.kick(4.5); }

  /** 단계마다 크기가 다른 그림은 단계를 바꿀 때 버린다. 로켓·효과는 남긴다. */
  rebuild(L: Level): void {
    if (this.levelId) this.cache.dropPrefix(`L:`);
    this.levelId = L.id;
    this.bodyS.clear();
    this.inside.clear();
    this.dockS.clear();
    this.wasDocked = false;
    for (const sp of [this.shipS, this.moonS, this.goalS]) sp.reset();
    this.prevState = '';
    this.turnReq = null;
    this.puff = null;
  }

  /** 상태가 바뀐 순간과 중력 범위에 들어선 순간에 용수철을 튕긴다 */
  private react(s: Session, dt: number): void {
    const st = s.state;
    if (!this.reduceMotion && st !== this.prevState) {
      if (st === 'aiming') this.shipS.kick(-2.6);                    // 웅크림
      if (st === 'ready' && this.prevState === 'aiming') this.shipS.kick(1.5);
      if (st === 'flying') { this.shipS.kick(5.2); this.moonS.kick(2.2); }  // 튀어 나감, 달이 밀림
      if (st === 'ending') {
        if (s.outcome === 'win') this.goalS.kick(3);
        else if (s.outcome === 'planet' || s.outcome === 'hole') this.nearestBody(s)?.kick(2.6);
      }
    }
    this.prevState = st;
    if (st === 'flying' && !this.reduceMotion) {
      const [x, y] = s.shipPos();
      const st2 = s.simTime();
      for (const b of gravs(s.level)) {
        const [bx, by] = bodyPos(b, st2);
        const now = (x - bx) ** 2 + (y - by) ** 2 < b.R * b.R;
        if (now && !this.inside.has(b)) this.springOf(b).kick(1.3);   // 끌려 들어가는 순간 출렁
        if (now) this.inside.add(b); else this.inside.delete(b);
      }
    } else if (st !== 'ending') this.inside.clear();
    for (const sp of [this.shipS, this.moonS, this.goalS]) sp.step(dt);
    for (const [b, sp] of this.bodyS) {
      sp.step(dt);
      if (sp.x === 0 && sp.v === 0) this.bodyS.delete(b);
    }
    // 붙잡히는 순간 궤도 행성이 출렁인다
    const d = s.sim.docked;
    if (d && !this.wasDocked && !this.reduceMotion) {
      let sp = this.dockS.get(d.dock);
      if (!sp) { sp = new Spring(240, 8); this.dockS.set(d.dock, sp); }
      sp.kick(2.4);
      this.shipS.kick(-2);
    }
    this.wasDocked = d !== null;
    for (const [b, sp] of this.dockS) {
      sp.step(dt);
      if (sp.x === 0 && sp.v === 0) this.dockS.delete(b);
    }
  }

  private springOf(b: Grav): Spring {
    let sp = this.bodyS.get(b);
    if (!sp) { sp = new Spring(240, 8); this.bodyS.set(b, sp); }
    return sp;
  }

  private seen(x: number, y: number, r: number): boolean {
    const v = this.view;
    return x + r >= v.x0 && x - r <= v.x1 && y + r >= v.y0 && y - r <= v.y1;
  }

  private nearestBody(s: Session): Spring | undefined {
    const [x, y] = s.shipPos();
    let best: Grav | null = null, bd = Infinity;
    for (const b of gravs(s.level)) {
      const [bx, by] = bodyPos(b, s.simTime());
      const d = (x - bx) ** 2 + (y - by) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best ? this.springOf(best) : undefined;
  }

  private sprite(key: string, make: () => Grid): Baked { return this.cache.get(key, make); }
  /** 이 단계에서만 쓰는 그림 */
  private lv(key: string, make: () => Grid): Baked { return this.cache.get(`L:${key}`, make); }

  draw(
    ctx: CanvasRenderingContext2D, cam: Camera, s: Session,
    t: number, preview: { points: number[]; outcome: string } | null,
  ): void {
    const L = s.level;
    if (L.id !== this.levelId) this.rebuild(L);
    const st = s.simTime();
    ctx.imageSmoothingEnabled = false;
    const dt = this.lastT < 0 ? 0 : Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    this.view = { x0: cam.x - 4, y0: cam.y - 4, x1: cam.x + cam.viewW + 4, y1: cam.y + cam.viewH + 4 };
    this.react(s, dt);
    if (this.turnReq) {
      const [x, y] = s.shipPos();
      // 연기는 새 진행 방향의 반대쪽으로 뿜는다
      const a = Math.atan2(this.turnReq[1] - y, this.turnReq[0] - x);
      this.puff = { t, x, y, tx: this.turnReq[0], ty: this.turnReq[1], a };
      if (!this.reduceMotion) this.shipS.kick(4);
      this.turnReq = null;
    }

    this.sky(ctx, cam, L);
    this.bounds(ctx, L);
    this.gravity(ctx, L, st, t);
    this.ufoRanges(ctx, L, s, t);
    this.trail(ctx, s.prevTrail, C.dim);
    this.trail(ctx, s.trail, C.line);
    this.rocks(ctx, L, t);
    this.planets(ctx, L, st);
    this.docks(ctx, L, s, t);
    this.holes(ctx, L, t);
    this.ufos(ctx, L, t);
    this.goal(ctx, L, t);
    if (s.world) this.items(ctx, s.world.items, t);
    this.bullets(ctx, s);
    this.pad(ctx, s);
    if (preview) this.preview(ctx, preview, t);
    this.turnPuff(ctx, t);
    this.ship(ctx, s, t);
  }

  /** 분사 연기(0.35초, 뒤로 퍼지며 커지는 네 덩이)와 탭 지점 반짝임(0.25초) */
  private turnPuff(ctx: CanvasRenderingContext2D, t: number): void {
    const p = this.puff;
    if (!p) return;
    const age = t - p.t;
    if (age > 0.35) { this.puff = null; return; }
    const u = age / 0.35;
    const back = p.a + Math.PI;
    const puff = this.fx(u < 0.4 ? 'dust0' : 'dust1');
    for (let i = 0; i < 4; i++) {
      const q = back + (i - 1.5) * 0.35;
      const d = 4 + (10 + i * 3) * Math.sqrt(u);
      const k = 1.6 + u * 1.4;
      putScaled(ctx, puff, p.x + Math.cos(q) * d, p.y + Math.sin(q) * d, k, k);
    }
    if (age < 0.25) put(ctx, this.fx(Math.floor(age * 16) % 2 ? 'sparkle1' : 'sparkle0'), p.tx, p.ty);
  }

  // 밤하늘. 맵 바깥은 한 칸 어두운 색($03)으로 칠해 벽이 읽히게 한다.
  // 별은 반복 타일이고, 카메라 이동의 30%만 따라간다 (§12 시차)
  private sky(ctx: CanvasRenderingContext2D, cam: Camera, L: Level): void {
    ctx.fillStyle = C.void;
    ctx.fillRect(cam.x - 2, cam.y - 2, cam.viewW + 4, cam.viewH + 4);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, L.w, L.h);

    const tile = this.sprite('stars', () => starTile(3, STAR_TILE, STAR_TILE));
    const ox = Math.round(cam.x * (1 - STAR_PARALLAX)), oy = Math.round(cam.y * (1 - STAR_PARALLAX));
    const x0 = Math.max(0, cam.x), y0 = Math.max(0, cam.y);
    const x1 = Math.min(L.w, cam.x + cam.viewW), y1 = Math.min(L.h, cam.y + cam.viewH);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, L.w, L.h); ctx.clip();
    const sx = Math.floor((x0 - ox) / STAR_TILE) * STAR_TILE + ox;
    const sy = Math.floor((y0 - oy) / STAR_TILE) * STAR_TILE + oy;
    for (let y = sy; y < y1; y += STAR_TILE) {
      for (let x = sx; x < x1; x += STAR_TILE) ctx.drawImage(tile.img as CanvasImageSource, x, y);
    }
    ctx.restore();
  }

  // 맵 모서리 꺾쇠. 2px 간격 점선($32)
  private bounds(ctx: CanvasRenderingContext2D, L: Level): void {
    const { w, h } = L;
    ctx.fillStyle = C.dim;
    for (const [x, y, sx, sy] of [[0, 0, 1, 1], [w - 1, 0, -1, 1], [w - 1, h - 1, -1, -1], [0, h - 1, 1, -1]] as const) {
      for (let i = 0; i < BRACKET; i += 2) {
        ctx.fillRect(x + i * sx, y, 1, 1);
        ctx.fillRect(x, y + i * sy, 1, 1);
      }
    }
  }

  // 중력 범위: 점선 원(4 찍고 6 쉼). 안쪽으로 줄어드는 링은 세 단계로 깜빡인다
  private gravity(ctx: CanvasRenderingContext2D, L: Level, st: number, t: number): void {
    for (const b of gravs(L)) {
      const [bx, by] = bodyPos(b, st);
      if (!this.seen(bx, by, b.R + 2)) continue;
      const isHole = 'rH' in b;
      const key = isHole ? 'V' : 'B';
      put(ctx, this.lv(`range:${b.R}:${key}`, () => dottedRing(b.R, key)), bx, by);
      if (this.reduceMotion) continue;           // §12.4: 범위는 남기고 움직임만 끈다
      const period = isHole ? 1.2 : 2.4;
      const inner = isHole ? holeArtRadius((b as { rH: number }).rH) * 1.6 : (b as { r: number }).r;
      const step = Math.floor((t / period) * 3) % 3;
      const r = Math.round(b.R + (inner - b.R) * (step + 1) / 4);
      put(ctx, this.lv(`ripple:${r}:${key}`, () => dottedRing(r, key, 2, 8)), bx, by);
    }
  }

  // 외계인 사격 범위. 우주선이 안에 있으면 빨강/짙은 빨강으로 깜빡인다
  private ufoRanges(ctx: CanvasRenderingContext2D, L: Level, s: Session, t: number): void {
    const [sx, sy] = s.shipPos();
    const flying = s.state === 'flying';
    for (const u of L.ufos ?? []) {
      if (!this.seen(u.x, u.y, u.range + 2)) continue;
      const inside = flying && Math.hypot(sx - u.x, sy - u.y) < u.range;
      const dark = inside && !this.reduceMotion && Math.floor(t * 7.5) % 2 === 1;
      const key = dark ? 'r' : 'R';
      put(ctx, this.lv(`range:${u.range}:${key}`, () => dottedRing(u.range, key)), u.x, u.y);
    }
  }

  private trail(ctx: CanvasRenderingContext2D, tr: number[], color: string): void {
    ctx.fillStyle = color;
    for (let i = 0; i + 1 < tr.length; i += 2) ctx.fillRect(Math.round(tr[i]!), Math.round(tr[i + 1]!), 1, 1);
  }

  // 소행성: 16프레임으로 천천히 돈다
  private rocks(ctx: CanvasRenderingContext2D, L: Level, t: number): void {
    (L.rocks ?? []).forEach((a, i) => {
      const f = this.reduceMotion ? 0 : (Math.floor(t * 0.5) + i) % 16;
      if (!this.seen(a.x, a.y, a.r * 1.3)) return;
      // 그림은 반경·시드·프레임으로만 정해진다 — 순번으로 찾지 않는다(인피니티의 창)
      put(ctx, this.lv(`rock:${a.r}:${a.seed}:${f}`, () => rock(a.r, a.seed, f)), a.x, a.y);
    });
  }

  // 행성: 반경 r 그대로. 색은 sides 로 고른다(단계마다 고정). 회전하지 않는다
  // 궤도 행성 (§22.4): 몸체 + 초록 점선 포획 링. 붙잡혀 있으면 링이 밝게 깜빡이고,
  // "지금 나가면 이렇게 간다" 예측선을 그린다
  private docks(ctx: CanvasRenderingContext2D, L: Level, s: Session, t: number): void {
    const cur = s.sim.docked?.dock ?? null;
    for (const d of L.docks ?? []) {
      if (!this.seen(d.x, d.y, d.cr + 4)) continue;
      const lit = d === cur && !this.reduceMotion && Math.floor(t * 4) % 2 === 0;
      put(ctx, this.lv(`dockring:${d.cr}:${lit ? 1 : 0}`, () => dockRing(d.cr, lit ? 'W' : 'L')), d.x, d.y);
      const k = this.dockS.get(d)?.x ?? 0;
      putScaled(ctx, this.lv(`dock:${d.r}:${d.sides % 6}`, () => planet(d.r, (d.sides % 6 + 4) % 6, { face: true })),
        d.x, d.y, 1 + k, 1 - k);
    }
    if (cur && s.state === 'flying') {
      const pr = s.sim.predictRelease(L, s.sim.ship, s.sim.time, L.preview);
      this.preview(ctx, pr, t);
    }
  }

  private planets(ctx: CanvasRenderingContext2D, L: Level, st: number): void {
    (L.planets ?? []).forEach((p, i) => {
      const [x, y] = bodyPos(p as Grav, st);
      if (!this.seen(x, y, p.r * 2)) return;
      const k = this.bodyS.get(p as Grav)?.x ?? 0;    // 출렁: 가로로 늘면 세로로 준다
      const key = `planet:${p.r}:${p.sides % 6}:${p.ring ? 1 : 0}`;
      putScaled(ctx, this.lv(key, () => planet(p.r, p.sides % 6, { ring: !!p.ring })), x, y, 1 + k, 1 - k);
    });
  }

  private holes(ctx: CanvasRenderingContext2D, L: Level, t: number): void {
    const f = this.reduceMotion ? 0 : Math.floor(t * 8) % 8;
    (L.holes ?? []).forEach((h) => {
      if (!this.seen(h.x, h.y, holeArtRadius(h.rH) * 1.5)) return;
      const k = this.bodyS.get(h as unknown as Grav)?.x ?? 0;
      putScaled(ctx, this.lv(`hole:${h.rH}:${f}`, () => blackhole(holeArtRadius(h.rH), f)), h.x, h.y, 1 + k, 1 - k);
    });
  }

  private ufos(ctx: CanvasRenderingContext2D, L: Level, t: number): void {
    const f = this.reduceMotion ? 0 : Math.floor(t * 7.5) % 2;
    for (const u of L.ufos ?? []) {
      if (this.seen(u.x, u.y, 20)) put(ctx, this.sprite(`ufo:${f}`, () => ufo(f)), u.x, u.y);
    }
  }

  // 목적지: 토끼굴. 반경 r 전체가 도착 판정이다
  private goal(ctx: CanvasRenderingContext2D, L: Level, t: number): void {
    const { x, y, r } = L.goal;
    const f = this.reduceMotion ? 0 : Math.floor(t * 7.5) % 8;
    const k = this.goalS.x;
    putScaled(ctx, this.sprite(`portal:${r}:${f}`, () => portal(r, f)), x, y, 1 + k, 1 + k);
  }

  // 분사 아이템(§22.3): 당근. 두 배로 키워 찍고 위아래로 천천히 떠 있는다
  private items(ctx: CanvasRenderingContext2D, items: readonly { x: number; y: number }[], t: number): void {
    const b = this.fx('carrot');
    items.forEach((it, i) => {
      if (!this.seen(it.x, it.y, 20)) return;
      const bob = this.reduceMotion ? 0 : Math.round(Math.sin(t * 3 + i) * 2);
      putScaled(ctx, b, it.x, it.y + bob, 2, 2);
      if (!this.reduceMotion && Math.floor(t * 2 + i) % 3 === 0) put(ctx, this.fx('sparkle1'), it.x + 9, it.y - 9 + bob);
    });
  }

  private bullets(ctx: CanvasRenderingContext2D, s: Session): void {
    const b = this.fx('bullet');
    for (const k of s.sim.state.bullets) put(ctx, b, k.x, k.y);
  }

  private fx(n: SmallName): Baked { return this.sprite(`fx:${n}`, () => small(n)); }

  // 발사대: 달. 눈금은 15° 마다 1px 점 — 45° 마다 길게. 비행 중엔 눈금을 뺀다
  private pad(ctx: CanvasRenderingContext2D, s: Session): void {
    const L = s.level;
    const { x, y } = L.start;
    // 발사 반동: 발사 방향으로 눌리고 옆으로 퍼진다
    const km = this.moonS.x;
    putScaled(ctx, this.sprite('moon', () => moon(DOME_DRAW_R)), x, y, 1 - km, 1 + km * 0.6, s.angle * Math.PI / 180);
    if (s.state === 'flying' || s.state === 'ending') return;

    const aiming = s.state === 'aiming';
    const pa = padAngle(L) * Math.PI / 180;
    ctx.fillStyle = aiming ? C.line : C.dim;
    for (let d = -ARC; d <= ARC; d += 15) {
      const a = pa + d * Math.PI / 180;
      const len = d % 45 === 0 ? 4 : 2;
      for (let k = 0; k < len; k++) {
        ctx.fillRect(Math.floor(x + Math.cos(a) * (DOME_DRAW_R + 3 + k)),
          Math.floor(y + Math.sin(a) * (DOME_DRAW_R + 3 + k)), 1, 1);
      }
    }

    // 방향 표시 힌트 (§14.3). 성공하는 발사 방향을 초록 쐐기로. 조준 중이 아니면 한 칸씩 건너뛰어 덜 시끄럽게
    if (this.directionArc) {
      const a0 = this.directionArc[0] * Math.PI / 180, a1 = this.directionArc[1] * Math.PI / 180;
      // 로켓(길이 26)이 달 바깥 반경 STAND_R 에 서 있으므로 그 너머에서 시작한다 — 가려지지 않게
      const r0 = STAND_R + 14, r1 = STAND_R + 44;
      const skip = aiming ? 1 : 2;
      ctx.fillStyle = C.win;
      for (const a of [a0, a1]) {
        for (let rr = r0, i = 0; rr <= r1; rr++, i++) {
          if (i % skip) continue;
          ctx.fillRect(Math.floor(x + Math.cos(a) * rr), Math.floor(y + Math.sin(a) * rr), 2, 2);
        }
      }
      const n = Math.max(2, Math.ceil((a1 - a0) * r1));
      for (let i = 0; i <= n; i += skip) {
        const a = a0 + (a1 - a0) * i / n;
        ctx.fillRect(Math.floor(x + Math.cos(a) * r1), Math.floor(y + Math.sin(a) * r1), 2, 2);
      }
    }
  }

  // 예측선: 2×2 노랑 점이 바깥으로 흐른다. 충돌이 예측되면 끝에 × (§12.3)
  private preview(ctx: CanvasRenderingContext2D, pr: { points: number[]; outcome: string }, t: number): void {
    const pts = pr.points;
    const n = pts.length / 2;
    if (n < 1) return;
    // 6스텝(0.025초)마다. 시안처럼 촘촘해야 노란 별 무리와 갈려 한 줄로 읽힌다
    const spacing = 6;
    const phase = this.reduceMotion ? 0 : Math.floor((t * 34) % spacing);
    const dot = this.fx('dot');
    for (let i = phase; i < n; i += spacing) put(ctx, dot, pts[i * 2]!, pts[i * 2 + 1]!);
    if (pr.outcome) put(ctx, this.fx('xmark'), pts[(n - 1) * 2]!, pts[(n - 1) * 2 + 1]!);
  }

  private rocket(face: Face, a: number, opt: { flame?: number; ears?: 'up' | 'back' } = {}): Baked {
    const d = dir16(a);
    return this.sprite(`rocket:${face}:${d.toFixed(4)}:${opt.flame ?? -1}:${opt.ears ?? 'up'}`,
      () => rocketDir(face, d, opt));
  }

  private ship(ctx: CanvasRenderingContext2D, s: Session, t: number): void {
    const a = s.shipHeading();
    if (s.state === 'ready' || s.state === 'aiming') {
      // 조준을 시작하면 달 쪽으로 웅크리고, 놓으면 튀어 오른다 (§12.7)
      const { x, y } = s.level.start;
      const k = this.shipS.x, r = STAND_R + k * 10;
      putScaled(ctx, this.rocket(s.state === 'aiming' ? 'aim' : 'idle', a),
        x + Math.cos(a) * r, y + Math.sin(a) * r, 1 + k, 1 - k * 0.6, a);
      return;
    }
    const [x, y] = s.shipPos();
    if (s.state === 'flying') {
      // 서 있던 자리(STAND_R)에서 발사 좌표(PAD_R)로 0.1초에 걸쳐 붙는다 — 튀지 않게
      const lift = (STAND_R - PAD_R) * Math.max(0, 1 - s.flightSeconds() / 0.1);
      // 궤도 행성에서 도는 동안은 불꽃을 끄고 조준하는 얼굴 — 탭을 기다린다 (§22.4)
      if (s.sim.docked) {
        const k = this.shipS.x;
        putScaled(ctx, this.rocket('aim', a), x, y, 1 + k, 1 - k * 0.6, a);
        return;
      }
      const flame = this.reduceMotion ? 0 : Math.floor(t * 15) % 2;
      // 발사 순간 진행 방향으로 늘어났다가 출렁이며 돌아온다
      const k = this.shipS.x;
      putScaled(ctx, this.rocket('fly', a, { flame, ears: 'back' }),
        x + Math.cos(a) * lift, y + Math.sin(a) * lift, 1 + k, 1 - k * 0.6, a);
      return;
    }
    // ending
    const u = s.endProgress();
    const o = s.outcome;
    if (o === 'win') this.arrival(ctx, s, x, y, a, u, t);
    else if (o === 'hole') this.swallowed(ctx, x, y, a, u);
    else if (o === 'drift') this.drifting(ctx, x, y, a, t);
    else this.bump(ctx, x, y, a, u, o, t);
  }

  // 도착: 토끼굴 가운데로 빨려 들어가며 16방향 프레임이 빠르게 돈다. 둘레에 반짝이 6개
  private arrival(ctx: CanvasRenderingContext2D, s: Session, x: number, y: number, a: number, u: number, t: number): void {
    const g = s.level.goal;
    const e = u * u;
    const spin = this.reduceMotion ? 0 : u * Math.PI * 4;
    put(ctx, this.rocket('win', a + spin), x + (g.x - x) * e, y + (g.y - y) * e);
    const sp = this.fx(Math.floor(t * 7.5) % 2 ? 'sparkle0' : 'sparkle1');
    for (let i = 0; i < 6; i++) {
      const q = i * Math.PI / 3 + (this.reduceMotion ? 0 : t);
      put(ctx, sp, g.x + Math.cos(q) * (g.r + 10), g.y + Math.sin(q) * (g.r + 10));
    }
  }

  // 충돌: 그 자리에서 떨리고, 앞에 먼지, 머리 위에 별이 돈다. 끝에 시무룩한 얼굴
  private bump(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, u: number,
    o: Outcome | '', t: number): void {
    const el = u * END_SECONDS;
    const shaking = u < 0.6 && !this.reduceMotion;
    const dx = shaking ? SHAKE[Math.min(SHAKE.length - 1, Math.floor(el / SHAKE_STEP))]! : 0;
    put(ctx, this.rocket(endFace(o, u), a, { ears: 'back' }), x + dx, y);
    put(ctx, this.fx(u < 0.25 ? 'dust0' : 'dust1'), x + Math.cos(a) * 12, y + Math.sin(a) * 12);
    if (this.reduceMotion) return;
    const dz = this.fx('dizzy');
    for (let i = 0; i < 3; i++) {
      const q = t * 4 + i * 2.09;
      put(ctx, dz, x + dx + Math.cos(q) * 13, y - 16 + Math.sin(q) * 4);
    }
  }

  // 블랙홀: 떨림 대신 제자리에서 돌며 작아진다
  private swallowed(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, u: number): void {
    const k = Math.max(0, 1 - u);
    if (k <= 0) return;
    const b = this.rocket('bump', a + (this.reduceMotion ? 0 : u * Math.PI * 6), { ears: 'back' });
    const w = Math.max(1, Math.round(b.w * k)), h = Math.max(1, Math.round(b.h * k));
    ctx.drawImage(b.img as CanvasImageSource, Math.round(x - b.ax * k), Math.round(y - b.ay * k), w, h);
  }

  // 30초 표류: 잠든 얼굴 + zz
  private drifting(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, t: number): void {
    put(ctx, this.rocket('sleep', a), x, y);
    const bob = this.reduceMotion ? 0 : Math.round(Math.sin(t * 3) * 2);
    put(ctx, this.fx('zz'), x + 10, y - 16 + bob);
  }
}
