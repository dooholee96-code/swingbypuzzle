// 에디터가 tools-shared 에서 끌어 쓰는 것들을 한 곳에 모은다.
// 워커와 메인 스레드가 같은 것을 본다.

import { splitRuns } from '../tools-shared/metrics.js';
import { widthOf } from '../tools-shared/scan.js';
import type { Run } from '../tools-shared/scan.js';

export { angles } from '../tools-shared/scan.js';

/** 주 구간과 그 폭. 구간이 없으면 폭 0. */
export function splitOrNull(runs: Run[], step: number): { main: Run | null; width: number } {
  const { main } = splitRuns(runs);
  return { main, width: main ? widthOf(main, step) : 0 };
}
