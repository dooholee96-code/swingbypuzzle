// 저장 데이터. docs/PLAN.md §15.2, §17 M6
//
// 한 번 읽어 메모리에 두고, 변경 시 500ms 디바운스로 기록한다.
// 페이지를 떠날 때 즉시 기록한다. 읽기·파싱에 실패하면 기본값으로 시작한다.

const KEY = 'swingby.save.v1';
const VERSION = 1;
const DEBOUNCE = 500;

export interface LevelSave {
  cleared: boolean; skipped: boolean;
  attempts: number; fails: number; best_time: number | null;
  hints: { preview: boolean; direction: boolean };
}
export interface SaveData {
  version: number;
  levels: Record<string, LevelSave>;
  seen_intros: string[];
  settings: { sfx: boolean; haptics: boolean; glow: 'normal' | 'low'; reduce_motion: boolean };
  ads: {
    free_hint_used: boolean; clears_since_interstitial: number;
    last_interstitial_at: number | null; last_rewarded_at: number | null;
  };
}

const defaults = (): SaveData => ({
  version: VERSION,
  levels: {},
  seen_intros: [],
  settings: { sfx: true, haptics: true, glow: 'normal', reduce_motion: false },
  ads: {
    free_hint_used: false, clears_since_interstitial: 0,
    last_interstitial_at: null, last_rewarded_at: null,
  },
});

const levelDefaults = (): LevelSave => ({
  cleared: false, skipped: false, attempts: 0, fails: 0, best_time: null,
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

  record(id: string, outcome: string, seconds: number): void {
    const l = this.level(id);
    l.attempts++;
    if (outcome === 'win') {
      l.cleared = true;
      if (l.best_time === null || seconds < l.best_time) l.best_time = seconds;
    } else l.fails++;
    this.touch();
  }
}

/** 저장된 값이 기본 구조의 새 키를 잃지 않도록 한 겹씩 덮어쓴다. */
function merge(base: unknown, over: unknown): unknown {
  if (typeof base !== 'object' || base === null) return over;
  if (typeof over !== 'object' || over === null) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    out[k] = k in out ? merge(out[k], v) : v;
  }
  return out;
}
