// 에디터 저장 경로 제한. docs/PLAN.md §8.7
//
// "쓰기 경로는 src/levels/data/ 와 candidates/ 로 제한하고, 그 밖의 경로
// 요청은 거부한다" — 개발 서버에만 붙는 엔드포인트지만 경계는 경계다.

import { describe, expect, it } from 'vitest';
import { safePath } from '../tools/editor-plugin.js';

const NUL = String.fromCharCode(0);

describe('safePath — 허용', () => {
  for (const p of [
    'src/levels/data/1-1.json',
    'src/levels/data/9-9.json',
    'candidates/2-3/cand-01.json',
  ]) it(p, () => { expect(safePath(p)).not.toBeNull(); });
});

describe('safePath — 거부', () => {
  const cases: [string, string][] = [
    ['허용 폴더 밖', 'package.json'],
    ['.json 이 아니다', 'src/main.ts'],
    ['코어 폴더', 'src/core/constants.json'],
    ['저장소 밖', '../secrets.json'],
    ['거슬러 올라가기', 'src/levels/data/../../../etc/x.json'],
    ['절대 경로', '/etc/passwd.json'],
    ['후보 폴더에서 빠져나가기', 'candidates/../src/main.json'],
    ['널 바이트', `src/levels/data/x.json${NUL}.txt`],
    ['접두사만 같은 다른 폴더', 'src/levels/datax/1.json'],
  ];
  for (const [name, p] of cases) it(name, () => { expect(safePath(p)).toBeNull(); });
});

describe('safePath — 잘못된 입력', () => {
  it('문자열이 아니면 거부', () => {
    expect(safePath(undefined as unknown as string)).toBeNull();
    expect(safePath(42 as unknown as string)).toBeNull();
  });
});
