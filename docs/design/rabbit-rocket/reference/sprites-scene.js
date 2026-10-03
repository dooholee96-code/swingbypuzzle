// 필드 장면 + <pixel-sprite> / <pixel-field> 웹 컴포넌트. sprites.js, sprites-world.js 다음.
(function (root) {
  const S = root.SB, C = S.COL;
  const SKY = C.U;                       // $22 파스텔 밤하늘
  const cache = new Map();
  const memo = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };
  const put = (ctx, g, x, y) => S.paint(ctx, g, Math.round(x - g.ax), Math.round(y - g.ay), 1);

  const L14 = { w: 400, h: 740, start: { x: 340, y: 690 }, goal: { x: 325, y: 115, r: 24 },
    planets: [{ x: 280, y: 540, r: 22, R: 150, sides: 9 }, { x: 280, y: 160, r: 26, R: 160, sides: 12, ring: true }],
    rocks: [{ x: 372, y: 390, r: 18, seed: 6 }, { x: 130, y: 300, r: 22, seed: 7 }, { x: 90, y: 350, r: 16, seed: 8 }, { x: 170, y: 250, r: 14, seed: 9 }],
    path: [[322, 668], [205, 520], [222, 300], [318, 128]] };
  const L32 = { w: 400, h: 760, start: { x: 230, y: 665 }, goal: { x: 335, y: 125, r: 24 },
    planets: [{ x: 270, y: 185, r: 22, R: 140, sides: 12 }, { x: 220, y: 435, r: 21, R: 160, sides: 9 }],
    ufos: [{ x: 335, y: 320, range: 140 }],
    rocks: [{ x: 215, y: 180, r: 19, seed: 1 }, { x: 125, y: 560, r: 15, seed: 2 }, { x: 325, y: 565, r: 22, seed: 3 }, { x: 90, y: 675, r: 17, seed: 4 }, { x: 35, y: 635, r: 17, seed: 5 }],
    path: [[226, 642], [150, 470], [205, 255], [330, 136]] };
  const LH = { w: 400, h: 740, start: { x: 90, y: 660 }, goal: { x: 300, y: 130, r: 24 },
    holes: [{ x: 210, y: 380, rH: 12, R: 130 }], planets: [{ x: 90, y: 230, r: 20, R: 120, sides: 10 }],
    rocks: [{ x: 330, y: 560, r: 16, seed: 3 }], path: [[100, 640], [150, 470], [300, 400], [300, 150]] };

  const bez = (P, t) => { const u = 1 - t;
    return [0, 1].map((i) => u*u*u*P[0][i] + 3*u*u*t*P[1][i] + 3*u*t*t*P[2][i] + t*t*t*P[3][i]); };
  const tangent = (P, t) => { const a = bez(P, Math.max(0, t - .01)), b = bez(P, Math.min(1, t + .01)); return Math.atan2(b[1] - a[1], b[0] - a[0]); };

  function dashed(ctx, x, y, r, col, on = 4, off = 6) {
    ctx.fillStyle = col; const n = Math.floor(2 * Math.PI * r);
    for (let i = 0; i < n; i++) if (i % (on + off) < on) {
      const a = i / r; ctx.fillRect(Math.floor(x + Math.cos(a) * r), Math.floor(y + Math.sin(a) * r), 1, 1); }
  }
  function stars(ctx, w, h, seed, f) {
    const r = S.rng(seed);
    for (let i = 0; i < w * h * .0011; i++) {
      const x = Math.floor(r() * w), y = Math.floor(r() * h), k = r();
      if (k < .1) { if ((f + i) % 6) put(ctx, Object.assign(S.small('star2'), { ax: 1, ay: 1 }), x, y); }
      else { ctx.fillStyle = k < .25 ? C.Y : k < .4 ? C.S : C.W; ctx.fillRect(x, y, 1, 1); }
    }
  }
  function bounds(ctx, w, h) {
    ctx.fillStyle = C.S;
    for (const [x, y, sx, sy] of [[0, 0, 1, 1], [w - 1, 0, -1, 1], [w - 1, h - 1, -1, -1], [0, h - 1, 1, -1]])
      for (let i = 0; i < 24; i++) { if (i % 2) continue; ctx.fillRect(x + i * sx, y, 1, 1); ctx.fillRect(x, y + i * sy, 1, 1); }
  }

  // state: aim | fly | bump | win | title
  function drawField(ctx, st, f) {
    const L = st === 'fly' ? L32 : st === 'hole' ? LH : L14, t = f / 60;
    ctx.fillStyle = SKY; ctx.fillRect(0, 0, L.w, L.h);
    stars(ctx, L.w, L.h, 11, Math.floor(t * 4));
    bounds(ctx, L.w, L.h);
    for (const p of L.planets || []) dashed(ctx, p.x, p.y, p.R, C.B);
    for (const h of L.holes || []) dashed(ctx, h.x, h.y, h.R, C.V);
    for (const u of L.ufos || []) dashed(ctx, u.x, u.y, u.range, st === 'fly' && (f >> 3) % 2 ? C.r : C.R);
    const tShip = st === 'fly' ? .55 : st === 'bump' ? .5 : st === 'win' ? 1 : st === 'hole' ? .62 : 0;
    if (tShip > 0) { ctx.fillStyle = C.W;
      for (let i = 0; i < tShip * 90; i++) if (i % 2 === 0) { const [x, y] = bez(L.path, i / 90); ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1); } }
    (L.rocks || []).forEach((r, i) => put(ctx, memo(`r${r.seed}${r.r}${(Math.floor(t * .5) + i) % 16}`, () => S.rock(r.r, r.seed, (Math.floor(t * .5) + i) % 16)), r.x, r.y));
    for (const p of L.planets || []) put(ctx, memo(`p${p.r}${p.sides}${p.ring}`, () => S.planet(p.r, p.sides, p.ring, p.sides)), p.x, p.y);
    for (const h of L.holes || []) put(ctx, memo(`h${h.rH}${(f >> 3) % 8}`, () => S.hole(h.rH, (f >> 3) % 8)), h.x, h.y);
    for (const u of L.ufos || []) put(ctx, memo(`u${(f >> 4) % 2}`, () => S.ufo((f >> 4) % 2)), u.x, u.y);
    put(ctx, memo(`g${(f >> 3) % 8}`, () => S.portal(L.goal.r, (f >> 3) % 8)), L.goal.x, L.goal.y);
    // 달 발사대
    const pa = Math.atan2(L.goal.y - L.start.y, L.goal.x - L.start.x);
    put(ctx, memo('moon', () => S.moon(18)), L.start.x, L.start.y);
    const aim = -134 * Math.PI / 180;
    if (st === 'aim') { ctx.fillStyle = C.W;
      for (let d = -90; d <= 90; d += 15) { const a = pa + d * Math.PI / 180;
        for (let k = 0; k < (d % 45 ? 2 : 4); k++) ctx.fillRect(Math.floor(L.start.x + Math.cos(a) * (21 + k)), Math.floor(L.start.y + Math.sin(a) * (21 + k)), 1, 1); }
      ctx.fillStyle = C.Y;
      for (let i = 0; i < 46; i++) if ((i + Math.floor(t * 12)) % 4 === 0) { const [x, y] = bez(L.path, i / 90); ctx.fillRect(Math.floor(x), Math.floor(y), 2, 2); }
    }
    if (st === 'fly') { const [sx, sy] = bez(L.path, tShip);
      for (let k = 0; k < 2; k++) { const q = ((t * .9 + k * .5) % 1);
        put(ctx, Object.assign(S.small('bullet'), { ax: 2, ay: 2 }), L.ufos[0].x + (sx - L.ufos[0].x) * q, L.ufos[0].y + (sy - L.ufos[0].y) * q - 18 * q); } }
    // 우주선
    let x, y, a, face, opt = {};
    if (st === 'aim') { a = aim; x = L.start.x + Math.cos(a) * 26; y = L.start.y + Math.sin(a) * 26; face = 'aim'; }
    else if (st === 'title') { a = -Math.PI / 2; x = L.start.x; y = L.start.y - 30; face = 'idle'; }
    else { [x, y] = bez(L.path, tShip); a = tangent(L.path, tShip); face = st === 'win' ? 'win' : st === 'fly' ? 'fly' : st === 'hole' ? 'bump' : 'bump';
      if (st === 'fly') opt = { flame: (f >> 2) % 2, ears: 'back' }; }
    if (st === 'bump') {
      x = 345; y = 392; a = 0;
      const ph = (f % 120) / 60, shake = ph < .6 ? ((f >> 1) % 2 ? 1 : -1) * Math.round(2 * (1 - ph / .6)) : 0;
      x += shake; if (ph >= .9) face = 'sad';
      put(ctx, memo(`d${Math.min(1, Math.floor(ph * 4))}`, () => Object.assign(S.small(ph < .25 ? 'dust0' : 'dust1'), { ax: 3, ay: 3 })), x + Math.cos(a) * 12, y + Math.sin(a) * 12);
      for (let i = 0; i < 3; i++) { const q = t * 4 + i * 2.09;
        put(ctx, Object.assign(S.small('dizzy'), { ax: 2, ay: 2 }), x + Math.cos(q) * 13, y - 16 + Math.sin(q) * 4); }
    }
    if (st === 'win') { const sp = S.small((f >> 3) % 2 ? 'sparkle0' : 'sparkle1'); sp.ax = 2; sp.ay = 2;
      for (let i = 0; i < 6; i++) { const q = i * 1.047 + t; put(ctx, sp, x + Math.cos(q) * 34, y + Math.sin(q) * 34); } }
    if (st === 'hole') { a += t * 3; }
    const dirA = Math.round(a / (Math.PI / 8)) * (Math.PI / 8);
    put(ctx, memo(`s${face}${dirA.toFixed(3)}${JSON.stringify(opt)}`, () => S.rocketDir(face, dirA, opt)), x, y);
    return L;
  }

  function drawTitle(ctx, w, h, f) {
    ctx.fillStyle = SKY; ctx.fillRect(0, 0, w, h);
    stars(ctx, w, h, 5, f >> 4);
    put(ctx, memo('tm', () => S.moon(110)), w / 2, h + 64);
    put(ctx, memo('tp', () => S.planet(22, 4, true, 2)), w - 46, 70);
    put(ctx, memo('tp2', () => S.planet(9, 1, false, 5)), 34, 120);
    put(ctx, memo(`tg${(f >> 3) % 8}`, () => S.portal(14, (f >> 3) % 8)), 52, 228);
    const bob = Math.round(Math.sin(f / 20) * 1.5);
    put(ctx, memo('tr', () => S.rocketDir('idle', -Math.PI / 2, {})), w / 2, h - 60 + bob);
  }

  // ── 웹 컴포넌트 ──
  const sharp = 'image-rendering:pixelated;image-rendering:crisp-edges;display:block;';
  class PixelSprite extends HTMLElement {
    static get observedAttributes() { return ['kind', 'face', 'dir', 'scale', 'r', 'variant', 'ring', 'seed', 'name', 'flame', 'ears', 'frame', 'anim']; }
    connectedCallback() { if (!this._root) { this._root = this.attachShadow({ mode: 'open' }); this._root.innerHTML = '<style>:host{display:inline-block;line-height:0}</style>'; } this.render(); cancelAnimationFrame(this._raf); this.loop(); }
    disconnectedCallback() { cancelAnimationFrame(this._raf); }
    attributeChangedCallback() { if (this.isConnected) this.render(); }
    loop() { if (!this.hasAttribute('anim')) return; let f = 0;
      const tick = () => { f++; if (f % 8 === 0) { this._f = f / 8; this.render(); } this._raf = requestAnimationFrame(tick); };
      this._raf = requestAnimationFrame(tick); }
    build() {
      const A = (k, d) => { const v = this.getAttribute(k); return v == null || v.includes('{{') ? d : v; }, n = (k, d) => { const v = Number(A(k, d)); return Number.isFinite(v) ? v : d; };
      const fr = (this._f || 0) + n('frame', 0);
      switch (A('kind', 'rocket')) {
        case 'rocket': { const fl = A('flame', null); const opt = { flame: fl === null ? -1 : (this.hasAttribute('anim') ? fr % 2 : +fl), ears: A('ears', 'up') };
          const d = n('dir', 0) * Math.PI / 180; return d ? S.rocketDir(A('face', 'idle'), d, opt) : S.rocket(A('face', 'idle'), opt); }
        case 'ufo': return S.ufo(fr % 2);
        case 'planet': return S.planet(n('r', 22), n('variant', 0), this.hasAttribute('ring'), n('seed', 1));
        case 'moon': return S.moon(n('r', 18));
        case 'hole': return S.hole(n('r', 12), fr % 8);
        case 'rock': return S.rock(n('r', 18), n('seed', 1), fr % 16);
        case 'portal': return S.portal(n('r', 24), fr % 8);
        default: return S.small(S.SMALL[A('name', 'bullet')] ? A('name', 'bullet') : 'bullet');
      }
    }
    render() {
      let g; try { const key = 'el' + [...this.attributes].map((a) => a.name + a.value).join() + (this._f || 0); g = memo(key, () => this.build()); } catch (e) { console.warn('pixel-sprite', e); return; }
      if (!g) return;
      const s = Number(this.getAttribute('scale') || 4);
      if (!this._root) return; let cv = this._root.querySelector('canvas'); if (!cv) { cv = document.createElement('canvas'); this._root.appendChild(cv); }
      cv.width = g.w; cv.height = g.h; cv.style.cssText = sharp + `width:${g.w * s}px;height:${g.h * s}px`;
      const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, g.w, g.h); S.paint(ctx, g, 0, 0, 1);
    }
  }
  class PixelField extends HTMLElement {
    connectedCallback() {
      if (!this.shadowRoot) {
        const sr = this.attachShadow({ mode: 'open' });
        sr.innerHTML = '<style>:host{display:block;position:absolute;inset:0;overflow:hidden}</style>';
        this._cv = document.createElement('canvas'); sr.appendChild(this._cv);
      }
      const cv = this._cv, st = this.getAttribute('state') || 'aim', ctx = cv.getContext('2d');
      const title = st === 'title', W = title ? 200 : 400, H = title ? 380 : st === 'fly' ? 760 : 740;
      cv.width = W; cv.height = H; cv.style.cssText = sharp + 'width:100%;height:100%;object-fit:cover;object-position:50% 100%';
      let f = this._f0 || 0; const still = this.hasAttribute('still');
      cancelAnimationFrame(this._raf);
      const tick = () => { if (title) drawTitle(ctx, W, H, f); else drawField(ctx, st, f); f++; if (!still) this._raf = requestAnimationFrame(tick); };
      tick();
    }
    disconnectedCallback() { cancelAnimationFrame(this._raf); }
  }
  if (root.customElements && !customElements.get('pixel-sprite')) {
    customElements.define('pixel-sprite', PixelSprite); customElements.define('pixel-field', PixelField); }
  Object.assign(S, { drawField, drawTitle, SKY });
})(typeof window !== 'undefined' ? window : globalThis);
