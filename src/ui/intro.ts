// 새 요소 소개 카드. docs/PLAN.md §7.4, §13.2.1
//
// 장의 첫 단계에 처음 들어갈 때 한 번만 보여준다. 다시 보기는 단계 선택의 ? 버튼.

export type IntroKey = 'planet' | 'rock' | 'hole' | 'ufo' | 'orbit' | 'wide';

export const INTRO: Record<IntroKey, { title: string; body: string }> = {
  planet: { title: '행성', body: '점선 원 안에 들어가면 행성 쪽으로 끌려요. 가까울수록 세게 끌려요.' },
  rock: { title: '소행성', body: '부딪히면 끝이에요. 중력은 없어요.' },
  hole: { title: '블랙홀', body: '끌림이 아주 강해요. 가운데에 닿으면 빨려 들어가요.' },
  ufo: { title: '외계인', body: '붉은 원 안에 들어가면 우주선을 향해 쏴요.' },
  orbit: { title: '움직이는 행성', body: '정해진 원을 따라 돌아요. 발사할 때를 기다려 보세요.' },
  // v4.1 에서 빈 곳 드래그 이동을 없앴다(§10.3). 미니맵이 유일한 수단이다.
  wide: { title: '넓은 맵', body: '한눈에 안 들어와요. 구석의 미니맵을 눌러 항로를 살펴보세요.' },
};

// §7.4: 5-1 은 같은 "넓은 맵" 카드를 쓰되 문구 끝에 한 줄을 덧붙인다.
const EXTRA: Record<string, string> = { '5-1': ' 이제 가로로도 넓어요.' };

export function introFor(levelId: string, key: IntroKey): { title: string; body: string } {
  const base = INTRO[key];
  return { title: base.title, body: base.body + (EXTRA[levelId] ?? '') };
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
