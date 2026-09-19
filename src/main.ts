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
import { setGlow } from './render/draw.js';
import { C } from './render/palette.js';
import { Hud } from './ui/hud.js';
import { HintSheet } from './ui/hints.js';
import { Screens } from './ui/screens.js';
import { Save } from './save/save.js';
import { Audio } from './audio/sfx.js';
import { type AdProvider, NoAdProvider } from './platform/ads.js';
import { detect, pickAdProvider } from './platform/capabilities.js';
import {
  afterClear, afterInterstitial, afterRewarded, shouldShowInterstitial,
} from './monetization/ad-policy.js';
import { type HintKind, directionArc, previewSeconds } from './monetization/hints.js';

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
let last = performance.now();
let t = 0;
let demo = false;                  // 타이틀 데모가 도는 중인가
let demoIdle = 0;
let ended = false;               // 이번 비행의 끝 소리를 이미 냈는가
let paused = false;                // 힌트 시트가 열려 있으면 단계 시계를 멈춘다 (§13.5)
let ads: AdProvider = new NoAdProvider();
const started = performance.now();

/** 앱 실행 후 흐른 시각(초). 광고 규칙이 쓰는 유일한 시계다 (§14.4) */
const nowSeconds = (): number => (performance.now() - started) / 1000;

save.load();
applySettings();

const screens = new Screens({
  progress: {
    cleared: (id) => save.cleared(id),
    skipped: (id) => save.level(id).skipped,
  },
  levelName: (id) => loadLevel(id).name,
  settings: save.data.settings,
  onStart: () => startPlay(resumeLevel({
    cleared: (id) => save.cleared(id),
    skipped: (id) => save.level(id).skipped,
  })),
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
    else save.data.ads = { ...save.data.ads, ...afterRewarded(adState(), nowSeconds()) as object };
    save.touch();
    applyHints();
  },
  skip: () => {
    const l = save.level(session.level.id);
    l.skipped = true;
    save.data.ads = { ...save.data.ads, last_rewarded_at: nowSeconds() };
    save.touch();
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
  setGlow(save.data.settings.glow !== 'low');
  sfx.enabled = save.data.settings.sfx;
}

// 첫 사용자 입력에서 오디오를 연다 (브라우저 자동재생 정책, §17 M11)
for (const ev of ['pointerdown', 'keydown'] as const) {
  addEventListener(ev, () => sfx.unlock(), { once: false, passive: true });
}

function resize(): void {
  const r = canvas.getBoundingClientRect();
  cssW = r.width; cssH = r.height;
  dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  cam.layout(cssW, cssH);
  if (session.level) {
    cam.clamp(session.level);
    if (!panning && session.state !== 'flying') snapToStart();
  }
}
addEventListener('resize', resize);

function snapToStart(): void {
  cam.centerOn(session.level, session.level.start.x, session.level.start.y);
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

/** 타이틀 뒤에서 1-1 의 정답을 반복 재생한다 (§13.1). */
function startDemo(): void {
  demo = true;
  demoIdle = 0;
  loadInto(DEMO_LEVEL);
  const sol = session.level.meta.solution;
  session.setAngle(sol.angle);
  session.launch();
  screens.showTitle();
}

function startPlay(id: string): void {
  demo = false;
  loadInto(id);
  screens.syncChapter(id);
  screens.hideSelect();
  screens.rememberIntro(id, session.level.meta.intro);
  screens.maybeShowIntro(session.level, save.data.seen_intros, (key) => {
    save.data.seen_intros.push(key);
    save.touch();
  });
}

// ── 입력 (§10) ──────────────────────────────────────────────────────────
function pos(e: PointerEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

canvas.addEventListener('pointerdown', (e) => {
  if (demo || screens.overlayOpen || hints.open || !session.level) return;
  if (session.state !== 'ready' && session.state !== 'aiming') return;
  const [x, y] = pos(e);
  canvas.setPointerCapture(e.pointerId);
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
  if (!dragMode) return;
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
}

/** 진동. 지원하지 않으면 조용히 건너뛴다 — iOS 사파리에는 없다 (§15.3). */
function buzz(ms: number | number[]): void {
  if (!save.data.settings.haptics || !cap.canVibrate) return;
  try { navigator.vibrate(ms); } catch { /* 무시 */ }
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => {
  session.cancelAim(); aim.finish(); dragMode = null;
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
  const showsIntro = L.meta.intro !== undefined && !seen.includes(L.meta.intro);
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
  if (!session.level) return;
  t += dt;

  // 타이틀 데모: 끝나면 잠깐 쉬고 다시 쏜다 (§13.1)
  if (demo) {
    session.advance(dt);
    if (session.state === 'flying') {
      const { x, y, vx, vy } = session.sim.ship;
      cam.follow(session.level, x, y, vx, vy, dt);
    } else if (session.state === 'ending') {
      demoIdle += dt;
      if (demoIdle > DEMO_PAUSE) startDemo();
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

function draw(preview: { points: number[]; outcome: string } | null): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.save();
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-cam.x, -cam.y);
  field.draw(ctx, cam, session, t, preview);
  ctx.restore();
  if (!demo && !screens.overlayOpen && !hints.open && mini) drawMinimap(ctx, mini, cam, session);
}

// HUD 는 플레이 중에만 보인다
const hudEls = [document.querySelector('.hud.top'), hud.hint, hud.angle] as HTMLElement[];
function syncHudVisibility(): void {
  const show = !demo && !screens.overlayOpen && !hints.open;
  for (const el of hudEls) if (el) el.style.visibility = show ? '' : 'hidden';
  requestAnimationFrame(syncHudVisibility);
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

resize();
startDemo();
requestAnimationFrame(frame);
requestAnimationFrame(syncHudVisibility);
