// 레시피 형식. docs/PLAN.md §8.3
//
// 레시피는 "어떤 단계를 원하는가"를 적는 문서다. 좌표는 여기 없다 —
// 좌표는 생성기가 만들고 검증기가 거른다 (§0.7).
//
// DOM·브라우저·Node API 를 import 하지 않는다 (§0.3).

import type { Meta, Role } from '../core/types.js';

export type Zone = 'bottom' | 'top' | 'left' | 'right' | 'center' | 'any';

export interface BodySpec {
  type: 'planet' | 'hole' | 'orbit';
  count: number;
  role?: Role;
}

export interface SlotRecipe {
  slot: number;
  /** §7.2 의 8단계 패턴 이름 — 도입·연습·변형·휴식·조합·조합 심화·도전·마무리 */
  role: string;
  /** 단계 이름 (§13.3 의 HUD 표기). 사람이 짓는다 */
  name: string;
  hint?: string;
  intro?: Meta['intro'] | null;
  map: { w: number; h: number };
  preview: number;
  speed?: number;
  startZone?: Zone;
  goalZone?: Zone;
  required: BodySpec[];
  optional?: BodySpec[];
  hazards: { ufos: number; rocksMax: number };
  /** 목표 성공 폭(°). 규칙 1 의 최소 폭이자 "너무 쉬움" 경고의 상한이다 */
  window: { min: number; max: number };
  /** 공전 단계의 발사 가능 시점 비율 (§8.5 규칙 6) */
  timing?: { minFraction: number; maxFraction: number } | null;
  seedCount?: number;
}

export interface Recipe {
  chapter: number;
  defaults: { speed: number; startZone: Zone; goalZone: Zone };
  slots: SlotRecipe[];
}

export const DEFAULT_SEEDS = 2000;     // §8.9 에서 v3 값으로 복구

export function slotOf(r: Recipe, slot: number): SlotRecipe | undefined {
  return r.slots.find((s) => s.slot === slot);
}

export function levelId(r: Recipe, s: SlotRecipe): string {
  return `${r.chapter}-${s.slot}`;
}

/** 레시피가 정한 값과 장 기본값을 합친다. */
export function resolve(r: Recipe, s: SlotRecipe): {
  speed: number; startZone: Zone; goalZone: Zone; seeds: number;
} {
  return {
    speed: s.speed ?? r.defaults.speed,
    startZone: s.startZone ?? r.defaults.startZone,
    goalZone: s.goalZone ?? r.defaults.goalZone,
    seeds: s.seedCount ?? DEFAULT_SEEDS,
  };
}

/** 레시피 자체의 형식 검사. 생성 전에 걸러 낸다. */
export function checkRecipe(raw: unknown): string[] {
  const e: string[] = [];
  const r = raw as Partial<Recipe> | null;
  if (!r || typeof r !== 'object') return ['레시피가 객체가 아닙니다'];
  if (typeof r.chapter !== 'number') e.push('chapter 가 없습니다');
  if (!r.defaults) e.push('defaults 가 없습니다');
  if (!Array.isArray(r.slots) || !r.slots.length) { e.push('slots 가 비었습니다'); return e; }

  for (const s of r.slots) {
    const at = `slot ${s.slot}`;
    if (typeof s.slot !== 'number') e.push(`${at}: slot 번호가 없습니다`);
    if (!s.name) e.push(`${at}: name 이 없습니다 (§13 문구)`);
    if (!s.map || !s.map.w || !s.map.h) e.push(`${at}: map 이 없습니다`);
    if (typeof s.preview !== 'number') e.push(`${at}: preview 가 없습니다`);
    if (!Array.isArray(s.required) || !s.required.length) e.push(`${at}: required 가 비었습니다`);
    if (!s.window || !(s.window.min < s.window.max)) e.push(`${at}: window 가 min < max 가 아닙니다`);
    if (!s.hazards) e.push(`${at}: hazards 가 없습니다`);
    const orbit = [...(s.required ?? []), ...(s.optional ?? [])].some((b) => b.type === 'orbit');
    if (orbit && !s.timing) e.push(`${at}: 공전 행성이 있으면 timing 이 필요합니다 (§8.5 규칙 6)`);
    if (!orbit && s.timing) e.push(`${at}: 공전 행성이 없는데 timing 이 있습니다`);
  }
  return e;
}
