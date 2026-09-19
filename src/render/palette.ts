// 팔레트. docs/PLAN.md §12.1
export const C = {
  bg: '#000000',
  line: '#E6EDF5',
  gravity: '#4FC3F7',
  hole: '#B388FF',
  danger: '#FF5252',
  goal: '#FFD54F',
  /* 성공을 뜻하는 초록. 방향 표시 힌트(§14.3)와 에디터의 성공 궤적이 쓴다 */
  win: '#5FD38D',
  /* 미니맵 (§12.5). styles.css 의 --mini-bg, --rock 과 같은 값이어야 한다 */
  miniBg: 'rgba(0,0,0,.62)',
  rock: 'rgba(230,237,245,.35)',
} as const;

/** 토큰에 투명도를 입힌다. 색 리터럴을 새로 쓰지 않기 위한 헬퍼 (§12.6). */
export function alpha(hex: string, a: number): string {
  if (!hex.startsWith('#')) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const WIDTH = 1.5;        // 선 굵기(유닛). 화면에서 최소 1 CSS px.
export const GLOW_WIDTH = 4;
export const GLOW_ALPHA = 0.18;
