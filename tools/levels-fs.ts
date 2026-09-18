// Node 용 레벨 읽기. docs/PLAN.md §16
//
// CLI 도구(solve, validate, generate, bench)와 테스트가 쓴다.
// 스키마 검사는 src/levels/loader.ts 와 같은 코드를 쓴다.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { LevelError, parseLevel } from '../src/levels/loader.js';
import type { Level } from '../src/core/types.js';

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'levels', 'data');

export function loadLevel(id: string): Level {
  let text: string;
  try {
    text = readFileSync(join(DATA_DIR, `${id}.json`), 'utf8');
  } catch {
    throw new LevelError([`${id}: 단계 파일을 읽을 수 없습니다`]);
  }
  return parseLevel(JSON.parse(text), id);
}

export function loadAll(ids: string[]): Map<string, Level> {
  const out = new Map<string, Level>();
  const errors: string[] = [];
  for (const id of ids) {
    try { out.set(id, loadLevel(id)); }
    catch (e) { errors.push(...((e as LevelError).errors ?? [String(e)])); }
  }
  if (errors.length) throw new LevelError(errors);
  return out;
}
