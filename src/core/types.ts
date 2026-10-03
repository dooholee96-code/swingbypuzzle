// 레벨 스키마. docs/PLAN.md §6.1

export interface Orbit { cx: number; cy: number; rad: number; period: number; phase: number }

export type Role = 'required' | 'optional' | 'gate';

export interface Planet {
  x: number; y: number; r: number; g: number; R: number; sides: number;
  ring?: boolean; role?: Role; orbit?: Orbit;
}
export interface Hole { x: number; y: number; rH: number; g: number; R: number; role?: Role }
export interface Rock { x: number; y: number; r: number; seed: number }
export interface Ufo {
  x: number; y: number; range: number; interval: number; delay: number; bs: number;
}
export interface Goal { x: number; y: number; r: number }
/**
 * 궤도 행성 (§22.4). 중력은 없다. 중심에서 cr 안에 들어오면 우주선이 붙잡혀 그 원을
 * 돌고, 탭하면 접선 방향으로 나간다. r 은 몸체(충돌), sides 는 색 세트.
 */
export interface Dock { x: number; y: number; r: number; cr: number; sides: number }

/** 중력원. 행성과 블랙홀이 같은 공식을 쓴다 (§5.3). */
export type Grav = Planet | Hole;

export interface Metrics {
  /** 저장된 solution.launch_step 에서의 성공 폭. 힌트의 방향 표시가 쓴다 (§14.3) */
  main_window: number;
  /** 최적 발사 시점의 폭. 저장된 시점과 다를 때만 있다 (공전 단계) */
  main_window_best?: number;
  best_launch_step?: number;
  flight_time: number;
  clearance: number;
  timing_fraction?: number;
  timing_range?: [number, number];
  /** 분사 단계(§22.2): 분사 타이밍(초)·탭 방향(°)의 연속 성공 폭 */
  turn_timing?: number;
  turn_delta?: number;
  /** 궤도 행성 단계(§22.4): 나가기 타이밍(초)의 연속 성공 폭 */
  release_timing?: number;
  difficulty: number;
}

export interface Meta {
  chapter: number; slot: number; role: string;
  intro?: 'planet' | 'rock' | 'hole' | 'ufo' | 'orbit' | 'wide' | 'turn' | 'infinity' | 'dock';
  /**
   * turns: 분사 기록 (§22.1). 6장부터. 없으면 분사 없이 풀리는 단계다.
   * releases: 궤도 행성에서 나간 비행 스텝 (§22.4). 7장부터
   */
  solution: { angle: number; launch_step: number; turns?: Turn[]; releases?: number[] };
  metrics?: Metrics;
  source: 'verified' | 'generated' | 'editor';
  updated: string;
}

export interface Level {
  id: string;
  name: string;
  w: number; h: number;
  speed: number;
  preview: number;
  start: { x: number; y: number };
  goal: Goal;
  planets?: Planet[];
  holes?: Hole[];
  rocks?: Rock[];
  ufos?: Ufo[];
  /** 궤도 행성 (§22.4). 7장부터 */
  docks?: Dock[];
  hint?: string;
  /** 쓸 수 있는 분사 횟수 (§22.1). 없으면 0 — 1~5장 */
  turns?: number;
  meta: Meta;
}

/** 분사 한 번. 비행 시계 step 째 스텝을 밟기 직전에 dir(°, 월드각) 쪽으로 꺾는다 */
export interface Turn { step: number; dir: number }

/** §5.4 의 결과 종류. '' 는 "아직 계속"을 뜻한다. */
export type Outcome =
  | 'planet' | 'hole' | 'rock' | 'ufo' | 'wall' | 'shot' | 'drift' | 'win';

export interface ShipState { x: number; y: number; vx: number; vy: number }
export interface Bullet { x: number; y: number; vx: number; vy: number; age: number }
export interface SimState { bullets: Bullet[]; nextFire: number[] }
