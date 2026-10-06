// 진행과 잠금 해제. docs/PLAN.md §13.2
//
// 단계는 순서대로 열린다. 앞 장에서 CHAPTER_OPEN 칸을 끝내면(cleared 또는 skipped)
// 다음 장 탭이 열린다 — 전에는 8칸 전부였다. 한 칸에 막혀 접는 이탈을 줄이려고
// 완화했다(코드 검토 3). 남은 두 칸은 언제든 돌아와 깬다.
// 순수 로직이라 테스트할 수 있다.

import { CHAPTERS, allIds } from './chapters.js';

export interface Progress {
  cleared(id: string): boolean;
  skipped(id: string): boolean;
  /** 개발자용 숨은 옵션(?open): 모든 단계·장을 연다. 클리어 표시는 바꾸지 않는다 */
  allOpen?: boolean;
}

/** 다음 장이 열리는 데 필요한, 앞 장에서 끝낸 칸 수 (§13.2) */
export const CHAPTER_OPEN = 6;

const done = (id: string, p: Progress): boolean => p.cleared(id) || p.skipped(id);

/** 장에서 끝낸(클리어 또는 건너뜀) 칸 수 */
export function doneCount(chapter: number, p: Progress): number {
  const c = CHAPTERS.find((ch) => ch.chapter === chapter);
  return c ? c.levels.filter((id) => done(id, p)).length : 0;
}

/**
 * 이 단계를 지금 플레이할 수 있는가. 첫 단계는 언제나 열려 있다.
 * 장의 첫 칸은 장이 열리면 같이 열린다 — 앞 장의 마지막 칸이 아직 안 끝났어도.
 */
export function isUnlocked(id: string, p: Progress): boolean {
  const ids = allIds();
  const i = ids.indexOf(id);
  if (p.allOpen) return i >= 0;
  if (i <= 0) return i === 0;
  const head = CHAPTERS.find((c) => c.levels[0] === id);
  if (head) return isChapterUnlocked(head.chapter, p);
  return done(ids[i - 1]!, p);
}

/** 장 탭이 열렸는가. 이전 장에서 CHAPTER_OPEN 칸을 끝내야 열린다. */
export function isChapterUnlocked(chapter: number, p: Progress): boolean {
  const i = CHAPTERS.findIndex((c) => c.chapter === chapter);
  if (p.allOpen) return i >= 0;
  if (i <= 0) return i === 0;
  const prev = CHAPTERS[i - 1]!;
  return doneCount(prev.chapter, p) >= Math.min(CHAPTER_OPEN, prev.levels.length);
}

/**
 * 이 장에서 몇 칸을 더 끝내야 다음 장이 열리는가. 0 이면 열렸거나 다음 장이 없다.
 * 단계 선택의 안내 문구가 쓴다 (§13.2).
 */
export function leftToOpenNext(chapter: number, p: Progress): number {
  const i = CHAPTERS.findIndex((c) => c.chapter === chapter);
  if (i < 0 || i + 1 >= CHAPTERS.length) return 0;
  if (isChapterUnlocked(CHAPTERS[i + 1]!.chapter, p)) return 0;
  const need = Math.min(CHAPTER_OPEN, CHAPTERS[i]!.levels.length);
  return Math.max(0, need - doneCount(chapter, p));
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
