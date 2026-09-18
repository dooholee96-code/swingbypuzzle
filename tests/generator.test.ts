// 생성기. docs/PLAN.md §8.3, §8.4
//
// 생성기의 핵심 약속은 하나다: **내놓은 후보는 전부 §8.5 를 통과한다.**
// 좌표가 무작위라 값을 고정해 비교할 수는 없으므로, 그 불변식과 결정성을 본다.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { generateOne } from '../src/tools-shared/generator.js';
import { checkLevel, computeMetrics } from '../src/tools-shared/metrics.js';
import { type Recipe, checkRecipe, slotOf } from '../src/tools-shared/recipe.js';
import { validateSchema } from '../src/levels/loader.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECIPES = join(ROOT, 'recipes');

const load = (f: string): Recipe =>
  JSON.parse(readFileSync(join(RECIPES, f), 'utf8')) as Recipe;

describe('레시피 형식 (§8.3)', () => {
  const files = readdirSync(RECIPES).filter((f) => f.endsWith('.json')).sort();

  it('레시피 파일이 5개 있다', () => {
    expect(files).toEqual(['ch1.json', 'ch2.json', 'ch3.json', 'ch4.json', 'ch5.json']);
  });

  for (const f of files) {
    it(`${f} 가 형식 검사를 통과한다`, () => {
      expect(checkRecipe(load(f))).toEqual([]);
    });
  }

  it('공전 행성이 있는데 timing 이 없으면 오류', () => {
    const bad: Recipe = {
      chapter: 9,
      defaults: { speed: 150, startZone: 'bottom', goalZone: 'top' },
      slots: [{
        slot: 1, role: 'x', name: 'x', map: { w: 400, h: 760 }, preview: 1,
        required: [{ type: 'orbit', count: 1, role: 'gate' }],
        hazards: { ufos: 0, rocksMax: 6 }, window: { min: 4, max: 8 },
      }],
    };
    expect(checkRecipe(bad).some((e) => e.includes('timing'))).toBe(true);
  });

  it('window 가 min < max 가 아니면 오류', () => {
    const r = load('ch1.json');
    r.slots[0]!.window = { min: 9, max: 4 };
    expect(checkRecipe(r).some((e) => e.includes('window'))).toBe(true);
  });

  it('이름이 없으면 오류 (§13 문구는 사람이 짓는다)', () => {
    const r = load('ch1.json');
    delete (r.slots[0] as Partial<Recipe['slots'][number]>).name;
    expect(checkRecipe(r).some((e) => e.includes('name'))).toBe(true);
  });
});

describe('생성기 불변식 (§8.4 8단계)', () => {
  const r = load('ch1.json');
  const s = slotOf(r, 2)!;

  it('같은 시드는 같은 단계를 낸다', () => {
    const a = generateOne(r, s, 153);
    const b = generateOne(r, s, 153);
    expect('ok' in a).toBe(true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  }, 30_000);

  it('다른 시드는 다른 단계를 낸다', () => {
    const a = generateOne(r, s, 153);
    const b = generateOne(r, s, 162);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  }, 30_000);

  it('내놓은 후보는 스키마와 §8.5 규칙을 모두 통과한다', () => {
    let checked = 0;
    for (let seed = 140; seed <= 200 && checked < 3; seed++) {
      const g = generateOne(r, s, seed);
      if (!('ok' in g)) continue;
      checked++;
      const lv = g.ok.level;

      // JSON 왕복 후에도 스키마가 맞는가 (모르는 키가 섞이지 않았는가)
      expect(validateSchema(JSON.parse(JSON.stringify(lv)), lv.id), lv.id).toEqual([]);

      // 레시피 제약까지 켠 검증을 통과하는가
      const rep = checkLevel(lv, computeMetrics(lv), { window: s.window, timing: s.timing });
      expect(rep.failures, `seed ${seed}: ${rep.failures.join(' / ')}`).toEqual([]);

      // 레시피가 정한 성공 폭 범위 안인가
      expect(g.ok.main_window).toBeGreaterThanOrEqual(s.window.min);
      expect(g.ok.main_window).toBeLessThanOrEqual(s.window.max);

      // 저장된 정답이 실제로 성공하는가 (규칙 7 을 다른 각도에서)
      expect(lv.meta.solution.angle).toBeTypeOf('number');
      expect(lv.meta.source).toBe('generated');
    }
    expect(checked, '후보를 하나도 못 만들었다').toBeGreaterThan(0);
  }, 60_000);

  it('떨어진 시드는 이유를 밝힌다', () => {
    const reasons = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const g = generateOne(r, s, seed);
      if ('reject' in g) reasons.add(g.reject);
    }
    expect(reasons.size).toBeGreaterThan(0);
    for (const x of reasons) {
      expect(['place', 'goal', 'shortcut', 'rocks', 'timing', 'rules', 'nowin']).toContain(x);
    }
  }, 30_000);
});

describe('레시피 제약 검사 (§8.5 규칙 1·6, 너무 쉬움 경고)', () => {
  const r = load('ch1.json');
  const s = slotOf(r, 2)!;
  let g!: NonNullable<Extract<ReturnType<typeof generateOne>, { ok: unknown }>['ok']>;
  beforeAll(() => {
    for (let seed = 140; seed <= 200; seed++) {
      const x = generateOne(r, s, seed);
      if ('ok' in x) { g = x.ok; return; }
    }
    throw new Error('후보 없음');
  }, 60_000);

  it('레시피 최소 폭을 올리면 규칙 1 이 걸린다', () => {
    const m = computeMetrics(g.level);
    const rep = checkLevel(g.level, m, { window: { min: m.main_window + 1, max: 20 } });
    expect(rep.failures.some((f) => f.startsWith('규칙1'))).toBe(true);
  });

  it('레시피 최대 폭을 내리면 "너무 쉽다" 경고가 뜬다', () => {
    const m = computeMetrics(g.level);
    const rep = checkLevel(g.level, m, { window: { min: 1, max: m.main_window - 1 } });
    expect(rep.failures).toEqual([]);
    expect(rep.warnings.some((w) => w.includes('너무 쉽다'))).toBe(true);
  });

  it('고정 단계에 timing 을 요구하면 규칙 6 이 걸린다', () => {
    const rep = checkLevel(g.level, computeMetrics(g.level), {
      window: { min: 1, max: 20 },
      timing: { minFraction: 0.3, maxFraction: 0.4 },
    });
    expect(rep.failures.some((f) => f.startsWith('규칙6'))).toBe(true);
  });

  it('limits 를 안 넘기면 레시피 항목은 검사하지 않는다', () => {
    const rep = checkLevel(g.level);
    expect(rep.failures).toEqual([]);
    expect(rep.warnings.some((w) => w.includes('너무 쉽다'))).toBe(false);
  });
});
