// 장 구성과 단계 순서. docs/PLAN.md §7.1, §13.2
//
// 여기 등록된 단계만 게임에 나온다.
// **검증기(§8.5)를 통과하지 않은 단계를 등록하지 않는다(§19).**

export interface Chapter { chapter: number; name: string; levels: string[] }

/** 장 이름은 §7.3 의 커리큘럼 제목. 탭에 "1장 행성" 형태로 표시된다 (§13.2). */
export const CHAPTERS: readonly Chapter[] = [
  { chapter: 1, name: '행성', levels: ['1-1', '1-4'] },
  { chapter: 2, name: '블랙홀', levels: ['2-1'] },
  { chapter: 3, name: '외계인', levels: ['3-1'] },
  { chapter: 4, name: '공전 행성', levels: ['4-1'] },
  { chapter: 5, name: '넓은 항로', levels: ['5-1'] },
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
