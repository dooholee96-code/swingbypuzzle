// 에디터의 검증 워커. docs/PLAN.md §8.7
//
// 2단계로 답한다: 1° 대략 스캔을 먼저 보내고(첫 결과가 0.3초 안에 보여야 한다,
// §18), 이어서 0.25° 정밀 스캔과 지표 전체를 보낸다.
//
// 게임·CLI 와 **같은** core/ 와 tools-shared/ 를 import 한다. 여기서 다른 코드를
// 쓰면 에디터가 통과시킨 단계를 npm run validate 가 떨어뜨릴 수 있다 (§8.1).

import { Sim } from '../core/simulate.js';
import { gravs } from '../core/physics.js';
import { checkLevel, computeMetrics } from '../tools-shared/metrics.js';
import { angles, splitOrNull } from './shared.js';
import type { Level, Outcome } from '../core/types.js';

/** 궤적 부채꼴 (§8.7). 실패 원인별 색으로 그린다. */
const FAN_STEP = 2;
const FAN_SUBSAMPLE = 8;     // 8스텝(1/30초)마다 한 점만 남긴다

export interface FanPath { angle: number; outcome: Outcome; pts: number[] }

export type Req = { seq: number; level: Level };
export type Res =
  | { seq: number; kind: 'coarse'; width: number; runs: [number, number][] }
  | { seq: number; kind: 'fan'; paths: FanPath[] }
  | { seq: number; kind: 'fine'; report: ReturnType<typeof checkLevel> }
  | { seq: number; kind: 'error'; message: string };

let current = 0;

function fan(L: Level, launchStep: number): FanPath[] {
  const G = gravs(L);
  const sim = new Sim();
  sim.recordPath = true;
  const out: FanPath[] = [];
  for (let a = -180; a < 180; a += FAN_STEP) {
    const r = sim.simulate(L, a, launchStep, G);
    const pts: number[] = [];
    for (let i = 0; i < sim.path.length; i += 2 * FAN_SUBSAMPLE) {
      pts.push(sim.path[i]!, sim.path[i + 1]!);
    }
    // 마지막 점은 항상 남긴다 — 어디서 끝났는지가 정보다
    if (sim.path.length >= 2) {
      pts.push(sim.path[sim.path.length - 2]!, sim.path[sim.path.length - 1]!);
    }
    out.push({ angle: a, outcome: r, pts });
  }
  return out;
}

self.onmessage = (ev: MessageEvent<Req>): void => {
  const { seq, level } = ev.data;
  current = seq;
  const post = (m: Res): void => { if (seq === current) self.postMessage(m); };

  try {
    const ls = level.meta.solution.launch_step;

    // 1단계 — 1° 대략 스캔
    const coarse = angles(level, ls, undefined, 1);
    const cm = splitOrNull(coarse.runs, 1);
    post({ seq, kind: 'coarse', width: cm.width, runs: coarse.runs });
    if (seq !== current) return;

    // 2단계 — 궤적 부채꼴 (눈으로 읽는 정보라 정밀 스캔보다 먼저 준다)
    post({ seq, kind: 'fan', paths: fan(level, ls) });
    if (seq !== current) return;

    // 3단계 — 0.25° 정밀 스캔 + 지표 전체. 여기 결과만 규칙 판정에 쓴다.
    post({ seq, kind: 'fine', report: checkLevel(level, computeMetrics(level)) });
  } catch (e) {
    post({ seq, kind: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
