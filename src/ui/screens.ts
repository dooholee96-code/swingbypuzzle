// 화면 흐름. docs/PLAN.md §9.1, §13
//
//   Title → LevelSelect → Play → Result → (재시도 | 다음 | LevelSelect)
//
// 화면은 전부 DOM 오버레이다. 캔버스는 뒤에서 계속 돌고,
// 타이틀에서는 그 캔버스가 데모를 재생한다 (§13.1).

import { CHAPTERS, allIds } from '../levels/chapters.js';
import { chapterOf, isChapterUnlocked, isUnlocked } from '../levels/progress.js';
import type { Progress } from '../levels/progress.js';
import { introFor, seenKey } from './intro.js';
import type { IntroKey } from './intro.js';
import type { Level } from '../core/types.js';

declare const __APP_VERSION__: string;

export type Screen = 'title' | 'select' | 'play';

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 를 찾을 수 없습니다`);
  return el;
};

export interface ScreenDeps {
  progress: Progress;
  levelName(id: string): string;
  settings: {
    sfx: boolean; haptics: boolean;
    glow: 'normal' | 'low'; reduce_motion: boolean; reduce_motion_set?: boolean;
  };
  /** 광고 SDK 가 동의 양식을 다시 열 수 있는가 (§13.6, §14.5). 해당 지역에서만 참 */
  canOpenPrivacyOptions?(): boolean;
  openPrivacyOptions?(): Promise<void>;
  onStart(): void;                 // 타이틀 → 이어서 하기
  onPick(id: string): void;
  onSettingChange(): void;
}

export class Screens {
  private titleEl = $('title');
  private pickerEl = $('picker');
  private settingsEl = $('settings');
  private introEl = $('intro');
  private chapter = 1;

  constructor(private readonly d: ScreenDeps) {}

  get current(): Screen {
    if (!this.titleEl.hidden) return 'title';
    if (!this.pickerEl.hidden) return 'select';
    return 'play';
  }

  get overlayOpen(): boolean {
    return !this.titleEl.hidden || !this.pickerEl.hidden
      || !this.settingsEl.hidden || !this.introEl.hidden;
  }

  private hideAll(): void {
    this.titleEl.hidden = true;
    this.pickerEl.hidden = true;
    this.settingsEl.hidden = true;
  }

  // ── §13.1 타이틀 ──────────────────────────────────────────────────────
  showTitle(): void {
    this.hideAll();
    this.titleEl.innerHTML = `
      <div class="spacer"></div>
      <div class="logo"><h1>SWINGBY</h1><span class="ko">스윙바이</span></div>
      <div class="bar">
        <button class="btn primary" data-a="start" type="button">시작하기</button>
        <button class="btn" data-a="settings" type="button">설정</button>
      </div>
      <div class="spacer"></div>`;
    this.bind(this.titleEl, {
      start: () => this.d.onStart(),
      settings: () => this.showSettings(),
    });
    this.titleEl.hidden = false;
  }

  // ── §13.2 단계 선택 ───────────────────────────────────────────────────
  showSelect(chapter?: number): void {
    this.hideAll();
    if (chapter !== undefined) this.chapter = chapter;
    const p = this.d.progress;
    const tabs = CHAPTERS.map((c) => {
      const open = isChapterUnlocked(c.chapter, p);
      return `<button class="tab" data-ch="${c.chapter}" type="button"
        aria-selected="${c.chapter === this.chapter}" ${open ? '' : 'disabled'}
        >${c.chapter}장 ${open ? c.name : '잠김'}</button>`;
    }).join('');

    const ch = CHAPTERS.find((c) => c.chapter === this.chapter) ?? CHAPTERS[0]!;
    const cards = ch.levels.map((id) => {
      const open = isUnlocked(id, p);
      const done = p.cleared(id);
      const mark = p.skipped(id) ? '↷ 건너뜀' : done ? '✓ 클리어' : open ? '미클리어' : '잠김';
      return `<button class="card" data-id="${id}" type="button" ${open ? '' : 'disabled'}>
        <span class="id">${id}</span>
        <span class="nm">${open ? this.d.levelName(id) : '???'}</span>
        <span class="st${done ? ' done' : open ? '' : ' lock'}">${mark}</span>
      </button>`;
    }).join('');

    this.pickerEl.innerHTML = `
      <div class="bar">
        <button class="btn" data-a="title" type="button">타이틀</button>
        <div class="spacer"></div>
        <button class="btn" data-a="intro" type="button" aria-label="이 장의 새 요소 다시 보기">?</button>
        <button class="btn" data-a="settings" type="button">설정</button>
      </div>
      <h2>단계 선택</h2>
      <div class="tabs">${tabs}</div>
      <div class="grid">${cards}</div>`;

    this.bind(this.pickerEl, {
      title: () => this.showTitle(),
      settings: () => this.showSettings(),
      intro: () => this.showChapterIntro(ch.levels[0]!),
    });
    for (const t of this.pickerEl.querySelectorAll<HTMLButtonElement>('.tab')) {
      t.addEventListener('click', () => this.showSelect(Number(t.dataset['ch'])));
    }
    for (const c of this.pickerEl.querySelectorAll<HTMLButtonElement>('.card')) {
      c.addEventListener('click', () => this.d.onPick(c.dataset['id']!));
    }
    this.pickerEl.hidden = false;
  }

  hideSelect(): void { this.hideAll(); }

  // ── §13.2.1 새 요소 소개 카드 ─────────────────────────────────────────
  /** meta.intro 가 있고 아직 안 본 단계면 카드를 띄운다. 띄웠으면 true. */
  maybeShowIntro(L: Level, seen: string[], onSeen: (key: string) => void): boolean {
    const key = L.meta.intro;
    if (!key) return false;
    const mark = seenKey(L.id, key);
    if (seen.includes(mark)) return false;
    this.showIntroCard(L.id, key);
    onSeen(mark);
    return true;
  }

  private showChapterIntro(firstId: string): void {
    // ? 버튼: 이 장 첫 단계의 소개 카드를 다시 본다. 없으면 아무 일도 없다.
    const key = this.introKeyCache[firstId];
    if (key) this.showIntroCard(firstId, key);
  }

  private introKeyCache: Record<string, IntroKey> = {};
  rememberIntro(id: string, key: IntroKey | undefined): void {
    if (key) this.introKeyCache[id] = key;
  }

  private showIntroCard(levelId: string, key: IntroKey): void {
    const { title, body } = introFor(levelId, key);
    this.introEl.className = 'sheet';
    this.introEl.innerHTML = `<h2>${title}</h2><p>${body}</p>
      <div class="row"><button class="btn primary" data-a="ok" type="button">확인</button></div>`;
    this.bind(this.introEl, { ok: () => { this.introEl.hidden = true; } });
    this.introEl.hidden = false;
  }

  // ── §13.6 설정 ────────────────────────────────────────────────────────
  showSettings(): void {
    const back = this.current;
    const s = this.d.settings;
    const toggle = (k: string, label: string, on: boolean): string => `
      <div class="row2"><span class="label">${label}</span>
        <div class="seg">
          <button data-set="${k}" data-v="1" aria-pressed="${on}" type="button">켬</button>
          <button data-set="${k}" data-v="0" aria-pressed="${!on}" type="button">끔</button>
        </div></div>`;

    this.settingsEl.innerHTML = `
      <div class="bar"><button class="btn" data-a="back" type="button">뒤로</button>
        <div class="spacer"></div></div>
      <h2>설정</h2>
      <div class="rows">
        ${toggle('sfx', '효과음', s.sfx)}
        ${toggle('haptics', '진동', s.haptics)}
        <div class="row2"><span class="label">발광 효과</span>
          <div class="seg">
            <button data-set="glow" data-v="normal" aria-pressed="${s.glow === 'normal'}" type="button">보통</button>
            <button data-set="glow" data-v="low" aria-pressed="${s.glow === 'low'}" type="button">낮음</button>
          </div></div>
        ${toggle('reduce_motion', '모션 줄이기', s.reduce_motion)}
        ${this.d.canOpenPrivacyOptions?.()
          ? '<div class="row2"><span class="label">개인정보 옵션</span>'
            + '<button class="btn" data-a="privacy" type="button">열기</button></div>'
          : ''}
        <div class="row2"><span class="label">개인정보처리방침</span>
          <a class="btn" href="./privacy/" target="_blank" rel="noopener">보기</a></div>
        <div class="row2"><span class="label">만든 것</span>
          <span class="val dim">오픈소스 고지</span></div>
        <p class="tapnote">이 게임은 오픈소스 라이브러리를 쓰지 않습니다.
          Oxanium 글꼴은 SIL Open Font License 를 따릅니다.</p>
        <div class="row2"><span class="label">버전</span>
          <span class="val">${__APP_VERSION__}</span></div>
      </div>`;

    this.bind(this.settingsEl, {
      back: () => { this.settingsEl.hidden = true; if (back === 'title') this.showTitle(); else if (back === 'select') this.showSelect(); },
      privacy: () => { void this.d.openPrivacyOptions?.(); },
    });
    for (const b of this.settingsEl.querySelectorAll<HTMLButtonElement>('[data-set]')) {
      b.addEventListener('click', () => {
        const k = b.dataset['set']!, v = b.dataset['v']!;
        const st = this.d.settings as unknown as Record<string, unknown>;
        st[k] = k === 'glow' ? v : v === '1';
        // 직접 건드린 뒤로는 OS 의 prefers-reduced-motion 을 따르지 않는다 (§12.4)
        if (k === 'reduce_motion') st['reduce_motion_set'] = true;
        this.d.onSettingChange();
        this.showSettings();
      });
    }
    this.hideAllButSettings();
    this.settingsEl.hidden = false;
  }

  private hideAllButSettings(): void {
    this.titleEl.hidden = true;
    this.pickerEl.hidden = true;
  }

  /** 뒤로 가기 한 단계. 처리했으면 true (§15.2 의 뒤로 버튼 흐름). */
  goBack(): boolean {
    if (!this.introEl.hidden) { this.introEl.hidden = true; return true; }
    if (!this.settingsEl.hidden) { this.settingsEl.hidden = true; this.showSelect(); return true; }
    if (!this.pickerEl.hidden) { this.showTitle(); return true; }
    return false;
  }

  private bind(root: HTMLElement, map: Record<string, () => void>): void {
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-a]')) {
      const fn = map[b.dataset['a']!];
      if (fn) b.addEventListener('click', fn);
    }
  }

  /** 장 탭을 현재 단계에 맞춘다. */
  syncChapter(levelId: string): void { this.chapter = chapterOf(levelId); }

  static allIds = allIds;
}
