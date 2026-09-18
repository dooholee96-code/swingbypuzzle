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
  difficulty: number;
}

export interface Meta {
  chapter: number; slot: number; role: string;
  intro?: 'planet' | 'rock' | 'hole' | 'ufo' | 'orbit' | 'wide';
  solution: { angle: number; launch_step: number };
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
  hint?: string;
  meta: Meta;
}

/** §5.4 의 결과 종류. '' 는 "아직 계속"을 뜻한다. */
export type Outcome =
  | 'planet' | 'hole' | 'rock' | 'ufo' | 'wall' | 'shot' | 'drift' | 'win';

export interface ShipState { x: number; y: number; vx: number; vy: number }
export interface Bullet { x: number; y: number; vx: number; vy: number; age: number }
export interface SimState { bullets: Bullet[]; nextFire: number[] }
