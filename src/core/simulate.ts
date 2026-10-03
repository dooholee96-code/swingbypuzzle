// 비행 진행과 예측선. docs/PLAN.md §5.4, §5.7, §5.9
//
// 게임(한 프레임에 몇 스텝씩)과 검증기(끝까지 한 번에)가 **같은 스테퍼**를 쓴다.
// 스테핑을 두 벌 두면 검증기가 통과시킨 단계가 게임에서 다르게 날아갈 수 있다(§0.3).
//
// 시각 t 는 launchStep * DT 에서 시작해 **누산**한다. levelStep * DT 로 다시
// 계산하면 배정밀도 결과가 미세하게 갈린다. 부록 A 와 같은 방식이다.

import { DT, MAX_FLIGHT, PAD_R, TURN_MAX } from './constants.js';
import { fireUfos, stepBullets } from './hazards.js';
import { gravs, stepShip } from './physics.js';
import type { Grav, Level, Outcome, ShipState, SimState, Turn } from './types.js';

/**
 * 분사 (§22.1). 속력은 두고 진행 방향만 dir 쪽으로 돌린다. 차이가 TURN_MAX 를 넘으면
 * TURN_MAX 만큼만. 게임·검증기·리플레이가 모두 이 함수 하나를 쓴다.
 */
export function applyTurn(s: ShipState, dirDeg: number): void {
  const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  if (speed === 0) return;
  const cur = Math.atan2(s.vy, s.vx) * 180 / Math.PI;
  let d = dirDeg - cur;
  d -= 360 * Math.round(d / 360);                    // (−180, 180]
  if (d > TURN_MAX) d = TURN_MAX;
  else if (d < -TURN_MAX) d = -TURN_MAX;
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

  private L!: Level;
  private G: Grav[] = [];
  private queued: number | null = null;
  private plan: Turn[] = [];
  private planAt = 0;
  private t = 0;
  private n = 0;
  private maxN = 0;

  /** 비행 시계(스텝). 30초 제한과 외계인 사격 타이밍의 기준 (§5.2). */
  get flightStep(): number { return this.n; }

  /** 진행 중인 비행의 현재 시각. 화면이 공전 행성을 같은 자리에 그리려면 이걸 쓴다. */
  get time(): number { return this.t; }

  /** 발사 준비. 이후 step() 을 반복 호출한다. */
  begin(L: Level, angleDeg: number, launchStep: number, G?: Grav[]): void {
    this.L = L;
    this.G = G ?? gravs(L);
    this.state = { bullets: [], nextFire: (L.ufos ?? []).map((u) => u.delay) };
    this.path.length = 0;
    this.turns = [];
    this.queued = null;
    this.plan = [];
    this.planAt = 0;

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
    this.maxN = MAX_FLIGHT / DT;        // 배정밀도에서 정확히 7200
  }

  /**
   * 다음 스텝을 밟기 직전에 꺾는다 (§22.1). 화면의 탭이 프레임 중간에 와도
   * 스텝 경계에서만 적용되므로, 기록(step, dir)으로 똑같이 되풀이된다.
   */
  queueTurn(dirDeg: number): void { this.queued = dirDeg; }

  /** 아직 적용 안 된 분사가 있는가 — 한 스텝 안에 두 번 탭해도 한 번만 쓰게 */
  get turnPending(): boolean { return this.queued !== null; }

  /** 한 스텝. '' = 계속. */
  step(): Outcome | '' {
    if (this.n >= this.maxN) return 'drift';
    while (this.planAt < this.plan.length && this.plan[this.planAt]!.step === this.n) {
      this.queued = this.plan[this.planAt++]!.dir;
    }
    if (this.queued !== null) {
      applyTurn(this.ship, this.queued);
      this.turns.push({ step: this.n, dir: this.queued });
      this.queued = null;
    }
    const r = stepShip(this.L, this.G, this.ship, this.t);
    this.t += DT;
    this.n += 1;
    if (this.recordPath) this.path.push(this.ship.x, this.ship.y);
    if (r) return r;
    fireUfos(this.L, this.state, this.ship, this.n * DT);
    const rb = stepBullets(this.L, this.state, this.ship);
    if (rb) return rb;
    if (this.n >= this.maxN) return 'drift';
    return '';
  }

  /** 전체 비행. 결과 문자열을 반환한다. turns 는 정답·리플레이의 분사 기록 (§22.1). */
  simulate(L: Level, angleDeg: number, launchStep: number, G?: Grav[], turns?: Turn[]): Outcome {
    this.begin(L, angleDeg, launchStep, G);
    if (turns?.length) this.plan = [...turns].sort((a, b) => a.step - b.step);
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
    }
    return { points, outcome };
  }
}

/** 한 번만 쓰고 버리는 편의 함수. 반복 호출에는 Sim 인스턴스를 재사용한다. */
export function simulate(L: Level, angleDeg: number, launchStep: number): Outcome {
  return new Sim().simulate(L, angleDeg, launchStep);
}
