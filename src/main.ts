// 부트스트랩과 프레임 루프. docs/PLAN.md §9.1, §10, §11
//
// Title 화면은 M6 에서 붙인다. 지금은 단계 선택 → 플레이.

import './ui/styles.css';

import { allIds } from './levels/chapters.js';
import { loadLevel } from './levels/registry.js';
import { Camera } from './game/camera.js';
import { AimInput } from './game/input.js';
import { Session } from './game/session.js';
import { DOME_DRAW_R, FieldRenderer } from './render/field.js';
import { drawMinimap, miniRect } from './render/minimap.js';
import type { MiniRect } from './render/minimap.js';
import { setGlow } from './render/draw.js';
import { Hud } from './ui/hud.js';
import { Save } from './save/save.js';

const MAX_DPR = 2.5;               // §15.3

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

save.load();
field.reduceMotion = save.data.settings.reduce_motion;
setGlow(save.data.settings.glow !== 'low');

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

function load(id: string): void {
  session.setup(loadLevel(id));
  field.rebuild(session.level);
  hud.hideResult();
  hud.hidePicker();
  panning = false;
  resize();
  snapToStart();
}

// ── 입력 (§10) ──────────────────────────────────────────────────────────
function pos(e: PointerEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

canvas.addEventListener('pointerdown', (e) => {
  if (hud.pickerOpen || !session.level) return;
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
canvas.addEventListener('pointercancel', () => { session.cancelAim(); aim.finish(); dragMode = null; });

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

// ── 생명주기 ────────────────────────────────────────────────────────────
addEventListener('visibilitychange', () => {
  session.pauseReset();                 // 누산기를 버린다 (§5.8)
  if (document.hidden) save.flush();
});
addEventListener('pagehide', () => save.flush());

// ── 화면 흐름 ───────────────────────────────────────────────────────────
hud.onRetry = () => { session.reset(); aim.finish(); hud.hideResult(); panning = false; snapToStart(); };
hud.onPick = (id) => load(id);
hud.onOpenPicker = () => {
  hud.hideResult();
  hud.showPicker((id) => save.cleared(id), (id) => loadLevel(id).name);
};
hud.onNext = () => {
  const ids = allIds();
  const i = ids.indexOf(session.level.id);
  load(ids[(i + 1) % ids.length]!);
};
hud.stage.addEventListener('click', () => hud.onOpenPicker());

// ── 루프 ────────────────────────────────────────────────────────────────
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!session.level || hud.pickerOpen) return;
  t += dt;

  session.advance(dt);
  if (session.state === 'flying') {
    const { x, y, vx, vy } = session.sim.ship;
    cam.follow(session.level, x, y, vx, vy, dt);
  }
  if (session.state === 'ending' && session.endProgress() >= 1 && hud.result.hidden) {
    save.record(session.level.id, session.outcome, session.flightSeconds());
    hud.showResult(session);
  }

  hud.refresh(session);
  mini = miniRect(session.level, cam, cssW);

  // 예측선은 프레임당 1회만 계산한다 (§18)
  const preview = session.state === 'aiming' && session.aimFar ? session.preview() : null;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.save();
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-cam.x, -cam.y);
  field.draw(ctx, cam, session, t, preview);
  ctx.restore();
  if (mini) drawMinimap(ctx, mini, cam, session);
}

resize();
load(allIds()[0]!);
requestAnimationFrame(frame);
