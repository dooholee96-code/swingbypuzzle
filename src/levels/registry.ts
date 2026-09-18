// 브라우저용 레벨 읽기. docs/PLAN.md §6.1
//
// Vite 의 import.meta.glob 으로 빌드 시점에 전부 묶는다. 런타임 fetch 가 없으니
// 오프라인에서도 완전히 동작한다 (§14.1).

import { LevelError, parseLevel } from './loader.js';
import type { Level } from '../core/types.js';

const FILES = import.meta.glob<unknown>('./data/*.json', { eager: true, import: 'default' });

export function loadLevel(id: string): Level {
  const raw = FILES[`./data/${id}.json`];
  if (raw === undefined) throw new LevelError([`${id}: 단계 파일이 없습니다`]);
  return parseLevel(raw, id);
}

export function loadAll(ids: string[]): Map<string, Level> {
  return new Map(ids.map((id) => [id, loadLevel(id)]));
}
