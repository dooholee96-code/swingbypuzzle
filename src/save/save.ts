// 저장 데이터. docs/PLAN.md §15.2, §17 M6
//
// 한 번 읽어 메모리에 두고, 변경 시 500ms 디바운스로 기록한다.
// 페이지를 떠날 때 즉시 기록한다. 읽기·파싱에 실패하면 기본값으로 시작한다.

import type { LangSetting } from '../i18n/index.js';

const KEY = 'swingby.save.v1';
const VERSION = 1;
const DEBOUNCE = 500;

export interface LevelSave {
  cleared: boolean; skipped: boolean;
  attempts: number; fails: number; best_time: number | null;
  /** 별 (§13.2). 깰 때마다 최고치를 남긴다. 옛 저장에는 없다 → 0 */
  stars: number;
  hints: { preview: boolean; direction: boolean };
}
export interface SaveData {
  version: number;
  levels: Record<string, LevelSave>;
  seen_intros: string[];
  settings: {
    sfx: boolean; haptics: boolean; glow: 'normal' | 'low'; reduce_motion: boolean;
    /** 화면 언어. auto 면 브라우저 언어를 따른다 */
    lang: LangSetting;
    /** 사용자가 모션 줄이기를 직접 건드린 적이 있는가.
     *  없으면 OS 의 prefers-reduced-motion 을 따른다 (§12.4) */
    reduce_motion_set: boolean;
    /** 화면 배율 (§11). 폰에서 요소가 작아 1.5배가 기본 */
    zoom: 'fit' | 'x15' | 'x2';
    /** 그리는 프레임. 물리는 240Hz 고정이라 30 이어도 결과가 같다 (§5.8) */
    fps: 60 | 30;
  };
  ads: {
    free_hint_used: boolean; clears_since_interstitial: number;
    last_interstitial_at: number | null; last_rewarded_at: number | null;
  };
  /** 인피니티(§22.3): 최고 기록(초)과 판 수. daily 는 오늘의 우주 — 날짜가 바뀌면 비운다 */
  infinity: { best: number; runs: number; daily: { day: string; best: number; runs: number } };
  /** 메시에 도감 (§22.7): 번호 → 처음 찾은 곳(단계 ID 또는 'infinity') */
  messier: Record<string, string>;
}

const defaults = (): SaveData => ({
  version: VERSION,
  levels: {},
  seen_intros: [],
  settings: {
    sfx: true, haptics: true, glow: 'normal',
    reduce_motion: false, reduce_motion_set: false, lang: 'auto', zoom: 'x15', fps: 60,
  },
  ads: {
    free_hint_used: false, clears_since_interstitial: 0,
    last_interstitial_at: null, last_rewarded_at: null,
  },
  infinity: { best: 0, runs: 0, daily: { day: '', best: 0, runs: 0 } },
  messier: {},
});

const levelDefaults = (): LevelSave => ({
  cleared: false, skipped: false, attempts: 0, fails: 0, best_time: null, stars: 0,
  hints: { preview: false, direction: false },
});

export class Save {
  data: SaveData = defaults();
  private timer: ReturnType<typeof setTimeout> | null = null;

  load(): void {
    this.data = defaults();
    let raw: string | null = null;
    try { raw = localStorage.getItem(KEY); } catch { return; }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (parsed?.version !== VERSION) return;   // 판이 다르면 기본값으로 시작
      this.data = merge(defaults(), parsed) as SaveData;
    } catch { /* 손상된 값은 버리고 기본값으로 간다 */ }
  }

  touch(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), DEBOUNCE);
  }

  flush(): void {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* 무시 */ }
  }

  level(id: string): LevelSave {
    return (this.data.levels[id] ??= levelDefaults());
  }

  cleared(id: string): boolean { return this.data.levels[id]?.cleared ?? false; }

  /** 비행 결과 하나. 성공이면 별과 최고 시간을 최고치로 남기고, 시간이 줄었는지 알려 준다 */
  record(id: string, outcome: string, seconds: number, stars = 0): { newBest: boolean } {
    const l = this.level(id);
    l.attempts++;
    let newBest = false;
    if (outcome === 'win') {
      // 처음 깬 것은 "최고 기록 경신" 으로 치지 않는다 — 비교할 기록이 없다
      newBest = l.best_time !== null && seconds < l.best_time;
      l.cleared = true;
      l.stars = Math.max(l.stars, stars);
      if (l.best_time === null || seconds < l.best_time) l.best_time = seconds;
    } else l.fails++;
    this.touch();
    return { newBest };
  }
}

/**
 * 저장된 값이 기본 구조의 새 키를 잃지 않도록 한 겹씩 덮어쓴다.
 *
 * **배열은 통째로 갈아 끼운다.** 객체처럼 한 겹씩 합치면 `['planet']` 이
 * `{0:'planet'}` 이 되어 `.includes` 가 사라진다 — seen_intros 가 비어 있지
 * 않은 저장 데이터를 읽으면 소개 카드 판정에서 터졌다(M9 에서 발견).
 */
function merge(base: unknown, over: unknown): unknown {
  if (typeof base !== 'object' || base === null) return over;
  if (typeof over !== 'object' || over === null) return base;
  if (Array.isArray(base) || Array.isArray(over)) {
    return Array.isArray(over) ? over : base;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    out[k] = k in out ? merge(out[k], v) : v;
  }
  return out;
}
