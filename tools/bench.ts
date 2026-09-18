// 성능 측정. docs/PLAN.md §8.9
//
// 스택 전환의 근거가 된 수치를 계속 감시한다. 생성기(§8.4)가 이 스캔을
// 시드마다 여러 번 돌리므로, 여기가 느려지면 §8.9.1 의 비용이 그대로 커진다.

import { angles } from '../src/tools-shared/scan.js';
import { loadLevel } from './levels-fs.js';

const IDS = ['1-1', '5-1'];

// 참고: Godot 3.5 GDScript 트랜스리터레이션에서의 같은 작업 (같은 기계)
const GDSCRIPT = { '1-1': 4.903, '5-1': 9.013 };

for (const id of IDS) {
  const L = loadLevel(id);
  const t0 = process.hrtime.bigint();
  const { counts, runs } = angles(L, 0);
  const el = Number(process.hrtime.bigint() - t0) / 1e9;
  const ref = GDSCRIPT[id as keyof typeof GDSCRIPT];
  console.log(
    `${id} ${L.name.padEnd(8)} ${el.toFixed(3)}초` +
    (ref ? `  (GDScript ${ref.toFixed(2)}초, ${(ref / el).toFixed(0)}배)` : '') +
    `  성공 구간 ${runs.length}개  ${JSON.stringify(counts)}`);
}
