// 트래커 악보 (§17 M18). DOM·WebAudio 를 쓰지 않는 순수 데이터와 파서 — 테스트가 여기를 본다.
//
// 파미컴(2A03)과 같은 네 채널: 펄스 둘, 삼각파(베이스), 노이즈(타악).
// 악보는 16분음표 한 칸에 토큰 하나. 음은 `C4`·`D#5`, `-` 는 앞 음을 잇고, `.` 는 쉼.
// 노이즈 채널은 `k`(킥) `s`(스네어) `h`(하이햇) `.`(쉼).

export type Duty = 0.125 | 0.25 | 0.5;

export interface Song {
  bpm: number;
  /** 채널별 토큰. 길이는 같아야 한다(16분음표 수) */
  p1: string[]; p2: string[]; tri: string[]; noise: string[];
  duty1: Duty; duty2: Duty;
  /** 펄스 음 하나의 감쇠(1 이면 유지, 0.5 면 칸이 끝날 때 반) — 통통 튀는 느낌 */
  decay1: number; decay2: number;
}

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** `A4` = 440. 반음 기호는 `#` 만 쓴다 */
export function noteHz(tok: string): number {
  const m = /^([A-G])(#?)(\d)$/.exec(tok);
  if (!m) throw new Error(`음이 아닙니다: ${tok}`);
  const semi = NAMES[m[1]!]! + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12;   // C-1 = 0
  return 440 * Math.pow(2, (semi - 69) / 12);
}

/** 공백으로 나눈 토큰. 줄바꿈·여러 칸 공백은 무시한다 */
export function tokens(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

/** 마디 문자열 몇 개를 이어 붙인다. 각 마디는 16칸이어야 한다 */
export function bars(...bs: string[]): string[] {
  const out: string[] = [];
  for (const b of bs) {
    const t = tokens(b);
    if (t.length !== 16) throw new Error(`마디는 16칸이어야 합니다 (${t.length}): ${b}`);
    out.push(...t);
  }
  return out;
}

/** 같은 마디를 n번 */
export const rep = (b: string, n: number): string[] => bars(...Array.from({ length: n }, () => b));

/**
 * 토큰 열을 "음 이벤트" 로 바꾼다: 어느 칸에서 무슨 음이 몇 칸 울리는가.
 * `-` 는 앞 음을 잇고, `.` 는 쉼이다.
 */
export interface NoteEvent { step: number; tok: string; len: number }
export function events(toks: string[]): NoteEvent[] {
  const out: NoteEvent[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (t === '.' || t === '-') continue;
    let len = 1;
    while (i + len < toks.length && toks[i + len] === '-') len++;
    out.push({ step: i, tok: t, len });
  }
  return out;
}

/** 악보가 네 채널 길이가 같고 음 이름이 전부 읽히는지 — 만들 때 한 번 확인한다 */
export function validate(s: Song): void {
  const n = s.p1.length;
  for (const [name, ch] of [['p2', s.p2], ['tri', s.tri], ['noise', s.noise]] as const) {
    if (ch.length !== n) throw new Error(`${name} 길이 ${ch.length} ≠ p1 ${n}`);
  }
  for (const ch of [s.p1, s.p2, s.tri]) for (const e of events(ch)) noteHz(e.tok);
  for (const t of s.noise) if (!/^[ksh.]$/.test(t)) throw new Error(`노이즈 토큰이 아닙니다: ${t}`);
}

// ── 곡 ─────────────────────────────────────────────────────────────────
// Claude 초안 악보(§17 M18 "샘플 BGM"). 사람이 트래커로 다시 쓸 수 있게 형식만 지켰다.

/** 타이틀·스테이지: 느긋한 C장조, 100bpm. I–V–vi–IV 를 두 바퀴 */
export const CALM: Song = {
  bpm: 100, duty1: 0.25, duty2: 0.125, decay1: 0.55, decay2: 0.7,
  p1: bars(
    'E5 - G5 - C6 - - - G5 - E5 - D5 - - -',
    'D5 - G5 - B5 - - - G5 - D5 - B4 - - -',
    'C5 - E5 - A5 - - - E5 - C5 - E5 - G5 -',
    'A5 - - - F5 - - - C5 - - - D5 - E5 -',
    'E5 - G5 - C6 - - - G5 - E5 - D5 - - -',
    'B5 - - - G5 - D5 - B4 - - - D5 - G5 -',
    'A5 - C6 - E6 - - - C6 - A5 - E5 - - -',
    'F5 - A5 - C6 - - - C6 - - - - - - -',
  ),
  p2: bars(
    '. . C4 . . . E4 . . . G4 . . . E4 .',
    '. . B3 . . . D4 . . . G4 . . . D4 .',
    '. . A3 . . . C4 . . . E4 . . . C4 .',
    '. . A3 . . . C4 . . . F4 . . . C4 .',
    '. . C4 . . . E4 . . . G4 . . . E4 .',
    '. . B3 . . . D4 . . . G4 . . . D4 .',
    '. . A3 . . . C4 . . . E4 . . . C4 .',
    '. . A3 . . . C4 . . . F4 . . . C4 .',
  ),
  tri: bars(
    'C2 - - - - - - - C3 - - - G2 - - -',
    'G2 - - - - - - - G3 - - - D3 - - -',
    'A2 - - - - - - - A3 - - - E3 - - -',
    'F2 - - - - - - - F3 - - - C3 - - -',
    'C2 - - - - - - - C3 - - - G2 - - -',
    'G2 - - - - - - - G3 - - - D3 - - -',
    'A2 - - - - - - - A3 - - - E3 - - -',
    'F2 - - - - - - - F3 - - - G2 - - -',
  ),
  noise: rep('k . h . s . h . k . h . s . h h', 8),
};

/** 인피니티: 달리는 A단조, 140bpm. 베이스가 옥타브로 뛰고 리프가 반복된다 */
export const DRIVE: Song = {
  bpm: 140, duty1: 0.5, duty2: 0.25, decay1: 0.5, decay2: 0.6,
  p1: bars(
    'A4 - A4 C5 E5 - D5 C5 A4 - - - G4 - A4 -',
    'A4 - A4 C5 E5 - G5 E5 D5 - - - C5 - D5 -',
    'F4 - F4 A4 C5 - B4 A4 F4 - - - E4 - F4 -',
    'G4 - G4 B4 D5 - C5 B4 E5 - - - D5 - E5 -',
    'A4 - A4 C5 E5 - D5 C5 A4 - - - G4 - A4 -',
    'A4 - A4 C5 E5 - G5 E5 A5 - - - G5 - E5 -',
    'F5 - E5 - D5 - C5 - B4 - C5 - D5 - B4 -',
    'E5 - - - E5 - - - E5 - D5 - C5 - B4 -',
  ),
  p2: bars(
    'A3 . . A3 . . A3 . A3 . . A3 . . A3 .',
    'A3 . . A3 . . A3 . A3 . . A3 . . A3 .',
    'F3 . . F3 . . F3 . F3 . . F3 . . F3 .',
    'G3 . . G3 . . G3 . G3 . . G3 . . G3 .',
    'A3 . . A3 . . A3 . A3 . . A3 . . A3 .',
    'A3 . . A3 . . A3 . A3 . . A3 . . A3 .',
    'F3 . . F3 . . F3 . D3 . . D3 . . D3 .',
    'E3 . . E3 . . E3 . E3 . E3 . E3 . E3 .',
  ),
  tri: bars(
    'A2 - A3 - A2 - A3 - A2 - A3 - A2 - A3 -',
    'A2 - A3 - A2 - A3 - A2 - A3 - A2 - A3 -',
    'F2 - F3 - F2 - F3 - F2 - F3 - F2 - F3 -',
    'G2 - G3 - G2 - G3 - G2 - G3 - G2 - G3 -',
    'A2 - A3 - A2 - A3 - A2 - A3 - A2 - A3 -',
    'A2 - A3 - A2 - A3 - A2 - A3 - A2 - A3 -',
    'F2 - F3 - F2 - F3 - D2 - D3 - D2 - D3 -',
    'E2 - E3 - E2 - E3 - E2 - E3 - E2 - E3 -',
  ),
  noise: bars(
    'k . h . s . h . k . h . s . h .',
    'k . h . s . h . k . h . s . h h',
    'k . h . s . h . k . h . s . h .',
    'k . h . s . h . k . h . s s h h',
    'k . h . s . h . k . h . s . h .',
    'k . h . s . h . k . h . s . h h',
    'k . h . s . h . k . h . s . h .',
    'k k h . s . h . k . s . s s s s',
  ),
};

/** 보스전: 긴장되는 E단조, 160bpm. 반음 내려오는 베이스와 짧은 외침 */
export const BOSS: Song = {
  bpm: 160, duty1: 0.125, duty2: 0.5, decay1: 0.45, decay2: 0.5,
  p1: bars(
    'E5 . E5 . . E5 . . D5 . . C5 . B4 . .',
    'E5 . E5 . . E5 . . G5 . . F5 . E5 . .',
    'E5 . E5 . . E5 . . D5 . . C5 . B4 . .',
    'A5 . G5 . F5 . E5 . D#5 - - - - - . .',
    'E5 . E5 . . E5 . . D5 . . C5 . B4 . .',
    'E5 . E5 . . E5 . . G5 . . F5 . E5 . .',
    'B5 . A5 . G5 . F5 . E5 . D5 . C5 . B4 .',
    'E5 - - - - - - - D#5 - - - - - - -',
  ),
  p2: bars(
    '. . E4 . . . E4 . . . D4 . . . C4 .',
    '. . E4 . . . E4 . . . G4 . . . F4 .',
    '. . E4 . . . E4 . . . D4 . . . C4 .',
    '. . A4 . . . F4 . . . B3 . . . B3 .',
    '. . E4 . . . E4 . . . D4 . . . C4 .',
    '. . E4 . . . E4 . . . G4 . . . F4 .',
    '. . G4 . . . F4 . . . D4 . . . B3 .',
    'E4 - - - - - - - B3 - - - - - - -',
  ),
  tri: bars(
    'E2 - - - E2 - E2 - D2 - - - C2 - B1 -',
    'E2 - - - E2 - E2 - G2 - - - F2 - E2 -',
    'E2 - - - E2 - E2 - D2 - - - C2 - B1 -',
    'A2 - G2 - F2 - E2 - D#2 - - - B1 - - -',
    'E2 - - - E2 - E2 - D2 - - - C2 - B1 -',
    'E2 - - - E2 - E2 - G2 - - - F2 - E2 -',
    'G2 - F2 - E2 - D2 - C2 - B1 - A1 - B1 -',
    'E2 - - - - - - - B1 - - - - - - -',
  ),
  noise: bars(
    'k . h h s . h . k . h h s . h .',
    'k . h h s . h . k . h h s . s s',
    'k . h h s . h . k . h h s . h .',
    'k k h h s . h . k . k . s s s s',
    'k . h h s . h . k . h h s . h .',
    'k . h h s . h . k . h h s . s s',
    'k . h h s . h . k . h h s . h .',
    'k . . . s . . . k . . . s s s s',
  ),
};

export const SONGS = { calm: CALM, drive: DRIVE, boss: BOSS } as const;
export type SongName = keyof typeof SONGS;
for (const s of Object.values(SONGS)) validate(s);
