// HUD 와 결과·단계 선택. docs/PLAN.md §13
//
// 문구는 i18n 사전에서 꺼낸다. 한국어는 §13 의 것 그대로다 (§0.6).

import { toUi } from '../core/angle.js';
import type { Outcome } from '../core/types.js';
import type { Session } from '../game/session.js';
import { type Key, t } from '../i18n/index.js';
import { levelHint, levelName } from '../i18n/levels.js';
import { img, rabbitIcon } from './art.js';

/** §13.4 결과 화면 문구의 키. 성공에는 조언이 없다 */
export const RESULT: Readonly<Record<Outcome, readonly [Key, Key | null]>> = {
  win: ['result.win', null],
  planet: ['result.planet', 'result.planet.tip'],
  hole: ['result.hole', 'result.hole.tip'],
  shot: ['result.shot', 'result.shot.tip'],
  ufo: ['result.ufo', 'result.ufo.tip'],
  rock: ['result.rock', 'result.rock.tip'],
  wall: ['result.wall', 'result.wall.tip'],
  drift: ['result.drift', 'result.drift.tip'],
};

/** 다를 때만 쓴다. */
function set(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 를 찾을 수 없습니다`);
  return el;
};

export class Hud {
  readonly stage = $('stage');
  /** 단계 번호와 이름. 이름은 두 줄에서 자르려고 따로 둔다 */
  private readonly stageId = this.stage.querySelector<HTMLElement>('.sid') ?? this.stage;
  private readonly stageText = this.stage.querySelector<HTMLElement>('.clamp') ?? this.stage;
  readonly angle = $('angle');
  /** 남은 분사 (§22.1). 분사가 있는 단계에서만 보인다 */
  readonly turns = $('turns');
  private turnsKey = '';
  readonly hint = $('hint');
  readonly result = $('result');
  readonly back = $('back') as HTMLButtonElement;
  readonly retry = $('retry') as HTMLButtonElement;

  onRetry: () => void = () => {};
  onNext: () => void = () => {};
  onOpenPicker: () => void = () => {};
  onHints: () => void = () => {};

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

  /**
   * 매 프레임 부른다. **글자가 바뀔 때만 DOM 에 쓴다** — textContent 는 같은 값을
   * 넣어도 글자 노드를 갈아 끼우고 레이아웃을 다시 잡게 한다. 전에는 초당 60번씩
   * 세 곳을 새로 썼다.
   */
  refresh(s: Session): void {
    if (this.stageId.textContent !== s.level.id) {
      set(this.stageId, s.level.id);
      // 단계가 바뀌면 번호가 한 번 튄다 (§12.7). 클래스를 뗐다 붙여야 애니메이션이 다시 돈다
      this.stage.classList.remove('pop');
      void this.stage.offsetWidth;
      this.stage.classList.add('pop');
    }
    set(this.stageText, levelName(s.level));
    set(this.angle, s.state === 'aiming' && s.aimFar
      ? t('hud.angle', { deg: toUi(s.angle).toFixed(1) }) : '');
    // 남은 분사: 바뀔 때만 다시 쓴다
    const key = `${s.turnsLeft}/${s.maxTurns}`;
    if (key !== this.turnsKey) {
      this.turnsKey = key;
      this.turns.hidden = s.maxTurns === 0;
      this.turns.innerHTML = `<span class="lb">${t('hud.turns')}</span>`
        + Array.from({ length: s.maxTurns }, (_, i) =>
          `<i class="pip${i < s.turnsLeft ? ' on' : ''}"></i>`).join('');
      // 하나 쓸 때마다 판이 튄다 (§12.7)
      this.turns.classList.remove('pop'); void this.turns.offsetWidth; this.turns.classList.add('pop');
    }
    // 첫 시도의 ready 상태에서만 레벨 hint (§13.3)
    set(this.hint, s.firstTry && s.state === 'ready' ? (levelHint(s.level) ?? '') : '');
  }

  showResult(
    s: Session,
    opts: { chapterLast?: boolean; last?: boolean; canHint?: boolean } = {},
  ): void {
    if (!this.result.hidden) return;
    const keys = RESULT[s.outcome as Outcome];
    const title = keys ? t(keys[0]) : t('result.ended');
    const tip = keys?.[1] ? t(keys[1]) : '';
    const win = s.outcome === 'win';
    // §13.4: 장의 마지막 단계 성공 시 "다음 장", 준비된 마지막 단계면 안내 문구
    const nextLabel = opts.last ? null
      : t(opts.chapterLast ? 'result.nextChapter' : 'result.nextLevel');
    const closing = win && opts.last ? t('result.allCleared')
      : win && opts.chapterLast ? t('result.chapterCleared', { n: s.level.meta.chapter }) : '';
    this.result.className = `sheet ${win ? 'win' : 'lose'}`;
    // §13.4. 시안: 아래쪽 판 + 토끼 얼굴. 표류는 잠든 얼굴, 그 밖의 실패는 시무룩한 얼굴
    const face = win ? 'win' : s.outcome === 'drift' ? 'sleep' : 'sad';
    this.result.innerHTML = `<div class="panel">
      <div class="head">${img(rabbitIcon(face))}<h2></h2></div>
      <p class="msg"></p>
      <div class="row">
        ${win
          ? (nextLabel ? `<button class="btn next" data-a="next" type="button">${nextLabel}</button>` : '') +
            `<button class="btn" data-a="retry" type="button">${t('result.again')}</button>`
          : `<button class="btn primary" data-a="retry" type="button">${t('result.retry')}</button>`}
        ${!win && opts.canHint ? `<button class="btn hint" data-a="hint" type="button">${t('result.hint')}</button>` : ''}
        <button class="btn" data-a="pick" type="button">${t('result.pick')}</button>
      </div>
      ${closing ? `<p class="tapnote">${closing}</p>` : ''}
      ${win ? '' : `<p class="tapnote">${t('result.tapRetry')}</p>`}</div>`;
    this.result.querySelector('h2')!.textContent = title;
    this.result.querySelector('.msg')!.textContent = win
      ? t('result.stats', { sec: s.flightSeconds().toFixed(1), n: s.attempts }) : tip;
    for (const b of this.result.querySelectorAll<HTMLButtonElement>('button')) {
      b.addEventListener('click', () => {
        const a = b.dataset['a'];
        if (a === 'next') this.onNext();
        else if (a === 'pick') this.onOpenPicker();
        else if (a === 'hint') { this.hideResult(); this.onHints(); }
        else this.onRetry();
      });
    }
    this.result.hidden = false;
  }

  hideResult(): void { this.result.hidden = true; }

}
