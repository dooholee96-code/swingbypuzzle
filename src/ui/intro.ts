// 새 요소 소개 카드. docs/PLAN.md §7.4, §13.2.1
//
// 장의 첫 단계에 처음 들어갈 때 한 번만 보여준다. 다시 보기는 단계 선택의 ? 버튼.

import { type Key, t } from '../i18n/index.js';

export type IntroKey = 'planet' | 'rock' | 'hole' | 'ufo' | 'orbit' | 'wide' | 'turn';

/** 요소 키 → 제목·본문 문구 키 (§13.2.1) */
const TEXT: Readonly<Record<IntroKey, readonly [Key, Key]>> = {
  planet: ['intro.planet', 'intro.planet.body'],
  rock: ['intro.rock', 'intro.rock.body'],
  hole: ['intro.hole', 'intro.hole.body'],
  ufo: ['intro.ufo', 'intro.ufo.body'],
  orbit: ['intro.orbit', 'intro.orbit.body'],
  // v4.1 에서 빈 곳 드래그 이동을 없앴다(§10.3). 미니맵이 유일한 수단이다.
  wide: ['intro.wide', 'intro.wide.body'],
  // §22.1 분사. 6-1
  turn: ['intro.turn', 'intro.turn.body'],
};

export const INTRO_KEYS = Object.keys(TEXT) as IntroKey[];

// §7.4: 5-1 은 같은 "넓은 맵" 카드를 쓰되 문구 끝에 한 줄을 덧붙인다.
const EXTRA: Readonly<Record<string, Key>> = { '5-1': 'intro.wideExtra' };

export function introFor(levelId: string, key: IntroKey): { title: string; body: string } {
  const [title, body] = TEXT[key];
  const extra = EXTRA[levelId];
  return { title: t(title), body: t(body) + (extra ? t(extra) : '') };
}

/**
 * "이미 본 카드" 를 기록할 키. 보통은 요소 키 그대로다.
 *
 * 넓은 맵 카드만 두 번 뜬다 — 1-8(세로로 긴 맵)과 5-1(가로로도 넓은 맵).
 * §7.4 가 5-1 에 한 줄을 덧붙이라고 한 것은 그 한 줄을 보여주라는 뜻이므로,
 * 덧붙일 말이 있는 단계는 따로 센다. 같은 키로 세면 1-8 을 본 사람에게
 * 5-1 의 "이제 가로로도 넓어요." 가 영영 안 뜬다.
 */
export function seenKey(levelId: string, key: IntroKey): string {
  return EXTRA[levelId] ? `${key}@${levelId}` : key;
}
