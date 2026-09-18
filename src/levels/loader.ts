// 단계 JSON 불러오기와 스키마 확인. docs/PLAN.md §6.1
//
// 모르는 키를 만나면 오류로 처리한다. 오타가 조용히 무시되면 검증기를
// 통과한 단계가 게임에서 다르게 동작할 수 있다.
//
// 이 파일은 순수 검증만 한다. 읽어 오는 방법은 환경마다 다르다:
//   · 브라우저 — registry.ts (Vite 의 import.meta.glob 으로 빌드 시점에 묶는다)
//   · Node CLI — tools/levels-fs.ts (fs 로 읽는다)
// 스키마 규칙이 한 곳에만 있어야 둘이 어긋나지 않는다.

import type { Level } from '../core/types.js';

const REQUIRED: Record<string, string[]> = {
  level: ['id', 'name', 'w', 'h', 'speed', 'preview', 'start', 'goal', 'meta'],
  start: ['x', 'y'],
  goal: ['x', 'y', 'r'],
  planet: ['x', 'y', 'r', 'g', 'R', 'sides'],
  hole: ['x', 'y', 'rH', 'g', 'R'],
  rock: ['x', 'y', 'r', 'seed'],
  ufo: ['x', 'y', 'range', 'interval', 'delay', 'bs'],
  orbit: ['cx', 'cy', 'rad', 'period', 'phase'],
  meta: ['chapter', 'slot', 'role', 'solution', 'source', 'updated'],
  solution: ['angle', 'launch_step'],
};
const OPTIONAL: Record<string, string[]> = {
  level: ['planets', 'holes', 'rocks', 'ufos', 'hint'],
  start: [], goal: [], orbit: [], solution: [], rock: [], ufo: [],
  planet: ['ring', 'role', 'orbit'],
  hole: ['role'],
  meta: ['intro', 'metrics'],
};
const ROLES = ['required', 'optional', 'gate'];
const SOURCES = ['verified', 'generated', 'editor'];
const INTROS = ['planet', 'rock', 'hole', 'ufo', 'orbit', 'wide'];

export function validateSchema(raw: unknown, id: string): string[] {
  const errors: string[] = [];
  const check = (o: unknown, kind: string, where: string): void => {
    if (typeof o !== 'object' || o === null) { errors.push(`${where}: 객체가 아닙니다`); return; }
    const d = o as Record<string, unknown>;
    for (const k of REQUIRED[kind]!) {
      if (!(k in d)) errors.push(`${where}: ${kind}에 필수 키 '${k}'가 없습니다`);
    }
    for (const k of Object.keys(d)) {
      if (!REQUIRED[kind]!.includes(k) && !OPTIONAL[kind]!.includes(k)) {
        errors.push(`${where}: ${kind}에 모르는 키 '${k}'가 있습니다`);
      }
    }
  };

  check(raw, 'level', id);
  if (typeof raw !== 'object' || raw === null) return errors;
  const L = raw as Record<string, unknown>;
  if (L['id'] !== id) errors.push(`${id}: id가 파일 이름과 다릅니다 (${String(L['id'])})`);
  if (L['start']) check(L['start'], 'start', `${id} start`);
  if (L['goal']) check(L['goal'], 'goal', `${id} goal`);

  const list = (key: string, kind: string): void => {
    const v = L[key];
    if (v === undefined) return;
    if (!Array.isArray(v)) { errors.push(`${id}: '${key}'가 배열이 아닙니다`); return; }
    v.forEach((item, i) => {
      check(item, kind, `${id} ${key}[${i}]`);
      const d = item as Record<string, unknown>;
      if (d['role'] !== undefined && !ROLES.includes(String(d['role']))) {
        errors.push(`${id}: ${key}[${i}].role이 ${ROLES.join('|')} 중 하나가 아닙니다`);
      }
      if (d['orbit'] !== undefined) check(d['orbit'], 'orbit', `${id} ${key}[${i}].orbit`);
    });
  };
  list('planets', 'planet'); list('holes', 'hole');
  list('rocks', 'rock'); list('ufos', 'ufo');

  const meta = L['meta'] as Record<string, unknown> | undefined;
  if (meta) {
    check(meta, 'meta', `${id} meta`);
    if (meta['solution']) check(meta['solution'], 'solution', `${id} meta.solution`);
    if (meta['source'] !== undefined && !SOURCES.includes(String(meta['source']))) {
      errors.push(`${id}: meta.source가 ${SOURCES.join('|')} 중 하나가 아닙니다`);
    }
    if (meta['intro'] !== undefined && !INTROS.includes(String(meta['intro']))) {
      errors.push(`${id}: meta.intro가 ${INTROS.join('|')} 중 하나가 아닙니다`);
    }
  }
  return errors;
}

export class LevelError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join('\n'));
    this.name = 'LevelError';
  }
}

/** 원시 JSON 을 검사해 Level 로 확정한다. 실패하면 던진다. */
export function parseLevel(raw: unknown, id: string): Level {
  const errors = validateSchema(raw, id);
  if (errors.length) throw new LevelError(errors);
  return raw as Level;
}
