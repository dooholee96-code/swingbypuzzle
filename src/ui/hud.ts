// HUD 와 결과·단계 선택. docs/PLAN.md §13
//
// 문구는 i18n 사전에서 꺼낸다. 한국어는 §13 의 것 그대로다 (§0.6).

import { toUi } from '../core/angle.js';
import type { Outcome } from '../core/types.js';
import type { Session } from '../game/session.js';
import { type Key, t } from '../i18n/index.js';
import { levelHint, levelName } from '../i18n/levels.js';
import { heartIcon, img, perkIcon, rabbitIcon } from './art.js';
import { PERK_KINDS } from '../tools-shared/perks.js';

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
  boss: ['result.boss', null],
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
  /** 경험치 바와 레벨, 받은 패시브 줄 (§22.5). 인피니티에서만 */
  readonly xp = $('xp');
  readonly perks = $('perks');
  private xpKey = '';
  private perksKey = '';
  /** 보스전 (§22.6): 체력 바와 목숨 */
  readonly boss = $('boss');
  private bossKey = '';
  /** 짧은 알림 (§22.7 "M31 발견!") */
  readonly toastEl = $('toast');
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly hintBtn = $('hintbtn');
  /** 인피니티(§22.3)의 최고 기록(초). main 이 판을 시작할 때 넣는다 */
  infBest = 0;
  /** 오늘의 우주면 "오늘 최고" 로 적는다 */
  infDaily = false;
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
    // 실패 결과는 화면 아무 곳이나 탭해도 재시도 (§13.4). **성공에는 걸지 않는다** —
    // 궤적을 보려고 탭했다가 단계가 다시 시작되면 "다음 단계" 를 잃는다
    this.result.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      if (!this.result.classList.contains('lose')) return;
      // 이어하기(§14.7)가 걸려 있으면 판 밖 탭으로 새 판을 열지 않는다 — 실수로 잃지 않게
      if (this.result.dataset['hold'] === '1') return;
      this.onRetry();
    });
  }

  /**
   * 매 프레임 부른다. **글자가 바뀔 때만 DOM 에 쓴다** — textContent 는 같은 값을
   * 넣어도 글자 노드를 갈아 끼우고 레이아웃을 다시 잡게 한다. 전에는 초당 60번씩
   * 세 곳을 새로 썼다.
   */
  refresh(s: Session): void {
    // 인피니티: 단계 이름 자리에 버틴 시간과 최고 기록. 힌트는 없다
    if (this.hintBtn.hidden !== !!s.world) this.hintBtn.hidden = !!s.world;
    if (s.world) {
      const sec = s.state === 'flying' || s.state === 'ending' ? s.freeSeconds() : 0;
      set(this.stageId, t('inf.time', { sec: sec.toFixed(1) }));
      set(this.stageText, t(this.infDaily ? 'inf.todayBest' : 'inf.best',
        { sec: Math.max(this.infBest, sec).toFixed(1) }));
    } else if (this.stageId.textContent !== s.level.id) {
      set(this.stageId, s.level.id);
      // 단계가 바뀌면 번호가 한 번 튄다 (§12.7). 클래스를 뗐다 붙여야 애니메이션이 다시 돈다
      this.stage.classList.remove('pop');
      void this.stage.offsetWidth;
      this.stage.classList.add('pop');
    }
    if (!s.world) set(this.stageText, levelName(s.level));
    // 아래 판: 조준 중이면 각도, 궤도 행성에서 돌고 있으면 "탭하면 출발" (§22.4),
    // 보스가 다가오면 남은 초 (§22.6)
    const cd = s.bossCountdown;
    set(this.angle, s.state === 'aiming' && s.aimFar
      ? t('hud.angle', { deg: toUi(s.angle).toFixed(1) })
      : s.docked ? t('hud.dockTap')
        : cd !== null ? (cd <= 0.05 ? t('hud.bossNow') : t('hud.bossIn', { sec: Math.ceil(cd) }))
          : '');
    this.angle.classList.toggle('alarm', cd !== null && cd <= 10);
    // 남은 분사: 바뀔 때만 다시 쓴다. 글자도 키에 넣는다 — 언어를 바꾸면 따라 바뀌게
    const label = t('hud.turns');
    const key = `${s.turnsLeft}/${s.turnSlots}/${label}`;
    if (key !== this.turnsKey) {
      this.turnsKey = key;
      this.turns.hidden = s.turnSlots === 0;
      this.turns.innerHTML = `<span class="lb">${label}</span>`
        + Array.from({ length: s.turnSlots }, (_, i) =>
          `<i class="pip${i < s.turnsLeft ? ' on' : ''}"></i>`).join('');
      // 하나 쓸 때마다 판이 튄다 (§12.7)
      this.turns.classList.remove('pop'); void this.turns.offsetWidth; this.turns.classList.add('pop');
    }
    // 첫 시도의 ready 상태에서만 레벨 hint (§13.3)
    set(this.hint, s.firstTry && s.state === 'ready' ? (levelHint(s.level) ?? '') : '');
    this.refreshPerks(s);
    this.refreshBoss(s);
  }

  /** 보스 체력 바와 목숨. 바뀔 때만 쓴다 */
  private refreshBoss(s: Session): void {
    const b = s.boss;
    if (!b) { if (!this.boss.hidden) this.boss.hidden = true; this.bossKey = ''; return; }
    const pct = Math.round(Math.max(0, b.hp) / b.hpMax * 50) * 2;
    const key = `${pct}/${b.lives}`;
    if (key === this.bossKey) return;
    this.bossKey = key;
    this.boss.hidden = false;
    (this.boss.querySelector('.hp b') as HTMLElement).style.width = `${pct}%`;
    this.boss.querySelector('.lives')!.innerHTML =
      Array.from({ length: Math.max(0, b.lives) }, () => `${img(heartIcon())}`).join('');
  }

  /** 경험치 바·레벨·패시브 줄. 바뀔 때만 DOM 에 쓴다 */
  private refreshPerks(s: Session): void {
    const on = !!s.world;
    if (this.xp.hidden === on) { this.xp.hidden = !on; this.perks.hidden = !on; }
    if (!on) return;
    const span = Math.max(1e-9, s.xpNext - s.xpPrev);
    const frac = Math.max(0, Math.min(1, (s.xp - s.xpPrev) / span));
    const pct = Math.round(frac * 50) * 2;                 // 2% 단위 — 매 프레임 쓰지 않게
    const key = `${s.xpLevel}/${pct}`;
    if (key !== this.xpKey) {
      this.xpKey = key;
      (this.xp.querySelector('b') as HTMLElement).style.width = `${pct}%`;
      set(this.xp.querySelector('.lv') as HTMLElement, t('hud.level', { n: s.xpLevel }));
    }
    const pk = PERK_KINDS.map((k) => s.perks[k]).join('');
    if (pk !== this.perksKey) {
      this.perksKey = pk;
      this.perks.innerHTML = PERK_KINDS.filter((k) => s.perks[k] > 0)
        .map((k) => `<span class="pk">${img(perkIcon(k))}<i>${s.perks[k]}</i></span>`).join('');
      this.perks.hidden = this.perks.innerHTML === '';
    }
  }

  showResult(
    s: Session,
    opts: {
      chapterLast?: boolean; last?: boolean; canHint?: boolean;
      /** 이번에 받은 별 [클리어, 3회 안에, 힌트 없이] (§13.4) */
      stars?: readonly [boolean, boolean, boolean];
      /** 최고 비행 시간을 줄였는가 */
      newBest?: boolean;
    } = {},
  ): void {
    this.result.dataset['hold'] = '';
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
    // 별 세 칸. 받은 것은 ★, 못 받은 것은 ☆ 로 조건을 보여 준다 — 다음에 노릴 것
    const starKeys = ['star.clear', 'star.quick', 'star.noHint'] as const;
    const stars = win && opts.stars
      ? `<div class="stars">${starKeys.map((k, i) => {
        const on = opts.stars![i];
        return `<span class="star${on ? ' on' : ''}" style="--i:${i}">${on ? '★' : '☆'} ${t(k)}</span>`;
      }).join('')}</div>`
      : '';
    this.result.innerHTML = `<div class="panel">
      <div class="head">${img(rabbitIcon(face))}<h2></h2></div>
      <p class="msg"></p>
      ${stars}
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
      ? t('result.stats', { sec: s.flightSeconds().toFixed(1), n: s.attempts })
        + (opts.newBest ? ` · ${t('result.newBest')}` : '')
      : tip;
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

  /** [공유] (§22.3). 끝나면 보여 줄 안내 문구의 키, 없으면 null */
  onShare: () => Promise<Key | null> = async () => null;
  /** 이어하기 (§14.7). 이었으면 null, 못 이었으면 보일 안내 문구의 키 */
  onRevive: () => Promise<Key | null> = async () => null;

  /**
   * 인피니티의 끝 (§22.3). 실패 시트와 같은 모양 — 화면 아무 곳이나 누르면 새 판.
   * daily 가 참이면 "오늘 최고" 로 적는다
   */
  showInfinityResult(
    sec: number, best: number, isBest: boolean, daily = false, revive: 'free' | 'ad' | null = null,
  ): void {
    if (!this.result.hidden) return;
    this.result.className = 'sheet lose';
    this.result.dataset['hold'] = revive ? '1' : '';
    // 이어하기(§14.7)는 판마다 한 번. 광고가 없는 빌드는 그냥 잇고, 광고를 못 불러오면 버튼이 없다
    const reviveBtn = revive
      ? `<button class="btn next" data-a="revive" type="button">${t(revive === 'ad' ? 'inf.reviveAd' : 'inf.revive')}</button>`
      : '';
    this.result.innerHTML = `<div class="panel">
      <div class="head">${img(rabbitIcon(isBest ? 'win' : 'sad'))}<h2></h2></div>
      <p class="msg"></p>
      <div class="row">${reviveBtn}
        <button class="btn primary" data-a="retry" type="button">${t('result.retry')}</button>
        <button class="btn hint" data-a="share" type="button">${t('inf.share')}</button>
        <button class="btn" data-a="pick" type="button">${t('picker.toTitle')}</button>
      </div>
      ${isBest ? `<p class="tapnote">${t(daily ? 'inf.newBestDaily' : 'inf.newBest')}</p>` : ''}
      <p class="tapnote sharenote" hidden></p>
      ${revive ? '' : `<p class="tapnote">${t('result.tapRetry')}</p>`}</div>`;
    this.result.querySelector('h2')!.textContent = t('inf.over');
    this.result.querySelector('.msg')!.textContent =
      t(daily ? 'inf.statsDaily' : 'inf.stats', { sec: sec.toFixed(1), best: best.toFixed(1) });
    const note = this.result.querySelector<HTMLElement>('.sharenote')!;
    for (const b of this.result.querySelectorAll<HTMLButtonElement>('button')) {
      b.addEventListener('click', () => {
        const a = b.dataset['a'];
        if (a === 'pick') this.onOpenPicker();
        else if (a === 'revive') {
          b.disabled = true;
          void this.onRevive().then((k) => {
            if (!k) return;                      // 이었다 — 시트는 main 이 닫는다
            b.disabled = false;
            note.textContent = t(k);
            note.hidden = false;
          });
        } else if (a === 'share') {
          void this.onShare().then((k) => {
            if (!k) return;
            note.textContent = t(k);
            note.hidden = false;
          });
        } else this.onRetry();
      });
    }
    this.result.hidden = false;
  }

  hideResult(): void { this.result.hidden = true; }

  /** 화면 위쪽에 잠깐 떴다 사라지는 한 줄. 연달아 오면 글자만 바꾼다 */
  toast(text: string, ms = 2200): void {
    this.toastEl.textContent = text;
    this.toastEl.hidden = false;
    this.toastEl.classList.remove('show'); void this.toastEl.offsetWidth; this.toastEl.classList.add('show');
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toastEl.hidden = true; this.toastTimer = null; }, ms);
  }

}
