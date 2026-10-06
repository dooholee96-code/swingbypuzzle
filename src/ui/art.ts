// 화면(DOM)에 넣는 픽셀 그림 — 결과 시트의 토끼, 소개 카드의 요소 그림.
// 필드와 같은 생성기로 굽는다. CSS 의 img.px 가 번지지 않게 키운다.

import { holeArtRadius } from '../render/field.js';
import { toDataUrl } from '../render/sprites/bake.js';
import { type Face, rocket, small, ufo } from '../render/sprites/rocket.js';
import { fromRows } from '../render/sprites/pixel.js';
import type { OfferKind } from '../tools-shared/perks.js';
import { messierArt } from '../render/sprites/messier.js';
import { messierOf } from '../tools-shared/messier.js';
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

/** 레벨업 카드의 패시브 그림 (§22.5). 12×12, 팔레트 키만 (§12.6) */
const PERK_ROWS: Readonly<Record<OfferKind, readonly string[]>> = {
  boost: [
    '.....OO.....', '....OOOO....', '....OCCO....', '....OCCO....', '...LOOOOL...', '..LLOOOOLL..',
    '..L.OOOO.L..', '....OOOO....', '.....YY.....', '....YyyY....', '...Y.YY.Y...', '....Y..Y....',
  ],
  turn: [
    '............', '.......W....', '......WW....', '.....WWWWW..', '....WW..WW..', '...WW....W..',
    '..WW.....W..', '..W......W..', '..W.....WW..', '..WW...WW...', '...WWWWW....', '............',
  ],
  recharge: [
    '....KKKK....', '..KKWWWWKK..', '.KWWWWWWWWK.', '.KWWWWKWWWK.', 'KWWWWWKWWWWK', 'KWWWWWKWWWWK',
    'KWWWWWKKKWWK', 'KWWWWWWWWWWK', '.KWWWWWWWWK.', '.KWWWWWWWWK.', '..KKWWWWKK..', '....KKKK....',
  ],
  magnet: [
    '..RR....BB..', '..RR....BB..', '..RR....BB..', '..WW....WW..', '..WW....WW..', '..RR....BB..',
    '..RR....BB..', '..RRR..BBB..', '..RRRRBBBB..', '...RRRBBB...', '....RRBB....', '............',
  ],
  shield: [
    '..BBBBBBBB..', '.BWWBBBBBBB.', 'BWWBBBBBBBBB', 'BWBBBBBBBBBB', 'BBBBBBBBBBBB', 'BBBBBBBBBBBB',
    'BBBBBBBBBBBB', '.BBBBBBBBBB.', '.BBBBBBBBBB.', '..BBBBBBBB..', '...BBBBBB...', '.....BB.....',
  ],
  slowshot: [
    '............', 'S...........', 'SS..........', '.S..rrrr....', '....rYYYr...', 'S...rYYYYr..',
    'SS..rYYYr...', '.S..rrrr....', 'S...........', 'SS..........', '............', '............',
  ],
  foresight: [
    '..........YY', '..........YY', '.......YY...', '.......YY...', '....YY......', '....YY......',
    '.YY.........', '.YY.........', '..OOO.......', '.OCCCO......', '.OCCCO......', '..OOO.......',
  ],
  dockwide: [
    '....LL.LL...', '..L.......L.', '.L.........L', '.L...pp....L', 'L...pPPp....', 'L...pPPp...L',
    '.L...pp....L', '.L.........L', '..L.......L.', '....LL.LL...', '............', '............',
  ],
  refill: [
    '......LL....', '.....LlL....', '....KOOK....', '....KOOoK...', '...KOOoK....', '...KOoK.....',
    '..KOOK......', '..KOoK......', '.KOoK.......', '.Ko.........', 'K...........', '............',
  ],
};

export function perkIcon(kind: OfferKind): string {
  return once(`perk:${kind}`, () => toDataUrl(fromRows(PERK_ROWS[kind])));
}

/** 보스전 목숨 (§22.6) */
export function heartIcon(): string {
  return once('heart', () => toDataUrl(small('heart')));
}

/** 도감의 메시에 천체 그림 (§22.7). 칸은 20, 상세는 32 */
export function messierIcon(n: number, size = 20): string {
  return once(`messier:${n}:${size}`, () => toDataUrl(messierArt(n, messierOf(n).type, size)));
}
