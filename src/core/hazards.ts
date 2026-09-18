// 외계인 사격과 총알. docs/PLAN.md §5.5
//
// 부록 A 는 다음 사격 시각을 외계인 객체에 _next 로 얹지만, 여기서는
// 시뮬레이션 상태(SimState.nextFire)에 둔다. 레벨 객체가 불변이어야
// 같은 레벨로 여러 번·여러 스레드에서 스캔할 수 있다.

import { DT, SHIP_R } from './constants.js';
import { dist } from './physics.js';
import type { Level, Outcome, ShipState, SimState } from './types.js';

/**
 * delay 초에 첫 사격, 이후 interval 초마다 시도한다(비행 시계 기준).
 * 시도 시점에 우주선이 range 안이면 그 순간 위치를 향해 쏜다(예측 사격 없음).
 */
export function fireUfos(L: Level, st: SimState, ship: ShipState, ft: number): void {
  const ufos = L.ufos ?? [];
  for (let i = 0; i < ufos.length; i++) {
    const u = ufos[i]!;
    while (ft >= st.nextFire[i]!) {
      const dx = ship.x - u.x, dy = ship.y - u.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < u.range) {
        st.bullets.push({ x: u.x, y: u.y, vx: dx / d * u.bs, vy: dy / d * u.bs, age: 0 });
      }
      st.nextFire[i]! += u.interval;
    }
  }
}

/** 전부 이동 → 수명·범위로 거르기 → 살아남은 것만 피격 판정. 순서가 중요하다. */
export function stepBullets(L: Level, st: SimState, ship: ShipState): Outcome | '' {
  for (const b of st.bullets) { b.x += b.vx * DT; b.y += b.vy * DT; b.age += DT; }
  st.bullets = st.bullets.filter(
    (b) => b.age < 5 && b.x > -20 && b.y > -20 && b.x < L.w + 20 && b.y < L.h + 20,
  );
  for (const b of st.bullets) {
    if (dist(b.x, b.y, ship.x, ship.y) < 3 + SHIP_R) return 'shot';
  }
  return '';
}
