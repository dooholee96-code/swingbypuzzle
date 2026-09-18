// 팔레트. docs/PLAN.md §12.1
export const C = {
  bg: '#000000',
  line: '#E6EDF5',
  gravity: '#4FC3F7',
  hole: '#B388FF',
  danger: '#FF5252',
  goal: '#FFD54F',
} as const;

export const WIDTH = 1.5;        // 선 굵기(유닛). 화면에서 최소 1 CSS px.
export const GLOW_WIDTH = 4;
export const GLOW_ALPHA = 0.18;
