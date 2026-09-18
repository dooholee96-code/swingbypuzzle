// 스테이지 에디터. docs/PLAN.md §8.7
//
// 개발 서버에서만 뜨는 개발자용 도구다. 여기서 [채택하고 저장]을 누르면
// src/levels/data/<ID>.json 이 실제로 바뀌고, 그대로 커밋하면 다음 배포에
// 올라간다 — 에디터의 결과가 업데이트에 반영되는 경로가 이것 하나다.
//
// 배포 번들에는 들어가지 않는다: editor.html 은 vite build 의 입력이 아니다.

import { PAD_R } from '../core/constants.js';
import { padAngle } from '../core/angle.js';
import { allIds } from '../levels/chapters.js';
import { loadLevel } from '../levels/registry.js';
import { validateSchema } from '../levels/loader.js';
import { C } from '../render/palette.js';
import type { Hole, Level, Planet, Rock, Ufo } from '../core/types.js';
import type { FanPath, Req, Res } from './verify.worker.js';

const DEBOUNCE = 200;            // §8.7. v4 의 600ms 는 GDScript 속도 때문이었다
const SNAP = 5;                  // 격자 스냅(유닛). Shift 로 해제
const HISTORY = 50;
const HANDLE = 8;                // 화면 px 기준 손잡이 반경

type Kind = 'planet' | 'hole' | 'rock' | 'ufo' | 'start' | 'goal';
/** 도구 막대의 항목. 'orbit' 은 공전하는 행성을 놓는 도구다(종류는 planet). */
type Tool = 'select' | 'planet' | 'orbit' | 'hole' | 'rock' | 'ufo';
interface Sel { kind: Kind; index: number }

// 실패 원인별 색 (§8.7). 팔레트 토큰 밖의 색을 쓰지 않는다 (§12.6).
const OUTCOME_COLOR: Record<string, string> = {
  win: '#5FD38D',
  planet: C.goal, rock: C.goal,
  hole: C.hole,
  ufo: C.danger, shot: C.danger,
  wall: '#6B7684', drift: '#6B7684',
};

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const el = (tag: string, cls?: string, text?: string): HTMLElement => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

// ── 상태 ────────────────────────────────────────────────────────────

let L: Level;
/** 열었을 때의 원본. 실제로 바뀐 게 없으면 meta.source 를 건드리지 않는다. */
let original = '';
let sel: Sel | null = null;
let tool: Tool = 'select';
const past: string[] = [];
const future: string[] = [];

let fan: FanPath[] = [];
let report: Extract<Res, { kind: 'fine' }>['report'] | null = null;
let coarse: { width: number } | null = null;
let seq = 0;
let timer: number | undefined;

const cv = $<HTMLCanvasElement>('cv');
const ctx = cv.getContext('2d')!;
const worker = new Worker(new URL('./verify.worker.ts', import.meta.url), { type: 'module' });

// ── 되돌리기 ─────────────────────────────────────────────────────────

function snapshot(): void {
  past.push(JSON.stringify(L));
  if (past.length > HISTORY) past.shift();
  future.length = 0;
}
function undo(): void {
  const s = past.pop();
  if (!s) return;
  future.push(JSON.stringify(L));
  L = JSON.parse(s) as Level;
  sel = null;
  afterEdit(false);
}
function redo(): void {
  const s = future.pop();
  if (!s) return;
  past.push(JSON.stringify(L));
  L = JSON.parse(s) as Level;
  sel = null;
  afterEdit(false);
}

// ── 검증 ────────────────────────────────────────────────────────────

function verify(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    seq++;
    coarse = null; report = null; fan = [];
    $('spin').textContent = '재는 중…';
    $<HTMLButtonElement>('save').disabled = true;
    worker.postMessage({ seq, level: JSON.parse(JSON.stringify(L)) as Level } satisfies Req);
  }, DEBOUNCE);
}

worker.onmessage = (ev: MessageEvent<Res>): void => {
  const m = ev.data;
  if (m.seq !== seq) return;
  if (m.kind === 'coarse') { coarse = m; drawVerdict(); }
  else if (m.kind === 'fan') { fan = m.paths; draw(); }
  else if (m.kind === 'fine') {
    report = m.report;
    $('spin').textContent = '';
    $<HTMLButtonElement>('save').disabled = m.report.failures.length > 0;
    drawVerdict(); draw();
  } else {
    $('spin').textContent = '';
    $('verdict').replaceChildren(el('p', 'fail', m.message));
  }
};

// ── 좌표 ────────────────────────────────────────────────────────────

let scale = 1, ox = 0, oy = 0;

function layout(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scale = Math.min((w - 40) / L.w, (h - 40) / L.h);
  ox = (w - L.w * scale) / 2;
  oy = (h - L.h * scale) / 2;
}
const sx = (x: number): number => ox + x * scale;
const sy = (y: number): number => oy + y * scale;
const wx = (x: number): number => (x - ox) / scale;
const wy = (y: number): number => (y - oy) / scale;

// ── 그리기 ──────────────────────────────────────────────────────────

function ring(x: number, y: number, r: number, color: string, dash?: number[]): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.arc(sx(x), sy(y), r * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function draw(): void {
  layout();
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, cv.clientWidth, cv.clientHeight);

  // 맵 경계
  ctx.strokeStyle = C.line; ctx.globalAlpha = .3; ctx.lineWidth = 1;
  ctx.strokeRect(sx(0), sy(0), L.w * scale, L.h * scale);
  ctx.globalAlpha = 1;

  // 궤적 부채꼴
  ctx.lineWidth = 1;
  for (const p of fan) {
    if (p.pts.length < 4) continue;
    ctx.strokeStyle = OUTCOME_COLOR[p.outcome] ?? C.line;
    ctx.globalAlpha = p.outcome === 'win' ? .9 : .22;
    ctx.beginPath();
    ctx.moveTo(sx(p.pts[0]!), sy(p.pts[1]!));
    for (let i = 2; i < p.pts.length; i += 2) ctx.lineTo(sx(p.pts[i]!), sy(p.pts[i + 1]!));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (const a of L.rocks ?? []) ring(a.x, a.y, a.r, C.line);
  for (const h of L.holes ?? []) {
    ring(h.x, h.y, h.R, C.hole, [4, 6]);
    ring(h.x, h.y, h.rH, C.hole);
  }
  for (const p of L.planets ?? []) {
    ring(p.x, p.y, p.R, C.gravity, [4, 6]);
    ring(p.x, p.y, p.r, C.line);
    if (p.orbit) {
      ring(p.orbit.cx, p.orbit.cy, p.orbit.rad, C.gravity, [2, 8]);
      ring(p.orbit.cx, p.orbit.cy, 3, C.gravity);
    }
  }
  for (const u of L.ufos ?? []) {
    ring(u.x, u.y, u.range, C.danger, [4, 6]);
    ring(u.x, u.y, 13, C.danger);
  }

  ring(L.goal.x, L.goal.y, L.goal.r, C.goal);

  // 발사대 행성과 걸을 수 있는 호 (§5.9)
  ring(L.start.x, L.start.y, PAD_R, C.line);
  const c = padAngle(L) * Math.PI / 180, arc = Math.PI / 2;
  ctx.strokeStyle = C.gravity; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx(L.start.x), sy(L.start.y), PAD_R * scale, c - arc, c + arc);
  ctx.stroke();

  // 선택 표시
  if (sel) {
    const p = posOf(sel);
    if (p) {
      ctx.strokeStyle = C.goal; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.strokeRect(sx(p[0]) - 14, sy(p[1]) - 14, 28, 28);
      ctx.setLineDash([]);
    }
  }
  ctx.lineWidth = 1;
}

// ── 히트 테스트 ──────────────────────────────────────────────────────

function posOf(s: Sel): [number, number] | null {
  if (s.kind === 'start') return [L.start.x, L.start.y];
  if (s.kind === 'goal') return [L.goal.x, L.goal.y];
  const a = listOf(s.kind)[s.index];
  return a ? [a.x, a.y] : null;
}
/**
 * 읽기 전용 접근. **`??=` 를 쓰지 않는다** — 그러면 그냥 클릭만 해도
 * 레벨에 `"holes": []` 같은 빈 배열이 생겨 저장될 때 diff 에 섞인다.
 */
function listOf(k: Kind): { x: number; y: number }[] {
  if (k === 'planet') return L.planets ?? [];
  if (k === 'hole') return L.holes ?? [];
  if (k === 'rock') return L.rocks ?? [];
  if (k === 'ufo') return L.ufos ?? [];
  return [];
}

/** 클릭 지점에서 가장 가까운 요소. `edge` 면 중력 범위 고리를 잡은 것이다. */
interface Hit { sel: Sel; edge: boolean; d: number }

function pick(x: number, y: number): Hit | null {
  const tol = HANDLE / scale;
  const near = (px: number, py: number): number => Math.hypot(px - x, py - y);
  const hits: Hit[] = [];

  for (const k of ['planet', 'hole', 'rock', 'ufo'] as const) {
    listOf(k).forEach((a, index) => {
      hits.push({ sel: { kind: k, index }, edge: false, d: near(a.x, a.y) });
      // 중력 범위(또는 사격 범위) 고리를 끌면 R 을 바꾼다
      const R = (a as Partial<Planet & Hole>).R ?? (a as Partial<Ufo>).range;
      if (R) hits.push({ sel: { kind: k, index }, edge: true, d: Math.abs(near(a.x, a.y) - R) });
    });
  }
  hits.push({ sel: { kind: 'goal', index: 0 }, edge: false, d: near(L.goal.x, L.goal.y) });
  hits.push({ sel: { kind: 'start', index: 0 }, edge: false, d: near(L.start.x, L.start.y) });

  let best: Hit | null = null;
  for (const h of hits) if (h.d <= tol && (best === null || h.d < best.d)) best = h;
  return best;
}

// ── 입력 ────────────────────────────────────────────────────────────

let drag: { sel: Sel; edge: boolean; moved: boolean } | null = null;

cv.addEventListener('pointerdown', (e) => {
  const r = cv.getBoundingClientRect();
  const x = wx(e.clientX - r.left), y = wy(e.clientY - r.top);

  if (tool !== 'select') { addAt(tool, x, y); return; }


  const hit = pick(x, y);
  sel = hit?.sel ?? null;
  if (hit) {
    snapshot();
    drag = { sel: hit.sel, edge: hit.edge, moved: false };
    cv.setPointerCapture(e.pointerId);
  }
  showProps(); draw();
});

cv.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const r = cv.getBoundingClientRect();
  let x = wx(e.clientX - r.left), y = wy(e.clientY - r.top);
  if (!e.shiftKey) { x = Math.round(x / SNAP) * SNAP; y = Math.round(y / SNAP) * SNAP; }
  drag.moved = true;

  if (drag.edge) {
    const a = listOf(drag.sel.kind)[drag.sel.index] as (Planet | Hole | Ufo) | undefined;
    if (a) {
      const R = Math.max(20, Math.round(Math.hypot(x - a.x, y - a.y) / SNAP) * SNAP);
      if ('range' in a) a.range = R; else a.R = R;
    }
  } else if (drag.sel.kind === 'start') { L.start.x = x; L.start.y = y; }
  else if (drag.sel.kind === 'goal') { L.goal.x = x; L.goal.y = y; }
  else {
    const a = listOf(drag.sel.kind)[drag.sel.index];
    if (a) { a.x = x; a.y = y; }
  }
  showProps(); draw();
});

const endDrag = (): void => {
  if (drag?.moved) afterEdit();
  else if (drag) past.pop();      // 안 움직였으면 스냅숏을 버린다
  drag = null;
};
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);

document.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.key === 'z' && (e.ctrlKey || e.metaKey)) { e.shiftKey ? redo() : undo(); e.preventDefault(); }
  if (e.key === 'Delete' || e.key === 'Backspace') { removeSel(); e.preventDefault(); }
  if (e.key === 'Escape') { tool = 'select'; syncTools(); sel = null; showProps(); draw(); }
});

// ── 요소 추가·삭제 ───────────────────────────────────────────────────

function addAt(k: Exclude<Tool, 'select'>, x: number, y: number): void {
  snapshot();
  const gx = Math.round(x / SNAP) * SNAP, gy = Math.round(y / SNAP) * SNAP;
  if (k === 'planet') (L.planets ??= []).push({ x: gx, y: gy, r: 24, g: 800, R: 160, sides: 10 });
  if (k === 'orbit') {
    (L.planets ??= []).push({
      x: gx, y: gy, r: 20, g: 600, R: 120, sides: 9, role: 'gate',
      orbit: { cx: gx, cy: gy, rad: 80, period: 8, phase: 0 },
    } as Planet);
  }
  if (k === 'hole') (L.holes ??= []).push({ x: gx, y: gy, rH: 16, g: 900, R: 180 } as Hole);
  if (k === 'rock') {
    (L.rocks ??= []).push({ x: gx, y: gy, r: 20, seed: (L.rocks?.length ?? 0) + 1 } as Rock);
  }
  if (k === 'ufo') {
    (L.ufos ??= []).push({ x: gx, y: gy, range: 160, interval: 1, delay: .3, bs: 240 } as Ufo);
  }
  tool = 'select'; syncTools();
  afterEdit();
}

function removeSel(): void {
  if (!sel || sel.kind === 'start' || sel.kind === 'goal') return;
  snapshot();
  const arr = (L as unknown as Record<string, { x: number; y: number }[] | undefined>)[
    sel.kind === 'planet' ? 'planets' : sel.kind === 'hole' ? 'holes'
      : sel.kind === 'rock' ? 'rocks' : 'ufos'];
  arr?.splice(sel.index, 1);
  sel = null;
  afterEdit();
}

function afterEdit(push = true): void {
  if (!push) { /* undo/redo 는 이미 이력을 옮겼다 */ }
  showLevelForm(); showProps(); draw(); verify();
}

// ── 오른쪽 패널 ──────────────────────────────────────────────────────

function num(
  label: string, value: number, set: (v: number) => void, step = 1,
): [HTMLElement, HTMLElement] {
  const i = el('input') as HTMLInputElement;
  i.type = 'number'; i.value = String(value); i.step = String(step);
  i.addEventListener('change', () => {
    const v = Number(i.value);
    if (!Number.isFinite(v)) return;
    snapshot(); set(v); afterEdit();
  });
  return [el('label', undefined, label), i];
}

function showLevelForm(): void {
  const f = $('levelform');
  f.replaceChildren(
    ...num('가로 w', L.w, (v) => { L.w = v; }, 10),
    ...num('세로 h', L.h, (v) => { L.h = v; }, 10),
    ...num('속도', L.speed, (v) => { L.speed = v; }, 5),
    ...num('예측선(초)', L.preview, (v) => { L.preview = v; }, .1),
    ...num('정답 θ', L.meta.solution.angle, (v) => { L.meta.solution.angle = v; }, .5),
    ...num('발사 스텝', L.meta.solution.launch_step, (v) => { L.meta.solution.launch_step = v; }, 10),
  );
}

function showProps(): void {
  const f = $('propform');
  if (!sel) { f.replaceChildren(el('p', 'dim', '아무것도 선택하지 않았어요.')); return; }
  const rows: HTMLElement[] = [el('p', 'dim', `${sel.kind}[${sel.index}]`)];

  if (sel.kind === 'start' || sel.kind === 'goal') {
    const o = sel.kind === 'start' ? L.start : L.goal;
    rows.push(...num('x', o.x, (v) => { o.x = v; }), ...num('y', o.y, (v) => { o.y = v; }));
    if (sel.kind === 'goal') rows.push(...num('반경 r', L.goal.r, (v) => { L.goal.r = v; }));
  } else {
    const a = listOf(sel.kind)[sel.index] as Record<string, number | undefined> | undefined;
    if (!a) { f.replaceChildren(el('p', 'dim', '사라진 요소예요.')); return; }
    for (const key of ['x', 'y', 'r', 'rH', 'g', 'R', 'sides', 'range', 'interval', 'delay', 'bs', 'seed']) {
      if (typeof a[key] === 'number') {
        rows.push(...num(key, a[key], (v) => { a[key] = v; }, key === 'interval' || key === 'delay' ? .1 : 1));
      }
    }
    if (sel.kind === 'planet' || sel.kind === 'hole') {
      const s = el('select') as HTMLSelectElement;
      for (const r of ['required', 'optional', 'gate']) s.append(new Option(r, r));
      s.value = (a['role'] as unknown as string) ?? ((a['orbit'] as unknown) ? 'gate' : 'required');
      s.addEventListener('change', () => {
        snapshot(); (a as unknown as { role: string }).role = s.value; afterEdit();
      });
      rows.push(el('label', undefined, 'role'), s);
    }
  }
  f.replaceChildren(...rows);
}

function drawVerdict(): void {
  const v = $('verdict');
  const kv = el('div', 'kv');
  const put = (k: string, s: string): void => { kv.append(el('span', 'dim', k), el('span', undefined, s)); };

  if (report) {
    const m = report.metrics;
    put('성공 폭', `${m.main_window.toFixed(2)}°`);
    if (m.main_window_at_solution !== m.main_window) {
      put('정답 시점 폭', `${m.main_window_at_solution.toFixed(2)}°`);
    }
    put('비행 시간', `${m.flight_time.toFixed(2)}초`);
    put('clearance', m.clearance.toFixed(2));
    if (m.timing_fraction !== undefined) put('timing', m.timing_fraction.toFixed(2));
    put('난이도', m.difficulty.toFixed(2));
    if (m.center_angle !== null) put('주 구간 중앙', `${m.center_angle}°`);
  } else if (coarse) {
    put('성공 폭(대략)', `${coarse.width.toFixed(0)}°`);
  }

  const list = el('ul');
  if (report) {
    for (const s of report.failures) list.append(el('li', 'fail', `✗ ${s}`));
    for (const s of report.warnings) list.append(el('li', 'warn', `! ${s}`));
    if (!report.failures.length) list.append(el('li', 'pass', '✓ 필수 규칙 전부 통과'));
    list.append(el('li', 'dim', '레시피 항목(규칙 1 최소 폭·규칙 6)은 M8'));
  }
  v.replaceChildren(kv, list);
}

// ── 후보 목록 ───────────────────────────────────────────────────────

async function loadCandidates(): Promise<void> {
  const box = $('cands');
  try {
    const r = await fetch('/__editor/candidates');
    const { candidates } = await r.json() as { candidates: { path: string; json: Level }[] };
    if (!candidates.length) return;
    box.replaceChildren(...candidates.map((c) => {
      const row = el('div', 'cand');
      row.append(el('span', undefined, c.path.replace('candidates/', '')),
        el('span', 'dim', c.json.meta?.metrics?.difficulty?.toFixed?.(1) ?? ''));
      row.addEventListener('click', () => {
        snapshot(); L = c.json; original = bodyOf(L); sel = null; afterEdit();
      });
      return row;
    }));
  } catch { /* 개발 서버가 아니면 그냥 둔다 */ }
}

// ── 저장 ────────────────────────────────────────────────────────────

/**
 * 저장 형태로 다듬는다. §2.2 — 좌표 변경이 git diff 에서 바로 읽혀야 하므로
 * 키 순서를 §6.1 스키마 순서로 고정하고, 비어 버린 배열은 아예 뺀다.
 */
function normalize(lv: Level): Level {
  const out: Record<string, unknown> = {};
  for (const k of ['id', 'name', 'w', 'h', 'speed', 'preview', 'start', 'goal',
    'planets', 'holes', 'rocks', 'ufos', 'hint', 'meta'] as const) {
    const v = (lv as unknown as Record<string, unknown>)[k];
    if (v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as unknown as Level;
}

/** 지표·source·updated 를 뺀 알맹이. "실제로 바뀌었나"를 이걸로 본다. */
function bodyOf(lv: Level): string {
  const n = normalize(lv);
  const { metrics: _m, source: _s, updated: _u, ...meta } = n.meta;
  return JSON.stringify({ ...n, meta });
}

async function save(): Promise<void> {
  if (!report || report.failures.length) return;
  const next: Level = normalize(JSON.parse(JSON.stringify(L)) as Level);

  // 열어 보기만 하고 저장하는 경우가 있다. 그때 verified 를 editor 로
  // 떨어뜨리면 §6.2 의 "사전 검증됨" 기록이 조용히 사라진다.
  if (bodyOf(next) !== original) {
    next.meta.source = 'editor';
    next.meta.updated = new Date().toISOString().slice(0, 10);
  }
  next.meta.metrics = metaOf(report.metrics);

  const errs = validateSchema(next, next.id);
  if (errs.length) { alert('스키마 오류:\n' + errs.join('\n')); return; }

  const r = await fetch('/__editor/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `src/levels/data/${next.id}.json`, json: next }),
  });
  const out = await r.json() as { ok?: boolean; error?: string };
  alert(out.ok
    ? `저장했어요: src/levels/data/${next.id}.json\n커밋하면 다음 배포에 올라갑니다.`
    : `저장 실패: ${out.error}`);
}

function metaOf(m: NonNullable<typeof report>['metrics']): Level['meta']['metrics'] {
  const r2 = (v: number): number => Math.round(v * 100) / 100;
  const out = {
    main_window: r2(m.main_window_at_solution),
    flight_time: r2(m.flight_time),
    clearance: r2(m.clearance),
    difficulty: r2(m.difficulty),
  } as NonNullable<Level['meta']['metrics']>;
  if (r2(m.main_window) !== r2(m.main_window_at_solution)) {
    out.main_window_best = r2(m.main_window);
    out.best_launch_step = m.best_launch_step;
  }
  if (m.timing_fraction !== undefined) out.timing_fraction = r2(m.timing_fraction);
  return out;
}

// ── 초기화 ──────────────────────────────────────────────────────────

function syncTools(): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('.tool')) {
    b.classList.toggle('on', b.dataset['tool'] === tool);
  }
}

function open(id: string): void {
  L = loadLevel(id);
  original = bodyOf(L);
  sel = null; past.length = 0; future.length = 0;
  afterEdit();
}

function init(): void {
  const chooser = $<HTMLSelectElement>('pick');
  for (const id of allIds()) chooser.append(new Option(id, id));
  chooser.addEventListener('change', () => open(chooser.value));

  for (const b of document.querySelectorAll<HTMLButtonElement>('.tool')) {
    b.addEventListener('click', () => { tool = b.dataset['tool'] as Tool; syncTools(); });
  }
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  $('del').addEventListener('click', removeSel);
  $('save').addEventListener('click', () => { void save(); });
  $('copy').addEventListener('click', () => {
    void navigator.clipboard.writeText(JSON.stringify(L, null, 2));
  });
  $('paste').addEventListener('click', async () => {
    const t = prompt('레벨 JSON 을 붙여넣으세요');
    if (!t) return;
    try {
      const raw = JSON.parse(t) as Level;
      const errs = validateSchema(raw, raw.id);
      if (errs.length) { alert('스키마 오류:\n' + errs.join('\n')); return; }
      snapshot(); L = raw; original = bodyOf(L); sel = null; afterEdit();
    } catch (e) { alert(String(e)); }
  });

  window.addEventListener('resize', draw);
  open(allIds()[0]!);
  void loadCandidates();
}

init();
