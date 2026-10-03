// 부트스트랩과 프레임 루프. docs/PLAN.md §9.1, §10, §11, §13

import './ui/styles.css';

import { allIds } from './levels/chapters.js';
import { loadLevel } from './levels/registry.js';
import {
  isChapterLast, nextLevel, resumeLevel,
} from './levels/progress.js';
import { Camera } from './game/camera.js';
import { AimInput } from './game/input.js';
import { Session } from './game/session.js';
import { DOME_DRAW_R, FieldRenderer } from './render/field.js';
import { drawMinimap, miniRect } from './render/minimap.js';
import type { MiniRect } from './render/minimap.js';
import { Hud } from './ui/hud.js';
import { HintSheet } from './ui/hints.js';
import { seenKey } from './ui/intro.js';
import { Screens } from './ui/screens.js';
import { Save } from './save/save.js';
import { Audio } from './audio/sfx.js';
import { type AdProvider, NoAdProvider } from './platform/ads.js';
import { detect, pickAdProvider } from './platform/capabilities.js';
import {
  afterClear, afterInterstitial, afterRewarded, forNewSession, shouldShowInterstitial,
} from './monetization/ad-policy.js';
import { type HintKind, directionArc, previewSeconds } from './monetization/hints.js';
import {
  HTML_LANG, LANG_NAME, type Key, detectLang, isLangSetting, resolveLang, setLang, t,
} from './i18n/index.js';
import { levelName } from './i18n/levels.js';

const MAX_DPR = 2.5;               // §15.3
const DEMO_LEVEL = '1-1';          // §13.1 타이틀 뒤에서 도는 데모
const DEMO_PAUSE = 1.4;            // 데모가 끝나고 다시 시작하기까지(초)

const canvas = document.getElementById('cv') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;
const cam = new Camera();
const session = new Session();
const aim = new AimInput();
const field = new FieldRenderer();
const hud = new Hud();
const save = new Save();
const sfx = new Audio();

let cssW = 0, cssH = 0, dpr = 1;
let mini: MiniRect | null = null;
let panning = false;
let dragMode: 'aim' | 'mini' | null = null;
let dragPointer = -1;              // 조준·미니맵을 잡고 있는 손가락
let last = performance.now();
let elapsed = 0;                   // 연출용 시계(초). 물리 시계와 따로 간다
let demo = false;                  // 타이틀 데모가 도는 중인가
let demoIdle = 0;
let ended = false;               // 이번 비행의 끝 소리를 이미 냈는가
/**
 * 단계를 열 때 목적지가 한 화면에 안 들어오면, 목적지를 먼저 보여 주고 발사대로
 * 내려온다(§11). 화면을 누르면 바로 끝난다. 재시도·모션 줄이기에서는 하지 않는다.
 */
let glide: { t: number; fx: number; fy: number; tx: number; ty: number } | null = null;
const GLIDE_HOLD = 0.6, GLIDE_MOVE = 0.9;
let paused = false;                // 힌트 시트가 열려 있으면 단계 시계를 멈춘다 (§13.5)
let ads: AdProvider = new NoAdProvider();
const started = performance.now();

/** 앱 실행 후 흐른 시각(초). 광고 규칙이 쓰는 유일한 시계다 (§14.4) */
const nowSeconds = (): number => (performance.now() - started) / 1000;

save.load();
// 광고 규칙의 시각은 "이번 실행 후 흐른 초"라 지난 실행의 값과 비교할 수 없다 (§14.4)
saveAdState(forNewSession(adState()));
applySettings();

const screens = new Screens({
  progress: {
    cleared: (id) => save.cleared(id),
    skipped: (id) => save.level(id).skipped,
  },
  levelName: (id) => levelName(loadLevel(id)),
  settings: save.data.settings,
  autoLangName: () => LANG_NAME[detectLang(browserLangs())],
  // 스테이지: 이어서 할 단계가 있는 장의 단계 선택으로 (§13.1)
  onStart: () => {
    screens.syncChapter(resumeLevel({
      cleared: (id) => save.cleared(id),
      skipped: (id) => save.level(id).skipped,
    }));
    screens.showSelect();
  },
  onInfinity: () => {},
  infinityOpen: () => false,
  onPick: (id) => startPlay(id),
  onSettingChange: () => { applySettings(); save.touch(); },
  canOpenPrivacyOptions: () => ads.canOpenPrivacyOptions(),
  openPrivacyOptions: () => ads.openPrivacyOptions(),
});

const cap = detect();
const hints = new HintSheet({
  isRewardedReady: () => ads.isRewardedReady(),
  showRewarded: (p) => ads.showRewarded(p),
} as AdProvider, {
  state: () => {
    const l = save.level(session.level.id);
    return { fails: l.fails, got: { ...l.hints }, freeUsed: save.data.ads.free_hint_used };
  },
  grant: (kind: HintKind) => {
    if (kind === 'skip') return;
    const l = save.level(session.level.id);
    const wasFree = !save.data.ads.free_hint_used;
    l.hints[kind] = true;
    if (wasFree) save.data.ads.free_hint_used = true;
    // afterRewarded 는 camelCase 를 돌려준다. 저장 구조(snake_case)에 그대로 펼치면
    // last_rewarded_at 이 갱신되지 않아 조건 5(보상형 뒤 90초)가 한 번도 걸리지 않았다.
    else saveAdState(afterRewarded(adState(), nowSeconds()));
    save.touch();
    applyHints();
  },
  skip: () => {
    const l = save.level(session.level.id);
    l.skipped = true;
    saveAdState(afterRewarded(adState(), nowSeconds()));   // 건너뛰기는 언제나 보상형이다
    hud.hideResult();
    hud.onNext();
  },
  setPaused: (on) => { paused = on; session.pauseReset(); },
});

function adState(): { clearsSinceInterstitial: number;
  lastInterstitialAt: number | null; lastRewardedAt: number | null } {
  const a = save.data.ads;
  return {
    clearsSinceInterstitial: a.clears_since_interstitial,
    lastInterstitialAt: a.last_interstitial_at,
    lastRewardedAt: a.last_rewarded_at,
  };
}
function saveAdState(next: ReturnType<typeof adState>): void {
  save.data.ads.clears_since_interstitial = next.clearsSinceInterstitial;
  save.data.ads.last_interstitial_at = next.lastInterstitialAt;
  save.data.ads.last_rewarded_at = next.lastRewardedAt;
  save.touch();
}

/** 받은 힌트를 화면에 반영한다 (§14.3). */
function applyHints(): void {
  const l = save.level(session.level.id);
  field.directionArc = l.hints.direction
    ? directionArc(session.level.meta.solution.angle,
      session.level.meta.metrics?.main_window ?? 6)
    : null;
  const want = previewSeconds(basePreview, l.hints.preview);
  if (session.level.preview !== want) {
    session.level = { ...session.level, preview: want };
  }
  (document.querySelector('#hintbtn .dot') as HTMLElement).hidden = !hints.hasAny();
}
let basePreview = 1.8;

function applySettings(): void {
  field.reduceMotion = save.data.settings.reduce_motion;
  document.documentElement.classList.toggle('reduce', field.reduceMotion);
  sfx.enabled = save.data.settings.sfx;
  applyLang();
}

function browserLangs(): readonly string[] {
  return navigator.languages?.length ? navigator.languages : [navigator.language ?? 'en'];
}

/**
 * 화면 언어를 정한다. <html lang> 도 바꾼다 — 브라우저가 한자 글꼴을 고르는
 * 근거이고, styles.css 의 언어별 글꼴(--text)도 이걸 본다.
 * 이미 그려진 화면은 다음에 그릴 때 바뀐다. 설정 화면은 스스로 다시 그린다.
 */
function applyLang(): void {
  const st = save.data.settings;
  if (!isLangSetting(st.lang)) st.lang = 'auto';     // 손상된 저장값
  const l = resolveLang(st.lang, browserLangs());
  setLang(l);
  document.documentElement.lang = HTML_LANG[l];
  document.title = t('doc.title');
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = t(el.dataset['i18n'] as Key);
  }
}

// 첫 사용자 입력에서 오디오를 연다 (브라우저 자동재생 정책, §17 M11)
for (const ev of ['pointerdown', 'keydown'] as const) {
  addEventListener(ev, () => sfx.unlock(), { once: false, passive: true });
}

let canvasLeft = 0, canvasTop = 0;

/**
 * 캔버스 크기를 창에 맞춘다.
 *
 * `canvas.width` 에 값을 넣으면 **같은 값이어도** 뒷버퍼를 새로 잡고 내용을 지운다.
 * 전에는 단계를 열 때마다, 타이틀 데모가 한 바퀴 돌 때마다 이걸 불렀다.
 * 크기가 실제로 바뀔 때만 건드린다.
 */
function resize(): void {
  const r = canvas.getBoundingClientRect();
  cssW = r.width; cssH = r.height;
  canvasLeft = r.left; canvasTop = r.top;
  dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const [top, bottom] = insets(r);
  cam.layout(cssW, cssH, top, bottom);
  if (session.level) {
    cam.clamp(session.level);
    if (!panning && session.state !== 'flying') snapToStart();
  }
}
addEventListener('resize', resize);

/**
 * 캔버스 위·아래에서 HUD 와 각도 판이 가리는 높이(CSS px). HUD 는 데모 중에도
 * `visibility: hidden` 으로 자리를 지키므로 언제 재도 같다. 각도 판은 비어 있으면
 * 높이가 0 이라 판의 `bottom` 값(안전 영역 포함)에 한 줄 높이를 더한다.
 */
const ANGLE_PANEL_H = 40;
function insets(r: DOMRect): [number, number] {
  const top = Math.max(0, hudTop.getBoundingClientRect().bottom - r.top);
  const bottom = (parseFloat(getComputedStyle(hud.angle).bottom) || 0) + ANGLE_PANEL_H;
  return [top, bottom];
}
const hudTop = document.querySelector('.hud.top') as HTMLElement;

function snapToStart(): void {
  glide = null;
  cam.frameStart(session.level);
}

/** 목적지에서 출발해 발사대 장면으로 내려오는 첫 카메라 (§11) */
function beginGlide(): void {
  const g = session.level.goal;
  if (field.reduceMotion || cam.sees(g.x - g.r, g.y - g.r, g.x + g.r, g.y + g.r)) return;
  const tx = cam.x, ty = cam.y;
  cam.centerOn(session.level, g.x, g.y);
  glide = { t: 0, fx: cam.x, fy: cam.y, tx, ty };
}

/** 끝에서 살짝 지나쳤다 돌아오는 이징 (§12.7) */
function backOut(u: number): number {
  const c = 1.1, v = u - 1;
  return 1 + (c + 1) * v * v * v + c * v * v;
}

function stepGlide(dt: number): void {
  if (!glide) return;
  if (session.state !== 'ready') { glide = null; return; }
  glide.t += dt;
  const u = Math.min(1, Math.max(0, (glide.t - GLIDE_HOLD) / GLIDE_MOVE));
  const e = backOut(u);
  cam.x = glide.fx + (glide.tx - glide.fx) * e;
  cam.y = glide.fy + (glide.ty - glide.fy) * e;
  cam.clamp(session.level);
  if (u >= 1) glide = null;
}

function loadInto(id: string): void {
  session.setup(loadLevel(id));
  basePreview = session.level.preview;
  field.rebuild(session.level);
  hud.hideResult();
  hints.close();
  panning = false;
  applyHints();
  resize();
  snapToStart();
}

/** 타이틀로 들어간다. 뒤에서 1-1 의 정답을 반복 재생한다 (§13.1). */
function startDemo(): void {
  replayDemo();
  screens.showTitle();
}

/**
 * 데모 비행만 다시 쏜다. **화면은 건드리지 않는다.**
 *
 * 전에는 반복할 때마다 startDemo() 를 불러 타이틀을 새로 그렸다. 그러면 타이틀에서
 * 연 설정 화면이 데모 한 바퀴(약 5초)마다 저절로 닫혔다.
 */
function replayDemo(): void {
  demo = true;
  demoIdle = 0;
  loadInto(DEMO_LEVEL);
  session.setAngle(session.level.meta.solution.angle);
  session.launch();
}

function startPlay(id: string): void {
  demo = false;
  loadInto(id);
  beginGlide();
  screens.syncChapter(id);
  screens.hideSelect();
  screens.rememberIntro(id, session.level.meta.intro);
  screens.maybeShowIntro(session.level, save.data.seen_intros, (key) => {
    save.data.seen_intros.push(key);
    save.touch();
  });
}

// ── 입력 (§10) ──────────────────────────────────────────────────────────
/** 캔버스 좌표. 위치는 resize() 가 잡아 둔 값을 쓴다 — getBoundingClientRect 는
 *  레이아웃을 강제하므로 초당 수십 번 오는 pointermove 에서 부르지 않는다. */
function pos(e: PointerEvent): [number, number] {
  return [e.clientX - canvasLeft, e.clientY - canvasTop];
}

canvas.addEventListener('pointerdown', (e) => {
  // 두 번째 손가락이 조준을 처음부터 다시 시작하거나, 그 손가락을 떼는 순간
  // 발사되지 않게 한다. 조준은 한 손가락이다.
  if (!e.isPrimary || dragMode) return;
  if (demo || screens.overlayOpen || hints.open || !session.level) return;
  if (session.state !== 'ready' && session.state !== 'aiming') return;
  if (glide) snapToStart();          // 누르면 훑어보기는 바로 끝난다
  const [x, y] = pos(e);
  canvas.setPointerCapture(e.pointerId);
  dragPointer = e.pointerId;
  // §10.1 규칙 1: 미니맵 영역이 먼저
  if (mini && x >= mini.x && x <= mini.x + mini.w && y >= mini.y && y <= mini.y + mini.h) {
    dragMode = 'mini';
    moveCamTo(x, y);
    return;
  }
  dragMode = 'aim';
  aim.begin(x, y, session.angle);
  session.beginAim();
  updateAim(x, y);
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragMode || e.pointerId !== dragPointer) return;
  const [x, y] = pos(e);
  if (dragMode === 'aim') updateAim(x, y);
  else moveCamTo(x, y);
});

function endDrag(): void {
  if (dragMode === 'aim') {
    if (aim.shouldLaunch()) {
      session.launch();
      panning = false;
      sfx.play('launch');
      buzz(20);                              // §15.3 발사 시 가벼운 충격
    } else session.cancelAim();
    aim.finish();
  }
  dragMode = null;
  dragPointer = -1;
}

/** 진동. 지원하지 않으면 조용히 건너뛴다 — iOS 사파리에는 없다 (§15.3). */
function buzz(ms: number | number[]): void {
  if (!save.data.settings.haptics || !cap.canVibrate) return;
  try { navigator.vibrate(ms); } catch { /* 무시 */ }
}
canvas.addEventListener('pointerup', (e) => {
  if (e.pointerId === dragPointer) endDrag();
});
canvas.addEventListener('pointercancel', (e) => {
  if (e.pointerId !== dragPointer) return;
  session.cancelAim(); aim.finish(); dragMode = null; dragPointer = -1;
});

function updateAim(x: number, y: number): void {
  const [cx, cy] = cam.toScreen(session.level.start.x, session.level.start.y);
  session.aimFar = aim.update(session.level, x, y, cx, cy, DOME_DRAW_R * cam.scale);
  if (session.aimFar) session.setAngle(aim.angle);
}

/** §10.4 미니맵 이동. 누른 점의 월드 위치로 카메라 중심을 즉시 옮긴다. */
function moveCamTo(x: number, y: number): void {
  if (!mini) return;
  panning = true;
  cam.centerOn(session.level, (x - mini.x) / mini.k, (y - mini.y) / mini.k);
}

// 브라우저 뒤로 가기 → 화면 한 단계 뒤로 (§15.2 의 흐름을 웹으로)
history.replaceState({ depth: 0 }, '');
addEventListener('popstate', () => {
  if (!screens.goBack() && !demo) screens.showSelect();
  history.pushState({ depth: 1 }, '');
});
history.pushState({ depth: 1 }, '');

// ── 생명주기 ────────────────────────────────────────────────────────────
addEventListener('visibilitychange', () => {
  session.pauseReset();
  sfx.setMuted(document.hidden);
  if (document.hidden) save.flush();
});
addEventListener('pagehide', () => save.flush());

// ── 화면 흐름 ───────────────────────────────────────────────────────────
hud.onRetry = () => {
  session.reset(); aim.finish(); hud.hideResult(); panning = false; snapToStart();
};
hud.onOpenPicker = () => { hud.hideResult(); screens.showSelect(); };
hud.onNext = () => { void goNext(); };
hud.onHints = () => hints.show();
hud.stage.addEventListener('click', () => hud.onOpenPicker());
document.getElementById('hintbtn')!.addEventListener('click', () => hints.show());

/**
 * 다음 단계로. **전면 광고는 여기서만 검토한다** (§14.4).
 * 실패 후 재시도·단계 선택·앱 복귀에서는 부르지 않는다.
 */
async function goNext(): Promise<void> {
  const p = {
    cleared: (id: string) => save.cleared(id),
    skipped: (id: string) => save.level(id).skipped,
  };
  const next = nextLevel(session.level.id, p);
  if (!next) { screens.showSelect(); return; }

  const L = loadLevel(next);
  const seen = save.data.seen_intros;
  const showsIntro = L.meta.intro !== undefined && !seen.includes(seenKey(L.id, L.meta.intro));
  const d = shouldShowInterstitial({
    chapter: L.meta.chapter, showsIntro, now: nowSeconds(), ads: adState(),
  });
  if (d.show && ads.isInterstitialReady()) {
    const r = await ads.showInterstitial();
    // 광고가 준비 안 됐거나 실패하면 기다리지 않고 넘어간다 (§14.4)
    if (r === 'shown') saveAdState(afterInterstitial(adState(), nowSeconds()));
  }
  startPlay(next);
}

// ── 루프 ────────────────────────────────────────────────────────────────
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  syncHudVisibility();
  if (!session.level) return;
  elapsed += dt;

  // 타이틀 데모: 끝나면 잠깐 쉬고 다시 쏜다 (§13.1)
  if (demo) {
    session.advance(dt);
    if (session.state === 'flying') {
      const { x, y, vx, vy } = session.sim.ship;
      cam.follow(session.level, x, y, vx, vy, dt);
    } else if (session.state === 'ending') {
      demoIdle += dt;
      if (demoIdle > DEMO_PAUSE) replayDemo();
    }
    draw(null);
    return;
  }

  if (screens.overlayOpen || paused) { draw(null); return; }

  session.advance(dt);
  if (session.state === 'flying') {
    const { x, y, vx, vy } = session.sim.ship;
    cam.follow(session.level, x, y, vx, vy, dt);
  }
  stepGlide(dt);
  // 비행이 끝난 순간 한 번만 소리와 진동
  if (session.state === 'ending' && !ended) {
    ended = true;
    if (session.outcome === 'win') { sfx.play('arrive'); buzz([25, 60, 25]); }
    else { sfx.play('explode'); buzz(60); }
  }
  if (session.state !== 'ending') ended = false;

  if (session.state === 'ending' && session.endProgress() >= 1 && hud.result.hidden) {
    save.record(session.level.id, session.outcome, session.flightSeconds());
    if (session.outcome === 'win') saveAdState(afterClear(adState()));
    const p = {
      cleared: (id: string) => save.cleared(id),
      skipped: (id: string) => save.level(id).skipped,
    };
    hud.showResult(session, {
      chapterLast: isChapterLast(session.level.id),
      last: nextLevel(session.level.id, p) === null,
      canHint: save.level(session.level.id).fails >= 2,
    });
  }

  hud.refresh(session);
  mini = miniRect(session.level, cam, cssW);
  draw(session.state === 'aiming' && session.aimFar ? session.preview() : null);
}

/**
 * 픽셀 그림은 **월드 1유닛 = 1픽셀 크기의 작은 버퍼**에 그리고, 화면에는 한 번에 키워 찍는다.
 *
 * 전에는 스프라이트를 화면 해상도(기기 픽셀 2.5배 × 배율)로 하나하나 그렸다. 픽셀 수가
 * 여섯 배쯤 되어, CPU 를 4배 늦춘 측정에서 5-1 비행이 14fps 였다(필드를 빼면 53fps).
 * 작은 버퍼에 그리면 모든 그림 픽셀이 같은 격자에 놓이는 덤도 있다 — 시안이 바란 모습이다.
 * 카메라의 소수 이동은 키워 찍을 때 기기 픽셀 단위로 반영해 스크롤은 부드럽게 둔다.
 */
const world = document.createElement('canvas');
const wctx = world.getContext('2d', { alpha: false })!;

function draw(preview: { points: number[]; outcome: string } | null): void {
  const ox = Math.floor(cam.x), oy = Math.floor(cam.y);
  const w = Math.ceil(cam.viewW) + 2, h = Math.ceil(cam.viewH) + 2;
  if (world.width !== w) world.width = w;
  if (world.height !== h) world.height = h;
  wctx.setTransform(1, 0, 0, 1, -ox, -oy);
  wctx.imageSmoothingEnabled = false;            // 픽셀 그림은 번지지 않게 (시안의 규칙)
  field.draw(wctx, cam, session, elapsed, preview);

  const px = cam.scale * dpr;                    // 월드 1유닛 = 기기 px
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(world, Math.round((ox - cam.x) * px), Math.round((oy - cam.y) * px),
    Math.round(w * px), Math.round(h * px));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!demo && !screens.overlayOpen && !hints.open && mini) drawMinimap(ctx, mini, cam, session);
}

// HUD 는 플레이 중에만 보인다.
// 전에는 따로 도는 두 번째 rAF 루프가 매 프레임 스타일을 썼다. 바뀔 때만 쓴다.
const hudEls = [document.querySelector('.hud.top'), hud.hint, hud.angle] as HTMLElement[];
let hudShown: boolean | null = null;
function syncHudVisibility(): void {
  const show = !demo && !screens.overlayOpen && !hints.open;
  if (show === hudShown) return;
  hudShown = show;
  for (const el of hudEls) if (el) el.style.visibility = show ? '' : 'hidden';
}

void pickAdProvider(cap, {
  pause: () => { paused = true; session.pauseReset(); },
  resume: () => { paused = false; },
}).then((p) => { ads = p; });

// OS 가 모션 줄이기를 켰으면 기본값으로 따른다 (§12.4).
// 사용자가 설정에서 직접 바꾼 적이 있으면 그 값이 이긴다.
if (cap.prefersReducedMotion && !save.data.settings.reduce_motion_set) {
  save.data.settings.reduce_motion = true;
  applySettings();
}

// 서비스 워커 — 재방문 시 오프라인 동작 (§15.1). 개발 서버에서는 걸지 않는다.
if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register(
      new URL('sw.js', location.href).pathname,
    ).catch(() => { /* 실패해도 게임은 그대로 돈다 */ });
  });
}

// 개발 서버에서만: 브라우저 확인 스크립트가 정확한 각도로 쏘려고 쓴다 (§16.6). 배포 번들에는 없다
if (import.meta.env.DEV) {
  (window as unknown as { __swingby: unknown }).__swingby = {
    session, cam, field, startPlay,
    fire: (deg: number) => { session.setAngle(deg); session.launch(); },
  };
}

resize();
startDemo();
requestAnimationFrame(frame);
