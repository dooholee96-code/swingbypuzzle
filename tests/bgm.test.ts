// 8비트 BGM 악보 (§17 M18). 음 이름·마디 길이·네 채널 길이가 맞는지 — 연주는 브라우저에서 듣는다.
import { describe, expect, it } from 'vitest';
import { SONGS, bars, events, noteHz, rep, tokens, validate } from '../src/audio/tracker.js';

describe('음 이름', () => {
  it('A4 = 440, C4 ≈ 261.63, 반음은 #', () => {
    expect(noteHz('A4')).toBeCloseTo(440, 6);
    expect(noteHz('C4')).toBeCloseTo(261.63, 1);
    expect(noteHz('D#5')).toBeCloseTo(622.25, 1);
    expect(() => noteHz('H2')).toThrow();
  });
});

describe('마디', () => {
  it('16칸이 아니면 거부, rep 는 n번', () => {
    expect(() => bars('C4 - - -')).toThrow();
    expect(rep('k . h . s . h . k . h . s . h h', 3)).toHaveLength(48);
    expect(tokens('  C4   -  . ')).toEqual(['C4', '-', '.']);
  });
  it('이음표는 길이로, 쉼은 빠진다', () => {
    expect(events(['C4', '-', '-', '.', 'E4', '-', '.', 'G4'])).toEqual([
      { step: 0, tok: 'C4', len: 3 }, { step: 4, tok: 'E4', len: 2 }, { step: 7, tok: 'G4', len: 1 },
    ]);
  });
});

describe('곡', () => {
  it('세 곡 모두 네 채널 길이가 같고 8마디(128칸)다', () => {
    for (const [name, s] of Object.entries(SONGS)) {
      expect(s.p1.length, name).toBe(128);
      expect(() => validate(s), name).not.toThrow();
    }
  });
  it('길이가 다르면 validate 가 잡는다', () => {
    const s = { ...SONGS.calm, tri: SONGS.calm.tri.slice(0, 100) };
    expect(() => validate(s)).toThrow();
  });
});
