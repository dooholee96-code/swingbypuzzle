// 보정값 (§22.5). 인피니티의 패시브가 물리에 미치는 것을 **이 객체 하나**로 넘긴다.
//
// 스테이지·검증기·리플레이는 기본값을 쓴다 — 기본값이면 Sim 의 동작은 보정값이 없던
// 때와 비트 단위로 같다(§0.4). 물리 상수(constants.ts)는 건드리지 않는다.
//
// DOM·브라우저 API 를 import 하지 않는다 (§0.3).

import { TURN_MAX } from './constants.js';

export interface Mods {
  /** 분사로 꺾을 수 있는 최대 각(°). 기본 TURN_MAX */
  turnMax: number;
  /** 외계인 총알 속도 배율. 기본 1 */
  bulletScale: number;
  /** 방패 — 충돌을 튕겨 낼 수 있는 남은 횟수. 기본 0 */
  shield: number;
}

export function defaultMods(): Mods {
  return { turnMax: TURN_MAX, bulletScale: 1, shield: 0 };
}

/** 방패로 튕긴 뒤 무적 스텝 수 (1.5초). 그동안의 충돌은 횟수를 쓰지 않고 다시 튕긴다 */
export const INVULN_STEPS = 360;
