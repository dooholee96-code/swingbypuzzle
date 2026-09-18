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
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { Save } from './save/save.js';

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

let cssW = 0, cssH = 0, dpr = 1;
let mini: MiniRect | null = null;
let panning = false;
let dragMode: 'aim' | 'mini' | null = null;
let last = performance.now();
let t = 0;
let demo = false;                  // 타이틀 데모가 도는 중인가
let demoIdle = 0;

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
});

function applySettings(): void {
  field.reduceMotion = save.data.settings.reduce_motion;
  setGlow(save.data.settings.glow !== 'low');
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
  field.rebuild(session.level);
  hud.hideResult();
  panning = false;
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
  if (demo || screens.overlayOpen || !session.level) return;
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
    if (aim.shouldLaunch()) { session.launch(); panning = false; }
    else session.cancelAim();
    aim.finish();
  }
  dragMode = null;
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
  if (document.hidden) save.flush();
});
addEventListener('pagehide', () => save.flush());

// ── 화면 흐름 ───────────────────────────────────────────────────────────
hud.onRetry = () => {
  session.reset(); aim.finish(); hud.hideResult(); panning = false; snapToStart();
};
hud.onOpenPicker = () => { hud.hideResult(); screens.showSelect(); };
hud.onNext = () => {
  const p = {
    cleared: (id: string) => save.cleared(id),
    skipped: (id: string) => save.level(id).skipped,
  };
  const next = nextLevel(session.level.id, p);
  if (next) startPlay(next);
  else screens.showSelect();
};
hud.stage.addEventListener('click', () => hud.onOpenPicker());

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

  if (screens.overlayOpen) { draw(null); return; }

  session.advance(dt);
  if (session.state === 'flying') {
    const { x, y, vx, vy } = session.sim.ship;
    cam.follow(session.level, x, y, vx, vy, dt);
  }
  if (session.state === 'ending' && session.endProgress() >= 1 && hud.result.hidden) {
    save.record(session.level.id, session.outcome, session.flightSeconds());
    const p = {
      cleared: (id: string) => save.cleared(id),
      skipped: (id: string) => save.level(id).skipped,
    };
    hud.showResult(session, {
      chapterLast: isChapterLast(session.level.id),
      last: nextLevel(session.level.id, p) === null,
    });
  }

  hud.refresh(session);
  mini = miniRect(session.level, cam, cssW);
  draw(session.state === 'aiming' && session.aimFar ? session.preview() : null);
}

function draw(preview: { points: number[]; outcome: string } | null): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.save();
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-cam.x, -cam.y);
  field.draw(ctx, cam, session, t, preview);
  ctx.restore();
  if (!demo && !screens.overlayOpen && mini) drawMinimap(ctx, mini, cam, session);
}

// HUD 는 플레이 중에만 보인다
const hudEls = [document.querySelector('.hud.top'), hud.hint, hud.angle] as HTMLElement[];
function syncHudVisibility(): void {
  const show = !demo && !screens.overlayOpen;
  for (const el of hudEls) if (el) el.style.visibility = show ? '' : 'hidden';
  requestAnimationFrame(syncHudVisibility);
}

resize();
startDemo();
requestAnimationFrame(frame);
requestAnimationFrame(syncHudVisibility);
