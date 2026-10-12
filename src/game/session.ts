// 한 단계 플레이 상태 머신. docs/PLAN.md §9.2
//
// DOM 을 쓰지 않는 순수 로직이다. 화면은 이 상태를 읽어 그리기만 한다.

import { DT } from '../core/constants.js';
import { padAngle } from '../core/angle.js';
import { ARENA_H, ARENA_W, BOSS_EVERY, BOSS_LIVES, BOSS_WARN, BossSim } from '../core/boss.js';
import { SHIP_R } from '../core/constants.js';
import { CLEAR_AT } from '../tools-shared/infinity.js';
import { defaultMods } from '../core/mods.js';
import { Sim, launchPos } from '../core/simulate.js';
import type { Preview } from '../core/simulate.js';
import type { Level, Outcome, ShipState } from '../core/types.js';
import type { InfinityWorld } from '../tools-shared/infinity.js';
import { COLLECT_R } from '../tools-shared/messier.js';
import { bodyPos, dist } from '../core/physics.js';
import {
  CARROT_XP, GRAZE_BAND, GRAZE_BOOST_EVERY, GRAZE_HOLE_BAND, GRAZE_HOLE_XP, GRAZE_WINDOW, GRAZE_XP,
  type OfferKind, type PerkLevels, type PerkValues, WARP_BOOST, WARP_XP, comboMult, noPerks, offerPerks,
  perkValues, raise, threatOf, xpForLevel,
} from '../tools-shared/perks.js';

/** 위성 당근(§22.8)이 도는 반지름·각속도(rad/s)·막는 반경 */
export const SAT_R = 22, SAT_OMEGA = 3.2, SAT_HIT = 6;
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
  /** 남은 분사 (§22.1). 단계의 turns + bonusTurns */
  turnsLeft = 0;
  /** 시험용: 분사가 없는 단계에서도 써 볼 수 있게 더 준다 (main.ts 의 숨은 옵션 ?turns=N) */
  bonusTurns = 0;
  /** 인피니티(§22.3)면 그 우주. 스테이지에서는 null */
  world: InfinityWorld | null = null;
  /** 이번 판에 먹은 당근 수. 경험치이자(§22.5) 화면이 바뀐 순간을 알아채는 수 */
  itemsEaten = 0;
  /** 인피니티의 패시브 (§22.5). 스테이지에서는 비어 있다 */
  perks: PerkLevels = noPerks();
  values: PerkValues = perkValues(this.perks);
  /** 인피니티의 레벨(경험치). 단계 객체 `level` 과 다르다 */
  xpLevel = 1;
  /** 아직 고르지 않은 레벨업 수. 0 이 아니면 advance() 가 멈춘다 — 카드를 고를 때까지 */
  pendingLevels = 0;
  /** 지금 레벨업에서 카드를 다시 뽑은 횟수 (§14.7). 고르면 0 으로 */
  rerolls = 0;
  /** 이번 판에 이어하기를 썼는가 (§14.7). 판마다 한 번 */
  revived = false;
  private rechargeAcc = 0;
  // ── 방송판 (§22.8) ──
  /** 스침: 이번 판 횟수, 지금 콤보, 최대 콤보, 스침으로 번 경험치(초 단위) */
  grazes = 0;
  combo = 0;
  maxCombo = 0;
  grazeXp = 0;
  /** 마지막 스침 뒤 흐른 스텝. GRAZE_WINDOW 를 넘으면 콤보가 끊긴다 */
  private grazeIdle = 0;
  /** 지금 스침 띠 안에 있는 것들 — 하나에 한 번만 센다 */
  private grazing = new Set<object>();
  /** 이번 프레임의 스침 자리. 화면이 꺼내 간다(반짝임·소리) */
  grazeFx: [number, number][] = [];
  /** 블랙홀 서핑·위성이 막은 탄·부순 소행성 — 화면 되먹임용 */
  warps = 0; blocked = 0; smashed = 0;
  warpFx: [number, number] | null = null;
  /** 반중력이 끝나는 비행 스텝 (§22.8). 0 이면 꺼짐 */
  antigravUntil = 0;
  /** 15분 최종 보스를 이겼다 (§22.8) */
  cleared = false;
  // ── 보스전 (§22.6) ──
  /** fly 는 중력 비행, boss 는 슈팅 구간. 인피니티에서만 boss 가 된다 */
  mode: 'fly' | 'boss' = 'fly';
  boss: BossSim | null = null;
  /** 지금까지 치른 보스전 수 */
  bossIndex = 0;
  /** 보스전에서 보낸 스텝. 점수(버틴 시간)에 든다 */
  bossSteps = 0;
  /** 아레나의 월드 원점. 그리기·입력이 아레나 좌표를 월드로 옮긴다 */
  bossOrigin: [number, number] = [0, 0];
  private bossTarget: [number, number] = [ARENA_W / 2, ARENA_H - 90];
  private bossReturn: ShipState | null = null;
  // ── 메시에 천체 (§22.7) ──
  /** 이번 프레임에 스친 천체 번호. 화면이 꺼내 간다(저장·토스트) */
  found: number[] = [];
  /** 스테이지의 천체를 이미 모았는가(도감에 있거나 이번 방문에 스쳤다). 참이면 그리지 않는다 */
  messierDone = false;

  trail: number[] = [];
  prevTrail: number[] = [];

  private endElapsed = 0;
  private clock = new Clock();
  private previewSim = new Sim();   // 비행 중 우주선 상태를 덮어쓰지 않도록 분리

  /** 인피니티 한 판을 시작한다. 스테이지로 돌아갈 때는 setup() 이 world 를 비운다 */
  setupInfinity(world: InfinityWorld): void {
    this.setup(world.level);
    this.world = world;
    this.sim.endless = true;
    this.itemsEaten = 0;
    this.perks = noPerks();
    this.xpLevel = 1;
    this.pendingLevels = 0;
    this.rerolls = 0;
    this.revived = false;
    this.rechargeAcc = 0;
    this.grazes = 0; this.combo = 0; this.maxCombo = 0; this.grazeXp = 0; this.grazeIdle = 0;
    this.grazing = new Set(); this.grazeFx = [];
    this.warps = 0; this.blocked = 0; this.smashed = 0; this.warpFx = null;
    this.antigravUntil = 0;
    this.cleared = false;
    this.applyPerks();
    this.turnsLeft = this.maxTurns;
  }

  /** 콤보가 끊기기까지 남은 비율 0~1 (§22.8 HUD) */
  grazeLeft(): number { return 1 - this.grazeIdle / (GRAZE_WINDOW * 240); }

  /** 반중력(§22.8)이 켜져 있는가 */
  get antigrav(): boolean { return this.antigravUntil > this.sim.flightStep; }

  /** 위성 당근의 자리들 (§22.8). 비행 시각으로 돈다 — 그리기와 판정이 같은 식 */
  satellites(): [number, number][] {
    const n = this.values.satellites;
    if (n <= 0 || !this.world) return [];
    const { x, y } = this.sim.ship;
    const base = this.sim.time * SAT_OMEGA;
    const out: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const q = base + i * Math.PI * 2 / n;
      out.push([x + Math.cos(q) * SAT_R, y + Math.sin(q) * SAT_R]);
    }
    return out;
  }

  /**
   * 스침 판정 (§22.8). 판정 경계 밖 좁은 띠를 지나면 한 물체에 한 번. 콤보가 오르고
   * 경험치가 붙는다. 다섯 번마다 분사 하나. GRAZE_WINDOW 동안 없으면 콤보가 끊긴다
   */
  private graze(): void {
    const L = this.level, s = this.sim.ship, t = this.sim.time;
    const seen = new Set<object>();
    const check = (o: object, x: number, y: number, hitR: number, band: number, xp: number): void => {
      const d = dist(x, y, s.x, s.y);
      if (d >= hitR + band + 4) return;
      seen.add(o);
      if (this.grazing.has(o) || d < hitR) return;
      this.grazing.add(o);
      this.grazes++;
      this.grazeXp += xp * comboMult(this.combo);
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.grazeIdle = 0;
      this.grazeFx.push([x + (s.x - x) / d * hitR, y + (s.y - y) / d * hitR]);
      if (this.grazes % GRAZE_BOOST_EVERY === 0) this.turnsLeft = Math.min(this.maxTurns, this.turnsLeft + 1);
    };
    for (const p of L.planets ?? []) {
      const [px, py] = bodyPos(p, t);
      check(p, px, py, p.r + SHIP_R, GRAZE_BAND, GRAZE_XP);
    }
    for (const a of L.rocks ?? []) check(a, a.x, a.y, a.r * 0.85 + SHIP_R, GRAZE_BAND, GRAZE_XP);
    for (const h of L.holes ?? []) check(h, h.x, h.y, h.rH + 2, GRAZE_HOLE_BAND, GRAZE_HOLE_XP);
    for (const u of L.ufos ?? []) check(u, u.x, u.y, 13 + SHIP_R, GRAZE_BAND, GRAZE_XP);
    for (const b of this.sim.state.bullets) check(b, b.x, b.y, 3 + SHIP_R, GRAZE_BAND, GRAZE_XP);
    for (const o of this.grazing) if (!seen.has(o)) this.grazing.delete(o);
    if (this.combo > 0 && ++this.grazeIdle > GRAZE_WINDOW * 240) this.combo = 0;
  }

  /** 위성 당근 (§22.8): 닿은 탄을 지우고, 폭풍이면 소행성을 부순다 */
  private satellitesStep(): void {
    const sats = this.satellites();
    if (!sats.length) return;
    const st = this.sim.state;
    const before = st.bullets.length;
    if (before) {
      st.bullets = st.bullets.filter((b) => !sats.some(([x, y]) => dist(x, y, b.x, b.y) < SAT_HIT + 3));
      this.blocked += before - st.bullets.length;
    }
    if (this.values.storm && this.world) {
      const hit = (this.level.rocks ?? []).filter((q) => sats.some(([x, y]) => dist(x, y, q.x, q.y) < SAT_HIT + q.r * 0.85));
      if (hit.length) {
        for (const q of hit) this.world.breakRock(q);
        this.smashed += hit.length;
        this.sim.refreshBodies();
      }
    }
  }

  /** 이어하기를 권할 수 있는가 — 인피니티의 끝이고 아직 안 썼다 (§14.7) */
  get canRevive(): boolean {
    return !!this.world && this.state === 'ending' && !this.revived;
  }

  /**
   * 이어하기 (§14.7). 끝난 자리에서 다시 난다 — 분사 가득, 방패 하나(없으면), 무적.
   * 보스전에서 졌으면 목숨을 채워 싸움을 잇는다. 점수(버틴 시간)는 이어서 센다.
   */
  revive(): boolean {
    if (!this.canRevive) return false;
    // 이어하기는 방패 하나를 준다 — 보스전 목숨(startBoss 와 같은 규칙: 방패가 있으면 +1)도 그 뒤에 센다
    const shield = Math.max(1, this.perks.shield);
    if (this.mode === 'boss') {
      if (!this.boss?.revive(BOSS_LIVES + 1)) return false;
    } else if (!this.sim.revive()) return false;
    this.revived = true;
    this.outcome = '';
    this.state = 'flying';
    this.endElapsed = 0;
    this.turnsLeft = this.maxTurns;
    this.perks.shield = shield;
    this.sim.mods.shield = this.perks.shield;
    this.clock.reset();
    return true;
  }

  /** 카드를 다시 뽑는다 (§14.7). 다음 offers() 가 다른 셋을 돌려준다 */
  reroll(): void {
    if (this.pendingLevels > 0) this.rerolls++;
  }

  // ── 보스전 (§22.6) ───────────────────────────────────────────────
  /** 다음 보스까지 남은 초. 경보 구간(BOSS_WARN) 밖이거나 보스전 중이면 null */
  get bossCountdown(): number | null {
    if (!this.world || this.mode !== 'fly' || this.state !== 'flying') return null;
    const left = BOSS_EVERY * (this.bossIndex + 1) - this.freeSeconds();
    return left <= BOSS_WARN ? Math.max(0, left) : null;
  }

  /** 우주선이 가려는 자리(아레나 좌표). 드래그가 프레임마다 넣는다 */
  bossAim(tx: number, ty: number): void { this.bossTarget = [tx, ty]; }
  /** 키보드: 지금 자리에서 이만큼 옆으로 */
  bossNudge(dx: number, dy: number): void {
    if (!this.boss) return;
    this.bossTarget = [this.boss.ship.x + dx, this.boss.ship.y + dy];
  }

  /**
   * 보스전 시작. 우주선이 있던 자리가 아레나의 출발 자리(가운데 아래)가 되도록 원점을 잡는다.
   * 중력 비행의 상태는 그대로 얼려 두고(Sim 은 돌지 않는다) 끝나면 되돌린다.
   */
  startBoss(final = false): void {
    if (!this.world || this.mode === 'boss') return;
    const s = this.sim.ship;
    this.bossReturn = { ...s };
    this.bossOrigin = [Math.round(s.x - ARENA_W / 2), Math.round(s.y - (ARENA_H - 90))];
    const seed = (this.world.seed ^ Math.imul(this.bossIndex + 1, 0x85ebca6b)) | 0;
    this.boss = new BossSim(seed, this.bossIndex + 1, BOSS_LIVES + (this.perks.shield > 0 ? 1 : 0), final);
    this.bossTarget = [ARENA_W / 2, ARENA_H - 90];
    this.mode = 'boss';
  }

  /** 보상(카드 한 장 + 분사 보충)과 복귀. 돌아온 직후 1초는 부딪혀도 튕긴다 */
  private endBoss(): void {
    this.mode = 'fly';
    this.boss = null;
    this.bossIndex++;
    if (this.bossReturn) Object.assign(this.sim.ship, this.bossReturn);
    this.sim.invuln = 240;
    this.turnsLeft = this.maxTurns;
    this.pendingLevels++;
    this.clock.reset();
  }

  private bossStep(): boolean {
    const b = this.boss!;
    const ph = b.step(this.bossTarget[0], this.bossTarget[1]);
    this.bossSteps++;
    if (ph === 'lost') {
      this.outcome = 'boss';
      this.state = 'ending';
      this.endElapsed = 0;
      return true;
    }
    if (ph === 'done') {
      // 최종 보스(§22.8)를 꺾으면 판이 끝난다 — 클리어
      if (b.final) {
        this.cleared = true;
        this.outcome = 'win';
        this.state = 'ending';
        this.endElapsed = 0;
        return true;
      }
      this.endBoss(); return true;
    }
    return this.checkLevel();
  }

  /** 스친 메시에 천체를 found 에 쌓는다. 인피니티는 당근 하나만큼 경험치도 준다 */
  private collectMessier(): void {
    const { x, y } = this.sim.ship;
    if (this.world) {
      const got = this.world.collect(x, y);
      if (got.length) { this.found.push(...got); this.itemsEaten += got.length; }
      return;
    }
    const m = this.level.messier;
    if (m && !this.messierDone && dist(m.x, m.y, x, y) < COLLECT_R) {
      this.messierDone = true;
      this.found.push(m.n);
    }
  }

  /** 경험치 문턱을 넘었으면 레벨을 올리고 이번 프레임을 멈춘다 */
  private checkLevel(): boolean {
    const xp = this.xp;
    while (xp >= xpForLevel(this.xpLevel + 1)) { this.xpLevel++; this.pendingLevels++; }
    return this.pendingLevels > 0;
  }

  setup(L: Level): void {
    this.world = null;
    this.mode = 'fly';
    this.boss = null;
    this.bossIndex = 0;
    this.bossSteps = 0;
    this.sim.endless = false;
    this.sim.mods = defaultMods();         // 스테이지는 보정값 없이 (§22.5)
    this.found = [];
    this.messierDone = false;
    this.perks = noPerks();
    this.values = perkValues(this.perks);
    this.pendingLevels = 0;
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
    this.turnsLeft = this.maxTurns;
  }

  /** 분사 최대. 인피니티는 패시브(§22.5)가 올린다 */
  get maxTurns(): number {
    return (this.world ? this.values.maxTurns : (this.level.turns ?? 0)) + this.bonusTurns;
  }

  /** HUD 의 칸 수 */
  get turnSlots(): number { return this.maxTurns; }

  // ── 경험치·레벨업 (§22.5) ─────────────────────────────────────────
  /** 경험치 = 버틴 초 + 당근 × CARROT_XP. 스테이지는 0 */
  get xp(): number { return this.world ? this.freeSeconds() + this.itemsEaten * CARROT_XP + this.grazeXp : 0; }
  get xpPrev(): number { return xpForLevel(this.xpLevel); }
  get xpNext(): number { return xpForLevel(this.xpLevel + 1); }
  get levelUpPending(): boolean { return this.pendingLevels > 0; }

  /** 지금 레벨업의 카드 셋. 판 시드와 레벨로 정해진다 */
  offers(): OfferKind[] {
    return this.world ? offerPerks(this.world.seed, this.xpLevel, this.perks, this.rerolls) : [];
  }

  /** 카드를 고른다. 패시브를 올리고 물리 보정값에 반영한다 */
  pick(kind: OfferKind): void {
    if (!this.world || this.pendingLevels <= 0) return;
    this.pendingLevels--;
    this.rerolls = 0;
    // 레벨업은 분사 하나를 채운다 (사용자 결정 2026-10). 카드 효과는 그 위에
    this.turnsLeft = Math.min(this.maxTurns, this.turnsLeft + 1);
    if (kind === 'refill') { this.turnsLeft = this.maxTurns; }
    else {
      this.perks = raise(kind, this.perks);
      this.applyPerks();
      if (kind === 'boost') this.turnsLeft = Math.min(this.maxTurns, this.turnsLeft + 1);
      if (kind === 'storm' && this.values.storm) this.sim.refreshBodies();
      if (kind === 'dockwide') { this.world.setDockScale(this.values.dockScale); this.sim.refreshBodies(); }
    }
    this.clock.reset();                    // 멈춘 동안 쌓인 시간을 버린다
  }

  private applyPerks(): void {
    this.values = perkValues(this.perks);
    this.sim.mods.turnMax = this.values.turnMax;
    this.sim.mods.bulletScale = this.values.bulletScale;
    this.sim.mods.shield = this.perks.shield;
    this.sim.mods.holePass = this.values.warp > 0;
  }

  /**
   * 분사 (§22.1). 비행 중이고 남아 있으면 다음 스텝 경계에서 dirDeg 쪽으로 꺾는다.
   * 썼으면 true. 한 스텝 안의 두 번째 탭은 버린다(횟수만 줄고 효과가 없으면 억울하다).
   */
  /** 궤도 행성에 붙잡혀 도는 중인가 (§22.4) */
  get docked(): boolean { return this.state === 'flying' && this.sim.docked !== null; }

  /** 궤도 행성에서 다음 스텝 경계에 나간다 (§22.4). 분사를 쓰지 않는다. 나갔으면 true */
  release(): boolean {
    if (!this.docked || this.sim.releasePending) return false;
    this.sim.queueRelease();
    return true;
  }

  /**
   * 붙잡혀 돈 시간을 뺀 비행 시간. 인피니티의 점수다(§22.3) — 빼지 않으면 링에서
   * 쉬기만 해도 점수가 오른다.
   */
  freeSeconds(): number { return (this.sim.flightStep - this.sim.dockedSteps + this.bossSteps) * DT; }

  turn(dirDeg: number): boolean {
    if (this.state !== 'flying' || this.turnsLeft <= 0 || this.sim.turnPending) return false;
    this.sim.queueTurn(dirDeg);
    if (this.world && this.values.antigravSec > 0) {
      this.antigravUntil = this.sim.flightStep + Math.round(this.values.antigravSec * 240);
    }
    this.turnsLeft--;
    return true;
  }

  pauseReset(): void { this.clock.reset(); }

  /** 우주선 위치. 발사 전에는 돔 표면, 비행 중에는 시뮬레이션 위치. */
  shipPos(): [number, number] {
    if (this.boss) return [this.bossOrigin[0] + this.boss.ship.x, this.bossOrigin[1] + this.boss.ship.y];
    if (this.state === 'flying' || this.state === 'ending') {
      return [this.sim.ship.x, this.sim.ship.y];
    }
    return launchPos(this.level, this.angle);
  }

  /** 우주선이 향하는 방향(라디안). 비행 중에는 속도 방향 (§12.3). 보스전에서는 위 */
  shipHeading(): number {
    if (this.boss) return -Math.PI / 2;
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
    if (this.pendingLevels > 0) return;    // 카드를 고를 때까지 멈춘다 (§22.5)
    const n = this.clock.steps(delta);
    for (let i = 0; i < n; i++) {
      if (this.step()) break;              // 결과가 나오면 남은 스텝을 버린다
    }
  }

  /** 한 스텝. 결과가 나와 ending 으로 넘어갔으면 true. */
  private step(): boolean {
    this.levelStep++;                      // 발사 전에도 흐른다 (§5.2)
    if (this.state !== 'flying') return false;
    if (this.mode === 'boss') return this.bossStep();
    // 반중력 (§22.8): 분사 뒤 잠깐 행성이 밀어낸다. 스테이지는 언제나 1
    this.sim.mods.gravScale = this.antigrav ? -1 : 1;
    const r = this.sim.step();
    if (this.sim.holePasses !== this.warps) {
      // 블랙홀 서핑 (§22.8): Sim 이 반대편으로 내보냈다. 경험치, 단계에 따라 분사
      this.warps = this.sim.holePasses;
      this.grazeXp += WARP_XP;
      const add = WARP_BOOST[this.values.warp] ?? 0;
      this.turnsLeft = Math.min(this.maxTurns, this.turnsLeft + add);
      this.warpFx = [this.sim.ship.x, this.sim.ship.y];
    }
    if (r) {
      this.outcome = r;
      this.state = 'ending';
      this.endElapsed = 0;
      return true;
    }
    // 메시에 천체 (§22.7): 스치면 모은다 — 실패로 끝나는 비행이어도(사용자 결정)
    this.collectMessier();
    if (this.world) {
      // 칸을 넘었으면 창을 갈아 끼우고, 지나가며 당근을 먹는다 (§22.3). 당근은 경험치다 (§22.5)
      const { x, y } = this.sim.ship;
      this.world.setThreat(threatOf(this.freeSeconds()));
      if (this.world.sync(x, y)) this.sim.refreshBodies();
      this.itemsEaten += this.world.eat(x, y, this.values.magnetR);
      // 방패를 썼으면 패시브 쪽 횟수도 맞춘다 — 그래야 카드에서 다시 받을 수 있다
      if (this.perks.shield !== this.sim.mods.shield) this.perks.shield = this.sim.mods.shield;
      // 재충전: 분사가 모자랄 때만 센다
      if (this.values.rechargeSteps > 0) {
        if (this.turnsLeft >= this.maxTurns) this.rechargeAcc = 0;
        else if (++this.rechargeAcc >= this.values.rechargeSteps) { this.rechargeAcc = 0; this.turnsLeft++; }
      }
      // 스침·위성 (§22.8)
      this.graze();
      this.satellitesStep();
      // 15분 (§22.8): 최종 보스. 링에서 도는 중이면 나올 때까지
      if (!this.sim.docked && this.freeSeconds() >= CLEAR_AT) {
        this.startBoss(true);
        return true;
      }
      // 보스 (§22.6): 2분마다. 링에서 도는 중이면 나올 때까지 기다린다
      if (!this.sim.docked && this.freeSeconds() >= BOSS_EVERY * (this.bossIndex + 1)) {
        this.startBoss();
        return true;
      }
      // 레벨업: 문턱을 넘으면 이번 프레임은 여기서 멈춘다
      if (this.checkLevel()) return true;
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
