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
import { LANGS, LANG_NAME, type LangSetting, t } from '../i18n/index.js';
import { chapterName } from '../i18n/levels.js';
import { img, introArt, rabbitIcon } from './art.js';
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
    lang: LangSetting;
  };
  /** 자동일 때 실제로 고른 언어의 이름. 설정 화면에 "자동 (日本語)" 처럼 보인다 */
  autoLangName(): string;
  /** 광고 SDK 가 동의 양식을 다시 열 수 있는가 (§13.6, §14.5). 해당 지역에서만 참 */
  canOpenPrivacyOptions?(): boolean;
  openPrivacyOptions?(): Promise<void>;
  onStart(): void;                 // 타이틀 → 스테이지(단계 선택)
  onInfinity(): void;              // 타이틀 → 인피니티 (§13.8)
  /** 인피니티가 열렸는가. 6-1 을 깨면 열린다 (§22.3) */
  infinityOpen(): boolean;
  onPick(id: string): void;
  onSettingChange(): void;
}

export class Screens {
  private titleEl = $('title');
  private pickerEl = $('picker');
  private settingsEl = $('settings');
  private introEl = $('intro');
  private chapter = 1;
  /** 설정을 어디서 열었는가. 뒤로 가기가 그리로 돌아간다 */
  private settingsFrom: Screen = 'select';

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
      <div class="logo"><h1>SWINGBY</h1>${t('title.sub') ? `<span class="ko">${t('title.sub')}</span>` : ''}</div>
      <div class="bar">
        <button class="btn primary" data-a="start" type="button">${t('title.stage')}</button>
        ${this.d.infinityOpen()
          ? `<button class="btn next" data-a="infinity" type="button">${t('title.infinity')}</button>`
          : `<button class="btn" type="button" disabled>${t('title.infinity')}<small>${t('title.infLocked')}</small></button>`}
        <div class="pair">
          <button class="btn" data-a="settings" type="button">${t('title.settings')}</button>
          <button class="btn" data-a="language" type="button">${t('set.language')}${
            t('set.language') === 'Language' ? '' : '<small>Language</small>'}</button>
        </div>
      </div>
      <div class="spacer"></div>`;
    this.bind(this.titleEl, {
      start: () => this.d.onStart(),
      infinity: () => this.d.onInfinity(),
      settings: () => this.showSettings(),
      language: () => this.showLanguage(),
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
        >${open ? t('chapter.label', { n: c.chapter, name: chapterName(c.chapter, c.name) })
          : t('chapter.locked', { n: c.chapter })}</button>`;
    }).join('');

    const ch = CHAPTERS.find((c) => c.chapter === this.chapter) ?? CHAPTERS[0]!;
    const cards = ch.levels.map((id, i) => {
      const open = isUnlocked(id, p);
      const done = p.cleared(id);
      const state = p.skipped(id) ? 'skipped' : done ? 'cleared' : open ? 'open' : 'locked';
      const mark = t(`mark.${state}` as const);
      return `<button class="card" style="--i:${i}" data-id="${id}" data-state="${state}" type="button" ${open ? '' : 'disabled'}>
        <span class="id">${id}</span>
        <span class="nm">${open ? this.d.levelName(id) : '???'}</span>
        <span class="st${done ? ' done' : open ? '' : ' lock'}">${mark}</span>
      </button>`;
    }).join('');

    this.pickerEl.innerHTML = `
      <div class="bar">
        <button class="btn" data-a="title" type="button">${t('picker.toTitle')}</button>
        <div class="spacer"></div>
        <button class="btn" data-a="intro" type="button" aria-label="${t('picker.introAgain')}">?</button>
        <button class="btn" data-a="settings" type="button">${t('picker.settings')}</button>
      </div>
      <h2>${img(rabbitIcon('idle'))}${t('picker.title')}</h2>
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
    this.introEl.innerHTML = `<div class="panel">
      <div class="art">${img(introArt(key), title)}</div>
      <h2>${title}</h2><p>${body}</p>
      <button class="btn primary" data-a="ok" type="button">${t('intro.ok')}</button></div>`;
    this.bind(this.introEl, { ok: () => { this.introEl.hidden = true; } });
    this.introEl.hidden = false;
  }

  // ── §13.6 설정 ────────────────────────────────────────────────────────
  showSettings(): void {
    // 설정 안에서 값을 바꾸면 다시 그린다. 그때는 어디서 왔는지를 덮어쓰지 않는다
    if (this.settingsEl.hidden) this.settingsFrom = this.current;
    const s = this.d.settings;
    const toggle = (k: string, label: string, on: boolean): string => `
      <div class="row2"><span class="label">${label}</span>
        <div class="seg">
          <button data-set="${k}" data-v="1" aria-pressed="${on}" type="button">${t('set.on')}</button>
          <button data-set="${k}" data-v="0" aria-pressed="${!on}" type="button">${t('set.off')}</button>
        </div></div>`;

    // 언어 이름은 각 언어로 쓴다 — 못 읽는 언어로 바뀌어도 자기 언어를 찾을 수 있게.
    // 항목 이름에도 영어를 곁들인다. 같은 이유다.
    const langOpts = (['auto', ...LANGS] as LangSetting[]).map((v) => {
      const label = v === 'auto' ? `${t('set.langAuto')} (${this.d.autoLangName()})` : LANG_NAME[v];
      return `<option value="${v}"${s.lang === v ? ' selected' : ''}>${label}</option>`;
    }).join('');

    this.settingsEl.innerHTML = `
      <div class="bar"><button class="btn" data-a="back" type="button">${t('set.back')}</button>
        <div class="spacer"></div></div>
      <h2>${t('set.title')}</h2>
      <div class="rows">
        <div class="row2"><label class="label" for="set-lang">${langLabel()}</label>
          <select id="set-lang" class="pick">${langOpts}</select></div>
        ${toggle('sfx', t('set.sfx'), s.sfx)}
        ${toggle('haptics', t('set.haptics'), s.haptics)}
        ${toggle('reduce_motion', t('set.reduceMotion'), s.reduce_motion)}
        ${this.d.canOpenPrivacyOptions?.()
          ? `<div class="row2"><span class="label">${t('set.privacyOptions')}</span>`
            + `<button class="btn" data-a="privacy" type="button">${t('set.open')}</button></div>`
          : ''}
        <div class="row2"><span class="label">${t('set.privacy')}</span>
          <a class="btn" href="./privacy/" target="_blank" rel="noopener">${t('set.view')}</a></div>
        <div class="row2"><span class="label">${t('set.credits')}</span>
          <span class="val dim">${t('set.oss')}</span></div>
        <p class="tapnote">${t('set.ossNote')}</p>
        <div class="row2"><span class="label">${t('set.version')}</span>
          <span class="val">${__APP_VERSION__}</span></div>
      </div>`;

    this.bind(this.settingsEl, {
      back: () => this.closeSettings(),
      privacy: () => { void this.d.openPrivacyOptions?.(); },
    });
    this.settingsEl.querySelector<HTMLSelectElement>('#set-lang')!
      .addEventListener('change', (e) => {
        s.lang = (e.target as HTMLSelectElement).value as LangSetting;
        this.d.onSettingChange();
        this.showSettings();                       // 새 언어로 다시 그린다
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

  // ── §13.7 언어 (타이틀에서 바로) ──────────────────────────────────────
  /** 언어만 고르는 화면. 설정과 같은 자리를 쓰고, 고르면 새 언어로 다시 그린다 */
  showLanguage(): void {
    if (this.settingsEl.hidden) this.settingsFrom = this.current;
    const s = this.d.settings;
    const opts = (['auto', ...LANGS] as LangSetting[]).map((v, i) => {
      const label = v === 'auto' ? `${t('set.langAuto')} (${this.d.autoLangName()})` : LANG_NAME[v];
      return `<button class="btn lang" style="--i:${i}" data-lang="${v}" aria-pressed="${s.lang === v}" type="button">${label}</button>`;
    }).join('');
    this.settingsEl.innerHTML = `
      <div class="bar"><button class="btn" data-a="back" type="button">${t('set.back')}</button>
        <div class="spacer"></div></div>
      <h2>${langLabel()}</h2>
      <div class="langs">${opts}</div>`;
    this.bind(this.settingsEl, { back: () => this.closeSettings() });
    for (const b of this.settingsEl.querySelectorAll<HTMLButtonElement>('[data-lang]')) {
      b.addEventListener('click', () => {
        s.lang = b.dataset['lang'] as LangSetting;
        this.d.onSettingChange();
        this.showLanguage();
      });
    }
    this.hideAllButSettings();
    this.settingsEl.hidden = false;
  }

  /**
   * 설정을 닫고 연 곳으로 돌아간다. 화면의 [뒤로] 와 브라우저 뒤로 가기가 같은 길을 쓴다.
   * 전에는 뒤로 가기만 언제나 단계 선택으로 갔다 — 타이틀에서 연 설정이 단계 선택으로 닫혔다.
   */
  private closeSettings(): void {
    this.settingsEl.hidden = true;
    if (this.settingsFrom === 'title') this.showTitle();
    else this.showSelect();
  }

  private hideAllButSettings(): void {
    this.titleEl.hidden = true;
    this.pickerEl.hidden = true;
  }

  /** 뒤로 가기 한 단계. 처리했으면 true (§15.2 의 뒤로 버튼 흐름). */
  goBack(): boolean {
    if (!this.introEl.hidden) { this.introEl.hidden = true; return true; }
    if (!this.settingsEl.hidden) { this.closeSettings(); return true; }
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

/** "언어 · Language". 못 읽는 언어로 바뀌어도 자기 언어를 찾아 돌아올 수 있게 영어를 곁들인다 */
function langLabel(): string {
  return t('set.language') === 'Language' ? 'Language' : `${t('set.language')} · Language`;
}
