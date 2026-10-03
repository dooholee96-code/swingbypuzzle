// 팔레트. docs/PLAN.md §12.1, §12.6
//
// 테마 "달토끼 당근 로켓"(8비트). **NES(2C02) 팔레트의 칸만 쓴다.**
// 색은 이 파일 밖에서 쓰지 않는다 — tools/check-colors.mjs 가 막는다(§0.10).

/** NES 팔레트에서 이 테마가 쓰는 칸 ($00~$3B) */
export const NES = {
  '00': '#7C7C7C', '02': '#0000BC', '03': '#4428BC', '08': '#503000', '0D': '#000000',
  '10': '#BCBCBC', '14': '#D800CC', '16': '#F83800', '17': '#E45C10', '18': '#AC7C00', '1A': '#00A800',
  '21': '#3CBCFC', '22': '#6888FC', '23': '#9878F8', '24': '#F878F8', '25': '#F85898', '26': '#F87858',
  '27': '#FCA044', '28': '#F8B800', '2A': '#58D854', '2B': '#58F898',
  '30': '#FCFCFC', '31': '#A4E4FC', '32': '#B8B8F8', '33': '#D8B8F8', '35': '#F8A4C0', '36': '#F0D0B0',
  '37': '#FCE0A8', '38': '#F8D878', '3B': '#B8F8D8',
} as const;
type Nes = keyof typeof NES;

/** 스프라이트 격자의 한 글자 키 → NES 칸. 시안(sprites.js)의 KEY 그대로 */
const KEY: Readonly<Record<string, Nes>> = {
  K: '0D', W: '30', w: '10', g: '00', P: '35', p: '25', O: '27', o: '17', Y: '38', y: '28',
  C: '37', c: '36', L: '2A', l: '1A', B: '31', b: '21', V: '33', v: '23', U: '22', u: '03',
  n: '02', M: '3B', m: '2B', R: '26', r: '16', T: '18', t: '08', X: '14', x: '24', S: '32',
};

/** 스프라이트 키 → 색 */
export const PIX: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(KEY).map(([k, n]) => [k, NES[n]]),
);

/** 화면이 뜻으로 부르는 색. 이름은 선화 테마 때와 같고 값만 NES 칸이다 */
export const C = {
  /** 밤하늘 $22 */
  bg: NES['22'],
  /** 맵 바깥 $03 — 벽 너머를 어둡게 해 경계를 읽히게 한다 */
  void: NES['03'],
  line: NES['30'],
  /** 이전 시도 궤적처럼 한 단계 물러난 흰색 $32 */
  dim: NES['32'],
  gravity: NES['31'],
  hole: NES['33'],
  danger: NES['26'],
  /** 위험이 깜빡일 때의 짙은 빨강 $16 */
  dangerDark: NES['16'],
  goal: NES['38'],
  /* 성공을 뜻하는 초록. 방향 표시 힌트(§14.3)와 에디터의 성공 궤적이 쓴다 */
  win: NES['2A'],
  /* 미니맵 (§12.5) */
  miniBg: NES['03'],
  rock: NES['18'],
  ink: NES['0D'],
} as const;

/**
 * 개발자 도구(스테이지 에디터 §8.7, 후보 썸네일 SVG)의 색. 게임 테마와 따로 둔다 —
 * 가는 궤적 수십 줄을 겹쳐 보는 화면이라 어두운 바탕이 읽기 쉽다. 배포 번들에 들어가지 않는다.
 */
export const EDITOR = {
  bg: '#000000',
  line: '#E6EDF5',
  gravity: '#4FC3F7',
  hole: '#B388FF',
  danger: '#FF5252',
  goal: '#FFD54F',
  win: '#5FD38D',
  miniBg: 'rgba(0,0,0,.62)',
  rock: 'rgba(230,237,245,.35)',
} as const;

/** 토큰에 투명도를 입힌다. 에디터·도구가 쓴다. 게임 화면은 투명도 대신 점멸·디더(§12.1) */
export function alpha(hex: string, a: number): string {
  if (!hex.startsWith('#')) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
