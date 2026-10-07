// 부트스트랩과 프레임 루프. docs/PLAN.md §9.1, §10, §11, §13

import './ui/styles.css';

import { allIds } from './levels/chapters.js';
import { loadLevel } from './levels/registry.js';
import {
  isChapterLast, nextLevel, resumeLevel,
} from './levels/progress.js';
import { starFlags, starsOf } from './levels/stars.js';
import { Camera } from './game/camera.js';
import { ARENA_H, ARENA_W } from './core/boss.js';
import { TURN_MAX } from './core/constants.js';
import { clampArc, quantize } from './core/angle.js';
import { AimInput } from './game/input.js';
import { END_SECONDS, Session } from './game/session.js';
import { DOME_DRAW_R, FieldRenderer } from './render/field.js';
import { drawMinimap, miniRect } from './render/minimap.js';
import type { MiniRect } from './render/minimap.js';
import { Hud } from './ui/hud.js';
import { InfinityWorld } from './tools-shared/infinity.js';
import { HintSheet } from './ui/hints.js';
import { LevelUpSheet } from './ui/levelup.js';
import { seenKey } from './ui/intro.js';
import { type InfinityMode, Screens } from './ui/screens.js';
import { dailySeed, dayKey, shortDate } from './tools-shared/daily.js';
import { Save } from './save/save.js';
import { Audio } from './audio/sfx.js';
import { type AdProvider, FreeHintProvider, NoAdProvider, type RewardPlacement } from './platform/ads.js';
import { buildTarget, detect, pickAdProvider, shareUrl } from './platform/capabilities.js';
import {
  type AdState, afterClear, afterInfinityRun, afterInterstitial, afterRewarded, forNewSession,
  shouldShowInfinityInterstitial, shouldShowInterstitial,
} from './monetization/ad-policy.js';
import { type HintKind, directionArc, previewSeconds } from './monetization/hints.js';
import {
  HTML_LANG, LANG_NAME, type Key, detectLang, isLangSetting, resolveLang, setLang, t,
} from './i18n/index.js';
import { levelName } from './i18n/levels.js';
import { messierLabel } from './i18n/messier.js';
import { toDataUrl } from './render/sprites/bake.js';
import { starTile } from './render/sprites/world.js';

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
let dragMode: 'aim' | 'mini' | 'boss' | 'flick' | null = null;
// 비행 중 스와이프 분사 (§22.1): 누른 자리에서 이만큼(CSS px) 끌면 끈 방향으로 바로 꺾는다.
// 끌지 않고 떼면 탭 — 탭한 쪽으로
let flickFrom: [number, number] = [0, 0];
const FLICK_PX = 20;
// 보스전 드래그 (§22.6): 손가락이 움직인 만큼 우주선이 움직인다(손가락이 우주선을 가리지 않게)
let bossFrom: [number, number, number, number] = [0, 0, 0, 0];
const BOSS_DRAG_K = 1.15;
const heldKeys = new Set<string>();
let bossShots = 0, bossHits = 0, bossAlarm = -1;
let dragPointer = -1;              // 조준·미니맵을 잡고 있는 손가락
let last = performance.now();
let elapsed = 0;                   // 연출용 시계(초). 물리 시계와 따로 간다
let demo = false;                  // 타이틀 데모가 도는 중인가
let demoIdle = 0;
let wasDocked = false;             // 지난 프레임에 궤도 행성에 붙잡혀 있었는가
let ended = false;               // 이번 비행의 끝 소리를 이미 냈는가
/**
 * 단계를 열 때 목적지가 한 화면에 안 들어오면, 목적지를 먼저 보여 주고 발사대로
 * 내려온다(§11). 화면을 누르면 바로 끝난다. 재시도·모션 줄이기에서는 하지 않는다.
 */
let glide: { t: number; fx: number; fy: number; tx: number; ty: number } | null = null;
const GLIDE_HOLD = 0.6, GLIDE_MOVE = 0.9;
let paused = false;                // 힌트 시트가 열려 있으면 단계 시계를 멈춘다 (§13.5)
let absorbs = 0;                   // 지난 프레임까지 방패로 튕긴 횟수 (§22.5)
let ads: AdProvider = new NoAdProvider();
let started = performance.now();

/** 앱 실행 후 흐른 시각(초). 광고 규칙이 쓰는 유일한 시계다 (§14.4) */
const nowSeconds = (): number => (performance.now() - started) / 1000;

save.load();
// 광고 규칙의 시각은 "이번 실행 후 흐른 초"라 지난 실행의 값과 비교할 수 없다 (§14.4)
saveAdState(forNewSession(adState()));
applySettings();

// ── 개발자용 숨은 옵션 (§22.1, §22.3) ─────────────────────────────────
// 화면 어디에도 안내하지 않는다. 저장하지 않으므로 주소에서 빼면 꺼진다.
// 배포 사이트에서도 켜진다 — 사용자가 폰에서 새 장·모드를 바로 시험하려고 요청했다.
const PARAMS = new URLSearchParams(location.search);
/**
 * `?turns=N`: 모든 단계에 분사를 N번(최대 9) 더 준다. 그 상태로 깬 단계는 평소처럼
 * 클리어로 남는다.
 */
const TEST_TURNS = Math.min(9, Math.max(0, Math.floor(Number(PARAMS.get('turns')) || 0)));
/**
 * `?open`: 모든 장·단계와 인피니티를 연다. 클리어 표시(✓)는 그대로다 — 열기만 한다.
 * `?open&turns=3` 처럼 함께 쓸 수 있다.
 */
const TEST_OPEN = PARAMS.has('open');

const screens = new Screens({
  progress: {
    cleared: (id) => save.cleared(id),
    skipped: (id) => save.level(id).skipped,
    allOpen: TEST_OPEN,
  },
  levelName: (id) => levelName(loadLevel(id)),
  levelStats: (id) => {
    const l = save.data.levels[id];
    return { stars: l ? starsOf(l) : 0, best: l?.best_time ?? null };
  },
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
  onInfinity: (mode) => startInfinity(mode),
  dailyInfo: () => { const d = dailyRecord(); return { date: shortDate(d.day), best: d.best }; },
  catalog: () => save.data.messier,
  // 타이틀이 보이면 뒤에서 데모가 돌아야 한다 (§13.1). 단계 선택·설정에서 타이틀로
  // 돌아올 때 전에는 멈춘 단계가 그대로 비쳤다
  onTitle: () => { if (!demo) replayDemo(); },
  infinityOpen: () => TEST_OPEN || save.cleared('6-1'),
  onPick: (id) => startPlay(id),
  onSettingChange: () => { applySettings(); save.touch(); },
  canOpenPrivacyOptions: () => ads.canOpenPrivacyOptions(),
  openPrivacyOptions: () => ads.openPrivacyOptions(),
  // 광고 제거 (§14.7): 결제는 M12 의 앱 셸에서 잇는다. 그전까지 줄은 뜨지 않는다
  noAds: { owned: () => save.data.ads.removed, canBuy: () => false, buy: () => {} },
});

const cap = detect();
const hints = new HintSheet({
  isRewardedReady: () => ads.isRewardedReady(),
  showRewarded: (p) => ads.showRewarded(p),
  // 제공자는 나중에(pickAdProvider) 갈아 끼워지므로 값이 아니라 그때그때 읽는다
  get adFree() { return ads.adFree ?? false; },
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

// 레벨업 카드 (§22.5). 세션이 멈춰 있는 동안 떠 있고, 고르면 바로 이어 난다
const levelup = new LevelUpSheet();
levelup.onPick = (kind) => { session.pick(kind); sfx.play('pick'); };
// 다시 뽑기 (§14.7): 레벨업마다 한 번, 보상형 광고. 새 셋은 시드로 정해진다
levelup.rerollMode = () => (session.rerolls > 0 ? null : rewardMode());
levelup.onReroll = async () => {
  const r = await reward('reroll');
  if (r !== 'ok') return r;
  session.reroll();
  levelup.show(session.offers(), session.perks, session.xpLevel);
  sfx.play('pick');
  return null;
};

function adState(): { clearsSinceInterstitial: number; runsSinceInterstitial: number;
  lastInterstitialAt: number | null; lastRewardedAt: number | null } {
  const a = save.data.ads;
  return {
    clearsSinceInterstitial: a.clears_since_interstitial,
    runsSinceInterstitial: a.runs_since_interstitial,
    lastInterstitialAt: a.last_interstitial_at,
    lastRewardedAt: a.last_rewarded_at,
  };
}
function saveAdState(next: AdState): void {
  save.data.ads.clears_since_interstitial = next.clearsSinceInterstitial;
  save.data.ads.runs_since_interstitial = next.runsSinceInterstitial ?? 0;
  save.data.ads.last_interstitial_at = next.lastInterstitialAt;
  save.data.ads.last_rewarded_at = next.lastRewardedAt;
  save.touch();
}

/** 보상을 광고 없이 주는가 / 광고로 주는가 / 지금은 못 주는가 — 버튼 문구와 표시를 정한다 (§14.7) */
function rewardMode(): 'free' | 'ad' | null {
  return ads.adFree ? 'free' : ads.isRewardedReady() ? 'ad' : null;
}
/**
 * 보상형 광고 한 번 (§14.7의 이어하기·다시 뽑기). 광고 없는 제공자(itch·광고 제거)는 바로 준다.
 * 'ok' 가 아니면 사용자에게 보일 안내 문구의 키 — 힌트 시트의 문구를 같이 쓴다
 */
async function reward(placement: RewardPlacement): Promise<'ok' | Key> {
  if (ads.adFree) return 'ok';
  if (!ads.isRewardedReady()) return 'hint.unavailable';
  const r = await ads.showRewarded(placement);
  if (r !== 'rewarded') return r === 'dismissed' ? 'hint.dismissed' : 'hint.unavailable';
  saveAdState(afterRewarded(adState(), nowSeconds()));
  return 'ok';
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
  if (session.level) resize();                                 // 화면 배율이 바뀌었을 수 있다
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
  // 화면 배율 (§11). 보스전 아레나는 400 폭에 맞춰 설계돼 있어 1 로
  const z = save.data.settings.zoom;
  cam.layout(cssW, cssH, top, bottom, session.boss ? 1 : z === 'x2' ? 2 : z === 'fit' ? 1 : 1.5);
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
  // 도감에 이미 있는 천체는 그리지 않는다 (§22.7)
  if (session.level.messier && String(session.level.messier.n) in save.data.messier) session.messierDone = true;
  basePreview = session.level.preview;
  field.rebuild(session.level);
  hud.hideResult();
  hints.close();
  levelup.close();
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
  session.bonusTurns = TEST_TURNS;
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

/**
 * 인피니티 한 판 (§22.3). 판 시드는 여기서 한 번만 고른다 — 판을 고르는 일이지
 * 시뮬레이션이 아니다. 그 뒤의 비행은 시드로 정해진 칸 위에서 결정론적이다.
 * 스테이지와 달리 힌트(applyHints)를 거치지 않는다: 그 함수는 session.level 을
 * 복사해 바꾸는데, 인피니티는 그 객체(창)를 계속 갈아 끼우므로 복사본은 멈춰 버린다.
 */
let infMode: InfinityMode = 'random';
/** 오늘의 우주 기록. 날짜가 바뀌었으면 비우고 오늘로 */
function dailyRecord(): { day: string; best: number; runs: number } {
  const d = save.data.infinity.daily;
  const today = dayKey(new Date());
  if (d.day !== today) { d.day = today; d.best = 0; d.runs = 0; }
  return d;
}
function startInfinity(mode: InfinityMode = 'random'): void {
  demo = false;
  infMode = mode;
  session.bonusTurns = TEST_TURNS;
  // 오늘의 우주는 날짜가 시드다 — 그날은 모두가 같은 우주 (§22.3). 무작위는 매번 새 판
  const seed = mode === 'daily' ? dailySeed(dailyRecord().day) : (Math.random() * 2 ** 31) | 0;
  session.setupInfinity(new InfinityWorld(seed));
  infCounted = false;
  field.rebuild(session.level);
  field.directionArc = null;
  hud.infDaily = mode === 'daily';
  hud.infBest = mode === 'daily' ? dailyRecord().best : save.data.infinity.best;
  hud.hideResult();
  hints.close();
  levelup.close();
  absorbs = 0;
  bossShots = 0; bossHits = 0; bossAlarm = -1;
  panning = false;
  resize();
  snapToStart();
  screens.hideSelect();
  screens.maybeShowIntro(session.level, save.data.seen_intros, (key) => {
    save.data.seen_intros.push(key);
    save.touch();
  });
}

// ── 입력 (§10) ──────────────────────────────────────────────────────────
/**
 * 분사 (§22.1). 비행 중 탭한 곳 쪽으로 꺾는다. 방향은 화면에 보이는 우주선에서
 * 탭한 지점으로 — 월드 좌표로 바꿔 잰다(배율이 소수여도 같은 방향).
 */
/** 스와이프 분사: 끈 방향(화면 벡터 = 월드 방향)으로. 꺾는 각 한계는 그대로 */
function swipeTurn(dx: number, dy: number): void {
  const dir = Math.atan2(dy, dx) * 180 / Math.PI;
  if (!session.turn(dir)) { dudFeedback(); return; }
  const [sx, sy] = session.shipPos();
  const len = Math.hypot(dx, dy) || 1;
  field.onTurn(sx + dx / len * 30, sy + dy / len * 30);
  sfx.play('boost');
  buzz(15);
}

/** 분사가 없을 때의 되먹임: 둔탁한 소리와 분사 판 흔들림 */
function dudFeedback(): void {
  if (session.state !== 'flying' || session.turnSlots <= 0 || session.turnsLeft > 0) return;
  sfx.play('dud'); buzz(30);
  hud.turns.classList.remove('shake'); void hud.turns.offsetWidth; hud.turns.classList.add('shake');
}

function tapTurn(x: number, y: number): void {
  const [sx, sy] = session.shipPos();
  const wx = cam.x + x / cam.scale, wy = cam.y + y / cam.scale;
  let dir = Math.atan2(wy - sy, wx - sx) * 180 / Math.PI;
  // 손가락이 로켓을 가리면 탭이 로켓 바로 옆·뒤에 떨어진다. 뒤쪽(차이 150° 이상)이거나 너무
  // 가까우면 각도의 부호가 작은 차이로 뒤집혀 반대로 꺾였다(폰 피드백) — 그때는 화면의
  // 좌우로 쪽을 정한다: 탭이 로켓보다 왼쪽이면 왼쪽으로 꺾이는 후보를 고른다
  const head = session.shipHeading() * 180 / Math.PI;
  let d = dir - head; d -= 360 * Math.round(d / 360);
  const vx = wx - sx, vy = wy - sy;
  const near = Math.hypot(vx, vy) < 14;
  if (near || Math.abs(d) > 90) {
    // 옆·뒤를 탭했다: ±turnMax 두 후보 중 탭 방향과 더 나란한 쪽. 너무 가까우면 화면 좌우만 본다
    const m = session.sim.mods.turnMax;
    const ux = near ? (Math.sign(vx) || 1) : vx, uy = near ? 0 : vy;
    const dot = (c: number): number => Math.cos(c * Math.PI / 180) * ux + Math.sin(c * Math.PI / 180) * uy;
    dir = [head - m, head + m].reduce((best, c) => (dot(c) > dot(best) ? c : best));
  }
  if (!session.turn(dir)) { dudFeedback(); return; }
  field.onTurn(wx, wy);
  sfx.play('boost');
  buzz(15);
}

/** 캔버스 좌표. 위치는 resize() 가 잡아 둔 값을 쓴다 — getBoundingClientRect 는
 *  레이아웃을 강제하므로 초당 수십 번 오는 pointermove 에서 부르지 않는다. */
function pos(e: PointerEvent): [number, number] {
  return [e.clientX - canvasLeft, e.clientY - canvasTop];
}

canvas.addEventListener('pointerdown', (e) => {
  // 두 번째 손가락이 조준을 처음부터 다시 시작하거나, 그 손가락을 떼는 순간
  // 발사되지 않게 한다. 조준은 한 손가락이다.
  if (!e.isPrimary || dragMode) return;
  if (demo || screens.overlayOpen || hints.open || levelup.open || !session.level) return;
  if (session.state === 'flying' && session.boss) {
    // 보스전 (§22.6): 드래그로 직접 이동. 누른 자리와 그때의 우주선 자리를 기억한다
    const [x, y] = pos(e);
    canvas.setPointerCapture(e.pointerId);
    dragPointer = e.pointerId;
    dragMode = 'boss';
    bossFrom = [x, y, session.boss.ship.x, session.boss.ship.y];
    return;
  }
  if (session.state === 'flying') {
    // 궤도 행성에서 도는 중이면 탭은 "나가기"다 (§22.4). 분사를 쓰지 않는다
    if (session.release()) { sfx.play('launch'); buzz(15); field.onRelease(); return; }
    // 분사: 끌면 스와이프 방향, 떼면 탭 방향 (§22.1, 폰 피드백)
    flickFrom = pos(e);
    canvas.setPointerCapture(e.pointerId);
    dragPointer = e.pointerId;
    dragMode = 'flick';
    return;
  }
  if (session.state === 'ending') {
    // 실패 연출 중에 탭하면 기다리지 않고 바로 다시 (§13.4 의 "아무 곳이나" 를 연출까지).
    // 부딪힌 직후 0.3초는 뺀다 — 늦게 떨어진 분사 탭이 재시도로 새지 않게
    if (!session.world && session.outcome !== 'win' && session.endProgress() * END_SECONDS >= 0.3) {
      hud.onRetry();
    }
    return;
  }
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
  else if (dragMode === 'flick') {
    const dx = x - flickFrom[0], dy = y - flickFrom[1];
    if (dx * dx + dy * dy >= FLICK_PX * FLICK_PX) {
      swipeTurn(dx, dy);
      dragMode = null; dragPointer = -1;
    }
  } else if (dragMode === 'boss') {
    session.bossAim(bossFrom[2] + (x - bossFrom[0]) / cam.scale * BOSS_DRAG_K,
      bossFrom[3] + (y - bossFrom[1]) / cam.scale * BOSS_DRAG_K);
  } else moveCamTo(x, y);
});

function endDrag(): void {
  if (dragMode === 'flick') tapTurn(...flickFrom);      // 끌지 않고 뗐다: 탭
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
  if (dragMode === 'aim') { session.cancelAim(); aim.finish(); }
  dragMode = null; dragPointer = -1;
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

// ── 키보드 (§10.6). 데스크톱(itch.io)용. 손가락 입력과 같은 상태 머신을 두드린다 ──
/** 진행 방향에서 ±delta° 로 분사 (§22.1). 연기는 그쪽 30 유닛 앞에 */
function keyTurn(delta: number): void {
  const a = session.shipHeading() * 180 / Math.PI + delta;
  if (!session.turn(a)) return;
  const [sx, sy] = session.shipPos();
  field.onTurn(sx + Math.cos(a * Math.PI / 180) * 30, sy + Math.sin(a * Math.PI / 180) * 30);
  sfx.play('boost');
}
addEventListener('keyup', (e) => { heldKeys.delete(e.key); });
addEventListener('blur', () => heldKeys.clear());
addEventListener('keydown', (e) => {
  if (e.key.startsWith('Arrow')) heldKeys.add(e.key);
  // 보스전 (§22.6): 방향키는 누르고 있는 동안 프레임마다 읽는다(아래 frame)
  if (session.boss && session.state === 'flying' && e.key.startsWith('Arrow')) { e.preventDefault(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const tag = (document.activeElement as HTMLElement | null)?.tagName;
  if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (demo || screens.overlayOpen || hints.open || !session.level) return;
  if (levelup.open) {
    // 레벨업 카드: 1·2·3 또는 Enter(첫 카드)
    if (e.key >= '1' && e.key <= '3') { levelup.choose(Number(e.key) - 1); e.preventDefault(); }
    else if (e.key === 'Enter') { levelup.choose(0); e.preventDefault(); }
    return;
  }
  const st = session.state;
  let used = true;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const sign = e.key === 'ArrowLeft' ? -1 : 1;
    if (st === 'ready' || st === 'aiming') {
      // 0.5° 씩(Shift 5°). 화살표를 누르면 조준 중으로 쳐서 예측선과 각도가 보인다
      if (glide) snapToStart();
      session.beginAim();
      session.aimFar = true;
      session.setAngle(clampArc(session.level, quantize(session.angle + sign * (e.shiftKey ? 5 : 0.5))));
    } else if (st === 'flying' && !session.docked) keyTurn(sign * TURN_MAX);
    else used = false;
  } else if (e.key === ' ' || e.key === 'Enter') {
    if (st === 'ready' || st === 'aiming') {
      if (glide) snapToStart();
      session.launch(); panning = false; sfx.play('launch');
    } else if (st === 'flying') {
      if (session.release()) { sfx.play('launch'); field.onRelease(); } else used = false;
    } else if (st === 'ending' && !hud.result.hidden) {
      // 시트가 떠 있으면 Enter 는 주 버튼(다음 단계 / 다시 시도)
      (hud.result.querySelector<HTMLButtonElement>('[data-a=next]')
        ?? hud.result.querySelector<HTMLButtonElement>('[data-a=retry]'))?.click();
    } else if (st === 'ending' && !session.world && session.outcome !== 'win'
      && session.endProgress() * END_SECONDS >= 0.3) {
      hud.onRetry();                           // 실패 연출 중 — 탭과 같다
    } else used = false;
  } else if (e.key === 'Escape') {
    if (st === 'aiming') { session.cancelAim(); aim.finish(); dragMode = null; dragPointer = -1; }
    else used = false;
  } else if (e.key === 'r' || e.key === 'R') {
    hud.onRetry();
  } else used = false;
  if (used) e.preventDefault();
});

// 브라우저 뒤로 가기 → 화면 한 단계 뒤로 (§15.2 의 흐름을 웹으로)
history.replaceState({ depth: 0 }, '');
addEventListener('popstate', () => {
  // 힌트 시트가 열려 있으면 그것만 닫는다 — 전에는 시트와 멈춘 시계를 남긴 채 단계 선택이 떴다
  if (hints.open) hints.close();
  else if (!screens.goBack() && !demo) {
    if (session.world) startDemo(); else screens.showSelect();
  }
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
  aim.finish();
  if (session.world) { void nextInfinityRun(); return; }   // 인피니티는 언제나 새 판(같은 모드)
  session.reset(); hud.hideResult(); panning = false; snapToStart();
};
/** 인피니티 [다시]. **전면 광고는 여기서만 검토한다** (§14.7) — 타이틀로 나갈 때는 아니다 */
async function nextInfinityRun(): Promise<void> {
  const d = shouldShowInfinityInterstitial({ now: nowSeconds(), ads: adState(), revived: session.revived });
  if (d.show && ads.isInterstitialReady()) {
    const r = await ads.showInterstitial();
    if (r === 'shown') saveAdState(afterInterstitial(adState(), nowSeconds()));
  }
  startInfinity(infMode);
}
/** 이어하기 (§14.7): 보상형 광고 뒤 끝난 자리에서 다시 난다. 안내 문구 키를 돌려주면 시트가 보인다 */
hud.onRevive = async () => {
  const r = await reward('revive');
  if (r !== 'ok') return r;
  if (!session.revive()) return 'hint.unavailable';
  hud.hideResult();
  sfx.play('shield'); buzz(40); field.onAbsorb();
  return null;
};
// 인피니티에서 "뒤로"·단계 이름·결과의 두 번째 버튼은 타이틀로
hud.onOpenPicker = () => {
  hud.hideResult();
  if (session.world) startDemo(); else screens.showSelect();
};
hud.onNext = () => { void goNext(); };
hud.onHints = () => hints.show();
/**
 * 인피니티 결과 공유 (§22.3). 폰은 공유 시트(navigator.share), 없으면 클립보드.
 * 둘 다 안 되면 안내만. 문구는 사전에서, 주소는 shareUrl() — itch 에서는 붙이지 않는다.
 */
hud.onShare = async () => {
  if (!infResult) return null;
  const sec = infResult.sec.toFixed(1);
  let text = infMode === 'daily'
    ? t('inf.shareText', { date: shortDate(dailyRecord().day), sec })
    : t('inf.shareTextRandom', { sec });
  if (session.revived) text += ` · ${t('inf.revived')}`;   // 이어하기를 쓴 기록임을 밝힌다 (§14.7)
  const url = shareUrl();
  const nav = navigator as Navigator & { share?: (d: { text: string; url?: string }) => Promise<void> };
  if (typeof nav.share === 'function') {
    try { await nav.share(url ? { text, url } : { text }); return null; }
    catch (e) { if ((e as { name?: string }).name === 'AbortError') return null; }
  }
  try {
    await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
    return 'inf.copied';
  } catch { return 'inf.shareFailed'; }
};
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

/**
 * 결과는 비행이 끝난 **순간** 기록한다. 전에는 0.8초 연출이 끝나고 시트를 띄울 때
 * 기록했는데, 그 사이에 "다시"·"단계"·뒤로 가기를 누르면 기록이 사라졌다 —
 * 깬 단계가 클리어로 남지 않고, 실패 횟수가 안 올라 힌트(§14.3)가 열리지 않았다.
 */
let infResult: { sec: number; best: number; isBest: boolean } | null = null;
/** 이번 인피니티 판을 판 수에 넣었는가. 이어하기(§14.7)로 두 번 끝나도 한 판이다 */
let infCounted = false;
function recordOutcome(): void {
  if (session.world) {
    // 인피니티의 끝: 기록만 남긴다. 단계 기록에는 넣지 않는다. 판 수는 전면 광고 간격(§14.7)
    const sec = session.freeSeconds();          // 링에서 쉰 시간은 빼고 (§22.3)
    const inf = save.data.infinity;
    const rec = infMode === 'daily' ? dailyRecord() : inf;
    if (!infCounted) {
      infCounted = true;
      inf.runs++;
      if (infMode === 'daily') rec.runs++;
      saveAdState(afterInfinityRun(adState()));
    }
    if (sec > inf.best) inf.best = sec;         // 전체 최고는 어느 우주든 센다
    // 오늘의 우주는 오늘 기록으로 보여 준다 — "오늘 최고" 가 공유의 단위다
    const isBest = sec > rec.best || (infMode === 'daily' && rec.best === 0 && sec > 0 && rec.runs === 1);
    if (sec > rec.best) rec.best = sec;
    save.touch();
    infResult = { sec, best: rec.best, isBest };
    return;
  }
  const l = save.level(session.level.id);
  const win = session.outcome === 'win';
  // 별 (§13.4): 이번 방문의 발사 횟수와 이 단계에 받은 힌트로
  const flags = starFlags({ attempts: session.attempts, usedHint: l.hints.preview || l.hints.direction });
  const { newBest } = save.record(session.level.id, session.outcome, session.flightSeconds(),
    win ? flags.filter(Boolean).length : 0);
  lastClear = win ? { stars: flags, newBest } : null;
  if (win) saveAdState(afterClear(adState()));
}
let lastClear: { stars: [boolean, boolean, boolean]; newBest: boolean } | null = null;

// ── 루프 ────────────────────────────────────────────────────────────────
let frameOdd = false;
let wasBoss = false;
function frame(now: number): void {
  requestAnimationFrame(frame);
  // 30fps 설정: 두 프레임에 한 번만 돈다. 물리는 누산기가 그만큼 몰아서 밟으므로 결과가 같다 (§5.8)
  frameOdd = !frameOdd;
  if (save.data.settings.fps === 30 && frameOdd) return;
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  // 보스전에 들어가고 나올 때 배율을 다시 잡는다 (아레나는 배율 1)
  const inBoss = !!session.boss;
  if (inBoss !== wasBoss) { wasBoss = inBoss; resize(); }
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

  if (levelup.open) { draw(null); return; }
  session.advance(dt);
  if (session.levelUpPending && !levelup.open) {
    // 문턱을 넘은 프레임: 판이 멈춘 채 카드를 띄운다 (§22.5)
    levelup.show(session.offers(), session.perks, session.xpLevel);
    sfx.play('levelup'); buzz([20, 40, 20]);
  }
  if (session.boss) {
    // 보스전 (§22.6): 카메라는 아레나 가운데에 고정. 방향키는 매 프레임
    const [ox, oy] = session.bossOrigin;
    cam.centerOn(session.level, ox + ARENA_W / 2, oy + ARENA_H / 2);
    let kx = 0, ky = 0;
    if (heldKeys.has('ArrowLeft')) kx -= 1; if (heldKeys.has('ArrowRight')) kx += 1;
    if (heldKeys.has('ArrowUp')) ky -= 1; if (heldKeys.has('ArrowDown')) ky += 1;
    if (kx || ky) session.bossNudge(kx * 60, ky * 60);
    const b = session.boss;
    if (b.fired !== bossShots) { if (b.fired % 3 === 0) sfx.play('shoot'); bossShots = b.fired; }
    if (b.hitsTaken !== bossHits) { bossHits = b.hitsTaken; sfx.play('hurt'); buzz(50); field.onAbsorb(); }
    if (b.phase === 'dying' && bossAlarm !== -2) { bossAlarm = -2; sfx.play('bossdown'); buzz([30, 40, 30, 40, 60]); }
  } else if (session.state === 'flying') {
    const { x, y, vx, vy } = session.sim.ship;
    cam.follow(session.level, x, y, vx, vy, dt);
    // 보스 경보: 60초와 10초 전에 사이렌 (§22.6)
    const cd = session.bossCountdown;
    if (cd !== null) {
      const mark = cd <= 10 ? 10 : 60;
      if (bossAlarm !== mark) { bossAlarm = mark; sfx.play('alarm'); buzz([40, 60, 40]); }
    } else bossAlarm = -1;
  }
  // 메시에 천체를 스친 순간 (§22.7): 저장·토스트·소리
  if (session.found.length) {
    const [sx, sy] = session.shipPos();
    for (const n of session.found.splice(0)) {
      const isNew = !(String(n) in save.data.messier);
      if (isNew) { save.data.messier[String(n)] = session.world ? 'infinity' : session.level.id; save.touch(); }
      hud.toast(t(isNew ? 'cat.found' : 'cat.again', { name: messierLabel(n) }));
      field.onFound(sx, sy);
    }
    sfx.play('found'); buzz([15, 30, 15]);
  }
  // 방패로 튕긴 순간 (§22.5)
  if (session.sim.absorbs !== absorbs) {
    absorbs = session.sim.absorbs;
    if (absorbs > 0) { sfx.play('shield'); buzz(40); field.onAbsorb(); }
  }
  stepGlide(dt);
  // 비행이 끝난 순간 한 번만: 소리·진동, 그리고 **기록**
  if (session.state === 'ending' && !ended) {
    ended = true;
    if (session.outcome === 'win') { sfx.play('arrive'); buzz([25, 60, 25]); }
    else { sfx.play('explode'); buzz(60); }
    recordOutcome();
  }
  if (session.state !== 'ending') ended = false;
  // 궤도 행성에 붙잡힌 순간 한 번 (§22.4)
  if (session.docked && !wasDocked) { sfx.play('dock'); buzz(20); }
  wasDocked = session.docked;

  // 연출이 끝나면 결과 시트. 기록은 위에서 이미 했다
  if (session.state === 'ending' && session.endProgress() >= 1 && hud.result.hidden) {
    if (session.world) {
      if (infResult) {
        hud.showInfinityResult(infResult.sec, infResult.best, infResult.isBest, infMode === 'daily',
          session.canRevive ? rewardMode() : null);
      }
    } else {
      const p = {
        cleared: (id: string) => save.cleared(id),
        skipped: (id: string) => save.level(id).skipped,
      };
      hud.showResult(session, {
        chapterLast: isChapterLast(session.level.id),
        last: nextLevel(session.level.id, p) === null,
        canHint: save.level(session.level.id).fails >= 2,
        stars: lastClear?.stars,
        newBest: lastClear?.newBest ?? false,
      });
    }
  }

  hud.refresh(session);
  // 인피니티는 맵이 끝없으니 미니맵이 없다 (§22.3)
  mini = session.world ? null : miniRect(session.level, cam, cssW);
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

/**
 * 충돌 흔들림 (§12.7). 부딪힌 직후 0.2초, 화면이 2~3 유닛 떨린다. 카메라 값은 건드리지
 * 않고 찍을 때만 밀어서 물리·입력 좌표는 그대로다. 모션 줄이기면 끈다.
 */
const SHAKE_X = [3, -3, 2, -2, 1, -1, 0], SHAKE_Y = [-2, 2, -2, 1, -1, 0, 0];
function crashShake(): [number, number] {
  if (field.reduceMotion || session.state !== 'ending' || session.outcome === 'win' || session.outcome === 'drift') return [0, 0];
  const i = Math.floor(session.endProgress() * END_SECONDS / 0.03);
  return i < SHAKE_X.length ? [SHAKE_X[i]!, SHAKE_Y[i]!] : [0, 0];
}

function draw(preview: { points: number[]; outcome: string } | null): void {
  const [kx, ky] = crashShake();
  const ox = Math.floor(cam.x) + kx, oy = Math.floor(cam.y) + ky;
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
const hudEls = [document.querySelector('.hud.top'), hud.hint, hud.angle, hud.turns, hud.xp, hud.perks, hud.boss, hud.toastEl] as HTMLElement[];
let hudShown: boolean | null = null;
function syncHudVisibility(): void {
  const show = !demo && !screens.overlayOpen && !hints.open && !levelup.open;
  if (show === hudShown) return;
  hudShown = show;
  for (const el of hudEls) if (el) el.style.visibility = show ? '' : 'hidden';
}

void pickAdProvider(cap, {
  pause: () => { paused = true; session.pauseReset(); },
  resume: () => { paused = false; },
}).then((p) => { ads = save.data.ads.removed ? new FreeHintProvider() : p; });   // 광고 제거 (§14.7)

// OS 가 모션 줄이기를 켰으면 기본값으로 따른다 (§12.4).
// 사용자가 설정에서 직접 바꾼 적이 있으면 그 값이 이긴다.
if (cap.prefersReducedMotion && !save.data.settings.reduce_motion_set) {
  save.data.settings.reduce_motion = true;
  applySettings();
}

// 서비스 워커 — 재방문 시 오프라인 동작 (§15.1). 개발 서버에서는 걸지 않는다.
// itch.io 빌드는 서비스 워커를 쓰지 않는다 — itch 가 iframe 안에서 돌리고 캐시도 itch 가 맡는다 (§15.6)
if (!import.meta.env.DEV && buildTarget() !== 'itch' && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register(
      new URL('sw.js', location.href).pathname,
    ).catch(() => { /* 실패해도 게임은 그대로 돈다 */ });
  });
}

// 개발 서버에서만: 브라우저 확인 스크립트가 정확한 각도로 쏘려고 쓴다 (§16.6). 배포 번들에는 없다
if (import.meta.env.DEV) {
  (window as unknown as { __swingby: unknown }).__swingby = {
    session, cam, field, save, hud, startPlay, tapTurn, startInfinity, levelup, ads: () => ads,
    // 광고 시간 조건(§14.4·§14.7)을 시험하려고 앱 시작 시각을 과거로 당긴다
    backdate: (sec: number) => { started -= sec * 1000; },
    fire: (deg: number) => { session.setAngle(deg); session.launch(); },
  };
}

// DOM 화면 뒤 밤하늘 (§12.5): 필드와 같은 별 타일을 구워 CSS 변수로 넘긴다
document.documentElement.style.setProperty('--stars', `url(${toDataUrl(starTile(3, 192, 192))})`);

resize();
startDemo();
requestAnimationFrame(frame);
