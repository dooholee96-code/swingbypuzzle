// 화면에 나올 수 있는 글자를 언어별로 모은다. tools/subset-fonts.py 와 tests/fonts.test.ts 가 쓴다.
//
// 글꼴을 이 글자만 남기고 잘라 싣는다(§18 첫 화면 200KB). 문구를 고쳐 새 글자가
// 생기면 tests/fonts.test.ts 가 막고, npm run fonts 로 다시 자른다.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { DICTS, LANG_NAME, type Lang } from '../src/i18n/index.js';
import { CHAPTER_NAME, LEVEL_TEXT } from '../src/i18n/levels.js';
import { CHAPTERS } from '../src/levels/chapters.js';
import { DATA_DIR } from './levels-fs.js';

/** 모든 언어 화면에 공통으로 나오는 글자. 숫자·기호, 언어 선택 목록의 이름들 */
const COMMON = '0123456789 .,:;!?-+−×·…°%()[]/\'"↷✓SWINGBYswingby'
  + Object.values(LANG_NAME).join('');

export function fontChars(): Record<Lang, string> {
  const by: Record<Lang, Set<string>> = { ko: new Set(), en: new Set(), ja: new Set(), zh: new Set() };
  const add = (l: Lang, s: string): void => { for (const ch of s) by[l].add(ch); };
  for (const l of Object.keys(DICTS) as Lang[]) {
    for (const v of Object.values(DICTS[l])) add(l, v);
    add(l, COMMON);
  }
  for (const f of readdirSync(DATA_DIR)) {
    if (!f.endsWith('.json')) continue;
    const d = JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8')) as { id: string; name: string; hint?: string };
    add('ko', d.id + d.name + (d.hint ?? ''));
  }
  for (const c of CHAPTERS) add('ko', c.name);
  for (const l of ['en', 'ja', 'zh'] as const) {
    for (const [id, [n, h]] of Object.entries(LEVEL_TEXT[l])) add(l, id + n + (h ?? ''));
    for (const v of Object.values(CHAPTER_NAME[l])) add(l, v);
  }
  const out = {} as Record<Lang, string>;
  for (const l of Object.keys(by) as Lang[]) out[l] = [...by[l]].filter((c) => c.trim()).sort().join('');
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(JSON.stringify(fontChars()));
