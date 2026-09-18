// 전 각도 스캔. docs/PLAN.md §16.1
//
//   npm run solve            등록된 전 단계
//   npm run solve 1-1        한 단계만
//
// 공전 행성이 있는 단계는 주기를 12등분한 발사 시점마다 반복한다.

import { DT } from '../src/core/constants.js';
import { allIds } from '../src/levels/chapters.js';
import { FROM, STEP, TO, angles, widthOf } from '../src/tools-shared/scan.js';
import type { Level, Outcome } from '../src/core/types.js';
import { LevelError, } from '../src/levels/loader.js';
import { loadLevel } from './levels-fs.js';

const ORBIT_DIVISIONS = 12;

// §5.4 판정 순서로 고정해서 낸다. 객체 삽입 순서에 기대면 대조가 어렵다.
const ORDER: Outcome[] = ['planet', 'hole', 'rock', 'ufo', 'wall', 'shot', 'drift', 'win'];

export function launchSteps(L: Level): number[] {
  const orbiting = (L.planets ?? []).find((p) => p.orbit);
  if (!orbiting?.orbit) return [0];
  const period = Math.abs(orbiting.orbit.period);
  return Array.from({ length: ORBIT_DIVISIONS }, (_, k) =>
    Math.round(k * period / ORBIT_DIVISIONS / DT));
}

export function solveLine(L: Level, launchStep: number): string {
  const { counts, runs } = angles(L, launchStep);
  const txt = runs.length
    ? runs.map(([a, b]) => `${a}..${b} (${widthOf([a, b]).toFixed(2)}°)`).join(' ')
    : '없음';
  const c = ORDER.filter((k) => counts[k] !== undefined)
    .map((k) => `${k}:${counts[k]}`).join(', ');
  return `${L.id} ${L.name}  t=${(launchStep * DT).toFixed(2)}  성공: ${txt}  {${c}}`;
}

function main(): number {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  let failed = false;
  for (const id of ids.length ? ids : allIds()) {
    try {
      const L = loadLevel(id);
      for (const s of launchSteps(L)) console.log(solveLine(L, s));
    } catch (e) {
      failed = true;
      for (const m of (e as LevelError).errors ?? [String(e)]) console.error(`  ${m}`);
    }
  }
  return failed ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
