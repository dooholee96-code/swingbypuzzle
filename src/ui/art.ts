// 화면(DOM)에 넣는 픽셀 그림 — 결과 시트의 토끼, 소개 카드의 요소 그림.
// 필드와 같은 생성기로 굽는다. CSS 의 img.px 가 번지지 않게 키운다.

import { holeArtRadius } from '../render/field.js';
import { toDataUrl } from '../render/sprites/bake.js';
import { type Face, rocket, small, ufo } from '../render/sprites/rocket.js';
import { blackhole, dockArt, moon, planet, rock } from '../render/sprites/world.js';
import type { IntroKey } from './intro.js';

const memo = new Map<string, string>();
const once = (key: string, make: () => string): string => {
  let v = memo.get(key);
  if (!v) { v = make(); memo.set(key, v); }
  return v;
};

/** 당근 로켓(기수 오른쪽) */
export function rabbitIcon(face: Face): string {
  return once(`rabbit:${face}`, () => toDataUrl(rocket(face)));
}

/** 새 요소 소개 카드의 그림 (§13.2.1) */
export function introArt(key: IntroKey): string {
  return once(`intro:${key}`, () => toDataUrl(
    key === 'planet' ? planet(20, 0)
      : key === 'rock' ? rock(18, 3)
        : key === 'hole' ? blackhole(holeArtRadius(14), 2)
          : key === 'ufo' ? ufo(0)
            : key === 'orbit' ? planet(16, 1, { ring: true })
              : key === 'turn' ? rocket('fly', { flame: 0, ears: 'back' })
              : key === 'infinity' ? small('carrot')
              : key === 'dock' ? dockArt()
              : moon(18),
  ));
}

export function img(src: string, alt = '', cls = 'px'): string {
  return `<img class="${cls}" src="${src}" alt="${alt}" draggable="false">`;
}
