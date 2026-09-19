// 장 구성과 단계 순서. docs/PLAN.md §7.1, §13.2
//
// 여기 등록된 단계만 게임에 나온다.
// **검증기(§8.5)를 통과하지 않은 단계를 등록하지 않는다(§19).**
//
// 이 파일은 `npm run register` 가 src/levels/data/ 를 훑어 다시 쓴다.
// 손으로 고치지 않는다 — 장 이름만 tools/register.ts 에서 바꾼다.

export interface Chapter { chapter: number; name: string; levels: string[] }

/** 장 이름은 §7.3 의 커리큘럼 제목. 탭에 "1장 행성" 형태로 표시된다 (§13.2). */
export const CHAPTERS: readonly Chapter[] = [
  { chapter: 1, name: '행성', levels: ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8'] },
  { chapter: 2, name: '블랙홀', levels: ['2-1', '2-2', '2-3', '2-4', '2-5', '2-6', '2-7', '2-8'] },
  { chapter: 3, name: '외계인', levels: ['3-1', '3-2', '3-3', '3-4', '3-5', '3-6', '3-7', '3-8'] },
  { chapter: 4, name: '공전 행성', levels: ['4-1', '4-2', '4-3', '4-4', '4-5', '4-6', '4-7', '4-8'] },
  { chapter: 5, name: '넓은 항로', levels: ['5-1', '5-2', '5-3', '5-4', '5-5', '5-6', '5-7', '5-8'] },
];

export function allIds(): string[] {
  return CHAPTERS.flatMap((c) => c.levels);
}

export function idsOf(chapter: number): string[] {
  return CHAPTERS.find((c) => c.chapter === chapter)?.levels ?? [];
}

export function nameOf(chapter: number): string {
  return CHAPTERS.find((c) => c.chapter === chapter)?.name ?? '';
}

/** 탭 표기 "1장 행성" (§13.2) */
export function labelOf(chapter: number): string {
  const n = nameOf(chapter);
  return n ? `${chapter}장 ${n}` : '';
}
