// 진행과 잠금 해제. docs/PLAN.md §13.2
//
// 단계는 순서대로 열린다. 모든 단계가 cleared 또는 skipped 면 다음 장 탭이 열린다(§14.3).
// 순수 로직이라 테스트할 수 있다.

import { CHAPTERS, allIds } from './chapters.js';

export interface Progress {
  cleared(id: string): boolean;
  skipped(id: string): boolean;
}

/** 이 단계를 지금 플레이할 수 있는가. 첫 단계는 언제나 열려 있다. */
export function isUnlocked(id: string, p: Progress): boolean {
  const ids = allIds();
  const i = ids.indexOf(id);
  if (i <= 0) return i === 0;
  const prev = ids[i - 1]!;
  return p.cleared(prev) || p.skipped(prev);
}

/** 장 탭이 열렸는가. 이전 장이 전부 끝나야 열린다. */
export function isChapterUnlocked(chapter: number, p: Progress): boolean {
  const i = CHAPTERS.findIndex((c) => c.chapter === chapter);
  if (i <= 0) return i === 0;
  const prev = CHAPTERS[i - 1]!;
  return prev.levels.every((id) => p.cleared(id) || p.skipped(id));
}

/** 다음에 플레이할 단계. 전부 끝났으면 null. */
export function nextLevel(after: string, p: Progress): string | null {
  const ids = allIds();
  const i = ids.indexOf(after);
  for (let k = i + 1; k < ids.length; k++) {
    if (isUnlocked(ids[k]!, p)) return ids[k]!;
  }
  return null;
}

/** 이어서 할 단계. 아직 안 깬 첫 단계, 없으면 마지막. */
export function resumeLevel(p: Progress): string {
  const ids = allIds();
  for (const id of ids) {
    if (!p.cleared(id) && !p.skipped(id) && isUnlocked(id, p)) return id;
  }
  return ids[ids.length - 1]!;
}

/** 장의 마지막 단계인가. 결과 화면의 "다음 장" 표시에 쓴다 (§13.4). */
export function isChapterLast(id: string): boolean {
  const c = CHAPTERS.find((ch) => ch.levels.includes(id));
  return c ? c.levels[c.levels.length - 1] === id : false;
}

export function chapterOf(id: string): number {
  return CHAPTERS.find((c) => c.levels.includes(id))?.chapter ?? 1;
}
