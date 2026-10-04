// 힌트 시트. docs/PLAN.md §13.5, §14.3
//
// 문구는 i18n 사전에서 꺼낸다. 한국어는 §13.5 의 것 그대로다 (§0.6).
// 시트가 열려 있는 동안 단계 시계는 멈춘다 — 공전 단계의 타이밍 보호.

import type { AdProvider, RewardPlacement } from '../platform/ads.js';
import { type HintKind, type HintState, hintStatus } from '../monetization/hints.js';
import { type Key, t } from '../i18n/index.js';

/** §13.5 의 표 */
const ITEMS: readonly { kind: HintKind; title: Key; desc: Key }[] = [
  { kind: 'preview', title: 'hint.preview', desc: 'hint.preview.desc' },
  { kind: 'direction', title: 'hint.direction', desc: 'hint.direction.desc' },
  { kind: 'skip', title: 'hint.skip', desc: 'hint.skip.desc' },
];

const PLACEMENT: Record<HintKind, RewardPlacement> = {
  preview: 'hint_preview', direction: 'hint_direction', skip: 'skip',
};

/** §13.5 의 안내 문구 */
export const HINT_MSG = {
  freeGiven: 'hint.freeGiven',
  dismissed: 'hint.dismissed',
  unavailable: 'hint.unavailable',
} as const satisfies Record<string, Key>;

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 를 찾을 수 없습니다`);
  return el;
};

export interface HintHost {
  /** 지금 단계의 힌트 상태 */
  state(): HintState;
  /** 보상을 받았다. 저장하고 화면에 반영한다 */
  grant(kind: HintKind): void;
  /** 건너뛰기가 확정됐다 */
  skip(): void;
  /** 시트가 열리고 닫힐 때 — 단계 시계를 멈추고 다시 돌린다 */
  setPaused(on: boolean): void;
}

export class HintSheet {
  readonly el = $('hints');
  private busy = false;
  /** 안내 문구의 키. 그릴 때 번역한다 */
  private note: Key | '' = '';

  constructor(private readonly ads: AdProvider, private readonly host: HintHost) {
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      const kind = b.dataset['kind'] as HintKind | undefined;
      if (kind) void this.take(kind);
      else this.close();
    });
  }

  get open(): boolean { return !this.el.hidden; }

  show(): void {
    this.note = '';
    this.host.setPaused(true);
    this.el.hidden = false;
    this.render();
  }

  close(): void {
    this.el.hidden = true;
    this.host.setPaused(false);
  }

  /** 힌트 버튼에 점을 찍을지 — 받은 힌트가 있으면 표시한다 (§13.3) */
  hasAny(): boolean {
    const h = this.host.state();
    return h.got.preview || h.got.direction;
  }

  private async take(kind: HintKind): Promise<void> {
    if (this.busy) return;
    const h = this.host.state();
    const st = hintStatus(kind, h);
    if (st.state !== 'ready') return;

    // 광고가 없는 빌드(itch.io)는 조건만 맞으면 그냥 준다 (§15.6)
    if (this.ads.adFree) {
      if (kind === 'skip') { this.close(); this.host.skip(); return; }
      this.host.grant(kind);
      this.note = '';
      this.render();
      return;
    }

    // 무료 1회는 광고 없이 준다 (§14.3)
    if (st.free) {
      this.host.grant(kind);
      this.note = HINT_MSG.freeGiven;
      this.render();
      return;
    }

    if (!this.ads.isRewardedReady()) {
      this.note = HINT_MSG.unavailable;
      this.render();
      return;
    }

    this.busy = true;
    this.render();
    const r = await this.ads.showRewarded(PLACEMENT[kind]);
    this.busy = false;

    if (r === 'rewarded') {
      this.note = '';
      if (kind === 'skip') { this.close(); this.host.skip(); return; }
      this.host.grant(kind);
    } else {
      this.note = r === 'dismissed' ? HINT_MSG.dismissed : HINT_MSG.unavailable;
    }
    this.render();
  }

  private render(): void {
    const h = this.host.state();
    const rows = ITEMS.map(({ kind, title, desc }) => {
      const st = hintStatus(kind, h);
      let label: string;
      let disabled = this.busy;
      if (st.state === 'applied') { label = t('hint.applied'); disabled = true; }
      else if (st.state === 'locked') {
        label = t(kind === 'skip' ? 'hint.lockSkip' : 'hint.lockDirection');
        disabled = true;
      } else if (this.ads.adFree) label = t(kind === 'skip' ? 'hint.skipNow' : 'hint.getFree');
      else if (st.free) label = t('hint.getFree');
      else label = t(kind === 'skip' ? 'hint.watchSkip' : 'hint.watchGet');

      return `<div class="hintrow">
        <div><b>${t(title)}</b><p class="dim">${t(desc)}</p></div>
        <button class="btn hint" type="button" data-kind="${kind}"${disabled ? ' disabled' : ''}>${label}</button>
      </div>`;
    }).join('');

    this.el.innerHTML = `<div class="panel"><h2>${t('hint.title')}</h2>${rows}
      ${this.note ? `<p class="tapnote">${t(this.note)}</p>` : ''}
      <div class="row"><button class="btn" type="button">${t('hint.close')}</button></div></div>`;
  }
}
