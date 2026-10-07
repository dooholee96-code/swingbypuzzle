// 보스전 (§22.6). 인피니티에서 2분마다 — 그동안은 1945 같은 세로 슈팅이다.
//
// 스윙바이 물리(§5)와는 **별개의 작은 시뮬레이션**이다. 고정 스텝 DT 로 돌고, 입력은
// "우주선이 가려는 자리"(드래그 목표) 하나를 스텝 경계에서 읽는다. 같은 시드·같은 입력
// 기록이면 같은 결과다(§5.8). 좌표는 아레나 안쪽(0..W, 0..H)이고 월드 어디에 놓을지는
// 세션이 정한다. 스테이지·검증기·리플레이에는 보스가 없다.
//
// DOM·브라우저 API 를 import 하지 않는다 (§0.3).

import { DT, SHIP_R } from './constants.js';
import { mulberry32 } from './rng.js';

export const ARENA_W = 400;
export const ARENA_H = 600;
/** 보스가 나오는 간격(버틴 초). 1분 전부터 경보 */
export const BOSS_EVERY = 120;
export const BOSS_WARN = 60;
/** 보스전에서의 목숨 (사용자 결정). 방패 패시브가 있으면 +1 */
export const BOSS_LIVES = 3;
/** 우주선이 목표 자리로 가는 최대 속력(u/s) */
export const SHIP_SPEED = 560;
/** 당근탄: 초당 8발, 위로 */
export const CARROT_EVERY = 30;
export const CARROT_SPEED = 880;
/** 보스 몸통(타원 반지름)과 탄 반지름 */
export const BOSS_RX = 48, BOSS_RY = 18;
export const SHOT_R = 3;
/** 맞은 뒤 무적(스텝). 1.5초 */
export const BOSS_INVULN = 360;
/** 보스가 내려오는 시간, 터지는 시간(초) */
export const ENTER_T = 2.0, DIE_T = 1.2;

export type BossPhase = 'enter' | 'fight' | 'dying' | 'done' | 'lost';

export interface Shot { x: number; y: number; vx: number; vy: number }
export interface Carrot { x: number; y: number }
/** 연출용: 맞은 자리의 불꽃. 그리는 쪽이 age 로 사그라뜨린다 */
export interface Spark { x: number; y: number; age: number }

/** 회차별 체력. 당근탄을 다 맞히면 1회차는 14초, 보스가 흔들려 실제로는 20초쯤 */
export function bossHp(round: number): number {
  return 110 + 50 * (round - 1);
}

export class BossSim {
  readonly round: number;
  readonly hpMax: number;
  hp: number;
  phase: BossPhase = 'enter';
  /** 보스전 시작부터 흐른 스텝·초 */
  n = 0;
  t = 0;
  x = ARENA_W / 2;
  y = -BOSS_RY - 10;
  ship = { x: ARENA_W / 2, y: ARENA_H - 90 };
  lives: number;
  invuln = 0;
  carrots: Carrot[] = [];
  shots: Shot[] = [];
  sparks: Spark[] = [];
  /** 맞은 순간 흰색으로 번쩍일 스텝 */
  flash = 0;
  /** 이번 보스전에서 맞은 횟수와 쏜 당근 — 소리·연출이 순간을 알아챈다 */
  hitsTaken = 0;
  fired = 0;
  private readonly rnd: () => number;
  private readonly wob: number;
  private fanAt: number;
  private aimAt: number;
  private ringAt: number;
  private dieT = 0;

  constructor(readonly seed: number, round: number, lives = BOSS_LIVES) {
    this.round = Math.max(1, round);
    this.hpMax = bossHp(this.round);
    this.hp = this.hpMax;
    this.lives = lives;
    this.rnd = mulberry32(seed | 0);
    this.wob = this.rnd() * Math.PI * 2;
    // 첫 사격 시각을 시드로 흩어 놓는다 — 같은 날은 같은 보스
    this.fanAt = 0.6 + this.rnd() * 0.6;
    this.aimAt = 1.2 + this.rnd() * 0.8;
    this.ringAt = 2.0 + this.rnd() * 1.0;
  }

  /** 아직 싸우는 중인가 (입력을 받는다) */
  get active(): boolean { return this.phase === 'enter' || this.phase === 'fight'; }

  /** 체력이 반 아래면 더 자주 쏜다 */
  private get rage(): number { return this.hp * 2 < this.hpMax ? 0.75 : 1; }

  /**
   * 한 스텝. (tx, ty) 는 우주선이 가려는 자리(아레나 좌표). 결과는 지금 단계.
   */
  step(tx: number, ty: number): BossPhase {
    if (this.phase === 'done' || this.phase === 'lost') return this.phase;
    this.n += 1;
    this.t = this.n * DT;
    if (this.invuln > 0) this.invuln -= 1;
    if (this.flash > 0) this.flash -= 1;
    for (const s of this.sparks) s.age += DT;
    if (this.sparks.length && this.sparks[0]!.age > 0.4) this.sparks = this.sparks.filter((s) => s.age <= 0.4);

    // 우주선: 목표로 최대 속력만큼. 아레나 안에서만
    const cx = Math.max(16, Math.min(ARENA_W - 16, tx));
    const cy = Math.max(60, Math.min(ARENA_H - 16, ty));
    const dx = cx - this.ship.x, dy = cy - this.ship.y;
    const d = Math.sqrt(dx * dx + dy * dy), mx = SHIP_SPEED * DT;
    if (d <= mx) { this.ship.x = cx; this.ship.y = cy; }
    else { this.ship.x += dx / d * mx; this.ship.y += dy / d * mx; }

    if (this.phase === 'dying') {
      this.dieT += DT;
      if (this.dieT >= DIE_T) this.phase = 'done';
      return this.phase;
    }

    // 보스 자리: 내려온 뒤 좌우로 흔들린다. 회차가 오를수록 크게
    const amp = Math.min(150, 110 + 20 * (this.round - 1));
    if (this.phase === 'enter') {
      const u = Math.min(1, this.t / ENTER_T);
      this.y = -BOSS_RY - 10 + (90 + BOSS_RY + 10) * (1 - (1 - u) * (1 - u));
      if (u >= 1) this.phase = 'fight';
    } else {
      const w = this.t - ENTER_T;
      this.x = ARENA_W / 2 + amp * Math.sin(w * (2 * Math.PI / 5.5) + this.wob);
      this.y = 90 + 12 * Math.sin(w * (2 * Math.PI / 2.1));
    }

    // 당근탄: 자동 연사. 싸울 때만 맞는다
    if (this.n % CARROT_EVERY === 0) {
      this.carrots.push({ x: this.ship.x, y: this.ship.y - 12 });
      this.fired += 1;
    }
    const alive: Carrot[] = [];
    for (const c of this.carrots) {
      c.y -= CARROT_SPEED * DT;
      if (c.y < -10) continue;
      if (this.phase === 'fight' && this.hitsBoss(c.x, c.y, 0)) {
        this.hp -= 1;
        this.flash = 3;
        this.sparks.push({ x: c.x, y: c.y, age: 0 });
        if (this.hp <= 0) {
          this.phase = 'dying';
          this.shots = [];
          this.carrots = [];
          this.dieT = 0;
          return this.phase;
        }
        continue;
      }
      alive.push(c);
    }
    this.carrots = alive;

    // 보스의 사격 (싸울 때만)
    if (this.phase === 'fight') this.fire();

    // 탄과 몸통에 맞는다
    const keep: Shot[] = [];
    for (const s of this.shots) {
      s.x += s.vx * DT; s.y += s.vy * DT;
      if (s.x < -20 || s.x > ARENA_W + 20 || s.y < -20 || s.y > ARENA_H + 20) continue;
      keep.push(s);
    }
    this.shots = keep;
    if (this.invuln === 0) {
      let hit = this.phase === 'fight' && this.hitsBoss(this.ship.x, this.ship.y, SHIP_R);
      if (!hit) {
        for (const s of this.shots) {
          const ex = s.x - this.ship.x, ey = s.y - this.ship.y;
          if (ex * ex + ey * ey < (SHOT_R + SHIP_R) * (SHOT_R + SHIP_R)) { hit = true; break; }
        }
      }
      if (hit) this.hurt();
    }
    return this.phase;
  }

  /**
   * 이어하기 (§14.7). 진 자리에서 목숨을 채우고 싸움을 잇는다. 체력은 깎인 대로.
   * 화면의 탄은 모두 지우고 무적은 평소의 두 배 — 돌아오자마자 맞지 않게
   */
  revive(lives: number): boolean {
    if (this.phase !== 'lost' || lives <= 0) return false;
    this.lives = lives;
    this.phase = 'fight';
    this.shots = [];
    this.invuln = BOSS_INVULN * 2;
    return true;
  }

  /** (x, y) 가 보스 몸통(타원) 안인가. pad 만큼 넉넉히 */
  private hitsBoss(x: number, y: number, pad: number): boolean {
    const ex = (x - this.x) / (BOSS_RX + pad), ey = (y - this.y) / (BOSS_RY + pad);
    return ex * ex + ey * ey <= 1;
  }

  private hurt(): void {
    this.lives -= 1;
    this.hitsTaken += 1;
    this.invuln = BOSS_INVULN;
    // 맞은 직후 둘레의 탄은 지운다 — 연달아 맞지 않게
    const sx = this.ship.x, sy = this.ship.y;
    this.shots = this.shots.filter((s) => (s.x - sx) ** 2 + (s.y - sy) ** 2 > 70 * 70);
    if (this.lives <= 0) this.phase = 'lost';
  }

  /** 패턴: 부채꼴(매 회차), 조준탄(2회차부터), 고리(3회차부터). 체력이 반 아래면 ×0.75 간격 */
  private fire(): void {
    const w = this.t - ENTER_T;
    const k = this.rage;
    if (w >= this.fanAt) {
      this.fanAt += 1.6 * k;
      const count = Math.min(7, 3 + 2 * (this.round - 1));
      const spread = 70 * Math.PI / 180, speed = 170 + 10 * this.round;
      for (let i = 0; i < count; i++) {
        const a = Math.PI / 2 + (count === 1 ? 0 : -spread / 2 + spread * i / (count - 1));
        this.shots.push({ x: this.x, y: this.y + BOSS_RY, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed });
      }
    }
    if (this.round >= 2 && w >= this.aimAt) {
      this.aimAt += 2.4 * k;
      const dx = this.ship.x - this.x, dy = this.ship.y - this.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const speed = 230;
      this.shots.push({ x: this.x, y: this.y + BOSS_RY, vx: dx / d * speed, vy: dy / d * speed });
    }
    if (this.round >= 3 && w >= this.ringAt) {
      this.ringAt += 3.2 * k;
      const off = this.rnd() * Math.PI * 2;
      for (let i = 0; i < 8; i++) {
        const a = off + i * Math.PI / 4;
        this.shots.push({ x: this.x, y: this.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150 });
      }
    }
  }
}
