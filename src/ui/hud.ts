// HUD 와 결과·단계 선택. docs/PLAN.md §13
//
// 문구는 §13 의 것을 그대로 쓴다 (§0.6).

import { toUi } from '../core/angle.js';
import { CHAPTERS } from '../levels/chapters.js';
import type { Outcome } from '../core/types.js';
import type { Session } from '../game/session.js';

/** §13.4 결과 화면 문구 */
export const RESULT: Record<Outcome, [string, string]> = {
  win: ['도착했어요', ''],
  planet: ['행성에 충돌했어요', '조금 더 바깥쪽으로 스쳐 지나가 보세요'],
  hole: ['블랙홀에 빨려 들어갔어요', '블랙홀 중심에서 거리를 더 두세요'],
  shot: ['외계인 포격에 맞았어요', '붉은 원 안에 머무는 시간을 줄여 보세요'],
  ufo: ['외계인 우주선과 충돌했어요', '발사 각도를 조금 바꿔 보세요'],
  rock: ['소행성에 부딪혔어요', '발사 각도를 조금 바꿔 보세요'],
  wall: ['맵 경계에 부딪혔어요', '궤도가 덜 꺾였어요. 행성에 조금 더 가까이 지나가 보세요'],
  drift: ['30초 안에 도착하지 못했어요', '행성 주위를 맴돌지 않게 각도를 바꿔 보세요'],
};

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 를 찾을 수 없습니다`);
  return el;
};

export class Hud {
  readonly stage = $('stage');
  readonly angle = $('angle');
  readonly hint = $('hint');
  readonly result = $('result');
  readonly picker = $('picker');
  readonly back = $('back') as HTMLButtonElement;
  readonly retry = $('retry') as HTMLButtonElement;

  onRetry: () => void = () => {};
  onNext: () => void = () => {};
  onPick: (id: string) => void = () => {};
  onOpenPicker: () => void = () => {};

  private chapter = 1;

  constructor() {
    this.retry.addEventListener('click', () => this.onRetry());
    this.back.addEventListener('click', () => this.onOpenPicker());
    // 실패 결과는 화면 아무 곳이나 탭해도 재시도 (§13.4)
    this.result.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.onRetry();
    });
  }

  refresh(s: Session): void {
    this.stage.textContent = `${s.level.id} ${s.level.name}`;
    this.angle.textContent = s.state === 'aiming' && s.aimFar
      ? `각도 ${toUi(s.angle).toFixed(1)}°` : '';
    // 첫 시도의 ready 상태에서만 레벨 hint (§13.3)
    this.hint.textContent = s.firstTry && s.state === 'ready' ? (s.level.hint ?? '') : '';
  }

  showResult(s: Session): void {
    if (!this.result.hidden) return;
    const [title, tip] = RESULT[s.outcome as Outcome] ?? ['비행이 끝났어요', ''];
    const win = s.outcome === 'win';
    this.result.className = `sheet ${win ? 'win' : 'lose'}`;
    this.result.innerHTML = `
      <h2></h2><p></p>
      <div class="row">
        ${win
          ? '<button class="btn primary" data-a="next" type="button">다음 단계</button>' +
            '<button class="btn" data-a="retry" type="button">다시 하기</button>'
          : '<button class="btn primary" data-a="retry" type="button">다시 시도</button>'}
        <button class="btn" data-a="pick" type="button">단계 선택</button>
      </div>
      ${win ? '' : '<p class="tapnote">화면 아무 곳이나 눌러도 다시 시도해요</p>'}`;
    this.result.querySelector('h2')!.textContent = title;
    this.result.querySelector('p')!.textContent = win
      ? `비행 시간 ${s.flightSeconds().toFixed(1)}초 · 시도 ${s.attempts}회` : tip;
    for (const b of this.result.querySelectorAll<HTMLButtonElement>('button')) {
      b.addEventListener('click', () => {
        const a = b.dataset['a'];
        if (a === 'next') this.onNext();
        else if (a === 'pick') this.onOpenPicker();
        else this.onRetry();
      });
    }
    this.result.hidden = false;
  }

  hideResult(): void { this.result.hidden = true; }

  /** §13.2 단계 선택. 장 탭 + 단계 카드. */
  showPicker(cleared: (id: string) => boolean, names: (id: string) => string): void {
    const tabs = CHAPTERS.map((c) =>
      `<button class="tab" data-ch="${c.chapter}" type="button"
        aria-selected="${c.chapter === this.chapter}">${c.chapter}장 ${c.name}</button>`).join('');
    const ch = CHAPTERS.find((c) => c.chapter === this.chapter) ?? CHAPTERS[0]!;
    const cards = ch.levels.map((id) => `
      <button class="card" data-id="${id}" type="button">
        <span class="id">${id}</span>
        <span class="nm">${names(id)}</span>
        <span class="st${cleared(id) ? ' done' : ''}">${cleared(id) ? '✓ 클리어' : '미클리어'}</span>
      </button>`).join('');
    this.picker.innerHTML = `<h1>SWINGBY</h1><div class="tabs">${tabs}</div>
      <div class="grid">${cards}</div>`;
    for (const t of this.picker.querySelectorAll<HTMLButtonElement>('.tab')) {
      t.addEventListener('click', () => {
        this.chapter = Number(t.dataset['ch']);
        this.showPicker(cleared, names);
      });
    }
    for (const c of this.picker.querySelectorAll<HTMLButtonElement>('.card')) {
      c.addEventListener('click', () => this.onPick(c.dataset['id']!));
    }
    this.picker.hidden = false;
  }

  hidePicker(): void { this.picker.hidden = true; }
  get pickerOpen(): boolean { return !this.picker.hidden; }
}
