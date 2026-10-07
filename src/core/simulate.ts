// 비행 진행과 예측선. docs/PLAN.md §5.4, §5.7, §5.9
//
// 게임(한 프레임에 몇 스텝씩)과 검증기(끝까지 한 번에)가 **같은 스테퍼**를 쓴다.
// 스테핑을 두 벌 두면 검증기가 통과시킨 단계가 게임에서 다르게 날아갈 수 있다(§0.3).
//
// 시각 t 는 launchStep * DT 에서 시작해 **누산**한다. levelStep * DT 로 다시
// 계산하면 배정밀도 결과가 미세하게 갈린다. 부록 A 와 같은 방식이다.

import { DOCK_HOLD_LAPS, DOCK_LAP, DT, MAX_FLIGHT, PAD_R, SHIP_R, TURN_MAX } from './constants.js';
import { fireUfos, stepBullets } from './hazards.js';
import { INVULN_STEPS, type Mods, defaultMods } from './mods.js';
import { bodyPos, dist, gravs, stepShip } from './physics.js';
import type { Dock, Grav, Level, Outcome, ShipState, SimState, Turn, Ufo } from './types.js';

/** 궤도 행성을 도는 각속도(rad/s) */
const DOCK_OMEGA = 2 * Math.PI / DOCK_LAP;
/** 붙잡힌 뒤 이 스텝이 지나면 저절로 나간다 (두 바퀴) */
export const DOCK_HOLD_STEPS = Math.round(DOCK_LAP * DOCK_HOLD_LAPS / DT);
/** 나간 궤도 행성은 링에서 이만큼 멀어져야 다시 붙잡는다 — 나가자마자 다시 잡히지 않게 */
const DOCK_LEAVE = 6;

/** 궤도 행성에 붙잡혀 도는 상태 (§22.4) */
export interface Docked { dock: Dock; ang: number; dir: 1 | -1; speed: number; since: number }

/**
 * 같은 궤도 행성인가 — **자리로** 본다. 인피니티는 패시브(포획 링 넓게, §22.5)로 칸을 다시
 * 만들면 같은 행성이 새 객체가 된다. 객체로 비교하면 방금 나온 링에 바로 다시 잡힌다.
 */
export function sameDock(a: Dock | null, b: Dock | null): boolean {
  return a !== null && b !== null && a.x === b.x && a.y === b.y;
}

/** 이 위치에서 붙잡을 궤도 행성. 방금 나온 것은 빼고 본다 */
function dockAt(L: Level, x: number, y: number, leaving: Dock | null): Dock | null {
  for (const d of L.docks ?? []) {
    if (!sameDock(d, leaving) && dist(d.x, d.y, x, y) < d.cr) return d;
  }
  return null;
}

/** 붙잡힌 상태를 만든다. 들어온 쪽으로 돌고, 속력은 지킨다 */
function capture(d: Dock, s: ShipState, n: number): Docked {
  const rx = s.x - d.x, ry = s.y - d.y;
  const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  const dir: 1 | -1 = rx * s.vy - ry * s.vx >= 0 ? 1 : -1;
  const ang = Math.atan2(ry, rx);
  return { dock: d, ang, dir, speed, since: n };
}

/** 궤도 위 자리와 접선 속도를 우주선에 적는다 */
function placeOnOrbit(o: Docked, s: ShipState): void {
  const c = Math.cos(o.ang), sn = Math.sin(o.ang);
  s.x = o.dock.x + o.dock.cr * c;
  s.y = o.dock.y + o.dock.cr * sn;
  s.vx = -sn * o.dir * o.speed;
  s.vy = c * o.dir * o.speed;
}

/**
 * 분사 (§22.1). 속력은 두고 진행 방향만 dir 쪽으로 돌린다. 차이가 TURN_MAX 를 넘으면
 * TURN_MAX 만큼만. 게임·검증기·리플레이가 모두 이 함수 하나를 쓴다.
 */
export function applyTurn(s: ShipState, dirDeg: number, max = TURN_MAX): void {
  const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  if (speed === 0) return;
  const cur = Math.atan2(s.vy, s.vx) * 180 / Math.PI;
  let d = dirDeg - cur;
  d -= 360 * Math.round(d / 360);                    // (−180, 180]
  if (d > max) d = max;
  else if (d < -max) d = -max;
  const a = (cur + d) * Math.PI / 180;
  s.vx = Math.cos(a) * speed;
  s.vy = Math.sin(a) * speed;
}

/** θ 에서의 발사 좌표 (§5.9). */
export function launchPos(L: Level, thetaDeg: number): [number, number] {
  const a = thetaDeg * Math.PI / 180;
  return [L.start.x + PAD_R * Math.cos(a), L.start.y + PAD_R * Math.sin(a)];
}

export interface Preview { points: number[]; outcome: Outcome | '' }

export class Sim {
  ship: ShipState = { x: 0, y: 0, vx: 0, vy: 0 };
  state: SimState = { bullets: [], nextFire: [] };

  /** 켜면 매 스텝 우주선 위치를 path 에 x, y 쌍으로 쌓는다. 전수 스캔에서는 끈다. */
  recordPath = false;
  path: number[] = [];

  /** 이번 비행에서 실제로 쓴 분사. 리플레이·정답 기록이 이걸 쓴다 */
  turns: Turn[] = [];
  /** 인피니티(§22.3): 30초 표류 제한을 두지 않는다. begin 전에 켠다 */
  endless = false;
  /** 궤도 행성에 붙잡혀 있으면 그 상태 (§22.4) */
  docked: Docked | null = null;
  /** 이번 비행에서 탭으로 나간 스텝들. 정답·리플레이 기록 (§22.4) */
  releases: number[] = [];
  /** 붙잡혀 돈 스텝 수. 30초 표류 시계와 인피니티 점수에서 뺀다 */
  dockedSteps = 0;
  /**
   * 보정값 (§22.5). 인피니티의 패시브가 여기에 쓴다. 스테이지는 기본값 그대로 —
   * begin() 이 되돌리지 않으므로 부른 쪽이 비행마다 원하는 값으로 둔다.
   */
  mods: Mods = defaultMods();
  /** 방패로 튕긴 뒤 남은 무적 스텝. 그리는 쪽이 깜빡임에 쓴다 */
  invuln = 0;
  /** 이번 비행에서 방패로 튕긴 횟수. 화면이 소리·연출의 순간을 알아채는 데 쓴다 */
  absorbs = 0;
  /** step() 이 마지막으로 돌려준 결과. 이어하기(revive)가 무엇에 부딪혔는지 안다 */
  lastOutcome: Outcome | '' = '';

  private L!: Level;
  private G: Grav[] = [];
  private queued: number | null = null;
  private ufoRef: Ufo[] = [];
  private plan: Turn[] = [];
  private planAt = 0;
  private relQueued = false;
  private relPlan: number[] = [];
  private relAt = 0;
  private leaving: Dock | null = null;
  private t = 0;
  private n = 0;
  private maxN = 0;

  /** 비행 시계(스텝). 30초 제한과 외계인 사격 타이밍의 기준 (§5.2). */
  get flightStep(): number { return this.n; }

  /** 진행 중인 비행의 현재 시각. 화면이 공전 행성을 같은 자리에 그리려면 이걸 쓴다. */
  get time(): number { return this.t; }

  /** 발사 준비. 이후 step() 을 반복 호출한다. turns 는 되풀이할 분사 기록 (§22.1) */
  begin(
    L: Level, angleDeg: number, launchStep: number, G?: Grav[], turns?: Turn[], releases?: number[],
  ): void {
    this.L = L;
    this.G = G ?? gravs(L);
    this.state = { bullets: [], nextFire: (L.ufos ?? []).map((u) => u.delay) };
    this.ufoRef = L.ufos ?? [];
    this.path.length = 0;
    this.turns = [];
    this.queued = null;
    this.plan = turns?.length ? [...turns].sort((a, b) => a.step - b.step) : [];
    this.planAt = 0;
    this.docked = null;
    this.releases = [];
    this.dockedSteps = 0;
    this.relQueued = false;
    this.relPlan = releases?.length ? [...releases].sort((a, b) => a - b) : [];
    this.relAt = 0;
    this.leaving = null;
    this.invuln = 0;
    this.absorbs = 0;
    this.lastOutcome = '';

    const a = angleDeg * Math.PI / 180;
    // 돔 표면에서 이륙한다 (§5.9)
    this.ship = {
      x: L.start.x + PAD_R * Math.cos(a),
      y: L.start.y + PAD_R * Math.sin(a),
      vx: Math.cos(a) * L.speed,
      vy: Math.sin(a) * L.speed,
    };
    this.t = launchStep * DT;
    this.n = 0;
    this.maxN = this.endless ? Infinity : MAX_FLIGHT / DT;   // 배정밀도에서 정확히 7200
  }

  /**
   * 인피니티(§22.3): 창(레벨의 배열)이 바뀐 뒤 부른다. 중력원 목록을 다시 묶고,
   * 외계인 사격 시각을 **같은 외계인 객체끼리** 이어 준다 — 새로 들어온 외계인은
   * 지금부터 delay 초 뒤 첫 사격. 스텝 경계에서만 부르므로 결정론은 그대로다.
   */
  refreshBodies(): void {
    this.G = gravs(this.L);
    const prev = new Map<Ufo, number>();
    this.ufoRef.forEach((u, i) => prev.set(u, this.state.nextFire[i]!));
    const ufos = this.L.ufos ?? [];
    this.state.nextFire = ufos.map((u) => prev.get(u) ?? this.n * DT + u.delay);
    this.ufoRef = ufos;
  }

  /**
   * 다음 스텝을 밟기 직전에 꺾는다 (§22.1). 화면의 탭이 프레임 중간에 와도
   * 스텝 경계에서만 적용되므로, 기록(step, dir)으로 똑같이 되풀이된다.
   */
  queueTurn(dirDeg: number): void { this.queued = dirDeg; }

  /** 아직 적용 안 된 분사가 있는가 — 한 스텝 안에 두 번 탭해도 한 번만 쓰게 */
  get turnPending(): boolean { return this.queued !== null; }

  /** 궤도 행성에서 다음 스텝 경계에 나간다 (§22.4). 붙잡혀 있지 않으면 아무 일도 없다 */
  queueRelease(): void { if (this.docked) this.relQueued = true; }

  /** 아직 적용 안 된 나가기가 있는가 — 한 스텝 안의 두 번째 탭은 없는 것으로 */
  get releasePending(): boolean { return this.relQueued; }

  /** 한 스텝. '' = 계속. */
  step(): Outcome | '' {
    const r = this.stepInner();
    if (r) this.lastOutcome = r;
    return r;
  }

  /**
   * 이어하기 (§14.7). 끝난 자리에서 다시 난다 — 부딪힌 것의 바깥으로 밀어내고 속도를
   * 반사한다(방패와 같은 식). 블랙홀은 중력 범위 밖까지 내보낸다 — 흡수 반경 곁에 두면
   * 바로 다시 빨려 들어간다. 무적 3초. 벽·표류·도착은 이어갈 것이 없어 거짓.
   */
  revive(): boolean {
    const r = this.lastOutcome;
    if (!r || r === 'wall' || r === 'drift' || r === 'win') return false;
    if (!this.pushOut(r, true)) return false;
    this.lastOutcome = '';
    this.invuln = INVULN_STEPS * 2;
    return true;
  }

  private stepInner(): Outcome | '' {
    if (this.n - this.dockedSteps >= this.maxN) return 'drift';
    // 기록된 나가기·분사는 지나간 것까지 소비한다. 스텝이 맞아도 그때 붙잡혀 있지 않은
    // 나가기는 버린다 — 깃발을 남겨 두면 다음에 붙잡히자마자 나가 버린다
    while (this.relAt < this.relPlan.length && this.relPlan[this.relAt]! <= this.n) {
      if (this.relPlan[this.relAt++] === this.n && this.docked) this.relQueued = true;
    }
    while (this.planAt < this.plan.length && this.plan[this.planAt]!.step <= this.n) {
      const p = this.plan[this.planAt++]!;
      if (p.step === this.n) this.queued = p.dir;
    }
    if (this.docked) {
      // 탭했거나 두 바퀴가 지나면 지금 자리의 접선으로 나간다. 속도는 이미 접선이다
      const auto = this.n - this.docked.since >= DOCK_HOLD_STEPS;
      if (this.relQueued || auto) {
        if (this.relQueued) this.releases.push(this.n);
        this.leaving = this.docked.dock;
        this.docked = null;
      }
      this.relQueued = false;
    }
    if (this.docked) {
      // 도는 중에는 분사하지 않는다(게임에서는 도는 중 탭이 나가기라 생기지도 않는다)
      this.queued = null;
      return this.orbitStep();
    }
    if (this.queued !== null) {
      applyTurn(this.ship, this.queued, this.mods.turnMax);
      this.turns.push({ step: this.n, dir: this.queued });
      this.queued = null;
    }
    if (this.invuln > 0) this.invuln -= 1;
    const r = stepShip(this.L, this.G, this.ship, this.t);
    this.t += DT;
    this.n += 1;
    if (this.recordPath) this.path.push(this.ship.x, this.ship.y);
    if (r && !this.absorb(r)) return r;
    if (this.L.docks?.length) {
      const s = this.ship;
      for (const d of this.L.docks) {
        if (dist(d.x, d.y, s.x, s.y) < d.r + SHIP_R && !this.absorb('planet')) return 'planet';
      }
      if (this.leaving && dist(this.leaving.x, this.leaving.y, s.x, s.y) > this.leaving.cr + DOCK_LEAVE) {
        this.leaving = null;
      }
      const d = dockAt(this.L, s.x, s.y, this.leaving);
      if (d) {
        this.docked = capture(d, s, this.n);
        placeOnOrbit(this.docked, s);
      }
    }
    fireUfos(this.L, this.state, this.ship, this.n * DT, this.mods.bulletScale);
    const rb = stepBullets(this.L, this.state, this.ship);
    if (rb && !this.absorb(rb)) return rb;
    if (this.n - this.dockedSteps >= this.maxN) return 'drift';
    return '';
  }

  /**
   * 방패 (§22.5). 충돌을 튕겨 낸다 — 부딪힌 것의 중심에서 바깥쪽으로 밀어내고 속도를
   * 그 법선에 반사한다(속력은 그대로). 횟수가 남아 있거나 무적 중이면 참.
   * 무적 중의 충돌은 횟수를 쓰지 않는다 — 행성 곁에서 한 번 튕기면 중력이 다시 끌어
   * 당기므로, 그 1.5초는 분사로 벗어날 시간이다. 벽·표류는 튕길 것이 없다.
   */
  private absorb(r: Outcome): boolean {
    if (r === 'wall' || r === 'drift' || r === 'win') return false;
    if (this.mods.shield <= 0 && this.invuln <= 0) return false;
    if (!this.pushOut(r, false)) return false;
    if (this.invuln <= 0) { this.mods.shield -= 1; this.absorbs += 1; }
    this.invuln = INVULN_STEPS;
    return true;
  }

  /** 부딪힌 것의 바깥으로 밀어내고 속도를 반사한다. far 면 블랙홀은 중력 범위 밖으로 */
  private pushOut(r: Outcome, far: boolean): boolean {
    const s = this.ship;
    if (r === 'shot') {
      // 맞은 총알(들)을 지운다
      const hit = 3 + SHIP_R;
      this.state.bullets = this.state.bullets.filter((b) => dist(b.x, b.y, s.x, s.y) >= hit);
    } else {
      // 부딪힌 것: 그 종류 중 판정 경계에 가장 가까운 것
      const tt = this.t;
      let cx = 0, cy = 0, hr = 0, best = Infinity;
      const see = (x: number, y: number, radius: number): void => {
        const d = dist(x, y, s.x, s.y) - radius;
        if (d < best) { best = d; cx = x; cy = y; hr = radius; }
      };
      if (r === 'planet') {
        for (const p of this.L.planets ?? []) { const [px, py] = bodyPos(p, tt); see(px, py, p.r + SHIP_R); }
        for (const d of this.L.docks ?? []) see(d.x, d.y, d.r + SHIP_R);
      } else if (r === 'hole') {
        for (const h of this.L.holes ?? []) see(h.x, h.y, far ? h.R + 4 : h.rH + 2);
      } else if (r === 'rock') {
        for (const a of this.L.rocks ?? []) see(a.x, a.y, a.r * 0.85 + SHIP_R);
      } else {
        for (const u of this.L.ufos ?? []) see(u.x, u.y, 13 + SHIP_R);
      }
      if (!Number.isFinite(best)) return false;
      let nx = s.x - cx, ny = s.y - cy;
      const len = Math.sqrt(nx * nx + ny * ny);
      if (len < 1e-9) { nx = -s.vx; ny = -s.vy; } else { nx /= len; ny /= len; }
      const nl = Math.sqrt(nx * nx + ny * ny);
      nx /= nl; ny /= nl;
      s.x = cx + nx * (hr + 1);
      s.y = cy + ny * (hr + 1);
      const vn = s.vx * nx + s.vy * ny;
      if (vn < 0) { s.vx -= 2 * vn * nx; s.vy -= 2 * vn * ny; }
    }
    return true;
  }

  /** 붙잡혀 도는 한 스텝. 중력은 받지 않고, 총알은 맞는다 */
  private orbitStep(): Outcome | '' {
    const o = this.docked!;
    o.ang += o.dir * DOCK_OMEGA * DT;
    placeOnOrbit(o, this.ship);
    this.t += DT;
    this.n += 1;
    this.dockedSteps += 1;
    if (this.invuln > 0) this.invuln -= 1;
    if (this.recordPath) this.path.push(this.ship.x, this.ship.y);
    fireUfos(this.L, this.state, this.ship, this.n * DT, this.mods.bulletScale);
    const rb = stepBullets(this.L, this.state, this.ship);
    return rb && this.absorb(rb) ? '' : rb;
  }

  /** 전체 비행. 결과 문자열을 반환한다. turns 는 정답·리플레이의 분사 기록 (§22.1). */
  simulate(
    L: Level, angleDeg: number, launchStep: number, G?: Grav[], turns?: Turn[], releases?: number[],
  ): Outcome {
    this.begin(L, angleDeg, launchStep, G, turns, releases);
    let r: Outcome | '' = '';
    while (!r) r = this.step();
    return r;
  }

  /**
   * 예측선 (§5.7). 현재 levelStep 에서 발사했다고 가정하고 stepShip 만
   * preview/DT 스텝 돌린다. 총알은 무시한다.
   * **실제 비행과 같은 함수**를 써야 한다 — "보이는 대로 날아간다"가 신뢰 기반이다.
   */
  predict(L: Level, angleDeg: number, launchStep: number, G?: Grav[]): Preview {
    const g = G ?? gravs(L);
    const a = angleDeg * Math.PI / 180;
    const s: ShipState = {
      x: L.start.x + PAD_R * Math.cos(a),
      y: L.start.y + PAD_R * Math.sin(a),
      vx: Math.cos(a) * L.speed,
      vy: Math.sin(a) * L.speed,
    };
    let t = launchStep * DT;
    const points: number[] = [];
    const max = Math.round(L.preview / DT);
    let outcome: Outcome | '' = '';
    for (let n = 0; n < max; n++) {
      outcome = stepShip(L, g, s, t);
      t += DT;
      points.push(s.x, s.y);
      if (outcome) break;
      // 궤도 행성에 닿으면 거기서 붙잡힌다 — 예측선도 거기서 끝낸다 (§22.4)
      if (dockAt(L, s.x, s.y, null)) break;
    }
    return { points, outcome };
  }

  /**
   * 궤도 행성에서 지금 나가면 어디로 가는가 (§22.4). 도는 동안 프레임마다 부른다.
   * 실제 비행과 같은 stepShip 이다. 나온 궤도 행성의 링은 무시하고, 다른 링에 닿으면 멈춘다.
   */
  predictRelease(L: Level, from: ShipState, t0: number, seconds: number, G?: Grav[]): Preview {
    const g = G ?? gravs(L);
    const s: ShipState = { ...from };
    let leaving = this.docked?.dock ?? null;
    let t = t0;
    const points: number[] = [];
    const max = Math.round(seconds / DT);
    let outcome: Outcome | '' = '';
    for (let n = 0; n < max; n++) {
      outcome = stepShip(L, g, s, t);
      t += DT;
      points.push(s.x, s.y);
      if (outcome) break;
      // 실제 비행(step)과 같은 규칙: 나온 링에서 충분히 멀어지면 다시 붙잡을 수 있다
      if (leaving && dist(leaving.x, leaving.y, s.x, s.y) > leaving.cr + DOCK_LEAVE) leaving = null;
      if (dockAt(L, s.x, s.y, leaving)) break;
    }
    return { points, outcome };
  }
}

/** 한 번만 쓰고 버리는 편의 함수. 반복 호출에는 Sim 인스턴스를 재사용한다. */
export function simulate(L: Level, angleDeg: number, launchStep: number): Outcome {
  return new Sim().simulate(L, angleDeg, launchStep);
}
