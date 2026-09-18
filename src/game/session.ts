// 한 단계 플레이 상태 머신. docs/PLAN.md §9.2
//
// DOM 을 쓰지 않는 순수 로직이다. 화면은 이 상태를 읽어 그리기만 한다.

import { DT } from '../core/constants.js';
import { padAngle } from '../core/angle.js';
import { Sim, launchPos } from '../core/simulate.js';
import type { Preview } from '../core/simulate.js';
import type { Level, Outcome } from '../core/types.js';
import { Clock } from './clock.js';

export type State = 'ready' | 'aiming' | 'flying' | 'ending';

export const END_SECONDS = 0.8;     // 폭발·도착 연출 길이 (§9.2)
export const TRAIL_SECONDS = 2.5;   // 궤적 표시 길이 (§12.3)
const TRAIL_EVERY = 8;              // 1/30초마다 기록 (240Hz / 30)

export class Session {
  level!: Level;
  sim = new Sim();
  state: State = 'ready';
  levelStep = 0;                    // 발사 전에도 흐른다 (§5.2)
  angle = 0;                        // θ — 서 있는 자리이자 이륙 방향
  outcome: Outcome | '' = '';
  attempts = 0;
  firstTry = true;
  aimFar = false;                   // 예측선 표시 여부 (§10.2)

  trail: number[] = [];
  prevTrail: number[] = [];

  private endElapsed = 0;
  private clock = new Clock();
  private previewSim = new Sim();   // 비행 중 우주선 상태를 덮어쓰지 않도록 분리

  setup(L: Level): void {
    this.level = L;
    this.angle = padAngle(L);       // 돔 중심에서 시작
    this.prevTrail = [];
    this.attempts = 0;
    this.firstTry = true;
    this.reset();
  }

  /** 단계 재시작. 두 시계 모두 0 으로 (§5.2). */
  reset(): void {
    this.levelStep = 0;
    this.outcome = '';
    this.state = 'ready';
    this.aimFar = false;
    if (this.trail.length) this.prevTrail = this.trail;
    this.trail = [];
    this.endElapsed = 0;
    this.clock.reset();
  }

  pauseReset(): void { this.clock.reset(); }

  /** 우주선 위치. 발사 전에는 돔 표면, 비행 중에는 시뮬레이션 위치. */
  shipPos(): [number, number] {
    if (this.state === 'flying' || this.state === 'ending') {
      return [this.sim.ship.x, this.sim.ship.y];
    }
    return launchPos(this.level, this.angle);
  }

  /** 우주선이 향하는 방향(라디안). 비행 중에는 속도 방향 (§12.3). */
  shipHeading(): number {
    if (this.state === 'flying' || this.state === 'ending') {
      const { vx, vy } = this.sim.ship;
      if (vx !== 0 || vy !== 0) return Math.atan2(vy, vx);
    }
    return this.angle * Math.PI / 180;
  }

  /** 화면이 공전 행성을 그릴 때 쓸 시각. 비행 중에는 시뮬레이션의 누산값. */
  simTime(): number {
    return this.state === 'flying' || this.state === 'ending'
      ? this.sim.time : this.levelStep * DT;
  }

  flightSeconds(): number { return this.sim.flightStep * DT; }
  endProgress(): number { return Math.min(this.endElapsed / END_SECONDS, 1); }

  setAngle(theta: number): void {
    if (this.state === 'ready' || this.state === 'aiming') this.angle = theta;
  }
  beginAim(): void { if (this.state === 'ready') this.state = 'aiming'; }
  cancelAim(): void { this.aimFar = false; if (this.state === 'aiming') this.state = 'ready'; }

  /** 발사는 스텝 경계에서. 손을 뗀 프레임의 levelStep 이 launchStep 이다 (§5.2). */
  launch(): void {
    if (this.state !== 'ready' && this.state !== 'aiming') return;
    this.aimFar = false;
    this.sim.recordPath = false;
    this.sim.begin(this.level, this.angle, this.levelStep);
    this.state = 'flying';
    this.attempts++;
    this.firstTry = false;
    this.trail = [];
  }

  /** 한 프레임. 고정 스텝 누산기가 스텝 수를 정한다 (§5.8). */
  advance(delta: number): void {
    if (this.state === 'ending') { this.endElapsed += delta; return; }
    const n = this.clock.steps(delta);
    for (let i = 0; i < n; i++) {
      if (this.step()) break;              // 결과가 나오면 남은 스텝을 버린다
    }
  }

  /** 한 스텝. 결과가 나와 ending 으로 넘어갔으면 true. */
  private step(): boolean {
    this.levelStep++;                      // 발사 전에도 흐른다 (§5.2)
    if (this.state !== 'flying') return false;
    const r = this.sim.step();
    if (r) {
      this.outcome = r;
      this.state = 'ending';
      this.endElapsed = 0;
      return true;
    }
    if (this.sim.flightStep % TRAIL_EVERY === 0) {
      this.trail.push(this.sim.ship.x, this.sim.ship.y);
      const keep = Math.round(TRAIL_SECONDS * 30) * 2;
      if (this.trail.length > keep) this.trail = this.trail.slice(-keep);
    }
    return false;
  }

  /** 예측선 (§5.7). 조준 중 프레임당 1회만 부른다 (§18). */
  preview(): Preview {
    return this.previewSim.predict(this.level, this.angle, this.levelStep);
  }
}
