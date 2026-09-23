// 언어. 한국어가 원본이고 나머지는 그 키를 그대로 따른다.
//
// 여기서 막는 것:
//   · 번역에서 문구가 빠지거나 남는 것 (tsc 도 막지만, 여기서도 다시 본다)
//   · 자리표시자({n} 등)가 언어마다 달라 숫자가 안 들어가는 것
//   · 새 단계를 등록하고 번역을 빠뜨리는 것 — CI 관문이다
import { afterEach, describe, expect, it } from 'vitest';

import { CHAPTERS, allIds } from '../src/levels/chapters.js';
import { loadLevel } from '../tools/levels-fs.js';
import {
  DICTS, LANGS, type Lang, detectLang, isLangSetting, resolveLang, setLang, t,
} from '../src/i18n/index.js';
import { ko } from '../src/i18n/ko.js';
import {
  CHAPTER_NAME, LEVEL_TEXT, chapterName, levelHint, levelName,
} from '../src/i18n/levels.js';

const OTHERS = LANGS.filter((l) => l !== 'ko') as Exclude<Lang, 'ko'>[];
const holes = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

afterEach(() => setLang('ko'));

describe('사전', () => {
  it('모든 언어가 한국어와 같은 키를 가진다', () => {
    const want = Object.keys(ko).sort();
    for (const l of LANGS) expect(Object.keys(DICTS[l]).sort(), l).toEqual(want);
  });

  it('자리표시자가 언어마다 같다', () => {
    for (const [k, v] of Object.entries(ko)) {
      for (const l of OTHERS) {
        expect(holes(DICTS[l][k as keyof typeof ko]), `${l} ${k}`).toEqual(holes(v));
      }
    }
  });

  it('빈 문구가 없다 — 영어 타이틀 부제만 예외(로고가 이미 영어다)', () => {
    for (const l of LANGS) {
      for (const [k, v] of Object.entries(DICTS[l])) {
        if (l === 'en' && k === 'title.sub') continue;
        expect(v.trim().length, `${l} ${k}`).toBeGreaterThan(0);
      }
    }
  });

  it('t() 는 지금 언어로, 자리표시자를 채워서 돌려준다', () => {
    expect(t('result.chapterCleared', { n: 3 })).toBe('3장을 클리어했어요');
    setLang('en');
    expect(t('result.chapterCleared', { n: 3 })).toBe('Chapter 3 cleared');
    setLang('ja');
    expect(t('result.stats', { sec: '4.0', n: 2 })).toBe('飛行時間 4.0秒 · 挑戦 2回');
  });
});

describe('단계와 장의 번역', () => {
  it('등록된 단계마다 세 언어의 이름이 있고, 원문에 힌트가 있으면 힌트도 있다', () => {
    for (const id of allIds()) {
      const L = loadLevel(id);
      for (const l of OTHERS) {
        const tx = LEVEL_TEXT[l][id];
        expect(tx, `${l} ${id} 이름이 없다`).toBeDefined();
        expect(tx![0].trim().length, `${l} ${id}`).toBeGreaterThan(0);
        expect(tx![1] !== undefined, `${l} ${id} 힌트 유무가 원문과 다르다`).toBe(L.hint !== undefined);
      }
    }
  });

  it('등록되지 않은 단계의 번역이 없다 — ID 오타를 잡는다', () => {
    const ids = new Set(allIds());
    for (const l of OTHERS) {
      for (const id of Object.keys(LEVEL_TEXT[l])) expect(ids.has(id), `${l} ${id}`).toBe(true);
    }
  });

  it('장마다 세 언어의 이름이 있다', () => {
    for (const c of CHAPTERS) {
      for (const l of OTHERS) expect(CHAPTER_NAME[l][c.chapter], `${l} ${c.chapter}장`).toBeTruthy();
    }
  });

  it('한국어는 단계 파일의 원문을 그대로 쓴다', () => {
    const L = loadLevel('1-1');
    expect(levelName(L)).toBe(L.name);
    expect(levelHint(L)).toBe(L.hint);
    expect(chapterName(1, '행성')).toBe('행성');
  });

  it('언어를 바꾸면 번역을 쓴다', () => {
    const L = loadLevel('1-1');
    setLang('zh');
    expect(levelName(L)).toBe('第一次引力弹弓');
    expect(chapterName(2, '블랙홀')).toBe('黑洞');
    expect(levelHint(loadLevel('1-6'))).toBeUndefined();     // 원문에 힌트가 없는 단계
  });
});

describe('언어 고르기', () => {
  it('브라우저 선호 목록에서 처음 맞는 언어', () => {
    expect(detectLang(['ko-KR', 'en-US'])).toBe('ko');
    expect(detectLang(['ja'])).toBe('ja');
    expect(detectLang(['fr-FR', 'ja-JP', 'en'])).toBe('ja');
    expect(detectLang(['en_GB'])).toBe('en');
  });

  it('중국어는 지역을 가리지 않고 간체로 간다', () => {
    expect(detectLang(['zh-CN'])).toBe('zh');
    expect(detectLang(['zh-TW'])).toBe('zh');
    expect(detectLang(['zh-Hant-HK'])).toBe('zh');
  });

  it('맞는 게 없으면 영어', () => {
    expect(detectLang(['fr', 'de'])).toBe('en');
    expect(detectLang([])).toBe('en');
  });

  it('설정이 auto 가 아니면 브라우저를 무시한다', () => {
    expect(resolveLang('ja', ['ko-KR'])).toBe('ja');
    expect(resolveLang('auto', ['ko-KR'])).toBe('ko');
  });

  it('저장값 검사 — 손상된 값은 받지 않는다', () => {
    expect(isLangSetting('auto')).toBe(true);
    expect(isLangSetting('zh')).toBe(true);
    expect(isLangSetting('zh-TW')).toBe(false);
    expect(isLangSetting(3)).toBe(false);
  });
});
