// 힌트 시트. docs/PLAN.md §13.5, §14.3
//
// 문구는 §13.5 의 것을 그대로 쓴다 (§0.6).
// 시트가 열려 있는 동안 단계 시계는 멈춘다 — 공전 단계의 타이밍 보호.

import type { AdProvider, RewardPlacement } from '../platform/ads.js';
import { type HintKind, type HintState, hintStatus } from '../monetization/hints.js';

/** §13.5 의 표 */
const ITEMS: { kind: HintKind; title: string; desc: string }[] = [
  { kind: 'preview', title: '긴 예측선', desc: '궤도를 더 멀리까지 미리 볼 수 있어요' },
  { kind: 'direction', title: '방향 표시', desc: '성공하는 발사 방향을 알려 드려요' },
  { kind: 'skip', title: '건너뛰기', desc: '이 단계를 넘기고 다음 단계를 열어요' },
];

const PLACEMENT: Record<HintKind, RewardPlacement> = {
  preview: 'hint_preview', direction: 'hint_direction', skip: 'skip',
};

/** §13.5 의 안내 문구 */
export const HINT_MSG = {
  freeGiven: '이번 힌트는 무료로 드렸어요',
  dismissed: '광고를 끝까지 보면 받을 수 있어요',
  unavailable: '지금은 광고를 불러올 수 없어요. 잠시 후 다시 시도해 주세요',
} as const;

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
  private note = '';

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
      if (st.state === 'applied') { label = '적용됨'; disabled = true; }
      else if (st.state === 'locked') {
        label = kind === 'skip' ? '다섯 번 실패하면 열려요' : '두 번 실패하면 열려요';
        disabled = true;
      } else if (st.free) label = '무료로 받기';
      else label = kind === 'skip' ? '광고 보고 건너뛰기' : '광고 보고 받기';

      return `<div class="hintrow">
        <div><b>${title}</b><p class="dim">${desc}</p></div>
        <button class="btn" type="button" data-kind="${kind}"${disabled ? ' disabled' : ''}>${label}</button>
      </div>`;
    }).join('');

    this.el.innerHTML = `<h2>힌트</h2>${rows}
      ${this.note ? `<p class="tapnote">${this.note}</p>` : ''}
      <div class="row"><button class="btn" type="button">닫기</button></div>`;
  }
}
