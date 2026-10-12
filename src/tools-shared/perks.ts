// 인피니티의 패시브와 경험치 (§22.5). 뱀서라이크의 "한 판 안에서 자라는 선택".
//
// 공격은 없다 — 성장은 전부 살아남는 쪽이다. 여기는 순수 규칙이고, 물리에 닿는 값은
// core/mods.ts 의 Mods 로 넘긴다. 스테이지는 이 파일을 쓰지 않는다.
//
// DOM·브라우저 API 를 import 하지 않는다 (§0.3).

import { mulberry32 } from '../core/rng.js';
import { INF_TURN, ITEM_R, MAX_TURNS, START_TURNS } from './infinity.js';

/**
 * 패시브 종류. 각각 3단계(방패는 남은 횟수 0~3).
 * §22.8 방송판에서 "판을 바꾸는" 셋이 더해졌다 — 위성 당근(satellite)·블랙홀 서핑(warp)·반중력(antigrav).
 * storm 은 진화(위성 3 + 자석 3 → 당근 폭풍, 1단계뿐)로 카드 추첨에는 들어가지 않는다
 */
export type PerkKind =
  | 'boost' | 'turn' | 'recharge' | 'magnet' | 'shield' | 'slowshot' | 'foresight' | 'dockwide'
  | 'satellite' | 'warp' | 'antigrav' | 'storm';
export const PERK_KINDS: readonly PerkKind[] = [
  'boost', 'turn', 'recharge', 'magnet', 'shield', 'slowshot', 'foresight', 'dockwide',
  'satellite', 'warp', 'antigrav', 'storm',
];
/** 추첨 풀. 진화(storm)는 조건이 되면 맨 앞에 따로 놓는다 */
export const DRAW_KINDS: readonly PerkKind[] = PERK_KINDS.filter((k) => k !== 'storm');
export const PERK_MAX = 3;
/** 레벨업 카드. 패시브가 다 찼으면 "당근 한 입"(분사 전부 보충)이 자리를 채운다 */
export type OfferKind = PerkKind | 'refill';

export type PerkLevels = Record<PerkKind, number>;

export function noPerks(): PerkLevels {
  return {
    boost: 0, turn: 0, recharge: 0, magnet: 0, shield: START_SHIELD, slowshot: 0, foresight: 0, dockwide: 0,
    satellite: 0, warp: 0, antigrav: 0, storm: 0,
  };
}

/** 단계별 값. 0단계는 패시브가 없을 때의 값이다 */
// 0단계가 인피니티의 기본이다. 재충전·자석은 기본으로도 조금 있다(밸런스, 2026-10)
const TURN_DEG = [INF_TURN, 70, 80, 90] as const;
/** 기본 15초였다가 10초로 (§22.4.4). 패시브는 7·5·4 */
const RECHARGE_S = [10, 7, 5, 4] as const;
const MAGNET_R = [26, 44, 70, 100] as const;
/** 시작 방패. 한 번은 봐준다 */
export const START_SHIELD = 1;
const BULLET = [1, 0.8, 0.65, 0.5] as const;
const FORESIGHT_S = [0, 0.8, 1.4, 2.0] as const;
const DOCK_K = [1, 1.3, 1.6, 2.0] as const;
// §22.8 방송판
/** 위성 당근 수. 진화(당근 폭풍)면 6 */
const SATELLITES = [0, 1, 2, 3] as const;
export const STORM_SATELLITES = 6;
/** 반중력 — 분사 뒤 이만큼(초) 행성이 밀어낸다 */
const ANTIGRAV_S = [0, 1.5, 2.5, 4] as const;
/** 블랙홀 서핑: 1 통과만, 2 분사 +1, 3 분사 가득 */
export const WARP_BOOST = [0, 0, 1, 99] as const;
export const WARP_XP = 10;

// ── 스침 (§22.8) ──
/** 판정 경계 밖 이만큼(유닛) 안을 지나면 스침 */
export const GRAZE_BAND = 10;
/** 블랙홀은 더 넓고 더 후하다 — 중력이 세서 들어갔다 나오기가 어렵다 */
export const GRAZE_HOLE_BAND = 14;
export const GRAZE_XP = 2;
export const GRAZE_HOLE_XP = 6;
/** 이만큼(초) 스침이 없으면 콤보가 끊긴다 */
export const GRAZE_WINDOW = 4;
/** 스침 n번마다 분사 하나 */
export const GRAZE_BOOST_EVERY = 5;
/** 콤보 배율: 1 + 0.25·min(콤보, 12) — 최대 4배. 당근·스침 경험치에 곱한다 */
export function comboMult(combo: number): number {
  return 1 + 0.25 * Math.min(combo, 12);
}

/** 패시브가 물리·세션에 주는 값. 레벨이 바뀔 때 한 번 계산한다 */
export interface PerkValues {
  maxTurns: number;
  turnMax: number;
  /** 분사 하나가 차오르는 간격(스텝). 0 이면 재충전 없음 */
  rechargeSteps: number;
  magnetR: number;
  bulletScale: number;
  /** 비행 중 예측선 길이(초). 0 이면 없음 */
  foresight: number;
  dockScale: number;
  /** 우주선 둘레를 도는 당근 수 (§22.8). 탄을 막고, 폭풍이면 소행성도 부순다 */
  satellites: number;
  /** 블랙홀 서핑 단계 0~3 */
  warp: number;
  /** 분사 뒤 반중력 지속(초). 0 이면 없음 */
  antigravSec: number;
  /** 당근 폭풍 — 위성이 소행성을 부순다 */
  storm: boolean;
}

export function perkValues(p: PerkLevels): PerkValues {
  return {
    maxTurns: Math.min(MAX_TURNS, START_TURNS + p.boost),
    turnMax: TURN_DEG[p.turn] ?? TURN_DEG[PERK_MAX],
    rechargeSteps: Math.round((RECHARGE_S[p.recharge] ?? RECHARGE_S[PERK_MAX]) * 240),
    magnetR: MAGNET_R[p.magnet] ?? MAGNET_R[PERK_MAX],
    bulletScale: BULLET[p.slowshot] ?? BULLET[PERK_MAX],
    foresight: FORESIGHT_S[p.foresight] ?? FORESIGHT_S[PERK_MAX],
    dockScale: DOCK_K[p.dockwide] ?? DOCK_K[PERK_MAX],
    satellites: p.storm > 0 ? STORM_SATELLITES : (SATELLITES[p.satellite] ?? SATELLITES[PERK_MAX]),
    warp: Math.min(PERK_MAX, p.warp),
    antigravSec: ANTIGRAV_S[p.antigrav] ?? ANTIGRAV_S[PERK_MAX],
    storm: p.storm > 0,
  };
}

/** 진화 조건 (§22.8): 위성 당근 3 + 당근 자석 3, 아직 진화 전 */
export function canEvolve(p: PerkLevels): boolean {
  return p.satellite >= PERK_MAX && p.magnet >= PERK_MAX && p.storm === 0;
}

/** 카드에 적을 "다음 단계의 값". 문구의 {v} 자리에 들어간다 */
export function perkValueText(kind: PerkKind, nextLevel: number): string {
  const l = Math.min(PERK_MAX, nextLevel);
  switch (kind) {
    case 'boost': return String(Math.min(MAX_TURNS, START_TURNS + l));
    case 'turn': return String(TURN_DEG[l]);
    case 'recharge': return String(RECHARGE_S[l]);
    case 'magnet': return String(MAGNET_R[l]);
    case 'shield': return String(l);
    case 'slowshot': return String(Math.round((BULLET[l] ?? 1) * 100));
    case 'foresight': return (FORESIGHT_S[l] ?? 0).toFixed(1);
    case 'dockwide': return (DOCK_K[l] ?? 1).toFixed(1);
    case 'satellite': return String(SATELLITES[l]);
    case 'warp': return String(l);
    case 'antigrav': return (ANTIGRAV_S[l] ?? 0).toFixed(1);
    case 'storm': return String(STORM_SATELLITES);
  }
}

// ── 경험치 ──────────────────────────────────────────────────────────

/** 당근 하나가 주는 경험치(초 단위) */
export const CARROT_XP = 4;
/** 1→2 레벨의 간격(초). 그 뒤로 3초씩 길어진다 — 8, 11, 14, 17 … */
const XP_FIRST = 8, XP_GROW = 3;

/** `level` 에 이르는 데 필요한 누적 경험치. 1레벨은 0 */
export function xpForLevel(level: number): number {
  let sum = 0;
  for (let k = 1; k < level; k++) sum += XP_FIRST + XP_GROW * (k - 1);
  return sum;
}

export function levelOf(xp: number): number {
  let l = 1;
  while (xp >= xpForLevel(l + 1)) l++;
  return l;
}

// ── 레벨업 카드 ──────────────────────────────────────────────────────

/** 더 올릴 수 있는가. 방패는 남은 횟수가 3 미만이면 또 받을 수 있다 */
export function canRaise(kind: PerkKind, p: PerkLevels): boolean {
  if (kind === 'storm') return canEvolve(p);
  return p[kind] < PERK_MAX;
}

/**
 * 레벨업 때 보여 줄 카드 셋. **시드로 뽑는다** — 오늘의 우주(§22.3)는 같은 날 같은 제안을
 * 받는다(고르는 건 사람 몫). 다 찬 패시브는 빼고, 셋이 안 되면 "당근 한 입"으로 채운다.
 */
export function offerPerks(seed: number, level: number, p: PerkLevels, reroll = 0): OfferKind[] {
  // reroll 은 다시 뽑기(§14.7) 횟수. 0 이면 전과 똑같은 시드 — 기록·되풀이가 흔들리지 않는다
  const base = (seed ^ Math.imul(level, 0x9e3779b1)) | 0;
  const rnd = mulberry32(reroll ? (base ^ Math.imul(reroll, 0x85ebca6b)) | 0 : base);
  const pool = DRAW_KINDS.filter((k) => canRaise(k, p));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  // 진화(§22.8)는 조건이 되는 순간 첫 카드로 — 놓치지 않게
  const out: OfferKind[] = canEvolve(p) ? ['storm', ...pool.slice(0, 2)] : pool.slice(0, 3);
  if (out.length < 3) out.push('refill');
  return out;
}

/** 카드를 골랐을 때의 패시브. refill 은 패시브를 바꾸지 않는다 */
export function raise(kind: OfferKind, p: PerkLevels): PerkLevels {
  if (kind === 'refill') return { ...p };
  if (kind === 'storm') return { ...p, storm: 1 };
  return { ...p, [kind]: Math.min(PERK_MAX, p[kind] + 1) };
}

// ── 시간 위협 ────────────────────────────────────────────────────────

/** 버틴 시간(초) → 위협 단계. 1분마다 하나씩 */
export function threatOf(freeSeconds: number): number {
  return Math.floor(freeSeconds / 60);
}
