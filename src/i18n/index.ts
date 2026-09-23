// 언어. 한국어가 원본이고 영어·일본어·중국어(간체)를 더한다.
//
// 화면 문구는 전부 t() 로 꺼낸다. 단계 이름과 힌트는 levels.ts 가 맡는다 —
// 한국어 원문은 단계 JSON 에 그대로 두고(생성기가 쓰고 검증기가 보는 파일이다),
// 번역만 따로 둔다.
//
// DOM 을 모른다. 브라우저 언어는 호출자가 navigator.languages 를 넘긴다.

import { type Dict, type Key, ko } from './ko.js';
import { en } from './en.js';
import { ja } from './ja.js';
import { zh } from './zh.js';

export type { Key };
export type Lang = 'ko' | 'en' | 'ja' | 'zh';
/** 설정에 저장하는 값. auto 면 브라우저 언어를 따른다 */
export type LangSetting = Lang | 'auto';

export const LANGS: readonly Lang[] = ['ko', 'en', 'ja', 'zh'];

/** 설정 화면에 보이는 이름. **각 언어로 쓴다** — 못 읽는 언어로 바뀌어도 자기 언어를 찾을 수 있게 */
export const LANG_NAME: Readonly<Record<Lang, string>> = {
  ko: '한국어', en: 'English', ja: '日本語', zh: '简体中文',
};

/** <html lang>. 브라우저가 한자 글꼴을 고르는 근거라 중국어는 간체를 밝힌다 */
export const HTML_LANG: Readonly<Record<Lang, string>> = {
  ko: 'ko', en: 'en', ja: 'ja', zh: 'zh-Hans',
};

export const DICTS: Readonly<Record<Lang, Dict>> = { ko, en, ja, zh };

let cur: Lang = 'ko';

export function setLang(l: Lang): void { cur = l; }
export function getLang(): Lang { return cur; }

/** 문구 하나. {이름} 자리표시자를 vars 로 채운다. */
export function t(key: Key, vars?: Readonly<Record<string, string | number>>): string {
  const s = DICTS[cur][key];
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/**
 * 브라우저가 알려 준 선호 언어 목록에서 처음 맞는 것. 없으면 영어.
 *
 * 중국어는 지역을 가리지 않고 간체로 보낸다. 번체(zh-TW·zh-HK) 사용자에게
 * 영어보다는 간체가 낫다고 봤다 — 번체를 따로 두게 되면 여기서 가른다.
 */
export function detectLang(prefs: readonly string[]): Lang {
  for (const p of prefs) {
    const base = p.toLowerCase().split(/[-_]/)[0];
    if (base === 'ko' || base === 'en' || base === 'ja' || base === 'zh') return base;
  }
  return 'en';
}

export function resolveLang(s: LangSetting, prefs: readonly string[]): Lang {
  return s === 'auto' ? detectLang(prefs) : s;
}

export function isLangSetting(v: unknown): v is LangSetting {
  return v === 'auto' || (typeof v === 'string' && (LANGS as readonly string[]).includes(v));
}
