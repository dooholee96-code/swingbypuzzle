// 글꼴. 싣는 픽셀 글꼴은 화면에 나오는 글자만 남기고 잘랐다(§18 첫 화면 200KB).
//
// 문구를 고쳐 새 글자가 생기면 여기서 막힌다 — 그 글자만 시스템 글꼴로 그려져
// 픽셀 글자 사이에 매끈한 글자가 섞인다. 고치는 법: npm run fonts
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { fontChars } from '../tools/font-chars.js';
import type { Lang } from '../src/i18n/index.js';

const DIR = new URL('../src/ui/fonts/', import.meta.url);
const GLYPHS = JSON.parse(readFileSync(new URL('glyphs.json', DIR), 'utf8')) as Record<string, string>;

/** 언어마다 styles.css 의 --text 가 쓰는 글꼴 순서 */
const STACK: Record<Lang, string[]> = {
  ko: ['galmuri11.woff2', 'fusion-zh.woff2'],
  en: ['galmuri11.woff2', 'fusion-zh.woff2'],
  ja: ['galmuri11.woff2', 'fusion-zh.woff2'],
  zh: ['fusion-zh.woff2', 'galmuri11.woff2'],
};

/** 어느 픽셀 글꼴에도 없어 시스템 글꼴로 그리는 글자. 시안(목업)도 그렇게 그렸다 */
const SYSTEM_OK = new Set(['✓']);

describe('픽셀 글꼴이 화면의 글자를 다 담는다', () => {
  const chars = fontChars();
  for (const l of Object.keys(STACK) as Lang[]) {
    it(`${l}`, () => {
      const have = new Set(STACK[l].flatMap((f) => [...(GLYPHS[f] ?? '')]));
      const miss = [...chars[l]].filter((c) => !have.has(c) && !SYSTEM_OK.has(c));
      expect(miss.join(''), `npm run fonts 로 다시 자르세요`).toBe('');
    });
  }
});

describe('글꼴 크기 (§18)', () => {
  it('네 파일을 합쳐 100KB 안 — 첫 화면 200KB 예산의 절반', () => {
    const total = Object.keys(GLYPHS).reduce((s, f) => s + statSync(new URL(f, DIR)).size, 0);
    expect(total).toBeLessThan(100 * 1024);
  });
});
